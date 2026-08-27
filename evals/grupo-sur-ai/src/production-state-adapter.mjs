const defaultControl = () => ({
  status: "open",
  handoff_status: "continue_ai",
  substantive_ai_turns: 0,
  reminders_sent: 0,
  silence_minutes: 0,
  customer_replied_after_first_message: false,
});

export function validateRuntimeInput(runtimeInput, evalId = "unknown") {
  const required = [
    "existing_model_interest", "prior_history", "meta_referral", "advertised_interest",
    "prior_qualification", "conversation_control", "do_not_contact", "takeover",
    "routing_state", "persisted_data", "inbound_message",
  ];
  for (const field of required) {
    if (!(field in runtimeInput)) throw new Error(`RUNTIME_INPUT_FIELD_MISSING:${evalId}:${field}`);
  }
  for (const path of runtimeInput.known_state_requirements || []) {
    const value = path.split(".").reduce((current, key) => current?.[key], runtimeInput);
    if (value === undefined || value === null || value === "") throw new Error(`STATEFUL_INPUT_NOT_DELIVERED:${evalId}:${path}`);
  }
  return true;
}

export function buildCanonicalRuntimeInput(datasetCase, state = {}) {
  if (datasetCase.input_fidelity === "compact_case_context_compilation" && !("inbound_text" in state)) {
    throw new Error(`CANONICAL_INBOUND_EVENT_MISSING:${datasetCase.eval_id}`);
  }
  const metaReferral = {
    present: false, source_type: null, advertised_model: null,
    advertised_modality: null, campaign_reference: null,
    ...(state.meta_referral || {}),
  };
  const existingModel = state.existing_model_interest || null;
  const priorHistory = [...(state.prior_history || datasetCase.parsed_history || [])];
  const knownRequirements = [];
  if (existingModel) knownRequirements.push("existing_model_interest");
  if (metaReferral.present) knownRequirements.push("meta_referral.advertised_model");
  for (const key of Object.keys(state.persisted_data || {})) knownRequirements.push(`persisted_data.${key}`);
  if (state.prior_qualification?.status) knownRequirements.push("prior_qualification.status");
  if (state.takeover?.active) knownRequirements.push("takeover.active");
  if (state.do_not_contact) knownRequirements.push("do_not_contact");
  if (state.prior_history) knownRequirements.push("prior_history");
  for (const key of Object.keys(state.conversation_control || {})) knownRequirements.push(`conversation_control.${key}`);
  for (const key of Object.keys(state.routing_state || {})) knownRequirements.push(`routing_state.${key}`);
  if (state.event_type) knownRequirements.push("inbound_message.event_type");

  const runtimeInput = {
    inbound_message: {
      event_type: state.event_type || "customer_message",
      text: "inbound_text" in state ? state.inbound_text : datasetCase.parsed_text,
      source_channel: datasetCase.source_channel,
    },
    existing_model_interest: existingModel,
    prior_history: priorHistory,
    meta_referral: metaReferral,
    advertised_interest: metaReferral.advertised_model || null,
    prior_qualification: { status: null, ...(state.prior_qualification || {}) },
    conversation_control: { ...defaultControl(), ...(state.conversation_control || {}) },
    do_not_contact: Boolean(state.do_not_contact),
    takeover: { active: false, owner: null, ...(state.takeover || {}) },
    routing_state: { tiktok_identifier_status: null, resolved: false, ...(state.routing_state || {}) },
    persisted_data: { ...(state.persisted_data || {}) },
    known_state_requirements: knownRequirements,
  };
  validateRuntimeInput(runtimeInput, datasetCase.eval_id);
  return runtimeInput;
}

// Única frontera que transforma el contrato del dataset en la forma que recibía
// analyzeLeadConversation en producción. La réplica no vuelve a interpretar el Golden.
export function adaptToProductionState(evalCase) {
  const input = evalCase.runtime_input;
  validateRuntimeInput(input, evalCase.eval_id);
  const advertisedInterest = input.meta_referral.advertised_model || input.existing_model_interest || "";
  const referralContext = input.meta_referral.present
    ? [
      "Referencia comercial confirmada por Meta Ads:",
      `Modelo identificado: ${input.meta_referral.advertised_model || "no determinado"}`,
      `Modalidad anunciada: ${input.meta_referral.advertised_modality || "no determinada"}`,
      `Referencia: ${input.meta_referral.campaign_reference || "no informada"}`,
    ].join("\n")
    : "";
  return {
    history: [...input.prior_history],
    text: input.inbound_message.text,
    source_channel: input.inbound_message.source_channel,
    referral_context: referralContext,
    advertised_interest: advertisedInterest,
    existing_model_interest: input.existing_model_interest || "",
    customer_name: String(input.persisted_data.customer_name || ""),
    customer_phone: String(input.persisted_data.customer_phone || ""),
    prior_qualification: { ...input.prior_qualification },
    conversation_control: { ...input.conversation_control },
    do_not_contact: input.do_not_contact,
    takeover: { ...input.takeover },
    routing_state: { ...input.routing_state },
    persisted_data: { ...input.persisted_data },
  };
}
