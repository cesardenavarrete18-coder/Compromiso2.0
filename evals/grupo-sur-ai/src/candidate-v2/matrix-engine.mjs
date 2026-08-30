const FINANCED_MODALITIES = new Set(["financing", "savings_plan", "credit", "used_plus_financing"]);
const TRADE_FIELDS = ["brand", "model", "version", "year", "km"];
const ACTIVE_INTENTS = new Set(["active", "action_ready"]);

const known = (field) => field?.status === "known";
const conflicting = (field) => field?.status === "conflicting";
const value = (field) => field?.value;
const reason = (rule, evidence = []) => ({ rule, evidence });

function exactModel(profile) {
  const model = value(profile.model_interest);
  return known(profile.model_interest) && !conflicting(profile.model_interest) && Boolean(typeof model === "string" ? model.trim() : model?.model);
}

function modality(profile) { return known(profile.purchase_modality) ? value(profile.purchase_modality) : null; }
function definedModality(profile) { const current = modality(profile); return Boolean(current && !["unknown", "undecided"].includes(current)); }
function intent(profile) { return known(profile.commercial_intent) ? value(profile.commercial_intent) : null; }
function evidenceOf(...fields) { return fields.flatMap((field) => field?.evidence || []); }
function tradeKnown(profile, name) { return known(profile.trade_in?.[name]) && !conflicting(profile.trade_in[name]); }
function hasTrade(profile) { return known(profile.has_trade_in) && value(profile.has_trade_in) === "yes"; }
function targetKnown(profile) {
  if (!known(profile.target_installment)) return false;
  const target = value(profile.target_installment) || {};
  return [target.amount, target.minimum, target.maximum].some((item) => typeof item === "number" && item >= 0) || target.accepted_authorized_anchor === true;
}

export function calculateInitialCapacity(profile) {
  const cashKnown = known(profile.cash_available);
  const cashAmount = cashKnown ? Number(value(profile.cash_available)?.amount ?? value(profile.cash_available) ?? 0) : null;
  const authorizedTrade = known(profile.trade_in_authorized_value) && profile.trade_in_authorized_value.source === "authorized_commercial_source";
  const tradeAmount = authorizedTrade ? Number(value(profile.trade_in_authorized_value)?.amount ?? value(profile.trade_in_authorized_value) ?? 0) : null;
  const used = hasTrade(profile);
  const components = [cashAmount, tradeAmount].filter((item) => item !== null && Number.isFinite(item));
  const knownAmount = components.length ? components.reduce((sum, item) => sum + item, 0) : null;
  let status = "unknown";
  if (cashKnown && !used) status = "complete";
  else if (cashKnown && used && authorizedTrade) status = "complete";
  else if (cashKnown || authorizedTrade) status = "partial";
  return {
    known_amount: knownAmount,
    currency: value(profile.cash_available)?.currency || value(profile.trade_in_authorized_value)?.currency || "ARS",
    cash_component: cashAmount,
    trade_in_authorized_component: tradeAmount,
    status,
    pending_components: used && !authorizedTrade ? ["trade_in_authorized_value"] : [],
    reasons: [reason("M14_INITIAL_CAPACITY_CODE_ONLY", evidenceOf(profile.cash_available, profile.trade_in_authorized_value))],
  };
}

function tradeInValuation(profile) {
  if (known(profile.trade_in_authorized_value) && profile.trade_in_authorized_value.source === "authorized_commercial_source") return "authorized";
  if (profile.operational?.trade_in_valuation_open || (hasTrade(profile) && TRADE_FIELDS.every((name) => tradeKnown(profile, name)))) return "pending";
  if (known(profile.trade_in_customer_estimate)) return "customer_estimate";
  return "not_requested";
}

