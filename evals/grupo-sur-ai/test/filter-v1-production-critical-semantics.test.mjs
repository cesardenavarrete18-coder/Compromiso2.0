import test from "node:test";
import assert from "node:assert/strict";
import { emptySemanticExtraction } from "../src/filter-v1/extraction/semantic-extraction-contract.mjs";
import { extractSemanticMessage } from "../src/filter-v1/extraction/semantic-extractor.mjs";
import { semanticExtractionToEngine } from "../src/filter-v1/extraction/semantic-engine-adapter.mjs";

const message = text => ({ id: "m1", role: "customer", text, created_at: "2026-09-04T15:00:00Z" });
const evidence = literal => ({ source_message_id: "m1", literal });
const candidate = overrides => ({ ...emptySemanticExtraction(), ...overrides, evidence: { ...emptySemanticExtraction().evidence, ...(overrides.evidence ?? {}) } });
const extract = (text, output) => extractSemanticMessage({ client: async () => output, current_message: message(text), recent_conversation: [], previous_filter_state: null, acquisition_context: null, known_catalog_context: null });
const amount = (literal, kind, numeric_value = null, certainty = "explicit", evidenceLiteral = literal) => ({ kind, numeric_value, currency: numeric_value === null ? null : "ARS", literal, certainty, confirmation_recommended: certainty !== "explicit", evidence: evidence(evidenceLiteral) });
const vehicle = (literal, role, evidenceLiteral, model_text = literal) => ({ literal, brand_text: null, model_text, version_text: null, role, certainty: "explicit", evidence: evidence(evidenceLiteral) });
const action = (type, literal) => ({ type, time_expression: null, certainty: "explicit", evidence: evidence(literal) });

test("amount: monthly language cannot materialize as down payment", async () => {
  const text = "Puedo pagar 500 lucas por mes";
  const out = await extract(text, candidate({ amount_mentions: [amount("500 lucas", "down_payment_capacity", null, "ambiguous", text)] }));
  assert.deepEqual([out.extraction.amount_mentions[0].kind, semanticExtractionToEngine(out.extraction).extracted_fields.monthly_installment_capacity, semanticExtractionToEngine(out.extraction).extracted_fields.down_payment_amount], ["monthly_installment_capacity", 500000, undefined]);
});
test("amount: anticipo language becomes down payment", async () => { const text = "Tengo 500 lucas de anticipo"; const out = await extract(text, candidate({ amount_mentions: [amount("500 lucas", "monthly_installment_capacity", null, "ambiguous", text)] })); assert.equal(out.extraction.amount_mentions[0].kind, "down_payment_capacity"); });
test("amount: unscaled 5.000 abstains", async () => { const text = "Puedo poner 5.000"; const out = await extract(text, candidate({ amount_mentions: [amount("5.000", "unknown_amount", 5000, "ambiguous", text)] })); assert.deepEqual([out.extraction.amount_mentions[0].numeric_value, out.extraction.amount_mentions[0].certainty], [null, "ambiguous"]); });
test("amount: unknown null never materializes capacity", async () => { const text = "Puedo poner algo"; const out = await extract(text, candidate({ amount_mentions: [amount("algo", "unknown_amount", null, "ambiguous", text)] })); assert.deepEqual(semanticExtractionToEngine(out.extraction).extracted_fields, {}); });
for (const [name, literal, value] of [["diez millones", "diez millones", 10000000], ["10 palos", "10 palos", 10000000]])
  test(`amount: ${name} anticipo is normalized safely`, async () => { const text = `Dispongo de ${literal} para el anticipo`; const out = await extract(text, candidate({ amount_mentions: [amount(literal, "unknown_amount", null, "ambiguous", text)] })); assert.deepEqual([out.extraction.amount_mentions[0].kind, out.extraction.amount_mentions[0].numeric_value], ["down_payment_capacity", value]); });
test("amount: mixed monthly and down-payment context abstains", async () => { const text = "Tengo una cuota mensual y también un anticipo de 500 lucas"; const out = await extract(text, candidate({ amount_mentions: [amount("500 lucas", "down_payment_capacity", 500000, "explicit", text)] })); assert.deepEqual([out.extraction.amount_mentions[0].kind, out.extraction.amount_mentions[0].numeric_value], ["unknown_amount", null]); });

