const SECRET = /sk-[A-Za-z0-9_-]+/g;
const MAX_MESSAGE = 1000;
export const sanitizeProviderText = value => value == null ? null : String(value).replace(SECRET, "[REDACTED]").slice(0, MAX_MESSAGE);

export async function safeProviderError(response) {
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  const error = body?.error ?? {};
  return Object.freeze({
    status: Number(response.status) || null,
    request_id: sanitizeProviderText(response.headers?.get?.("x-request-id") ?? null),
    type: sanitizeProviderText(error.type), code: sanitizeProviderText(error.code),
    param: sanitizeProviderText(error.param), message: sanitizeProviderText(error.message ?? response.statusText ?? "Provider request failed"),
  });
}

export function classifyProviderFailure(error) {
  if (!error) return null;
  if (error.status === 401 || error.status === 403) return "AUTH_PROJECT_ERROR";
  if (error.status === 404 || /model.*(not found|access|exist)/i.test(error.message ?? "")) return "MODEL_ACCESS_ERROR";
  if (error.status === 429) return "RATE_LIMIT_ERROR";
  if (/reasoning|effort/i.test(`${error.param} ${error.message}`)) return "INVALID_REASONING_PARAMETER";
  if (/schema|json_schema|structured output/i.test(`${error.param} ${error.message}`)) return "STRUCTURED_OUTPUT_REQUEST_ERROR";
  if (error.status === null) return "NETWORK_TRANSPORT_ERROR";
  if (error.status >= 400 && error.status < 500) return "REQUEST_PARAMETER_ERROR";
  return "UNKNOWN_PROVIDER_ERROR";
}
