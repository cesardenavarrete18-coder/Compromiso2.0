import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compileGoldenDataset } from "./golden-compiler.mjs";
import { buildRunSummary, gradeCase } from "./graders.mjs";
import { runCurrentRuntimeCase, verifySnapshotSource } from "./runtime-replica.mjs";
import {
  assertExecutionConfirmation, assertProductionCredentialIsolation, assertVectorStoreScope,
  createEvalTransport, createVectorReadOnlyTransport, SafetyError,
} from "./safety.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = resolve(root, "snapshot/runtime_snapshot.json");
const routingPath = resolve(root, "snapshot/routing_snapshot.json");
const modelVerificationPath = resolve(root, "snapshot/model_verification.json");
const datasetPath = resolve(root, "golden_dataset_ia_comercial_grupo_sur_v1.md");

async function loadJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function sha(path) { return createHash("sha256").update(await readFile(path)).digest("hex"); }

async function basePreflight({ requireCredential }) {
  const [snapshot, routingSnapshot, modelVerification, dataset] = await Promise.all([
    loadJson(snapshotPath), loadJson(routingPath), loadJson(modelVerificationPath), compileGoldenDataset(datasetPath),
  ]);
  await verifySnapshotSource(snapshot);
  const blocks = [];
  if (modelVerification.status !== "verified" || !modelVerification.effective_model || !modelVerification.source_reference) blocks.push("PRODUCTIVE_MODEL_UNVERIFIED");
  if (requireCredential && !process.env.OPENAI_EVAL_API_KEY) blocks.push("OPENAI_EVAL_API_KEY_MISSING");
  if (snapshot.assistant_settings.vector_store_id !== "vs_6a80740821c081918bc10552428e6249") blocks.push("VECTOR_STORE_SNAPSHOT_UNEXPECTED");
  return {
    snapshot, routingSnapshot, modelVerification, dataset, blocks,
    hashes: { runtime_snapshot: await sha(snapshotPath), routing_snapshot: await sha(routingPath), model_verification: await sha(modelVerificationPath), dataset: dataset.sha256 },
  };
}

function markdownReport(metadata, results, summary) {
  const critical = summary.critical_failures.length
    ? summary.critical_failures.map((item) => `- ${item.eval_id}: ${item.failures.join(", ")}`).join("\n") : "- Ninguno";
  const majors = summary.major_failures.length ? summary.major_failures.map((id) => `- ${id}`).join("\n") : "- Ninguno";
  const graders = Object.entries(summary.grader_scores).map(([name, value]) => `| ${name} | ${value} |`).join("\n");
  const segments = Object.entries(summary.segments).flatMap(([dimension, groups]) => Object.entries(groups).map(([group, value]) => `| ${dimension} | ${group} | ${value.cases} | ${value.score} | ${value.pass} | ${value.fail} |`)).join("\n");
  const topErrors = summary.top_10_errors.map((item, index) => `${index + 1}. ${item.name}: ${item.count}`).join("\n") || "Sin errores";
  const rootCauses = summary.root_cause_layers.map((item) => `- ${item.name}: ${item.count} casos`).join("\n") || "- Sin causas agrupadas";
  const g = summary.gsv1_001;
  return `# Baseline IA actual — Golden Dataset v1.0.0

**Timestamp UTC:** ${metadata.timestamp}\n
**Modelo solicitado:** ${metadata.model}\n
**Edge Function:** whatsapp-webhook v${metadata.edge_function_version} · ${metadata.edge_function_hash}\n
**Dataset:** ${metadata.dataset_hash}\n
**Snapshot:** ${metadata.snapshot_hash}\n
**Vector Store:** ${metadata.vector_store_id}\n

## Resultado

**Score global:** ${summary.global.score}/100  
**PASS:** ${summary.global.pass}  
**FAIL:** ${summary.global.fail}

| Grader | Score /100 |
|---|---:|
${graders}

## Segmentos

| Dimensión | Segmento | Casos | Score | PASS | FAIL |
|---|---|---:|---:|---:|---:|
${segments}

## CRITICAL failures

${critical}

## MAJOR failures

${majors}

## Top 10 errores

${topErrors}

## Causas raíz agrupadas

${rootCauses}

## GSV1-001

- Expected: ${g.expected.qualification_status} · ${g.expected.commercial_temperature} · ${g.expected.handoff_status}; next action ${g.expected.next_action}.
- Observed qualification: ${g.observed.qualification_status}.
- Observed next action: ${g.observed.next_action}.
- Score: ${g.score}/100.
- Critical failures: ${g.critical_failures.join(", ") || "ninguno"}.
- Respuesta: ${JSON.stringify(g.observed.reply_text)}

## Mapa caso → capa responsable

Consultar \`results.json\`, campo \`summary.case_to_layer\`. Cada caso conserva graders, evidencias, fallas críticas y capas responsables.
`;
}

async function compileOnly() {
  const { dataset, blocks, hashes } = await basePreflight({ requireCredential: false });
  await mkdir(resolve(root, "compiled"), { recursive: true });
  await writeFile(resolve(root, "compiled/golden-v1.0.0.json"), JSON.stringify(dataset, null, 2) + "\n", { flag: "w" });
  return { compiled_cases: dataset.cases.length, hashes, blocks };
}

async function offlinePreflight() {
  const state = await basePreflight({ requireCredential: true });
  return { ready: state.blocks.length === 0, blocks: state.blocks, cases: state.dataset.cases.length, hashes: state.hashes, network_used: false, inferences: 0 };
}

