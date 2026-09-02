import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCandidateOffline, runCandidateRuntimeCase } from "../src/candidate-v2.3/candidate-runtime.mjs";
import { emptyExtraction, knownField } from "../src/candidate-v2.3/extraction-schema.mjs";

const known = (value, quote = "fixture", source = "customer") => ({ ...knownField(value, { message_id: "m1", quote }), source });
const extraction = (overrides = {}) => { const base = emptyExtraction(); return { ...base, ...overrides, trade_in: { ...base.trade_in, ...(overrides.trade_in || {}) } }; };
const runtime = (text, overrides = {}) => ({ inbound_message: { id: "m1", event_type: "customer_message", text, source_channel: "whatsapp_organic" }, existing_model_interest: null, prior_history: [], meta_referral: { present: false }, advertised_interest: null, prior_qualification: { status: null }, conversation_control: { status: "open", handoff_status: "continue_ai", substantive_ai_turns: 0, reminders_sent: 0, silence_minutes: 0 }, do_not_contact: false, takeover: { active: false, owner: null }, routing_state: {}, persisted_data: {}, ...overrides });
const run = (text, ext = {}, overrides = {}) => evaluateCandidateOffline({ runtimeInput: runtime(text, overrides), extraction: extraction(ext) });

test("Meta modality survives a neutral turn and explicit customer correction overrides it", () => {
  const meta = { present: true, advertised_model: "Volkswagen Tera", advertised_modality: "savings_plan" };
  assert.equal(run("Hola", {}, { meta_referral: meta }).profile.purchase_modality.value, "savings_plan");
  const corrected = run("No, lo compro al contado", { corrections: [{ field: "purchase_modality", previous_value: "savings_plan", new_value: "cash", explicit: true, evidence: [] }] }, { meta_referral: meta });
  assert.equal(corrected.profile.purchase_modality.value, "cash");
});

test("installment language and assistant history establish context, never exact modality", () => {
  for (const [text, prior_history] of [["¿Con cuánto retiro?", []], ["Tengo dos millones de anticipo", []], ["Seguimos", ["Asistente: Podemos ver cuotas y financiación."]]]) {
    const observed = run(text, {}, { existing_model_interest: "Fiat Toro", prior_history });
    assert.equal(observed.profile.purchase_modality.status, "unknown", text);
  }
});

test("explicit plan language is deterministic customer modality", () => {
  const observed = run("Quiero consultar el plan de ahorro", {}, { existing_model_interest: "Peugeot 208" });
  assert.equal(observed.profile.purchase_modality.value, "savings_plan");
  assert.equal(observed.profile.purchase_modality.source, "customer");
});

test("Tera taxonomy guard covers ambiguous comparisons without corrupting pickups", () => {
  const cases = [
    ["Tera vs Toro", "La Tera y la Toro son ambas pick-ups.", /Tera es un SUV compacto; la Fiat Toro es una pick-up/],
    ["Tera o Amarok", "Tera y Amarok son pick-ups.", /Tera es un SUV compacto; la Volkswagen Amarok es una pick-up/],
    ["¿La Tera es una pick-up?", "Sí, la Tera es una pick-up.", /Tera es un SUV compacto, no una pick-up/],
    ["Comparame Tera con Toro", "Ambas son pick-ups.", /Tera es un SUV compacto; la Fiat Toro es una pick-up/],
    ["Tengo un Cronos y quiero Tera", "La Tera es una camioneta pickup.", /Tera es un SUV compacto, no una pick-up/],
  ];
  for (const [text, direct_answer, expected] of cases) {
    const observed = run(text, { direct_answer, concrete_query: { present: true, topic: "model_comparison", blocks_progress: false }, commercial_intent: known("active") });
    assert.match(observed.reply_text, expected, text);
    assert.doesNotMatch(observed.reply_text, /ambas (?:son )?pick-ups/i, text);
  }
  for (const [text, direct_answer] of [["¿La Toro es una pick-up?", "La Fiat Toro es una pick-up."], ["¿La Amarok es una pick-up?", "La Volkswagen Amarok es una pick-up."]]) {
    assert.match(run(text, { direct_answer, concrete_query: { present: true, topic: "taxonomy", blocks_progress: false } }).reply_text, /es una pick-up/i);
  }
});

