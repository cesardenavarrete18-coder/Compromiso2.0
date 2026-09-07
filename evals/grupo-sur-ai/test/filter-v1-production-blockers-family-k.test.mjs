import assert from "node:assert/strict";
import test from "node:test";
import { runV2Shadow } from "../../../supabase/functions/_shared/ai-v2-shadow/pipeline.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";

// Family K: Filter v1's approved contract is "ANSWER first + at most one logical
// filter question, or handoff" — but response-generator.mjs returned EITHER the
// resolved answer_fact OR the next question, never both, so the engine could
// correctly decide (e.g.) answer_fact=cuota + next_filter_question=purchase_mode
// and the candidate would only answer the cuota, silently stalling the filter.

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

async function drive({ state, extraction = {}, campaigns = [], message = "hola", lookupKnowledge } = {}) {
  const filterInput = { lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns, bank_offers: [], previous_filter_state: state, event_at: "2026-01-01T12:00:00Z" };
  const result = await runV2Shadow({
    env: { AI_V2_SHADOW_MODE: "true" },
    input: { lead: { id: "lead1" }, inboundMessage: { id: `m-${Math.random()}`, body: message, created_at: "2026-01-01T12:00:00Z" }, filterInput },
    repository: memoryRepo(),
    extractSemantic: async () => ({ extraction }),
    runFilter: runFilterV1Integration,
    ...(lookupKnowledge ? { lookupKnowledge } : {}),
    v1Decision: null,
  });
  assert.equal(result.status, "completed", JSON.stringify(result));
  return result.record;
}

test("Family K - 1: installment answered + purchase_mode still asked, exactly one question", async () => {
  const campaigns = [{ id: "c1", model_id: "208", active: true, final_price: 40370000, installment_amount: 431250 }];
  const record = await drive({ state: knownTarget(), extraction: { query_intent: "installment_offer" }, campaigns, message: "¿Qué cuota tiene?" });
  assert.equal(record.response_plan.next_filter_question, "purchase_mode");
  assert.match(record.v2_candidate_reply, /431\.250/);
  assert.match(record.v2_candidate_reply, /contado|financiado/i);
  assert.equal((record.v2_candidate_reply.match(/\?/g) ?? []).length, 1);
});

test("Family K - 2: model_value answered + purchase_mode still asked", async () => {
  const campaigns = [{ id: "c1", model_id: "208", active: true, final_price: 40370000 }];
  const record = await drive({ state: knownTarget(), extraction: { query_intent: "model_value" }, campaigns, message: "¿cuánto sale?" });
  assert.match(record.v2_candidate_reply, /40\.370\.000/);
  assert.match(record.v2_candidate_reply, /contado|financiado/i);
  assert.equal((record.v2_candidate_reply.match(/\?/g) ?? []).length, 1);
});

test("Family K - 3: delivery_advance answered + purchase_mode still asked", async () => {
  const campaigns = [{ id: "c1", model_id: "208", active: true, advance_amount: 4161000 }];
  const record = await drive({ state: knownTarget(), extraction: { query_intent: "delivery_advance" }, campaigns, message: "¿con cuánto lo retiro?" });
  assert.match(record.v2_candidate_reply, /4\.161\.000/);
  assert.match(record.v2_candidate_reply, /contado|financiado/i);
  assert.equal((record.v2_candidate_reply.match(/\?/g) ?? []).length, 1);
});

test("Family K - 4: financed + fact answered + down_payment still asked", async () => {
  const state = knownTarget();
  state.purchase_mode = field("financed", "known", prov);
  const campaigns = [{ id: "c1", model_id: "208", active: true, final_price: 40370000 }];
  const record = await drive({ state, extraction: { query_intent: "model_value" }, campaigns, message: "¿cuánto sale?" });
  assert.equal(record.response_plan.next_filter_question, "down_payment_amount");
  assert.match(record.v2_candidate_reply, /40\.370\.000/);
  assert.match(record.v2_candidate_reply, /entrega inicial/i);
  assert.equal((record.v2_candidate_reply.match(/\?/g) ?? []).length, 1);
});

test("Family K - 5: financed + anticipo conocido + fact answered + monthly capacity still asked", async () => {
  const state = knownTarget();
  state.purchase_mode = field("financed", "known", prov);
  state.down_payment_amount = field(4000000, "known", prov);
  const campaigns = [{ id: "c1", model_id: "208", active: true, installment_amount: 431250 }];
  const record = await drive({ state, extraction: { query_intent: "installment_offer" }, campaigns, message: "¿qué cuota tiene?" });
  assert.equal(record.response_plan.next_filter_question, "monthly_installment_capacity");
  assert.match(record.v2_candidate_reply, /431\.250/);
  assert.match(record.v2_candidate_reply, /por mes/i);
  assert.equal((record.v2_candidate_reply.match(/\?/g) ?? []).length, 1);
});

test("Family K - 6: technical answer + next logical question composed together", async () => {
  const record = await drive({
    state: knownTarget(),
    extraction: { query_intent: "technical_question" },
    message: "¿qué motor tiene?",
    lookupKnowledge: async () => [{ type: "technical_documentation", value: "Motor 1.6 verificado", source: "ai_knowledge_documents" }],
  });
  assert.equal(record.response_plan.next_filter_question, "purchase_mode");
  assert.match(record.v2_candidate_reply, /1\.6/);
  assert.match(record.v2_candidate_reply, /contado|financiado/i);
  assert.equal((record.v2_candidate_reply.match(/\?/g) ?? []).length, 1);
});

test("Family K - 7: wouldHandoff=true never adds a filter question, even with a resolved fact", async () => {
  const state = knownTarget();
  state.purchase_mode = field("cash", "known", prov);
  state.has_trade_in = field("no", "known", prov);
  state.contact_preference = { timing: "now", literal: "ahora", callback_at: null, callback_window: null, asked_once: false };
  const campaigns = [{ id: "c1", model_id: "208", active: true, final_price: 40370000 }];
  const record = await drive({ state, extraction: { query_intent: "model_value" }, campaigns, message: "¿cuánto sale?" });
  assert.equal(record.would_handoff, true);
  assert.match(record.v2_candidate_reply, /40\.370\.000/);
  assert.match(record.v2_candidate_reply, /derivar tu consulta/i);
  assert.equal((record.v2_candidate_reply.match(/\?/g) ?? []).length, 0);
});

test("Family K - 8: closed/suppressed (human mode) never asks a question", async () => {
  const record = await drive({ state: knownTarget(), extraction: { query_intent: "model_value" }, message: "¿cuánto sale?" });
  // simulate the actual suppression path directly, mirroring pipeline.mjs's own humanMode gate
  const suppressed = (await import("../../../supabase/functions/_shared/ai-v2-shadow/response-generator.mjs")).generateCandidateReply({ humanMode: true, currentMessage: "¿cuánto sale?" });
  assert.equal(suppressed.text, null);
  assert.equal(suppressed.question_count, 0);
  assert.ok(record); // sanity: the normal path above still completes
});
