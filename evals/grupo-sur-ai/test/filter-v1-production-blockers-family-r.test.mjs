import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-normalizer.mjs";
import { applyNegationScopeFirewall } from "../../../supabase/functions/_shared/ai-v2-shadow/safety-firewall.mjs";
import { semanticExtractionToEngine } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-engine-adapter.mjs";
import { emptySemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-contract.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";

// Family R (real Production incidents, post-v35 observation, whatsapp-webhook v35,
// baseline 2026-09-11T19:46:45.173Z): four blockers found in the 32-lead / 72-run sample.

const catalog = {
  brands: [{ id: "b-peugeot", name: "Peugeot" }, { id: "b-gilera", name: "Gilera" }, { id: "b-toyota", name: "Toyota" }],
  models: [
    { id: "m-208", name: "208", brand_id: "b-peugeot" },
    { id: "m-408", name: "408", brand_id: "b-peugeot" },
    { id: "m-partner", name: "Partner", brand_id: "b-peugeot" },
    { id: "m-smash", name: "Smash 125", brand_id: "b-gilera" },
    { id: "m-corolla", name: "Corolla", brand_id: "b-toyota" },
  ],
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

// =====================================================================================
// BLOCKER R1 — known/null: a malformed trade_in_vehicle sub-field (status "known" with a
// null/undefined value) must never persist as-is, nor as a nested known/null-shaped object.
// Production showed exactly this for trade_in_vehicle.version. Root cause under
// investigation: which layer (provider, normalizer, sanitizer, adapter, contracts, state
// merge) lets it through.
// =====================================================================================

// null is legitimately `typeof "object"` in JS, so checking for the anomalous nested
// {value,status,...} structure must check for that shape specifically, not `typeof ===
// "object"` (which would also flag a perfectly valid missingField().value === null).
function isNestedFieldObject(value) {
  return Boolean(value) && typeof value === "object" && "status" in value;
}

function tradeInVehicleRaw(overrides = {}) {
  const ev = literal => [{ source_message_id: "m-current", literal }];
  return {
    ...emptySemanticExtraction(),
    trade_in_vehicle: {
      brand: { value: "Peugeot", status: "known", evidence: ev("Peugeot") },
      model: { value: "408", status: "known", evidence: ev("408") },
      version: { value: null, status: "missing", evidence: [] },
      year: { value: "2013", status: "known", evidence: ev("2013") },
      mileage_km: { value: null, status: "missing", evidence: [] },
      ...overrides,
    },
  };
}

test("Family R1 - 1 (critical): a provider-proposed version status=known/value=null must never materialize as known, and must never persist as a nested known/null object", () => {
  // trade_in_vehicle.version is not one of createFilterState()'s pre-declared sub-fields
  // (only brand/model/variant/year/km are - "version" is the provider schema's own name,
  // never renamed to "variant" anywhere in the pipeline; see the residual finding in the
  // Family R report). It is only ever added to state ad hoc, by applyExtractedFields, when
  // something is actually extracted for it - so a value that never survives the adapter's
  // filtering correctly leaves it absent (undefined), not a field()-shaped object. What
  // matters for this blocker is that it never comes out the other side as "known".
  const text = "Peugeot 408 2013";
  const raw = tradeInVehicleRaw({
    version: { value: null, status: "known", evidence: [{ source_message_id: "m-current", literal: "408" }] },
  });
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  const result = runTurn(undefined, engineExtraction);
  const version = result.next_state.trade_in_vehicle.version;
  assert.notEqual(version?.status, "known", "a malformed known/null must never survive as known");
  assert.ok(!isNestedFieldObject(version?.value), "the value must never itself be a field-shaped {value,status,...} object");
});

test("Family R1 - 2: trade_in_vehicle.version with no information at all never materializes as known either", () => {
  const text = "Peugeot 408 2013";
  const raw = tradeInVehicleRaw(); // version already missing/no evidence above
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  const result = runTurn(undefined, engineExtraction);
  assert.notEqual(result.next_state.trade_in_vehicle.version?.status, "known");
});

test("Family R1 - 3: 'No sé qué versión es' still materializes version as explicitly_unknown", () => {
  const text = "Peugeot 408 2013, no se que version es";
  const raw = tradeInVehicleRaw({
    version: { value: null, status: "explicitly_unknown", evidence: [{ source_message_id: "m-current", literal: "no se que version es" }] },
  });
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  const result = runTurn(undefined, engineExtraction);
  assert.equal(result.next_state.trade_in_vehicle.version.status, "explicitly_unknown");
});

test("Family R1 - 4 (regression control): valid brand/model/year/km must not degrade because of the known/null fix", () => {
  const text = "Peugeot 408 2013, 130.000 km";
  const raw = tradeInVehicleRaw({
    mileage_km: { value: 130000, status: "known", evidence: [{ source_message_id: "m-current", literal: "130.000 km" }] },
  });
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  const result = runTurn(undefined, engineExtraction);
  assert.equal(result.next_state.trade_in_vehicle.brand.value, "Peugeot");
  assert.equal(result.next_state.trade_in_vehicle.model.value, "408");
  assert.equal(result.next_state.trade_in_vehicle.year.value, "2013");
  assert.equal(result.next_state.trade_in_vehicle.km.value, 130000);
});

test("Family R1 - 5 (generalization): the same known/null hazard applied to mileage_km must not materialize as known either", () => {
  const text = "Peugeot 408 2013";
  const raw = tradeInVehicleRaw({
    mileage_km: { value: null, status: "known", evidence: [{ source_message_id: "m-current", literal: "408" }] },
  });
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  const result = runTurn(undefined, engineExtraction);
  assert.notEqual(result.next_state.trade_in_vehicle.km.status, "known");
  assert.ok(!isNestedFieldObject(result.next_state.trade_in_vehicle.km.value));
});

// =====================================================================================
// BLOCKER R2 — ambiguous negations wrongly converted to trade_in=no. "No lo se todavia" /
// "No se" / "No gracias" express uncertainty or an unrelated dismissal, not rejection of the
// trade-in offer. Rejection must require an unambiguous signal scoped to the trade-in
// concept itself, not the bare presence of the word "no".
// =====================================================================================

const EXCLUSIVE_TRADE_QUESTION = "¿Tenés un usado para entregar?";

function normalizeAnswer(rawTradeInIntent, currentText, previousText) {
  const candidate = { ...emptySemanticExtraction(), trade_in_intent: rawTradeInIntent };
  const input = { current_message: customerTurn(currentText), recent_conversation: [assistantQuestion(previousText)] };
  return normalizeSemanticExtraction(candidate, input);
}

test("Family R2 - 5 (critical): 'No lo se todavia' after a trade-in question must NOT become trade_in=no", () => {
  const { extraction } = normalizeAnswer("not_present", "No lo se todavia", EXCLUSIVE_TRADE_QUESTION);
  assert.notEqual(extraction.trade_in_intent, "no");
});

test("Family R2 - 6 (critical): 'No se' after a trade-in question must NOT become trade_in=no", () => {
  const { extraction } = normalizeAnswer("not_present", "No se", EXCLUSIVE_TRADE_QUESTION);
  assert.notEqual(extraction.trade_in_intent, "no");
});

test("Family R2 - 7 (critical): 'No gracias, prefiero seguir mirando' - the 'no' does not refer unambiguously to the trade-in - must NOT become trade_in=no", () => {
  const { extraction } = normalizeAnswer("not_present", "No gracias, prefiero seguir mirando", EXCLUSIVE_TRADE_QUESTION);
  assert.notEqual(extraction.trade_in_intent, "no");
});

test("Family R2 - 7b: 'No recuerdo' after a trade-in question must NOT become trade_in=no", () => {
  const { extraction } = normalizeAnswer("not_present", "No recuerdo", EXCLUSIVE_TRADE_QUESTION);
  assert.notEqual(extraction.trade_in_intent, "no");
});

test("Family R2 - 7c: 'No, es muy caro' after a trade-in question must NOT become trade_in=no", () => {
  const { extraction } = normalizeAnswer("not_present", "No, es muy caro", EXCLUSIVE_TRADE_QUESTION);
  assert.notEqual(extraction.trade_in_intent, "no");
});

test("Family R2 - 7d: 'No, prefiero otra version' after a trade-in question must NOT become trade_in=no", () => {
  const { extraction } = normalizeAnswer("not_present", "No, prefiero otra version", EXCLUSIVE_TRADE_QUESTION);
  assert.notEqual(extraction.trade_in_intent, "no");
});

test("Family R2 - 7e: 'No tengo decidido todavia' after a trade-in question must NOT become trade_in=no", () => {
  const { extraction } = normalizeAnswer("not_present", "No tengo decidido todavia", EXCLUSIVE_TRADE_QUESTION);
  assert.notEqual(extraction.trade_in_intent, "no");
});

test("Family R2 - 7f: 'No me interesa esa cuota' after a trade-in question must NOT become trade_in=no", () => {
  const { extraction } = normalizeAnswer("not_present", "No me interesa esa cuota", EXCLUSIVE_TRADE_QUESTION);
  assert.notEqual(extraction.trade_in_intent, "no");
});

test("Family R2 - 8 (regression control): 'No entrego el auto' still resolves trade_in=no", () => {
  const { extraction } = normalizeAnswer("not_present", "No entrego el auto", EXCLUSIVE_TRADE_QUESTION);
  assert.equal(extraction.trade_in_intent, "no");
});

test("Family R2 - 8b (regression control, unambiguous rejection variants): each still resolves trade_in=no", () => {
  for (const phrase of ["El auto no", "No voy a entregar usado", "Me quedo con mi auto", "Sin usado"]) {
    const { extraction } = normalizeAnswer("not_present", phrase, EXCLUSIVE_TRADE_QUESTION);
    assert.equal(extraction.trade_in_intent, "no", `expected trade_in=no for: ${phrase}`);
  }
});

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

test("Family R2 - 9 (Q2 regression, unaffected): 'Solo el efectivo, el auto no' still resolves has_trade_in=no", () => {
  const candidate = { ...emptySemanticExtraction(), purchase_mode_statement: "cash", trade_in_intent: "yes" };
  const firewalled = applyNegationScopeFirewall(candidate, { currentMessage: "Solo el efectivo, el auto no", previousState: priorPartnerWith307TradeIn() });
  assert.equal(firewalled.extraction.trade_in_intent, "no");
});

test("Family R2 - 10 (Q2 regression, unaffected): trade-in previously yes + 'No, las cuotas estan muy altas' must preserve trade_in=yes", () => {
  const candidate = { ...emptySemanticExtraction(), trade_in_intent: "yes" };
  const firewalled = applyNegationScopeFirewall(candidate, { currentMessage: "No, las cuotas estan muy altas", previousState: priorPartnerWith307TradeIn() });
  assert.equal(firewalled.extraction.trade_in_intent, "yes");
  assert.equal(firewalled.result.applied, false);
});

// =====================================================================================
// BLOCKER R3 — changing the used vehicle's canonical identity (brand/model) must invalidate
// stale attributes (km, version, year) from the PREVIOUS vehicle that were not reaffirmed
// for the new one. Progressive enrichment of the SAME vehicle must not reset anything.
// =====================================================================================

function tradeInTurn(fields, text) {
  const raw = { ...emptySemanticExtraction(), trade_in_intent: "yes", trade_in_vehicle: fields };
  return semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
}
function known(value, literal) {
  return { value, status: "known", evidence: [{ source_message_id: "m-current", literal }] };
}

test("Family R3 - 11 (critical): switching Gilera Smash 125 -> Peugeot 408 discards the old vehicle's km", () => {
  const turn1 = runTurn(undefined, tradeInTurn({
    brand: known("Gilera", "Gilera"), model: known("Smash 125", "Smash 125"),
    year: known("2024", "2024"), mileage_km: known(3000, "3.000 km"),
  }, "Gilera Smash 125 2024, 3.000 km"));
  assert.equal(turn1.next_state.trade_in_vehicle.km.value, 3000);

  const turn2 = runTurn(turn1, tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("408", "408"), year: known("2013", "2013"),
  }, "Tengo un Peugeot 408 2013 para entregar"));
  assert.equal(turn2.next_state.trade_in_vehicle.brand.value, "Peugeot");
  assert.equal(turn2.next_state.trade_in_vehicle.model.value, "408");
  assert.equal(turn2.next_state.trade_in_vehicle.year.value, "2013");
  assert.equal(turn2.next_state.trade_in_vehicle.km.status, "missing", "the Gilera's 3000 km must not survive the identity change");
});

