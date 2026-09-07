import assert from "node:assert/strict";
import test from "node:test";
import { runV2Shadow } from "../../../supabase/functions/_shared/ai-v2-shadow/pipeline.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";

// Family N: filter-v1-engine.mjs gated DNC on
//   Boolean(lead.do_not_contact) || extraction.noncommercial === true
// and, on a DNC turn, only ever set state.dnc_acknowledged — never a
// state.do_not_contact flag recording that THIS conversation's own state is
// now in DNC. So turn 2, with no fresh noncommercial signal and no CRM
// do_not_contact flag (lead.do_not_contact still false — the CRM side of this
// is a separate, slower write path not modeled here), resumed the normal
// commercial flow: exactly the multi-turn contract violation Family M was
// supposed to close. previous_filter_state (next_state threaded turn to turn,
// same mechanism whatsapp-adapter.mjs uses in production) is the only thing
// that should need to carry this — no dependency on the CRM or on the
// extractor re-flagging the same conversation every turn.

const catalog = { brands: [{ id: "b1", name: "Peugeot" }], models: [{ id: "208", name: "208", brand_id: "b1" }], model_versions: [] };
const prov = { source: "test_fixture", evidence: null };

function partialProfile() {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b1", brand: "Peugeot", model_id: "208", model: "208" }, "known", prov);
  return state;
}

function completeProfile() {
  const state = partialProfile();
  state.purchase_mode = field("financed", "known", prov);
  state.down_payment_amount = field(4000000, "known", prov);
  state.monthly_installment_capacity = field(400000, "known", prov);
  state.has_trade_in = field("no", "known", prov);
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

test("Family N - 1: first DNC turn still gets a single acknowledgment", async () => {
  const record = await turn({ state: partialProfile(), extraction: { noncommercial: true }, message: "No me contacten." });
  assert.equal(record.response_plan.dnc_first_ack, true);
  assert.ok(record.v2_candidate_reply);
  assert.equal(record.would_suppress_for_dnc, false);
  assert.equal(record.next_state.do_not_contact, true, "the conversation's own state must record DNC, not just dnc_acknowledged");
});

test("Family N - 2 (red->green): a later message with NO fresh DNC signal and no CRM flag stays suppressed via persisted state", async () => {
  const first = await turn({ state: partialProfile(), extraction: { noncommercial: true }, message: "No me contacten." });
  const second = await turn({ state: first.next_state, extraction: {}, message: "hola" });
  assert.equal(second.handoff_decision.handoff_status, "closed_or_routed");
  assert.equal(second.candidate_reply_status, "suppressed_dnc");
  assert.equal(second.v2_candidate_reply, null);
  assert.equal(second.would_suppress_for_dnc, true);
  assert.equal(second.would_handoff, false);
  assert.equal((second.v2_candidate_reply ?? "").match(/\?/g), null);
});

test("Family N - 3: a third message, still with no fresh DNC signal, remains suppressed", async () => {
  const first = await turn({ state: partialProfile(), extraction: { noncommercial: true }, message: "No me contacten." });
  const second = await turn({ state: first.next_state, extraction: {}, message: "hola" });
  const third = await turn({ state: second.next_state, extraction: {}, message: "sigo viendo el 208" });
  assert.equal(third.candidate_reply_status, "suppressed_dnc");
  assert.equal(third.v2_candidate_reply, null);
  assert.equal(third.would_suppress_for_dnc, true);
  assert.equal(third.response_plan.dnc_first_ack, false, "no second acknowledgment");
});

test("Family N - 4: lead.do_not_contact=true from the CRM still suppresses (independent path, unaffected by this fix)", async () => {
  const record = await turn({ state: partialProfile(), extraction: {}, message: "hola", lead: { do_not_contact: true } });
  assert.equal(record.candidate_reply_status, "ready"); // first observation by shadow of a pre-existing CRM flag: first_ack
  assert.equal(record.response_plan.dnc_first_ack, true);
  assert.equal(record.next_state.do_not_contact, true);
});

test("Family N - 5: DNC and an explicit human request in the same turn - DNC wins", async () => {
  const record = await turn({ state: partialProfile(), extraction: { noncommercial: true, human_request: true }, message: "no me contacten, che, pasame con un asesor" });
  assert.equal(record.handoff_decision.handoff_status, "closed_or_routed");
  assert.equal(record.would_handoff, false);
});

test("Family N - 6: DNC and a strong action in the same turn - DNC wins", async () => {
  const record = await turn({ state: partialProfile(), extraction: { noncommercial: true, strong_action: true }, message: "no me contacten, ya te transfiero la seña" });
  assert.equal(record.handoff_decision.handoff_status, "closed_or_routed");
  assert.equal(record.would_handoff, false);
});

test("Family N - 7: DNC on an otherwise-complete, ready-for-handoff profile - DNC wins", async () => {
  const record = await turn({ state: completeProfile(), extraction: { noncommercial: true }, message: "no me contacten más" });
  assert.equal(record.handoff_decision.handoff_status, "closed_or_routed");
  assert.equal(record.would_handoff, false);
});

test("Family N - persisted DNC also overrides a fresh human_request/strong_action/complete-profile turn later, with no fresh DNC signal", async () => {
  const first = await turn({ state: completeProfile(), extraction: { noncommercial: true }, message: "no me contacten" });
  const second = await turn({ state: first.next_state, extraction: { human_request: true }, message: "che, pasame con un asesor" });
  assert.equal(second.handoff_decision.handoff_status, "closed_or_routed", "DNC must not be forgotten just because a later turn looks like a handoff trigger");
  assert.equal(second.would_handoff, false);
  assert.equal(second.candidate_reply_status, "suppressed_dnc");
});