function profileCompleteness(profile, unqualified) {
  if (unqualified) return { complete: false, missing: [], reasons: [reason("M14_PROFILE_NOT_APPLICABLE_UNQUALIFIED")] };
  const missing = [];
  if (!exactModel(profile)) missing.push("model_interest");
  if (!definedModality(profile)) missing.push("purchase_modality");
  const currentModality = modality(profile);
  if (FINANCED_MODALITIES.has(currentModality)) {
    if (!known(profile.cash_available) || conflicting(profile.cash_available)) missing.push("cash_available");
    if (!targetKnown(profile) || conflicting(profile.target_installment)) missing.push("target_installment");
    if (hasTrade(profile)) for (const name of TRADE_FIELDS) if (!tradeKnown(profile, name)) missing.push(`trade_in.${name}`);
  }
  if (currentModality === "cash") {
    const active = ACTIVE_INTENTS.has(intent(profile));
    return { complete: missing.length === 0 && active, missing, reasons: [reason(active ? "M14_CASH_PROFILE_COMPLETE_RULE" : "M14_CASH_REQUIRES_ACTIVE_INTENT", evidenceOf(profile.model_interest, profile.purchase_modality, profile.commercial_intent))] };
  }
  return { complete: missing.length === 0, missing, reasons: [reason("M14_MODALITY_SPECIFIC_REQUIRED_FIELDS", missing)] };
}

function isImmediate(profile) {
  const deposit = value(profile.deposit_intent); const visit = value(profile.visit_intent); const timeframe = value(profile.purchase_timeframe)?.bucket;
  return ["ready", "confirmed"].includes(deposit)
    || ["requested", "scheduled"].includes(visit)
    || ["documentation"].includes(value(profile.commercial_action_request))
    || (["explicit", "repeated"].includes(value(profile.human_request)) && intent(profile) === "action_ready")
    || (ACTIVE_INTENTS.has(intent(profile)) && ["immediate", "within_7_days"].includes(timeframe) && (known(profile.cash_available) || targetKnown(profile)));
}

function unqualifiedCause(profile, hardStop) {
  if (hardStop?.qualification === "unqualified") return hardStop.code;
  if (profile.operational?.do_not_contact) return "M14_DNC_UNQUALIFIED";
  if (intent(profile) === "none" && profile.operational?.definitive_rejection) return "M14_DEFINITIVE_NO_INTENT";
  return null;
}

function qualification(profile, hardStop) {
  const cause = unqualifiedCause(profile, hardStop);
  if (cause) return { status: "unqualified", reasons: [reason(cause, hardStop?.evidence || [])] };
  if (profile.operational?.prior_qualification === "qualified") return { status: "qualified", reasons: [reason("M14_PRESERVE_SUPPORTED_PRIOR_QUALIFICATION")] };
  const model = exactModel(profile); const commercialIntent = intent(profile); const active = ACTIVE_INTENTS.has(commercialIntent);
  if (model && isImmediate(profile)) return { status: "qualified", reasons: [reason("M14_IMMEDIATE_ACTION_PATH", evidenceOf(profile.model_interest, profile.deposit_intent, profile.visit_intent))] };
  const currentModality = modality(profile);
  if (model && currentModality === "cash" && active) return { status: "qualified", reasons: [reason("M14_EXPLICIT_CASH_PATH", evidenceOf(profile.model_interest, profile.purchase_modality, profile.commercial_intent))] };
  const usableTimeframe = ["immediate", "within_7_days", "within_90_days"].includes(value(profile.purchase_timeframe)?.bucket);
  const tradeSignalCount = ["brand", "model", "year", "km"].filter((name) => tradeKnown(profile, name)).length;
  const actionable = known(profile.cash_available) || targetKnown(profile) || tradeSignalCount >= 2 || usableTimeframe || ["requested", "scheduled"].includes(value(profile.visit_intent)) || ["ready", "confirmed"].includes(value(profile.deposit_intent));
  if (model && definedModality(profile) && actionable && active) return { status: "qualified", reasons: [reason("M14_NORMAL_QUALIFICATION_PATH", evidenceOf(profile.model_interest, profile.purchase_modality, profile.cash_available, profile.target_installment))] };
  return { status: "follow_up", reasons: [reason("M14_FOLLOW_UP_DEFAULT_NO_SUFFICIENT_PATH", evidenceOf(profile.model_interest, profile.purchase_modality, profile.commercial_intent))] };
}

