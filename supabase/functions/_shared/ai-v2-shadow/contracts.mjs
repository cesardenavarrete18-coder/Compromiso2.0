export const FILTER_SCHEMA_VERSION = "filter-v1-semantic-extractor/1.3";
export const FILTER_MODEL_FALLBACK = "gpt-4.1-mini-2025-04-14";
export const RESPONSE_MODEL_FALLBACK = "gpt-4.1-mini-2025-04-14";
// Fallback only: used when no candidate commit was injected at deploy time (e.g. local/unit
// callers that never set AI_V2_CANDIDATE_COMMIT). This string is intentionally never bumped by
// hand - doing so was exactly the problem it replaces (see resolveRuntimeFingerprint below):
// two genuinely different runtimes could share it silently, since nothing forced it to change
// when filter-v1/ai-v2-shadow code did. A real deploy must always inject the commit.
export const RUNTIME_FINGERPRINT = "filter-v1.3-runtime-8d8c83533bb09950cfeb74789f3539a2c308893d";

// V2 Shadow Production Candidate: the fingerprint persisted alongside every run must
// unambiguously identify the code that produced it, so two different deploys can never be
// mistaken for the same runtime. A hardcoded string can't guarantee that (it silently stayed
// "filter-v1.3-runtime-..." across every Family O-S behavior change to this exact module).
// Since a Supabase Edge Function has no way to read its own git SHA at runtime, the commit is
// injected explicitly via AI_V2_CANDIDATE_COMMIT (set in the function's environment at deploy
// time, alongside the wrapper's own pinned GitHub import) - the same "inject at deploy, don't
// invent a pseudo-hash" approach used for every other config value in this file.
export function resolveRuntimeFingerprint(env = {}) {
  const commit = String(env.AI_V2_CANDIDATE_COMMIT || "").trim();
  return commit ? `filter-v1.3-runtime-${commit}` : RUNTIME_FINGERPRINT;
}

export function shadowConfig(env = {}) {
  return Object.freeze({
    enabled: env.AI_V2_SHADOW_MODE === "true",
    filterModel: env.OPENAI_FILTER_MODEL || FILTER_MODEL_FALLBACK,
    responseModel: env.OPENAI_V2_RESPONSE_MODEL || RESPONSE_MODEL_FALLBACK,
    runtimeFingerprint: resolveRuntimeFingerprint(env),
  });
}

export function v1DecisionSnapshot(decision) {
  if (!decision) return null;
  return Object.fromEntries(["qualification_status", "priority", "intent_summary", "model_interest", "disqualify_reason", "reply_text"].map(key => [key, decision[key] ?? null]));
}
