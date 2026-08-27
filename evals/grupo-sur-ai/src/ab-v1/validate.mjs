import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileGoldenDataset } from "../golden-compiler.mjs";
import { abPaths, validateCanonicalConfiguration } from "./canonical.mjs";
import { buildPairedInputManifest } from "./input-parity.mjs";

const canonical = await validateCanonicalConfiguration();
const datasetPath = resolve(abPaths.root, "golden_dataset_ia_comercial_grupo_sur_v1.md");
const [controlDataset, candidateDataset] = await Promise.all([compileGoldenDataset(datasetPath), compileGoldenDataset(datasetPath)]);
const actual = buildPairedInputManifest(controlDataset, candidateDataset);
const expected = JSON.parse(await readFile(resolve(abPaths.root, "AB_INPUT_MANIFEST.json"), "utf8"));
if (actual.manifest_sha256 !== expected.manifest_sha256) throw new Error(`AB_FROZEN_INPUT_MANIFEST_MISMATCH:${actual.manifest_sha256}`);

process.stdout.write(`${JSON.stringify({
  status: "ready_for_future_authorization",
  control_commit: canonical.manifest.control.source_commit,
  candidate_commit: canonical.manifest.candidate.source_commit,
  canonical_grader_sha256: canonical.manifest.canonical_grader.sha256,
  cases: actual.case_count,
  input_manifest_sha256: actual.manifest_sha256,
  input_parity: true,
  network_used: false,
  responses_called: 0,
  eval_cases_executed: 0,
  production_mutations: 0,
}, null, 2)}\n`);
