const fold = value => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
export const countConceptualQuestions = text => (String(text).match(/\?/g) ?? []).length;
const closing = text => /^(?:no,? )?(?:gracias|no me interesa)|lo voy a pensar|despues (?:los )?contacto/i.test(fold(text).trim());
const dnc = text => /no me (?:escriban|contacten|llamen)(?: mas)?|no quiero que me contacten|dejen de contactarme/.test(fold(text));

function money(value) { return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value); }

// Renders responsePlan.answer_fact — the real Filter v1 engine's single resolved
// (or explicitly not-materialized) commercial fact for the current turn. This is
// the PRIMARY source for a commercial answer (Family J): it already carries the
// correct fact_type (model value / installment / delivery advance), so there is
// no need to re-guess from the raw message text which one the customer meant.
function renderAnswerFact(fact) {
  if (!fact) return null;
  if (fact.status === "not_materialized") return "No tengo un valor estructurado vigente para confirmarte.";
  if (fact.status !== "resolved") return null; // e.g. requires_knowledge_lookup, handled separately via knowledgeRequest
  if (fact.fact_type === "model_reference_value") return `El precio informado es ${money(fact.value)}.`;
  if (fact.fact_type === "installment_offer") return `La cuota informada es ${money(fact.value)}.`;
  if (fact.fact_type === "delivery_advance") return `El anticipo para retirarlo es ${money(fact.value)}.`;
  return null;
}

// Maps responsePlan.next_filter_question (the real engine's own contract — see
// chooseNextQuestion in filter-v1-engine.mjs) to a single concrete question.
// Deterministic 1:1 mapping, no re-inference from the message.
const FILTER_QUESTION_COPY = Object.freeze({
  model: "¿Qué modelo te interesa?",
  purchase_mode: "¿Cómo pensás comprarlo, al contado o financiado?",
  down_payment_amount: "¿Con cuánto podés hacer la entrega inicial?",
  monthly_installment_capacity: "¿Qué monto podés destinar por mes a la cuota?",
  has_trade_in: "¿Tenés un vehículo para entregar como parte de pago?",
  trade_in_brand: "¿De qué marca es el vehículo que vas a entregar?",
  trade_in_model: "¿Qué modelo es el vehículo que vas a entregar?",
  trade_in_variant: "¿Qué versión es el vehículo que vas a entregar?",
  trade_in_year: "¿De qué año es el vehículo que vas a entregar?",
  trade_in_km: "¿Cuántos kilómetros tiene el vehículo que vas a entregar?",
  contact_preference: "¿Cuál es el mejor horario para que te contactemos?",
});

// clarify_initial_amount_intent is not a fixed field name lookup: it must
// distinguish, in one question, "monto para arrancar el plan" from "anticipo
// para retirar el vehículo" — the two things an initial-amount mention could
// mean (query-intent.mjs's ambiguous_initial_amount / filter-v1-engine.mjs's
// clarify_initial_amount_intent).
const CLARIFY_INITIAL_AMOUNT_QUESTION = "¿Ese monto es para arrancar el plan hoy, o es el anticipo con el que retirarías el vehículo?";

const HANDOFF_DERIVATION_COPY = "Ya tengo la información necesaria y voy a derivar tu consulta al equipo comercial.";

function finalize(text, extra = {}) {
  let finalText = text;
  if (countConceptualQuestions(finalText) > 1) finalText = finalText.slice(0, finalText.indexOf("?") + 1);
  return { text: finalText, status: "ready", question_count: countConceptualQuestions(finalText), ...extra };
}

export function generateCandidateReply(input) {
  if (input.humanMode) return { text: null, status: "suppressed_human", question_count: 0 };
  const message = input.currentMessage ?? "";
  if (dnc(message)) return { text: "Entendido. No volveremos a contactarte.", status: "ready", question_count: 0, dnc: true };
  if (closing(message)) return { text: "Entendido, gracias por avisarnos. Quedamos a disposición.", status: "ready", question_count: 0, closure: true };

  // Technical/knowledge-lookup facts are resolved upstream from the engine's own
  // resolved_facts (pipeline.mjs), not re-derived here — keep as-is.
  if (input.knowledgeRequest) {
    const technical = input.allowedFacts?.technical_facts ?? [];
    return finalize(technical.length ? String(technical[0].value) : "No tengo ese dato técnico verificado en este momento.");
  }

  const plan = input.responsePlan ?? {};

  // Handoff: never add a new filter question. If the engine already resolved a
  // commercial fact for this turn (possible on a "ready" handoff, where the
  // engine does not stop building an answer — only an "immediate" handoff
  // does), present it alongside the derivation copy instead of silently
  // dropping it.
  if (input.wouldHandoff) {
    const resolvedFact = renderAnswerFact(plan.answer_fact);
    return finalize(resolvedFact ? `${resolvedFact} ${HANDOFF_DERIVATION_COPY}` : HANDOFF_DERIVATION_COPY);
  }

  // Primary source: the real engine's own resolved fact for this turn.
  const resolvedFact = renderAnswerFact(plan.answer_fact);
  if (resolvedFact) return finalize(resolvedFact);

  // Legacy fallback: only when the engine did not resolve any plan.answer_fact
  // for this turn (e.g. a standalone unit test exercising the shadow's own
  // multi-campaign structured facts directly, without a full engine response
  // plan). Never overrides a real plan.answer_fact — that check already
  // returned above.
  const legacyFacts = input.allowedFacts?.commercial_facts;
  if (legacyFacts && /precio|cuanto (?:sale|cuesta|vale)|cuotas?/.test(fold(message))) {
    if (legacyFacts.status === "single") {
      const offer = legacyFacts.alternatives[0];
      return finalize(offer.final_price ? `El precio informado es ${money(offer.final_price)}.` : offer.installment ? `La cuota informada es ${money(offer.installment)}.` : "No tengo un valor estructurado vigente para confirmarte.");
    }
    if (legacyFacts.status === "alternatives") return finalize(`Hay ${legacyFacts.alternatives.length} alternativas vigentes con condiciones diferentes. ¿Cuál plan o versión te interesa?`);
    return finalize("No tengo un valor estructurado vigente para confirmarte.");
  }

  if (plan.next_filter_question === "clarify_initial_amount_intent") return finalize(CLARIFY_INITIAL_AMOUNT_QUESTION);
  const questionCopy = FILTER_QUESTION_COPY[plan.next_filter_question];
  if (questionCopy) return finalize(questionCopy);

  return finalize("¿En qué modelo estás interesado?");
}
