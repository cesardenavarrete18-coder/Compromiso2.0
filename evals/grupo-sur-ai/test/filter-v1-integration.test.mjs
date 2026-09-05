import test from "node:test";
import assert from "node:assert/strict";
import { adaptCampaignRows } from "../src/filter-v1/integration/campaign-adapter.mjs";
import { adaptCatalogRows, resolveBrand, resolveModel, resolveVersion, resolveModelCandidates } from "../src/filter-v1/integration/catalog-adapter.mjs";
import { adaptAcquisitionContext } from "../src/filter-v1/integration/acquisition-context-adapter.mjs";
import { adaptLeadContext, TARGET_SOURCE_PRECEDENCE } from "../src/filter-v1/integration/lead-context-adapter.mjs";
import { adaptOperationalControl } from "../src/filter-v1/integration/operational-control-adapter.mjs";
import { advanceStateVersion, deserializeFilterState, serializeFilterState } from "../src/filter-v1/integration/filter-state-persistence.mjs";
import { FILTER_V1_ENABLED_DEFAULT, filterV1Enabled } from "../src/filter-v1/integration/feature-flag.mjs";
import { runFilterV1Integration } from "../src/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../src/filter-v1/contracts.mjs";
import { assessMultiFactCombination, resolvePlanFact } from "../src/filter-v1/plan-fact-resolver.mjs";

const brands = [{ id: "vw", name: "Volkswagen", aliases: ["VW"], active: true }, { id: "fiat", name: "Fiat", active: true }, { id: "peugeot", name: "Peugeot", active: true }];
const models = [
  { id: "tera", brand_id: "vw", name: "Tera", active: true }, { id: "amarok", brand_id: "vw", name: "Amarok", active: true },
  { id: "208", brand_id: "peugeot", name: "208", aliases: ["Peugeot 208"], active: true },
  { id: "toro", brand_id: "fiat", name: "Toro", active: true }, { id: "fastback", brand_id: "fiat", name: "Fastback", active: true },
];
const versions = [{ id: "tera-comfort", model_id: "tera", name: "Comfort", aliases: ["Comfortline"], active: true }];
const catalogRows = { brands, models, model_versions: versions };
const catalog = adaptCatalogRows(catalogRows);
const campaignRows = [
  { id: "a", model_id: "208", active: true, plan_name: "A", version_name: "Allure", installment_count: 84, installment_amount: "600000", advance_amount: "4000000", final_price: "30000000", bonus: "Beneficio", benefits: ["Condición especial"] },
  { id: "b", model_id: "208", active: true, plan_name: "B", installment_amount: "450000", advance_amount: "7000000", final_price: "28000000" },
  { id: "off", model_id: "208", active: false, installment_amount: 1, advance_amount: 1, final_price: 1 },
];
const lead = { id: "lead-1", customer_name: "Ana", qualification_status: "follow_up", priority: "normal", intent_summary: "", model_interest: null, routing_status: "pending_supervisor", assigned_seller_user_id: null, metadata: {}, do_not_contact: false };
const base = overrides => ({ lead, attribution: null, conversation_control: { mode: "ai" }, previous_filter_state: null, current_extraction: {}, campaigns: campaignRows, catalog: catalogRows, event_at: "2026-09-04T15:00:00Z", timezone: "America/Argentina/Buenos_Aires", business_calendar: { timeZone: "America/Argentina/Buenos_Aires", operatingWeekdays: [1,2,3,4,5,6] }, ...overrides });

