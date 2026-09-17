import assert from "node:assert/strict";
import test from "node:test";
import { generateCandidateReply } from "../../../supabase/functions/_shared/ai-v2-shadow/response-generator.mjs";
import { resolveStructuredCommercialFacts, buildAllowedFacts } from "../../../supabase/functions/_shared/ai-v2-shadow/facts.mjs";

// Blocker 1 (real Candidate 2 incident, pre-canary): response-generator.mjs's
// legacy `commercial_facts` fallback re-infers commercial intent from raw
// currentMessage text (a plain price/cuota regex), completely bypassing
// whatever response_plan the real engine already produced for this turn. Real
// case: customer said "Sinceramente tengo hoy x hoy 2m y a su ves puedo pagar
// cuotas de 300 a 500 x mes" - the engine correctly produced
// query_intent=none, answer_fact=null, next_filter_question=contact_preference
// (nothing to answer this turn, ask about timing), yet the Composer answered
// "El precio informado es $43.080.000." purely because the raw message
// contained "cuotas". This contradicts the axiom already established for
// Family U: when a real response_plan exists, the engine is the sole
// authority - the Composer must never re-derive commercial intent from raw
// text over it.
//
// Fix: the legacy fallback may only run when the caller supplied no
// response_plan at all (a genuinely legacy/offline caller that never had an
// engine turn to consult) - never when a real response_plan is present,
// regardless of what it decided (including "decided to answer nothing").

const campaign40 = () => resolveStructuredCommercialFacts({ targetModelId: "m1", campaigns: [{ id: "c1", model_id: "m1", final_price: 40370000 }] });

test("Legacy-precedence 1 (RED, real case reproduction): responsePlan real + raw 'cuotas' + answer_fact=null -> follows the plan (contact_preference), never the legacy price/cuota guess", () => {
  const result = generateCandidateReply({
    currentMessage: "Sinceramente tengo hoy x hoy 2m y a su ves puedo pagar cuotas de 300 a 500 x mes",
    responsePlan: { answer_kind: "none", answer_fact: null, next_filter_question: "contact_preference", handoff: null },
    allowedFacts: { commercial_facts: campaign40() },
    wouldHandoff: false, humanMode: false, knowledgeRequest: null,
  });
  assert.doesNotMatch(result.text ?? "", /\$?43\.080\.000|precio informado/);
  assert.equal(result.text, "¿Cuál es el mejor horario para que te contactemos?");
  assert.equal(result.status, "ready");
});

test("Legacy-precedence 2: responsePlan real with answer_fact installment (resolved) -> answers the cuota normally via the plan, not legacy", () => {
  const result = generateCandidateReply({
    currentMessage: "y las cuotas?",
    responsePlan: { answer_fact: { fact_type: "installment_offer", status: "resolved", value: 430000 }, next_filter_question: null },
    allowedFacts: { commercial_facts: campaign40() },
    wouldHandoff: false, humanMode: false, knowledgeRequest: null,
  });
  assert.match(result.text, /430\.000/);
});

test("Legacy-precedence 3: responsePlan real with answer_fact price (resolved) -> answers the price normally via the plan, not legacy", () => {
  const result = generateCandidateReply({
    currentMessage: "cuanto sale",
    responsePlan: { answer_fact: { fact_type: "model_reference_value", status: "resolved", value: 40370000 }, next_filter_question: null },
    allowedFacts: { commercial_facts: campaign40() },
    wouldHandoff: false, humanMode: false, knowledgeRequest: null,
  });
  assert.match(result.text, /40\.370\.000/);
});

test("Legacy-precedence 4: responsePlan real with a next_filter_question -> asks exactly what the engine decided, even though raw message matches the legacy price regex", () => {
  const result = generateCandidateReply({
    currentMessage: "cuanto cuesta y ademas tengo un usado",
    responsePlan: { answer_fact: null, next_filter_question: "has_trade_in" },
    allowedFacts: { commercial_facts: campaign40() },
    wouldHandoff: false, humanMode: false, knowledgeRequest: null,
  });
  assert.match(result.text, /vehículo para entregar/);
  assert.doesNotMatch(result.text, /40\.370\.000/);
});

test("Legacy-precedence 5 (documents the intentionally-kept behavior): responsePlan entirely absent (genuinely legacy/offline caller) -> legacy fallback still answers from commercial_facts", () => {
  const facts = resolveStructuredCommercialFacts({ targetModelId: "1", campaigns: [{ id: "a", model_id: "1", final_price: 40370000 }] });
  const result = generateCandidateReply({ currentMessage: "cuánto vale", allowedFacts: buildAllowedFacts({ structuredFacts: facts }) });
  assert.match(result.text, /40\.370\.000/);
});

test("Legacy-precedence 6 (Family Q sentinel, real incident lead 60c87f67 shape): responsePlan real with answer_fact not_materialized (used-vehicle subject guard) -> legacy NEVER bypasses this guard even though raw text matches the price regex", () => {
  const result = generateCandidateReply({
    currentMessage: "No cero km un usado, cuanto vale",
    responsePlan: { answer_fact: { fact_type: "model_reference_value", status: "not_materialized" }, next_filter_question: null },
    allowedFacts: { commercial_facts: campaign40() },
    wouldHandoff: false, humanMode: false, knowledgeRequest: null,
  });
  assert.doesNotMatch(result.text ?? "", /40\.370\.000/);
  assert.match(result.text, /No tengo un valor estructurado vigente/);
});
