#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createEvalTransport } from "../src/safety.mjs";
import { FILTER_V1_PROVIDER_SCHEMA } from "../src/filter-v1/online/provider-schema.mjs";
import { validateProviderStructuredOutputSchema } from "../src/filter-v1/online/provider-schema-validator.mjs";
import { classifyProviderFailure, safeProviderError, sanitizeProviderText } from "../src/filter-v1/online/safe-provider-error.mjs";
import { extractSemanticMessage } from "../src/filter-v1/extraction/semantic-extractor.mjs";
import { SEMANTIC_EXTRACTOR_SYSTEM_PROMPT } from "../src/filter-v1/extraction/semantic-extractor-prompt.mjs";
import { sha256 } from "../src/filter-v1/online/semantic-online-harness.mjs";

const ENDPOINT="https://api.openai.com/v1/responses";
const MODELS=["gpt-5.6-luna","gpt-5.6-terra"];
const MINIMAL_SCHEMA={type:"object",properties:{ok:{type:"boolean"},label:{type:"string"}},required:["ok","label"],additionalProperties:false};
const root=resolve(import.meta.dirname,"..");
const reportDir=resolve(root,"reports/filter-v1-semantic-online-v0.2-preflight");
const datasetPath=resolve(root,"datasets/filter-v1-semantic-online-v0.1.jsonl");
const firstCase=JSON.parse((await readFile(datasetPath,"utf8")).split("\n")[0]);
const transport=createEvalTransport(process.env.OPENAI_EVAL_API_KEY);
let calls=0;

function outputText(payload){return(payload.output??[]).flatMap(item=>item.content??[]).find(item=>item.type==="output_text")?.text??null;}
async function call(model,{prompt,input,format=null}){
  calls+=1;
  try{
    const body={model,store:false,max_output_tokens:3000,reasoning:{effort:"none"},input:[{role:"developer",content:prompt},{role:"user",content:input}]};
    if(format)body.text={format};
    const response=await transport(ENDPOINT,{method:"POST",redirect:"error",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(!response.ok)return{status:"failed",http_status:response.status,error:await safeProviderError(response),output:null};
    const payload=await response.json();
    return{status:"passed",http_status:response.status,error:null,request_id:sanitizeProviderText(response.headers?.get?.("x-request-id")??payload.id??null),output:outputText(payload),usage:payload.usage??null};
  }catch(error){return{status:"failed",http_status:null,error:{status:null,request_id:null,type:"transport_error",code:error?.code??null,param:null,message:sanitizeProviderText(error?.message??"Network transport failed")},output:null};}
}

const schemaAudit=validateProviderStructuredOutputSchema(FILTER_V1_PROVIDER_SCHEMA);
const results={};
for(const model of MODELS){
  const basic=await call(model,{prompt:"Respondé solamente OK.",input:"Respondé solamente OK."});
  const stages={basic};
  if(basic.status==="passed"){
    const minimal=await call(model,{prompt:"Return only the requested JSON.",input:"Devolvé ok=true y label='test'.",format:{type:"json_schema",name:"filter_v1_preflight",strict:true,schema:MINIMAL_SCHEMA}});stages.minimal_schema=minimal;
    if(minimal.status==="passed"){
      const real=await call(model,{prompt:SEMANTIC_EXTRACTOR_SYSTEM_PROMPT,input:JSON.stringify(firstCase.input),format:{type:"json_schema",name:"filter_v1_semantic_extraction",strict:true,schema:FILTER_V1_PROVIDER_SCHEMA}});
      if(real.status==="passed"){
        const validation=await extractSemanticMessage({client:async()=>real.output,...firstCase.input});real.local_validation={status:validation.status,errors:validation.errors??[]};
      }
      stages.real_schema=real;
    }else stages.real_schema={status:"skipped",http_status:null,error:null,reason:"MINIMAL_SCHEMA_FAILED"};
  }else{stages.minimal_schema={status:"skipped",http_status:null,error:null,reason:"BASIC_FAILED"};stages.real_schema={status:"skipped",http_status:null,error:null,reason:"BASIC_FAILED"};}
  results[model]=stages;
}
const rootCauses=[...new Set(Object.values(results).flatMap(stages=>Object.values(stages).map(stage=>classifyProviderFailure(stage.error)).filter(Boolean)))];
if(!schemaAudit.compatible)rootCauses.push("PROVIDER_SCHEMA_INCOMPATIBLE");
const artifact={version:"filter-v1-online-preflight/0.2",run_at:new Date().toISOString(),request_config:{models:MODELS,reasoning:{effort:"none"},text_format_type:"json_schema",strict:true,store:false,tools_present:false,max_output_tokens:3000,endpoint:ENDPOINT},provider_schema:{compatible:schemaAudit.compatible,errors:schemaAudit.errors,sha256:sha256(JSON.stringify(FILTER_V1_PROVIDER_SCHEMA))},online_calls_total:calls,results,root_cause:[...new Set(rootCauses)]};
await mkdir(reportDir,{recursive:true});await writeFile(resolve(reportDir,"preflight.json"),JSON.stringify(artifact,null,2)+"\n");
const lines=["# Filter v1 online extractor preflight v0.2","",`Calls: **${calls}/6 maximum**. Dataset/prompt/expected and frozen v0.1 reports were not modified.`,``,`Provider schema offline compatible: **${schemaAudit.compatible}**. Errors: \`${schemaAudit.errors.join(",")||"none"}\`.`,``,`Root cause: **${artifact.root_cause.join(", ")||"none"}**.`,""];
for(const model of MODELS){lines.push(`## ${model}`,"");for(const [name,stage]of Object.entries(results[model]))lines.push(`* ${name}: ${stage.status}; HTTP ${stage.http_status??"n/a"}; error \`${stage.error?JSON.stringify(stage.error):"none"}\``);lines.push("");}
await writeFile(resolve(reportDir,"PREFLIGHT_REPORT.md"),lines.join("\n"));process.stdout.write(JSON.stringify(artifact,null,2)+"\n");
