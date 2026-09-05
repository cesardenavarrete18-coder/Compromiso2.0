export const FILTER_SCHEMA_VERSION = "filter-v1-semantic-extractor/1.3";
export const FILTER_MODEL_FALLBACK = "gpt-4.1-mini-2025-04-14";
export const RESPONSE_MODEL_FALLBACK = "gpt-4.1-mini-2025-04-14";
export const RUNTIME_FINGERPRINT = "filter-v1.3-runtime-8d8c83533bb09950cfeb74789f3539a2c308893d";

export function shadowConfig(env = {}) {
  return Object.freeze({
    enabled: env.AI_V2_SHADOW_MODE === "true",
    filterModel: env.OPENAI_FILTER_MODEL || FILTER_MODEL_FALLBACK,
    responseModel: env.OPENAI_V2_RESPONSE_MODEL || RESPONSE_MODEL_FALLBACK,
  });
}

export function v1DecisionSnapshot(decision) {
  if (!decision) return null;
  return Object.fromEntries(["qualification_status", "priority", "intent_summary", "model_interest", "disqualify_reason", "reply_text"].map(key => [key, decision[key] ?? null]));
}
