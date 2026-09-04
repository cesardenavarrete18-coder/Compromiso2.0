import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extractSemanticMessage } from "../extraction/semantic-extractor.mjs";
import { SEMANTIC_EXTRACTOR_SYSTEM_PROMPT, SEMANTIC_EXTRACTOR_PROMPT_VERSION } from "../extraction/semantic-extractor-prompt.mjs";
import { FILTER_V1_PROVIDER_SCHEMA } from "./provider-schema.mjs";
import { safeProviderError } from "./safe-provider-error.mjs";

export const RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
export const sha256 = value => createHash("sha256").update(value).digest("hex");
export const stableJson = value => JSON.stringify(value, Object.keys(value).sort());

export async function readDiagnosticDataset(path) {
  return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
}

export function createResponsesClient({ apiKey, model, transport = fetch, retries = 2 }) {
  if (!apiKey) throw new Error("OPENAI_EVAL_API_KEY_MISSING");
  return async ({ systemPrompt, input }) => {
    let retryCount = 0;
    while (true) {
      const started = performance.now();
      let response;
      try {
        response = await transport(RESPONSES_ENDPOINT, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, store: false, max_output_tokens: 3000, reasoning: { effort: "none" }, input: [{ role: "developer", content: systemPrompt }, { role: "user", content: JSON.stringify(input) }], text: { format: { type: "json_schema", name: "filter_v1_semantic_extraction", strict: true, schema: FILTER_V1_PROVIDER_SCHEMA } } }) });
      } catch (error) {
        if (retryCount >= retries) throw error;
        retryCount += 1; continue;
      }
      if (!response.ok) {
        if ([408, 409, 429, 500, 502, 503, 504].includes(response.status) && retryCount < retries) { retryCount += 1; continue; }
        const safeError = await safeProviderError(response);
        const failure = new Error(`RESPONSES_API_${response.status}`); failure.provider_error = safeError; throw failure;
      }
      const payload = await response.json();
      const outputText = (payload.output ?? []).flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text;
      if (typeof outputText !== "string") throw new Error("RESPONSES_OUTPUT_MISSING");
      return Object.assign(JSON.parse(outputText), { __provider_meta: { latency_ms: performance.now() - started, usage: payload.usage ?? null, response_id: payload.id ?? null, retries: retryCount } });
    }
  };
}

function valuesAt(actual, path) {
  const parts = path.split("."); let values = [actual];
  for (const part of parts) {
    values = values.flatMap(value => Array.isArray(value) ? value.map(item => item?.[part]) : [value?.[part]]).filter(value => value !== undefined);
  }
  return values.flatMap(value => Array.isArray(value) ? value : [value]);
}

function assertionMatches(actual, path, expected) {
  if (path.endsWith(".contains")) {
    const values = valuesAt(actual, path.slice(0, -9));
    return expected.every(needle => values.some(value => Object.entries(needle).every(([key, target]) => value?.[key] === target)));
  }
  const values = valuesAt(actual, path);
  if (path.endsWith(".roles") || path.endsWith(".models")) return JSON.stringify(values.sort()) === JSON.stringify([...expected].sort());
  if (Array.isArray(expected)) return JSON.stringify(values) === JSON.stringify(expected);
  return values.some(value => Object.is(value, expected)) || (expected === null && values.some(value => value === null));
}

function falseInference(expected, actual) {
  const failures = [];
  if (expected.purchase_mode_statement === "not_present" && actual.purchase_mode_statement !== "not_present") failures.push("UNSUPPORTED_PURCHASE_MODE");
  if (expected.trade_in_intent === "not_present" && actual.trade_in_intent === "yes") failures.push("OWNED_AS_TRADE_IN");
  if (expected["vehicle_mentions.roles"]?.length > 1 && actual.vehicle_mentions.some(item => item.role === "target")) failures.push("ARBITRARY_TARGET_SELECTION");
  if (expected["amount_mentions.numeric_value"] === null && actual.amount_mentions.some(item => item.numeric_value !== null)) failures.push("FABRICATED_AMOUNT_SCALE");
  if (expected.requested_action === null && actual.requested_action) failures.push("ACTION_TIMING_AS_ACTION");
  return failures;
}

