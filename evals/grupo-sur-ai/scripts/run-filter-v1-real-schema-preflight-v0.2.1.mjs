#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createEvalTransport } from "../src/safety.mjs";
import { FILTER_V1_PROVIDER_SCHEMA } from "../src/filter-v1/online/provider-schema.mjs";
import { validateProviderStructuredOutputSchema } from "../src/filter-v1/online/provider-schema-validator.mjs";
import { createResponsesClient, evaluateSemanticCase } from "../src/filter-v1/online/semantic-online-harness.mjs";

const EXPECTED_SHA = "ffc847ef78095ec255235d3f9ac0c23e3469209a39acb5a22ee16809d6f8d2bb";
const root = resolve(import.meta.dirname, "..");
const datasetText = await readFile(resolve(root, "datasets/filter-v1-semantic-online-v0.2.jsonl"), "utf8");
const testCase = JSON.parse(datasetText.split("\n").find(line => JSON.parse(line).case_id === "FVS-001"));
const schemaSha256 = createHash("sha256").update(JSON.stringify(FILTER_V1_PROVIDER_SCHEMA)).digest("hex");
const schemaValidation = validateProviderStructuredOutputSchema(FILTER_V1_PROVIDER_SCHEMA);
if (schemaSha256 !== EXPECTED_SHA) throw new Error(`PROVIDER_SCHEMA_SHA_MISMATCH:${schemaSha256}`);
if (!schemaValidation.compatible) throw new Error(`PROVIDER_SCHEMA_OFFLINE_INVALID:${schemaValidation.errors.join(",")}`);

const transport = createEvalTransport(process.env.OPENAI_EVAL_API_KEY);
const results = {};
let onlineCallsTotal = 0;
for (const model of ["gpt-5.6-luna", "gpt-5.6-terra"]) {
  onlineCallsTotal += 1;
  const client = createResponsesClient({ apiKey: process.env.OPENAI_EVAL_API_KEY, model, transport, retries: 0 });
  const row = await evaluateSemanticCase({ testCase, client });
  const providerAccepted = row.provider_error == null && row.provider_error_code == null;
  const structuredReceived = providerAccepted && row.latency_ms !== null;
  results[model] = {
    http_status: row.provider_error?.status ?? (providerAccepted ? 200 : null),
    request_id: row.request_id,
    provider_schema_accepted: providerAccepted,
    structured_output_received: structuredReceived,
    local_validator_pass: row.status === "ok",
    evidence_validation_pass: row.evidence_valid,
    expected_match: row.exact_match,
    extraction: row.actual,
    mismatch: row.mismatches,
    error: row.provider_error ?? (row.status === "ok" ? null : { type: "local_validation_error", code: row.errors.join(","), param: null, message: row.errors.join(",") }),
  };
}
const ready = Object.values(results).every(result => result.http_status === 200 && result.provider_schema_accepted && result.structured_output_received && result.local_validator_pass && result.evidence_validation_pass);
const artifact = { version: "filter-v1-real-schema-preflight/0.2.1", run_at: new Date().toISOString(), case_id: "FVS-001", provider_schema_sha256: schemaSha256, provider_schema_offline_valid: schemaValidation.compatible, schema_compatibility_errors: schemaValidation.errors, request_config: { reasoning_effort: "none", store: false, tools_present: false, text_format_type: "json_schema", strict: true }, online_calls_total: onlineCallsTotal, results, ready_to_rerun_benchmark_v0_2: ready };
const reportDir = resolve(root, "reports/filter-v1-semantic-online-v0.2-preflight");
await writeFile(resolve(reportDir, "real-schema-preflight.json"), JSON.stringify(artifact, null, 2) + "\n");
const lines = ["# Filter v1 real-schema preflight v0.2.1", "", `Schema SHA: \`${schemaSha256}\`; offline compatibility errors: **${schemaValidation.errors.length}**.`, "", "Exactly two online calls were made, one per requested model, using unchanged FVS-001, dataset and semantic prompt.", "", "| Model | HTTP | Provider accepted | Structured output | Local validator | Evidence | Expected match |", "|---|---:|---:|---:|---:|---:|---:|"];
for (const [model, result] of Object.entries(results)) lines.push(`| ${model} | ${result.http_status ?? "n/a"} | ${result.provider_schema_accepted} | ${result.structured_output_received} | ${result.local_validator_pass} | ${result.evidence_validation_pass} | ${result.expected_match} |`);
lines.push("", `READY_TO_RERUN_BENCHMARK_V0_2=${ready ? "yes" : "no"}`);
await writeFile(resolve(reportDir, "REAL_SCHEMA_PREFLIGHT.md"), lines.join("\n") + "\n");
process.stdout.write(JSON.stringify(artifact, null, 2) + "\n");