test("Family R3 - 12 (critical): the old vehicle's version is also discarded on identity change", () => {
  const turn1 = runTurn(undefined, tradeInTurn({
    brand: known("Gilera", "Gilera"), model: known("Smash 125", "Smash 125"),
    version: known("Base", "Base"), year: known("2024", "2024"),
  }, "Gilera Smash 125 Base 2024"));
  assert.equal(turn1.next_state.trade_in_vehicle.version.value, "Base");

  const turn2 = runTurn(turn1, tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("408", "408"),
  }, "En realidad tengo un Peugeot 408 para entregar"));
  assert.equal(turn2.next_state.trade_in_vehicle.model.value, "408");
  assert.equal(turn2.next_state.trade_in_vehicle.version.status, "missing", "the Gilera's version must not survive the identity change");
});

test("Family R3 - 13: a later turn 'Tiene 130.000 km' correctly completes the NEW vehicle (408) after the reset", () => {
  const turn1 = runTurn(undefined, tradeInTurn({ brand: known("Gilera", "Gilera"), model: known("Smash 125", "Smash 125"), mileage_km: known(3000, "3.000 km") }, "Gilera Smash 125, 3.000 km"));
  const turn2 = runTurn(turn1, tradeInTurn({ brand: known("Peugeot", "Peugeot"), model: known("408", "408") }, "Tengo un Peugeot 408 para entregar"));
  const turn3 = runTurn(turn2, tradeInTurn({ mileage_km: known(130000, "130.000 km") }, "Tiene 130.000 km"));
  assert.equal(turn3.next_state.trade_in_vehicle.brand.value, "Peugeot");
  assert.equal(turn3.next_state.trade_in_vehicle.model.value, "408");
  assert.equal(turn3.next_state.trade_in_vehicle.km.value, 130000);
});