function temperature(profile, qualificationStatus) {
  if (qualificationStatus === "unqualified") return { status: "cold", reasons: [reason("M14_UNQUALIFIED_ALWAYS_COLD")] };
  if (isImmediate(profile)) return { status: "hot", reasons: [reason("M14_IMMEDIATE_ACTION_HOT", evidenceOf(profile.deposit_intent, profile.visit_intent, profile.purchase_timeframe))] };
  const timeframe = value(profile.purchase_timeframe)?.bucket;
  const noCapacity = known(profile.cash_available) && Number(value(profile.cash_available)?.amount ?? value(profile.cash_available)) === 0
    && known(profile.target_installment) && Number(value(profile.target_installment)?.amount ?? value(profile.target_installment)) === 0;
  if (profile.operational?.event_type === "reminder_tick" && profile.operational?.silence_minutes < 1440 && profile.operational?.prior_temperature) return { status: profile.operational.prior_temperature, reasons: [reason("M14_TWO_HOUR_REMINDER_PRESERVES_TEMPERATURE")] };
  if (timeframe === "long_term" || noCapacity || profile.operational?.silence_minutes >= 1440 || intent(profile) === "none") return { status: "cold", reasons: [reason(timeframe === "long_term" ? "M14_LONG_TERM_COLD" : noCapacity ? "M14_NO_CURRENT_CAPACITY_COLD" : profile.operational?.silence_minutes >= 1440 ? "M14_24H_SILENCE_COLD" : "M14_NO_INTENT_COLD")] };
  const constructive = ACTIVE_INTENTS.has(intent(profile)) || definedModality(profile) || known(profile.cash_available) || targetKnown(profile) || hasTrade(profile) || ["preference", "explicit", "repeated"].includes(value(profile.human_request));
  if (constructive) return { status: "warm", reasons: [reason("M14_CONSTRUCTIVE_COMMERCIAL_PARTICIPATION_WARM")] };
  return { status: "cold", reasons: [reason("M14_EXPLORATORY_OR_UNKNOWN_COLD")] };
}

function commercialTags(profile, temperatureStatus) {
  const tags = new Set(); const current = modality(profile);
  if (["financing", "credit", "used_plus_financing"].includes(current)) tags.add("financiacion");
  if (current === "savings_plan" || value(profile.modalities_considered)?.includes("savings_plan")) tags.add("plan_de_ahorro");
  if (current === "cash" || value(profile.modalities_considered)?.includes("cash")) tags.add("contado");
  if (current === "credit") tags.add("credito");
  if (hasTrade(profile)) tags.add("con_usado");
  if (temperatureStatus === "hot") tags.add("urgente");
  if ((profile.objections || []).some((item) => ["trust", "fraud"].includes(item.type) && item.status === "open")) tags.add("desconfiado");
  if ((profile.objections || []).some((item) => ["price", "installment"].includes(item.type)) || known(profile.cash_available) || targetKnown(profile) || known(profile.trade_in_customer_estimate)) tags.add("precio");
  const noCapacity = known(profile.cash_available) && Number(value(profile.cash_available)?.amount ?? value(profile.cash_available)) === 0
    && known(profile.target_installment) && Number(value(profile.target_installment)?.amount ?? value(profile.target_installment)) === 0;
  if (noCapacity) tags.add("sin_capacidad_economica_detectada");
  if ((profile.correction_history || []).some((item) => item.field === "model_interest" && item.event === "explicit_correction")) tags.add("cambio_de_modelo");
  return [...tags];
}

