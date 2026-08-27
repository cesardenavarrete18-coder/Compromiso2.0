import { canonicalJson, sha256 } from "./canonical.mjs";
import { validateRuntimeInput } from "../production-state-adapter.mjs";

export const STATE_DIMENSIONS = Object.freeze([
  "inbound_message", "existing_model_interest", "prior_history", "meta_referral",
  "advertised_interest", "prior_qualification", "conversation_control", "do_not_contact",
  "takeover", "routing_state", "persisted_data", "known_state_requirements",
]);

function hash(value) { return sha256(canonicalJson(value)); }

function caseState(entry) {
  validateRuntimeInput(entry.runtime_input, entry.eval_id);
  return Object.fromEntries(STATE_DIMENSIONS.map((name) => [name, hash(entry.runtime_input[name])]));
}

export function buildPairedInputManifest(controlDataset, candidateDataset) {
  const controlCases = controlDataset.cases;
  const candidateCases = candidateDataset.cases;
  if (controlCases.length !== 100 || candidateCases.length !== 100) throw new Error(`AB_INPUT_CASE_COUNT_MISMATCH:${controlCases.length}:${candidateCases.length}`);
  const cases = [];
  for (let index = 0; index < 100; index += 1) {
    const control = controlCases[index];
    const candidate = candidateCases[index];
    if (control.eval_id !== candidate.eval_id) throw new Error(`AB_INPUT_ID_MISMATCH:${index}:${control.eval_id}:${candidate.eval_id}`);
    const controlHash = hash(control.runtime_input);
    const candidateHash = hash(candidate.runtime_input);
    if (controlHash !== candidateHash) throw new Error(`AB_RUNTIME_INPUT_MISMATCH:${control.eval_id}`);
    const controlDimensions = caseState(control);
    const candidateDimensions = caseState(candidate);
    for (const name of STATE_DIMENSIONS) {
      if (controlDimensions[name] !== candidateDimensions[name]) throw new Error(`AB_STATE_DIMENSION_MISMATCH:${control.eval_id}:${name}`);
    }
    cases.push({ eval_id: control.eval_id, runtime_input_sha256: controlHash, state_dimension_sha256: controlDimensions });
  }
  const ids = cases.map((item) => item.eval_id);
  if (new Set(ids).size !== 100 || ids[0] !== "GSV1-001" || ids.at(-1) !== "GSV1-100") throw new Error("AB_INPUT_IDS_INVALID");
  const manifestCore = {
    protocol: "grupo-sur-ai-ab-input-v1",
    golden_dataset_sha256: controlDataset.sha256,
    case_count: 100,
    state_dimensions: STATE_DIMENSIONS,
    cases,
  };
  return { ...manifestCore, manifest_sha256: hash(manifestCore) };
}

export function validateDatasetAgainstInputManifest(dataset, expectedManifest) {
  const actual = buildPairedInputManifest(dataset, structuredClone(dataset));
  if (actual.manifest_sha256 !== expectedManifest.manifest_sha256) throw new Error(`AB_FROZEN_INPUT_MANIFEST_MISMATCH:${actual.manifest_sha256}`);
  return actual;
}