test("Family R3 - 14 (regression control): progressive enrichment of the SAME vehicle across 3 turns never resets already-known fields", () => {
  const turn1 = runTurn(undefined, tradeInTurn({ brand: known("Peugeot", "Peugeot"), model: known("408", "408") }, "Tengo un Peugeot 408"));
  const turn2 = runTurn(turn1, tradeInTurn({ year: known("2013", "2013") }, "Es 2013"));
  const turn3 = runTurn(turn2, tradeInTurn({ mileage_km: known(130000, "130.000 km") }, "Tiene 130.000 km"));
  assert.equal(turn3.next_state.trade_in_vehicle.brand.value, "Peugeot");
  assert.equal(turn3.next_state.trade_in_vehicle.model.value, "408");
  assert.equal(turn3.next_state.trade_in_vehicle.year.value, "2013");
  assert.equal(turn3.next_state.trade_in_vehicle.km.value, 130000);
});

test("Family R3 - 15 (model-only change still invalidates incompatible old attributes): brand repeated, only model changes", () => {
  const turn1 = runTurn(undefined, tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("208", "208"), mileage_km: known(90000, "90.000 km"),
  }, "Tengo un Peugeot 208, 90.000 km"));
  assert.equal(turn1.next_state.trade_in_vehicle.km.value, 90000);

  const turn2 = runTurn(turn1, tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("408", "408"),
  }, "En realidad es un Peugeot 408, no un 208"));
  assert.equal(turn2.next_state.trade_in_vehicle.model.value, "408");
  assert.equal(turn2.next_state.trade_in_vehicle.km.status, "missing", "the 208's km must not survive as the 408's km");
});

