const ALLOWED_RESPONSES_URL = "https://api.openai.com/v1/responses";
const ALLOWED_VECTOR_PREFIX = "https://api.openai.com/v1/vector_stores/";

const FORBIDDEN_PRODUCTION_ENVIRONMENT = Object.freeze([
  "OPENAI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "DATABASE_URL",
  "POSTGRES_URL",
  "META_WHATSAPP_ACCESS_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_APP_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
]);

export class SafetyError extends Error {
  constructor(code, detail = "", diagnostic = null) {
    super(`${code}${detail ? `:${detail}` : ""}`);
    this.name = "SafetyError";
    this.code = code;
    this.diagnostic = diagnostic;
  }
}

const MAX_DIAGNOSTIC_LENGTH = 500;

export function sanitizeDiagnosticText(value, fallback = null) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value
    .replace(/Authorization\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi, "[REDACTED_AUTHORIZATION]")
    .replace(/\bsk-[^\s,;]+/gi, "[REDACTED_API_KEY]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DIAGNOSTIC_LENGTH);
}

function vectorStoreFailureCategory(httpStatus) {
  if (httpStatus === 401) return "credential_invalid_or_unauthenticated";
  if (httpStatus === 403) return "permission_or_policy_insufficient";
  if (httpStatus === 404) return "resource_not_visible_or_not_found";
  return "other_http_error";
}

async function vectorStoreErrorDiagnostic(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Never retain an unstructured response body: it may contain unsafe diagnostics.
  }
  const apiError = payload && typeof payload === "object" && payload.error && typeof payload.error === "object"
    ? payload.error
    : {};
  return {
    http_status: Number(response.status),
    classification: vectorStoreFailureCategory(Number(response.status)),
    error: {
      type: sanitizeDiagnosticText(apiError.type),
      code: sanitizeDiagnosticText(apiError.code),
      message_sanitized: sanitizeDiagnosticText(apiError.message, `OpenAI request failed with HTTP ${response.status}`),
    },
  };
}

export function sideEffectBlocked(name) {
  throw new SafetyError("SIDE_EFFECT_BLOCKED", name);
}

export const forbiddenAdapters = Object.freeze(new Proxy({}, {
  get(_target, property) { return () => sideEffectBlocked(String(property)); },
}));

export function assertProductionCredentialIsolation(environment = process.env) {
  const present = FORBIDDEN_PRODUCTION_ENVIRONMENT.filter((name) => Boolean(environment[name]));
  if (present.length) throw new SafetyError("PRODUCTION_CREDENTIAL_ISOLATION_FAILED", present.join(","));
  return { isolated: true, forbidden_variables_present: [] };
}

export function createVectorReadOnlyTransport(evalApiKey, audit = { requests: [] }) {
  if (!evalApiKey) throw new SafetyError("OPENAI_EVAL_API_KEY_MISSING");
  return Object.assign(async function vectorReadOnlyFetch(url, options = {}) {
    const value = String(url);
    const method = String(options.method || "GET").toUpperCase();
    if (!value.startsWith(ALLOWED_VECTOR_PREFIX) || method !== "GET") {
      throw new SafetyError("NETWORK_DESTINATION_BLOCKED", `${method}:${value}`);
    }
    audit.requests.push({ method, resource: "openai_vector_store_snapshot" });
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${evalApiKey}` };
    return fetch(value, { ...options, method, headers, redirect: "error" });
  }, { audit });
}

export function createEvalTransport(evalApiKey) {
  if (!evalApiKey) throw new SafetyError("OPENAI_EVAL_API_KEY_MISSING");
  return async function evalFetch(url, options = {}) {
    const value = String(url);
    const method = String(options.method || "GET").toUpperCase();
    const isResponses = value === ALLOWED_RESPONSES_URL && method === "POST";
    const isVectorRead = value.startsWith(ALLOWED_VECTOR_PREFIX) && method === "GET";
    if (!isResponses && !isVectorRead) throw new SafetyError("NETWORK_DESTINATION_BLOCKED", `${method}:${value}`);
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${evalApiKey}` };
    return fetch(value, { ...options, method, headers, redirect: "error" });
  };
}

export async function assertVectorStoreScope(transport, vectorStoreId) {
  if (!/^vs_[A-Za-z0-9]+$/.test(String(vectorStoreId || ""))) throw new SafetyError("RAG_RESOURCE_SCOPE_MISMATCH", "invalid_vector_store_id");
  const response = await transport(`${ALLOWED_VECTOR_PREFIX}${vectorStoreId}`, { method: "GET" });
  if (!response.ok) {
    const diagnostic = await vectorStoreErrorDiagnostic(response);
    throw new SafetyError("RAG_RESOURCE_SCOPE_MISMATCH", `http_${response.status}`, diagnostic);
  }
  const payload = await response.json();
  if (payload?.id !== vectorStoreId) throw new SafetyError("RAG_RESOURCE_SCOPE_MISMATCH", "unexpected_resource");
  return { id: payload.id, status: payload.status || "unknown" };
}

export function assertExecutionConfirmation() {
  if (process.env.EVAL_EXECUTION_CONFIRMED !== "YES") throw new SafetyError("EVAL_EXECUTION_NOT_CONFIRMED");
}
