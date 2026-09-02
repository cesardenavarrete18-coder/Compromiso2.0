import { emptyExtraction, validateExtractionContract } from "./extraction-schema.mjs";

const PROFILE_FIELDS = [
  "model_interest", "purchase_modality", "modalities_considered", "cash_available", "target_installment",
  "has_trade_in", "trade_in_customer_estimate", "zone", "purchase_timeframe", "urgency", "visit_intent",
  "deposit_intent", "commercial_intent", "human_request", "commercial_action_request", "security_intent",
];
const TRADE_FIELDS = ["brand", "model", "version", "year", "km"];

function clone(value) { return structuredClone(value); }
function timestamp(value) { return value || new Date().toISOString(); }
function unknownField() { return { value: null, status: "unknown", confidence: "low", source: "system", evidence: [], updated_at: null, history: [] }; }
function knownUnmaterializedField(source, at) {
  return { ...unknownField(), status: "known", knowledge_state: "known_unmaterialized", confidence: "high", source, updated_at: at };
}
function isKnownUnmaterialized(field) { return field?.status === "known" && field?.knowledge_state === "known_unmaterialized"; }
function hasMaterializedValue(field) { return field?.status === "known" && !isKnownUnmaterialized(field) && field.value != null; }
function comparable(value) { return JSON.stringify(value, Object.keys(value && typeof value === "object" ? value : {}).sort()); }
function normalizedText(value) { return String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function normalizedModel(value) {
  if (!value || typeof value !== "object") return null;
  const brand = normalizedText(value.brand);
  let model = normalizedText(value.model);
  if (brand && model.startsWith(`${brand} `)) model = model.slice(brand.length + 1);
  return { brand, model, variant: normalizedText(value.variant) };
}
function sameValue(left, right, path = "") {
  if (path === "model_interest") return comparable(normalizedModel(left)) === comparable(normalizedModel(right));
  return comparable(left) === comparable(right);
}

function toProfileField(input, at) {
  const base = unknownField();
  if (!input) return base;
  return {
    value: clone(input.value), status: input.status, confidence: input.confidence,
    source: input.source, evidence: clone(input.evidence || []), updated_at: at, history: [],
  };
}

function getPath(profile, path) {
  return path.split(".").reduce((current, key) => current?.[key], profile);
}

function setPath(profile, path, value) {
  const parts = path.split("."); let current = profile;
  for (const part of parts.slice(0, -1)) current = current[part];
  current[parts.at(-1)] = value;
}

function correctionFor(extraction, path) {
  return (extraction.corrections || []).find((item) => item.field === path && item.explicit === true);
}

function contradictionFor(extraction, path) {
  return (extraction.contradictions || []).find((item) => item.field === path);
}

function mergeField(profile, path, incoming, extraction, at) {
  if (!incoming) return;
  const current = getPath(profile, path) || unknownField();
  if (incoming.status === "unknown" && ["known", "not_applicable"].includes(current.status)) return;
  // A persisted "known" marker carries knowledge, not a fictitious commercial
  // value. A later extractor can confirm that knowledge without materializing it.
  if (isKnownUnmaterialized(current) && incoming.status === "known" && incoming.value == null) return;
  const explicitCorrection = correctionFor(extraction, path);
  const contradiction = contradictionFor(extraction, path);
  if (contradiction) {
    setPath(profile, path, {
      ...clone(current), status: "conflicting", confidence: incoming.confidence,
      evidence: [...(current.evidence || []), ...(incoming.evidence || []), ...(contradiction.evidence || [])],
      updated_at: at,
      history: [...(current.history || []), { event: "contradiction", values: clone(contradiction.values), evidence: clone(contradiction.evidence), at }],
    });
    return;
  }
  if (incoming.status === "known" && current.status === "known" && !sameValue(current.value, incoming.value, path)) {
    const customerOverridesMeta = incoming.source === "customer" && current.source === "meta_ad" && incoming.confidence === "high";
    if (!explicitCorrection && !customerOverridesMeta) {
      setPath(profile, path, {
        ...clone(current), status: "conflicting", updated_at: at,
        evidence: [...(current.evidence || []), ...(incoming.evidence || [])],
        history: [...(current.history || []), { event: "unresolved_conflict", previous_value: clone(current.value), proposed_value: clone(incoming.value), at }],
      });
      return;
    }
  }
  const history = [...(current.history || [])];
  if (current.status !== "unknown" && (!sameValue(current.value, incoming.value, path) || current.status !== incoming.status)) {
    history.push({
      event: explicitCorrection ? "explicit_correction" : "superseded",
      previous_value: clone(current.value), previous_status: current.status, previous_source: current.source,
      new_value: clone(incoming.value), new_status: incoming.status, new_source: incoming.source,
      evidence: clone(explicitCorrection?.evidence || incoming.evidence || []), at,
    });
    profile.correction_history.push({ field: path, ...history.at(-1) });
  }
  setPath(profile, path, { ...toProfileField(incoming, at), history });
}

function seedKnown(value, source, at) {
  return { value: clone(value), status: "known", confidence: "high", source, evidence: [], updated_at: at, history: [] };
}

function modelValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  const text = String(value).trim(); const parts = text.split(/\s+/);
  const brand = ["Volkswagen", "Peugeot", "Fiat"].find((item) => text.toLowerCase().startsWith(item.toLowerCase())) || null;
  return { brand, model: brand ? parts.slice(1).join(" ") : text, variant: null };
}

