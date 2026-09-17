import assert from "node:assert/strict";
import test from "node:test";
import { generateCandidateReply } from "../../../supabase/functions/_shared/ai-v2-shadow/response-generator.mjs";

// P1 pre-canary blocker (found auditing V2_SHADOW_CANDIDATE_2 real traffic, 2/11
// leads): Family T's exhaustion/asked-once logic (filter-v1-engine.mjs) legitimately
// produces response_plan.next_filter_question = null in a normal, non-handoff turn
// once every eligible field is exhausted and contact_preference was already asked
// once. Before Family T this composer branch was effectively unreachable outside a
// handoff/DNC turn (those return earlier), so its old hardcoded fallback
// ("¿En qué modelo estás interesado?") was latent, undertested dead weight - Family
// T's correct new behavior is what exposed it. Root cause confirmed in the real
// traffic: target_model was already known, next_filter_question was null (correct,
// deliberate silence from the engine), yet the Composer asked about the model
// anyway - contradicting the engine, which is supposed to be the sole authority on
// what to ask/answer/handoff.
//
// Fix: when nothing else applies, the Composer must say nothing (a distinct,
// unambiguous status - never silently reuse "ready" with a wrong string, and never
// invent a question the plan didn't contain), not fabricate a question.

test("Family U 1 (RED): target_model known + next_filter_question=null -> no invented model question, text=null", () => {
  const result = generateCandidateReply({
    currentMessage: "hola de nuevo",
    responsePlan: { next_filter_question: null, answer_fact: null, handoff: null },
    knowledgeRequest: null, wouldHandoff: false, humanMode: false, allowedFacts: {},
  });
  assert.notEqual(result.text, "¿En qué modelo estás interesado?");
  assert.equal(result.text, null);
  assert.equal(result.status, "no_response_planned");
  assert.equal(result.question_count, 0);
});

test("Family U 2 (RED): target_model UNKNOWN + next_filter_question=null -> Composer still does not invent a model question (it never corrects the engine)", () => {
  // The Composer has no notion of target_model at all - this test exists to prove
  // that fact: whatever the engine's real reason for returning null, the Composer's
  // behavior must be identical (silence), never conditional on re-deriving state
  // itself.
  const result = generateCandidateReply({
    currentMessage: "no se todavia",
    responsePlan: { next_filter_question: null, answer_fact: null, handoff: null },
    knowledgeRequest: null, wouldHandoff: false, humanMode: false, allowedFacts: {},
  });
  assert.notEqual(result.text, "¿En qué modelo estás interesado?");
  assert.equal(result.text, null);
  assert.equal(result.status, "no_response_planned");
});

test("Family U 3: next_filter_question='model' still asks the model question (unchanged)", () => {
  const result = generateCandidateReply({
    currentMessage: "hola", responsePlan: { next_filter_question: "model" },
  });
  assert.equal(result.text, "¿Qué modelo te interesa?");
  assert.equal(result.status, "ready");
});

test("Family U 4: next_filter_question='purchase_mode' still asks the purchase_mode question (unchanged)", () => {
  const result = generateCandidateReply({
    currentMessage: "hola", responsePlan: { next_filter_question: "purchase_mode" },
  });
  assert.equal(result.text, "¿Cómo pensás comprarlo, al contado o financiado?");
  assert.equal(result.status, "ready");
});

test("Family U 5: answer_fact resolved + next_filter_question=null -> answers ONLY the fact, no invented question", () => {
  const result = generateCandidateReply({
    currentMessage: "cuanto sale", wouldHandoff: false, humanMode: false, knowledgeRequest: null, allowedFacts: {},
    responsePlan: { answer_fact: { fact_type: "model_reference_value", status: "resolved", value: 30000000 }, next_filter_question: null },
  });
  assert.match(result.text, /30\.000\.000/);
  assert.equal(countQuestionMarks(result.text), 0);
});

test("Family U 6: answer_fact resolved + next_filter_question present -> answer + question composed together (unchanged, Family K)", () => {
  const result = generateCandidateReply({
    currentMessage: "cuanto sale y tienen usado", wouldHandoff: false, humanMode: false, knowledgeRequest: null, allowedFacts: {},
    responsePlan: { answer_fact: { fact_type: "model_reference_value", status: "resolved", value: 30000000 }, next_filter_question: "has_trade_in" },
  });
  assert.match(result.text, /30\.000\.000/);
  assert.match(result.text, /vehículo para entregar/);
});

