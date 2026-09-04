#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createEvalTransport } from "../src/safety.mjs";
import { createResponsesClient, evaluateSemanticCase, onlineMetadata, readDiagnosticDataset, summarizeResults } from "../src/filter-v1/online/semantic-online-harness.mjs";

const args = Object.fromEntries(process.argv.slice(2).flatMap((value,index,all)=>value.startsWith("--")?[[value.slice(2),all[index+1]?.startsWith("--")?true:all[index+1]]]:[]));
const allowedModels = new Set(["gpt-5.6-luna", "gpt-5.6-terra"]);
if (!allowedModels.has(args.model)) throw new Error("MODEL_MUST_BE_GPT_5_6_LUNA_OR_TERRA");
const root = resolve(import.meta.dirname, "..");
const datasetPath = resolve(root, "datasets/filter-v1-semantic-online-v0.1.jsonl");
const schemaPath = resolve(root, "../../docs/ai-commercial/FILTER_V1_SEMANTIC_EXTRACTION_SCHEMA.json");
const reportDir = resolve(root, "reports/filter-v1-semantic-online");
const datasetText = await readFile(datasetPath, "utf8"); const schemaText = await readFile(schemaPath, "utf8");
let cases = await readDiagnosticDataset(datasetPath);
if (args.case) cases = cases.filter(item => item.case_id === args.case);
if (args.limit) cases = cases.slice(0, Number(args.limit));
if (!cases.length) throw new Error("NO_CASES_SELECTED");
const client = createResponsesClient({ apiKey: process.env.OPENAI_EVAL_API_KEY, model: args.model, transport: createEvalTransport(process.env.OPENAI_EVAL_API_KEY), retries: 2 });
const results=[];
for (const testCase of cases) {
  const result=await evaluateSemanticCase({testCase,client}); results.push(result);
  process.stderr.write(`${testCase.case_id} ${result.status} ${result.exact_match?"match":"review"}\n`);
}
const summary={...onlineMetadata({datasetText,schemaText}),...summarizeResults(results,args.model),run_at:new Date().toISOString(),api_config:{endpoint:"responses",store:false,tools:false,reasoning_effort:"none",max_output_tokens:3000},dataset_cases:cases.length};
await mkdir(reportDir,{recursive:true}); const stem=args.model.endsWith("luna")?"luna":"terra";
await writeFile(resolve(reportDir,`${stem}-results.jsonl`),results.map(item=>JSON.stringify(item)).join("\n")+"\n");
await writeFile(resolve(reportDir,`${stem}-summary.json`),JSON.stringify(summary,null,2)+"\n");
process.stdout.write(JSON.stringify(summary,null,2)+"\n");
