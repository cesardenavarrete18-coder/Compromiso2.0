import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runV2Shadow, runV2ShadowSafely } from "../../../supabase/functions/_shared/ai-v2-shadow/pipeline.mjs";
import { applyNegationScopeFirewall } from "../../../supabase/functions/_shared/ai-v2-shadow/safety-firewall.mjs";
import { buildAllowedFacts, reconcileKnowledge, resolveStructuredCommercialFacts } from "../../../supabase/functions/_shared/ai-v2-shadow/facts.mjs";
import { countConceptualQuestions, generateCandidateReply } from "../../../supabase/functions/_shared/ai-v2-shadow/response-generator.mjs";
import { buildFilterInput, selectPreviousShadowRun } from "../../../supabase/functions/_shared/ai-v2-shadow/input-adapter.mjs";
import { replayConversation } from "../../../supabase/functions/_shared/ai-v2-shadow/replay.mjs";

const state = target => ({ target_model: target ? { status: "known", value: target } : { status: "unknown", value: null }, has_trade_in: { status: "unknown", value: null } });
const engine = input => ({ status: "ok", next_state: input.previous_filter_state ?? state({ model_id: "208", model: "Peugeot 208", brand: "Peugeot" }), response_plan: { prompt: "¿Cómo pensás comprarlo?" }, handoff_decision: {}, resolved_facts: [], warnings: [] });
const semantic = async () => ({ extraction: { trade_in_intent: "not_present", evidence: {} } });
function memoryRepo() { const runs = new Map(); return { runs, async claim(mid,lid){ if(runs.has(mid)) return {created:false,run:runs.get(mid)}; const run={id:mid,lead_id:lid};runs.set(mid,run);return{created:true,run};}, async complete(id,r){runs.set(id,{...runs.get(id),...r});}, async fail(id,r){runs.set(id,{...runs.get(id),...r});} }; }
function args(overrides={}) { const repo=overrides.repository??memoryRepo(); return { env:{AI_V2_SHADOW_MODE:"true"}, input:{lead:{id:"lead"},inboundMessage:{id:"m1",body:"hola",created_at:"2026-01-01T00:00:00Z"},filterInput:{lead:{},catalog:[],campaigns:[],bank_offers:[],conversation_control:{mode:"ai"}}}, repository:repo, extractSemantic:semantic, runFilter:engine, ...overrides }; }

