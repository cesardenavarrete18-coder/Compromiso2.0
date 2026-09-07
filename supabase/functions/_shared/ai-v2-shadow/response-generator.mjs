const fold = value => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
export const countConceptualQuestions = text => (String(text).match(/\?/g) ?? []).length;
const closing = text => /^(?:no,? )?(?:gracias|no me interesa)|lo voy a pensar|despues (?:los )?contacto/i.test(fold(text).trim());
const dnc = text => /no me (?:escriban|contacten|llamen)(?: mas)?|no quiero que me contacten|dejen de contactarme/.test(fold(text));

function money(value) { return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value); }
export function generateCandidateReply(input) {
  if (input.humanMode) return { text: null, status: "suppressed_human", question_count: 0 };
  const message = input.currentMessage ?? "";
  if (dnc(message)) return { text: "Entendido. No volveremos a contactarte.", status: "ready", question_count: 0, dnc: true };
  if (closing(message)) return { text: "Entendido, gracias por avisarnos. Quedamos a disposición.", status: "ready", question_count: 0, closure: true };
  const facts = input.allowedFacts?.commercial_facts;
  let text = "";
  if (input.responsePlan?.answer_mode === "knowledge_lookup" || input.knowledgeRequest) {
    const technical = input.allowedFacts?.technical_facts ?? [];
    text = technical.length ? String(technical[0].value) : "No tengo ese dato técnico verificado en este momento.";
  } else if (/precio|cuanto (?:sale|cuesta|vale)|cuotas?/.test(fold(message))) {
    if (facts?.status === "single") {
      const offer = facts.alternatives[0];
      text = offer.final_price ? `El precio informado es ${money(offer.final_price)}.` : offer.installment ? `La cuota informada es ${money(offer.installment)}.` : "No tengo un valor estructurado vigente para confirmarte.";
    } else if (facts?.status === "alternatives") text = `Hay ${facts.alternatives.length} alternativas vigentes con condiciones diferentes. ¿Cuál plan o versión te interesa?`;
    else text = "No tengo un precio estructurado vigente para confirmarte.";
  } else if (input.wouldHandoff) text = "Ya tengo la información necesaria y voy a derivar tu consulta al equipo comercial.";
  else text = input.responsePlan?.prompt ?? "¿En qué modelo estás interesado?";
  if (countConceptualQuestions(text) > 1) text = text.slice(0, text.indexOf("?") + 1);
  return { text, status: "ready", question_count: countConceptualQuestions(text) };
}
