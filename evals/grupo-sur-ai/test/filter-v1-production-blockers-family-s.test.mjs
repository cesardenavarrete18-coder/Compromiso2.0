import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeSemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-normalizer.mjs";
import { semanticExtractionToEngine } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-engine-adapter.mjs";
import { emptySemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-contract.mjs";
import { extractSemanticMessage } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extractor.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, deriveCommercialProfile, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";

// Family S (structural plumbing, post-Family-R, PR #77 merged as d0ba356): two known defects
// that block commercial_profile from ever being reachable, even though deriveCommercialProfile
// and handoff-policy themselves are untouched and correct.

const catalog = {
  brands: [{ id: "b-peugeot", name: "Peugeot" }],
  models: [{ id: "m-208", name: "208", brand_id: "b-peugeot" }, { id: "m-408", name: "408", brand_id: "b-peugeot" }],
  model_versions: [],
};
const prov = { source: "test_fixture", evidence: null };

function customerTurn(text, id = "m-current") {
  return { id, text };
}
function assistantQuestion(text, id = "m-prev") {
  return { id, role: "assistant", text };
}
function runTurn(previousResultOrState, extraction, campaigns = []) {
  const previous_filter_state = previousResultOrState?.next_state ?? previousResultOrState ?? undefined;
  const expected_state_version = previousResultOrState?.next_state?.state_version ?? 0;
  return runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns, bank_offers: [],
    previous_filter_state, expected_state_version, current_extraction: extraction,
  });
}
function priorTarget(modelId, modelName) {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: modelId, model: modelName }, "known", prov);
  return state;
}

// =====================================================================================
// S1 — trade_in_vehicle.version vs trade_in_vehicle.variant
// =====================================================================================

function tradeInTurn(fields, text) {
  const raw = { ...emptySemanticExtraction(), trade_in_intent: "yes", trade_in_vehicle: fields };
  return semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
}
function known(value, literal) {
  return { value, status: "known", evidence: [{ source_message_id: "m-current", literal }] };
}

test("Family S1.1 (critical): provider version=known('Allure') materializes as state.trade_in_vehicle.variant, never a parallel 'version' field", () => {
  const engineExtraction = tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("208", "208"),
    version: known("Allure", "Allure"), year: known("2019", "2019"),
  }, "Peugeot 208 Allure 2019");
  const result = runTurn(undefined, engineExtraction);
  assert.equal(result.next_state.trade_in_vehicle.variant.status, "known");
  assert.equal(result.next_state.trade_in_vehicle.variant.value, "Allure");
  assert.equal(result.next_state.trade_in_vehicle.version, undefined, "state must never carry a parallel 'version' field alongside 'variant'");
});

test("Family S1.2: 'No se que version es' materializes variant as explicitly_unknown", () => {
  const engineExtraction = tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("208", "208"),
    version: { value: null, status: "explicitly_unknown", evidence: [{ source_message_id: "m-current", literal: "no se que version es" }] },
  }, "Peugeot 208, no se que version es");
  const result = runTurn(undefined, engineExtraction);
  assert.equal(result.next_state.trade_in_vehicle.variant.status, "explicitly_unknown");
  assert.equal(result.next_state.trade_in_vehicle.version, undefined);
});

test("Family S1.3: no version mentioned at all leaves variant missing", () => {
  const engineExtraction = tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("208", "208"),
  }, "Peugeot 208");
  const result = runTurn(undefined, engineExtraction);
  assert.equal(result.next_state.trade_in_vehicle.variant.status, "missing");
  assert.equal(result.next_state.trade_in_vehicle.version, undefined);
});

test("Family S1.4: brand/model/year/km alongside version all materialize normally, version enters as variant", () => {
  const engineExtraction = tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("208", "208"), version: known("Allure", "Allure"),
    year: known("2019", "2019"), mileage_km: known(90000, "90.000 km"),
  }, "Peugeot 208 Allure 2019, 90.000 km");
  const result = runTurn(undefined, engineExtraction);
  assert.equal(result.next_state.trade_in_vehicle.brand.value, "Peugeot");
  assert.equal(result.next_state.trade_in_vehicle.model.value, "208");
  assert.equal(result.next_state.trade_in_vehicle.variant.value, "Allure");
  assert.equal(result.next_state.trade_in_vehicle.year.value, "2019");
  assert.equal(result.next_state.trade_in_vehicle.km.value, 90000);
});

