import { resolveContactTiming } from "../contact-timing-resolver.mjs";

const foldText = value => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const USED_VEHICLE_PATTERN = /\busad[oa]s?\b/;

// Family Q: a vehicle_mention's own evidence is scoped to that specific mention (the
// extractor's contract requires evidence literal to support that mention, not the message
// at large) - so testing "usado" against a mention's own literal/evidence, rather than the
// whole message, correctly distinguishes "quiero un Tera 0km, tengo un 208 usado para
// entregar" (usado describes the trade-in mention, not the target) from "cuanto vale mi 208
// usado" (usado describes the target/subject mention itself).
function mentionMentionsUsedVehicle(vehicle) {
  const evidenceList = Array.isArray(vehicle?.evidence) ? vehicle.evidence : vehicle?.evidence ? [vehicle.evidence] : [];
  return [vehicle?.literal, ...evidenceList.map(item => item?.literal)].some(text => USED_VEHICLE_PATTERN.test(foldText(text)));
}

// Family R4 (2nd audit round): when the SAME turn names both a target-ish vehicle and a
// trade-in/owned one, which is being asked about cannot come from role priority or model
// matching alone - a 0km target and a used unit of the SAME model line ("Peugeot 208 0km"
// target + "Peugeot 208 2019" trade-in) must still be told apart correctly. A mention's own
// evidence is scoped to that specific mention (Family Q's own doctrine, see
// mentionMentionsUsedVehicle above), so the mention whose evidence contains the actual
// price/value-question wording is the one being asked about.
const PRICE_QUESTION_ANCHOR = /\b(cuanto|toman|tomas|toma|vale|sale|cuesta|precio|valor)\b/;
function mentionAnsweredByQuestion(vehicle) {
  const evidenceList = Array.isArray(vehicle?.evidence) ? vehicle.evidence : vehicle?.evidence ? [vehicle.evidence] : [];
  return [vehicle?.literal, ...evidenceList.map(item => item?.literal)].some(text => PRICE_QUESTION_ANCHOR.test(foldText(text)));
}

// Family Q2: contextual mentions can legitimately be reconstructed from conversation
// history (for example "Tiene 200.000 km" after the assistant asked about a Peugeot 307),
// but a role-only fallback must never overwrite canonical trade-in identity when the
// current customer message does not name that vehicle at all. This is what allowed
// "Las cuotas?" to turn a stored 307 into the target Partner: the provider emitted a
// contextual trade_in mention sourced from prior assistant text. Structured
// extraction.trade_in_vehicle remains authoritative for history-backed attribute updates;
// this guard applies only to the vehicle_mentions fallback.
function tradeMentionAnchoredInCurrentMessage(vehicle, filterInput) {
  const current = foldText(filterInput?.current_message?.text ?? "").trim();
  if (!current) return true; // preserve offline/unit callers that do not provide turn context
  const candidates = [vehicle?.model_text, vehicle?.literal]
    .map(foldText)
    .map(value => value.trim())
    .filter(Boolean);
  return candidates.some(value => current.includes(value));
}

