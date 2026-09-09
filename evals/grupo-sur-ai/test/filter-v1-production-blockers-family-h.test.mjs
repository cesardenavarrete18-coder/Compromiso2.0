import assert from "node:assert/strict";
import test from "node:test";
import { runV2Shadow } from "../../../supabase/functions/_shared/ai-v2-shadow/pipeline.mjs";
import { decideShadowScheduling } from "../../../supabase/functions/_shared/ai-v2-shadow/scheduler.mjs";

// Family H: the webhook's mid-analysis takeover branch always fed shadow the
// INITIAL conversationControl read (mode="ai"), never the fresh post-analysis one
// that actually detected the human takeover (mode="human"). Shadow then computed
// as if no human were present: it could produce a candidate reply and record
// would_suppress_for_human=false, exactly backwards from reality — corrupting the
// telemetry a promotion decision would rely on. V1 itself was never affected (it
// already suppresses correctly on controlAfterAnalysis), only shadow's own record.

const targetState = () => ({ target_model: { status: "known", value: { model_id: "208", model: "Peugeot 208", brand: "Peugeot" } }, has_trade_in: { status: "unknown", value: null } });
const fakeEngine = input => ({ status: input.conversation_control?.mode === "human" ? "suppressed" : "ok", next_state: input.previous_filter_state ?? targetState(), response_plan: { prompt: "¿Cómo pensás comprarlo?" }, handoff_decision: {}, resolved_facts: [], warnings: [] });
const fakeSemantic = async () => ({ extraction: { trade_in_intent: "not_present", evidence: {} } });
function memoryRepo() {
  const runs = new Map();
  return {
    runs,
    async claim(mid, lid) { if (runs.has(mid)) return { created: false, run: runs.get(mid) }; const run = { id: mid, lead_id: lid }; runs.set(mid, run); return { created: true, run }; },
    async complete(id, record) { runs.set(id, { ...runs.get(id), ...record }); },
    async fail(id, record) { runs.set(id, { ...runs.get(id), ...record }); },
  };
}

function runShadowWithControl(conversationControl, inboundId, v1Decision) {
  return runV2Shadow({
    env: { AI_V2_SHADOW_MODE: "true" },
    input: {
      lead: { id: "lead1" },
      inboundMessage: { id: inboundId, body: "cuánto sale", created_at: "2026-01-01T00:00:00Z" },
      filterInput: { lead: {}, catalog: [], campaigns: [], bank_offers: [], conversation_control: conversationControl },
    },
    repository: memoryRepo(),
    extractSemantic: fakeSemantic,
    runFilter: fakeEngine,
    v1Decision,
  });
}

test("Family H - unit: decideShadowScheduling picks the fresh post-analysis control, not the stale initial one", () => {
  const decision = decideShadowScheduling({
    isStaleInbound: false,
    isHumanTakeoverDuringAnalysis: true,
    v1Decision: { qualification_status: "qualified", reply_text: "..." },
    initialConversationControl: { mode: "ai" },
    conversationControlAfterAnalysis: { mode: "human" },
  });
  assert.deepEqual(decision.conversationControl, { mode: "human" }, "shadow must see the fresh control that actually detected the takeover");
  assert.equal(decision.v1Decision, null, "the discarded V1 classification must not be recorded as applied");
  assert.equal(decision.schedule, true);
});

test("Family H - red/green: mid-analysis takeover must make shadow suppress, not answer as if control were still ai", async () => {
  // This reproduces the bug directly: feeding the STALE initial control (mode=ai)
  // is exactly what RC1's index.ts did before the fix, and produces a shadow
  // record that looks like V1 was never interrupted.
  const staleRun = await runV2Shadow(Object.assign({}, {
    env: { AI_V2_SHADOW_MODE: "true" },
    input: { lead: { id: "lead1" }, inboundMessage: { id: "m-stale-control", body: "cuánto sale", created_at: "2026-01-01T00:00:00Z" }, filterInput: { lead: {}, catalog: [], campaigns: [], bank_offers: [], conversation_control: { mode: "ai" } } },
    repository: memoryRepo(),
    extractSemantic: fakeSemantic,
    runFilter: fakeEngine,
    v1Decision: { qualification_status: "qualified", reply_text: "el precio es..." },
  }));
  assert.equal(staleRun.record.would_suppress_for_human, false, "sanity: this is exactly the wrong, misleading shape the bug produced");
  assert.notEqual(staleRun.record.v2_candidate_reply, null, "sanity: stale ai control lets a candidate reply through");

  // The fix: decideShadowScheduling resolves the correct (fresh) control AND
  // nulls out v1Decision (the classification was discarded, not applied); the
  // webhook must feed both resolved values to runShadow, not the stale ones.
  const decision = decideShadowScheduling({ isStaleInbound: false, isHumanTakeoverDuringAnalysis: true, v1Decision: { qualification_status: "qualified", reply_text: "el precio es..." }, initialConversationControl: { mode: "ai" }, conversationControlAfterAnalysis: { mode: "human" } });
  const fixedRun = await runShadowWithControl(decision.conversationControl, "m-fixed-control", decision.v1Decision);

  assert.equal(fixedRun.record.candidate_reply_status, "suppressed_human");
  assert.equal(fixedRun.record.would_suppress_for_human, true);
  assert.equal(fixedRun.record.v2_candidate_reply, null);
  assert.equal(fixedRun.record.v1_decision, null, "v1Decision must be persisted as null: the classification was discarded, not applied");
});

test("Family H - normal path (no takeover) still schedules the real control and v1Decision unmodified", async () => {
  const decision = decideShadowScheduling({ isStaleInbound: false, isHumanTakeoverDuringAnalysis: false, v1Decision: { qualification_status: "qualified", reply_text: "el precio es..." }, initialConversationControl: { mode: "ai" } });
  const run = await runShadowWithControl(decision.conversationControl, "m-normal", decision.v1Decision);
  assert.deepEqual(decision.conversationControl, { mode: "ai" });
  assert.equal(run.record.would_suppress_for_human, false);
  assert.notEqual(run.record.v2_candidate_reply, null);
  assert.equal(run.record.v1_decision.qualification_status, "qualified");
});
