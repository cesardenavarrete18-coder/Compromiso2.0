import assert from "node:assert/strict";
import test from "node:test";
import { runV2Shadow } from "../../../supabase/functions/_shared/ai-v2-shadow/pipeline.mjs";
import { decideHandoff } from "../../../supabase/functions/_shared/filter-v1/handoff-policy.mjs";

// Family I: pipeline.mjs computed would_handoff as
//   handoff_status === "requested" || handoff === true
// but decideHandoff() (the real, only producer of handoff_decision in this
// codebase) never returns handoff_status="requested" and never sets a
// `handoff` boolean at all — its real contract is:
//   handoff_status ∈ {human_owned, closed_or_routed, immediate, ready, not_ready}
// and the actual intent to hand off is next_action === "handoff". So the old
// condition was always false, for every input, unconditionally.

const targetState = { target_model: { status: "known", value: { model_id: "208", model: "Peugeot 208", brand: "Peugeot" } }, has_trade_in: { status: "unknown", value: null } };

function memoryRepo() {
  const runs = new Map();
  return {
    async claim(mid, lid) { if (runs.has(mid)) return { created: false, run: runs.get(mid) }; const run = { id: mid, lead_id: lid }; runs.set(mid, run); return { created: true, run }; },
    async complete(id, record) { runs.set(id, { ...runs.get(id), ...record }); },
    async fail(id, record) { runs.set(id, { ...runs.get(id), ...record }); },
  };
}

// A response_plan shaped like the real engine's (no `.prompt` key at all —
// only filter-v1-engine.mjs's real output shape has next_filter_question),
// so a wrongly-false would_handoff would fall through response-generator's
// hardcoded "¿En qué modelo estás interesado?" fallback instead of the
// derivation copy — exactly the failure mode Family I describes.
function runWithHandoff(handoffParams, message = "quiero que me contacte un asesor") {
  const handoff_decision = decideHandoff(handoffParams);
  return runV2Shadow({
    env: { AI_V2_SHADOW_MODE: "true" },
    input: {
      lead: { id: "lead1" },
      inboundMessage: { id: `m-${JSON.stringify(handoffParams)}`, body: message, created_at: "2026-01-01T00:00:00Z" },
      filterInput: { lead: {}, catalog: [], campaigns: [], bank_offers: [], conversation_control: { mode: "ai" } },
    },
    repository: memoryRepo(),
    extractSemantic: async () => ({ extraction: { trade_in_intent: "not_present", evidence: {} } }),
    runFilter: () => ({ status: "ok", next_state: targetState, response_plan: { next_filter_question: null }, handoff_decision, resolved_facts: [], warnings: [] }),
    v1Decision: null,
  });
}

test("Family I - 1: explicit human request is immediate handoff and must set would_handoff=true", async () => {
  const { record } = await runWithHandoff({ explicitHumanRequest: true });
  assert.equal(record.handoff_decision.handoff_status, "immediate");
  assert.equal(record.handoff_decision.next_action, "handoff");
  assert.equal(record.would_handoff, true);
  assert.equal(record.v2_candidate_reply.includes("?"), false, "handoff reply must not ask a new commercial question");
});

test("Family I - 2: strong action is immediate handoff and must set would_handoff=true", async () => {
  const { record } = await runWithHandoff({ strongAction: true });
  assert.equal(record.handoff_decision.handoff_status, "immediate");
  assert.equal(record.handoff_decision.next_action, "handoff");
  assert.equal(record.would_handoff, true);
  assert.equal(record.v2_candidate_reply.includes("?"), false);
});

test("Family I - 3: complete profile with known contact timing is a ready handoff and must set would_handoff=true", async () => {
  const { record } = await runWithHandoff({ profileComplete: true, contactTiming: "morning" });
  assert.equal(record.handoff_decision.handoff_status, "ready");
  assert.equal(record.handoff_decision.next_action, "handoff");
  assert.equal(record.would_handoff, true);
});

test("Family I - 4: complete profile with unknown contact timing must NOT be a handoff", async () => {
  const { record } = await runWithHandoff({ profileComplete: true, contactTiming: "unknown" });
  assert.equal(record.handoff_decision.handoff_status, "ready");
  assert.equal(record.handoff_decision.next_action, "complete_filter");
  assert.equal(record.would_handoff, false);
});

test("Family I - 5a: closed_or_routed (do-not-contact / noncommercial) must NOT be interpreted as a new commercial handoff", async () => {
  const { record } = await runWithHandoff({ doNotContact: true });
  assert.equal(record.handoff_decision.handoff_status, "closed_or_routed");
  assert.equal(record.handoff_decision.next_action, "close_or_route_noncommercial");
  assert.equal(record.would_handoff, false);
});

test("Family I - 5b: human_owned must NOT be interpreted as a new commercial handoff", async () => {
  const { record } = await runWithHandoff({ humanOwned: true });
  assert.equal(record.handoff_decision.handoff_status, "human_owned");
  assert.equal(record.handoff_decision.next_action, "no_ai_response");
  assert.equal(record.would_handoff, false);
});

test("Family I - 6: not_ready (incomplete profile) must NOT be a handoff", async () => {
  const { record } = await runWithHandoff({});
  assert.equal(record.handoff_decision.handoff_status, "not_ready");
  assert.equal(record.handoff_decision.next_action, "ask_next_missing_component");
  assert.equal(record.would_handoff, false);
});
