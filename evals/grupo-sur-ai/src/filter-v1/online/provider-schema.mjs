const evidence = { type: "object", additionalProperties: false, required: ["source_message_id", "literal"], properties: { source_message_id: { type: "string" }, literal: { type: "string" } } };
const evidenceList = { type: "array", items: evidence };
const nullableEvidenceList = { anyOf: [evidenceList, { type: "null" }] };
const nullableSignal = type => ({ anyOf: [{ type: "object", additionalProperties: false, required: ["type", "evidence"], properties: { type: { type: "string", const: type }, evidence } }, { type: "null" }] });
const certainty = { type: "string", enum: ["explicit", "contextual", "ambiguous"] };
const scalar = { type: "object", additionalProperties: false, required: ["value", "certainty", "evidence"], properties: { value: { type: ["string", "null"] }, certainty, evidence: evidenceList } };
const usedField = { type: "object", additionalProperties: false, required: ["value", "status", "evidence"], properties: { value: { type: ["string", "number", "null"] }, status: { type: "string", enum: ["known", "explicitly_unknown"] }, evidence: evidenceList } };

export const FILTER_V1_PROVIDER_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  required: ["schema_version", "query_intent", "purchase_mode_statement", "purchase_mode_literal", "amount_mentions", "vehicle_mentions", "trade_in_intent", "trade_in_vehicle", "customer_name", "customer_location", "human_request", "strong_action", "requested_action", "contact_preference_expression", "do_not_contact", "customer_corrections", "needs_clarification", "evidence"],
  properties: {
    schema_version: { type: "string", const: "filter-v1-semantic-extractor/1.2" },
    query_intent: { type: "string", enum: ["model_value", "installment_offer", "delivery_advance", "subscription_amount", "ambiguous_initial_amount", "technical_question", "general_information", "none"] },
    purchase_mode_statement: { type: "string", enum: ["cash", "financed", "not_present", "conflicting"] },
    purchase_mode_literal: { type: ["string", "null"] },
    amount_mentions: { type: "array", items: { type: "object", additionalProperties: false, required: ["kind", "numeric_value", "currency", "literal", "certainty", "confirmation_recommended", "evidence"], properties: { kind: { type: "string", enum: ["down_payment_capacity", "monthly_installment_capacity", "trade_in_customer_estimate", "unknown_amount"] }, numeric_value: { type: ["number", "null"] }, currency: { type: ["string", "null"] }, literal: { type: "string" }, certainty, confirmation_recommended: { type: "boolean" }, evidence: evidenceList } } },
    vehicle_mentions: { type: "array", items: { type: "object", additionalProperties: false, required: ["literal", "brand_text", "model_text", "version_text", "role", "certainty", "evidence"], properties: { literal: { type: "string" }, brand_text: { type: ["string", "null"] }, model_text: { type: ["string", "null"] }, version_text: { type: ["string", "null"] }, role: { type: "string", enum: ["target", "target_candidate", "comparison", "owned_only", "trade_in", "unknown"] }, certainty, evidence: evidenceList } } },
    trade_in_intent: { type: "string", enum: ["yes", "no", "not_present", "ambiguous"] },
    trade_in_vehicle: { anyOf: [{ type: "object", additionalProperties: false, required: ["brand", "model", "version", "year", "mileage_km"], properties: { brand: usedField, model: usedField, version: usedField, year: usedField, mileage_km: usedField } }, { type: "null" }] },
    customer_name: { anyOf: [scalar, { type: "null" }] }, customer_location: { anyOf: [scalar, { type: "null" }] },
    human_request: nullableSignal("human_request"), strong_action: nullableSignal("strong_action"),
    requested_action: { anyOf: [{ type: "object", additionalProperties: false, required: ["type", "time_expression", "certainty", "evidence"], properties: { type: { type: "string", enum: ["visit", "deposit", "transfer", "documents", "advance_purchase", "other"] }, time_expression: { type: ["string", "null"] }, certainty, evidence: evidenceList } }, { type: "null" }] },
    contact_preference_expression: { anyOf: [{ type: "object", additionalProperties: false, required: ["literal", "certainty", "evidence"], properties: { literal: { type: "string" }, certainty, evidence: evidenceList } }, { type: "null" }] },
    do_not_contact: nullableSignal("do_not_contact"),
    customer_corrections: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "from_literal", "to_literal", "evidence"], properties: { field: { type: "string", enum: ["target_model", "purchase_mode", "amount_currency", "amount_value", "trade_in_intent", "other"] }, from_literal: { type: ["string", "null"] }, to_literal: { type: "string" }, evidence: evidenceList } } },
    needs_clarification: { type: "array", items: { type: "object", additionalProperties: false, required: ["code", "evidence"], properties: { code: { type: "string", enum: ["amount_scale_or_currency", "initial_amount_intent", "multiple_target_models", "cross_brand_target", "vehicle_role", "conflicting_purchase_mode", "other"] }, evidence: evidenceList } } },
    evidence: { type: "object", additionalProperties: false, required: ["query_intent", "purchase_mode_statement", "trade_in_intent"], properties: { query_intent: nullableEvidenceList, purchase_mode_statement: nullableEvidenceList, trade_in_intent: nullableEvidenceList } },
  },
});
