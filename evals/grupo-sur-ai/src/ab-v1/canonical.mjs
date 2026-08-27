import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = resolve(root, "AB_V1_MANIFEST.json");

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function fileHash(relativePath) {
  return sha256(await readFile(resolve(root, relativePath)));
}

export async function loadABManifest() {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

export async function validateCanonicalConfiguration() {
  const manifest = await loadABManifest();
  const snapshot = JSON.parse(await readFile(resolve(root, "snapshot/runtime_snapshot.json"), "utf8"));
  const checks = {
    grader: await fileHash(manifest.canonical_grader.path),
    golden_dataset: await fileHash("golden_dataset_ia_comercial_grupo_sur_v1.md"),
    matrix: await fileHash("matriz_calificacion_handoff_grupo_sur.md"),
    runtime_snapshot: await fileHash("snapshot/runtime_snapshot.json"),
    routing_snapshot: await fileHash("snapshot/routing_snapshot.json"),
    model_verification: await fileHash("snapshot/model_verification.json"),
    control_runtime: await fileHash(manifest.control.runtime),
    candidate_runtime: await fileHash(manifest.candidate.runtime),
  };
  const expected = {
    grader: manifest.canonical_grader.sha256,
    golden_dataset: manifest.frozen_inputs.golden_dataset_sha256,
    matrix: manifest.frozen_inputs.matrix_sha256,
    runtime_snapshot: manifest.frozen_inputs.runtime_snapshot_sha256,
    routing_snapshot: manifest.frozen_inputs.routing_snapshot_sha256,
    model_verification: manifest.frozen_inputs.model_verification_sha256,
    control_runtime: manifest.control.runtime_sha256,
    candidate_runtime: manifest.candidate.runtime_sha256,
  };
  for (const [name, actual] of Object.entries(checks)) {
    if (actual !== expected[name]) throw new Error(`AB_CANONICAL_HASH_MISMATCH:${name}:${actual}`);
  }
  for (const [path, expectedHash] of Object.entries(manifest.candidate_source_sha256)) {
    const actual = await fileHash(path);
    if (actual !== expectedHash) throw new Error(`AB_CANDIDATE_CHANGED:${path}:${actual}`);
  }
  const trainingHash = sha256(JSON.stringify(snapshot.training_examples));
  if (trainingHash !== manifest.frozen_inputs.training_examples_json_sha256) throw new Error(`AB_TRAINING_SNAPSHOT_MISMATCH:${trainingHash}`);
  if (snapshot.training_examples.length !== manifest.frozen_inputs.training_examples_count) throw new Error("AB_TRAINING_COUNT_MISMATCH");
  if (snapshot.runtime.effective_model.value !== manifest.frozen_inputs.model) throw new Error("AB_MODEL_MISMATCH");
  if (snapshot.assistant_settings.vector_store_id !== manifest.frozen_inputs.vector_store_id) throw new Error("AB_VECTOR_STORE_MISMATCH");
  return { manifest, checks, training_examples_json_sha256: trainingHash };
}

export const abPaths = { root, manifestPath };
