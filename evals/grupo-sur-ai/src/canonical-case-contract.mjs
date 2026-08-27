const ids = (value) => value.split(/\s+/).filter(Boolean).map((id) => `GSV1-${id}`);

export const CANONICAL_SEGMENTS = Object.freeze({
  brand: Object.freeze({
    Volkswagen: ids("003 005 009 012 016 019 021 025 027 031 034 037 040 041 042 045 048 051 054 057 060 063 066 069 072 075 078 081 084 087 090 094 097 100"),
    Peugeot: ids("001 002 007 008 011 014 017 022 024 028 030 032 035 038 043 047 050 052 055 058 061 064 067 070 073 076 079 082 085 088 091 095 098"),
    Fiat: ids("004 006 010 013 015 018 020 023 026 029 033 036 039 044 046 049 053 056 059 062 065 068 071 074 077 080 083 086 089 092 093 096 099"),
  }),
  primary_modality: Object.freeze({
    financing: ids("001 002 005 008 009 010 011 012 013 021 024 025 026 039 041 048 052 054 058 059 060 062 063 064 065 068 069 070 071 079 080 081 082 083 084 085 086 089 090 091 094 095 097 099 100"),
    savings_plan: ids("006 007 030 032 034 045 055 073"),
    cash: ids("003 051 053 092 096 098"),
    credit: ids("029 043 044 046 047 049 050 056"),
    used_plus_financing: ids("014 015 016 017 018 019 020"),
    neutral_or_unknown: ids("004 022 023 027 028 031 033 035 036 037 038 040 042 057 061 066 067 072 074 075 076 077 078 087 088 093"),
  }),
});

const model = (existing_model_interest, persisted_data = {}) => ({ existing_model_interest, persisted_data });
const meta = (advertised_model, advertised_modality = null, persisted_data = {}) => ({
  meta_referral: {
    present: true,
    source_type: "ad",
    advertised_model,
    advertised_modality,
    campaign_reference: "golden-fixture",
  },
  persisted_data,
});

