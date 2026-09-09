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
  // Family L: down_payment_amount/monthly_installment_capacity (gated on
  // purchase_mode="financed") and trade_in_* (gated on has_trade_in="yes") are
  // only present in profile.components when their gate is satisfied — a cash
  // buyer or a "no trade-in" answer must not be asked about them. `key in
  // profile.components` distinguishes "not applicable" from "applicable but
  // unresolved" (missing components would otherwise read as `undefined`,
  // which also fails the known/explicitly_unknown check).
  return order.find(key => key in profile.components && !["known", "explicitly_unknown"].includes(profile.components[key])) ?? "contact_preference";
}

function applyExtractedFields(state, extracted = {}) {
  const source = provenance("customer_message");
  for (const key of ["purchase_mode", "down_payment_amount", "monthly_installment_capacity", "has_trade_in"]) {
    if (extracted[key] !== undefined) state[key] = field(extracted[key], "known", source);
  }
  if (extracted.trade_in_vehicle) {
    for (const [key, value] of Object.entries(extracted.trade_in_vehicle)) {
      if (value?.semantic_status === "explicitly_unknown") state.trade_in_vehicle[key] = field(null, "explicitly_unknown", { ...source, evidence: value.evidence ?? null });
      // Family O: a null/undefined value is never "known" - field() would throw
      // KNOWN_FIELD_REQUIRES_VALUE. Leave the sub-field untouched (still missing) rather
      // than trusting an upstream adapter to never pass one through.
      else if (value !== undefined && value !== null) state.trade_in_vehicle[key] = field(value, "known", source);
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
  // Family P: fall back to the referral already available in lead.metadata (written
  // synchronously at claim-time, before Shadow ever runs) when no lead_attributions row
  // exists yet for this turn - see adaptAcquisitionContext's own comment for why.
  const acquisition = adaptAcquisitionContext(input.attribution, catalog, lead.metadata?.referral ?? null);
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

  // Family M: DNC is a safety invariant, second only to an active human
  // takeover — it must never be re-derived from message regex downstream
  // (that is the Composer's job to stop doing), and it must never be
  // overridden by an explicit human request, strong action, or a complete
  // profile. `lead.do_not_contact` makes it persist via the CRM even when a
  // later message does not repeat the DNC phrase.
  // Family N: the conversation's OWN state must independently remember it
  // too — `state.do_not_contact`, once set, is never cleared by the absence
  // of a fresh signal on a later turn (only dnc_acknowledged was persisted
  // before, which just distinguishes the first ack from a repeat; it was
  // never itself a gate, so a turn with no fresh noncommercial signal and no
  // CRM flag yet resumed normal commercial flow). Reverting DNC is a
  // separate, explicit business decision — out of scope here.
  const doNotContact = Boolean(lead.do_not_contact) || state.do_not_contact === true || extraction.noncommercial === true;
  if (doNotContact) {
    const alreadyAcknowledged = Boolean(state.dnc_acknowledged);
    const handoff = decideHandoff({ doNotContact: true });
    state.dnc_acknowledged = true;
    state.do_not_contact = true;
    state.qualification_status = handoff.qualification_status;
    state.handoff_status = handoff.handoff_status;
    state.next_action = handoff.next_action;
    state.contact_priority = handoff.contact_priority;
    state.state_version = version.next_state_version;
    decisionTrace.push({ decision: "dnc", result: alreadyAcknowledged ? "repeat" : "first_ack" });
    const responsePlan = { ...buildCommercialResponsePlan({ intent: extraction.query_intent ?? "unknown", handoff: handoff.handoff_status }), dnc_first_ack: !alreadyAcknowledged };
    return Object.freeze({ status: "closed", next_state: state, response_plan: responsePlan, handoff_decision: handoff, resolved_facts: [], warnings, decision_trace: decisionTrace });
  }

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
  // Family L: `timing` above already resolves this turn's contact_preference
  // against the prior one, but the customer's literal/callback_at/callback_window
  // were never persisted into next_state — only used transiently for this
  // turn's priority. Persist them so a later turn (and the composer) can see
  // what the customer actually said, once informed.
  if (extraction.contact_preference) {
    state.contact_preference = { ...state.contact_preference, ...extraction.contact_preference, timing };
  }

  const handoff = decideHandoff({ humanOwned: false, doNotContact: lead.do_not_contact, noncommercial: extraction.noncommercial === true, explicitHumanRequest: extraction.human_request === true, strongAction: extraction.strong_action === true, profileComplete: profile.complete, contactTiming: timing });
  state.qualification_status = handoff.qualification_status;
  state.handoff_status = handoff.handoff_status;
  state.next_action = handoff.next_action;
  if (handoff.contact_priority) state.contact_priority = handoff.contact_priority;
  decisionTrace.push({ decision: "commercial_profile", result: profile.complete, component_score: profile.component_score });
  decisionTrace.push({ decision: "handoff", result: handoff.handoff_status, source: extraction.human_request ? "human_request" : extraction.strong_action ? "strong_action" : "profile" });

  // Family L: a complete profile with unknown contact timing is exactly the case
  // decideHandoff marks stop_questions=true (next_action="complete_filter") —
  // which otherwise silences next_filter_question forever, so "ask contact
  // preference" could never actually be asked. Ask it once; never repeat once
  // state.contact_preference.asked_once is set, regardless of how many more
  // turns pass without an answer.
  const askContactPreferenceNow = handoff.next_action === "complete_filter" && !state.contact_preference?.asked_once;
  if (askContactPreferenceNow) state.contact_preference = { ...state.contact_preference, asked_once: true };

  const intent = extraction.query_intent ?? "unknown";
  const factSubject = resolveModel(catalog, extraction.turn_subject_model) ?? target;
  const resolvedFacts = [];
  let answerFact = null;
  if (PLAN_INTENTS[intent] && factSubject) {
    // Family Q: campaigns are 0km-only data. A price/installment/advance question whose
    // subject is explicitly a used unit must never be answered from that source.
    answerFact = resolvePlanFact({ targetModelId: factSubject.model_id, campaigns: adaptCampaignRows(input.campaigns), factType: PLAN_INTENTS[intent], usedVehicleSubject: extraction.used_vehicle_subject === true });
    resolvedFacts.push(answerFact);
    decisionTrace.push({ decision: `${intent}_fact`, result: answerFact.value, status: answerFact.status, source_campaign_id: answerFact.source_campaign_id });
  } else if (intent === "technical_question") {
    answerFact = { fact_type: "technical_knowledge", status: "requires_knowledge_lookup", value: null, subject_model: factSubject?.model ?? null, subject_model_id: factSubject?.model_id ?? null, source_id: "ai_knowledge_documents" };
    resolvedFacts.push(answerFact);
  }

  const nextQuestion = intent === "ambiguous_initial_amount" ? "clarify_initial_amount_intent" : chooseNextQuestion(profile);
  const responsePlan = (handoff.stop_questions && !askContactPreferenceNow)
    ? buildCommercialResponsePlan({ intent, handoff: handoff.handoff_status })
    : buildCommercialResponsePlan({ intent, answerFact, facts: resolvedFacts, nextFilterQuestion: nextQuestion });
  warnings.push(...responsePlan.warnings);
  return Object.freeze({ status: "ok", next_state: state, turn_subject_model: factSubject?.model ?? null, response_plan: responsePlan, handoff_decision: handoff, resolved_facts: resolvedFacts, warnings: [...new Set(warnings)], decision_trace: decisionTrace, state_version: version });
}