// =====================================================================================
// BLOCKER R4 — a price/value question about the customer's OWN used/trade-in vehicle must
// never resolve from a 0km campaign, even when its model coincides with an established 0km
// target. Separation must be by subject/role, not by model match.
// =====================================================================================

function priorTarget(modelId, modelName) {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: modelId, model: modelName }, "known", prov);
  return state;
}
function priorTargetWithTradeIn(targetModelId, targetModelName, tradeInModelName, tradeInYear) {
  const state = priorTarget(targetModelId, targetModelName);
  state.has_trade_in = field("yes", "known", prov);
  state.trade_in_vehicle.brand = field("Peugeot", "known", prov);
  state.trade_in_vehicle.model = field(tradeInModelName, "known", prov);
  state.trade_in_vehicle.year = field(String(tradeInYear), "known", prov);
  return state;
}
const campaigns208 = [{ id: "c-208", model_id: "m-208", active: true, final_price: 43080000 }];
const campaignsPartner208 = [{ id: "c-partner", model_id: "m-partner", active: true, final_price: 30000000 }, { id: "c-208", model_id: "m-208", active: true, final_price: 43080000 }];

test("Family R4 - 16 (regression, Family Q): target 208 0km price question still resolves the real campaign price", () => {
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", vehicle_mentions: [
    { literal: "el 208 0km", brand_text: null, model_text: "208", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: "cuanto sale el 208 0km" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn("cuanto sale el 208 0km") });
  const result = runTurn(priorTarget("m-208", "208"), engineExtraction, campaigns208);
  assert.equal(result.response_plan.answer_fact.status, "resolved");
  assert.equal(result.response_plan.answer_fact.value, 43080000);
});