async function livePreflight() {
  const isolation = assertProductionCredentialIsolation();
  const state = await basePreflight({ requireCredential: true });
  const audit = { requests: [] };
  let credential = { status: "not_checked" };
  let vectorStore = { status: "not_checked", id: state.snapshot.assistant_settings.vector_store_id };
  const blocks = [...state.blocks];

  if (process.env.OPENAI_EVAL_API_KEY) {
    try {
      const transport = createVectorReadOnlyTransport(process.env.OPENAI_EVAL_API_KEY, audit);
      const vector = await assertVectorStoreScope(transport, state.snapshot.assistant_settings.vector_store_id);
      credential = { status: "valid_for_required_resource" };
      vectorStore = { status: "accessible", id: vector.id, resource_status: vector.status };
    } catch (error) {
      const diagnostic = error instanceof SafetyError ? error.diagnostic : null;
      credential = {
        status: diagnostic?.classification === "credential_invalid_or_unauthenticated"
          ? "invalid_or_unauthenticated"
          : "failed",
      };
      vectorStore = {
        status: "inaccessible",
        id: state.snapshot.assistant_settings.vector_store_id,
        ...(diagnostic ? { access_error: diagnostic } : {}),
      };
      if (!blocks.includes("RAG_RESOURCE_SCOPE_MISMATCH")) blocks.push("RAG_RESOURCE_SCOPE_MISMATCH");
    }
  }

  const uniqueBlocks = [...new Set(blocks)];
  return {
    ready_for_baseline: uniqueBlocks.length === 0,
    blocks: uniqueBlocks,
    checks: {
      eval_credential: credential,
      frozen_vector_store: vectorStore,
      production_services: {
        status: isolation.isolated ? "inaccessible_by_construction" : "failed",
        supabase: "no_client_no_credentials",
        meta: "no_client_no_credentials",
        whatsapp: "no_client_no_credentials",
      },
      productive_model: {
        status: state.modelVerification.status,
        effective_value: state.modelVerification.effective_model,
        source_reference: state.modelVerification.source_reference,
      },
      model_parity: state.modelVerification.status === "verified"
        ? { status: "exact_match", eval_model: state.modelVerification.effective_model }
        : { status: "unverified", eval_model: null },
    },
    evidence: {
      network_requests: audit.requests,
      responses_requests: 0,
      inferences: 0,
      production_mutations: 0,
      cases_executed: 0,
      credential_value_logged: false,
    },
    hashes: state.hashes,
  };
}

async function executeRun() {
  assertExecutionConfirmation();
  const state = await basePreflight({ requireCredential: true });
  if (state.blocks.length) throw new Error(`PREFLIGHT_BLOCKED:${state.blocks.join(",")}`);
  const transport = createEvalTransport(process.env.OPENAI_EVAL_API_KEY);
  const vector = await assertVectorStoreScope(transport, state.snapshot.assistant_settings.vector_store_id);
  if (!vector?.id) throw new SafetyError("RAG_RESOURCE_SCOPE_MISMATCH");

  const timestamp = new Date().toISOString();
  const runId = `baseline-${timestamp.replace(/[:.]/g, "-")}`;
  const runDir = resolve(root, "runs", runId);
  await mkdir(runDir, { recursive: true });
  const outputs = []; const results = [];
  for (const evalCase of state.dataset.cases) {
    const output = await runCurrentRuntimeCase({
      evalCase, snapshot: state.snapshot, routingSnapshot: state.routingSnapshot,
      model: state.modelVerification.effective_model, transport,
    });
    outputs.push({ eval_id: evalCase.eval_id, output });
    results.push(gradeCase(evalCase, output));
  }
  if (outputs.length !== 100) throw new Error(`RUN_INCOMPLETE:${outputs.length}`);
  const summary = buildRunSummary(results);
  const metadata = {
    run_id: runId, timestamp, model: state.modelVerification.effective_model,
    model_verification: state.modelVerification, edge_function_version: state.snapshot.runtime.edge_function.version,
    edge_function_hash: state.snapshot.runtime.edge_function.ezbr_sha256,
    dataset_hash: state.dataset.sha256, snapshot_hash: state.hashes.runtime_snapshot,
    routing_snapshot_hash: state.hashes.routing_snapshot, vector_store_id: vector.id,
    inference_count: 100, retry_count: 0, side_effect_adapters: "absent_and_blocked",
  };
  await Promise.all([
    writeFile(resolve(runDir, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n"),
    writeFile(resolve(runDir, "outputs.json"), JSON.stringify(outputs, null, 2) + "\n"),
    writeFile(resolve(runDir, "results.json"), JSON.stringify({ metadata, summary, cases: results }, null, 2) + "\n"),
    writeFile(resolve(runDir, "report.md"), markdownReport(metadata, results, summary)),
  ]);
  return { run_id: runId, run_dir: runDir, summary };
}

const command = process.argv[2] || "preflight";
try {
  const result = command === "compile" ? await compileOnly()
    : command === "preflight" && process.argv.includes("--live") ? await livePreflight()
    : command === "preflight" ? await offlinePreflight()
    : command === "run" && process.argv.includes("--execute") ? await executeRun()
    : (() => { throw new Error("USAGE: compile | preflight --offline | run --execute"); })();
  console.log(JSON.stringify(result, null, 2));
  if (command === "preflight" && !(result.ready ?? result.ready_for_baseline)) process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({ status: "blocked", code: error.code || "HARNESS_ERROR", message: error.message }, null, 2));
  process.exitCode = 1;
}
