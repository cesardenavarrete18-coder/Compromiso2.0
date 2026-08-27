import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { compileGoldenDataset } from "../src/golden-compiler.mjs";
import { gradeCase } from "../src/graders.mjs";
import { abPaths, validateCanonicalConfiguration } from "../src/ab-v1/canonical.mjs";
import { assertSyntheticEvalOutputs, auditArtifactDirectory, persistArmArtifacts, scanTextForSecrets } from "../src/ab-v1/artifacts.mjs";
import { comparePairedResults } from "../src/ab-v1/comparator.mjs";
import { buildPairedInputManifest, validateDatasetAgainstInputManifest } from "../src/ab-v1/input-parity.mjs";
import { armDefinition, assertABExecutionAuthorization } from "../src/ab-v1/runner.mjs";

const datasetPath = resolve(abPaths.root, "golden_dataset_ia_comercial_grupo_sur_v1.md");
const frozenInputPath = resolve(abPaths.root, "AB_INPUT_MANIFEST.json");

async function datasets() {
  return Promise.all([compileGoldenDataset(datasetPath), compileGoldenDataset(datasetPath)]);
}

function legacyOutput(overrides = {}) {
  return {
    qualification_status: "follow_up", priority: "normal", intent_summary: "fixture",
    model_interest: "", disqualify_reason: "", reply_text: "¿Qué modelo estás buscando?",
    _shadow: { responses_called: 0, training_examples_present: [], rag: { retrieval_attempted: false, retrieval_returned: false, evidence_available: false, claim_supported: null, source_current_authorized: null } },
    ...overrides,
  };
}

function fakeGrader(score = 1) { return { score, outcome: score === 1 ? "PASS" : "FAIL_FUNCTIONAL", available: true }; }
function fakeCase(evalId, score = 80, criticalFailures = []) {
  const names = ["extraction", "qualification", "temperature", "handoff", "commercial_profile", "conversation_status", "next_action", "conversational_compliance", "grounding", "hallucinations", "privacy"];
  return {
    eval_id: evalId, score, normalized_existing_capabilities_score: score,
    official_pass: score >= 90 && !criticalFailures.length,
    existing_capabilities_pass: score >= 90 && !criticalFailures.length,
    critical_failures: criticalFailures, graders: Object.fromEntries(names.map((name) => [name, fakeGrader(score / 100)])),
  };
}
function fakeSummary(score = 80) {
  const names = ["extraction", "qualification", "temperature", "handoff", "commercial_profile", "conversation_status", "next_action", "conversational_compliance", "grounding", "hallucinations", "privacy"];
  return { global: { score, normalized_existing_capabilities_score: score, pass: 0, fail: 100 }, grader_scores: Object.fromEntries(names.map((name) => [name, score])), segments: { brand: {}, modality: {}, channel: {}, difficulty: {}, severity: {} } };
}

test("congela grader, runtimes, Golden, Matriz, modelo, RAG y Training snapshot", async () => {
  const validated = await validateCanonicalConfiguration();
  assert.equal(validated.manifest.canonical_grader.sha256, "151158dd6c65a410daf95a0dc6d9e7520d970d45ccfb58f1864e302f20dea203");
  assert.equal(validated.manifest.control.source_commit, "79f1a9ef537c103efbe6a58082191501e3622e0c");
  assert.equal(validated.manifest.candidate.source_commit, "29338872d1660225cfd24fad259941f224b576a7");
  assert.equal(validated.manifest.frozen_inputs.training_examples_count, 11);
});

test("los dos brazos reciben los mismos 100 runtime_input canónicos", async () => {
  const [control, candidate] = await datasets();
  const manifest = buildPairedInputManifest(control, candidate);
  const frozen = JSON.parse(await readFile(frozenInputPath, "utf8"));
  assert.equal(manifest.case_count, 100);
  assert.equal(manifest.manifest_sha256, frozen.manifest_sha256);
  assert.deepEqual(manifest.cases.map((item) => item.eval_id), frozen.cases.map((item) => item.eval_id));
  assert.equal(control.cases[0].runtime_input.existing_model_interest, "Peugeot 208");
  assert.match(control.cases[0].runtime_input.inbound_message.text, /Financiar/i);
});

test("cualquier diferencia de estado previo bloquea la paridad antes del run", async () => {
  const [control, candidate] = await datasets();
  candidate.cases[0].runtime_input.routing_state = { ...candidate.cases[0].runtime_input.routing_state, resolved: true };
  assert.throws(() => buildPairedInputManifest(control, candidate), /AB_RUNTIME_INPUT_MISMATCH:GSV1-001/);
});

test("cada brazo debe coincidir con el manifiesto de input congelado", async () => {
  const [control] = await datasets();
  const frozen = JSON.parse(await readFile(frozenInputPath, "utf8"));
  assert.equal(validateDatasetAgainstInputManifest(control, frozen).manifest_sha256, frozen.manifest_sha256);
});