test("Family R4 - 17 (critical, exact incident): owned/trade-in Peugeot 208 2019 - '¿En cuanto me lo toman?' must NOT use the 0km campaign price", () => {
  const text = "Tengo un Peugeot 208 2019 para entregar, en cuanto me lo toman";
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", trade_in_intent: "yes", vehicle_mentions: [
    { literal: "un Peugeot 208 2019", brand_text: "Peugeot", model_text: "208", version_text: null, role: "trade_in", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: text }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  const result = runTurn(priorTarget("m-208", "208"), engineExtraction, campaigns208);
  assert.equal(result.response_plan.answer_fact.status, "not_materialized");
  assert.equal(result.response_plan.answer_fact.value, null);
});

test("Family R4 - 18 (regression): target Partner 0km + trade-in 208 established - a price question about the Partner still resolves its own campaign", () => {
  const text = "cuanto sale la Partner 0km";
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", vehicle_mentions: [
    { literal: "la Partner 0km", brand_text: "Peugeot", model_text: "Partner", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: text }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  const result = runTurn(priorTargetWithTradeIn("m-partner", "Partner", "208", 2019), engineExtraction, campaignsPartner208);
  assert.equal(result.response_plan.answer_fact.status, "resolved");
  assert.equal(result.response_plan.answer_fact.value, 30000000);
});

test("Family R4 - 19 (critical): same state (target Partner + trade-in 208) - a valuation question about the 208 usado must NOT use any 0km campaign", () => {
  const text = "y el 208 usado, en cuanto me lo toman";
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", vehicle_mentions: [
    { literal: "el 208 usado", brand_text: "Peugeot", model_text: "208", version_text: null, role: "trade_in", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: text }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  const result = runTurn(priorTargetWithTradeIn("m-partner", "Partner", "208", 2019), engineExtraction, campaignsPartner208);
  assert.equal(result.response_plan.answer_fact.status, "not_materialized");
  assert.equal(result.response_plan.answer_fact.value, null);
});

test("Family R4 - 20 (critical, coinciding model): target Peugeot 208 0km + trade-in Peugeot 208 2019 - '¿En cuanto toman el mio?' must still identify the usado by role, not by matching model", () => {
  const text = "tengo mi Peugeot 208 2019 para entregar, en cuanto toman el mio";
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", trade_in_intent: "yes", vehicle_mentions: [
    { literal: "mi Peugeot 208 2019", brand_text: "Peugeot", model_text: "208", version_text: null, role: "trade_in", certainty: "contextual", evidence: [{ source_message_id: "m-current", literal: text }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  const result = runTurn(priorTargetWithTradeIn("m-208", "208", "208", 2019), engineExtraction, campaigns208);
  assert.equal(result.response_plan.answer_fact.status, "not_materialized", "the same model_id (208) on both target and trade-in must never let the 0km price leak into the usado valuation");
  assert.equal(result.response_plan.answer_fact.value, null);
});

test("Family R4 - 21 (adapter unit level): a sole trade_in-role mention this turn flags used_vehicle_subject and sets turn_subject_model, with no competing target mention", () => {
  const text = "tengo un 208 usado para entregar, en cuanto me lo toman";
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", trade_in_intent: "yes", vehicle_mentions: [
    { literal: "un 208 usado", brand_text: null, model_text: "208", version_text: null, role: "trade_in", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: text }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  assert.equal(engineExtraction.used_vehicle_subject, true);
  assert.equal(engineExtraction.turn_subject_model, "208");
});

// --- R4, 2nd audit round: SAME turn names both a target-ish and a trade-in/owned vehicle ---
//
// The round-1 fix only handled the case where the current turn's ONLY vehicle mention was
// the trade-in/owned one (subjectMentions.length === 0). When the SAME message names both a
// target and a trade-in/owned vehicle, subjectMentions.length === 1 (the target) unconditionally
// won, regardless of which one the question's own evidence was actually about - so "Quiero una
// Partner 0km y tengo un Peugeot 208 2019 para entregar. ¿En cuanto me toman el 208?" resolved
// the Partner (or worse, nothing useful) instead of correctly abstaining on the 208 trade-in.

test("Family R4 - 22 (critical, both mentions same turn): 'Quiero una Partner 0km y tengo un Peugeot 208 2019 para entregar. ¿En cuanto me toman el 208?' must resolve the 208 trade-in as subject, never a campaign price", () => {
  const text = "Quiero una Partner 0km y tengo un Peugeot 208 2019 para entregar. En cuanto me toman el 208";
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", trade_in_intent: "yes", vehicle_mentions: [
    { literal: "una Partner 0km", brand_text: "Peugeot", model_text: "Partner", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: "Quiero una Partner 0km" }] },
    { literal: "un Peugeot 208 2019", brand_text: "Peugeot", model_text: "208", version_text: null, role: "trade_in", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: "En cuanto me toman el 208" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  assert.equal(engineExtraction.turn_subject_model, "208");
  assert.equal(engineExtraction.used_vehicle_subject, true);
  const result = runTurn(priorTarget("m-partner", "Partner"), engineExtraction, campaignsPartner208);
  assert.equal(result.response_plan.answer_fact.status, "not_materialized");
  assert.equal(result.response_plan.answer_fact.value, null);
});

test("Family R4 - 23 (regression, both mentions same turn): 'Quiero un 208 0km y tengo un Corolla usado. ¿Cuanto sale el 208?' still resolves the target's own campaign", () => {
  const text = "Quiero un 208 0km y tengo un Corolla usado. Cuanto sale el 208";
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", trade_in_intent: "yes", vehicle_mentions: [
    { literal: "un 208 0km", brand_text: "Peugeot", model_text: "208", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: "Cuanto sale el 208" }] },
    { literal: "un Corolla usado", brand_text: "Toyota", model_text: "Corolla", version_text: null, role: "trade_in", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: "tengo un Corolla usado" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  assert.equal(engineExtraction.turn_subject_model, "208");
  assert.equal(engineExtraction.used_vehicle_subject, false);
  const result = runTurn(undefined, engineExtraction, campaigns208);
  assert.equal(result.response_plan.answer_fact.status, "resolved");
  assert.equal(result.response_plan.answer_fact.value, 43080000);
});

