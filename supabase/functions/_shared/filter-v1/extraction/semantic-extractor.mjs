import { SEMANTIC_EXTRACTION_SCHEMA_VERSION } from "./semantic-extraction-contract.mjs";
import { normalizeSemanticExtraction } from "./semantic-extraction-normalizer.mjs";
import { SEMANTIC_EXTRACTOR_SYSTEM_PROMPT } from "./semantic-extractor-prompt.mjs";
import { validateSemanticExtraction } from "./semantic-extraction-validator.mjs";
import { sanitizeSemanticEvidence } from "./semantic-evidence-sanitizer.mjs";

function safeInput(input) {
  return {
    current_message: input.current_message,
    recent_conversation: input.recent_conversation ?? [],
    previous_filter_state: input.previous_filter_state ?? null,
    acquisition_context: input.acquisition_context ?? null,
    known_catalog_context: input.known_catalog_context ?? null,
  };
}

export async function extractSemanticMessage({ client, ...input }) {
  if (typeof client !== "function") throw new TypeError("SEMANTIC_EXTRACTOR_CLIENT_REQUIRED");
  const providerInput = safeInput(input);
  try {
    const raw = await client({ systemPrompt: SEMANTIC_EXTRACTOR_SYSTEM_PROMPT, input: providerInput, schema: { schema_version: SEMANTIC_EXTRACTION_SCHEMA_VERSION } });
    const candidate = typeof raw === "string" ? JSON.parse(raw) : raw;
    const rawValidation = validateSemanticExtraction(candidate, providerInput, { validateEvidenceFields: false });
    if (!rawValidation.valid) return Object.freeze({ status: "extraction_failed", extraction: null, errors: rawValidation.errors, forbidden_effect_fields: rawValidation.forbidden_effect_fields });
    const sanitized = sanitizeSemanticEvidence(candidate, providerInput);
    const normalized = normalizeSemanticExtraction(sanitized.extraction, providerInput);
    const validation = validateSemanticExtraction(normalized.extraction, providerInput);
    if (!validation.valid) return Object.freeze({ status: "extraction_failed", extraction: null, errors: validation.errors, forbidden_effect_fields: validation.forbidden_effect_fields });
    return Object.freeze({ status: "ok", extraction: normalized.extraction, ignored_fields: normalized.ignored_fields, warnings: sanitized.warnings });
  } catch (error) {
    const providerErrorCode = /^(RESPONSES_API_\d{3}|RESPONSES_OUTPUT_MISSING)$/.test(error?.message ?? "") ? error.message : null;
    return Object.freeze({ status: "extraction_failed", extraction: null, errors: [error instanceof SyntaxError ? "INVALID_JSON" : "EXTRACTOR_CLIENT_ERROR"], provider_error_code: providerErrorCode, provider_error: error?.provider_error ?? null });
  }
}
