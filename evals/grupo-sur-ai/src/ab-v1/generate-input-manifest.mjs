import { resolve } from "node:path";
import { compileGoldenDataset } from "../golden-compiler.mjs";
import { abPaths } from "./canonical.mjs";
import { buildPairedInputManifest } from "./input-parity.mjs";

const datasetPath = resolve(abPaths.root, "golden_dataset_ia_comercial_grupo_sur_v1.md");
const [controlDataset, candidateDataset] = await Promise.all([compileGoldenDataset(datasetPath), compileGoldenDataset(datasetPath)]);
process.stdout.write(`${JSON.stringify(buildPairedInputManifest(controlDataset, candidateDataset), null, 2)}\n`);
