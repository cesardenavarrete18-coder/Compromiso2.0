import { createFilterState, deriveCommercialProfile, field, registerOwnedVehicle } from "../contracts.mjs";
import { resolvePlanFact } from "../plan-fact-resolver.mjs";
import { buildCommercialResponsePlan } from "../commercial-response-policy.mjs";
import { contactPriority } from "../contact-priority.mjs";
import { decideHandoff } from "../handoff-policy.mjs";
import { adaptCampaignRows } from "./campaign-adapter.mjs";
import { adaptCatalogRows, resolveModel, resolveModelCandidates } from "./catalog-adapter.mjs";
import { adaptAcquisitionContext } from "./acquisition-context-adapter.mjs";
import { adaptLeadContext } from "./lead-context-adapter.mjs";
import { adaptOperationalControl } from "./operational-control-adapter.mjs";
import { advanceStateVersion, deserializeFilterState } from "./filter-state-persistence.mjs";

const PLAN_INTENTS = Object.freeze({ model_value: "model_reference_value", installment_offer: "installment_offer", delivery_advance: "delivery_advance" });
const provenance = (source, evidence = null) => ({ source, evidence });

function previousState(input, leadContext) {
  if (input?.state) return { state: structuredClone(input.state), state_version: input.state_version ?? 0 };
  if (input && "target_model" in input) return { state: structuredClone(input), state_version: input.state_version ?? 0 };
  const loaded = deserializeFilterState(leadContext.metadata);
  return loaded.status === "loaded" ? loaded : { state: createFilterState(), state_version: 0 };
}

function chooseNextQuestion(profile) {
  const order = ["model", "purchase_mode", "down_payment_amount", "monthly_installment_capacity", "has_trade_in", "trade_in_brand", "trade_in_model", "trade_in_variant", "trade_in_year", "trade_in_km"];
  return order.find(key => !["known", "explicitly_unknown"].includes(profile.components[key])) ?? "contact_preference";
}

function applyExtractedFields(state, extracted = {}) {
  const source = provenance("customer_message");
  for (const key of ["purchase_mode", "down_payment_amount", "monthly_installment_capacity", "has_trade_in"]) {
    if (extracted[key] !== undefined) state[key] = field(extracted[key], "known", source);
  }
  if (extracted.trade_in_vehicle) {
    for (const [key, value] of Object.entries(extracted.trade_in_vehicle)) {
      if (value?.semantic_status === "explicitly_unknown") state.trade_in_vehicle[key] = field(null, "explicitly_unknown", { ...source, evidence: value.evidence ?? null });
      else if (value !== undefined) state.trade_in_vehicle[key] = field(value, "known", source);
    }
  }
  if (extracted.owned_vehicle) return registerOwnedVehicle(state, extracted.owned_vehicle);
  return state;
}

