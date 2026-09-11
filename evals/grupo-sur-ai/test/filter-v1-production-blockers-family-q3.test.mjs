import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-normalizer.mjs";
import { sanitizeSemanticEvidence } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-evidence-sanitizer.mjs";
import { applyNegationScopeFirewall } from "../../../supabase/functions/_shared/ai-v2-shadow/safety-firewall.mjs";
import { semanticExtractionToEngine } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-engine-adapter.mjs";
import { emptySemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-contract.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";

// Family Q3 (real Production incidents, post-v34 observation, 2026-09-10/11):
//
// Blocker 1: normalizeContextualSemantics() in semantic-extraction-normalizer.mjs treated
// ANY short (<=8 word) customer answer following a question whose evidence matched
// usado/entregar/parte-de-pago as a trade-in answer, defaulting trade_in_intent to "yes"
// unless the answer happened to match a narrow "no" pattern. Real customers answering a
// *different* alternative offered by the SAME multi-choice question ("Financiarlo",
// "Efectivo", "Financiamiento con anticipo", "Retirar con 5 millones") were misread as
// affirming trade-in, then the engine asked trade_in_brand for a vehicle that was never
// offered. Root cause reproduced directly against normalizeSemanticExtraction() below.
//
// Blocker 2: nothing downstream of the raw provider output validated
// trade_in_vehicle.mileage_km against its own evidence. A customer declaring a trade-in's
// asking price ("valor 13.000.000") had that number materialize as mileage_km=13000000,
// because mileage_km is the only numeric field in trade_in_vehicle and the provider
// sometimes routes a monetary figure there. Root cause reproduced directly against
// sanitizeSemanticEvidence() below.

const catalog = { brands: [{ id: "b-peugeot", name: "Peugeot" }], models: [{ id: "m-408", name: "408", brand_id: "b-peugeot" }, { id: "m-partner", name: "Partner", brand_id: "b-peugeot" }, { id: "m-307", name: "307", brand_id: "b-peugeot" }], model_versions: [] };
const prov = { source: "test_fixture", evidence: null };

function assistantQuestion(text) {
  return { id: "m-prev", role: "assistant", text };
}
function customerTurn(text) {
  return { id: "m-current", text };
}

function normalize(rawTradeInIntent, currentText, previousText) {
  const candidate = { ...emptySemanticExtraction(), trade_in_intent: rawTradeInIntent };
  const input = { current_message: customerTurn(currentText), recent_conversation: [assistantQuestion(previousText)] };
  return normalizeSemanticExtraction(candidate, input);
}

const MULTI_ALT_QUESTION = "¿Tenés pensado financiar, hacer un pago al contado o entregar un usado como parte de pago?";
const EXCLUSIVE_TRADE_QUESTION = "¿Tenés un usado para entregar?";

test("Family Q3 - 1 (exact incident): 'Financiarlo' to a financiar/contado/usado question must not become trade_in_intent=yes", () => {
  const { extraction } = normalize("not_present", "Financiarlo", MULTI_ALT_QUESTION);
  assert.equal(extraction.trade_in_intent, "not_present");
});

test("Family Q3 - 2: 'Efectivo' to the same multi-alternative question must not become trade_in_intent=yes", () => {
  const { extraction } = normalize("not_present", "Efectivo", MULTI_ALT_QUESTION);
  assert.equal(extraction.trade_in_intent, "not_present");
});

test("Family Q3 - 3 (positive control, unaffected): an explicit trade-in mention to the same question still resolves yes", () => {
  const { extraction } = normalize("yes", "Tengo un Corolla 2022 para entregar", MULTI_ALT_QUESTION);
  assert.equal(extraction.trade_in_intent, "yes");
});

test("Family Q3 - 4 (positive control, exclusive question): a bare 'Sí' to a trade-in-only question still resolves yes", () => {
  const { extraction } = normalize("not_present", "Sí", EXCLUSIVE_TRADE_QUESTION);
  assert.equal(extraction.trade_in_intent, "yes");
});

test("Family Q3 - 5 (negative control, unrelated multi-alternative question): 'Sí' to a versions-or-financing question must not invent trade-in", () => {
  const { extraction } = normalize("not_present", "Sí", "¿Querés versiones o financiación?");
  assert.equal(extraction.trade_in_intent, "not_present");
});

test("Family Q3 - 6: 'Retirar con 5 millones' to an anticipo-or-usado question must not become trade_in_intent=yes", () => {
  const { extraction } = normalize("not_present", "Retirar con 5 millones", "¿Con anticipo o entregando un usado?");
  assert.equal(extraction.trade_in_intent, "not_present");
});

test("Family Q3 - 6b (additional productive phrasing): 'Opciones de financion' must not become trade_in_intent=yes", () => {
  const { extraction } = normalize("not_present", "Opciones de financion", MULTI_ALT_QUESTION);
  assert.equal(extraction.trade_in_intent, "not_present");
});

test("Family Q3 - 6c (additional productive phrasing): 'Buenas noches si quisiera financiación' must not become trade_in_intent=yes", () => {
  const { extraction } = normalize("not_present", "Buenas noches si quisiera financiación", MULTI_ALT_QUESTION);
  assert.equal(extraction.trade_in_intent, "not_present");
});

test("Family Q3 - 6d (additional productive phrasing): 'Financiamiento con anticipo' must not become trade_in_intent=yes", () => {
  const { extraction } = normalize("not_present", "Financiamiento con anticipo", MULTI_ALT_QUESTION);
  assert.equal(extraction.trade_in_intent, "not_present");
});

// --- Blocker 2: monetary value vs. mileage_km ---

function sanitizeMileage(currentText, mileageEvidenceLiteral, extra = {}) {
  const candidate = {
    ...emptySemanticExtraction(),
    trade_in_vehicle: {
      brand: { value: "Peugeot", status: "known", evidence: [{ source_message_id: "m-current", literal: currentText }] },
      model: { value: "408", status: "known", evidence: [{ source_message_id: "m-current", literal: currentText }] },
      version: { value: null, status: "missing", evidence: [] },
      year: { value: "2013", status: "known", evidence: [{ source_message_id: "m-current", literal: currentText }] },
      mileage_km: { value: null, status: "missing", evidence: [] },
      ...extra,
    },
  };
  if (mileageEvidenceLiteral !== null) {
    candidate.trade_in_vehicle.mileage_km = { value: extra.mileageValue ?? 13000000, status: "known", evidence: [{ source_message_id: "m-current", literal: mileageEvidenceLiteral }] };
  }
  const input = { current_message: customerTurn(currentText), recent_conversation: [] };
  return sanitizeSemanticEvidence(candidate, input);
}

test("Family Q3 - 7 (exact incident): 'valor 13.000.000' with no km keyword must not materialize mileage_km", () => {
  const text = "Peugeot 408 2.0 Allure año 2013, valor 13.000.000";
  const { extraction, warnings } = sanitizeMileage(text, "valor 13.000.000");
  assert.equal(extraction.trade_in_vehicle.mileage_km, undefined);
  assert.ok(warnings.some(w => w.code === "MILEAGE_WITHOUT_KM_EVIDENCE"));
});

test("Family Q3 - 8 (regression, unaffected): '130.000 km' evidence still materializes mileage_km=130000, distinct from the monetary value in the same message", () => {
  const text = "Peugeot 408 2013, 130.000 km, valor 13.000.000";
  const { extraction } = sanitizeMileage(text, "130.000 km", { mileageValue: 130000 });
  assert.equal(extraction.trade_in_vehicle.mileage_km.value, 130000);
});

test("Family Q3 - 9 (regression, unaffected): '3.000 k.m reales' materializes mileage_km=3000 via the k.m variant", () => {
  const text = "3.000 k.m reales";
  const { extraction } = sanitizeMileage(text, "3.000 k.m", { mileageValue: 3000 });
  assert.equal(extraction.trade_in_vehicle.mileage_km.value, 3000);
});

test("Family Q3 - 9b (kilometraje wording): 'kilometraje real 45000' still materializes mileage_km", () => {
  const text = "kilometraje real 45000";
  const { extraction } = sanitizeMileage(text, "kilometraje real 45000", { mileageValue: 45000 });
  assert.equal(extraction.trade_in_vehicle.mileage_km.value, 45000);
});

test("Family Q3 - 9c ('vale' with no km keyword, generalization check): 'lo tasan en 13 millones' must not materialize mileage_km", () => {
  const text = "lo tasan en 13 millones";
  const { extraction } = sanitizeMileage(text, "lo tasan en 13 millones");
  assert.equal(extraction.trade_in_vehicle.mileage_km, undefined);
});

// --- Requisito 3: protect Family O, P, Q, Q2 ---

function priorPartnerWith307TradeIn() {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: "m-partner", model: "Partner" }, "known", prov);
  state.has_trade_in = field("yes", "known", prov);
  state.trade_in_vehicle.brand = field("Peugeot", "known", prov);
  state.trade_in_vehicle.model = field("307", "known", prov);
  state.trade_in_vehicle.year = field("2006", "known", prov);
  state.trade_in_vehicle.km = field(200000, "known", prov);
  return state;
}

