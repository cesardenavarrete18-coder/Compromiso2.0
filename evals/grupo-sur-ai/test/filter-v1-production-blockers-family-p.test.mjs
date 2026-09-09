import assert from "node:assert/strict";
import test from "node:test";
import { adaptAcquisitionContext } from "../../../supabase/functions/_shared/filter-v1/integration/acquisition-context-adapter.mjs";
import { adaptCatalogRows } from "../../../supabase/functions/_shared/filter-v1/integration/catalog-adapter.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";

// Family P (investigated against production before any change - see
// scratchpad/investigate-family-p.mjs and the incident report): whatsapp-webhook/index.ts
// writes lead.metadata.referral synchronously at claim-time (claim_whatsapp_lead's
// p_metadata), but only upserts the lead_attributions row much later in the same webhook
// invocation - after routing, seller assignment, and the leads update. Shadow's own
// lead_attributions read (in runWhatsappV2Shadow's Promise.all) races ahead of that write on
// a brand-new lead's first turn, so `attribution` is null when Shadow's engine call happens.
// Confirmed by direct reproduction: even WITHOUT the race (attribution row supplied with
// the real raw_referral content in time), referral_target still never resolved, because
// lead_attributions has no referral_model_candidates column (verified against the actual
// migration) and Meta's real referral payload never carries model_candidates/advertised_model
// - only free-text headline/body. Two real, stacked defects, not one:
//   1. the race itself (fixed by falling back to lead.metadata.referral)
//   2. no text-matching against headline/body at all (fixed by resolveReferralTextCandidates
//      in acquisition-context-adapter.mjs, catalog-driven rather than a second hardcoded list)

const catalogRows = {
  brands: [{ id: "b1", name: "Peugeot" }],
  models: [{ id: "m-partner", name: "Partner", brand_id: "b1" }, { id: "m-208", name: "208", brand_id: "b1" }],
  model_versions: [],
};
const catalog = adaptCatalogRows(catalogRows);

const partnerReferral = Object.freeze({
  headline: "🚐 TU PARTNER VAN 0KM DESDE CUOTA 2",
  body: "🚐 ¿Necesitás una Partner Van y no conseguís entrega inmediata? Retiro previsto desde CUOTA 2.",
  source_type: "ad", source_id: "120250640333070282",
});

const ambiguousReferral = Object.freeze({
  headline: "Conocé la gama Peugeot: 208 y Partner con condiciones especiales",
  body: "Financiación disponible para toda la línea.",
});

test("Family P - 1 (adapter, race reproduced): attribution=null with no fallback resolves nothing - headline/body/referral_target all null", () => {
  const result = adaptAcquisitionContext(null, catalog);
  assert.equal(result.headline, null);
  assert.equal(result.referral_target, null);
});

test("Family P - 2 (adapter, deeper gap reproduced independent of timing): attribution present in time with real raw_referral, but no structured model_candidates - still resolved via text match after the fix", () => {
  const result = adaptAcquisitionContext({ raw_referral: partnerReferral, platform: "meta_ads" }, catalog);
  assert.equal(result.referral_target?.model, "Partner");
});

test("Family P - 3 (fallback wiring): attribution=null (the race) but fallbackReferral from lead.metadata resolves the single advertised model", () => {
  const result = adaptAcquisitionContext(null, catalog, partnerReferral);
  assert.equal(result.referral_target?.model, "Partner");
  assert.equal(result.headline, partnerReferral.headline);
});

test("Family P - 4 (ambiguous referral must not force a target): two distinct models mentioned in the same ad copy - no target chosen", () => {
  const result = adaptAcquisitionContext(null, catalog, ambiguousReferral);
  assert.equal(result.referral_target, null);
  assert.equal(result.referral_model_candidates.length, 2);
});

test("Family P - 5 (structured model_candidates still take precedence when present, unaffected by the text-match addition)", () => {
  const result = adaptAcquisitionContext({ raw_referral: { ...partnerReferral, model_candidates: ["208"] } }, catalog);
  assert.equal(result.referral_target?.model, "208", "an explicit structured candidate must win over a text scan of headline/body that would otherwise say Partner");
});

test("Family P - 6 (end-to-end engine, first inbound, no lead_attributions row yet): the ad's single model becomes target on turn 1", () => {
  const result = runFilterV1Integration({
    lead: { id: "lead1", metadata: { referral: partnerReferral } },
    conversation_control: { mode: "ai" },
    catalog: catalogRows,
    campaigns: [], bank_offers: [],
    attribution: null,
    current_extraction: { extracted_fields: {}, query_intent: "unknown" },
    expected_state_version: 0,
  });
  assert.equal(result.next_state.target_model.status, "known");
  assert.equal(result.next_state.target_model.value.model, "Partner");
  assert.equal(result.next_state.target_model.provenance.source, "meta_referral");
});

test("Family P - 7 (Shadow must not re-ask model when the ad already resolved it): next_filter_question skips past 'model'", () => {
  const result = runFilterV1Integration({
    lead: { id: "lead1", metadata: { referral: partnerReferral } },
    conversation_control: { mode: "ai" },
    catalog: catalogRows,
    campaigns: [], bank_offers: [],
    attribution: null,
    current_extraction: { extracted_fields: {}, query_intent: "unknown" },
    expected_state_version: 0,
  });
  assert.notEqual(result.response_plan.next_filter_question, "model");
});

test("Family P - 8 (ambiguous referral, end-to-end): the engine still asks for the model explicitly rather than guessing", () => {
  const result = runFilterV1Integration({
    lead: { id: "lead1", metadata: { referral: ambiguousReferral } },
    conversation_control: { mode: "ai" },
    catalog: catalogRows,
    campaigns: [], bank_offers: [],
    attribution: null,
    current_extraction: { extracted_fields: {}, query_intent: "unknown" },
    expected_state_version: 0,
  });
  assert.equal(result.next_state.target_model.status, "missing");
  assert.equal(result.response_plan.next_filter_question, "model");
});

test("Family P - 9 (precedence regression guard, pre-existing and unchanged by this fix): meta_referral outranks a same-turn direct customer mention, per filter-v1-engine.mjs's existing target-resolution order (correction > canonical_state > meta_referral > customer_message > crm_structured)", () => {
  const result = runFilterV1Integration({
    lead: { id: "lead1", metadata: { referral: partnerReferral } },
    conversation_control: { mode: "ai" },
    catalog: catalogRows,
    campaigns: [], bank_offers: [],
    attribution: null,
    current_extraction: { extracted_fields: {}, query_intent: "unknown", target_model: "208" },
    expected_state_version: 0,
  });
  assert.equal(result.next_state.target_model.value.model, "Partner");
  assert.equal(result.next_state.target_model.provenance.source, "meta_referral");
});