test("Family U 7: wouldHandoff=true -> handoff derivation copy intact, unaffected by the null-contract fix", () => {
  const result = generateCandidateReply({
    currentMessage: "quiero reservarlo", wouldHandoff: true, humanMode: false, knowledgeRequest: null, allowedFacts: {},
    responsePlan: { answer_fact: null, next_filter_question: null },
  });
  assert.match(result.text, /derivar tu consulta al equipo comercial/);
  assert.equal(result.status, "ready");
});

test("Family U 8: plan.handoff='ready' (Family L complete-profile-unknown-timing) -> CONTACT_PENDING_HOLDING_COPY intact", () => {
  const result = generateCandidateReply({
    currentMessage: "hola", wouldHandoff: false, humanMode: false, knowledgeRequest: null, allowedFacts: {},
    responsePlan: { handoff: "ready", answer_fact: null, next_filter_question: null },
  });
  assert.match(result.text, /Quedamos atentos para coordinar el contacto/);
  assert.equal(result.status, "ready");
});

test("Family U 9a: DNC first ack intact", () => {
  const result = generateCandidateReply({
    currentMessage: "no me contacten mas", responsePlan: { handoff: "closed_or_routed", dnc_first_ack: true },
  });
  assert.equal(result.dnc, true);
  assert.equal(result.status, "ready");
  assert.ok(result.text);
});

test("Family U 9b: DNC repeat (already acked) -> suppressed, text=null, intact and DISTINCT from no_response_planned", () => {
  const result = generateCandidateReply({
    currentMessage: "hola de nuevo", responsePlan: { handoff: "closed_or_routed", dnc_first_ack: false },
  });
  assert.equal(result.status, "suppressed_dnc");
  assert.equal(result.text, null);
  assert.notEqual(result.status, "no_response_planned", "DNC suppression must remain its own distinct status, never conflated with the new no_response_planned status");
});

test("Family U 10: knowledgeRequest path intact", () => {
  const result = generateCandidateReply({
    currentMessage: "que motor tiene", knowledgeRequest: {}, allowedFacts: { technical_facts: [{ value: "Motor 1.6 verificado" }] },
    responsePlan: { next_filter_question: null },
  });
  assert.match(result.text, /1\.6/);
});

test("Family U 11: closure path intact", () => {
  const result = generateCandidateReply({ currentMessage: "No gracias", responsePlan: { next_filter_question: null } });
  assert.equal(result.closure, true);
  assert.equal(result.question_count, 0);
});

test("Family U 12a (real Candidate 2 case, anonymized): Peugeot 208 known, purchase_mode exhausted, contact_preference already asked_once -> silence, not a model question", () => {
  // Reproduces lead f1efc4e5's turns 4-5 exactly as persisted: response_plan had
  // next_filter_question=null, answer_fact=null, no handoff, no DNC, no closure -
  // target_model (Peugeot Partner) was already known in next_state, just not
  // visible to the Composer (which never receives target_model at all - this test
  // documents that fact directly, matching test 2 above).
  const result = generateCandidateReply({
    currentMessage: "Si", wouldHandoff: false, humanMode: false, knowledgeRequest: null, allowedFacts: {},
    responsePlan: { handoff: null, answer_fact: null, next_filter_question: null, warnings: [], answer_kind: "none", promotional_hook: null, knowledge_request: null, commercial_framing_allowed: true, cross_campaign_combination: false, can_present_as_single_alternative: false },
  });
  assert.equal(result.text, null);
  assert.equal(result.status, "no_response_planned");
});

test("Family U 12b (real Candidate 2 case, anonymized): 2nd lead (7c908c53) reaching the same null state via a different path (trade-in known this time) -> same silence contract", () => {
  const result = generateCandidateReply({
    currentMessage: "dale", wouldHandoff: false, humanMode: false, knowledgeRequest: null, allowedFacts: {},
    responsePlan: { handoff: null, answer_fact: null, next_filter_question: null },
  });
  assert.equal(result.text, null);
  assert.equal(result.status, "no_response_planned");
});

function countQuestionMarks(text) { return (String(text).match(/\?/g) ?? []).length; }
