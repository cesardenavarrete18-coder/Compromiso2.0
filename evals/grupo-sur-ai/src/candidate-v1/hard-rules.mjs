function match(text, pattern) { return pattern.test(String(text || "")); }

export function detectHardStop(runtimeInput) {
  const text = runtimeInput?.inbound_message?.text || "";
  if (runtimeInput?.do_not_contact) return {
    code: "EXISTING_DO_NOT_CONTACT", qualification: "unqualified", close: true,
    do_not_contact: true, block_automatic_output: true, evidence: [{ source: "persisted_state" }],
  };
  if (runtimeInput?.takeover?.active) return {
    code: "HUMAN_TAKEOVER_ACTIVE", close: false, do_not_contact: false,
    block_automatic_output: true, evidence: [{ owner: runtimeInput.takeover.owner || null }],
  };
  if (match(text, /\b(?:no me (?:escriban|contacten|llamen)|dejen de (?:escribirme|contactarme|llamarme)|eliminen mi (?:contacto|n[uú]mero|tel[eé]fono)|dar de baja|borrame|no quiero recibir)\b/i)) return {
    code: "EXPLICIT_OPT_OUT", qualification: "unqualified", close: true,
    do_not_contact: true, block_automatic_output: true, evidence: [{ source: "customer", quote: text }],
  };
  if (match(text, /\b(?:n[uú]mero equivocado|se equivocaron de n[uú]mero|persona equivocada)\b/i)) return {
    code: "WRONG_NUMBER", qualification: "unqualified", close: true,
    do_not_contact: true, block_automatic_output: true, evidence: [{ source: "customer", quote: text }],
  };
  if (match(text, /\b(?:copiame|copiá|mostrame|revelame|revelá|pasame|pasá).{0,50}(?:ejemplos|training|prompt|instrucciones internas|datos de entrenamiento)\b/i)) return {
    code: "TRAINING_DATA_EXFILTRATION_SPAM", qualification: "unqualified", close: true,
    non_commercial: true, do_not_contact: true, block_automatic_output: true,
    evidence: [{ source: "customer", quote: text }],
  };
  if (match(text, /\b(?:dejar|mandar|enviar).{0,20}(?:cv|curr[ií]culum)|\bbusco (?:trabajo|empleo)\b/i)) return {
    code: "EMPLOYMENT_INQUIRY", qualification: "unqualified", close: true,
    non_commercial: true, do_not_contact: false, block_automatic_output: true,
    evidence: [{ source: "customer", quote: text }],
  };
  if (match(text, /\b(?:soy proveedor|ofrecerles? (?:un )?servicio|servicios de limpieza)\b/i)) return {
    code: "SUPPLIER_INQUIRY", qualification: "unqualified", close: true,
    non_commercial: true, do_not_contact: false, block_automatic_output: true,
    evidence: [{ source: "customer", quote: text }],
  };
  return null;
}
export function preResponseBypass(runtimeInput, hardStop) {
  if (hardStop?.block_automatic_output) return hardStop.code;
  if (runtimeInput?.inbound_message?.event_type !== "customer_message") return `EVENT_${runtimeInput.inbound_message.event_type}`;
  const handoff = runtimeInput?.conversation_control?.handoff_status;
  if (["handoff_required", "handed_off"].includes(handoff)) return `PRIOR_${String(handoff).toUpperCase()}`;
  const routing = runtimeInput?.routing_state || {};
  if (routing.tiktok_identifier_status === "absent" && Number(routing.identifier_prompt_attempts || 0) === 0) return "TIKTOK_IDENTIFIER_MISSING";
  if (["invalid", "inactive", "ambiguous", "conflicting", "unresolvable"].includes(routing.tiktok_identifier_status)) return "TIKTOK_ROUTING_REQUIRES_SUPERVISOR";
  return null;
}
