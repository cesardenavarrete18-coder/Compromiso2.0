import assert from "node:assert/strict";
import test from "node:test";
import { scheduleShadow, decideShadowScheduling } from "../../../supabase/functions/_shared/ai-v2-shadow/scheduler.mjs";
import { runWhatsappV2Shadow } from "../../../supabase/functions/_shared/ai-v2-shadow/whatsapp-adapter.mjs";

// Family G: V2 shadow must never block V1. RC1 as shipped called `await runShadow(...)`
// at all three webhook call sites, so a slow/stuck/rejecting shadow pipeline directly
// added to V1's own response latency. These tests exercise scheduleShadow() with real
// timers (never a promise that resolves instantly) so the assertions are meaningful.

function pendingFor(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test("Family G - A: a pending shadow task does not delay the caller", async () => {
  const slowShadow = pendingFor(150); // genuinely takes 150ms; never resolved early
  const startedAt = Date.now();
  const guarded = scheduleShadow(slowShadow, { edgeRuntime: { waitUntil: () => {} } });
  const elapsedAtReturn = Date.now() - startedAt;
  assert.ok(elapsedAtReturn < 20, `scheduleShadow must return synchronously; took ${elapsedAtReturn}ms`);
  await guarded; // drain so the test process doesn't exit with a dangling timer
});

test("Family G - B: a shadow task that eventually times out (rejects late) does not delay the caller", async () => {
  const timingOutShadow = pendingFor(150).then(() => { throw new Error("SHADOW_TIMEOUT"); });
  const logs = [];
  const startedAt = Date.now();
  const guarded = scheduleShadow(timingOutShadow, { edgeRuntime: { waitUntil: () => {} }, logger: { error: (...args) => logs.push(args) } });
  const elapsedAtReturn = Date.now() - startedAt;
  assert.ok(elapsedAtReturn < 20, `scheduleShadow must return synchronously even for a task that will time out; took ${elapsedAtReturn}ms`);
  await guarded;
  assert.equal(logs.length, 1);
  assert.match(String(logs[0][1]), /SHADOW_TIMEOUT/);
});

test("Family G - C: an immediately-rejecting shadow task neither throws nor delays, and is logged not swallowed silently", async () => {
  const logs = [];
  let threw = false;
  const guarded = (() => {
    try {
      return scheduleShadow(Promise.reject(new Error("boom")), { edgeRuntime: { waitUntil: () => {} }, logger: { error: (...args) => logs.push(args) } });
    } catch {
      threw = true;
      return Promise.resolve();
    }
  })();
  assert.equal(threw, false, "scheduleShadow must not throw synchronously for a rejecting task");
  await guarded; // must resolve, not reject, at the call site's await boundary
  assert.equal(logs.length, 1);
  assert.match(String(logs[0][1]), /boom/);
});

test("Family G - A2: without waitUntil available (no Edge Runtime), scheduling still returns synchronously and never throws", async () => {
  const startedAt = Date.now();
  const guarded = scheduleShadow(pendingFor(50), { edgeRuntime: undefined });
  assert.ok(Date.now() - startedAt < 20);
  await guarded;
});

test("Family G - D: a stale inbound (superseded by a newer customer message) must not schedule a misleading V1 comparison", () => {
  const v1Decision = { qualification_status: "qualified", reply_text: "..." };
  const decision = decideShadowScheduling({ isStaleInbound: true, isHumanTakeoverDuringAnalysis: false, v1Decision, initialConversationControl: { mode: "ai" } });
  assert.deepEqual(decision, { schedule: false, v1Decision: null, conversationControl: null, reason: "stale_inbound" });
});

test("Family G - E: a takeover discovered mid-analysis must not record the discarded V1 decision as applied", () => {
  const v1Decision = { qualification_status: "qualified", reply_text: "..." };
  const decision = decideShadowScheduling({ isStaleInbound: false, isHumanTakeoverDuringAnalysis: true, v1Decision, initialConversationControl: { mode: "ai" }, conversationControlAfterAnalysis: { mode: "human" } });
  assert.equal(decision.schedule, true, "the takeover moment itself is still a valid observation point");
  assert.equal(decision.v1Decision, null, "the classification that was never applied must not be recorded as v1's answer");
  assert.equal(decision.reason, "human_takeover");
});

test("Family G - E2: the normal path schedules the real V1 decision unmodified", () => {
  const v1Decision = { qualification_status: "qualified", reply_text: "..." };
  const initialConversationControl = { mode: "ai" };
  const decision = decideShadowScheduling({ isStaleInbound: false, isHumanTakeoverDuringAnalysis: false, v1Decision, initialConversationControl });
  assert.deepEqual(decision, { schedule: true, v1Decision, conversationControl: initialConversationControl, reason: "v1_applied" });
});

test("Family F (re-check): AI_V2_SHADOW_MODE unset still performs zero database calls after the scheduling refactor", async () => {
  const calls = [];
  const db = { from(table) { calls.push(table); return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }; } };
  const out = await runWhatsappV2Shadow({ db, env: {}, lead: { id: "lead1" }, inboundMessage: { id: "m1", body: "hola", created_at: "2026-01-01T00:00:00Z" }, conversationControl: null });
  assert.equal(out.status, "disabled");
  assert.deepEqual(calls, []);
});