test("Family S1.5 (Family R3 protection): switching vehicle after variant is known discards the old variant", () => {
  const turn1 = runTurn(undefined, tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("208", "208"), version: known("Allure", "Allure"),
    year: known("2019", "2019"), mileage_km: known(90000, "90.000 km"),
  }, "Peugeot 208 Allure 2019, 90.000 km"));
  assert.equal(turn1.next_state.trade_in_vehicle.variant.value, "Allure");

  const turn2 = runTurn(turn1, tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("408", "408"), year: known("2013", "2013"),
  }, "Tengo un Peugeot 408 2013 para entregar"));
  assert.equal(turn2.next_state.trade_in_vehicle.model.value, "408");
  assert.equal(turn2.next_state.trade_in_vehicle.year.value, "2013");
  assert.equal(turn2.next_state.trade_in_vehicle.variant.status, "missing", "the 208's Allure variant must not survive as the 408's variant");
  assert.equal(turn2.next_state.trade_in_vehicle.km.status, "missing");
});

test("Family S1.6 (reachability, deriveCommercialProfile untouched): a fully-informed trade-in resolves trade_in_variant=known", () => {
  const state = createFilterState();
  state.has_trade_in = field("yes", "known", prov);
  state.trade_in_vehicle.brand = field("Peugeot", "known", prov);
  state.trade_in_vehicle.model = field("208", "known", prov);
  state.trade_in_vehicle.variant = field("Allure", "known", prov);
  state.trade_in_vehicle.year = field("2019", "known", prov);
  state.trade_in_vehicle.km = field(90000, "known", prov);
  const profile = deriveCommercialProfile(state);
  assert.equal(profile.components.trade_in_variant, "known");
});

test("Family S1.7 (reachability, deriveCommercialProfile untouched): a fully-informed cash + trade-in profile is complete", () => {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: "m-208", model: "208" }, "known", prov);
  state.purchase_mode = field("cash", "known", prov);
  state.has_trade_in = field("yes", "known", prov);
  state.trade_in_vehicle.brand = field("Peugeot", "known", prov);
  state.trade_in_vehicle.model = field("208", "known", prov);
  state.trade_in_vehicle.variant = field("Allure", "known", prov);
  state.trade_in_vehicle.year = field("2019", "known", prov);
  state.trade_in_vehicle.km = field(90000, "known", prov);
  const profile = deriveCommercialProfile(state);
  assert.equal(profile.complete, true);
});

// =====================================================================================
// S2 — purchase_mode declaration vs query
// =====================================================================================

function normalizePurchaseMode(rawStatement, currentText, previousText, queryIntent) {
  const candidate = { ...emptySemanticExtraction(), purchase_mode_statement: rawStatement, query_intent: queryIntent ?? "none" };
  const input = { current_message: customerTurn(currentText), recent_conversation: previousText ? [assistantQuestion(previousText)] : [] };
  return normalizeSemanticExtraction(candidate, input);
}

test("Family S2.1 (critical): 'Lo voy a financiar. Cuanto me queda la cuota?' survives as financed despite co-occurring installment query", () => {
  const { extraction } = normalizePurchaseMode("financed", "Lo voy a financiar. Cuanto me queda la cuota?", null, "installment_offer");
  assert.equal(extraction.purchase_mode_statement, "financed");
});

test("Family S2.2 (critical): 'Lo compro al contado. Cuanto sale?' survives as cash despite co-occurring price query", () => {
  const { extraction } = normalizePurchaseMode("cash", "Lo compro al contado. Cuanto sale?", null, "model_value");
  assert.equal(extraction.purchase_mode_statement, "cash");
});

