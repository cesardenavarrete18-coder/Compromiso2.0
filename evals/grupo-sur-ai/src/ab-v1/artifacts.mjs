import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";

const EXPECTED_ARM_FILES = Object.freeze(["metadata.json", "outputs.json", "results.json", "report.md"]);
const SECRET_PATTERNS = Object.freeze([
  ["openai_key", /\bsk-[A-Za-z0-9_-]{16,}\b/g],
  ["authorization", /\bAuthorization\s*[:=]\s*(?:Bearer\s+)?[^\s,}\]]+/gi],
  ["credential_assignment", /\b(?:OPENAI_(?:EVAL_)?API_KEY|SUPABASE_SERVICE_ROLE_KEY|META_ACCESS_TOKEN|WHATSAPP_TOKEN)\s*[:=]\s*["']?[^\s,"'}]+/gi],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
]);

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }

export function scanTextForSecrets(text) {
  const hits = [];
  for (const [type, pattern] of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(String(text))) hits.push(type);
  }
  return hits;
}

export function assertSyntheticEvalOutputs(outputs, expectedIds) {
  if (!Array.isArray(outputs) || outputs.length !== 100) throw new Error(`AB_ARTIFACT_OUTPUT_COUNT_INVALID:${outputs?.length}`);
  const ids = outputs.map((item) => item.eval_id);
  if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) throw new Error("AB_ARTIFACT_EVAL_IDS_MISMATCH");
  if (new Set(ids).size !== 100 || ids.some((id) => !/^GSV1-\d{3}$/.test(id))) throw new Error("AB_ARTIFACT_NON_GOLDEN_CASE");
  const hits = scanTextForSecrets(JSON.stringify(outputs));
  if (hits.length) throw new Error(`AB_ARTIFACT_SECRET_DETECTED:${hits.join(",")}`);
  return true;
}

function armReport(metadata, summary) {
  const graders = Object.entries(summary.grader_scores).map(([name, score]) => `| ${name} | ${score} |`).join("\n");
  return `# A/B v1 — ${metadata.arm}\n\n- A/B Run ID: \`${metadata.ab_run_id}\`\n- Arm Run ID: \`${metadata.arm_run_id}\`\n- Arm: \`${metadata.arm}\`\n- Source commit: \`${metadata.source_commit}\`\n- Canonical grader: \`${metadata.canonical_grader_sha256}\`\n- Input manifest: \`${metadata.input_manifest_sha256}\`\n- Model: \`${metadata.model}\`\n- Vector Store: \`${metadata.vector_store_id}\`\n\n## Resultado\n\n- Score oficial: **${summary.global.score}**\n- Normalized existing capabilities: **${summary.global.normalized_existing_capabilities_score}**\n- Official PASS: **${summary.global.pass}**\n- Official FAIL: **${summary.global.fail}**\n\n| Grader | Score |\n|---|---:|\n${graders}\n\nEste brazo es contemporáneo y no sobrescribe el Baseline v2 histórico.\n`;
}

export async function persistArmArtifacts({ artifactRoot, metadata, outputs, results, summary, expectedIds }) {
  assertSyntheticEvalOutputs(outputs, expectedIds);
  const directory = resolve(artifactRoot, metadata.ab_run_id, metadata.arm);
  const root = resolve(artifactRoot);
  if (!directory.startsWith(`${root}${sep}`)) throw new Error("AB_ARTIFACT_PATH_ESCAPE");
  await mkdir(directory, { recursive: true });
  const payloads = {
    "metadata.json": json({ ...metadata, data_provenance: "golden_dataset_v1.0.0_synthetic_only", production_data_included: false }),
    "outputs.json": json(outputs),
    "results.json": json({ metadata, summary, cases: results }),
    "report.md": armReport(metadata, summary),
  };
  for (const [name, content] of Object.entries(payloads)) {
    const hits = scanTextForSecrets(content);
    if (hits.length) throw new Error(`AB_ARTIFACT_SECRET_DETECTED:${name}:${hits.join(",")}`);
    await writeFile(resolve(directory, name), content, { flag: "wx" });
  }
  const hashes = Object.fromEntries(Object.entries(payloads).map(([name, content]) => [name, sha256(content)]));
  const artifactManifest = json({ protocol: "grupo-sur-ai-ab-artifact-v1", files: hashes });
  await writeFile(resolve(directory, "artifact-manifest.json"), artifactManifest, { flag: "wx" });
  const allHashes = { ...hashes, "artifact-manifest.json": sha256(artifactManifest) };
  const sums = `${Object.entries(allHashes).map(([name, digest]) => `${digest}  ${name}`).join("\n")}\n`;
  await writeFile(resolve(directory, "SHA256SUMS"), sums, { flag: "wx" });
  return { directory, hashes: { ...allHashes, SHA256SUMS: sha256(sums) } };
}

export async function auditArtifactDirectory(directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  if (entries.some((name) => name === ".env" || name.startsWith(".env."))) throw new Error("AB_ARTIFACT_ENV_FILE_FORBIDDEN");
  for (const name of entries) {
    const content = await readFile(resolve(directory, name), "utf8");
    const hits = scanTextForSecrets(content);
    if (hits.length) throw new Error(`AB_ARTIFACT_SECRET_DETECTED:${basename(name)}:${hits.join(",")}`);
  }
  for (const required of [...EXPECTED_ARM_FILES, "artifact-manifest.json", "SHA256SUMS"]) {
    if (!entries.includes(required)) throw new Error(`AB_ARTIFACT_FILE_MISSING:${required}`);
  }
  return { files: entries, secret_scan: "pass", env_files: 0, production_data_included: false };
}