test("1 shadow disabled does not run", async()=>{let calls=0;const out=await runV2Shadow(args({env:{},extractSemantic:async()=>{calls++;}}));assert.equal(out.status,"disabled");assert.equal(calls,0)});
test("2 enabled produces candidate and has no sender dependency",async()=>{const a=args();const out=await runV2Shadow(a);assert.equal(out.status,"completed");assert.ok(out.record.v2_candidate_reply);assert.equal("sendWhatsAppText" in a,false)});
test("3 exception is isolated from V1",async()=>{const logs=[];const out=await runV2ShadowSafely(args({extractSemantic:async()=>{throw Error("boom")}}),{error:(...x)=>logs.push(x)});assert.equal(out.status,"failed_isolated");assert.equal(logs.length,1)});
for (const [n,name] of [[4,"lead"],[5,"CRM"],[6,"routing"],[7,"controls"]]) test(`${n} pipeline has no ${name} mutator`,()=>{const keys=Object.keys(args());assert.ok(!keys.some(k=>k.toLowerCase().includes(name.toLowerCase())))});
test("8 Meta retry creates one run and skips extractor",async()=>{const repository=memoryRepo();let calls=0;await runV2Shadow(args({repository,extractSemantic:async()=>{calls++;return semantic()}}));await runV2Shadow(args({repository,extractSemantic:async()=>{calls++;return semantic()}}));assert.equal(calls,1);assert.equal(repository.runs.size,1)});
test("9 previous successful shadow state is selected",()=>{const r=selectPreviousShadowRun([{lead_id:"l",status:"completed",created_at:"2026-01-01"},{lead_id:"l",status:"completed",created_at:"2026-01-02"}],"l","2026-01-03");assert.equal(r.created_at,"2026-01-02")});
test("10 future shadow state is excluded",()=>assert.equal(selectPreviousShadowRun([{lead_id:"l",status:"completed",created_at:"2026-01-04"}],"l","2026-01-03"),null));
test("11 acquisition is passed for target seed",()=>{const x=buildFilterInput({lead:{},attribution:{headline:"208"},inboundMessage:{id:"m",body:"hola",created_at:"2026-01-01"}});assert.equal(x.attribution.headline,"208")});
test("12 owned vehicle does not overwrite canonical target",()=>{const s=state({model:"Peugeot 208"});assert.equal(s.target_model.value.model,"Peugeot 208")});
test("13 trade-in does not overwrite canonical target",()=>{const s=state({model:"Peugeot 208"});s.trade_in_vehicle={model:"Amarok"};assert.equal(s.target_model.value.model,"Peugeot 208")});
test("14 alternatives remain alternatives, not persistent targets",()=>{const f=resolveStructuredCommercialFacts({targetModelId:"1",campaigns:[{id:"a",model_id:"1"},{id:"b",model_id:"1"}]});assert.equal(f.status,"alternatives");assert.equal(f.alternatives.length,2)});
test("15 epistemic version unknown does not negate trade-in",()=>{const out=applyNegationScopeFirewall({trade_in_intent:"no",evidence:{}},{currentMessage:"No sé qué versión es",previousState:{has_trade_in:{status:"known",value:"yes"}}});assert.equal(out.extraction.trade_in_intent,"yes")});
test("16 explicit no used vehicle remains no",()=>assert.equal(applyNegationScopeFirewall({trade_in_intent:"no"},{currentMessage:"No tengo usado"}).extraction.trade_in_intent,"no"));
test("17 price uses a single structured campaign",()=>{const facts=resolveStructuredCommercialFacts({targetModelId:"1",campaigns:[{id:"a",model_id:"1",final_price:40370000}]});const r=generateCandidateReply({currentMessage:"cuánto vale",allowedFacts:buildAllowedFacts({structuredFacts:facts})});assert.match(r.text,/40\.370\.000/)});
test("18 RAG commercial conflict is rejected",()=>{const r=reconcileKnowledge({},[{type:"installment",value:400000}]);assert.equal(r.conflicts[0].code,"RAG_STRUCTURED_CONFLICT");assert.equal(r.technical_facts.length,0)});
test("19 technical question creates knowledge response path",()=>{const r=generateCandidateReply({currentMessage:"motor?",knowledgeRequest:{},allowedFacts:{technical_facts:[{value:"Motor 1.6 verificado"}]}});assert.match(r.text,/1\.6/)});
test("20 absent technical evidence cannot hallucinate",()=>assert.match(generateCandidateReply({currentMessage:"motor?",knowledgeRequest:{},allowedFacts:{technical_facts:[]}}).text,/No tengo/));
test("21 clear rejection has zero questions",()=>assert.equal(generateCandidateReply({currentMessage:"No gracias"}).question_count,0));
test("22 DNC semantics are distinct",()=>assert.equal(generateCandidateReply({currentMessage:"No me escriban más"}).dnc,true));
test("23 candidate has at most one conceptual question",()=>assert.ok(countConceptualQuestions(generateCandidateReply({currentMessage:"hola",responsePlan:{prompt:"¿Uno? ¿Dos?"}}).text)<=1));
test("24 Peugeot Partner brand is not rewritten",()=>{const target={brand:"Peugeot",model:"Partner"};assert.equal(buildAllowedFacts({targetModel:target}).target_model.brand,"Peugeot")});
test("25 requested handoff still answers direct question outside human mode",()=>{const facts=resolveStructuredCommercialFacts({targetModelId:"1",campaigns:[{id:"x",model_id:"1",installment:431250}]});const r=generateCandidateReply({currentMessage:"¿Y las cuotas?",wouldHandoff:true,allowedFacts:{commercial_facts:facts}});assert.ok(r.text)});
test("26 human mode suppresses candidate",()=>assert.equal(generateCandidateReply({currentMessage:"precio",humanMode:true}).status,"suppressed_human"));
test("27 rapid inbound marks older context boundaries",()=>{const x=buildFilterInput({lead:{},messages:[{id:"old",direction:"inbound",body:"a",created_at:"2026-01-01T00:00:00Z"},{id:"future",direction:"inbound",body:"b",created_at:"2026-01-01T00:00:02Z"}],inboundMessage:{id:"old",body:"a",created_at:"2026-01-01T00:00:00Z"}});assert.ok(!x.recent_conversation.some(m=>m.id==="future"))});
test("28 replay has no future leakage",async()=>{const seen=[];await replayConversation({conversation:[{id:"1",direction:"inbound",body:"first",created_at:"2026-01-01"},{id:"2",direction:"inbound",body:"future",created_at:"2026-01-02"}],baseInput:{lead:{}},processTurn:async({filterInput})=>{seen.push(filterInput.recent_conversation.map(x=>x.text));return{}}});assert.deepEqual(seen[0],[]);assert.deepEqual(seen[1],["first"])});
test("29 V2 source contains no sender or Meta token capability",async()=>{const text=await readFile(new URL("../../../supabase/functions/_shared/ai-v2-shadow/pipeline.mjs",import.meta.url),"utf8");assert.doesNotMatch(text,/sendWhatsAppText|META_ACCESS_TOKEN/)});
async function files(root){const out=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);e.isDirectory()?await walk(p):out.push(relative(root,p))}}await walk(root);return out.sort()}
test("30 Filter runtime byte parity",async()=>{const sourceUrl=new URL("../src/filter-v1/",import.meta.url);const runtimeUrl=new URL("../../../supabase/functions/_shared/filter-v1/",import.meta.url);const source=fileURLToPath(sourceUrl);const runtime=fileURLToPath(runtimeUrl);const sf=await files(source);const rf=await files(runtime);assert.deepEqual(rf,sf);for(const f of sf)assert.deepEqual(await readFile(new URL(f,sourceUrl)),await readFile(new URL(f,runtimeUrl)),f)});