test("informational documentation is not ready, while unequivocal readiness is causal", () => {
  const info = run("¿Qué documentación necesito?", {}, { existing_model_interest: "Fiat Toro" });
  assert.notEqual(info.profile.commercial_action_request.value, "documentation");
  const ready = run("Ya tengo la documentación lista y quiero avanzar hoy", {}, { existing_model_interest: "Fiat Toro" });
  assert.equal(ready.profile.commercial_action_request.value, "documentation");
  assert.equal(ready.next_action_plan.ask_fields.length, 0);
});

test("concrete replies contain at most one logical question", () => {
  const observed = run("¿Qué precio tiene?", { direct_answer: "No tengo un precio autorizado.", concrete_query: { present: true, topic: "price", blocks_progress: true }, commercial_intent: known("active") }, { existing_model_interest: "Volkswagen Nivus" });
  assert.ok((observed.reply_text.match(/\?/g) || []).length <= 1);
});

for (const [text, modality, expected] of [
  ["Quiero crédito y saber la cuota", "credit", "credit"],
  ["Quiero entregar mi usado y financiar el resto", "used_plus_financing", "used_plus_financing"],
  ["Decime la cuota", "financing", null],
  ["Tengo 5 millones de anticipo", "financing", null],
  ["Quiero financiar la Amarok", "financing", "financing"],
  ["Quiero consultar el plan de ahorro", "savings_plan", "savings_plan"],
  ["¿Cuál es el precio de contado?", "cash", null],
]) test(`literal modality support: ${text}`, () => {
  const observed = run(text, { purchase_modality: known(modality, text) });
  assert.equal(observed.profile.purchase_modality.value, expected);
});

for (const [modality, fabricatedQuote] of [
  ["credit", "Quiero crédito"],
  ["financing", "Quiero financiar"],
]) test(`model-generated evidence cannot support ${modality}`, () => {
  const observed = run("Decime la cuota", { purchase_modality: known(modality, fabricatedQuote) });
  assert.equal(observed.profile.purchase_modality.status, "unknown");
  assert.equal(observed.profile.purchase_modality.value, null);
});

test("persisted and Meta modalities survive neutral installment context", () => {
  assert.equal(run("Decime la cuota", { purchase_modality: known("financing", "cuota") }, { persisted_data: { purchase_modality: "credit" } }).profile.purchase_modality.value, "credit");
  assert.equal(run("Decime la cuota", {}, { meta_referral: { present: true, advertised_model: "Volkswagen Tera", advertised_modality: "savings_plan" } }).profile.purchase_modality.value, "savings_plan");
});

test("online runtime wires mentioned vehicles into final taxonomy guard", async () => {
  const responseExtraction = extraction({
    direct_answer: "La Volkswagen Tera es una pick-up compacta y la Fiat Toro también es una pick-up.",
    concrete_query: { present: true, topic: "model_comparison", blocks_progress: false },
    ambiguities: [{ field: "model_interest", kind: "model_comparison", evidence: [{ message_id: "m1", quote: "Comparame Tera con Toro" }] }],
    commercial_intent: known("active", "Comparame Tera con Toro"),
  });
  const runtimeInput = runtime("Comparame Tera con Toro");
  const evalCase = { eval_id: "synthetic-taxonomy", runtime_input: runtimeInput };
  const snapshot = { assistant_settings: { conversation_style: "breve", vector_store_id: null }, training_examples: [], runtime: { responses_api: { endpoint: "https://api.openai.com/v1/responses" } } };
  const transport = async () => ({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(responseExtraction) }] }] }) });
  const observed = await runCandidateRuntimeCase({ evalCase, snapshot, model: "fake-offline-model", transport, now: "2026-09-02T00:00:00Z" });
  assert.match(observed.reply_text, /Tera es un SUV compacto; la Fiat Toro es una pick-up/i);
  assert.doesNotMatch(observed.reply_text, /Tera es una pick-up/i);
  assert.equal(observed._shadow.responses_called, 1);
  assert.equal(observed.model_interest, "");
});