test("Family Q3 - 10 (Q2 negative control preserved): 'Solo el efectivo, el auto no' still clears has_trade_in to no", () => {
  const candidate = { ...emptySemanticExtraction(), purchase_mode_statement: "cash", trade_in_intent: "yes" };
  const firewalled = applyNegationScopeFirewall(candidate, { currentMessage: "Solo el efectivo, el auto no", previousState: priorPartnerWith307TradeIn() });
  assert.equal(firewalled.extraction.trade_in_intent, "no");
});

test("Family Q3 - 11 (Q2 negative control preserved): 'No, las cuotas están muy altas' with a confirmed trade-in must not clear it", () => {
  const candidate = { ...emptySemanticExtraction(), trade_in_intent: "yes" };
  const firewalled = applyNegationScopeFirewall(candidate, { currentMessage: "No, las cuotas están muy altas", previousState: priorPartnerWith307TradeIn() });
  assert.equal(firewalled.extraction.trade_in_intent, "yes");
  assert.equal(firewalled.result.applied, false);
});

test("Family Q3 - 12 (Q2 contamination guard preserved): 'Las cuotas?' with target Partner + trade-in 307 keeps the 307, end-to-end", () => {
  const prior = priorPartnerWith307TradeIn();
  const raw = {
    ...emptySemanticExtraction(),
    query_intent: "installment_offer",
    trade_in_intent: "yes",
    vehicle_mentions: [{
      literal: "Partner", brand_text: "Peugeot", model_text: "Partner", version_text: null,
      role: "trade_in", certainty: "contextual",
      evidence: [{ source_message_id: "m-current", literal: "Las cuotas?" }, { source_message_id: "m-prev", literal: "La cuota de la Partner..." }],
    }],
  };
  const currentMessage = customerTurn("Las cuotas?");
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: currentMessage });
  const result = runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns: [], bank_offers: [],
    previous_filter_state: prior, expected_state_version: 0, current_extraction: engineExtraction,
  });
  assert.equal(result.next_state.trade_in_vehicle.model.value, "307");
  assert.equal(result.next_state.trade_in_vehicle.year.value, "2006");
  assert.equal(result.next_state.trade_in_vehicle.km.value, 200000);
});

// --- End-to-end reproduction of Blocker 1 through the full engine ---

test("Family Q3 - 13 (end-to-end): after 'Financiarlo', the engine must not ask trade_in_brand for a vehicle the customer never offered", () => {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: "m-408", model: "408" }, "known", prov);
  const { extraction: normalized } = normalize("not_present", "Financiarlo", MULTI_ALT_QUESTION);
  normalized.purchase_mode_statement = "financed";
  const currentMessage = customerTurn("Financiarlo");
  const firewalled = applyNegationScopeFirewall(normalized, { currentMessage: currentMessage.text, previousState: state });
  const engineExtraction = semanticExtractionToEngine(firewalled.extraction, { current_message: currentMessage });
  const result = runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns: [], bank_offers: [],
    previous_filter_state: state, expected_state_version: 0, current_extraction: engineExtraction,
  });
  assert.equal(result.next_state.purchase_mode.value, "financed");
  assert.equal(result.next_state.has_trade_in.status, "missing", "must not fabricate has_trade_in=yes from an unrelated short answer");
  assert.ok(!String(result.response_plan?.next_filter_question ?? "").startsWith("trade_in_"));
});