export function createLeadProfile(runtimeInput = {}, at) {
  const now = timestamp(at);
  const profile = Object.fromEntries(PROFILE_FIELDS.map((name) => [name, unknownField()]));
  profile.trade_in = Object.fromEntries(TRADE_FIELDS.map((name) => [name, unknownField()]));
  profile.advertised_model = unknownField();
  profile.advertised_modality = unknownField();
  profile.trade_in_authorized_value = unknownField();
  profile.campaign_installment_anchor = unknownField();
  profile.objections = [];
  profile.correction_history = [];
  profile.contradictions = [];
  profile.operational = {
    prior_qualification: runtimeInput.prior_qualification?.status || null,
    conversation_status: runtimeInput.conversation_control?.status || "open",
    prior_handoff_status: runtimeInput.conversation_control?.handoff_status || "continue_ai",
    prior_temperature: runtimeInput.persisted_data?.commercial_temperature || null,
    financing_context: Boolean(runtimeInput.persisted_data?.financing_context ?? runtimeInput.financing_context),
    substantive_ai_turns: Number(runtimeInput.conversation_control?.substantive_ai_turns || 0),
    reminders_sent: Number(runtimeInput.conversation_control?.reminders_sent || 0),
    silence_minutes: Number(runtimeInput.conversation_control?.silence_minutes || 0),
    no_progress_attempts: Number(runtimeInput.conversation_control?.no_progress_attempts || 0),
    repeated_known_question: Boolean(runtimeInput.conversation_control?.repeated_known_question),
    frustrated: Boolean(runtimeInput.conversation_control?.frustrated),
    do_not_contact: Boolean(runtimeInput.do_not_contact),
    takeover: clone(runtimeInput.takeover || { active: false, owner: null }),
    routing_state: clone(runtimeInput.routing_state || {}),
    event_type: runtimeInput.inbound_message?.event_type || "customer_message",
  };
  if (runtimeInput.existing_model_interest) profile.model_interest = seedKnown(modelValue(runtimeInput.existing_model_interest), "system", now);
  const referral = runtimeInput.meta_referral || {};
  if (referral.present && referral.advertised_model) {
    profile.advertised_model = seedKnown(modelValue(referral.advertised_model), "meta_ad", now);
    if (profile.model_interest.status !== "known") profile.model_interest = seedKnown(modelValue(referral.advertised_model), "meta_ad", now);
  }
  if (referral.present && referral.advertised_modality) {
    profile.advertised_modality = seedKnown(referral.advertised_modality, "meta_ad", now);
    profile.purchase_modality = seedKnown(referral.advertised_modality, "meta_ad", now);
  }
  const persisted = runtimeInput.persisted_data || {};
  for (const name of PROFILE_FIELDS) {
    if (!(name in persisted)) continue;
    const value = persisted[name];
    if (value && typeof value === "object" && "status" in value) profile[name] = { ...unknownField(), ...clone(value), updated_at: value.updated_at || now, history: clone(value.history || []) };
    else if (value === "known") profile[name] = knownUnmaterializedField("system", now);
    else profile[name] = seedKnown(value, "system", now);
  }
  if (persisted.trade_in && typeof persisted.trade_in === "object") {
    for (const name of TRADE_FIELDS) if (name in persisted.trade_in) profile.trade_in[name] = seedKnown(persisted.trade_in[name], "system", now);
  }
  if (persisted.trade_in_authorized_value != null) profile.trade_in_authorized_value = seedKnown(persisted.trade_in_authorized_value, "authorized_commercial_source", now);
  if (persisted.campaign_installment_anchor != null) profile.campaign_installment_anchor = seedKnown(persisted.campaign_installment_anchor, "authorized_commercial_source", now);
  return profile;
}