function handoff(profile, qualificationStatus, temperatureStatus, hardStop, config) {
  const prior = profile.operational?.prior_handoff_status;
  const routing = profile.operational?.routing_state || {};
  const owner = routing.handoff_owner || profile.operational?.takeover?.owner;
  const acceptedAt = routing.handoff_accepted_at;
  if (prior === "handed_off" && owner && acceptedAt) return { status: "handed_off", reasons: [reason("M14_VERIFIED_HANDOFF_ACCEPTANCE", [{ owner, accepted_at: acceptedAt }])] };
  if (hardStop?.after_sales) return { status: "handoff_required", reasons: [reason("M14_AFTER_SALES_REQUIRED", hardStop.evidence)] };
  if (profile.operational?.do_not_contact || hardStop?.close) return { status: "continue_ai", reasons: [reason("M14_CLOSURE_INDEPENDENT_FROM_HANDOFF")] };
  if (prior === "handoff_required") return { status: "handoff_required", reasons: [reason("M14_PRESERVE_REQUIRED_HANDOFF")] };
  if (prior === "handed_off") return { status: "handoff_required", reasons: [reason("M14_HANDED_OFF_REQUIRES_OWNER_AND_ACCEPTANCE")] };
  const routingStatus = routing.tiktok_identifier_status;
  const identifierAttempts = Number(routing.identifier_prompt_attempts || 0);
  if (["invalid", "inactive", "ambiguous", "conflicting", "unresolvable"].includes(routingStatus) || (routingStatus === "absent" && identifierAttempts >= 1)) return { status: "handoff_required", reasons: [reason("M14_TIKTOK_IDENTIFIER_REQUIRES_SUPERVISOR", [{ status: routingStatus, attempts: identifierAttempts }])] };
  if (["explicit", "repeated"].includes(value(profile.human_request))) return { status: "handoff_required", reasons: [reason("M14_EXPLICIT_HUMAN_REQUEST", evidenceOf(profile.human_request))] };
  if (value(profile.commercial_action_request) === "documentation") return { status: "handoff_required", reasons: [reason("M14_DOCUMENTATION_ACTION_REQUIRED", evidenceOf(profile.commercial_action_request))] };
  if (qualificationStatus === "qualified" && temperatureStatus === "hot") return { status: "handoff_required", reasons: [reason("M14_QUALIFIED_HOT_REQUIRED")] };
  if (["ready", "confirmed"].includes(value(profile.deposit_intent)) || ["requested", "scheduled"].includes(value(profile.visit_intent))) return { status: "handoff_required", reasons: [reason("M14_IMMEDIATE_DEPOSIT_OR_VISIT_REQUIRED")] };
  const severeObjection = (profile.objections || []).some((item) => ["fraud", "privacy", "legal"].includes(item.type) && item.status === "open");
  if (severeObjection || profile.operational?.frustrated || profile.operational?.repeated_known_question || profile.operational?.no_progress_attempts >= 2) return { status: "handoff_required", reasons: [reason(severeObjection ? "M14_SEVERE_OBJECTION_REQUIRED" : profile.operational?.frustrated ? "M14_FRUSTRATION_REQUIRED" : profile.operational?.repeated_known_question ? "M14_REPEATED_KNOWN_QUESTION_REQUIRED" : "M14_TWO_NO_PROGRESS_ATTEMPTS_REQUIRED")] };
  if (profile.operational?.substantive_ai_turns >= config.substantive_turn_limit) return { status: "handoff_required", reasons: [reason("M14_SUBSTANTIVE_TURN_LIMIT_REQUIRED", [{ turns: profile.operational.substantive_ai_turns, limit: config.substantive_turn_limit, reminders_excluded: true }])] };
  if (qualificationStatus === "qualified" && temperatureStatus === "warm") return { status: "handoff_recommended", reasons: [reason("M14_QUALIFIED_WARM_RECOMMENDED")] };
  if (qualificationStatus === "follow_up" && temperatureStatus === "hot") return { status: "handoff_recommended", reasons: [reason("M14_FOLLOW_UP_HOT_RECOMMENDED")] };
  if ((profile.objections || []).some((item) => item.status === "open" && ["trust", "technical", "commercial"].includes(item.type))) return { status: "handoff_recommended", reasons: [reason("M14_COMPLEX_OPEN_OBJECTION_RECOMMENDED")] };
  return { status: "continue_ai", reasons: [reason("M14_CONTINUE_AI_NO_HANDOFF_CAUSE")] };
}

function nextMissingTradeGroup(missing) {
  if (missing.includes("trade_in.brand") || missing.includes("trade_in.model")) return { code: "obtain_trade_in_brand_model", fields: ["trade_in.brand", "trade_in.model"].filter((item) => missing.includes(item)) };
  if (missing.includes("trade_in.version") || missing.includes("trade_in.year")) return { code: "obtain_trade_in_version_year", fields: ["trade_in.version", "trade_in.year"].filter((item) => missing.includes(item)) };
  if (missing.includes("trade_in.km")) return { code: "obtain_trade_in_km", fields: ["trade_in.km"] };
  return null;
}

