#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createEvalTransport } from "../src/safety.mjs";
import { SEMANTIC_EXTRACTOR_SYSTEM_PROMPT } from "../src/filter-v1/extraction/semantic-extractor-prompt.mjs";
import { FILTER_V1_PROVIDER_SCHEMA } from "../src/filter-v1/online/provider-schema.mjs";
import { validateProviderStructuredOutputSchema } from "../src/filter-v1/online/provider-schema-validator.mjs";
import { createResponsesClient, evaluateSemanticCase, readDiagnosticDataset, summarizeResults } from "../src/filter-v1/online/semantic-online-harness.mjs";

const MODEL = "gpt-5.6-luna";
const EXPECTED = Object.freeze({ dataset: "af497d6dabf6aac6a6e6f5bb73d66aef83dc396b4de57944042a5a7fb23ff542", prompt: "5dcef918f9047c1f161e4cba33dd634816f041d13223628e0e2ca7ffc3386af1", schema: "ffc847ef78095ec255235d3f9ac0c23e3469209a39acb5a22ee16809d6f8d2bb" });
const hash = value => createHash("sha256").update(value).digest("hex");
const root = resolve(import.meta.dirname, "..");
const datasetPath = resolve(root, "datasets/filter-v1-semantic-online-v0.2.jsonl");
const datasetText = await readFile(datasetPath, "utf8");
const hashes = { dataset: hash(datasetText), prompt: hash(SEMANTIC_EXTRACTOR_SYSTEM_PROMPT), schema: hash(JSON.stringify(FILTER_V1_PROVIDER_SCHEMA)) };
for (const key of Object.keys(EXPECTED)) if (hashes[key] !== EXPECTED[key]) throw new Error(`${key.toUpperCase()}_SHA_MISMATCH:${hashes[key]}`);
const schemaValidation = validateProviderStructuredOutputSchema(FILTER_V1_PROVIDER_SCHEMA);
if (!schemaValidation.compatible) throw new Error(`PROVIDER_SCHEMA_OFFLINE_INVALID:${schemaValidation.errors.join(",")}`);
const cases = await readDiagnosticDataset(datasetPath);
if (cases.length !== 100 || cases.some((item, index) => item.case_id !== `FVS-${String(index + 1).padStart(3, "0")}`)) throw new Error("DATASET_MUST_BE_FVS_001_TO_100");

const client = createResponsesClient({ apiKey: process.env.OPENAI_EVAL_API_KEY, model: MODEL, transport: createEvalTransport(process.env.OPENAI_EVAL_API_KEY), retries: 2 });
const results = [];
for (const testCase of cases) {
  const result = await evaluateSemanticCase({ testCase, client });
  result.http_status = result.provider_error?.status ?? (result.request_id ? 200 : null);
  result.expected = testCase.expected_extraction;
  results.push(result);
  process.stderr.write(`${testCase.case_id} ${result.status} ${result.exact_match ? "match" : "review"}\n`);
}

const summary = summarizeResults(results, MODEL);
const categoryF1 = category => {
  const rows = results.filter(row => row.category.toLocaleLowerCase("en") === category.toLocaleLowerCase("en"));
  const checks = rows.flatMap(row => row.checks); const tp = checks.filter(item => item.pass).length;
  const fp = checks.length - tp + rows.reduce((sum, row) => sum + row.false_inferences.length, 0); const fn = checks.length - tp;
  const precision = tp / Math.max(1, tp + fp); const recall = tp / Math.max(1, tp + fn);
  return (2 * precision * recall) / Math.max(Number.EPSILON, precision + recall);
};
const categoryMap = { query_intent: "query_intent", purchase_mode: "purchase_mode", amounts: "amounts", vehicle_roles: "vehicle_roles", trade_in: "trade_in", human_request: "human_request", strong_action: "strong_action", contact_timing: "contact_timing", DNC: "DNC", corrections: "corrections" };
summary.breakdown_f1 = Object.fromEntries(Object.entries(categoryMap).map(([key, category]) => [key, categoryF1(category)]));
summary.online_calls_total = results.length + summary.total_retries;
summary.total_tokens = summary.usage.input_tokens + summary.usage.output_tokens;
summary.estimated_cost = null;
summary.estimated_cost_reason = "No repository-authorized pricing table for this model.";
summary.critical_cases = cases.filter(item => item.critical).length;
summary.false_inference_ids = results.filter(row => row.false_inferences.length).map(row => row.case_id);
summary.structural_gate_pass = summary.schema_valid_rate === 1 && summary.forbidden_effect_rate === 0 && summary.evidence_valid_rate === 1;
summary.critical_gate_pass = summary.critical_violations.length === 0;
summary.quality_gate_pass = summary.field_f1 >= 0.95 && summary.correct_abstention_rate >= 0.95;
summary.luna_status = summary.structural_gate_pass && summary.critical_gate_pass && summary.quality_gate_pass ? "PASS" : "FAIL";
summary.recommended_model = summary.luna_status === "PASS" ? MODEL : "NONE";
summary.terra_evaluation_required = summary.luna_status !== "PASS";
summary.ready_to_design_filter_v1_golden = summary.luna_status === "PASS";
summary.run_at = new Date().toISOString();
summary.hashes = hashes;
summary.api_config = { reasoning_effort: "none", store: false, tools_present: false, text_format_type: "json_schema", strict: true, max_output_tokens: 3000 };