test("el grader canónico no infiere capabilities nuevas en outputs legacy", async () => {
  const [control] = await datasets();
  const result = gradeCase(control.cases[0], legacyOutput({ qualification_status: "qualified", model_interest: "Peugeot 208" }));
  for (const name of ["temperature", "handoff", "commercial_profile", "conversation_status"]) {
    assert.equal(result.graders[name].outcome, "CAPABILITY_MISSING");
    assert.equal(result.graders[name].available, false);
  }
});

test("Control y Candidate resuelven runtimes separados y la ejecución falla cerrada", () => {
  assert.deepEqual(armDefinition("control"), { source: "baseline_v2_runtime_frozen", source_commit_key: "control" });
  assert.deepEqual(armDefinition("candidate"), { source: "candidate_v1_frozen", source_commit_key: "candidate" });
  assert.throws(() => assertABExecutionAuthorization({ arm: "control", authorization: "" }), /AB_EXECUTION_NOT_AUTHORIZED/);
  assert.throws(() => assertABExecutionAuthorization({ arm: "candidate", authorization: "EXECUTE_AB_V1_CONTROL_100_CASES" }), /AB_EXECUTION_NOT_AUTHORIZED/);
});

test("el adaptador Control no importa ni carga código Candidate", async () => {
  const controlSource = await readFile(resolve(abPaths.root, "src/ab-v1/control-arm.mjs"), "utf8");
  const candidateSource = await readFile(resolve(abPaths.root, "src/ab-v1/candidate-arm.mjs"), "utf8");
  assert.match(controlSource, /runtime-replica\.mjs/);
  assert.doesNotMatch(controlSource, /candidate/i);
  assert.match(candidateSource, /candidate-runtime\.mjs/);
  assert.doesNotMatch(candidateSource, /runtime-replica\.mjs/);
});

test("la persistencia genera los cuatro artefactos, manifiesto y hashes sin secretos", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "grupo-sur-ab-test-"));
  try {
    const ids = Array.from({ length: 100 }, (_, index) => `GSV1-${String(index + 1).padStart(3, "0")}`);
    const outputs = ids.map((eval_id) => ({ eval_id, runtime_input_sha256: "a".repeat(64), output: legacyOutput() }));
    const results = ids.map((id) => fakeCase(id));
    const metadata = { ab_run_id: "ab-v1-test", arm_run_id: "ab-v1-test-control", arm: "control", source_commit: "fixture", canonical_grader_sha256: "b".repeat(64), input_manifest_sha256: "c".repeat(64), model: "gpt-4.1-mini-2025-04-14", vector_store_id: "vs_fixture" };
    const persisted = await persistArmArtifacts({ artifactRoot: directory, metadata, outputs, results, summary: fakeSummary(), expectedIds: ids });
    const audit = await auditArtifactDirectory(persisted.directory);
    assert.equal(audit.secret_scan, "pass");
    assert.deepEqual(audit.files, ["SHA256SUMS", "artifact-manifest.json", "metadata.json", "outputs.json", "report.md", "results.json"]);
    assert.equal(Object.keys(persisted.hashes).length, 6);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("el escáner bloquea API keys, Authorization y credenciales", () => {
  const fakeKey = ["sk", "proj", "abcdefghijklmnopqrstuv"].join("-");
  const fakeAuthorization = ["Author", "ization: Bearer test-token"].join("");
  const fakeAssignment = ["OPENAI_EVAL", "_API_KEY=test-value"].join("");
  assert.ok(scanTextForSecrets(fakeKey).includes("openai_key"));
  assert.ok(scanTextForSecrets(fakeAuthorization).includes("authorization"));
  assert.ok(scanTextForSecrets(fakeAssignment).includes("credential_assignment"));
  const ids = Array.from({ length: 100 }, (_, index) => `GSV1-${String(index + 1).padStart(3, "0")}`);
  const outputs = ids.map((eval_id) => ({ eval_id, output: legacyOutput() }));
  outputs[0].output.reply_text = fakeKey;
  assert.throws(() => assertSyntheticEvalOutputs(outputs, ids), /AB_ARTIFACT_SECRET_DETECTED/);
});

test("la comparación pareada clasifica mejora, regresión y sin cambio", () => {
  const ids = Array.from({ length: 100 }, (_, index) => `GSV1-${String(index + 1).padStart(3, "0")}`);
  const controlCases = ids.map((id) => fakeCase(id));
  const candidateCases = ids.map((id) => fakeCase(id));
  candidateCases[0] = fakeCase(ids[0], 90, []); controlCases[0] = fakeCase(ids[0], 70, ["OLD_CRITICAL"]);
  candidateCases[1] = fakeCase(ids[1], 60, ["NEW_CRITICAL"]); controlCases[1] = fakeCase(ids[1], 80, []);
  const comparison = comparePairedResults({ summary: fakeSummary(80), cases: controlCases }, { summary: fakeSummary(82), cases: candidateCases });
  assert.deepEqual(comparison.counts, { improved: 1, regressed: 1, unchanged: 98, critical_failures_eliminated: 1, critical_failures_new: 1 });
  assert.equal(comparison.cases[0].classification, "improvement");
  assert.equal(comparison.cases[1].classification, "regression");
});
