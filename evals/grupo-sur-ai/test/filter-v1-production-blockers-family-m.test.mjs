import assert from "node:assert/strict";
import test from "node:test";
import { runV2Shadow } from "../../../supabase/functions/_shared/ai-v2-shadow/pipeline.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";
import { decideHandoff } from "../../../supabase/functions/_shared/filter-v1/handoff-policy.mjs";

// Family M: DNC is a safety invariant. The extractor/sanitizer already
// recognize more DNC variants than the Composer's own local regex did — and
// the Composer could disagree with what the engine had already decided
// (handoff_status="closed_or_routed" / next_action="close_or_route_noncommercial"),
// deciding DNC purely from its own pattern instead of trusting the real
// decision. These tests assume the extractor/sanitizer have already recognized
// each phrase (current_extraction.noncommercial=true) — that recognition itself
// is out of scope (LLM/sanitizer, Family F territory); what is in scope is that
// the engine and Composer act on it correctly and consistently.

const catalog = { brands: [{ id: "b1", name: "Peugeot" }], models: [{ id: "208", name: "208", brand_id: "b1" }], model_versions: [] };
const prov = { source: "test_fixture", evidence: null };

function partialProfile() {
  const state = createFilterState();
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

async function turn({ state, extraction = {}, message = "hola", lead = {} }) {
  const filterInput = { lead, conversation_control: { mode: "ai" }, catalog, campaigns: [], bank_offers: [], previous_filter_state: state, event_at: "2026-01-01T12:00:00Z" };
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

for (const message of ["No me escriban más.", "No me contacten.", "Bórrenme.", "No quiero recibir mensajes."]) {
  test(`Family M - "${message}": engine-detected DNC closes the turn, asks nothing, never a commercial handoff`, async () => {
    const record = await turn({ state: partialProfile(), extraction: { noncommercial: true }, message });
    assert.equal(record.handoff_decision.handoff_status, "closed_or_routed");
    assert.equal(record.handoff_decision.next_action, "close_or_route_noncommercial");
    assert.equal(record.would_handoff, false, "DNC must never become a new commercial handoff");
    assert.equal((record.v2_candidate_reply ?? "").match(/\?/g), null, "no filter question on a DNC turn");
  });
}

test("Family M - precedence: DNC overrides an explicit human request in the same turn", async () => {
  const record = await turn({ state: partialProfile(), extraction: { noncommercial: true, human_request: true }, message: "no me contacten, quiero hablar con un asesor" });
  assert.equal(record.handoff_decision.handoff_status, "closed_or_routed");
  assert.equal(record.would_handoff, false, "DNC precedes explicit human request / strong action");
});

test("Family M - precedence: DNC overrides a complete profile that would otherwise be ready for handoff", async () => {
  const state = partialProfile();
  state.purchase_mode = field("financed", "known", prov);
  state.down_payment_amount = field(4000000, "known", prov);
  state.monthly_installment_capacity = field(400000, "known", prov);
  state.has_trade_in = field("no", "known", prov);
  const record = await turn({ state, extraction: { noncommercial: true }, message: "no me escriban más" });
  assert.equal(record.handoff_decision.handoff_status, "closed_or_routed");
  assert.equal(record.would_handoff, false);
});

test("Family M - multiturn: first DNC turn gets a brief acknowledgment and marks dnc_acknowledged", async () => {
  const record = await turn({ state: partialProfile(), extraction: { noncommercial: true }, message: "no me escriban más" });
  assert.equal(record.response_plan.dnc_first_ack, true);
  assert.equal(record.candidate_reply_status, "ready");
  assert.ok(record.v2_candidate_reply, "a brief acknowledgment is allowed on the first DNC turn");
  assert.equal(record.would_suppress_for_dnc, false, "the ack turn itself is not a suppression turn");
  assert.equal(record.next_state.dnc_acknowledged, true);
});

test("Family M - multiturn: a later DNC-context message keeps DNC, suppresses the candidate, no repeat ack, no question, no new handoff", async () => {
  const first = await turn({ state: partialProfile(), extraction: { noncommercial: true }, message: "no me escriban más" });
  const second = await turn({ state: first.next_state, extraction: { noncommercial: true }, message: "en serio, dejen de escribirme" });
  assert.equal(second.response_plan.dnc_first_ack, false);
  assert.equal(second.candidate_reply_status, "suppressed_dnc");
  assert.equal(second.v2_candidate_reply, null, "the reply must be suppressed, not a repeated acknowledgment");
  assert.equal(second.would_suppress_for_dnc, true);
  assert.equal(second.would_handoff, false);
});

test("Family M - lead.do_not_contact persisted on the CRM record suppresses DNC even when the new message does not repeat it, without relying on V1 re-detecting the text", async () => {
  const record = await turn({ state: partialProfile(), extraction: {}, message: "hola, sigo interesado", lead: { do_not_contact: true } });
  assert.equal(record.handoff_decision.handoff_status, "closed_or_routed");
  assert.equal(record.would_handoff, false);
  assert.equal((record.v2_candidate_reply ?? "").match(/\?/g), null);
});

test("Family M - the engine's own decideHandoff contract for DNC is what response_plan.handoff carries (sanity, no composer regex involved)", () => {
  const handoff = decideHandoff({ doNotContact: true });
  assert.equal(handoff.handoff_status, "closed_or_routed");
  assert.equal(handoff.next_action, "close_or_route_noncommercial");
});
