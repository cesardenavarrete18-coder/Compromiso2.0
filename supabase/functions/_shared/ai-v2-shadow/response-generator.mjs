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
const DNC_ACK_COPY = "Entendido. No vamos a volver a contactarte.";

// A "ready" handoff with next_action=complete_filter (profile complete, contact
// timing still unknown, already asked once — Family L) reaches the composer
// with no answer_fact and no next_filter_question: the engine deliberately
// stopped asking, but this is not a commercial handoff either (Family I:
// complete_filter never counts as would_handoff). Say something that neither
// re-asks nor fabricates a derivation that hasn't happened.
const CONTACT_PENDING_HOLDING_COPY = "Quedamos atentos para coordinar el contacto en cuanto nos confirmes el horario.";

function finalize(text, extra = {}) {
  let finalText = text;
  if (countConceptualQuestions(finalText) > 1) finalText = finalText.slice(0, finalText.indexOf("?") + 1);
  return { text: finalText, status: "ready", question_count: countConceptualQuestions(finalText), ...extra };
}

function questionCopyFor(nextFilterQuestion) {
  if (!nextFilterQuestion) return null;
  if (nextFilterQuestion === "clarify_initial_amount_intent") return CLARIFY_INITIAL_AMOUNT_QUESTION;
  return FILTER_QUESTION_COPY[nextFilterQuestion] ?? null;
}

export function generateCandidateReply(input) {
  if (input.humanMode) return { text: null, status: "suppressed_human", question_count: 0 };
  const message = input.currentMessage ?? "";
  const plan = input.responsePlan ?? {};

  // Family M: DNC is decided by the engine (lead.do_not_contact / the
  // extractor+sanitizer's own do_not_contact signal — both already reach
  // decideHandoff as handoff_status="closed_or_routed"), not re-derived here
  // from a local regex. The Composer's own dnc() pattern below stays only as
  // an additional safety net for a case the engine has not already
  // classified — it can never contradict a real engine decision, because
  // this check runs first and returns unconditionally when the engine says so.
  if (plan.handoff === "closed_or_routed") {
    return plan.dnc_first_ack
      ? { text: DNC_ACK_COPY, status: "ready", question_count: 0, dnc: true, dnc_first_ack: true }
      : { text: null, status: "suppressed_dnc", question_count: 0, dnc: true };
  }
  if (dnc(message)) return { text: DNC_ACK_COPY, status: "ready", question_count: 0, dnc: true };
  if (closing(message)) return { text: "Entendido, gracias por avisarnos. Quedamos a disposición.", status: "ready", question_count: 0, closure: true };

  const questionCopy = questionCopyFor(plan.next_filter_question);

  // Technical/knowledge-lookup facts are resolved upstream from the engine's own
  // resolved_facts (pipeline.mjs), not re-derived here. Family K: the engine can
  // still have a next_filter_question pending alongside a technical answer —
  // compose both rather than dropping the question.
  if (input.knowledgeRequest) {
    const technical = input.allowedFacts?.technical_facts ?? [];
    const answer = technical.length ? String(technical[0].value) : "No tengo ese dato técnico verificado en este momento.";
    return finalize(questionCopy ? `${answer} ${questionCopy}` : answer);
  }

  // Handoff: never add a new filter question. If the engine already resolved a
  // commercial fact for this turn (possible on a "ready" handoff, where the
  // engine does not stop building an answer — only an "immediate" handoff
  // does), present it alongside the derivation copy instead of silently
  // dropping it.
  if (input.wouldHandoff) {
    const resolvedFact = renderAnswerFact(plan.answer_fact);
    return finalize(resolvedFact ? `${resolvedFact} ${HANDOFF_DERIVATION_COPY}` : HANDOFF_DERIVATION_COPY);
  }

  // A "ready" handoff that stopped asking without becoming a commercial handoff
  // (Family L, contact timing pending after one ask) — see comment above.
  if (plan.handoff === "ready") return finalize(CONTACT_PENDING_HOLDING_COPY);

  // Primary source: the real engine's own resolved fact for this turn. Family K:
  // compose it together with the next filter question when both are present —
  // answering must not silently stop the filter from advancing.
  const resolvedFact = renderAnswerFact(plan.answer_fact);
  if (resolvedFact) return finalize(questionCopy ? `${resolvedFact} ${questionCopy}` : resolvedFact);

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

  if (questionCopy) return finalize(questionCopy);

  return finalize("¿En qué modelo estás interesado?");
}