// Sólo contiene estado previo al mensaje entrante. El texto y los turnos siguen
// proviniendo del Golden congelado; ningún estado se infiere desde esa prosa.
export const CASE_STATE_OVERRIDES = Object.freeze({
  "GSV1-001": model("Peugeot 208"),
  "GSV1-002": meta("Peugeot 208", "financing"),
  "GSV1-003": meta("Volkswagen Tera", "financing"),
  "GSV1-004": meta("Fiat Fastback", null),
  "GSV1-005": meta("Volkswagen Tera", "financing"),
  "GSV1-006": model("Fiat Toro"),
  "GSV1-007": model("Peugeot 208"),
  "GSV1-008": meta("Peugeot 208", "financing"),
  "GSV1-009": { ...model("Volkswagen Polo Robust", { cash_available: "known", authorized_installment_anchor: true }), inbound_text: "Sí, esa cuota me sirve.", prior_history: ["Asistente: La alternativa vigente parte de [CUOTA_AUTORIZADA]. ¿Ese valor te resulta viable?"] },
  "GSV1-010": model("Fiat Fiorino"),
  "GSV1-011": model("Peugeot 208"),
  "GSV1-013": model("Fiat Fastback"),
  "GSV1-014": meta("Peugeot 208", "used_plus_financing"),
  "GSV1-015": model("Fiat Toro", { cash_available: "known" }),
  "GSV1-018": { ...model("Fiat Toro", { cash_available: "known", target_installment: "known", trade_in_complete: true, authorized_valuation_current: true }), inbound_text: "Perfecto, avancemos." },
  "GSV1-019": model("Volkswagen Amarok", { cash_available: "known", target_installment: "known", expired_trade_in_valuation: true }),
  "GSV1-021": meta("Volkswagen Tera", "financing"),
  "GSV1-024": { ...meta("Peugeot 208", "financing"), conversation_control: { substantive_ai_turns: 3 } },
  "GSV1-025": { ...model("Volkswagen Polo"), conversation_control: { substantive_ai_turns: 3 } },
  "GSV1-026": meta("Fiat Fastback", "financing"),
  "GSV1-027": model("Volkswagen Tera", { purchase_horizon: "next_year" }),
  "GSV1-028": meta("Peugeot 208", null),
  "GSV1-030": { ...model("Peugeot 208", { cash_available: "known", target_installment: "known", purchase_horizon: "8_months" }), inbound_text: "La compra sería dentro de ocho meses." },
  "GSV1-031": { ...model("Volkswagen Polo"), routing_state: { tiktok_identifier_status: "valid", resolved: true } },
  "GSV1-032": { ...model("Peugeot 208"), inbound_text: "Vengo de TikTok; me atiende [NOMBRE Y APELLIDO DE ASESOR ACTIVO].", routing_state: { tiktok_identifier_status: "valid", resolved: true } },
  "GSV1-033": { ...model("Fiat Fiorino"), routing_state: { tiktok_identifier_status: "absent", resolved: false } },
  "GSV1-034": { ...model("Volkswagen Tera"), inbound_text: "Vengo de TikTok; recibí los códigos [VALIDO_A] y [VALIDO_B].", routing_state: { tiktok_identifier_status: "conflicting", resolved: false } },
  "GSV1-035": { ...model("Peugeot Partner"), inbound_text: "Vengo de TikTok; mi código es [INVALIDO].", routing_state: { tiktok_identifier_status: "invalid", resolved: false } },
  "GSV1-036": { ...model("Fiat Toro"), inbound_text: "Vengo de TikTok; me atiende [ASESOR INACTIVO].", routing_state: { tiktok_identifier_status: "inactive", resolved: false } },
  "GSV1-037": { ...model("Volkswagen Amarok"), inbound_text: "Vengo de TikTok; el código es [ASESOR_A] pero me indicó [ASESOR_B].", routing_state: { tiktok_identifier_status: "conflicting", resolved: false } },
  "GSV1-038": { ...model("Peugeot 208"), routing_state: { tiktok_identifier_status: "absent", resolved: false } },
  "GSV1-039": { ...model("Fiat Fastback"), routing_state: { tiktok_identifier_status: "valid", resolved: true } },
  "GSV1-040": { ...model("Volkswagen Nivus"), routing_state: { tiktok_identifier_status: "absent", resolved: false } },
  "GSV1-041": meta("Volkswagen Tera", null, { product_evidence: "available" }),
  "GSV1-043": model("Peugeot 208", { product_evidence: "unavailable" }),
  "GSV1-044": { ...model("Fiat Fiorino", { product_evidence: "current_authorized" }), inbound_text: "¿Qué equipamiento trae la Fiorino?" },
  "GSV1-045": { ...meta("Volkswagen Amarok", "savings_plan", { product_evidence: "unavailable" }), inbound_text: "¿Cuál es la capacidad de carga de la Amarok?" },
  "GSV1-046": { ...model("Fiat Toro", { product_evidence: "current_authorized" }), inbound_text: "¿Qué transmisión trae la Toro Freedom T270?", routing_state: { tiktok_identifier_status: "valid", resolved: true } },
  "GSV1-047": { ...model("Peugeot 208", { product_evidence: "conflicting" }), inbound_text: "¿Qué motor trae el Peugeot 208?" },
  "GSV1-048": meta("Volkswagen Tera", null),
  "GSV1-050": { ...meta("Peugeot Partner", "credit", { product_evidence: "current_authorized_missing_variant" }), inbound_text: "¿Tienen la versión [NO_CATALOGADA] de Partner?" },
  "GSV1-051": { ...meta("Volkswagen Polo", "cash", { commercial_evidence: "current_authorized" }), inbound_text: "¿Cuál es el precio vigente al contado?" },
  "GSV1-052": { ...meta("Peugeot 208", "financing", { commercial_evidence: "expired" }), inbound_text: "¿Sigue vigente el precio que vi?" },
  "GSV1-053": { ...model("Fiat Toro", { commercial_evidence: "unavailable" }), inbound_text: "¿Cuánto cuesta la Toro al contado?" },
  "GSV1-054": { ...meta("Volkswagen Tera", "financing", { commercial_evidence: "wrong_model" }), inbound_text: "¿Cuál es la oferta vigente para la Tera?" },
  "GSV1-055": { ...meta("Peugeot 208", "savings_plan", { commercial_evidence: "expired" }), inbound_text: "¿Sigue vigente la campaña del plan?" },
  "GSV1-056": model("Fiat Fiorino", { stock: "unknown" }),
  "GSV1-058": { ...meta("Peugeot Partner", "financing", { commercial_evidence: "unavailable" }), inbound_text: "¿Sigue vigente la bonificación que vi?" },
  "GSV1-060": meta("Volkswagen Tera", "financing", { commercial_evidence: "expired" }),
  "GSV1-061": model("Peugeot 208"),
  "GSV1-062": { ...meta("Fiat Toro", "financing"), inbound_text: "Quiero conocer las opciones." },
  "GSV1-063": { ...model("Volkswagen Nivus"), inbound_text: "¿Cómo seguimos?", conversation_control: { substantive_ai_turns: 6 } },
  "GSV1-064": { ...meta("Peugeot 208", "financing", { cash_available: "known" }), inbound_text: "¿Cómo seguimos con la financiación?" },
  "GSV1-065": { inbound_text: "Quiero una Fiat Toro. Tengo [CASH], puedo pagar [CUOTA], soy de [ZONA] y compraría en [PLAZO]." },
  "GSV1-067": { inbound_text: "[INSULTO]. ¿Cuánto cuesta la Partner?", routing_state: { tiktok_identifier_status: "valid", resolved: true } },
  "GSV1-068": { ...model("Fiat Fiorino"), prior_history: ["Asistente: ¿Qué modelo buscás? ¿Cuánto anticipo tenés? ¿Qué cuota podés pagar? ¿Entregás usado?"] },
  "GSV1-069": meta("Volkswagen Tera", "financing"),
  "GSV1-070": { ...model("Peugeot 208", { authorized_installment_anchor: true }), prior_history: ["Asistente: La cuota autorizada vigente, ¿te sirve?"] },
  "GSV1-071": { ...meta("Fiat Fastback", "financing"), inbound_text: "Estoy atravesando [DIAGNÓSTICO OMITIDO]. ¿Cómo es la financiación?" },
  "GSV1-072": { ...model("Volkswagen Amarok"), inbound_text: "Mi DNI es [DNI OMITIDO]. Quiero información de la Amarok." },
  "GSV1-073": { ...model("Peugeot 208"), inbound_text: "Mi teléfono es [TELÉFONO OMITIDO]. Quiero consultar el plan.", routing_state: { tiktok_identifier_status: "valid", resolved: true } },
  "GSV1-074": { ...model("Fiat Toro"), do_not_contact: true, conversation_control: { status: "closed" } },
  "GSV1-075": { do_not_contact: true, conversation_control: { status: "closed" } },
  "GSV1-076": {},
  "GSV1-077": { inbound_text: "Soy proveedor y quiero ofrecerles un servicio." },
  "GSV1-078": { ...meta("Volkswagen", null), inbound_text: "Necesito reclamar por el service de mi auto." },
  "GSV1-079": { ...model("Peugeot 208"), inbound_text: "", event_type: "reminder_tick", conversation_control: { reminders_sent: 0, silence_minutes: 125 } },
  "GSV1-080": { ...model("Fiat Fiorino"), inbound_text: "", event_type: "reminder_tick", conversation_control: { reminders_sent: 0, silence_minutes: 119 } },
  "GSV1-081": { ...meta("Volkswagen Polo", "financing"), inbound_text: "", event_type: "reminder_tick", conversation_control: { customer_replied_after_first_message: true } },
  "GSV1-082": { ...model("Peugeot Partner"), inbound_text: "", event_type: "reminder_tick", conversation_control: { reminders_sent: 1, silence_minutes: 1441 } },
  "GSV1-083": { ...model("Fiat Toro"), inbound_text: "", event_type: "conversation_control_change", takeover: { active: true, owner: "human" } },
  "GSV1-084": { ...model("Volkswagen Tera"), inbound_text: "¿Cuál es el precio?", takeover: { active: true, owner: "human" } },
  "GSV1-085": { ...model("Peugeot 208"), inbound_text: "", event_type: "handoff_accepted", prior_qualification: { status: "qualified" }, takeover: { active: true, owner: "advisor" }, conversation_control: { handoff_status: "handed_off" } },
  "GSV1-086": { ...meta("Fiat Fastback", "financing"), inbound_text: "", event_type: "handoff_wait", conversation_control: { status: "paused", handoff_status: "handoff_required" } },
  "GSV1-089": { ...model("Fiat Fiorino"), inbound_text: "Vivo en [DOMICILIO OMITIDO]. ¿Qué cuota tiene la Fiorino?" },
  "GSV1-090": { ...meta("Volkswagen Tera", "financing"), inbound_text: "No confío; quiero verificarlo con una persona.", conversation_control: { status: "paused", handoff_status: "handoff_required" } },
  "GSV1-091": model("Peugeot 208", { commercial_evidence: "unavailable" }),
  "GSV1-094": meta("Volkswagen Nivus", "financing"),
  "GSV1-095": model("Peugeot 208"),
  "GSV1-097": meta("Volkswagen Tera", "financing"),
  "GSV1-098": { ...model("Peugeot Partner"), inbound_text: "Estoy en una zona lejana. ¿Puedo comprar la Partner al contado de manera remota?" },
  "GSV1-099": { ...model("Fiat Toro", { commercial_profile_complete: true }), prior_qualification: { status: "qualified" }, routing_state: { tiktok_identifier_status: "valid", resolved: true } },
  "GSV1-100": { ...meta("Volkswagen Amarok", "financing"), inbound_text: "¿Cómo seguimos?", prior_qualification: { status: "qualified" }, conversation_control: { substantive_ai_turns: 5, handoff_status: "handoff_required" } },
});

function reverseIndex(groups, dimension) {
  const result = new Map();
  for (const [value, caseIds] of Object.entries(groups)) {
    for (const evalId of caseIds) {
      if (result.has(evalId)) throw new Error(`CANONICAL_SEGMENT_DUPLICATE:${dimension}:${evalId}`);
      result.set(evalId, value);
    }
  }
  return result;
}

export const BRAND_BY_CASE = reverseIndex(CANONICAL_SEGMENTS.brand, "brand");
export const MODALITY_BY_CASE = reverseIndex(CANONICAL_SEGMENTS.primary_modality, "primary_modality");

export const EXPECTED_SEGMENT_COUNTS = Object.freeze({
  brand: Object.freeze({ Volkswagen: 34, Peugeot: 33, Fiat: 33 }),
  primary_modality: Object.freeze({ financing: 45, savings_plan: 8, cash: 6, credit: 8, used_plus_financing: 7, neutral_or_unknown: 26 }),
});
