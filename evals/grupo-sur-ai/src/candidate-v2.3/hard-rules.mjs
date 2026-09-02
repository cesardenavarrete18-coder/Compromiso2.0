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
  if (match(text, /\b(?:reclamo|reclamar|queja|problema)\b.{0,45}\b(?:service|servicio|taller|posventa|postventa|reparaci[oó]n)\b|\b(?:service|taller|posventa|postventa)\b.{0,45}\b(?:reclamo|reclamar|queja|problema)\b/i)) return {
    code: "AFTER_SALES_REQUEST", qualification: "unqualified", after_sales: true,
    non_commercial: true, close: false, do_not_contact: false, block_automatic_output: false,
    evidence: [{ source: "customer", quote: text }],
  };
  if (match(text, /\b(?:mostrame|mostrá|pasame|pasá|dame|compart(?:ime|í|an)|revelame|revelá)\b.{0,60}\b(?:datos|informaci[oó]n|tel[eé]fonos?|n[uú]meros?|contactos?)\b.{0,35}\b(?:otros? clientes?|terceros?|personas?)\b|\b(?:datos|informaci[oó]n)\b.{0,35}\b(?:otros? clientes?|terceros?)\b/i)) return {
    code: "CUSTOMER_DATA_EXFILTRATION", qualification: "unqualified", close: true,
    non_commercial: true, security: true, do_not_contact: false, block_automatic_output: false,
    evidence: [{ source: "customer", quote: text }],
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
  return null;
}