export function runFilterV1Integration(input) {
  const decisionTrace = [];
  const warnings = [];
  const lead = adaptLeadContext(input.lead);
  const operational = adaptOperationalControl(input.conversation_control);
  const catalog = input.catalog?.modelById instanceof Map ? input.catalog : adaptCatalogRows(input.catalog);
  const acquisition = adaptAcquisitionContext(input.attribution, catalog);
  const prior = previousState(input.previous_filter_state, lead);
  const version = advanceStateVersion({ currentStateVersion: prior.state_version, expectedStateVersion: input.expected_state_version ?? prior.state_version });
  if (version.status === "state_conflict") return Object.freeze({ status: "state_conflict", next_state: null, response_plan: null, handoff_decision: null, resolved_facts: [], warnings: ["STATE_VERSION_CONFLICT"], decision_trace: [{ decision: "state_version", result: "conflict", current_state_version: prior.state_version }] });

  let state = prior.state;
  if (!operational.ai_allowed) {
    const handoff = decideHandoff({ humanOwned: true, profileComplete: deriveCommercialProfile(state).complete });
    decisionTrace.push({ decision: "operational_control", result: "no_ai_response", source: "whatsapp_conversation_controls" });
    state.state_version = version.next_state_version;
    return Object.freeze({ status: "suppressed", next_state: state, response_plan: null, handoff_decision: handoff, resolved_facts: [], warnings, decision_trace: decisionTrace });
  }

  const extraction = input.current_extraction ?? {};
  const correctionResolution = resolveModelCandidates(catalog, extraction.customer_corrections?.target_model ? [extraction.customer_corrections.target_model] : []);
  const directMentions = extraction.target_model ? [extraction.target_model] : [];
  const customerResolution = resolveModelCandidates(catalog, directMentions);
  let target = correctionResolution.status === "single" ? correctionResolution.target : null;
  let targetSource = target ? "customer_message" : null;
  if (!target && state.target_model?.status === "known") { target = resolveModel(catalog, state.target_model.value.model ?? state.target_model.value); targetSource = target ? "canonical_state" : null; }
  if (!target && acquisition.referral_target) { target = acquisition.referral_target; targetSource = "meta_referral"; }
  if (!target && customerResolution.status === "single") { target = customerResolution.target; targetSource = "customer_message"; }
  if (!target && lead.crm_model_interest) { target = resolveModel(catalog, lead.crm_model_interest); targetSource = target ? "crm_structured" : null; }
  if (target) {
    state.target_model = field({ brand_id: target.brand_id, brand: target.brand, model_id: target.model_id, model: target.model }, "known", provenance(targetSource));
    decisionTrace.push({ decision: "target_model", result: target.model, model_id: target.model_id, source: targetSource });
  }
  delete state.target_candidates;
  const transientAlternatives = extraction.vehicle_mentions?.filter(item => item.role === "target").map(item => item.model) ?? [];
  if (!target && transientAlternatives.length > 1) warnings.push("CLARIFY_MODEL_TARGET");

  state = applyExtractedFields(state, extraction.extracted_fields);
  if (extraction.requested_action) state.requested_action = structuredClone(extraction.requested_action);
  state.acquisition_context = acquisition;
  state.state_version = version.next_state_version;
  const profile = deriveCommercialProfile(state);
  state.commercial_profile = profile;
  const timing = extraction.contact_preference?.timing ?? state.contact_preference?.timing ?? "unknown";
  const priority = contactPriority({ timing, eventAt: input.event_at, callbackAt: extraction.contact_preference?.callback_at ?? state.contact_preference?.callback_at, calendar: input.business_calendar ?? { timeZone: input.timezone } });
  state.contact_priority = priority;

  const handoff = decideHandoff({ humanOwned: false, doNotContact: lead.do_not_contact, noncommercial: extraction.noncommercial === true, explicitHumanRequest: extraction.human_request === true, strongAction: extraction.strong_action === true, profileComplete: profile.complete, contactTiming: timing });
  state.qualification_status = handoff.qualification_status;
  state.handoff_status = handoff.handoff_status;
  state.next_action = handoff.next_action;
  if (handoff.contact_priority) state.contact_priority = handoff.contact_priority;
  decisionTrace.push({ decision: "commercial_profile", result: profile.complete, component_score: profile.component_score });
  decisionTrace.push({ decision: "handoff", result: handoff.handoff_status, source: extraction.human_request ? "human_request" : extraction.strong_action ? "strong_action" : "profile" });

  const intent = extraction.query_intent ?? "unknown";
  const factSubject = resolveModel(catalog, extraction.turn_subject_model) ?? target;
  const resolvedFacts = [];
  let answerFact = null;
  if (PLAN_INTENTS[intent] && factSubject) {
    answerFact = resolvePlanFact({ targetModelId: factSubject.model_id, campaigns: adaptCampaignRows(input.campaigns), factType: PLAN_INTENTS[intent] });
    resolvedFacts.push(answerFact);
    decisionTrace.push({ decision: `${intent}_fact`, result: answerFact.value, status: answerFact.status, source_campaign_id: answerFact.source_campaign_id });
  } else if (intent === "technical_question") {
    answerFact = { fact_type: "technical_knowledge", status: "requires_knowledge_lookup", value: null, subject_model: factSubject?.model ?? null, subject_model_id: factSubject?.model_id ?? null, source_id: "ai_knowledge_documents" };
    resolvedFacts.push(answerFact);
  }

  const nextQuestion = intent === "ambiguous_initial_amount" ? "clarify_initial_amount_intent" : chooseNextQuestion(profile);
  const responsePlan = handoff.stop_questions
    ? buildCommercialResponsePlan({ intent, handoff: handoff.handoff_status })
    : buildCommercialResponsePlan({ intent, answerFact, facts: resolvedFacts, nextFilterQuestion: nextQuestion });
  warnings.push(...responsePlan.warnings);
  return Object.freeze({ status: "ok", next_state: state, turn_subject_model: factSubject?.model ?? null, response_plan: responsePlan, handoff_decision: handoff, resolved_facts: resolvedFacts, warnings: [...new Set(warnings)], decision_trace: decisionTrace, state_version: version });
}
