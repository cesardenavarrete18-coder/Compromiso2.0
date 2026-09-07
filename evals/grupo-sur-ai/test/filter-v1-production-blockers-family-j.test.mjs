import assert from "node:assert/strict";
import test from "node:test";
import { runV2Shadow } from "../../../supabase/functions/_shared/ai-v2-shadow/pipeline.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";

// Family J: response-generator.mjs consumed a `responsePlan.prompt` field that
// the real engine (buildCommercialResponsePlan in commercial-response-policy.mjs)
// never produces, and re-guessed commercial intent from regexes over the raw
// message instead of consuming responsePlan.answer_kind/answer_fact/
// next_filter_question/handoff. Every test below drives the REAL engine
// (runFilterV1Integration, via pipeline.mjs's runFilter) to produce a real
// responsePlan, then lets the real generateCandidateReply (via pipeline.mjs's
// default responseGenerator) compose from it — never a hand-fabricated
// `{ prompt: "..." }` object, which is exactly what hid this bug in the
// original PR39 test suite.

const catalog = { brands: [{ id: "b1", name: "Peugeot" }], models: [{ id: "208", name: "208", brand_id: "b1" }], model_versions: [] };
const prov = { source: "test_fixture", evidence: null };

function knownTarget(state = createFilterState()) {
  state.target_model = field({ brand_id: "b1", brand: "Peugeot", model_id: "208", model: "208" }, "known", prov);
  return state;
}

function memoryRepo() {
  const runs = new Map();
  return {
    async claim(mid, lid) { if (runs.has(mid)) return { created: false, run: runs.get(mid) }; const run = { id: mid, lead_id: lid }; runs.set(mid, run); return { created: true, run }; },
    async complete(id, record) { runs.set(id, { ...runs.get(id), ...record }); },
    async fail(id, record) { runs.set(id, { ...runs.get(id), ...record }); },
  };
}

// Drives the REAL engine end-to-end through the REAL pipeline (runFilter =
// runFilterV1Integration itself; only the LLM extraction step is stubbed,
// returning a directly-constructed extraction — there is no network in tests).
async function drive({ state, extraction = {}, campaigns = [], message = "hola", lead = {} }) {
  const filterInput = { lead, conversation_control: { mode: "ai" }, catalog, campaigns, bank_offers: [], previous_filter_state: state, event_at: "2026-01-01T12:00:00Z" };
  const result = await runV2Shadow({
    env: { AI_V2_SHADOW_MODE: "true" },
    input: { lead: { id: "lead1", ...lead }, inboundMessage: { id: `m-${Math.random()}`, body: message, created_at: "2026-01-01T12:00:00Z" }, filterInput },
    repository: memoryRepo(),
    extractSemantic: async () => ({ extraction }),
    runFilter: runFilterV1Integration,
    v1Decision: null,
  });
  assert.equal(result.status, "completed", JSON.stringify(result));
  return result.record;
}

test("Family J - 1 CUOTA: installment_offer must answer with the cuota, never the total price", async () => {
  const campaigns = [{ id: "c1", model_id: "208", active: true, final_price: 40370000, installment_amount: 431250 }];
  const record = await drive({ state: knownTarget(), extraction: { query_intent: "installment_offer" }, campaigns, message: "¿Qué cuota tiene?" });
  assert.equal(record.response_plan.answer_kind, "installment_offer");
  assert.equal(record.response_plan.answer_fact.fact_type, "installment_offer");
  assert.match(record.v2_candidate_reply, /431\.250/);
  assert.doesNotMatch(record.v2_candidate_reply, /40\.370\.000/);
});

test("Family J - 2 PRECIO: model_value must use answer_fact of model_reference_value", async () => {
  const campaigns = [{ id: "c1", model_id: "208", active: true, final_price: 40370000, installment_amount: 431250 }];
  const record = await drive({ state: knownTarget(), extraction: { query_intent: "model_value" }, campaigns, message: "¿Cuánto sale?" });
  assert.equal(record.response_plan.answer_fact.fact_type, "model_reference_value");
  assert.match(record.v2_candidate_reply, /40\.370\.000/);
});

test("Family J - 3 ANTICIPO DE RETIRO: delivery_advance must use its own answer_fact, not a generic question", async () => {
  const campaigns = [{ id: "c1", model_id: "208", active: true, advance_amount: 4161000 }];
  const record = await drive({ state: knownTarget(), extraction: { query_intent: "delivery_advance" }, campaigns, message: "¿Con cuánto lo retiro?" });
  assert.equal(record.response_plan.answer_fact.fact_type, "delivery_advance");
  assert.match(record.v2_candidate_reply, /4\.161\.000/);
  assert.doesNotMatch(record.v2_candidate_reply, /En qué modelo/i);
});

test("Family J - 4 modelo ya conocido + purchase_mode faltante: pregunta modalidad, no vuelve a preguntar el modelo", async () => {
  const record = await drive({ state: knownTarget(), extraction: {}, message: "hola" });
  assert.equal(record.response_plan.next_filter_question, "purchase_mode");
  assert.doesNotMatch(record.v2_candidate_reply, /modelo/i);
  assert.match(record.v2_candidate_reply, /contado|financiado/i);
});

test("Family J - 5 FINANCED + anticipo faltante: pregunta la entrega inicial", async () => {
  const state = knownTarget();
  state.purchase_mode = field("financed", "known", prov);
  const record = await drive({ state, extraction: {}, message: "hola" });
  assert.equal(record.response_plan.next_filter_question, "down_payment_amount");
  assert.match(record.v2_candidate_reply, /entrega inicial/i);
});