test("campaign adapter conserva shape CRM permitido y normaliza montos", () => {
  const row = adaptCampaignRows(campaignRows)[0];
  assert.deepEqual([row.campaign_id, row.model_id, row.active, row.installment_amount, row.advance_amount, row.final_price], ["a", "208", true, 600000, 4000000, 30000000]);
  assert.deepEqual(row.benefits, ["Condición especial"]); assert.equal("valid_from" in row, false);
});
test("catalog adapter resuelve brand/model/version y aliases", () => {
  assert.equal(resolveBrand(catalog, "VW").brand_id, "vw"); assert.equal(resolveModel(catalog, "Peugeot 208").model_id, "208"); assert.equal(resolveVersion(catalog, "Comfortline", { modelId: "tera" }).version_id, "tera-comfort");
});
test("catalog diferencia single, same-brand, cross-brand y unknown", () => {
  assert.equal(resolveModelCandidates(catalog, ["Tera"]).status, "single");
  assert.deepEqual([resolveModelCandidates(catalog, ["Toro", "Fastback"]).status, resolveModelCandidates(catalog, ["Toro", "Fastback"]).target], ["same_brand_multiple", null]);
  assert.equal(resolveModelCandidates(catalog, ["Tera", "Toro"]).status, "cross_brand_multiple"); assert.equal(resolveModelCandidates(catalog, ["No existe"]).status, "unknown");
});
test("acquisition context preserva Meta sin crear purchase mode", () => {
  const context = adaptAcquisitionContext({ platform: "meta_ads", campaign_id: "meta-1", raw_referral: { advertised_model: "Tera", advertised_modality: "financing" } }, catalog);
  assert.deepEqual([context.referral_target.model, context.advertised_modality, "purchase_mode" in context], ["Tera", "financing", false]);
});
test("lead adapter no reinterpreta campos legacy", () => { const context = adaptLeadContext({ ...lead, model_interest: "Tera", priority: "high" }); assert.deepEqual([context.crm_model_interest, context.legacy_priority, TARGET_SOURCE_PRECEDENCE[0]], ["Tera", "high", "customer_message"]); });
test("operational adapter hace takeover autoritativo", () => assert.deepEqual(adaptOperationalControl({ mode: "human", taken_by_user_id: "seller", taken_at: "2026-09-04T14:00:00Z" }), { human_owned: true, ai_allowed: false, taken_by: "seller", taken_at: "2026-09-04T14:00:00Z" }));

test("state snapshot round-trip conserva provenance y cero", () => {
  const state = createFilterState(); state.down_payment_amount = field(0, "known", { source: "customer_message" });
  const envelope = serializeFilterState(state, { stateVersion: 3, updatedAt: "2026-09-04T15:00:00Z" });
  const loaded = deserializeFilterState({ unrelated: true, filter_v1: envelope });
  assert.deepEqual([loaded.status, loaded.state_version, loaded.state.down_payment_amount.value, loaded.state.down_payment_amount.provenance.source], ["loaded", 3, 0, "customer_message"]);
});
test("metadata sin filter snapshot produce estado inicial", () => assert.deepEqual([deserializeFilterState({}).status, deserializeFilterState({}).state_version], ["absent", 0]));
test("schema futuro requiere upgrade", () => assert.equal(deserializeFilterState({ filter_v1: { schema_version: "filter-state/2.0" } }).status, "upgrade_required"));
test("versioning incrementa con expected correcto", () => assert.equal(advanceStateVersion({ currentStateVersion: 4, expectedStateVersion: 4 }).next_state_version, 5));
test("versioning detecta conflicto sin last-write-wins", () => assert.equal(advanceStateVersion({ currentStateVersion: 4, expectedStateVersion: 3 }).status, "state_conflict"));
test("feature flag es false por default y exige true boolean", () => assert.deepEqual([FILTER_V1_ENABLED_DEFAULT, filterV1Enabled({}), filterV1Enabled({ FILTER_V1_ENABLED: "true" }), filterV1Enabled({ FILTER_V1_ENABLED: true })], [false, false, false, true]));