test("Family R4 - 24 (critical, both mentions same turn): 'Quiero un 208 0km y tengo un Corolla usado. ¿En cuanto toman el Corolla?' must resolve the Corolla as subject, never any 0km campaign", () => {
  const text = "Quiero un 208 0km y tengo un Corolla usado. En cuanto toman el Corolla";
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", trade_in_intent: "yes", vehicle_mentions: [
    { literal: "un 208 0km", brand_text: "Peugeot", model_text: "208", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: "Quiero un 208 0km" }] },
    { literal: "un Corolla usado", brand_text: "Toyota", model_text: "Corolla", version_text: null, role: "trade_in", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: "En cuanto toman el Corolla" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  assert.equal(engineExtraction.turn_subject_model, "Corolla");
  assert.equal(engineExtraction.used_vehicle_subject, true);
  const result = runTurn(undefined, engineExtraction, campaigns208);
  assert.equal(result.response_plan.answer_fact.status, "not_materialized");
  assert.equal(result.response_plan.answer_fact.value, null);
});

test("Family R4 - 25 (critical, coinciding model, both mentions same turn): 'Quiero comprar un Peugeot 208 0km y tengo un Peugeot 208 2019 para entregar. ¿En cuanto toman el mio?' must resolve the trade-in as subject, never by model match", () => {
  const text = "Quiero comprar un Peugeot 208 0km y tengo un Peugeot 208 2019 para entregar. En cuanto toman el mio";
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", trade_in_intent: "yes", vehicle_mentions: [
    { literal: "un Peugeot 208 0km", brand_text: "Peugeot", model_text: "208", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: "Quiero comprar un Peugeot 208 0km" }] },
    { literal: "mi Peugeot 208 2019", brand_text: "Peugeot", model_text: "208", version_text: null, role: "trade_in", certainty: "explicit", evidence: [{ source_message_id: "m-current", literal: "En cuanto toman el mio" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
  assert.equal(engineExtraction.used_vehicle_subject, true, "the mention answered by the question ('en cuanto toman el mio') is the trade-in, regardless of both sharing model_id 208");
  const result = runTurn(priorTarget("m-208", "208"), engineExtraction, campaigns208);
  assert.equal(result.response_plan.answer_fact.status, "not_materialized");
  assert.equal(result.response_plan.answer_fact.value, null);
});