test("vehicle: ownership evidence overrides unsafe target", async () => { const text = "Tengo una Amarok"; const out = await extract(text, candidate({ vehicle_mentions: [vehicle("Amarok", "target", text)] })); assert.deepEqual([out.extraction.vehicle_mentions[0].role, semanticExtractionToEngine(out.extraction).target_model], ["owned_only", undefined]); });
test("vehicle: trade-in evidence overrides unsafe target", async () => { const text = "Tengo una Amarok para entregar"; const out = await extract(text, candidate({ vehicle_mentions: [vehicle("Amarok", "target", text)] })); assert.deepEqual([out.extraction.vehicle_mentions[0].role, semanticExtractionToEngine(out.extraction).target_model], ["trade_in", undefined]); });
test("vehicle: trade-in and target roles stay separate", async () => { const text = "Entrego mi Amarok y quiero una Tera"; const out = await extract(text, candidate({ vehicle_mentions: [vehicle("Amarok", "target", text), vehicle("Tera", "trade_in", text)] })); assert.deepEqual(out.extraction.vehicle_mentions.map(item => item.role), ["trade_in", "target"]); });
test("vehicle: owned mention cannot replace an existing target", async () => { const text = "Quiero una Tera y tengo una Amarok"; const out = await extract(text, candidate({ vehicle_mentions: [vehicle("Tera", "target", text), vehicle("Amarok", "target", text)] })); assert.equal(semanticExtractionToEngine(out.extraction).target_model, "Tera"); });
test("vehicle: trade-in cannot replace an existing target", async () => { const text = "Quiero una Tera y entrego mi Amarok"; const out = await extract(text, candidate({ vehicle_mentions: [vehicle("Tera", "target", text), vehicle("Amarok", "target", text)] })); assert.equal(semanticExtractionToEngine(out.extraction).target_model, "Tera"); });
test("vehicle: model names are not enriched beyond evidence", async () => { const text = "Entrego un Gol"; const out = await extract(text, candidate({ vehicle_mentions: [vehicle("Gol", "trade_in", text, "Gol Trend")] })); assert.deepEqual([out.extraction.vehicle_mentions[0].model_text, out.extraction.vehicle_mentions[0].version_text], ["Gol", null]); });
test("vehicle: comparison does not elect a target", async () => { const text = "Comparo Tera con Nivus"; const out = await extract(text, candidate({ vehicle_mentions: [vehicle("Tera", "comparison", text), vehicle("Nivus", "comparison", text)] })); assert.equal(semanticExtractionToEngine(out.extraction).target_model, undefined); });

for (const [label, text, initial, expected] of [
  ["deposit", "Quiero dejar una seña", "visit", "deposit"],
  ["transfer", "Pasame dónde transferir", "other", "transfer"],
  ["documents", "Quiero enviar la documentación", "other", "documents"],
  ["visit", "Puedo ir al local a verlo", "other", "visit"],
]) test(`requested action: ${label} is classified from explicit evidence`, async () => { const out = await extract(text, candidate({ requested_action: action(initial, text) })); assert.deepEqual([out.extraction.requested_action.type, out.extraction.strong_action.type], [expected, "strong_action"]); });
test("requested action: null does not derive strong action", async () => { const out = await extract("Quiero información", candidate({})); assert.deepEqual([out.extraction.requested_action, out.extraction.strong_action], [null, null]); });
test("requested action: vague other abstains and is not strong", async () => { const text = "Quiero resolverlo"; const out = await extract(text, candidate({ requested_action: action("other", text) })); assert.deepEqual([out.extraction.requested_action, out.extraction.strong_action], [null, null]); });
test("requested action: provider strong signal cannot bypass an ambiguous action", async () => { const text = "Quiero avanzar, pero no sé cómo"; const out = await extract(text, candidate({ requested_action: action("other", text), strong_action: { type: "strong_action", evidence: evidence("Quiero avanzar") } })); assert.deepEqual([out.extraction.requested_action, out.extraction.strong_action], [null, null]); });
test("requested action: only operational allowlist derives strong action", async () => { const text = "Quiero reservarlo"; const out = await extract(text, candidate({ requested_action: action("other", text) })); assert.equal(out.extraction.strong_action.type, "strong_action"); });

for (const [label, text] of [["talk to advisor", "Quiero hablar con un asesor"], ["advisor callback", "Que me llame un asesor mañana"], ["verify with person", "Quiero verificarlo con alguien"]])
  test(`human request: ${label}`, async () => { const out = await extract(text, candidate({ human_request: { type: "human_request", evidence: evidence(text) } })); assert.equal(out.extraction.human_request.type, "human_request"); });
test("human request: callback timing alone is not handoff", async () => { const text = "Llamame mañana"; const out = await extract(text, candidate({ human_request: { type: "human_request", evidence: evidence(text) } })); assert.equal(out.extraction.human_request, null); });
for (const [label, text] of [["no contact", "No me contacten"], ["stop calls", "No me llamen más"]])
  test(`DNC: ${label}`, async () => { const out = await extract(text, candidate({ do_not_contact: { type: "do_not_contact", evidence: evidence(text) } })); assert.equal(out.extraction.do_not_contact.type, "do_not_contact"); });
for (const [label, text] of [["temporary inability", "No puedo hablar ahora"], ["later callback", "Llamame después"]])
  test(`DNC: ${label} does not become DNC`, async () => { const out = await extract(text, candidate({ do_not_contact: { type: "do_not_contact", evidence: evidence(text) } })); assert.equal(out.extraction.do_not_contact, null); });
