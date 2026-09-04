export const TARGET_SOURCE_PRECEDENCE = Object.freeze(["customer_message", "canonical_state", "crm_structured", "meta_referral", "unknown"]);

export function adaptLeadContext(row = {}) {
  return Object.freeze({
    lead_id: row.id == null ? null : String(row.id),
    customer_name: row.customer_name ?? null,
    legacy_qualification_status: row.qualification_status ?? null,
    legacy_priority: row.priority ?? null,
    intent_summary: row.intent_summary ?? "",
    crm_model_interest: row.model_interest ?? null,
    routing_status: row.routing_status ?? null,
    assigned_seller_user_id: row.assigned_seller_user_id ?? null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    do_not_contact: row.do_not_contact === true,
  });
}