const reviewRows = results.filter(row => !row.exact_match || row.status !== "ok" || !row.evidence_valid || row.false_inferences.length || (row.critical && row.mismatches.length));
summary.manual_review_cases = reviewRows.length;
summary.manual_review_ids = reviewRows.map(row => row.case_id);
const reportDir = resolve(root, "reports/filter-v1-semantic-online-v0.2-luna");
await mkdir(reportDir, { recursive: true });
await writeFile(resolve(reportDir, "luna-results.jsonl"), results.map(row => JSON.stringify(row)).join("\n") + "\n");
await writeFile(resolve(reportDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

const report = ["# Filter v1 Luna semantic benchmark v0.2", "", `Model: \`${MODEL}\`. Cases: ${cases.length}. Status: **${summary.luna_status}**.`, "", "| Gate/metric | Result |", "|---|---:|", `| Schema valid | ${summary.schema_valid_rate} |`, `| Evidence valid | ${summary.evidence_valid_rate} |`, `| Forbidden effect | ${summary.forbidden_effect_rate} |`, `| Field F1 | ${summary.field_f1} |`, `| Correct abstention | ${summary.correct_abstention_rate} |`, `| Critical violations | ${summary.critical_violations.length} |`, `| Exact case match | ${summary.exact_case_match_rate} |`, "", `Structural gate: **${summary.structural_gate_pass}**; critical gate: **${summary.critical_gate_pass}**; quality gate: **${summary.quality_gate_pass}**.`, "", `Manual review: ${reviewRows.length} cases. False inference IDs: ${summary.false_inference_ids.join(", ") || "none"}.`, "", `Recommended model: \`${summary.recommended_model}\`. Terra evaluation required: **${summary.terra_evaluation_required}**.`];
await writeFile(resolve(reportDir, "REPORT.md"), report.join("\n") + "\n");
const manual = ["# Luna v0.2 manual review", "", "Only failures, mismatches, false inferences and invalid evidence are included. No chain-of-thought is stored.", ""];
for (const row of reviewRows) {
  const testCase = cases.find(item => item.case_id === row.case_id);
  manual.push(`## ${row.case_id}`, `- **CATEGORY:** ${row.category}`, `- **CRITICAL:** ${row.critical}`, `- **MESSAGE:** ${testCase.input.current_message.text}`, `- **RELEVANT CONTEXT:** \`${JSON.stringify(testCase.input.recent_conversation)}\``, `- **EXPECTED:** \`${JSON.stringify(testCase.expected_extraction)}\``, `- **ACTUAL:** \`${JSON.stringify(row.actual)}\``, `- **RAW_STRUCTURED_OUTPUT:** \`${JSON.stringify(row.raw_structured_output)}\``, `- **LOCAL_VALIDATION_ERROR:** \`${JSON.stringify(row.errors)}\``, `- **MISMATCH:** \`${JSON.stringify({ fields: row.mismatches, false_inferences: row.false_inferences })}\``, "");
}
await writeFile(resolve(reportDir, "MANUAL_REVIEW.md"), manual.join("\n"));
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
