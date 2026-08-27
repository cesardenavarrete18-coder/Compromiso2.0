const STATUS = ["known", "unknown", "conflicting", "not_applicable"];
const CONFIDENCE = ["high", "medium", "low"];
const SOURCES = ["customer", "meta_ad", "tiktok_identifier", "authorized_commercial_source", "human", "system", "llm_inference"];

const evidenceSchema = {
  type: "array",
  items: {
    type: "object", additionalProperties: false,
    properties: { message_id: { type: "string" }, quote: { type: "string" } },
    required: ["message_id", "quote"],
  },
};

function field(valueSchema) {
  return {
    type: "object", additionalProperties: false,
    properties: {
      value: valueSchema,
      status: { type: "string", enum: STATUS },
      confidence: { type: "string", enum: CONFIDENCE },
      source: { type: "string", enum: SOURCES },
      evidence: evidenceSchema,
    },
    required: ["value", "status", "confidence", "source", "evidence"],
  };
}

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };

export const EXTRACTION_RESPONSE_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  properties: {
    model_interest: field({
      anyOf: [
        { type: "null" },
        {
          type: "object", additionalProperties: false,
          properties: { brand: nullableString, model: nullableString, variant: nullableString },
          required: ["brand", "model", "variant"],
        },
      ],
    }),
    purchase_modality: field({ anyOf: [{ type: "null" }, { type: "string", enum: ["financing", "savings_plan", "cash", "credit", "used_plus_financing", "undecided", "unknown"] }] }),
    modalities_considered: field({ type: "array", items: { type: "string", enum: ["financing", "savings_plan", "cash", "credit", "used_plus_financing"] } }),
    cash_available: field({
      anyOf: [
        { type: "null" },
        { type: "object", additionalProperties: false, properties: { amount: { type: "number" }, currency: { type: "string" } }, required: ["amount", "currency"] },
      ],
    }),
    target_installment: field({
      anyOf: [
        { type: "null" },
        {
          type: "object", additionalProperties: false,
          properties: { amount: nullableNumber, minimum: nullableNumber, maximum: nullableNumber, currency: { type: "string" }, accepted_authorized_anchor: { type: "boolean" } },
          required: ["amount", "minimum", "maximum", "currency", "accepted_authorized_anchor"],
        },
      ],
    }),
    has_trade_in: field({ anyOf: [{ type: "null" }, { type: "string", enum: ["yes", "no", "unknown"] }] }),
    trade_in: {
      type: "object", additionalProperties: false,
      properties: {
        brand: field(nullableString), model: field(nullableString), version: field(nullableString),
        year: field(nullableNumber), km: field(nullableNumber),
      },
      required: ["brand", "model", "version", "year", "km"],
    },
    trade_in_customer_estimate: field({
      anyOf: [
        { type: "null" },
        { type: "object", additionalProperties: false, properties: { amount: { type: "number" }, currency: { type: "string" } }, required: ["amount", "currency"] },
      ],
    }),
    zone: field(nullableString),
    purchase_timeframe: field({
      anyOf: [
        { type: "null" },
        {
          type: "object", additionalProperties: false,
          properties: { bucket: { type: "string", enum: ["immediate", "within_7_days", "within_90_days", "long_term", "unknown"] }, days: nullableNumber, description: nullableString },
          required: ["bucket", "days", "description"],
        },
      ],
    }),
    urgency: field({ anyOf: [{ type: "null" }, { type: "string", enum: ["high", "medium", "low"] }] }),
    visit_intent: field({ anyOf: [{ type: "null" }, { type: "string", enum: ["none", "considering", "requested", "scheduled"] }] }),
    deposit_intent: field({ anyOf: [{ type: "null" }, { type: "string", enum: ["none", "considering", "ready", "confirmed"] }] }),
    commercial_intent: field({ anyOf: [{ type: "null" }, { type: "string", enum: ["none", "exploratory", "active", "action_ready"] }] }),
    human_request: field({ anyOf: [{ type: "null" }, { type: "string", enum: ["none", "preference", "explicit", "repeated"] }] }),
    objections: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["price", "installment", "trust", "fraud", "privacy", "legal", "technical", "commercial", "other"] },
          status: { type: "string", enum: ["open", "resolved"] },
          confidence: { type: "string", enum: CONFIDENCE }, evidence: evidenceSchema,
        },
        required: ["type", "status", "confidence", "evidence"],
      },
    },
    corrections: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { field: { type: "string" }, previous_value: nullableString, new_value: nullableString, explicit: { type: "boolean" }, evidence: evidenceSchema },
        required: ["field", "previous_value", "new_value", "explicit", "evidence"],
      },
    },
    contradictions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { field: { type: "string" }, values: { type: "array", items: { type: "string" } }, evidence: evidenceSchema },
        required: ["field", "values", "evidence"],
      },
    },
    concrete_query: {
      type: "object", additionalProperties: false,
      properties: { present: { type: "boolean" }, topic: nullableString, blocks_progress: { type: "boolean" } },
      required: ["present", "topic", "blocks_progress"],
    },
    direct_answer: { type: "string" },
  },
  required: [
    "model_interest", "purchase_modality", "modalities_considered", "cash_available", "target_installment",
    "has_trade_in", "trade_in", "trade_in_customer_estimate", "zone", "purchase_timeframe", "urgency",
    "visit_intent", "deposit_intent", "commercial_intent", "human_request", "objections", "corrections",
    "contradictions", "concrete_query", "direct_answer",
  ],
});

export const FORBIDDEN_LLM_DECISION_FIELDS = Object.freeze([
  "initial_capacity", "qualification_status", "commercial_temperature", "handoff_status",
  "commercial_profile_complete", "missing_commercial_fields", "conversation_status",
  "do_not_contact", "next_action",
]);

function fieldObject(value, status = "unknown", source = "llm_inference", confidence = "low", evidence = []) {
  return { value, status, source, confidence, evidence };
}

export function emptyExtraction() {
  const unknown = () => fieldObject(null);
  return {
    model_interest: unknown(), purchase_modality: unknown(), modalities_considered: fieldObject([], "known"),
    cash_available: unknown(), target_installment: unknown(), has_trade_in: unknown(),
    trade_in: { brand: unknown(), model: unknown(), version: unknown(), year: unknown(), km: unknown() },
    trade_in_customer_estimate: unknown(), zone: unknown(), purchase_timeframe: unknown(), urgency: unknown(),
    visit_intent: unknown(), deposit_intent: unknown(), commercial_intent: unknown(), human_request: unknown(),
    objections: [], corrections: [], contradictions: [], concrete_query: { present: false, topic: null, blocks_progress: false }, direct_answer: "",
  };
}

export function validateExtractionContract(extraction) {
  if (!extraction || typeof extraction !== "object" || Array.isArray(extraction)) throw new Error("CANDIDATE_EXTRACTION_OBJECT_REQUIRED");
  for (const forbidden of FORBIDDEN_LLM_DECISION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(extraction, forbidden)) throw new Error(`LLM_DECISION_FIELD_FORBIDDEN:${forbidden}`);
  }
  for (const required of EXTRACTION_RESPONSE_SCHEMA.required) {
    if (!Object.prototype.hasOwnProperty.call(extraction, required)) throw new Error(`CANDIDATE_EXTRACTION_FIELD_MISSING:${required}`);
  }
  return extraction;
}

export function knownField(value, { source = "customer", confidence = "high", message_id = "fixture", quote = "" } = {}) {
  return fieldObject(value, "known", source, confidence, [{ message_id, quote }]);
}
