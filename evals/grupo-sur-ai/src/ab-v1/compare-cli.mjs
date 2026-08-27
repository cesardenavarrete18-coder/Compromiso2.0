import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { abPaths } from "./canonical.mjs";
import { auditArtifactDirectory } from "./artifacts.mjs";
import { comparePairedResults, persistComparison } from "./comparator.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const abRunId = argument("--ab-run-id");
if (!/^ab-v1-[0-9TZ-]+$/.test(String(abRunId))) throw new Error("AB_RUN_ID_INVALID");
const root = resolve(abPaths.root, "ab-artifacts", abRunId);
const controlDirectory = resolve(root, "control"); const candidateDirectory = resolve(root, "candidate");
await auditArtifactDirectory(controlDirectory); await auditArtifactDirectory(candidateDirectory);
const control = JSON.parse(await readFile(resolve(controlDirectory, "results.json"), "utf8"));
const candidate = JSON.parse(await readFile(resolve(candidateDirectory, "results.json"), "utf8"));
for (const field of ["canonical_grader_sha256", "golden_dataset_sha256", "matrix_sha256", "input_manifest_sha256", "model", "vector_store_id", "training_examples_json_sha256"]) {
  if (control.metadata[field] !== candidate.metadata[field]) throw new Error(`AB_COMPARE_METADATA_MISMATCH:${field}`);
}
const comparison = comparePairedResults(control, candidate);
const hashes = await persistComparison({ directory: root, comparison });
process.stdout.write(`${JSON.stringify({ status: "comparison_complete_pending_artifact_commit", ab_run_id: abRunId, counts: comparison.counts, hashes, network_used: false, responses_called: 0, production_mutations: 0 }, null, 2)}\n`);