test("Family J - 6 FINANCED + anticipo conocido + capacidad mensual faltante: pregunta la cuota mensual", async () => {
  const state = knownTarget();
  state.purchase_mode = field("financed", "known", prov);
  state.down_payment_amount = field(4000000, "known", prov);
  const record = await drive({ state, extraction: {}, message: "hola" });
  assert.equal(record.response_plan.next_filter_question, "monthly_installment_capacity");
  assert.match(record.v2_candidate_reply, /por mes/i);
});

test("Family J - 7 has_trade_in faltante: pregunta si entrega usado", async () => {
  const state = knownTarget();
  state.purchase_mode = field("financed", "known", prov);
  state.down_payment_amount = field(4000000, "known", prov);
  state.monthly_installment_capacity = field(400000, "known", prov);
  const record = await drive({ state, extraction: {}, message: "hola" });
  assert.equal(record.response_plan.next_filter_question, "has_trade_in");
  assert.match(record.v2_candidate_reply, /entregar como parte de pago/i);
});

test("Family J - 8 trade-in yes con datos incompletos: respeta next_filter_question real (brand/model/variant/year/km)", async () => {
  const state = knownTarget();
  state.purchase_mode = field("financed", "known", prov);
  state.down_payment_amount = field(4000000, "known", prov);
  state.monthly_installment_capacity = field(400000, "known", prov);
  state.has_trade_in = field("yes", "known", prov);
  state.trade_in_vehicle.brand = field("Volkswagen", "known", prov);
  state.trade_in_vehicle.model = field("Gol", "known", prov);
  // variant/year/km left missing
  const record = await drive({ state, extraction: {}, message: "hola" });
  assert.equal(record.response_plan.next_filter_question, "trade_in_variant");
  assert.match(record.v2_candidate_reply, /versión/i);
});

test("Family J - 9 ambiguous_initial_amount: una única pregunta que distingue monto inicial de anticipo de retiro", async () => {
  const record = await drive({ state: knownTarget(), extraction: { query_intent: "ambiguous_initial_amount" }, message: "con cuanto puedo entrar" });
  assert.equal(record.response_plan.next_filter_question, "clarify_initial_amount_intent");
  assert.doesNotMatch(record.v2_candidate_reply, /subscription_amount/i);
  assert.equal((record.v2_candidate_reply.match(/\?/g) ?? []).length, 1);
  assert.match(record.v2_candidate_reply, /arrancar el plan/i);
  assert.match(record.v2_candidate_reply, /anticipo/i);
});

test("Family J - 10a HANDOFF inmediato: sin nueva pregunta de filtrado, copy de derivación", async () => {
  const record = await drive({ state: knownTarget(), extraction: { human_request: true }, message: "quiero que me llame un asesor" });
  assert.equal(record.response_plan.handoff, "immediate");
  assert.equal(record.would_handoff, true);
  assert.match(record.v2_candidate_reply, /derivar tu consulta/i);
  assert.equal((record.v2_candidate_reply.match(/\?/g) ?? []).length, 0);
});

test("Family J - 10b HANDOFF ready con fact resuelto: preserva la respuesta y no agrega pregunta nueva", async () => {
  const state = knownTarget();
  state.purchase_mode = field("cash", "known", prov);
  state.has_trade_in = field("no", "known", prov);
  state.contact_preference = { timing: "morning", literal: "a la mañana", callback_at: null, callback_window: null, asked_once: true };
  const campaigns = [{ id: "c1", model_id: "208", active: true, final_price: 40370000 }];
  const record = await drive({ state, extraction: { query_intent: "model_value" }, campaigns, message: "¿cuánto sale?" });
  assert.equal(record.handoff_decision.next_action, "handoff");
  assert.equal(record.would_handoff, true);
  assert.match(record.v2_candidate_reply, /40\.370\.000/, "the already-resolved fact must be preserved, not dropped");
  assert.match(record.v2_candidate_reply, /derivar tu consulta/i);
  assert.doesNotMatch(record.v2_candidate_reply, /horario/i, "must not ask the now-suppressed contact_preference filter question");
});

test("Family J - 11 TECHNICAL: sigue usando exclusivamente conocimiento autorizado", async () => {
  const record = await runV2Shadow({
    env: { AI_V2_SHADOW_MODE: "true" },
    input: {
      lead: { id: "lead1" },
      inboundMessage: { id: "m-tech", body: "¿qué motor tiene?", created_at: "2026-01-01T12:00:00Z" },
      filterInput: { lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns: [], bank_offers: [], previous_filter_state: knownTarget(), event_at: "2026-01-01T12:00:00Z" },
    },
    repository: memoryRepo(),
    extractSemantic: async () => ({ extraction: { query_intent: "technical_question" } }),
    runFilter: runFilterV1Integration,
    lookupKnowledge: async () => [{ type: "technical_documentation", value: "Motor 1.6 verificado", source: "ai_knowledge_documents" }],
    v1Decision: null,
  }).then(r => r.record);
  assert.equal(record.knowledge_request.fact_type, "technical_knowledge");
  assert.match(record.v2_candidate_reply, /1\.6/);
});

test("Family J - 12 ONE QUESTION: toda salida generada arriba tiene a lo sumo una pregunta conceptual", async () => {
  const cases = [
    await drive({ state: knownTarget(), extraction: {}, message: "hola" }),
    await (async () => { const s = knownTarget(); s.purchase_mode = field("financed", "known", prov); return drive({ state: s, extraction: {}, message: "hola" }); })(),
    await drive({ state: knownTarget(), extraction: { query_intent: "ambiguous_initial_amount" }, message: "con cuanto entro" }),
  ];
  for (const record of cases) assert.ok((record.v2_candidate_reply.match(/\?/g) ?? []).length <= 1, record.v2_candidate_reply);
});