test("Family S2.3 (critical, hallucination): '¿Se puede financiar?' must stay not_present even if the provider proposes financed", () => {
  const { extraction } = normalizePurchaseMode("financed", "Se puede financiar?", null, "installment_offer");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

test("Family S2.4 (critical, hallucination): '¿Que cuota tiene?' must stay not_present even if the provider proposes financed", () => {
  const { extraction } = normalizePurchaseMode("financed", "Que cuota tiene?", null, "installment_offer");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

test("Family S2.5 (critical, hallucination): '¿Cuanto sale de contado?' must stay not_present even if the provider proposes cash", () => {
  const { extraction } = normalizePurchaseMode("cash", "Cuanto sale de contado?", null, "model_value");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

test("Family S2.6 (critical, hypothetical): 'Si lo financiara, cuanto pagaria?' must stay not_present", () => {
  const { extraction } = normalizePurchaseMode("financed", "Si lo financiara, cuanto pagaria?", null, "installment_offer");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

test("Family S2.7 (critical, indecision): 'No se si contado o financiado' must NOT resolve as known", () => {
  const { extraction } = normalizePurchaseMode("financed", "No se si contado o financiado", null, "none");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

test("Family S2.7b (indecision variants): 'Estoy entre contado y financiacion' / 'Capaz financiado' must NOT resolve as known", () => {
  for (const text of ["Estoy entre contado y financiacion", "Capaz financiado"]) {
    const { extraction } = normalizePurchaseMode("financed", text, null, "none");
    assert.equal(extraction.purchase_mode_statement, "not_present", `expected not_present for: ${text}`);
  }
});

const PURCHASE_MODE_QUESTION = "Lo vas a hacer de contado o financiado?";

test("Family S2.8 (critical, contextual): assistant asks contado-o-financiado, customer answers 'Financiado' -> financed", () => {
  const { extraction } = normalizePurchaseMode("not_present", "Financiado", PURCHASE_MODE_QUESTION, "none");
  assert.equal(extraction.purchase_mode_statement, "financed");
});

test("Family S2.9 (critical, contextual): assistant asks contado-o-financiado, customer answers 'Contado' -> cash", () => {
  const { extraction } = normalizePurchaseMode("not_present", "Contado", PURCHASE_MODE_QUESTION, "none");
  assert.equal(extraction.purchase_mode_statement, "cash");
});

test("Family S2.10 (critical, correction): prior state financed, 'Mejor lo pago al contado' switches to cash", () => {
  const state = priorTarget("m-208", "208");
  state.purchase_mode = field("financed", "known", prov);
  const raw = { ...emptySemanticExtraction(), query_intent: "none", purchase_mode_statement: "not_present" };
  const engineExtraction = semanticExtractionToEngine(
    normalizeSemanticExtraction(raw, { current_message: customerTurn("Mejor lo pago al contado") }).extraction,
    { current_message: customerTurn("Mejor lo pago al contado") },
  );
  const result = runTurn(state, engineExtraction);
  assert.equal(result.next_state.purchase_mode.value, "cash");
});

test("Family S2.11 (critical, persistence): prior state financed, '¿Que motor trae?' must NOT erase it", () => {
  const state = priorTarget("m-208", "208");
  state.purchase_mode = field("financed", "known", prov);
  const raw = { ...emptySemanticExtraction(), query_intent: "technical_question", purchase_mode_statement: "not_present" };
  const engineExtraction = semanticExtractionToEngine(
    normalizeSemanticExtraction(raw, { current_message: customerTurn("Que motor trae?") }).extraction,
    { current_message: customerTurn("Que motor trae?") },
  );
  const result = runTurn(state, engineExtraction);
  assert.equal(result.next_state.purchase_mode.value, "financed", "an unrelated turn with no new declaration must not reset a persisted purchase_mode");
});

test("Family S2.12 (critical): 'Lo voy a financiar. Que motor trae?' still resolves financed despite the technical question", () => {
  const { extraction } = normalizePurchaseMode("financed", "Lo voy a financiar. Que motor trae?", null, "technical_question");
  assert.equal(extraction.purchase_mode_statement, "financed");
});

test("Family S2.13 (interest is not a decision): 'Me interesa saber la financiacion' must NOT resolve as financed", () => {
  const { extraction } = normalizePurchaseMode("financed", "Me interesa saber la financiacion", null, "installment_offer");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

test("Family S2.14 (interest is not a decision): 'Quiero saber que financiacion tienen' must NOT resolve as financed", () => {
  const { extraction } = normalizePurchaseMode("financed", "Quiero saber que financiacion tienen", null, "installment_offer");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

// =====================================================================================
// S2 end-to-end evidence (post-merge audit fix): normalizeSemanticExtraction alone hid a real
// pipeline break — extractSemanticMessage re-validates AFTER normalization, and
// validateSemanticExtraction requires evidence.purchase_mode_statement for any statement other
// than "not_present". A statement synthesized by detectPurchaseModeDeclaration with no matching
// evidence entry failed that re-validation with INVALID_OR_MISSING_EVIDENCE, turning a correctly
// classified declaration into extraction_failed. These tests exercise the full pipeline (a fake
// client, not a hand-built candidate) so a regression here fails loudly again.
// =====================================================================================

async function extractEndToEnd(rawOverrides, currentText, previousText) {
  const raw = { ...emptySemanticExtraction(), ...rawOverrides };
  const input = {
    current_message: customerTurn(currentText, "m-current"),
    recent_conversation: previousText ? [assistantQuestion(previousText, "m-prev")] : [],
    previous_filter_state: null, acquisition_context: null, known_catalog_context: null,
  };
  return extractSemanticMessage({ client: async () => structuredClone(raw), ...input });
}

test("Family S2.15 (end-to-end, critical): raw not_present + contextual 'Financiado' -> ok/financed with valid evidence", async () => {
  const result = await extractEndToEnd({ purchase_mode_statement: "not_present" }, "Financiado", "Lo vas a hacer de contado o financiado?");
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "financed");
  assert.ok(Array.isArray(result.extraction.evidence.purchase_mode_statement) && result.extraction.evidence.purchase_mode_statement.length > 0);
});

test("Family S2.16 (end-to-end, critical): raw not_present + contextual 'Contado' -> ok/cash with valid evidence", async () => {
  const result = await extractEndToEnd({ purchase_mode_statement: "not_present" }, "Contado", "Lo vas a hacer de contado o financiado?");
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "cash");
  assert.ok(Array.isArray(result.extraction.evidence.purchase_mode_statement) && result.extraction.evidence.purchase_mode_statement.length > 0);
});

test("Family S2.17 (end-to-end, critical, design decision: the deterministic layer recovers a declaration the provider omitted): raw not_present + explicit 'Lo voy a financiar' -> ok/financed with valid evidence", async () => {
  const result = await extractEndToEnd({ purchase_mode_statement: "not_present" }, "Lo voy a financiar", null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "financed");
  assert.ok(Array.isArray(result.extraction.evidence.purchase_mode_statement) && result.extraction.evidence.purchase_mode_statement.length > 0);
});

test("Family S2.18 (end-to-end, critical): raw 'financed' hallucination on a pure query -> ok/not_present, stale evidence cleared", async () => {
  const result = await extractEndToEnd({ purchase_mode_statement: "financed", evidence: { purchase_mode_statement: [{ source_message_id: "m-current", literal: "Que cuota tiene?" }] } }, "Que cuota tiene?", null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "not_present");
  assert.equal(result.extraction.evidence.purchase_mode_statement, null);
});

test("Family S2.19 (end-to-end, critical): raw 'cash' hallucination on a pure query -> ok/not_present, stale evidence cleared", async () => {
  const result = await extractEndToEnd({ purchase_mode_statement: "cash", evidence: { purchase_mode_statement: [{ source_message_id: "m-current", literal: "Cuanto sale de contado?" }] } }, "Cuanto sale de contado?", null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "not_present");
  assert.equal(result.extraction.evidence.purchase_mode_statement, null);
});

test("Family S2.20 (GAP, informal '?' with no inverted '¿'): 'Lo voy a financiar, que anticipo necesito?' -> financed end-to-end", async () => {
  const result = await extractEndToEnd({ purchase_mode_statement: "not_present" }, "Lo voy a financiar, que anticipo necesito?", null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "financed");
});

test("Family S2.21 (GAP, informal '?' with no inverted '¿'): 'Lo compro al contado, cuanto sale?' -> cash end-to-end", async () => {
  const result = await extractEndToEnd({ purchase_mode_statement: "not_present" }, "Lo compro al contado, cuanto sale?", null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "cash");
});

// =====================================================================================
// S2, Golden Dataset regression (post-merge audit round 2): the 1st audit round's fix made
// detectPurchaseModeDeclaration the SOLE source of truth - anything its regexes didn't
// recognize was forced to "not_present", discarding an already-correct, already-evidence-
// validated provider value. This is a real regression against filter-v1-semantic-online-v0.2's
// own established purchase_mode contract (FVS-022..030), which the original Family S suite
// never caught because it only ever exercised phrasings the function already had an opinion
// about. Introduces a 4th outcome - "inconclusive" (detectPurchaseModeDeclaration returns null)
// - that leaves the candidate's own value untouched instead of defaulting it.
// =====================================================================================

function withValidEvidence(statement, text) {
  return { purchase_mode_statement: statement, evidence: { purchase_mode_statement: [{ source_message_id: "m-current", literal: text }] } };
}

test("Family S2.22 (Golden, inconclusive passthrough): provider financed with valid evidence survives for 'Quiero hacerlo por crédito.' (a phrasing outside the strict declaration regexes)", async () => {
  const text = "Quiero hacerlo por crédito.";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "financed");
});

test("Family S2.23 (Golden, inconclusive passthrough): provider financed with valid evidence survives for 'Quiero entrar en un plan.'", async () => {
  const text = "Quiero entrar en un plan.";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "financed");
});

test("Family S2.24 (Golden, inconclusive passthrough): provider cash with valid evidence survives for 'La quiero pagar cash.'", async () => {
  const text = "La quiero pagar cash.";
  const result = await extractEndToEnd(withValidEvidence("cash", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "cash");
});

test("Family S2.25 (Golden, conflicting passthrough): provider conflicting with valid evidence and clarification survives for 'Lo quiero al contado pero también podría financiarlo.'", async () => {
  const text = "Lo quiero al contado pero también podría financiarlo.";
  const raw = { ...emptySemanticExtraction(), purchase_mode_statement: "conflicting", needs_clarification: [{ code: "conflicting_purchase_mode", evidence: [{ source_message_id: "m-current", literal: text }] }] };
  const input = { current_message: customerTurn(text, "m-current"), recent_conversation: [], previous_filter_state: null, acquisition_context: null, known_catalog_context: null };
  const result = await extractSemanticMessage({ client: async () => structuredClone(raw), ...input });
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "conflicting");
  assert.ok(result.extraction.needs_clarification.some(item => item.code === "conflicting_purchase_mode"));
});

test("Family S2.26 (Golden, deterministic conflict recognition): the deterministic layer resolves conflicting even when the provider proposes only 'financed' for 'Lo quiero al contado pero también podría financiarlo.'", async () => {
  const result = await extractEndToEnd({ purchase_mode_statement: "financed" }, "Lo quiero al contado pero también podría financiarlo.", null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "conflicting");
  assert.ok(result.extraction.needs_clarification.some(item => item.code === "conflicting_purchase_mode"));
});

test("Family S2.27 (Golden, negative control, hallucination): '¿Qué financiación tienen?' stays not_present even if the provider proposes financed", async () => {
  const result = await extractEndToEnd({ purchase_mode_statement: "financed" }, "¿Qué financiación tienen?", null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "not_present");
});

test("Family S2.28 (Golden, negative control, no punctuation, hallucination): 'qué planes ofrecen' stays not_present even if the provider proposes financed", async () => {
  const result = await extractEndToEnd({ purchase_mode_statement: "financed" }, "qué planes ofrecen", null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "not_present");
});

test("Family S2.29 (Golden, negative control, informal '?', hallucination): 'hay financiación?' stays not_present even if the provider proposes financed", async () => {
  const result = await extractEndToEnd({ purchase_mode_statement: "financed" }, "hay financiación?", null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "not_present");
});

test("Family S2.30 (Golden Dataset compatibility, offline, FVS-022..030): every purchase_mode golden case survives the full pipeline unchanged when the provider already gets it right", async () => {
  const datasetText = await readFile(new URL("../datasets/filter-v1-semantic-online-v0.2.jsonl", import.meta.url), "utf8");
  const rows = datasetText.trim().split("\n").map(row => JSON.parse(row)).filter(row => row.category === "purchase_mode");
  assert.equal(rows.length, 9, "expected exactly the 9 FVS-022..030 purchase_mode golden cases");
  for (const row of rows) {
    const expectedStatement = row.expected_extraction.purchase_mode_statement;
    const currentMessage = row.input.current_message;
    const evidence = [{ source_message_id: currentMessage.id, literal: currentMessage.text }];
    const raw = {
      ...emptySemanticExtraction(),
      purchase_mode_statement: expectedStatement,
      evidence: { purchase_mode_statement: evidence },
      ...(expectedStatement === "conflicting" ? { needs_clarification: [{ code: "conflicting_purchase_mode", evidence }] } : {}),
    };
    const result = await extractSemanticMessage({ client: async () => structuredClone(raw), ...row.input });
    assert.equal(result.status, "ok", `${row.case_id} ('${currentMessage.text}') must extract ok`);
    assert.equal(result.extraction.purchase_mode_statement, expectedStatement, `${row.case_id} ('${currentMessage.text}') expected ${expectedStatement}`);
    const expectedClarificationCode = row.expected_extraction["needs_clarification.code"];
    if (expectedClarificationCode) assert.ok(result.extraction.needs_clarification.some(item => item.code === expectedClarificationCode), `${row.case_id} must carry needs_clarification.code=${expectedClarificationCode}`);
  }
});

// =====================================================================================
// S2, mixed declaration+question messages (post-merge audit round 3): the previous round's
// "is this message fundamentally a question" check operated on the WHOLE message text, so a "?"
// anywhere neutralized a real declaration sharing the turn with an unrelated question -
// "Quiero hacerlo por crédito. ¿Qué cuota me queda?" was forced to not_present, discarding an
// already-correct, already-evidence-validated provider value. Exactly the class of bug Family S
// was written to close. detectPurchaseModeDeclaration now scopes signal detection (steps 3-5) to
// the message's non-interrogative clauses only, via declarativeClauses/declarativeClausesRaw - a
// "?" in one clause never invalidates a different, non-interrogative clause's own content.
// =====================================================================================

test("Family S2.31 (mixed, critical): 'Quiero hacerlo por crédito. ¿Qué cuota me queda?' preserves the provider's financed, not neutralized by the trailing question", async () => {
  const text = "Quiero hacerlo por crédito. ¿Qué cuota me queda?";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "financed");
});

test("Family S2.32 (mixed, critical): 'Quiero entrar en un plan. ¿Cuánto necesito de anticipo?' preserves the provider's financed", async () => {
  const text = "Quiero entrar en un plan. ¿Cuánto necesito de anticipo?";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "financed");
});

test("Family S2.33 (mixed, critical): 'La quiero pagar cash. ¿Cuánto sale?' preserves the provider's cash", async () => {
  const text = "La quiero pagar cash. ¿Cuánto sale?";
  const result = await extractEndToEnd(withValidEvidence("cash", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "cash");
});

test("Family S2.34 (mixed, critical, deterministic conflict): 'Lo quiero al contado pero también podría financiarlo. ¿Qué me conviene?' resolves conflicting with clarification regardless of what the provider proposes", async () => {
  const text = "Lo quiero al contado pero también podría financiarlo. ¿Qué me conviene?";
  for (const providerStatement of ["conflicting", "cash", "financed"]) {
    const result = await extractEndToEnd(withValidEvidence(providerStatement, text), text, null);
    assert.equal(result.status, "ok", `provider=${providerStatement}`);
    assert.equal(result.extraction.purchase_mode_statement, "conflicting", `provider=${providerStatement}`);
    assert.ok(result.extraction.needs_clarification.some(item => item.code === "conflicting_purchase_mode"), `provider=${providerStatement}`);
  }
});

test("Family S2.35 (mixed, critical, pure hallucination control): 'Tengo un 208. ¿Qué cuota tiene?' stays not_present - an unrelated declarative clause must not preserve a hallucinated financed", async () => {
  const text = "Tengo un 208. ¿Qué cuota tiene?";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "not_present");
});

test("Family S2.36 (mixed, critical, commercial-query control): 'Me interesa el 208. ¿Se puede financiar?' stays not_present despite a hallucinated financed", async () => {
  const text = "Me interesa el 208. ¿Se puede financiar?";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "not_present");
});

test("Family S2.37 (mixed, critical, indecision control): 'No sé si contado o financiado. ¿Qué me conviene?' stays not_present, no purchase_mode known", async () => {
  const text = "No sé si contado o financiado. ¿Qué me conviene?";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "not_present");
});

// =====================================================================================
// S2, indecision/informational-interest scoped to the wrong clause (post-merge audit round 4):
// INDECISION_MARKER and INFORMATIONAL_INTEREST were tested against the WHOLE message, so doubt
// or curiosity about a DIFFERENT attribute ("No sé qué versión es.", "Quiero saber qué motor
// trae.") neutralized a real purchase_mode signal sitting in a completely separate clause
// ("Quiero entrar en un plan.") - the same whole-message-scope bug the round-3 fix already
// closed for "?", recurring for these two markers. Both are now scoped per-clause via
// clauseHasModeSignal, so only a clause whose OWN uncertainty/interest is about purchase mode
// itself can neutralize it.
// =====================================================================================

test("Family S2.38 (scope, critical): 'Quiero entrar en un plan. No sé qué versión es.' preserves financed - the doubt is about the vehicle's versión, not purchase_mode", async () => {
  const text = "Quiero entrar en un plan. No sé qué versión es.";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "financed");
});

test("Family S2.39 (scope, critical): 'Quiero hacerlo por crédito. Quiero saber qué motor trae.' preserves financed - 'quiero saber' refers to the motor, not financing", async () => {
  const text = "Quiero hacerlo por crédito. Quiero saber qué motor trae.";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "financed");
});

test("Family S2.40 (scope, critical): 'La quiero pagar cash. No sé si viene automática.' preserves cash - the doubt is about the transmission, not purchase_mode", async () => {
  const text = "La quiero pagar cash. No sé si viene automática.";
  const result = await extractEndToEnd(withValidEvidence("cash", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "cash");
});

test("Family S2.41 (scope, critical): 'Quiero entrar en un plan. No sé cuánto anticipo necesito.' preserves financed - the uncertainty is about the down-payment amount, not the choice to finance", async () => {
  const text = "Quiero entrar en un plan. No sé cuánto anticipo necesito.";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "financed");
});

test("Family S2.42 (scope, critical, true purchase_mode indecision control): 'No sé si hacerlo al contado o financiado.' stays not_present even if the provider proposes financed", async () => {
  const text = "No sé si hacerlo al contado o financiado.";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "not_present");
});

test("Family S2.43 (scope, critical, informational-interest control): 'Quiero saber qué financiación tienen.' stays not_present even if the provider proposes financed", async () => {
  const text = "Quiero saber qué financiación tienen.";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "not_present");
});

test("Family S2.44 (scope, critical, mixed control): 'Quiero entrar en un plan. Quiero saber qué financiación tienen.' resolves financed - the first clause already declares a choice, the second only asks about its details", async () => {
  const text = "Quiero entrar en un plan. Quiero saber qué financiación tienen.";
  const result = await extractEndToEnd(withValidEvidence("financed", text), text, null);
  assert.equal(result.status, "ok");
  assert.equal(result.extraction.purchase_mode_statement, "financed");
});

// =====================================================================================
// Family S integrated — end-to-end reachability of commercial_profile.complete
// =====================================================================================

test("Family S integrated - 1: cash, no trade-in, no financing sub-fields needed -> complete", () => {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: "m-208", model: "208" }, "known", prov);
  state.purchase_mode = field("cash", "known", prov);
  state.has_trade_in = field("no", "known", prov);
  const profile = deriveCommercialProfile(state);
  assert.equal(profile.complete, true);
});

test("Family S integrated - 2: financed, no trade-in, down payment + installment capacity known -> complete", () => {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: "m-208", model: "208" }, "known", prov);
  state.purchase_mode = field("financed", "known", prov);
  state.down_payment_amount = field(5000000, "known", prov);
  state.monthly_installment_capacity = field(300000, "known", prov);
  state.has_trade_in = field("no", "known", prov);
  const profile = deriveCommercialProfile(state);
  assert.equal(profile.complete, true);
});

test("Family S integrated - 3: cash, complete trade-in (brand/model/variant/year/km known) -> complete", () => {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: "m-208", model: "208" }, "known", prov);
  state.purchase_mode = field("cash", "known", prov);
  state.has_trade_in = field("yes", "known", prov);
  state.trade_in_vehicle.brand = field("Peugeot", "known", prov);
  state.trade_in_vehicle.model = field("208", "known", prov);
  state.trade_in_vehicle.variant = field("Allure", "known", prov);
  state.trade_in_vehicle.year = field("2019", "known", prov);
  state.trade_in_vehicle.km = field(90000, "known", prov);
  const profile = deriveCommercialProfile(state);
  assert.equal(profile.complete, true);
});
