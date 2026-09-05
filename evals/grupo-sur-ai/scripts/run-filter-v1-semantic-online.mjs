#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createEvalTransport } from "../src/safety.mjs";
import { createResponsesClient, evaluateSemanticCase, onlineMetadata, readDiagnosticDataset, summarizeResults } from "../src/filter-v1/online/semantic-online-harness.mjs";

const args = Object.fromEntries(process.argv.slice(2).flatMap((value,index,all)=>value.startsWith("--")?[[value.slice(2),all[index+1]?.startsWith("--")?true:all[index+1]]]:[]));
const model = "gpt-4.1-mini-2025-04-14";
if (args.model && args.model !== model) throw new Error("MODEL_MUST_BE_GPT_4_1_MINI_2025_04_14");
const root = resolve(import.meta.dirname, "..");
const datasetPath = resolve(root, "datasets/filter-v1-semantic-online-v0.1.jsonl");
const schemaPath = resolve(root, "../../docs/ai-commercial/FILTER_V1_SEMANTIC_EXTRACTION_SCHEMA.json");
const reportDir = resolve(root, "reports/filter-v1-semantic-online");
const datasetText = await readFile(datasetPath, "utf8"); const schemaText = await readFile(schemaPath, "utf8");
const smokeIds = new Set(["FVS-001","FVS-006","FVS-011","FVS-015","FVS-031","FVS-034","FVS-035","FVS-038","FVS-043","FVS-047","FVS-051","FVS-052","FVS-055","FVS-063","FVS-067","FVS-069","FVS-072","FVS-077","FVS-081","FVS-098"]);
let cases = (await readDiagnosticDataset(datasetPath)).filter(item => smokeIds.has(item.case_id));
if (cases.length !== 20) throw new Error("SMOKE_MUST_SELECT_EXACTLY_20_CASES");
if (!cases.length) throw new Error("NO_CASES_SELECTED");
const client = createResponsesClient({ apiKey: process.env.OPENAI_EVAL_API_KEY, model, transport: createEvalTransport(process.env.OPENAI_EVAL_API_KEY), retries: 0 });
const results=[];
for (const testCase of cases) {
  const result=await evaluateSemanticCase({testCase,client}); results.push(result);
  process.stderr.write(`${testCase.case_id} ${result.status} ${result.exact_match?"match":"review"}\n`);
}
const summary={...onlineMetadata({datasetText,schemaText}),...summarizeResults(results,model),run_at:new Date().toISOString(),api_config:{endpoint:"responses",store:false,tools:false,reasoning_parameter:false,max_output_tokens:3000},dataset_cases:cases.length};
await mkdir(reportDir,{recursive:true}); const stem="gpt-4.1-mini-smoke-v1.2-final";
await writeFile(resolve(reportDir,`${stem}-results.jsonl`),results.map(item=>JSON.stringify(item)).join("\n")+"\n");
await writeFile(resolve(reportDir,`${stem}-summary.json`),JSON.stringify(summary,null,2)+"\n");
process.stdout.write(JSON.stringify(summary,null,2)+"\n");
