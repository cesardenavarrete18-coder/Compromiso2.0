import { createFilterState, deriveCommercialProfile, field, missingField, registerOwnedVehicle } from "../contracts.mjs";
import { resolvePlanFact } from "../plan-fact-resolver.mjs";
import { buildCommercialResponsePlan } from "../commercial-response-policy.mjs";
import { contactPriority } from "../contact-priority.mjs";
import { decideHandoff } from "../handoff-policy.mjs";
import { commerciallyActionable } from "../commercial-actionability.mjs";
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

// Family T: the real Shadow Candidate blocker was a field asked with the identical
// literal 9 times in 11 turns while the customer kept volunteering unrelated facts.
// 2 is the smallest attempt budget that still lets a genuinely distracted customer
// ("¿eh? repetime") get the question again once, while guaranteeing the SAME field
// can never be offered a 3rd time - the observed case never resolved it in 9 tries,
// so a 3rd identical ask has no empirical support as useful and only degrades the
// experience. Once exhausted the field is skipped (not cleared) in favor of the next
// eligible one, so the literal text necessarily changes without inventing new copy.
const MAX_IDENTICAL_ASKS = 2;

function chooseNextQuestion(profile, attempts = {}, { avoidField = null, contactPreferenceAskedOnce = false } = {}) {
  const order = ["model", "purchase_mode", "down_payment_amount", "monthly_installment_capacity", "has_trade_in", "trade_in_brand", "trade_in_model", "trade_in_variant", "trade_in_year", "trade_in_km"];
  // Family L: down_payment_amount/monthly_installment_capacity (gated on
  // purchase_mode="financed") and trade_in_* (gated on has_trade_in="yes") are
  // only present in profile.components when their gate is satisfied — a cash
  // buyer or a "no trade-in" answer must not be asked about them. `key in
  // profile.components` distinguishes "not applicable" from "applicable but
  // unresolved" (missing components would otherwise read as `undefined`,
  // which also fails the known/explicitly_unknown check).
  const eligible = order.filter(key => key in profile.components && !["known", "explicitly_unknown"].includes(profile.components[key]));
  // Family L (unchanged): a genuinely complete profile has no eligible field left
  // at all - the engine's own askContactPreferenceNow/stop_questions machinery
  // already governs asked_once for this exact case, so this branch must not
  // change: it still unconditionally hands back "contact_preference" here.
  if (eligible.length === 0) return "contact_preference";
  // Family T (review fix 2): a brand-new commercial fact arriving unanswered is
  // reason enough to avoid the exact field that just went unanswered, even
  // before it is formally exhausted (MAX_IDENTICAL_ASKS stays as the hard
  // safety net for "no new fact ever arrives").
  const candidates = avoidField ? eligible.filter(key => key !== avoidField) : eligible;
  // Family T (review fix B): if avoidField was the ONLY eligible field, that is
  // NOT a reason to silently fall back to `eligible` and re-offer it anyway -
  // doing so would defeat the entire invariant (new fact + unanswered question
  // => never repeat it immediately). It falls through to the exact same
  // asked_once-gated contact_preference/null behavior used when every field is
  // exhausted below - a genuinely single, currently-unaskable eligible field is
  // not meaningfully different from "nothing safe to ask this turn".
  const notExhausted = candidates.find(key => (attempts[key] ?? 0) < MAX_IDENTICAL_ASKS);
  if (notExhausted) return notExhausted;
  // Family T (review fix 3): every remaining candidate is exhausted (or there
  // were none to begin with, per fix B) but the profile is NOT complete - a
  // different situation from the eligible.length===0 branch above, and it must
  // obey the SAME asked_once discipline Family L already uses for
  // contact_preference (reusing that one flag, not a second counter for the
  // same question): ask it once, then go silent (null) rather than loop it
  // forever. buildCommercialResponsePlan already treats null as "no question
  // this turn" - no new sentinel needed.
  return contactPreferenceAskedOnce ? null : "contact_preference";
}

const RESOLVED_STATUSES = new Set(["known", "explicitly_unknown"]);

const foldIdentity = value => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

// Family T (review fix A): a field going unresolved -> resolved is only ONE way
// a commercial fact can be new. A customer correcting an already-known field
// ("es un Gol, no un Fox") is just as real a new fact and must not be missed
// just because the field's status stayed "known" both turns - so the snapshot
// below carries a normalized MATERIAL value per field, not just its status.
// Reuses foldIdentity (already used by tradeInIdentityChanged) for strings, so
// case/accent-only differences are never mistaken for a real correction.
function materialFieldValue(key, value) {
  const raw = value?.value;
  if (key === "target_model") return raw?.model_id ?? `${foldIdentity(raw?.brand)}|${foldIdentity(raw?.model)}`;
  return typeof raw === "string" ? foldIdentity(raw) : raw;
}