export function accumulateExtraction(profileInput, extractionInput, at, signals = {}) {
  const profile = clone(profileInput);
  const extraction = clone(validateExtractionContract(extractionInput || emptyExtraction()));
  // A human request needs evidence of interaction with a person. Commercial
  // imperatives alone ("decime", "quiero", "mostrame") cannot trigger handoff.
  if (["explicit", "repeated"].includes(extraction.human_request?.value)) {
    const evidence = (extraction.human_request.evidence || []).map((item) => item.quote).join(" ");
    const humanEvidence = /\b(?:persona|asesor(?:a)?|vendedor(?:a)?|representante|alguien|humano(?:a)?|operador(?:a)?)\b/i.test(evidence)
      && /\b(?:hablar|comunicar|pas(?:a|á|en|ame)|llam(?:e|en|ame)|atend(?:er|eme|é)|ver|contact)/i.test(evidence);
    if (!humanEvidence) extraction.human_request = { ...extraction.human_request, value: "none", status: "known", confidence: "high", source: "system" };
  }
  // Human handoff language is not evidence of physical presence. A visit must
  // carry its own movement/location evidence, even when the extractor labels it.
  const visitEvidence = (extraction.visit_intent?.evidence || []).map((item) => item.quote).join(" ");
  const physicalVisit = /\b(?:visit(?:ar|a|o|amos)?|ir|voy|venir|vengo|acerc(?:ar|arme|o)|sucursal|sal[oó]n|turno presencial|pasar por (?:ah[ií]|all[ií])|coordinar (?:una )?visita)\b/i.test(visitEvidence);
  if (["requested", "scheduled", "known"].includes(extraction.visit_intent?.value) && !physicalVisit) {
    extraction.visit_intent = { ...extraction.visit_intent, value: null, status: "unknown", confidence: "high", source: "system", evidence: [] };
    if (extraction.commercial_action_request?.value === "visit") {
      extraction.commercial_action_request = { ...extraction.commercial_action_request, value: "none", status: "known", confidence: "high", source: "system", evidence: [] };
    }
  }
  const now = timestamp(at);
  profile.operational.financing_context = Boolean(profile.operational.financing_context || signals.financing_context);
  profile.operational.commercial_continuity = Boolean(signals.commercial_continuity);
  for (const name of PROFILE_FIELDS) mergeField(profile, name, extraction[name], extraction, now);
  for (const name of TRADE_FIELDS) mergeField(profile, `trade_in.${name}`, extraction.trade_in[name], extraction, now);
  profile.objections = clone(extraction.objections || []);
  profile.contradictions = clone(extraction.contradictions || []);
  if (profile.purchase_modality.status === "known" && profile.purchase_modality.value === "cash") {
    profile.operational.financing_context = false;
    for (const name of ["cash_available", "target_installment"]) {
      const current = profile[name];
      if (current.status !== "not_applicable") profile[name] = { ...current, value: null, status: "not_applicable", source: "system", confidence: "high", updated_at: now, history: [...(current.history || []), { event: "cash_modality_not_applicable", at: now }] };
    }
  }
  return profile;
}

export const profileInternals = { getPath, sameValue, isKnownUnmaterialized, hasMaterializedValue };
