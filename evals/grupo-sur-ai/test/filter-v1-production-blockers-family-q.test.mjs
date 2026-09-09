import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlanFact } from "../../../supabase/functions/_shared/filter-v1/plan-fact-resolver.mjs";
import { semanticExtractionToEngine } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-engine-adapter.mjs";
import { emptySemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-contract.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";

// Family Q (real incident, lead 60c87f67, 2026-09-08): customer said "No cero km un
// usado.precio" for a Peugeot 208 already resolved as target - the real Shadow run answered
// with the 0km campaign price ($40.370.000) via resolvePlanFact(), which has zero concept of
// vehicle condition and matches purely by model_id. campaigns only ever carry 0km pricing
// (verified: no used-vehicle price source exists anywhere in this schema) - there is no safe
// way to answer a used-vehicle price/installment/advance question from that table, and
// estimating one would be fabrication. Reproduced directly against unpatched
// resolvePlanFact()/runFilterV1Integration() before writing this fix (see
// scratchpad/investigate-family-q.mjs): the unguarded call resolved status "resolved",
// value 40370000 for a target whose own evidence said "usado".

const catalog = { brands: [{ id: "b1", name: "Peugeot" }], models: [{ id: "m-208", name: "208", brand_id: "b1" }, { id: "m-tera", name: "Tera", brand_id: "b1" }], model_versions: [] };
const campaigns = [{ id: "c1", model_id: "m-208", active: true, final_price: 40370000 }, { id: "c2", model_id: "m-tera", active: true, final_price: 33000000 }];
const prov = { source: "test_fixture", evidence: null };

function knownTarget(modelId, modelName) {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b1", brand: "Peugeot", model_id: modelId, model: modelName }, "known", prov);
  return state;
}

test("Family Q - 1 (resolvePlanFact guard, unit level): usedVehicleSubject short-circuits to not_materialized without ever inspecting campaigns", () => {
  const fact = resolvePlanFact({ targetModelId: "m-208", campaigns, factType: "model_reference_value", usedVehicleSubject: true });
  assert.equal(fact.status, "not_materialized");
  assert.equal(fact.value, null);
  assert.equal(fact.source_campaign_id, null);
});

test("Family Q - 2 (regression, unaffected): a 0km subject still resolves the real campaign price", () => {
  const fact = resolvePlanFact({ targetModelId: "m-208", campaigns, factType: "model_reference_value", usedVehicleSubject: false });
  assert.equal(fact.status, "resolved");
  assert.equal(fact.value, 40370000);
});

test("Family Q - 3 (adapter): '¿Cuánto vale mi 208 usado?' - target mention's own evidence says usado, flagged as used_vehicle_subject", () => {
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", vehicle_mentions: [
    { literal: "mi 208 usado", brand_text: null, model_text: "208", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: "cuanto vale mi 208 usado" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  assert.equal(engineExtraction.used_vehicle_subject, true);
});

test("Family Q - 4 (adapter, regression): 'Quiero comprar un 208 0km' - no usado evidence, not flagged", () => {
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", vehicle_mentions: [
    { literal: "un 208 0km", brand_text: null, model_text: "208", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: "quiero comprar un 208 0km" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  assert.equal(engineExtraction.used_vehicle_subject, false);
});

test("Family Q - 5 (adapter, role separation): a trade-in mention saying 'usado' must not flag an unrelated target subject as used", () => {
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", trade_in_intent: "yes", vehicle_mentions: [
    { literal: "un Tera 0km", brand_text: null, model_text: "Tera", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: "quiero un Tera 0km" }] },
    { literal: "mi 208 usado", brand_text: null, model_text: "208", version_text: null, role: "trade_in", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: "tengo un 208 usado para entregar" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  assert.equal(engineExtraction.used_vehicle_subject, false, "the target (Tera) has no 'usado' evidence of its own - only the trade-in mention does");
  assert.equal(engineExtraction.turn_subject_model, "Tera");
});

test("Family Q - 6 (end-to-end, exact incident reproduction): '¿Cuánto vale mi 208 usado?' never returns the 0km campaign price", () => {
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", vehicle_mentions: [
    { literal: "mi 208 usado", brand_text: null, model_text: "208", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: "cuanto vale mi 208 usado" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  const result = runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns, bank_offers: [],
    previous_filter_state: knownTarget("m-208", "208"), expected_state_version: 0,
    current_extraction: engineExtraction,
  });
  assert.equal(result.response_plan.answer_fact.status, "not_materialized");
  assert.equal(result.response_plan.answer_fact.value, null, "must never present the 0km price as the used vehicle's price");
});

test("Family Q - 7 (end-to-end, trade-in appraisal phrasing): 'Tengo un 208 usado, ¿cuánto me lo toman?' - the target subject is the used trade-in itself, never priced from 0km campaigns", () => {
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", trade_in_intent: "yes", vehicle_mentions: [
    { literal: "un 208 usado", brand_text: null, model_text: "208", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: "tengo un 208 usado, cuanto me lo toman" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  const result = runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns, bank_offers: [],
    expected_state_version: 0,
    current_extraction: engineExtraction,
  });
  assert.equal(result.response_plan.answer_fact.status, "not_materialized");
  assert.equal(result.response_plan.answer_fact.value, null);
});

test("Family Q - 8 (end-to-end regression): 'Quiero comprar un 208 0km' still resolves the real campaign price", () => {
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", vehicle_mentions: [
    { literal: "un 208 0km", brand_text: null, model_text: "208", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: "quiero comprar un 208 0km" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  const result = runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns, bank_offers: [],
    previous_filter_state: knownTarget("m-208", "208"), expected_state_version: 0,
    current_extraction: engineExtraction,
  });
  assert.equal(result.response_plan.answer_fact.status, "resolved");
  assert.equal(result.response_plan.answer_fact.value, 40370000);
});

test("Family Q - 9 (end-to-end, trade-in delivered does not become the 0km target): target stays Tera, trade-in stays a separate 208 with no fact resolution attempted on it", () => {
  const raw = { ...emptySemanticExtraction(), query_intent: "model_value", trade_in_intent: "yes", vehicle_mentions: [
    { literal: "un Tera", brand_text: null, model_text: "Tera", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: "quiero un Tera" }] },
    { literal: "mi 208 usado", brand_text: null, model_text: "208", version_text: null, role: "trade_in", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: "entrego mi 208 usado" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  const result = runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns, bank_offers: [],
    expected_state_version: 0,
    current_extraction: engineExtraction,
  });
  assert.equal(result.next_state.target_model.value.model, "Tera");
  assert.equal(result.next_state.trade_in_vehicle.model.value, "208");
  assert.equal(result.response_plan.answer_fact.status, "resolved", "the target (Tera, 0km) must still resolve its own campaign price - the trade-in's 'usado' must not block it");
  assert.equal(result.response_plan.answer_fact.value, 33000000);
});

test("Family Q - 10 (end-to-end, target 0km + trade-in usado in the same turn keep roles fully separate)", () => {
  const raw = { ...emptySemanticExtraction(), query_intent: "installment_offer", trade_in_intent: "yes", vehicle_mentions: [
    { literal: "el Tera 0km", brand_text: null, model_text: "Tera", version_text: null, role: "target", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: "cuanto sale el Tera 0km" }] },
    { literal: "mi 208 usado", brand_text: null, model_text: "208", version_text: null, role: "trade_in", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: "puedo entregar mi 208 usado" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  assert.equal(engineExtraction.used_vehicle_subject, false);
  assert.equal(engineExtraction.turn_subject_model, "Tera");
});
