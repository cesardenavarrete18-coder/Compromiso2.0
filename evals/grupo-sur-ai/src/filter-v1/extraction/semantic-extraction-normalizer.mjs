import { emptySemanticExtraction, FORBIDDEN_EFFECT_FIELDS } from "./semantic-extraction-contract.mjs";

const allowed = new Set(Object.keys(emptySemanticExtraction()));

export function normalizeSemanticExtraction(candidate) {
  const normalized = emptySemanticExtraction();
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(candidate, key)) normalized[key] = structuredClone(candidate[key]);
  const ignored = Object.keys(candidate).filter(key => !allowed.has(key));
  const forbidden = ignored.filter(key => FORBIDDEN_EFFECT_FIELDS.includes(key));

  // Queries are not purchase declarations, regardless of a provider proposal.
  if (["installment_offer", "model_value", "delivery_advance", "subscription_amount", "ambiguous_initial_amount", "technical_question"].includes(normalized.query_intent) && normalized.purchase_mode_literal == null) normalized.purchase_mode_statement = "not_present";
  if (normalized.trade_in_intent === "not_present") normalized.vehicle_mentions = normalized.vehicle_mentions.map(vehicle => vehicle.role === "trade_in" ? { ...vehicle, role: "owned_only" } : vehicle);
  for (const amount of normalized.amount_mentions) {
    if (amount.certainty === "ambiguous") { amount.numeric_value = null; amount.currency = null; }
    if (amount.numeric_value === 0) amount.numeric_value = 0;
  }
  return Object.freeze({ extraction: normalized, ignored_fields: ignored, forbidden_effect_fields: forbidden });
}