export function semanticExtractionToEngine(extraction, filterInput = {}) {
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
  const trade = extraction.vehicle_mentions.find(vehicle => vehicle.role === "trade_in" && tradeMentionAnchoredInCurrentMessage(vehicle, filterInput));
  // brand_text/version_text are nullable per FILTER_V1_PROVIDER_SCHEMA (the provider can
  // report a trade-in vehicle without knowing its brand/version yet). An absent sub-field
  // must read as "missing" to the engine, not as a null "known" value - so omit it entirely
  // rather than passing the null through (Family O).
  if (trade) extractedFields.trade_in_vehicle = Object.fromEntries(Object.entries({ brand: trade.brand_text, model: trade.model_text, version: trade.version_text }).filter(([, value]) => value !== null && value !== undefined));
  // Structured trade-in extraction can carry history-backed year/km/model attributes and
  // therefore remains authoritative even when the current short answer does not repeat the
  // vehicle name (for example "Tiene 200.000 km"). An explicit parent rejection is handled
  // separately by has_trade_in=no and must not be converted back to yes here.
  // Family R1: `value?.value ?? value` fell back to the WHOLE {value,status,evidence} shape
  // whenever .value was null/undefined - which includes a malformed known/null sub-field
  // AND every ordinary missing one (missingField()'s own .value is null). applyExtractedFields
  // then wrapped that nested object in ANOTHER field(), persisting a "known" field whose
  // value was itself a known/null-shaped object. Only ever pass through a scalar (or the
  // explicitly_unknown marker); omit the entry otherwise so it reads as missing downstream.
  if (extraction.trade_in_vehicle) extractedFields.trade_in_vehicle = Object.fromEntries(Object.entries(extraction.trade_in_vehicle).map(([key, value]) => [key === "mileage_km" ? "km" : key, value?.status === "explicitly_unknown" ? { semantic_status: "explicitly_unknown", evidence: value.evidence } : value?.value]).filter(([, value]) => value !== null && value !== undefined));
  const targetMentions = extraction.vehicle_mentions.filter(vehicle => ["target", "target_candidate"].includes(vehicle.role));
  const targetModel = targetMentions.length === 1 && targetMentions[0].role === "target" ? targetMentions[0].model_text ?? targetMentions[0].literal : undefined;
  const subjectMentions = extraction.vehicle_mentions.filter(vehicle => ["target", "target_candidate", "comparison"].includes(vehicle.role));
  // Family R4: a price/value question whose ONLY vehicle mention this turn is the
  // customer's own trade-in/owned vehicle (no competing target-ish mention) must still
  // resolve a subject - otherwise the engine falls back to the persisted commercial target
  // ("¿En cuanto me lo toman?" about an owned 208 silently priced the unrelated 0km 208
  // target). Anchored the same way as the structured trade-in fallback above, so a stale
  // contextually-reconstructed mention never becomes today's price-question subject either.
  const usedVehicleRoleMentions = extraction.vehicle_mentions.filter(vehicle => ["trade_in", "owned_only"].includes(vehicle.role) && tradeMentionAnchoredInCurrentMessage(vehicle, filterInput));
  // Family R4 (2nd audit round): a single subject-ish OR a single used-vehicle-ish mention
  // resolves directly, same as before. When BOTH kinds are present in the same turn, prefer
  // whichever one the question's own evidence answers (mentionAnsweredByQuestion); if that is
  // ambiguous (zero or more than one match), fall back to the target-ish mention, matching
  // Family Q's original behavior for a turn with no clear question anchor on either side.
  const subjectCandidates = [
    ...subjectMentions.map(vehicle => ({ vehicle, usedVehicle: false })),
    ...usedVehicleRoleMentions.map(vehicle => ({ vehicle, usedVehicle: true })),
  ];
  const resolvedSubject = subjectCandidates.length <= 1
    ? subjectCandidates[0]
    : (() => {
        const answered = subjectCandidates.filter(candidate => mentionAnsweredByQuestion(candidate.vehicle));
        if (answered.length === 1) return answered[0];
        const targetLike = subjectCandidates.filter(candidate => !candidate.usedVehicle);
        return targetLike.length === 1 ? targetLike[0] : undefined;
      })();
  const subjectModel = resolvedSubject ? resolvedSubject.vehicle.model_text ?? resolvedSubject.vehicle.literal : undefined;
  const usedVehicleSubject = resolvedSubject ? resolvedSubject.usedVehicle || mentionMentionsUsedVehicle(resolvedSubject.vehicle) : false;
  const correction = extraction.customer_corrections.find(item => item.field === "target_model");
  return {
    query_intent: extraction.query_intent,
    extracted_fields: extractedFields,
    target_model: targetModel,
    turn_subject_model: subjectModel,
    used_vehicle_subject: usedVehicleSubject,
    vehicle_mentions: targetMentions.map(vehicle => ({ role: vehicle.role === "target_candidate" ? "target" : vehicle.role, model: vehicle.model_text ?? vehicle.literal })),
    human_request: extraction.human_request !== null,
    strong_action: extraction.strong_action !== null,
    requested_action: extraction.requested_action ? { type: extraction.requested_action.type, requested_action_at: null, time_expression: extraction.requested_action.time_expression ?? null } : null,
    contact_preference: extraction.contact_preference_expression ? (() => {
      const resolved = resolveContactTiming({ literal: extraction.contact_preference_expression.literal, eventAt: filterInput.event_at, calendar: filterInput.business_calendar ?? { timeZone: filterInput.timezone } });
      return { timing: resolved.timing, literal: extraction.contact_preference_expression.literal, callback_at: resolved.callback_at, callback_window: resolved.callback_window };
    })() : null,
    noncommercial: extraction.do_not_contact !== null,
    customer_corrections: correction ? { target_model: correction.to_literal } : {},
    needs_clarification: extraction.needs_clarification,
  };
}
