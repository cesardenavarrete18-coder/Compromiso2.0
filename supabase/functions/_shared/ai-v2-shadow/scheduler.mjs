// V2 shadow must never add latency to the V1 response path. `scheduleShadow`
// hands the already-started shadow task to `EdgeRuntime.waitUntil` (Supabase's
// documented background-task API) so the Edge Function keeps running the task
// after the response is sent, without the request handler ever awaiting it.
//
// `edgeRuntime` is injectable so this stays unit-testable under Node (where the
// global does not exist): pass a fake `{ waitUntil }` explicitly, or set
// `globalThis.EdgeRuntime` for the duration of a test.
export function scheduleShadow(task, { edgeRuntime = globalThis.EdgeRuntime, logger = console } = {}) {
  // Defensive net independent of whatever error handling `task` already does:
  // this boundary must never produce an unhandled rejection.
  const guarded = Promise.resolve(task).catch(error => {
    logger.error("AI V2 shadow scheduling failed", error instanceof Error ? error.message : String(error));
  });
  if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
    edgeRuntime.waitUntil(guarded);
  }
  return guarded;
}

// Pure policy decision for whether/how to schedule the shadow comparison at the
// point in the webhook where a V1 classification has just been computed.
//
// Chosen semantics (documented, not incidental):
// - Stale inbound (a newer customer message arrived while V1 was analyzing):
//   the computed classification is never applied to the customer. Do NOT
//   schedule a shadow run for it — a newer webhook invocation, for the newer
//   inbound message, will already produce its own shadow comparison. Recording
//   this discarded decision would audit a V1 answer that was never sent.
// - Human takeover discovered after analysis (a human took the conversation
//   while V1/V2 were computing): same as the takeover-at-entry branches
//   elsewhere in the webhook — still worth observing that a message arrived
//   under human control, but the computed classification must not be recorded
//   as if V1 had answered, so v1Decision is nulled out rather than passed
//   through. Critically (Family H), the conversationControl handed to shadow
//   must be the FRESH post-analysis snapshot, not the stale pre-analysis one —
//   otherwise shadow computes as if a human had not taken over, producing a
//   candidate reply and would_suppress_for_human=false when the opposite is
//   true, corrupting the exact telemetry a promotion decision would rely on.
// - Otherwise: the classification is the one that will actually be sent;
//   schedule it with the real v1Decision and the initial conversationControl
//   (by construction, unchanged between the initial read and this point,
//   since either check above would have already returned).
export function decideShadowScheduling({ isStaleInbound = false, isHumanTakeoverDuringAnalysis = false, v1Decision = null, initialConversationControl = null, conversationControlAfterAnalysis = null } = {}) {
  if (isStaleInbound) return Object.freeze({ schedule: false, v1Decision: null, conversationControl: null, reason: "stale_inbound" });
  if (isHumanTakeoverDuringAnalysis) return Object.freeze({ schedule: true, v1Decision: null, conversationControl: conversationControlAfterAnalysis, reason: "human_takeover" });
  return Object.freeze({ schedule: true, v1Decision, conversationControl: initialConversationControl, reason: "v1_applied" });
}
