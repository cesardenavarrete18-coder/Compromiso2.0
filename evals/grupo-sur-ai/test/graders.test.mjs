import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { compileGoldenDataset } from "../src/golden-compiler.mjs";
import { analyzeQuestions, gradeCase } from "../src/graders.mjs";

const datasetPromise = compileGoldenDataset(resolve(import.meta.dirname, "../golden_dataset_ia_comercial_grupo_sur_v1.md"));

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
