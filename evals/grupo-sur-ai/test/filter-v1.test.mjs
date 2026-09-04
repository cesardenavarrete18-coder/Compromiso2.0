import test from "node:test";
import assert from "node:assert/strict";
import { createFilterState, deriveCommercialProfile, field, registerOwnedVehicle } from "../src/filter-v1/contracts.mjs";
import { resolvePlanFact, assessMultiFactCombination } from "../src/filter-v1/plan-fact-resolver.mjs";
import { classifyQueryIntent } from "../src/filter-v1/query-intent.mjs";
import { buildCommercialResponsePlan, COMMERCIAL_COPY_GUARDS } from "../src/filter-v1/commercial-response-policy.mjs";
import { contactPriority } from "../src/filter-v1/contact-priority.mjs";
import { decideHandoff } from "../src/filter-v1/handoff-policy.mjs";
import { findTechnicalModel } from "../src/filter-v1/technical-catalog.mjs";

const campaigns = [
  { id: "plan-a", model_id: "208", active: true, final_price: 30_000_000, installment_amount: 600_000, advance_amount: 4_000_000 },
  { id: "plan-b", model_id: "208", active: true, final_price: 28_000_000, installment_amount: 450_000, advance_amount: 7_000_000 },
  { id: "inactive", model_id: "208", active: false, final_price: 1, installment_amount: 1, advance_amount: 1 },
  { id: "nulls", model_id: "208", active: true, final_price: null, installment_amount: null, advance_amount: null },
  { id: "other-model", model_id: "Tera", active: true, final_price: 2, installment_amount: 2, advance_amount: 2 },
];

test("una campaña activa resuelve valor y provenance", () => {
  const fact = resolvePlanFact({ targetModelId: "208", campaigns: [campaigns[0]], factType: "installment_offer" });
  assert.deepEqual([fact.value, fact.source_campaign_id, fact.provenance.field], [600_000, "plan-a", "installment_amount"]);
});
test("varias campañas seleccionan cuota mínima", () => assert.equal(resolvePlanFact({ targetModelId: "208", campaigns, factType: "installment_offer" }).value, 450_000));
test("varias campañas seleccionan anticipo de retiro mínimo", () => assert.equal(resolvePlanFact({ targetModelId: "208", campaigns, factType: "delivery_advance" }).value, 4_000_000));
test("varias campañas seleccionan valor de modelo mínimo", () => assert.equal(resolvePlanFact({ targetModelId: "208", campaigns, factType: "model_reference_value" }).value, 28_000_000));
test("campaña inactiva se ignora", () => assert.notEqual(resolvePlanFact({ targetModelId: "208", campaigns, factType: "installment_offer" }).source_campaign_id, "inactive"));
test("null se ignora", () => assert.notEqual(resolvePlanFact({ targetModelId: "208", campaigns, factType: "installment_offer" }).source_campaign_id, "nulls"));
test("subscription nunca reutiliza advance_amount", () => {
  const fact = resolvePlanFact({ targetModelId: "208", campaigns, factType: "subscription_amount" });
  assert.deepEqual([fact.status, fact.value, fact.source_field], ["requires_commercial_confirmation", null, null]);
});

for (const phrase of ["¿Con cuánto puedo entrar?", "¿Cuánto necesito para entrar al plan?", "¿Cuánto sale suscribirme?", "¿Con cuánto arranco el plan?"]) {
  test(`subscription intent: ${phrase}`, () => assert.equal(classifyQueryIntent(phrase).intent, "subscription_amount"));
}
test("retiro se clasifica como delivery advance", () => assert.equal(classifyQueryIntent("¿Con cuánto lo puedo retirar?").intent, "delivery_advance"));
test("monto inicial ambiguo requiere aclaración", () => assert.deepEqual(classifyQueryIntent("¿Cuánto tengo que poner?"), { intent: "ambiguous_initial_amount", purchase_mode_effect: "none", next_action: "clarify_initial_amount_intent" }));
test("consulta de contado no materializa cash", () => assert.deepEqual([classifyQueryIntent("¿Cuánto sale de contado?").intent, classifyQueryIntent("¿Cuánto sale de contado?").purchase_mode_effect], ["model_value", "none"]));
test("consulta de cuota no materializa financed", () => assert.deepEqual([classifyQueryIntent("¿Qué cuota tiene?").intent, classifyQueryIntent("¿Qué cuota tiene?").purchase_mode_effect], ["installment_offer", "none"]));
test("declaración de modalidad sí materializa purchase mode", () => assert.deepEqual([classifyQueryIntent("Lo quiero pagar al contado").intent, classifyQueryIntent("Lo quiero pagar al contado").purchase_mode_effect], ["purchase_mode_statement", "cash"]));
test("pedido explícito de humano domina como intent", () => assert.deepEqual([classifyQueryIntent("Quiero hablar con un asesor").intent, classifyQueryIntent("Quiero hablar con un asesor").handoff], ["human_request", "immediate"]));
test("seña inmediata es strong action", () => assert.deepEqual([classifyQueryIntent("Quiero señarlo ahora").intent, classifyQueryIntent("Quiero señarlo ahora").handoff], ["strong_action", "immediate"]));