function decideNextAction(profile, completeness, handoffStatus, hardStop, context) {
  if (hardStop?.security) return { code: "refuse_and_close_security", ask_fields: [], reasons: [reason("M14_SECURITY_REFUSAL_AND_CLOSE", hardStop.evidence)] };
  if (handoffStatus === "handed_off") return { code: profile.operational?.event_type === "customer_message" ? "notify_human_no_ai_response" : "no_ai_response", ask_fields: [], reasons: [reason("M14_HUMAN_ALREADY_ACCEPTED")] };
  if (profile.operational?.do_not_contact || hardStop?.block_automatic_output || profile.operational?.takeover?.active) return { code: "no_automatic_response", ask_fields: [], reasons: [reason("M14_AUTOMATION_HARD_BLOCK")] };
  if (hardStop?.after_sales || context.service_intent === "after_sales") return { code: "handoff_to_after_sales", ask_fields: [], reasons: [reason("M14_AFTER_SALES_ROUTING")] };
  if (profile.operational?.event_type === "reminder_tick" && profile.operational?.silence_minutes >= 1440 && profile.operational?.reminders_sent >= 1) return { code: "stop_automatic_reminders_and_pause", ask_fields: [], reasons: [reason("M14_SINGLE_REMINDER_LIMIT_24H")] };
  if (profile.operational?.event_type === "reminder_tick" && profile.operational?.silence_minutes < 120) return { code: "wait", ask_fields: [], reasons: [reason("M14_REMINDER_NOT_YET_DUE")] };
  const ambiguity = (context.ambiguities || [])[0];
  if (ambiguity?.kind === "cash_meaning") return { code: "clarify_cash_meaning", ask_fields: [ambiguity.field], reasons: [reason("M14_ACTIONABLE_AMBIGUITY_FIRST", ambiguity.evidence)] };
  if (ambiguity?.kind === "currency_or_scale") return { code: "clarify_cash_currency_and_scale", ask_fields: [ambiguity.field], reasons: [reason("M14_ACTIONABLE_AMBIGUITY_FIRST", ambiguity.evidence)] };
  if (ambiguity?.kind === "model_comparison") return { code: "clarify_models_then_cash", after_answer: "obtain_cash_available", ask_fields: ["cash_available"], reasons: [reason("M14_MODEL_COMPARISON_PRESERVES_INTEREST", ambiguity.evidence)] };
  if (context.commercial_fact_manipulation) return { code: "refuse_false_claim_and_offer_verified_help", ask_fields: [], reasons: [reason("M14_REFUSE_COMMERCIAL_FACT_MANIPULATION")] };
  const fact = context.commercial_fact_context;
  if (fact && fact.status !== "none") {
    if (fact.status === "authorized") {
      if (fact.topic === "equipment") return { code: "answer_spec_then_cash", after_answer: "obtain_cash_available", ask_fields: ["cash_available"], reasons: [reason("M14_AUTHORIZED_SPEC_THEN_ONE_FIELD", fact.evidence)] };
      if (fact.topic === "exact_variant") return { code: "answer_exact_variant_then_cash", after_answer: "obtain_cash_available", ask_fields: ["cash_available"], reasons: [reason("M14_AUTHORIZED_VARIANT_THEN_ONE_FIELD", fact.evidence)] };
    }
    if (fact.status === "conflicting") return { code: "escalate_source_conflict", ask_fields: [], reasons: [reason("M14_FACT_SOURCE_CONFLICT", fact.evidence)] };
    if (fact.status === "not_catalogued") return { code: "verify_version_with_human", ask_fields: [], reasons: [reason("M14_VARIANT_NOT_CATALOGUED", fact.evidence)] };
    if (fact.status === "unverified" && fact.topic === "campaign_validity") return { code: "verify_current_plan", ask_fields: [], reasons: [reason("M14_VERIFY_CURRENT_PLAN", fact.evidence)] };
    if (fact.status === "variable_confirmation_required" && fact.topic === "delivery_date") return { code: "urgent_handoff_for_delivery_check", ask_fields: [], reasons: [reason("M14_URGENT_DELIVERY_CONFIRMATION", fact.evidence)] };
    if (fact.status === "variable_confirmation_required") return { code: "handoff_for_stock_confirmation", ask_fields: [], reasons: [reason("M14_VARIABLE_FACT_CONFIRMATION", fact.evidence)] };
    if (fact.status === "unavailable" && fact.topic === "payload_capacity") return { code: "handoff_with_question_summary", ask_fields: [], reasons: [reason("M14_UNAVAILABLE_FACT_WITH_SUMMARY", fact.evidence)] };
    if (fact.status === "unavailable") return { code: "handoff_for_unavailable_spec", ask_fields: [], reasons: [reason("M14_UNAVAILABLE_FACT", fact.evidence)] };
  }
  if (handoffStatus === "handoff_required") {
    if (["ready", "confirmed"].includes(value(profile.deposit_intent))) return { code: "handoff_now_for_deposit", ask_fields: [], reasons: [reason("M14_DEPOSIT_CAUSAL_HANDOFF")] };
    if (["requested", "scheduled"].includes(value(profile.visit_intent))) return { code: "handoff_now_for_visit", ask_fields: [], reasons: [reason("M14_VISIT_CAUSAL_HANDOFF")] };
    if (["explicit", "repeated"].includes(value(profile.human_request))) return { code: "handoff_now_for_human_request", ask_fields: [], reasons: [reason("M14_HUMAN_REQUEST_CAUSAL_HANDOFF")] };
    if (value(profile.commercial_action_request) === "documentation") return { code: modality(profile) === "credit" ? "handoff_now_for_credit" : "handoff_now_with_complete_summary", ask_fields: [], reasons: [reason("M14_DOCUMENTATION_CAUSAL_HANDOFF")] };
    return { code: "pause_ai_and_handoff", ask_fields: [], reasons: [reason("M14_REQUIRED_HANDOFF_STOPS_COLLECTION")] };
  }
  const routing = profile.operational?.routing_state || {};
  if (routing.tiktok_identifier_status === "absent" && Number(routing.identifier_prompt_attempts || 0) === 0) return { code: "ask_tiktok_identifier_once", ask_fields: ["routing.tiktok_identifier"], reasons: [reason("M14_TIKTOK_SINGLE_IDENTIFIER_QUESTION")] };
  const centralConflict = (profile.contradictions || [])[0];
  if (centralConflict) return { code: centralConflict.field === "cash_available" ? "resolve_cash_available_conflict" : "resolve_central_contradiction", ask_fields: [centralConflict.field], reasons: [reason("M14_RESOLVE_ONE_CENTRAL_CONFLICT", centralConflict.evidence)] };
  const timeframe = value(profile.purchase_timeframe)?.bucket;
  if (timeframe === "long_term" && context.qualification_status === "qualified") return { code: "schedule_nurture", ask_fields: [], reasons: [reason("M14_QUALIFIED_LONG_TERM_NURTURE")] };
  if (timeframe === "long_term" && context.temperature_status === "cold") return { code: "offer_optional_future_nurture_and_pause", ask_fields: [], reasons: [reason("M14_FOLLOW_UP_NO_CAPACITY_NURTURE")] };
  if (context.pii_context?.supplied) return { code: "continue_without_repeating_phone", after_answer: completeness.missing.includes("cash_available") ? "obtain_cash_available" : null, ask_fields: completeness.missing.includes("cash_available") ? ["cash_available"] : [], reasons: [reason("M14_PII_ALREADY_SUPPLIED")] };
  const afterAnswer = context.concrete_query?.present === true;
  if (afterAnswer && context.concrete_query?.blocks_progress === true) return { code: "answer_authorized_information_only", ask_fields: [], reasons: [reason("M14_CUSTOMER_LIMITED_SCOPE_NO_INTERROGATION")] };
  let next = null;
  if (completeness.missing.includes("purchase_modality")) next = { code: "obtain_purchase_modality", fields: ["purchase_modality"] };
  else if (context.just_mentioned_trade_in && hasTrade(profile)) next = nextMissingTradeGroup(completeness.missing);
  if (!next && completeness.missing.includes("model_interest")) next = { code: "obtain_model_interest", fields: ["model_interest"] };
  else if (!next && completeness.missing.includes("cash_available")) next = { code: "obtain_cash_available", fields: ["cash_available"] };
  else if (!next && completeness.missing.includes("target_installment")) next = { code: "obtain_target_installment", fields: ["target_installment"] };
  else if (!next) next = nextMissingTradeGroup(completeness.missing);
  if (!next) next = { code: handoffStatus === "handoff_recommended" ? "summarize_and_offer_handoff" : "summarize_validated_profile", fields: [] };
  return {
    code: afterAnswer ? "answer_customer_query_then_continue" : next.code,
    after_answer: afterAnswer ? next.code : null,
    ask_fields: next.fields,
    reasons: [reason(afterAnswer ? "M14_ANSWER_CONCRETE_QUERY_FIRST" : "M14_NEXT_VALIDATED_MISSING_FIELD", next.fields)],
  };
}

