import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateCandidateOffline } from "../src/candidate-v2/candidate-runtime.mjs";
import { emptyExtraction, knownField } from "../src/candidate-v2/extraction-schema.mjs";
const cases=JSON.parse(readFileSync(new URL("../compiled/golden-v1.0.0.json",import.meta.url))).cases;
const golden=id=>cases.find(x=>x.eval_id===id);
const known=(value,quote="fixture")=>knownField(value,{quote});
const money=amount=>known({amount,currency:"ARS"});
const target=amount=>known({amount,minimum:null,maximum:null,currency:"ARS",accepted_authorized_anchor:false});
const model=(brand,name)=>known({brand,model:name,variant:null});
const query=(topic,blocks_progress=true)=>({present:true,topic,blocks_progress});
const fact=(topic,status,authorized=status==="authorized")=>({topic,status,authorized,evidence:[{message_id:"fixture",quote:topic}]});
const ambiguity=(field,kind)=>({field,kind,evidence:[{message_id:"fixture",quote:kind}]});
function ext(overrides={}){const b=emptyExtraction();return{...b,...overrides,trade_in:{...b.trade_in,...(overrides.trade_in||{})}}}
function run(id,overrides={},runtimeOverride={}){const source=golden(id).runtime_input;return evaluateCandidateOffline({runtimeInput:{...source,...runtimeOverride,conversation_control:{...source.conversation_control,...(runtimeOverride.conversation_control||{})},routing_state:{...source.routing_state,...(runtimeOverride.routing_state||{})}},extraction:ext(overrides)})}
function check(id,o,fields){for(const f of fields)assert.deepEqual(o[f],golden(id).expected[f],`${id}.${f}`)}
const states=["qualification_status","commercial_temperature","handoff_status","conversation_status","next_action"];