test("A: Meta Tera inicializa target sin modalidad", () => {
  const out = runFilterV1Integration(base({ attribution: { platform: "meta_ads", raw_referral: { advertised_model: "Tera", advertised_modality: "financing" } } }));
  assert.deepEqual([out.next_state.target_model.value.model, out.next_state.purchase_mode.value], ["Tera", "unknown"]);
});
test("B: corrección cliente gana sobre Meta", () => {
  const out = runFilterV1Integration(base({ attribution: { platform: "meta_ads", raw_referral: { advertised_model: "Tera" } }, current_extraction: { customer_corrections: { target_model: "Amarok" } } }));
  assert.deepEqual([out.next_state.target_model.value.model, out.next_state.target_model.provenance.source], ["Amarok", "customer_message"]);
});
test("C: cuota mínima preserva campaign y modalidad unknown", () => {
  const out = runFilterV1Integration(base({ lead: { ...lead, model_interest: "208" }, current_extraction: { query_intent: "installment_offer" } }));
  assert.deepEqual([out.resolved_facts[0].value, out.resolved_facts[0].source_campaign_id, out.next_state.purchase_mode.value], [450000, "b", "unknown"]);
});
test("D: retiro usa advance mínimo", () => { const out = runFilterV1Integration(base({ lead: { ...lead, model_interest: "208" }, current_extraction: { query_intent: "delivery_advance" } })); assert.deepEqual([out.resolved_facts[0].value, out.resolved_facts[0].source_campaign_id], [4000000, "a"]); });
test("F: monto inicial ambiguo pide aclaración", () => { const out = runFilterV1Integration(base({ current_extraction: { query_intent: "ambiguous_initial_amount" } })); assert.equal(out.response_plan.next_filter_question, "clarify_initial_amount_intent"); });
test("G: capacidad cliente queda separada de advance comercial", () => {
  const out = runFilterV1Integration(base({ lead: { ...lead, model_interest: "208" }, current_extraction: { query_intent: "delivery_advance", extracted_fields: { purchase_mode: "financed", down_payment_amount: 10000000 } } }));
  assert.deepEqual([out.next_state.down_payment_amount.value, out.resolved_facts[0].value], [10000000, 4000000]);
});
test("H: vehículo propio no implica trade-in", () => { const out = runFilterV1Integration(base({ current_extraction: { extracted_fields: { owned_vehicle: { brand: "Volkswagen", model: "Amarok" } } } })); assert.deepEqual([out.next_state.has_trade_in.value, out.next_state.owned_vehicles[0].role], ["unknown", "owned_only"]); });
test("I: intención de entrega materializa trade-in yes", () => { const out = runFilterV1Integration(base({ current_extraction: { extracted_fields: { has_trade_in: "yes", trade_in_vehicle: { brand: "Volkswagen", model: "Amarok" } } } })); assert.equal(out.next_state.has_trade_in.value, "yes"); });
test("J: pedido humano corta preguntas y deja prioridad hot", () => { const out = runFilterV1Integration(base({ current_extraction: { query_intent: "human_request", human_request: true } })); assert.deepEqual([out.handoff_decision.handoff_status, out.response_plan.next_filter_question, out.next_state.contact_priority], ["immediate", null, "hot"]); });
test("K: visita futura conserva acción pero hace handoff ahora", () => { const action = { type: "visit", requested_action_at: "2026-09-05T15:00:00Z" }; const out = runFilterV1Integration(base({ current_extraction: { query_intent: "strong_action", strong_action: true, requested_action: action } })); assert.deepEqual([out.handoff_decision.handoff_status, out.next_state.requested_action], ["immediate", action]); });
test("L: human-owned suprime todo response plan", () => { const out = runFilterV1Integration(base({ conversation_control: { mode: "human", taken_by_user_id: "seller", taken_at: "now" }, current_extraction: { query_intent: "installment_offer" } })); assert.deepEqual([out.status, out.response_plan, out.handoff_decision.next_action], ["suppressed", null, "no_ai_response"]); });
test("M/N: engine clasifica viernes-sábado warm y lunes-sábado cold", () => {
  const extraction = { contact_preference: { timing: "future", callback_at: "2026-09-05T15:00:00Z" } };
  assert.equal(runFilterV1Integration(base({ current_extraction: extraction })).next_state.contact_priority, "warm");
  assert.equal(runFilterV1Integration(base({ current_extraction: extraction, event_at: "2026-08-31T15:00:00Z" })).next_state.contact_priority, "cold");
});
test("O: facts cross-campaign siguen bloqueando Frankenstein", () => {
  const adapted = adaptCampaignRows(campaignRows); const facts = [resolvePlanFact({ targetModelId: "208", campaigns: adapted, factType: "installment_offer" }), resolvePlanFact({ targetModelId: "208", campaigns: adapted, factType: "delivery_advance" })];
  assert.equal(assessMultiFactCombination(facts).cross_campaign_combination, true);
});
test("consulta técnica genera handoff a conocimiento autorizado", () => { const out = runFilterV1Integration(base({ lead: { ...lead, model_interest: "Amarok" }, current_extraction: { query_intent: "technical_question" } })); assert.deepEqual([out.resolved_facts[0].status,out.response_plan.knowledge_request.subject_model], ["requires_knowledge_lookup","Amarok"]); });
test("conflicto de state version aborta decisión", () => { const out = runFilterV1Integration(base({ expected_state_version: 4 })); assert.deepEqual([out.status, out.response_plan], ["state_conflict", null]); });
test("decision trace sólo contiene decisiones observables", () => { const out = runFilterV1Integration(base({ lead: { ...lead, model_interest: "208" }, current_extraction: { query_intent: "installment_offer" } })); assert.ok(out.decision_trace.some(item => item.decision === "installment_offer_fact" && item.source_campaign_id === "b")); assert.equal(JSON.stringify(out.decision_trace).includes("reasoning"), false); });
