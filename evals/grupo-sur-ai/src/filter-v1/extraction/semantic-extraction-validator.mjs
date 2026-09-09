import { ACTION_TYPES, AMOUNT_KINDS, CLARIFICATION_CODES, FORBIDDEN_EFFECT_FIELDS, PURCHASE_MODE_STATEMENTS, SEMANTIC_CERTAINTIES, SEMANTIC_EXTRACTION_SCHEMA_VERSION, SEMANTIC_QUERY_INTENTS, TRADE_IN_INTENTS, VEHICLE_ROLES } from "./semantic-extraction-contract.mjs";

const material = value => value !== null && value !== undefined && value !== false && (!(Array.isArray(value)) || value.length > 0);

function collectForbidden(value, path = "", found = []) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (FORBIDDEN_EFFECT_FIELDS.includes(key)) found.push(next);
    collectForbidden(child, next, found);
  }
  return found;
}

export function validateEvidence(evidence, messages) {
  const entries = Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
  if (!entries.length) return false;
  return entries.every(item => {
    const message = messages.find(candidate => candidate.id === item?.source_message_id);
    return Boolean(message && typeof item.literal === "string" && item.literal.length > 0 && message.text.includes(item.literal));
  });
}

export function validateSemanticExtraction(candidate, extractorInput, { validateEvidenceFields = true } = {}) {
  const errors = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return { valid: false, errors: ["OUTPUT_MUST_BE_OBJECT"], forbidden_effect_fields: [] };
  const forbidden = collectForbidden(candidate);
  if (forbidden.length) errors.push("FORBIDDEN_EFFECT_FIELDS");
  if (candidate.schema_version !== SEMANTIC_EXTRACTION_SCHEMA_VERSION) errors.push("INVALID_SCHEMA_VERSION");
  if (!SEMANTIC_QUERY_INTENTS.includes(candidate.query_intent)) errors.push("INVALID_QUERY_INTENT");
  if (!PURCHASE_MODE_STATEMENTS.includes(candidate.purchase_mode_statement)) errors.push("INVALID_PURCHASE_MODE_STATEMENT");
  if (!TRADE_IN_INTENTS.includes(candidate.trade_in_intent)) errors.push("INVALID_TRADE_IN_INTENT");
  for (const [key, type] of [["human_request", "human_request"], ["strong_action", "strong_action"], ["do_not_contact", "do_not_contact"]])
    if (candidate[key] !== null && (typeof candidate[key] !== "object" || candidate[key]?.type !== type)) errors.push("INVALID_EXCEPTIONAL_SIGNAL");
  if (!Array.isArray(candidate.amount_mentions) || !Array.isArray(candidate.vehicle_mentions) || !Array.isArray(candidate.customer_corrections) || !Array.isArray(candidate.needs_clarification)) errors.push("INVALID_COLLECTIONS");
  for (const amount of candidate.amount_mentions ?? []) {
    if (!AMOUNT_KINDS.includes(amount.kind) || !SEMANTIC_CERTAINTIES.includes(amount.certainty)) errors.push("INVALID_AMOUNT_MENTION");
    if (amount.numeric_value !== null && (!Number.isFinite(amount.numeric_value) || amount.numeric_value < 0)) errors.push("INVALID_AMOUNT_VALUE");
  }
  for (const vehicle of candidate.vehicle_mentions ?? []) if (!VEHICLE_ROLES.includes(vehicle.role) || !SEMANTIC_CERTAINTIES.includes(vehicle.certainty)) errors.push("INVALID_VEHICLE_MENTION");
  if (candidate.requested_action && (!ACTION_TYPES.includes(candidate.requested_action.type) || !SEMANTIC_CERTAINTIES.includes(candidate.requested_action.certainty))) errors.push("INVALID_REQUESTED_ACTION");
  for (const clarification of candidate.needs_clarification ?? []) if (!CLARIFICATION_CODES.includes(clarification.code)) errors.push("INVALID_CLARIFICATION_CODE");
  if (!validateEvidenceFields) return Object.freeze({ valid: errors.length === 0, errors: [...new Set(errors)], forbidden_effect_fields: forbidden });
  const messages = [extractorInput.current_message, ...(extractorInput.recent_conversation ?? [])].filter(Boolean);
  for (const item of [...(candidate.amount_mentions ?? []), ...(candidate.vehicle_mentions ?? []), ...(candidate.customer_corrections ?? []), ...(candidate.needs_clarification ?? []), candidate.requested_action, candidate.contact_preference_expression, candidate.customer_name, candidate.customer_location].filter(material)) {
    if (!validateEvidence(item.evidence, messages)) errors.push("INVALID_OR_MISSING_EVIDENCE");
  }
  for (const item of Object.values(candidate.trade_in_vehicle ?? {}).filter(material)) if (!validateEvidence(item.evidence, messages)) errors.push("INVALID_OR_MISSING_EVIDENCE");
  const signalEvidence = candidate.evidence ?? {};
  const materialSignals = [
    candidate.query_intent !== "none" && "query_intent",
    candidate.purchase_mode_statement !== "not_present" && "purchase_mode_statement",
    candidate.trade_in_intent !== "not_present" && "trade_in_intent",
  ].filter(Boolean);
  for (const key of materialSignals) if (!validateEvidence(signalEvidence[key], messages)) errors.push("INVALID_OR_MISSING_EVIDENCE");
  for (const key of ["human_request", "strong_action", "do_not_contact"])
    if (candidate[key] !== null && !validateEvidence(candidate[key]?.evidence, messages)) errors.push("INVALID_OR_MISSING_EVIDENCE");
  return Object.freeze({ valid: errors.length === 0, errors: [...new Set(errors)], forbidden_effect_fields: forbidden });
}