export async function evaluateSemanticCase({ testCase, client }) {
  let providerMeta = null;
  let providerOutput = null;
  const wrapped = async request => { const result = await client(request); providerMeta = result.__provider_meta ?? null; if (result && typeof result === "object") { providerOutput = structuredClone(result); delete providerOutput.__provider_meta; delete result.__provider_meta; } return result; };
  const result = await extractSemanticMessage({ client: wrapped, ...testCase.input });
  const actual = result.extraction;
  const checks = Object.entries(testCase.expected_extraction).map(([path, expected]) => ({ path, expected, actual: actual ? valuesAt(actual, path) : [], pass: actual ? assertionMatches(actual, path, expected) : false }));
  const inferred = actual ? falseInference(testCase.expected_extraction, actual) : [];
  const mismatches = checks.filter(check => !check.pass).map(check => check.path);
  return { case_id: testCase.case_id, category: testCase.category, critical: testCase.critical, status: result.status, schema_valid: result.status === "ok", evidence_valid: result.status === "ok" && !(result.errors ?? []).includes("INVALID_OR_MISSING_EVIDENCE"), forbidden_effect: (result.forbidden_effect_fields ?? []).length > 0, abstention_expected: Object.keys(testCase.expected_extraction).some(key => key.includes("needs_clarification") || testCase.expected_extraction[key] === "ambiguous" || testCase.expected_extraction[key] === null), abstention_correct: result.status === "ok" && mismatches.filter(path => path.includes("needs_clarification") || testCase.expected_extraction[path] === "ambiguous" || testCase.expected_extraction[path] === null).length === 0, checks, mismatches, false_inferences: inferred, exact_match: mismatches.length === 0 && inferred.length === 0, actual, raw_structured_output: providerOutput, errors: result.errors ?? [], provider_error_code: result.provider_error_code ?? null, provider_error: result.provider_error ?? null, request_id: providerMeta?.response_id ?? result.provider_error?.request_id ?? null, latency_ms: providerMeta?.latency_ms ?? null, usage: providerMeta?.usage ?? null, retries: providerMeta?.retries ?? 0 };
}

export function summarizeResults(results, model) {
  const total = results.length; const checks = results.flatMap(row => row.checks); const tp = checks.filter(check => check.pass).length; const fp = checks.length - tp + results.reduce((sum,row)=>sum+row.false_inferences.length,0); const fn = checks.length - tp;
  const precision = tp / Math.max(1,tp+fp), recall = tp / Math.max(1,tp+fn); const critical = results.filter(row=>row.critical); const abstention = results.filter(row=>row.abstention_expected); const latencies=results.map(row=>row.latency_ms).filter(Number.isFinite);
  const category_breakdown=Object.fromEntries([...new Set(results.map(row=>row.category))].map(category=>{const rows=results.filter(row=>row.category===category);return [category,{total:rows.length,exact_match_rate:rows.filter(row=>row.exact_match).length/rows.length}]}));
  const summary={ model,total_cases:total,schema_valid_rate:results.filter(row=>row.schema_valid).length/total,extraction_success_rate:results.filter(row=>row.status==="ok").length/total,field_precision:precision,field_recall:recall,field_f1:(2*precision*recall)/Math.max(Number.EPSILON,precision+recall),exact_case_match_rate:results.filter(row=>row.exact_match).length/total,critical_case_pass_rate:critical.filter(row=>row.exact_match).length/Math.max(1,critical.length),critical_violations:critical.filter(row=>!row.exact_match).map(row=>row.case_id),evidence_valid_rate:results.filter(row=>row.evidence_valid).length/total,correct_abstention_rate:abstention.filter(row=>row.abstention_correct).length/Math.max(1,abstention.length),false_inference_rate:results.filter(row=>row.false_inferences.length).length/total,forbidden_effect_rate:results.filter(row=>row.forbidden_effect).length/total,average_latency_ms:latencies.length?latencies.reduce((a,b)=>a+b,0)/latencies.length:null,total_retries:results.reduce((sum,row)=>sum+row.retries,0),usage:results.reduce((sum,row)=>({input_tokens:sum.input_tokens+(row.usage?.input_tokens??0),output_tokens:sum.output_tokens+(row.usage?.output_tokens??0)}),{input_tokens:0,output_tokens:0}),category_breakdown };
  summary.passes_gates=summary.schema_valid_rate===1&&summary.forbidden_effect_rate===0&&summary.evidence_valid_rate===1&&summary.critical_violations.length===0&&summary.field_f1>=.95&&summary.correct_abstention_rate>=.95;
  return summary;
}

export const onlineMetadata = ({ datasetText, schemaText }) => ({ prompt_version: SEMANTIC_EXTRACTOR_PROMPT_VERSION, prompt_sha256: sha256(SEMANTIC_EXTRACTOR_SYSTEM_PROMPT), schema_sha256: sha256(schemaText), dataset_sha256: sha256(datasetText) });
