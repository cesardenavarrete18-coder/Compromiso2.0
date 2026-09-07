import assert from "node:assert/strict";
import test from "node:test";
import { runV2Shadow } from "../../../supabase/functions/_shared/ai-v2-shadow/pipeline.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";

// Deterministic multi-turn replay requested for the final validation pass,
// covering Families K, L, M and N together across one continuous conversation
// (same lead, state threaded turn to turn via next_state, exactly as
// whatsapp-adapter.mjs threads previous_filter_state in production):
//
//   1. cuota question -> answer + modality question (Family K)
//   2. profile completes -> contact preference asked once (Family L)
//   3. no timing answer -> not repeated (Family L)
//   4. DNC -> brief acknowledgment (Family M)
//   5. next message with NO fresh DNC signal at all -> still suppressed,
//      because state.do_not_contact was persisted (Family N), not because
//      the message repeats the phrase or the CRM flag caught up

const catalog = { brands: [{ id: "b1", name: "Peugeot" }], models: [{ id: "208", name: "208", brand_id: "b1" }], model_versions: [] };
const campaigns = [{ id: "c1", model_id: "208", active: true, installment_amount: 431250 }];
const prov = { source: "test_fixture", evidence: null };

function memoryRepo() {
  const runs = new Map();
  return {
    async claim(mid, lid) { if (runs.has(mid)) return { created: false, run: runs.get(mid) }; const run = { id: mid, lead_id: lid }; runs.set(mid, run); return { created: true, run }; },
    async complete(id, record) { runs.set(id, { ...runs.get(id), ...record }); },
    async fail(id, record) { runs.set(id, { ...runs.get(id), ...record }); },
  };
}

async function turn({ state, extraction = {}, message, lead = {} }) {
  const filterInput = { lead, conversation_control: { mode: "ai" }, catalog, campaigns, bank_offers: [], previous_filter_state: state, event_at: "2026-01-05T15:00:00Z" };
  const result = await runV2Shadow({
    env: { AI_V2_SHADOW_MODE: "true" },
    input: { lead: { id: "lead-replay", ...lead }, inboundMessage: { id: `m-${Math.random()}`, body: message, created_at: "2026-01-05T15:00:00Z" }, filterInput },
    repository: memoryRepo(),
    extractSemantic: async () => ({ extraction }),
    runFilter: runFilterV1Integration,
    v1Decision: null,
  });
  assert.equal(result.status, "completed", JSON.stringify(result));
  return result.record;
}

test("multi-turn replay: cuota -> profile completes -> contact pending -> DNC ack -> DNC suppressed", async () => {
  let state = createFilterState();
  state.target_model = field({ brand_id: "b1", brand: "Peugeot", model_id: "208", model: "208" }, "known", prov);

  // 1. cuota question -> answer + modality question (Family K)
  const t1 = await turn({ state, extraction: { query_intent: "installment_offer" }, message: "¿Qué cuota tiene?" });
  assert.match(t1.v2_candidate_reply, /431\.250/);
  assert.match(t1.v2_candidate_reply, /contado|financiado/i);
  assert.equal((t1.v2_candidate_reply.match(/\?/g) ?? []).length, 1);
  state = t1.next_state;

  // 2. customer answers modality + trade-in in one go -> profile completes,
  // timing still unknown -> contact preference asked exactly once (Family L - E)
  const t2 = await turn({
    state,
    extraction: { extracted_fields: { purchase_mode: "financed", down_payment_amount: 4000000, monthly_installment_capacity: 400000, has_trade_in: "no" } },
    message: "Financiado, sin entrega de usado.",
  });
  assert.equal(t2.response_plan.next_filter_question, "contact_preference");
  assert.match(t2.v2_candidate_reply, /horario/i);
  assert.equal((t2.v2_candidate_reply.match(/\?/g) ?? []).length, 1);
  assert.equal(t2.next_state.contact_preference.asked_once, true);
  state = t2.next_state;

  // 3. customer does not answer timing -> not repeated (Family L - F)
  const t3 = await turn({ state, extraction: {}, message: "Necesito pensarlo un poco más." });
  assert.notEqual(t3.response_plan.next_filter_question, "contact_preference");
  assert.equal((t3.v2_candidate_reply.match(/\?/g) ?? []).length, 0);
  assert.equal(t3.handoff_decision.qualification_status, "qualified");
  assert.equal(t3.handoff_decision.handoff_status, "ready");
  state = t3.next_state;

  // 4. DNC -> brief acknowledgment, never a commercial handoff (Family M)
  const t4 = await turn({ state, extraction: { noncommercial: true }, message: "No me contacten más." });
  assert.equal(t4.handoff_decision.handoff_status, "closed_or_routed");
  assert.equal(t4.would_handoff, false);
  assert.equal(t4.response_plan.dnc_first_ack, true);
  assert.ok(t4.v2_candidate_reply);
  assert.equal(t4.would_suppress_for_dnc, false);
  state = t4.next_state;

  // 5. next message with NO fresh DNC signal at all (Family N: DNC must stay
  // suppressed via previous_filter_state, not because the message repeats it
  // or the CRM flag caught up) -> suppressed, no repeat ack, no question
  const t5 = await turn({ state, extraction: {}, message: "Hola, sigo interesado." });
  assert.equal(t5.next_state.do_not_contact, true, "DNC must persist in the conversation's own state");
  assert.equal(t5.response_plan.dnc_first_ack, false);
  assert.equal(t5.candidate_reply_status, "suppressed_dnc");
  assert.equal(t5.v2_candidate_reply, null);
  assert.equal(t5.would_suppress_for_dnc, true);
  assert.equal(t5.would_handoff, false);
});
