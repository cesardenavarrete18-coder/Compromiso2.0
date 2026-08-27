import { buildRunSummary, gradeCase } from "../graders.mjs";
import { validateDatasetAgainstInputManifest } from "./input-parity.mjs";
import { persistArmArtifacts } from "./artifacts.mjs";

const ARM_DEFINITIONS = Object.freeze({
  control: { source: "baseline_v2_runtime_frozen", source_commit_key: "control", module: "./control-arm.mjs", exportName: "executeControlCase" },
  candidate: { source: "candidate_v1_frozen", source_commit_key: "candidate", module: "./candidate-arm.mjs", exportName: "executeCandidateCase" },
});

export function assertABExecutionAuthorization({ arm, authorization }) {
  if (!ARM_DEFINITIONS[arm]) throw new Error(`AB_ARM_INVALID:${arm}`);
  if (authorization !== `EXECUTE_AB_V1_${arm.toUpperCase()}_100_CASES`) throw new Error(`AB_EXECUTION_NOT_AUTHORIZED:${arm}`);
  return true;
}

export function armDefinition(arm) {
  const definition = ARM_DEFINITIONS[arm];
  if (!definition) throw new Error(`AB_ARM_INVALID:${arm}`);
  return { source: definition.source, source_commit_key: definition.source_commit_key };
}

export async function executeCanonicalArm({
  arm, authorization, abRunId, dataset, frozenInputManifest, canonicalManifest,
  snapshot, routingSnapshot, model, transport, artifactRoot,
}) {
  assertABExecutionAuthorization({ arm, authorization });
  validateDatasetAgainstInputManifest(dataset, frozenInputManifest);
  const definition = ARM_DEFINITIONS[arm];
  const armModule = await import(definition.module);
  const armRunner = armModule[definition.exportName];
  if (typeof armRunner !== "function") throw new Error(`AB_ARM_RUNNER_MISSING:${arm}`);
  const outputs = []; const results = [];
  for (const evalCase of dataset.cases) {
    const inputBefore = frozenInputManifest.cases.find((item) => item.eval_id === evalCase.eval_id)?.runtime_input_sha256;
    const output = arm === "control"
      ? await armRunner({ evalCase: structuredClone(evalCase), snapshot, routingSnapshot, model, transport })
      : await armRunner({ evalCase: structuredClone(evalCase), snapshot, model, transport });
    outputs.push({ eval_id: evalCase.eval_id, runtime_input_sha256: inputBefore, output });
    results.push(gradeCase(evalCase, output));
  }
  if (outputs.length !== 100) throw new Error(`AB_ARM_INCOMPLETE:${arm}:${outputs.length}`);
  const summary = buildRunSummary(results);
  const source = canonicalManifest[definition.source_commit_key];
  const timestamp = new Date().toISOString();
  const metadata = {
    protocol: "grupo-sur-ai-ab-v1", ab_run_id: abRunId,
    arm_run_id: `${abRunId}-${arm}-${timestamp.replace(/[:.]/g, "-")}`,
    arm, timestamp, source_commit: source.source_commit,
    canonical_grader_sha256: canonicalManifest.canonical_grader.sha256,
    golden_dataset_sha256: canonicalManifest.frozen_inputs.golden_dataset_sha256,
    matrix_sha256: canonicalManifest.frozen_inputs.matrix_sha256,
    input_manifest_sha256: frozenInputManifest.manifest_sha256,
    model, vector_store_id: canonicalManifest.frozen_inputs.vector_store_id,
    training_examples_json_sha256: canonicalManifest.frozen_inputs.training_examples_json_sha256,
    inference_count: outputs.reduce((sum, item) => sum + Number(item.output?._shadow?.responses_called || 0), 0),
    historical_baseline_overwritten: false,
  };
  const persisted = await persistArmArtifacts({
    artifactRoot, metadata, outputs, results, summary,
    expectedIds: frozenInputManifest.cases.map((item) => item.eval_id),
  });
  return { metadata, summary, persisted };
}
