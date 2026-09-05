export function semanticExtractionToEngine(extraction) {
  const extractedFields = {};
  if (["cash", "financed"].includes(extraction.purchase_mode_statement)) extractedFields.purchase_mode = extraction.purchase_mode_statement;
  for (const amount of extraction.amount_mentions) {
    if (amount.certainty === "ambiguous" || amount.numeric_value === null) continue;
    if (amount.kind === "down_payment_capacity") extractedFields.down_payment_amount = amount.numeric_value;
    if (amount.kind === "monthly_installment_capacity") extractedFields.monthly_installment_capacity = amount.numeric_value;
  }
  if (extraction.trade_in_intent === "yes") extractedFields.has_trade_in = "yes";
  else if (extraction.trade_in_intent === "no") extractedFields.has_trade_in = "no";
  const owned = extraction.vehicle_mentions.find(vehicle => vehicle.role === "owned_only");
  if (owned) extractedFields.owned_vehicle = { brand: owned.brand_text ?? null, model: owned.model_text ?? owned.literal, version: owned.version_text ?? null };
  const trade = extraction.vehicle_mentions.find(vehicle => vehicle.role === "trade_in");
  if (trade) extractedFields.trade_in_vehicle = { brand: trade.brand_text, model: trade.model_text, version: trade.version_text };
  if (extraction.trade_in_vehicle) extractedFields.trade_in_vehicle = Object.fromEntries(Object.entries(extraction.trade_in_vehicle).map(([key, value]) => [key === "mileage_km" ? "km" : key, value?.status === "explicitly_unknown" ? { semantic_status: "explicitly_unknown", evidence: value.evidence } : value?.value ?? value]));
  const targetMentions = extraction.vehicle_mentions.filter(vehicle => ["target", "target_candidate"].includes(vehicle.role));
  const targetModel = targetMentions.length === 1 && targetMentions[0].role === "target" ? targetMentions[0].model_text ?? targetMentions[0].literal : undefined;
  const subjectMentions = extraction.vehicle_mentions.filter(vehicle => ["target", "target_candidate", "comparison"].includes(vehicle.role));
  const subjectModel = subjectMentions.length === 1 ? subjectMentions[0].model_text ?? subjectMentions[0].literal : undefined;
  const correction = extraction.customer_corrections.find(item => item.field === "target_model");
  return {
    query_intent: extraction.query_intent,
    extracted_fields: extractedFields,
    target_model: targetModel,
    turn_subject_model: subjectModel,
    vehicle_mentions: targetMentions.map(vehicle => ({ role: vehicle.role === "target_candidate" ? "target" : vehicle.role, model: vehicle.model_text ?? vehicle.literal })),
    human_request: extraction.human_request !== null,
    strong_action: extraction.strong_action !== null,
    requested_action: extraction.requested_action ? { type: extraction.requested_action.type, requested_action_at: null, time_expression: extraction.requested_action.time_expression ?? null } : null,
    contact_preference: extraction.contact_preference_expression ? { timing: "unknown", literal: extraction.contact_preference_expression.literal, callback_at: null } : null,
    noncommercial: extraction.do_not_contact !== null,
    customer_corrections: correction ? { target_model: correction.to_literal } : {},
    needs_clarification: extraction.needs_clarification,
  };
}