test("mínimos de campañas distintas no forman una operación", () => {
  const advance = resolvePlanFact({ targetModelId: "208", campaigns, factType: "delivery_advance" });
  const installment = resolvePlanFact({ targetModelId: "208", campaigns, factType: "installment_offer" });
  assert.deepEqual(assessMultiFactCombination([advance, installment]), { cross_campaign_combination: true, can_present_as_single_alternative: false, source_campaign_ids: ["plan-a", "plan-b"], warning: "DO_NOT_PRESENT_AS_SINGLE_OPERATION" });
  assert.ok(buildCommercialResponsePlan({ intent: "filter_answer", facts: [advance, installment] }).warnings.includes("DO_NOT_PRESENT_AS_SINGLE_OPERATION"));
});
test("misma campaña soporta una alternativa multi-fact", () => {
  const facts = ["delivery_advance", "installment_offer"].map(factType => resolvePlanFact({ targetModelId: "208", campaigns: [campaigns[0]], factType }));
  assert.equal(assessMultiFactCombination(facts).can_present_as_single_alternative, true);
});
test("response policy bloquea advance como subscription", () => {
  const advance = resolvePlanFact({ targetModelId: "208", campaigns, factType: "delivery_advance" });
  const plan = buildCommercialResponsePlan({ intent: "subscription_amount", answerFact: advance, nextFilterQuestion: "purchase_mode" });
  assert.equal(plan.answer_fact, null); assert.ok(plan.warnings.includes("SUBSCRIPTION_MUST_NOT_USE_DELIVERY_ADVANCE"));
});
test("response policy es estructurada y conserva una siguiente pregunta", () => {
  const fact = resolvePlanFact({ targetModelId: "208", campaigns, factType: "installment_offer" });
  const plan = buildCommercialResponsePlan({ intent: "installment_offer", answerFact: fact, nextFilterQuestion: "down_payment_amount" });
  assert.deepEqual([plan.answer_kind, plan.answer_fact.value, plan.commercial_framing_allowed, plan.next_filter_question], ["installment_offer", 450_000, true, "down_payment_amount"]);
});
test("commercial framing no requiere scarcity ni stock", () => assert.deepEqual(COMMERCIAL_COPY_GUARDS, { framing_required: true, scarcity_required: false, physical_stock_used: false, allowed_promotion_detail: "general_hook" }));

test("Tera es SUV compacto y nunca pickup", () => { const tera = findTechnicalModel("Volkswagen", "Tera"); assert.equal(tera.body_type, "compact_suv"); assert.notEqual(tera.body_type, "pickup"); });
test("vehículo propio no implica trade-in", () => { const state = registerOwnedVehicle(createFilterState(), { brand: "Volkswagen", model: "Amarok" }); assert.equal(state.has_trade_in.value, "unknown"); assert.equal(state.owned_vehicles[0].role, "owned_only"); });

test("pedido humano hace handoff immediate sin perfil", () => assert.deepEqual(decideHandoff({ explicitHumanRequest: true }).handoff_status, "immediate"));
test("acción fuerte hace handoff immediate", () => assert.deepEqual(decideHandoff({ strongAction: true }).next_action, "handoff"));
test("human owned suprime IA", () => assert.deepEqual(decideHandoff({ humanOwned: true }).next_action, "no_ai_response"));
test("DNC cierra y rutea", () => assert.deepEqual(decideHandoff({ doNotContact: true }).handoff_status, "closed_or_routed"));
test("perfil completo sin timing queda qualified ready cold", () => {
  const result = decideHandoff({ profileComplete: true, contactTiming: "unknown" });
  assert.deepEqual([result.qualification_status, result.handoff_status, result.contact_priority], ["qualified", "ready", "cold"]);
});
test("perfil financiado deriva score y acepta cero", () => {
  const provenance = { source: "customer_message" }; const state = createFilterState({ targetModel: "208", targetProvenance: provenance });
  state.purchase_mode = field("financed", "known", provenance); state.down_payment_amount = field(0, "known", provenance);
  state.monthly_installment_capacity = field(500_000, "known", provenance); state.has_trade_in = field("no", "known", provenance);
  assert.deepEqual([deriveCommercialProfile(state).complete, deriveCommercialProfile(state).component_score], [true, 1]);
});

const argentinaCalendar = { timeZone: "America/Argentina/Buenos_Aires", operatingWeekdays: [1, 2, 3, 4, 5, 6] };
test("viernes a sábado es warm", () => assert.equal(contactPriority({ timing: "future", eventAt: "2026-09-04T15:00:00Z", callbackAt: "2026-09-05T15:00:00Z", calendar: argentinaCalendar }), "warm"));
test("lunes a sábado es cold", () => assert.equal(contactPriority({ timing: "future", eventAt: "2026-08-31T15:00:00Z", callbackAt: "2026-09-05T15:00:00Z", calendar: argentinaCalendar }), "cold"));