// Family T (review fix 2 + A): the fixed set of commercial fields chooseNextQuestion
// ever cares about (plus target_model, whose resolution/correction is also a
// genuine new fact even though it is never itself asked about via this
// mechanism). Snapshotting {status, material} - not just presence - lets a later
// comparison detect BOTH "newly resolved this turn" and "already known but its
// value materially changed this turn", regardless of whether the field happens
// to be gated into profile.components right now - the real blocker
// (monthly_installment_capacity resolving while purchase_mode still gates it
// out of profile.components) is exactly a fact that must count here even though
// chooseNextQuestion itself never offers a question about it.
function commercialFieldSnapshot(state) {
  const snapshot = new Map();
  const consider = (key, value) => { if (RESOLVED_STATUSES.has(value?.status)) snapshot.set(key, { status: value.status, material: materialFieldValue(key, value) }); };
  consider("target_model", state.target_model);
  consider("purchase_mode", state.purchase_mode);
  consider("down_payment_amount", state.down_payment_amount);
  consider("monthly_installment_capacity", state.monthly_installment_capacity);
  consider("has_trade_in", state.has_trade_in);
  for (const [key, value] of Object.entries(state.trade_in_vehicle ?? {})) consider(`trade_in_${key}`, value);
  return snapshot;
}

// A field counts as a new/changed commercial fact this turn when it (A) went
// from unresolved to resolved, or (B) was already resolved but its material
// value differs from before - never merely because the exact same value was
// repeated, or because provenance/evidence refreshed with no semantic change
// (provenance is not part of the snapshot at all, so it can never trigger this).
function hasNewOrChangedCommercialFact(before, after) {
  for (const [key, afterEntry] of after) {
    const beforeEntry = before.get(key);
    if (!beforeEntry || beforeEntry.material !== afterEntry.material) return true;
  }
  return false;
}

// Family S1: the semantic provider schema names this sub-field "version" (see
// FILTER_V1_PROVIDER_SCHEMA / vehicle_mentions.version_text), but createFilterState()'s
// canonical trade_in_vehicle - and deriveCommercialProfile's derived trade_in_variant
// component - only ever declared "variant". semantic-engine-adapter.mjs passed "version"
// through unrenamed, so it was added to state ad hoc as a SECOND, parallel key: "variant"
// stayed permanently missing (never fed by anything) while "version" silently carried the
// real data, making trade_in_variant an unreachable required component whenever
// has_trade_in="yes". Renamed here, at the semantic-extraction -> state boundary, rather
// than inside the adapter itself, so the adapter's own output keeps using "version" (Family
// O's adapter-level tests assert that key by name) and only ONE canonical key ("variant")
// ever reaches state - never both.
function canonicalizeTradeInVehicleKeys(extractedTradeInVehicle) {
  return Object.fromEntries(Object.entries(extractedTradeInVehicle).map(([key, value]) => [key === "version" ? "variant" : key, value]));
}

// Family R3: brand/model are the vehicle's canonical identity. When either is restated this
// turn with a value that differs from what is already known, the customer switched which
// used vehicle they are offering - any OTHER attribute (variant/version, year, km) carried
// over from the previous vehicle is now stale and must not survive onto the new one. A key
// simply absent from this turn's extraction is not a claim about identity at all (it is not
// evidence of a change), so this only compares brand/model that were actually restated.
function tradeInIdentityChanged(state, extractedTradeInVehicle) {
  for (const key of ["brand", "model"]) {
    const incoming = extractedTradeInVehicle[key];
    if (typeof incoming !== "string" || !incoming) continue;
    const stored = state.trade_in_vehicle[key];
    if (stored?.status !== "known") continue;
    if (foldIdentity(stored.value) !== foldIdentity(incoming)) return true;
  }
  return false;
}

