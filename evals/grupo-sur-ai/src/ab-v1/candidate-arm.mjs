import { runCandidateRuntimeCase } from "../candidate-v1/candidate-runtime.mjs";

export function executeCandidateCase({ evalCase, snapshot, model, transport }) {
  return runCandidateRuntimeCase({ evalCase, snapshot, model, transport });
}
