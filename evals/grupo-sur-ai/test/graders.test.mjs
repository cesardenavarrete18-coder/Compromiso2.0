import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileGoldenDataset } from "../src/golden-compiler.mjs";
import { analyzeQuestions, gradeCase } from "../src/graders.mjs";
import { GRADER_VERSION, gradeCase as gradeCaseV11 } from "../src/graders-v1.1.mjs";

const datasetPromise = compileGoldenDataset(resolve(import.meta.dirname, "../golden_dataset_ia_comercial_grupo_sur_v1.md"));

function completeOutput(evalCase, overrides = {}) {
  return {
    qualification_status: evalCase.expected.qualification_status,
    commercial_temperature: evalCase.expected.commercial_temperature,
    handoff_status: evalCase.expected.handoff_status,
    commercial_profile_complete: evalCase.expected.commercial_profile_complete,
    missing_commercial_fields: evalCase.expected.missing_commercial_fields,
    conversation_status: evalCase.expected.conversation_status,
    do_not_contact: evalCase.expected.do_not_contact,
    next_action: evalCase.expected.next_action,
    reply_text: "",
    _shadow: { responses_called: 0, training_examples_present: [], rag: {} },
    ...overrides,
  };
}

test("preserva grader v1 byte a byte y registra un grader v1.1 distinto", async () => {
  const hash = async (name) => createHash("sha256").update(await readFile(resolve(import.meta.dirname, `../src/${name}`))).digest("hex");
  assert.equal(await hash("graders.mjs"), "151158dd6c65a410daf95a0dc6d9e7520d970d45ccfb58f1864e302f20dea203");
  assert.notEqual(await hash("graders-v1.1.mjs"), await hash("graders.mjs"));
  assert.equal(GRADER_VERSION, "1.1");
});

test("detecta preguntas directas, indirectas, grupos, alternativas y repetición", async () => {
  const evalCase = (await datasetPromise).cases.find((item) => item.eval_id === "GSV1-001");
  const analysis = analyzeQuestions("Confirmame qué modelo querés y si preferís financiar o pagar al contado. Decime con cuánto efectivo contás.", evalCase);
  assert.ok(analysis.indirect_count >= 1);
  assert.ok(analysis.multiple_commercial_groups);
  assert.ok(analysis.multiple_alternatives);
  assert.ok(analysis.repeated_known_data.includes("model_interest") || analysis.repeated_known_data.includes("purchase_modality"));
});

test("separa fallo funcional de capacidad ausente y calcula score disponible", async () => {
  const evalCase = (await datasetPromise).cases.find((item) => item.eval_id === "GSV1-001");
  const result = gradeCase(evalCase, {
    qualification_status: "qualified", model_interest: "Peugeot 208",
    reply_text: "Un asesor continuará la gestión.",
    _shadow: { responses_called: 1, training_examples_present: [], rag: { retrieval_attempted: false, retrieval_returned: false, evidence_available: false, claim_supported: null, source_current_authorized: null } },
  });
  assert.equal(result.graders.qualification.outcome, "FAIL_FUNCTIONAL");
  assert.equal(result.graders.temperature.outcome, "CAPABILITY_MISSING");
  assert.ok(result.available_max < 100);
  assert.equal(typeof result.available_score, "number");
  assert.equal(typeof result.normalized_existing_capabilities_score, "number");
  assert.equal(result.official_pass, false);
  assert.equal(result.blocked_by_missing_capabilities, true);
});

test("next_action rechaza acciones adicionales y grounding no equivale a file_search", async () => {
  const evalCase = (await datasetPromise).cases.find((item) => item.eval_id === "GSV1-001");
  const result = gradeCase(evalCase, {
    qualification_status: "follow_up", model_interest: "Peugeot 208",
    reply_text: "¿Con cuánto anticipo contás y qué cuota podés pagar? Un asesor seguirá la gestión.",
    _shadow: { responses_called: 1, file_search_used: true, training_examples_present: [], rag: { retrieval_attempted: true, retrieval_returned: true, evidence_available: false, claim_supported: null, source_current_authorized: null } },
  });
  assert.equal(result.graders.next_action.outcome, "FAIL_FUNCTIONAL");
  assert.ok(result.graders.next_action.details.incorrect_additional_actions.length > 0);
  assert.equal(result.graders.grounding.details.evidence_available, false);
  assert.ok(result.prohibition_checks.some((item) => item.id === "handoff_forbidden" && item.violated));
});

test("GSV1-028 permite el handoff estructuralmente requerido", async () => {
  const evalCase = (await datasetPromise).cases.find((item) => item.eval_id === "GSV1-028");
  const result = gradeCaseV11(evalCase, completeOutput(evalCase, { reply_text: "Un asesor continuará la gestión.", next_action: "pause_ai_and_handoff" }));
  assert.ok(!result.critical_failures.includes("PROHIBITION_HANDOFF_FORBIDDEN"));
});

for (const evalId of ["GSV1-068", "GSV1-087"]) {
  test(`${evalId} mantiene penalizado el handoff indebido`, async () => {
    const evalCase = (await datasetPromise).cases.find((item) => item.eval_id === evalId);
    const result = gradeCaseV11(evalCase, completeOutput(evalCase, { reply_text: "Te voy a derivar con un asesor." }));
    assert.ok(result.critical_failures.includes("PROHIBITION_HANDOFF_FORBIDDEN"));
  });
}

test("una prohibición sintética explícita mantiene penalizado el handoff", async () => {
  const original = (await datasetPromise).cases.find((item) => item.eval_id === "GSV1-068");
  const evalCase = { ...original, expected: { ...original.expected, handoff_status: "continue_ai", critical_prohibitions: "no derivar a un asesor" } };
  const result = gradeCaseV11(evalCase, completeOutput(evalCase, { reply_text: "Te derivo con un asesor." }));
  assert.ok(result.critical_failures.includes("PROHIBITION_HANDOFF_FORBIDDEN"));
});

test("missing_commercial_fields normaliza sólo CASH como cash_available", async () => {
  const original = (await datasetPromise).cases.find((item) => item.eval_id === "GSV1-068");
  const historical = gradeCase(original, completeOutput(original, { missing_commercial_fields: ["cash_available", "target_installment"] }));
  const equivalent = gradeCaseV11(original, completeOutput(original, { missing_commercial_fields: ["cash_available", "target_installment"] }));
  const different = gradeCaseV11(original, completeOutput(original, { missing_commercial_fields: ["trade_in", "target_installment"] }));
  assert.equal(historical.graders.commercial_profile.outcome, "FAIL_FUNCTIONAL");
  assert.equal(equivalent.graders.commercial_profile.outcome, "PASS");
  assert.equal(different.graders.commercial_profile.outcome, "FAIL_FUNCTIONAL");
});