function applyExtractedFields(state, extracted = {}) {
  const source = provenance("customer_message");
  for (const key of ["purchase_mode", "down_payment_amount", "monthly_installment_capacity", "has_trade_in"]) {
    if (extracted[key] !== undefined) state[key] = field(extracted[key], "known", source);
  }
  if (extracted.trade_in_vehicle) {
    const tradeInVehicle = canonicalizeTradeInVehicleKeys(extracted.trade_in_vehicle);
    if (tradeInIdentityChanged(state, tradeInVehicle)) {
      for (const key of Object.keys(state.trade_in_vehicle)) state.trade_in_vehicle[key] = missingField();
    }
    for (const [key, value] of Object.entries(tradeInVehicle)) {
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

  // Family T (review fix 2 + A): snapshot BEFORE this turn's target resolution
  // and applyExtractedFields mutate state, so it can be compared against the
  // same snapshot taken again afterward.
  const commercialFactsBeforeThisTurn = commercialFieldSnapshot(state);

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

  // Family T: computed from state AFTER applyExtractedFields so this turn's facts
  // already count, and deliberately independent of `profile`/`profile.complete` —
  // see commercial-actionability.mjs for why target_model is never consulted here
  // (River Plate sentinel) and why only customer_message-provenanced facts count.
  const actionable = commerciallyActionable(state, { explicitHumanRequest: extraction.human_request === true, strongAction: extraction.strong_action === true });
  const handoff = decideHandoff({ humanOwned: false, doNotContact: lead.do_not_contact, noncommercial: extraction.noncommercial === true, explicitHumanRequest: extraction.human_request === true, strongAction: extraction.strong_action === true, profileComplete: profile.complete, commerciallyActionable: actionable, contactTiming: timing });
  state.qualification_status = handoff.qualification_status;
  state.handoff_status = handoff.handoff_status;
  state.next_action = handoff.next_action;
  if (handoff.contact_priority) state.contact_priority = handoff.contact_priority;
  decisionTrace.push({ decision: "commercial_profile", result: profile.complete, component_score: profile.component_score });
  decisionTrace.push({ decision: "commercially_actionable", result: actionable });
  decisionTrace.push({ decision: "handoff", result: handoff.handoff_status, source: extraction.human_request ? "human_request" : extraction.strong_action ? "strong_action" : actionable ? "commercially_actionable" : "profile" });

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

  // Family T (review fix 2 + A): a fact that newly resolved OR materially
  // changed THIS turn (comparing the before/after snapshots, not merely
  // "extraction repeated an already-known value") is reason enough to avoid
  // immediately re-offering the exact field that was asked last turn and went
  // unanswered.
  const commercialFactsAfterThisTurn = commercialFieldSnapshot(state);
  const newFactThisTurn = hasNewOrChangedCommercialFact(commercialFactsBeforeThisTurn, commercialFactsAfterThisTurn);
  const avoidField = newFactThisTurn ? state.last_asked_field ?? null : null;

  const priorAttempts = state.question_attempts ?? {};
  const contactPreferenceAskedOnce = Boolean(state.contact_preference?.asked_once);
  const nextQuestion = intent === "ambiguous_initial_amount" ? "clarify_initial_amount_intent" : chooseNextQuestion(profile, priorAttempts, { avoidField, contactPreferenceAskedOnce });
  const responsePlan = (handoff.stop_questions && !askContactPreferenceNow)
    ? buildCommercialResponsePlan({ intent, handoff: handoff.handoff_status })
    : buildCommercialResponsePlan({ intent, answerFact, facts: resolvedFacts, nextFilterQuestion: nextQuestion });
  warnings.push(...responsePlan.warnings);
  // Family T: only count an attempt / record last_asked_field when the question
  // is actually the one placed on the response plan (never for one computed
  // then suppressed by stop_questions above) - see contracts.mjs's doc-comments.
  // Scoped to the chooseNextQuestion field set only: contact_preference has its
  // own, separate asked_once mechanism (Family L, extended below), and
  // clarify_initial_amount_intent is a per-turn clarification, not a
  // persistently-stuck missing field.
  const askedField = responsePlan.next_filter_question;
  if (askedField && askedField !== "contact_preference" && askedField !== "clarify_initial_amount_intent") {
    state.question_attempts = { ...priorAttempts, [askedField]: (priorAttempts[askedField] ?? 0) + 1 };
    state.last_asked_field = askedField;
  }
  // Family T (review fix 3): the exhausted-fields fallback (chooseNextQuestion's
  // last branch) reuses contact_preference's own asked_once flag rather than a
  // second counter for the same question - mark it here, the one place that
  // fires only once the question is truly the one emitted. A no-op when
  // askContactPreferenceNow already set it above for the complete-profile case.
  if (askedField === "contact_preference" && !state.contact_preference?.asked_once) {
    state.contact_preference = { ...state.contact_preference, asked_once: true };
  }
  return Object.freeze({ status: "ok", next_state: state, turn_subject_model: factSubject?.model ?? null, response_plan: responsePlan, handoff_decision: handoff, resolved_facts: resolvedFacts, warnings: [...new Set(warnings)], decision_trace: decisionTrace, state_version: version });
}