test("1 immediate action: GSV1-018/GSV1-057",async t=>{
 await t.test("GSV1-018 perfil completo y avanzar",()=>{const o=run("GSV1-018",{model_interest:model("Fiat","Toro"),purchase_modality:known("financing"),commercial_intent:known("action_ready"),commercial_action_request:known("documentation")},{persisted_data:{cash_available:money(5e6),target_installment:target(450000)}});check("GSV1-018",o,states);assert.doesNotMatch(o.reply_text,/reserva (hecha|confirmada)/i)});
 await t.test("GSV1-057 entrega urgente",()=>{const o=run("GSV1-057",{commercial_intent:known("action_ready"),urgency:known("high"),concrete_query:query("delivery"),commercial_fact_context:fact("delivery_date","variable_confirmation_required"),direct_answer:"La entrega requiere confirmación vigente."});check("GSV1-057",o,states);assert.doesNotMatch(o.reply_text,/entrega confirmada/i)});
});
test("2 takeover verificado: GSV1-084",()=>{const o=run("GSV1-084",{concrete_query:query("price",false)},{conversation_control:{handoff_status:"handed_off"},routing_state:{handoff_owner:"human",handoff_accepted_at:"2026-08-27T12:00:00Z"}});check("GSV1-084",o,["handoff_status","conversation_status","next_action"]);assert.equal(o.reply_text,"");assert.equal(o._shadow.responses_called,0)});
test("3 after-sales: GSV1-078",()=>{const o=run("GSV1-078",{commercial_intent:known("none")});check("GSV1-078",o,states)});
test("4 ambigüedades económicas: GSV1-066/013/059",async t=>{
 for(const [id,x] of [["GSV1-066",{ambiguities:[ambiguity("cash_available","cash_meaning")]}],["GSV1-013",{contradictions:[{field:"cash_available",values:["3000000","8000000"],evidence:[{message_id:"fixture",quote:"3M u 8M"}]}]}],["GSV1-059",{ambiguities:[ambiguity("cash_available","currency_or_scale")]}]])await t.test(id,()=>{const o=run(id,{...x,commercial_intent:known("active")});assert.notEqual(o.profile.cash_available.status,"known");check(id,o,["qualification_status","handoff_status","next_action"])});
});
test("5 credit action-ready: GSV1-029",()=>{const o=run("GSV1-029",{purchase_modality:known("credit"),commercial_intent:known("action_ready"),commercial_action_request:known("documentation"),urgency:known("high")});check("GSV1-029",o,states);assert.ok(!o.commercial_tags.includes("plan_de_ahorro"))});
test("6 consultas comerciales variables: GSV1-043/044/045/046/047/050/056",async t=>{
 const topics={"GSV1-043":["engine","unavailable"],"GSV1-044":["equipment","authorized"],"GSV1-045":["payload_capacity","unavailable"],"GSV1-046":["exact_variant","authorized"],"GSV1-047":["engine","conflicting"],"GSV1-050":["variant","not_catalogued"],"GSV1-056":["stock","variable_confirmation_required"]};
 for(const[id,[topic,status]]of Object.entries(topics))await t.test(id,()=>{const o=run(id,{commercial_intent:known("active"),concrete_query:query(topic,status!=="authorized"),commercial_fact_context:fact(topic,status),direct_answer:"Sólo puedo confirmar información respaldada por una fuente autorizada."});check(id,o,["handoff_status","conversation_status","next_action"]);assert.doesNotMatch(o.reply_text,/stock confirmado|entrega inmediata confirmada|tiene X/i)});
});
test("7 instrucción adversarial: GSV1-049",()=>{const o=run("GSV1-049",{commercial_intent:known("active"),commercial_fact_manipulation:known(true),concrete_query:query("adversarial_fact"),direct_answer:"No voy a afirmar información no verificada."});check("GSV1-049",o,["handoff_status","conversation_status","next_action"]);assert.doesNotMatch(o.reply_text,/tiene X/i)});
test("8 qualified/follow_up cold: GSV1-030/GSV1-095",async t=>{
 await t.test("GSV1-030",()=>{const o=run("GSV1-030",{model_interest:model("Peugeot","208"),purchase_modality:known("savings_plan"),purchase_timeframe:known({bucket:"long_term",days:240,description:"ocho meses"}),commercial_intent:known("active")},{persisted_data:{cash_available:money(8e6),target_installment:target(450000),purchase_horizon:"8_months"}});check("GSV1-030",o,[...states,"commercial_profile_complete"])});
 await t.test("GSV1-095",()=>{const o=run("GSV1-095",{cash_available:money(0),purchase_timeframe:known({bucket:"long_term",days:null,description:"sólo mirando"}),commercial_intent:known("exploratory")});check("GSV1-095",o,states)});
});
test("9 savings plan variable: GSV1-055",()=>{const o=run("GSV1-055",{purchase_modality:known("savings_plan"),commercial_intent:known("active"),concrete_query:query("campaign_validity"),commercial_fact_context:fact("campaign_validity","unverified"),direct_answer:"La vigencia requiere fuente autorizada."});check("GSV1-055",o,["qualification_status","handoff_status","next_action"]);assert.ok(!o.commercial_tags.includes("credito"))});
test("10 PII conocida: GSV1-073",()=>{const o=run("GSV1-073",{purchase_modality:known("savings_plan"),commercial_intent:known("active"),pii_context:{supplied:true,type:"phone"}});check("GSV1-073",o,["qualification_status","handoff_status","next_action"]);assert.doesNotMatch(o.reply_text,/tel[eé]fono|n[uú]mero/i)});
test("11 comparación ambigua: GSV1-048",()=>{const o=run("GSV1-048",{commercial_intent:known("active"),ambiguities:[ambiguity("model_interest","model_comparison")],concrete_query:query("model_comparison",false),direct_answer:"Son modelos distintos; puedo aclarar la diferencia verificada."});check("GSV1-048",o,["qualification_status","handoff_status","next_action"]);assert.doesNotMatch(o.model_interest,/^Fiat Toro$/i)});
test("12 silencio/reminders: GSV1-080/GSV1-082",async t=>{
 await t.test("GSV1-080",()=>{const o=run("GSV1-080");check("GSV1-080",o,["commercial_temperature","handoff_status","next_action"])});
 await t.test("GSV1-082",()=>{const o=run("GSV1-082");check("GSV1-082",o,["qualification_status","commercial_temperature","handoff_status","next_action"])});
});
