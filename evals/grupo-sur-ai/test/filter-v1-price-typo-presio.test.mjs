import test from "node:test";
import assert from "node:assert/strict";
import { emptySemanticExtraction } from "../src/filter-v1/extraction/semantic-extraction-contract.mjs";
import { extractSemanticMessage } from "../src/filter-v1/extraction/semantic-extractor.mjs";

// Micro-fix pre-Candidate-4 (real Candidate 3 incident, same lead as the current-turn-evidence
// fix): "Al contado que presio es" was classified query_intent=general_information instead of
// model_value. Root cause (already audited): normalizeQueryIntent's price regex requires the
// exact spelling "precio" - "presio" (a very common Rioplatense-Spanish phonetic misspelling,
// confirmed non-hypothetical: 4 real inbound messages contain "presio" vs 44 with "precio")
// does not match, so the deterministic price-detection override never fires and the provider's
// own miss survives untouched.
//
// Scope: add "presio" as a spelling alias of "precio" ONLY - no fuzzy matching, no Levenshtein
// distance, no other unobserved variants, no purchase_mode semantics touched.

const msg = (text, id = "m1", role = "customer") => ({ id, role, text, created_at: "2026-09-18T16:00:00Z" });
const ev = (literal, source_message_id = "m1") => ({ source_message_id, literal });
const candidate = overrides => {
  const result = { ...emptySemanticExtraction(), ...overrides, evidence: { ...emptySemanticExtraction().evidence, ...(overrides.evidence ?? {}) } };
  for (const key of ["human_request", "strong_action", "do_not_contact"])
    if (typeof result[key] === "boolean") result[key] = result[key] ? { type: key, evidence: result.evidence[key] } : null;
  return result;
};
const extract = (text, output, recent_conversation = []) => extractSemanticMessage({ client: async () => output, current_message: msg(text), recent_conversation, previous_filter_state: null, acquisition_context: null, known_catalog_context: null });

// 1: real bug reproduction (exact real lead phrasing, anonymized case already audited).
test("1 (RED, real bug): 'Al contado que presio es' -> model_value, purchase_mode_statement stays not_present", async () => {
  const text = "Al contado que presio es";
  const out = await extract(text, candidate({
    query_intent: "general_information", purchase_mode_statement: "not_present",
    evidence: { query_intent: [ev(text)] },
  }));
  assert.equal(out.extraction.query_intent, "model_value");
  // "al contado" here is part of a PRICE QUESTION ("at cash price, what is it"), not a
  // standalone cash declaration - CASH_DECLARATION requires an unambiguous first-person
  // declarative phrase ("lo compro al contado"/"voy al contado"), which this is not.
  assert.equal(out.extraction.purchase_mode_statement, "not_present");
});

// 2: typo mid-sentence, must not invent a purchase_mode either.
test("2: 'Kisiera saber el presio de las dos contado' -> model_value, no invented purchase_mode", async () => {
  const text = "Kisiera saber el presio de las dos contado";
  const out = await extract(text, candidate({
    query_intent: "general_information", purchase_mode_statement: "not_present",
    evidence: { query_intent: [ev(text)] },
  }));
  assert.equal(out.extraction.query_intent, "model_value");
  assert.equal(out.extraction.purchase_mode_statement, "not_present");
});

// 3: "manual" (a technical-question keyword) sharing the turn with "presio" must not steal
// priority away from the price classification - technicalQuestion requires an actual question
// form, which this plain declarative-ish fragment does not have.
test("3: 'Si pero manual y presio' -> model_value, technical keyword does not steal precedence", async () => {
  const text = "Si pero manual y presio";
  const out = await extract(text, candidate({
    query_intent: "general_information", purchase_mode_statement: "not_present",
    evidence: { query_intent: [ev(text)] },
  }));
  assert.equal(out.extraction.query_intent, "model_value");
});

// 4: negative control - "presion" (pressure) must never match via accidental substring.
test("4 (negative control): 'presion de neumáticos' -> NOT model_value via substring collision", async () => {
  const text = "presion de neumáticos";
  const out = await extract(text, candidate({
    query_intent: "technical_question", purchase_mode_statement: "not_present",
    evidence: { query_intent: [ev(text)] },
  }));
  assert.notEqual(out.extraction.query_intent, "model_value");
});

// 5: correct spelling regression - "precio" must keep working exactly as before.
test("5 (regression): 'qué precio tiene' -> model_value (correct spelling unaffected)", async () => {
  const text = "qué precio tiene";
  const out = await extract(text, candidate({
    query_intent: "general_information", purchase_mode_statement: "not_present",
    evidence: { query_intent: [ev(text)] },
  }));
  assert.equal(out.extraction.query_intent, "model_value");
});

// 6: other existing price expressions must keep working exactly as before.
for (const text of ["cuánto sale", "qué valor tiene"]) {
  test(`6 (regression): '${text}' -> model_value (existing price expressions unaffected)`, async () => {
    const out = await extract(text, candidate({
      query_intent: "general_information", purchase_mode_statement: "not_present",
      evidence: { query_intent: [ev(text)] },
    }));
    assert.equal(out.extraction.query_intent, "model_value");
  });
}
