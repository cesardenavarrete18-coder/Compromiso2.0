export const SEMANTIC_EXTRACTION_SCHEMA_VERSION = "filter-v1-semantic-extractor/1.2";
export const SEMANTIC_CERTAINTIES = Object.freeze(["explicit", "contextual", "ambiguous"]);
export const SEMANTIC_QUERY_INTENTS = Object.freeze(["model_value", "installment_offer", "delivery_advance", "subscription_amount", "ambiguous_initial_amount", "technical_question", "general_information", "none"]);
export const PURCHASE_MODE_STATEMENTS = Object.freeze(["cash", "financed", "not_present", "conflicting"]);
export const AMOUNT_KINDS = Object.freeze(["down_payment_capacity", "monthly_installment_capacity", "trade_in_customer_estimate", "unknown_amount"]);
export const VEHICLE_ROLES = Object.freeze(["target", "target_candidate", "comparison", "owned_only", "trade_in", "unknown"]);
export const TRADE_IN_INTENTS = Object.freeze(["yes", "no", "not_present", "ambiguous"]);
export const ACTION_TYPES = Object.freeze(["visit", "deposit", "transfer", "documents", "advance_purchase", "other"]);
export const CLARIFICATION_CODES = Object.freeze(["amount_scale_or_currency", "initial_amount_intent", "multiple_target_models", "cross_brand_target", "vehicle_role", "conflicting_purchase_mode", "other"]);
export const FORBIDDEN_EFFECT_FIELDS = Object.freeze(["qualification_status", "handoff_status", "contact_priority", "commercial_profile_complete", "campaign_id", "source_campaign_id", "selected_plan", "next_filter_question", "next_action", "answer_fact", "reasoning", "chain_of_thought", "analysis", "thinking", "confidence"]);

export function emptySemanticExtraction() {
  return {
    schema_version: SEMANTIC_EXTRACTION_SCHEMA_VERSION,
    query_intent: "none",
    purchase_mode_statement: "not_present",
    purchase_mode_literal: null,
    amount_mentions: [], vehicle_mentions: [], trade_in_intent: "not_present",
    trade_in_vehicle: null, customer_name: null, customer_location: null,
    human_request: null, strong_action: null, requested_action: null,
    contact_preference_expression: null, do_not_contact: null,
    customer_corrections: [], needs_clarification: [],
    evidence: {},
  };
}
