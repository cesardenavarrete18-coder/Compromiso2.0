import test from "node:test";
import assert from "node:assert/strict";
import { classifySemanticChecks, falseInferenceDetails, isDecisionSensitivePath, neutralizedDetails } from "../src/filter-v1/online/semantic-safety-diff.mjs";

const mismatch = (path, expected, actual) => ({ path, expected, actual: actual === undefined ? [] : [actual], pass: false });
const classify = (path, expected, actual, unsafe = true) => falseInferenceDetails(classifySemanticChecks([mismatch(path, expected, actual)], "normalized"), { unsafe });

for (const [name, path, expected, actual, type] of [
  ["query intent", "query_intent", "technical_question", "general_information", "WRONG_CLASSIFICATION"],
  ["amount kind", "amount_mentions.kind", "monthly_installment_capacity", "down_payment_capacity", "WRONG_CLASSIFICATION"],
  ["vehicle role", "vehicle_mentions.role", "owned_only", "target", "WRONG_CLASSIFICATION"],
  ["trade-in model", "trade_in_vehicle.model.value", "Gol", "Gol Trend", "WRONG_VALUE"],
  ["requested action type", "requested_action.type", "deposit", "visit", "WRONG_CLASSIFICATION"],
  ["usable economic value", "amount_mentions.numeric_value", 500000, 5000000, "WRONG_VALUE"],
  ["target model", "vehicle_mentions.model_text", "Tera", "Amarok", "WRONG_VALUE"],
]) test(`${name} mismatch is decision-sensitive and unsafe`, () => {
  const result = classify(path, expected, actual);
  assert.equal(isDecisionSensitivePath(path), true);
  assert.deepEqual([result.length, result[0].type, result[0].path], [1, type, path]);
});

test("requested action omission is semantic recall loss, not unsafe", () => assert.deepEqual(classify("requested_action.type", "transfer", undefined), []));
test("contact preference omission is not unsafe", () => assert.deepEqual(classify("contact_preference_expression.literal", "ahora", undefined), []));
test("certainty mismatch discarded by adapter is not unsafe", () => assert.deepEqual(classify("amount_mentions.certainty", "contextual", "explicit"), []));

test("raw fabricated scale neutralized to null remains safe", () => {
  const raw = falseInferenceDetails(classifySemanticChecks([mismatch("amount_mentions.numeric_value", null, 5000)], "raw"));
  const normalized = classify("amount_mentions.numeric_value", null, undefined);
  assert.deepEqual([raw[0].type, normalized.length, neutralizedDetails(raw, normalized)[0].neutralized], ["WRONG_POSITIVE", 0, true]);
});

test("raw classification corrected by normalizer is neutralized", () => {
  const raw = falseInferenceDetails(classifySemanticChecks([mismatch("query_intent", "model_value", "installment_offer")], "raw"));
  assert.equal(neutralizedDetails(raw, [])[0].neutralized, true);
});

test("positive exceptional signals are unsafe", () => {
  for (const path of ["human_request", "strong_action", "do_not_contact"])
    assert.equal(classify(path, null, { type: path }).at(0).type, "WRONG_POSITIVE");
});

test("a mismatch outside the downstream surface remains diagnostic", () => assert.deepEqual(classify("needs_clarification.code", "other", "vehicle_role"), []));
