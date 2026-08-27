import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileGoldenDataset } from "../golden-compiler.mjs";
import { assertProductionCredentialIsolation, assertVectorStoreScope, createEvalTransport } from "../safety.mjs";
import { abPaths, validateCanonicalConfiguration } from "./canonical.mjs";
import { auditArtifactDirectory } from "./artifacts.mjs";
import { validateDatasetAgainstInputManifest } from "./input-parity.mjs";
import { executeCanonicalArm } from "./runner.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const arm = argument("--arm");
const abRunId = argument("--ab-run-id");
if (!/^(control|candidate)$/.test(String(arm))) throw new Error("AB_ARM_ARGUMENT_REQUIRED");
if (!/^ab-v1-[0-9TZ-]+$/.test(String(abRunId))) throw new Error("AB_RUN_ID_INVALID");
if (process.env.EVAL_EXECUTION_CONFIRMED !== "YES") throw new Error("EVAL_EXECUTION_NOT_CONFIRMED");
if (process.env.AB_EXECUTION_CONFIRMED !== `EXECUTE_AB_V1_${arm.toUpperCase()}_100_CASES`) throw new Error("AB_EXECUTION_NOT_CONFIRMED");
if (process.env.AB_ARTIFACT_BRANCH_CONFIRMED !== "eval-ab-v1-artifacts") throw new Error("AB_ARTIFACT_BRANCH_NOT_CONFIRMED");
if (!process.env.OPENAI_EVAL_API_KEY) throw new Error("OPENAI_EVAL_API_KEY_MISSING");
assertProductionCredentialIsolation();

const canonical = await validateCanonicalConfiguration();
const datasetPath = resolve(abPaths.root, "golden_dataset_ia_comercial_grupo_sur_v1.md");
const dataset = await compileGoldenDataset(datasetPath);
const frozenInputManifest = JSON.parse(await readFile(resolve(abPaths.root, "AB_INPUT_MANIFEST.json"), "utf8"));
validateDatasetAgainstInputManifest(dataset, frozenInputManifest);
const artifactRoot = resolve(abPaths.root, "ab-artifacts");
if (arm === "candidate") await auditArtifactDirectory(resolve(artifactRoot, abRunId, "control"));

const snapshot = JSON.parse(await readFile(resolve(abPaths.root, "snapshot/runtime_snapshot.json"), "utf8"));
const routingSnapshot = JSON.parse(await readFile(resolve(abPaths.root, "snapshot/routing_snapshot.json"), "utf8"));
const transport = createEvalTransport(process.env.OPENAI_EVAL_API_KEY);
await assertVectorStoreScope(transport, canonical.manifest.frozen_inputs.vector_store_id);
const result = await executeCanonicalArm({
  arm, authorization: process.env.AB_EXECUTION_CONFIRMED, abRunId, dataset,
  frozenInputManifest, canonicalManifest: canonical.manifest, snapshot, routingSnapshot,
  model: canonical.manifest.frozen_inputs.model, transport, artifactRoot,
});

process.stdout.write(`${JSON.stringify({
  status: "arm_complete_pending_artifact_commit",
  arm, arm_run_id: result.metadata.arm_run_id,
  artifact_directory: result.persisted.directory,
  score: result.summary.global.score,
  normalized_existing_capabilities_score: result.summary.global.normalized_existing_capabilities_score,
  responses_called: result.metadata.inference_count,
  production_mutations: 0,
}, null, 2)}\n`);