function conversationStatus(profile, qualificationStatus, handoffStatus, hardStop) {
  if (profile.operational?.do_not_contact || hardStop?.close || qualificationStatus === "unqualified" && hardStop?.non_commercial && !hardStop?.after_sales) return { status: "closed", reasons: [reason("M14_DETERMINISTIC_CLOSURE")] };
  if (handoffStatus === "handoff_required") return { status: "paused", reasons: [reason("M14_REQUIRED_HANDOFF_PAUSES_AI")] };
  if (handoffStatus === "handed_off") return { status: "open", reasons: [reason("M14_ACCEPTED_HUMAN_CONVERSATION_OPEN")] };
  if (profile.operational?.event_type === "reminder_tick" && profile.operational?.silence_minutes >= 1440) return { status: "paused", reasons: [reason("M14_24H_REMINDER_PAUSE")] };
  if (value(profile.purchase_timeframe)?.bucket === "long_term") return { status: "paused", reasons: [reason("M14_LONG_TERM_NURTURE_PAUSE")] };
  return { status: profile.operational?.conversation_status === "paused" ? "paused" : "open", reasons: [reason("M14_OPEN_OR_EXISTING_PAUSE")] };
}

export function evaluateMatrixV14(profile, context = {}, config = {}) {
  const settings = { substantive_turn_limit: 4, ...config };
  const hardStop = context.hard_stop || null;
  const qualified = qualification(profile, hardStop);
  let temp = temperature(profile, qualified.status);
  if (context.commercial_fact_context?.status === "variable_confirmation_required" && context.commercial_fact_context?.topic === "delivery_date") temp = { status: "hot", reasons: [reason("M14_URGENT_DELIVERY_CHECK_HOT", context.commercial_fact_context.evidence)] };
  const completeness = profileCompleteness(profile, qualified.status === "unqualified");
  let handoffDecision = handoff(profile, qualified.status, temp.status, hardStop, settings);
  const fact = context.commercial_fact_context;
  if (!["handed_off", "handoff_required"].includes(handoffDecision.status) && fact?.topic === "delivery_date" && fact?.status === "variable_confirmation_required") handoffDecision = { status: "handoff_required", reasons: [reason("M14_URGENT_DELIVERY_FACT_REQUIRED")] };
  else if (handoffDecision.status === "continue_ai" && (context.commercial_fact_manipulation || ["unavailable", "conflicting", "not_catalogued", "variable_confirmation_required", "unverified"].includes(fact?.status))) handoffDecision = { status: "handoff_recommended", reasons: [reason("M14_COMMERCIAL_FACT_ESCALATION")] };
  const conversation = conversationStatus(profile, qualified.status, handoffDecision.status, hardStop);
  const next = decideNextAction(profile, completeness, handoffDecision.status, hardStop, { ...context, qualification_status: qualified.status, temperature_status: temp.status });
  const valuation = tradeInValuation(profile);
  return {
    matrix_version: "1.4",
    qualification_status: qualified.status,
    commercial_temperature: temp.status,
    commercial_profile_complete: completeness.complete,
    missing_commercial_fields: completeness.missing,
    commercial_tags: commercialTags(profile, temp.status),
    handoff_status: handoffDecision.status,
    conversation_status: conversation.status,
    do_not_contact: Boolean(profile.operational?.do_not_contact || hardStop?.do_not_contact),
    next_action: next.code,
    next_action_plan: next,
    initial_capacity: calculateInitialCapacity(profile),
    trade_in_profile_complete: hasTrade(profile) && TRADE_FIELDS.every((name) => tradeKnown(profile, name)),
    trade_in_valuation_status: valuation,
    decision_reasons: {
      qualification_status: qualified.reasons,
      commercial_temperature: temp.reasons,
      commercial_profile_complete: completeness.reasons,
      handoff_status: handoffDecision.reasons,
      conversation_status: conversation.reasons,
      do_not_contact: [reason(hardStop?.do_not_contact ? "M14_HARD_DNC" : "M14_DNC_PRESERVED")],
      next_action: next.reasons,
    },
  };
}

export const matrixInternals = { known, conflicting, exactModel, targetKnown, tradeInValuation };
