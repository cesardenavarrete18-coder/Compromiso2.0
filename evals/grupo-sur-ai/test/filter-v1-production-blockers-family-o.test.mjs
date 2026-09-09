import assert from "node:assert/strict";
import test from "node:test";
import { semanticExtractionToEngine } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-engine-adapter.mjs";
import { emptySemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-contract.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";

// Family O (Production incident, 6 real shadow_run failures / 5 leads, 2026-09-08/09):
// semantic-engine-adapter.mjs's vehicle_mentions[role="trade_in"] fallback (used when the
// provider did not also populate the full structured trade_in_vehicle object) copied
// brand_text/version_text verbatim - both nullable per FILTER_V1_PROVIDER_SCHEMA - into
// extracted_fields.trade_in_vehicle. filter-v1-engine.mjs's applyExtractedFields then called
// field(value, "known", source) for any value !== undefined, including a literal null,
// and contracts.mjs's field() throws KNOWN_FIELD_REQUIRES_VALUE for a "known" field with a
// null value. Two-layer fix: the adapter must never emit a null/undefined property in its
// trade_in_vehicle fallback (an absent property reads as "missing", same as no mention at
// all); the engine must also never call field(x, "known", ...) with x === null/undefined,
// as defense in depth independent of what any adapter produces.

const catalog = { brands: [], models: [], model_versions: [] };

function baseFilterInput(overrides = {}) {
  return { lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns: [], bank_offers: [], expected_state_version: 0, ...overrides };
}

test("Family O - 1 (adapter): trade-in mention with only a model known omits brand/version entirely, not as null", () => {
  const raw = { ...emptySemanticExtraction(), trade_in_intent: "yes", vehicle_mentions: [
    { literal: "les dejo el Corolla", brand_text: null, model_text: "Corolla", version_text: null, role: "trade_in", certainty: "explicit", evidence: [] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  const tradeIn = engineExtraction.extracted_fields.trade_in_vehicle;
  assert.equal(tradeIn.model, "Corolla");
  assert.ok(!("brand" in tradeIn), "brand must be absent, not null");
  assert.ok(!("version" in tradeIn), "version must be absent, not null");
});

test("Family O - 2 (adapter): brand null, model and version known - only brand omitted", () => {
  const raw = { ...emptySemanticExtraction(), trade_in_intent: "yes", vehicle_mentions: [
    { literal: "un Corolla XEI", brand_text: null, model_text: "Corolla", version_text: "XEI", role: "trade_in", certainty: "explicit", evidence: [] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  const tradeIn = engineExtraction.extracted_fields.trade_in_vehicle;
  assert.equal(tradeIn.model, "Corolla");
  assert.equal(tradeIn.version, "XEI");
  assert.ok(!("brand" in tradeIn));
});

test("Family O - 3 (adapter): version null, brand and model known - only version omitted", () => {
  const raw = { ...emptySemanticExtraction(), trade_in_intent: "yes", vehicle_mentions: [
    { literal: "un Toyota Corolla", brand_text: "Toyota", model_text: "Corolla", version_text: null, role: "trade_in", certainty: "explicit", evidence: [] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  const tradeIn = engineExtraction.extracted_fields.trade_in_vehicle;
  assert.equal(tradeIn.brand, "Toyota");
  assert.equal(tradeIn.model, "Corolla");
  assert.ok(!("version" in tradeIn));
});

test("Family O - 4 (adapter): brand AND version both null - both omitted, model survives alone", () => {
  const raw = { ...emptySemanticExtraction(), trade_in_intent: "yes", vehicle_mentions: [
    { literal: "tengo un usado para entregar", brand_text: null, model_text: "usado", version_text: null, role: "trade_in", certainty: "ambiguous", evidence: [] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  const tradeIn = engineExtraction.extracted_fields.trade_in_vehicle;
  assert.deepEqual(tradeIn, { model: "usado" });
});

test("Family O - 5 (adapter): explicitly_unknown from the structured trade_in_vehicle field is NOT synthesized by the vehicle_mentions fallback (no such signal here)", () => {
  // The vehicle_mentions fallback path must never invent an explicitly_unknown marker on
  // its own - that semantic only ever comes from the structured trade_in_vehicle object
  // (schema usedField with status "explicitly_unknown"), covered by test 6 below.
  const raw = { ...emptySemanticExtraction(), trade_in_intent: "yes", vehicle_mentions: [
    { literal: "les dejo algo", brand_text: null, model_text: null, version_text: null, role: "trade_in", certainty: "ambiguous", evidence: [] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  const tradeIn = engineExtraction.extracted_fields.trade_in_vehicle;
  assert.deepEqual(tradeIn, {}, "an all-null vehicle mention must yield no fields at all, never a fabricated explicitly_unknown");
});

test("Family O - 6 (adapter, unaffected by fix): explicitly_unknown from the structured trade_in_vehicle object is preserved as-is", () => {
  const raw = { ...emptySemanticExtraction(), trade_in_intent: "yes",
    trade_in_vehicle: { brand: { value: null, status: "explicitly_unknown", evidence: [] }, model: { value: "Corolla", status: "known", evidence: [] }, version: { value: null, status: "missing", evidence: [] }, year: { value: null, status: "missing", evidence: [] }, mileage_km: { value: null, status: "missing", evidence: [] } },
  };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  const tradeIn = engineExtraction.extracted_fields.trade_in_vehicle;
  assert.equal(tradeIn.brand.semantic_status, "explicitly_unknown");
  assert.equal(tradeIn.model, "Corolla");
});

test("Family O - 7 (engine): a trade-in mention missing brand/version does not throw and leaves those sub-fields missing", () => {
  const engineExtraction = { extracted_fields: { trade_in_vehicle: { model: "Corolla" } } };
  const result = runFilterV1Integration({ ...baseFilterInput(), current_extraction: engineExtraction });
  assert.equal(result.status, "ok");
  assert.equal(result.next_state.trade_in_vehicle.model.status, "known");
  assert.equal(result.next_state.trade_in_vehicle.model.value, "Corolla");
  assert.equal(result.next_state.trade_in_vehicle.brand.status, "missing");
  assert.equal(result.next_state.trade_in_vehicle.variant.status, "missing");
});

test("Family O - 8 (engine, defense in depth): a literal null passed straight through extracted_fields.trade_in_vehicle never reaches field() as known", () => {
  // Exercises applyExtractedFields directly with a null value regardless of what any
  // adapter would produce today - the engine itself must never trust an upstream null.
  const engineExtraction = { extracted_fields: { trade_in_vehicle: { brand: null, model: "Corolla", variant: null } } };
  const result = runFilterV1Integration({ ...baseFilterInput(), current_extraction: engineExtraction });
  assert.equal(result.status, "ok");
  assert.equal(result.next_state.trade_in_vehicle.brand.status, "missing");
  assert.equal(result.next_state.trade_in_vehicle.variant.status, "missing");
  assert.equal(result.next_state.trade_in_vehicle.model.value, "Corolla");
});

test("Family O - 9 (engine, explicitly_unknown untouched by the fix): still produces an explicitly_unknown field, not missing", () => {
  const engineExtraction = { extracted_fields: { trade_in_vehicle: { brand: { semantic_status: "explicitly_unknown", evidence: null } } } };
  const result = runFilterV1Integration({ ...baseFilterInput(), current_extraction: engineExtraction });
  assert.equal(result.status, "ok");
  assert.equal(result.next_state.trade_in_vehicle.brand.status, "explicitly_unknown");
  assert.equal(result.next_state.trade_in_vehicle.brand.value, null);
});

test("Family O - 10 (multi-turn, previous state existing): a null-brand trade-in turn on top of an existing partial state does not throw and preserves prior known fields", () => {
  const priorState = createFilterState();
  priorState.trade_in_vehicle.model = field("Corolla", "known", { source: "customer_message", evidence: null });
  const engineExtraction = { extracted_fields: { trade_in_vehicle: { brand: null, variant: "XEI" } } };
  const result = runFilterV1Integration({ ...baseFilterInput({ previous_filter_state: priorState, expected_state_version: 0 }), current_extraction: engineExtraction });
  assert.equal(result.status, "ok");
  assert.equal(result.next_state.trade_in_vehicle.model.value, "Corolla", "prior known model must survive an unrelated null-brand turn");
  assert.equal(result.next_state.trade_in_vehicle.variant.value, "XEI");
  assert.equal(result.next_state.trade_in_vehicle.brand.status, "missing");
});

test("Family O - 11 (exact incident reproduction, red before fix / green after): the real production trigger shape does not throw KNOWN_FIELD_REQUIRES_VALUE", () => {
  // Same shape as scratchpad/repro-known-field-2.mjs, which threw
  // "TypeError: KNOWN_FIELD_REQUIRES_VALUE" at filter-v1-engine.mjs:43 against the
  // unpatched code (verified separately, see incident report). This test is the
  // permanent regression guard for that exact incident.
  const raw = { ...emptySemanticExtraction(), trade_in_intent: "yes", vehicle_mentions: [
    { literal: "la traigo de parte de pago", brand_text: null, model_text: "usado", version_text: null, role: "trade_in", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: "la traigo de parte de pago" }] },
  ] };
  const engineExtraction = semanticExtractionToEngine(raw, {});
  assert.doesNotThrow(() => runFilterV1Integration({ ...baseFilterInput(), current_extraction: engineExtraction }));
});
