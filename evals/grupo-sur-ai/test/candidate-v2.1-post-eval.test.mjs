import test from "node:test";
import assert from "node:assert/strict";
import { composeCandidateReply, deriveCommercialFactContext, evaluateCandidateOffline } from "../src/candidate-v2.1/candidate-runtime.mjs";
import { emptyExtraction, knownField } from "../src/candidate-v2.1/extraction-schema.mjs";
import { accumulateExtraction, createLeadProfile } from "../src/candidate-v2.1/profile-accumulator.mjs";
import { calculateInitialCapacity } from "../src/candidate-v2.1/matrix-engine.mjs";

const evidence = (quote) => ({ message_id: "inbound", quote });
const known = (value, quote = "fixture") => knownField(value, evidence(quote));
const money = (amount, quote = `$${amount}`) => known({ amount, currency: "ARS" }, quote);
const target = (amount, quote = `$${amount}`) => known({ amount, minimum: null, maximum: null, currency: "ARS", accepted_authorized_anchor: false }, quote);
function runtime(overrides = {}) {
  return { inbound_message: { event_type: "customer_message", text: "Hola" }, existing_model_interest: null, prior_history: [], meta_referral: { present: false }, prior_qualification: { status: null }, conversation_control: { status: "open", handoff_status: "continue_ai", substantive_ai_turns: 0, reminders_sent: 0, silence_minutes: 0 }, do_not_contact: false, takeover: { active: false, owner: null }, routing_state: {}, persisted_data: {}, ...overrides };
}
function extraction(overrides = {}) { const base = emptyExtraction(); return { ...base, ...overrides, trade_in: { ...base.trade_in, ...(overrides.trade_in || {}) } }; }
const fact = (topic, status, authorized = status === "authorized") => ({ topic, status, authorized, evidence: [evidence(topic)] });

test("commercial authorization is owned by the certified result set", () => {
  const proposed = extraction({ commercial_fact_context: fact("price", "authorized"), direct_answer: "El precio es $10.000.000." });
  const denied = deriveCommercialFactContext(proposed, { output: [{ type: "file_search_call" }] });
  assert.deepEqual([denied.status, denied.authorized], ["unavailable", false]);
  const current = deriveCommercialFactContext(proposed, { output: [{ type: "file_search_call", results: [{ text: "Precio $10.000.000", metadata: { authorized: true, status: "current" } }] }] });
  assert.deepEqual([current.status, current.authorized], ["authorized", true]);
});

test("GSV1-051: blocked external facts cannot leak through direct_answer", () => {
  for (const status of ["unavailable", "conflicting", "not_catalogued", "variable_confirmation_required", "unverified"]) {
    const output = evaluateCandidateOffline({ runtimeInput: runtime(), extraction: extraction({ direct_answer: "El precio es $10.000.000.", concrete_query: { present: true, topic: "price", blocks_progress: true }, commercial_fact_context: fact("price", "authorized") }), authorizationContext: fact("price", status, false) });
    assert.doesNotMatch(output.reply_text, /10\.000\.000/, status);
  }
});

test("authorized current price may be answered", () => {
  const output = evaluateCandidateOffline({ runtimeInput: runtime(), extraction: extraction({ direct_answer: "El precio vigente es $10.000.000.", concrete_query: { present: true, topic: "price", blocks_progress: true }, commercial_fact_context: fact("price", "authorized") }), authorizationContext: fact("price", "authorized") });
  assert.match(output.reply_text, /10\.000\.000/);
});

test("customer cash and target amounts need no external RAG authorization", () => {
  for (const [field, value, text] of [["cash_available", money(10_000_000), "Registré tus $10.000.000."], ["target_installment", target(450_000), "Registré tu objetivo de $450.000 mensuales."]]) {
    const output = evaluateCandidateOffline({ runtimeInput: runtime(), extraction: extraction({ [field]: value, direct_answer: text, commercial_intent: known("active") }) });
    assert.match(output.reply_text, field === "cash_available" ? /10\.000\.000/ : /450\.000/);
  }
});

test("GSV1-024: a human request is not a visit or an immediate qualification", () => {
  for (const quote of ["Ya te respondí, pasame con alguien.", "quiero hablar con una persona"]) {
    const output = evaluateCandidateOffline({ runtimeInput: runtime({ conversation_control: { status: "open", handoff_status: "continue_ai", substantive_ai_turns: 5, reminders_sent: 0, silence_minutes: 0, frustrated: true } }), extraction: extraction({ human_request: known("explicit", quote), visit_intent: known("requested", quote), commercial_action_request: known("visit", quote), commercial_intent: known("active", quote) }) });
    assert.deepEqual([output.profile.visit_intent.status, output.qualification_status, output.commercial_temperature, output.handoff_status, output.conversation_status, output.next_action], ["unknown", "follow_up", "warm", "handoff_required", "paused", "handoff_now_for_human_request"]);
  }
});

test("physical visit evidence remains valid, independently or with human request", () => {
  for (const quote of ["me acerco mañana", "quiero hablar con alguien y coordinar una visita"]) {
    const output = evaluateCandidateOffline({ runtimeInput: runtime({ existing_model_interest: "Fiat Toro" }), extraction: extraction({ human_request: quote.includes("alguien") ? known("explicit", "quiero hablar con alguien") : known("none"), visit_intent: known("requested", quote.includes("alguien") ? "coordinar una visita" : quote), commercial_action_request: known("visit", quote.includes("alguien") ? "coordinar una visita" : quote), commercial_intent: known("action_ready", quote) }) });
    assert.equal(output.profile.visit_intent.value, "requested");
    assert.equal(output.qualification_status, "qualified");
  }
});

test("GSV1-064: known-unmaterialized merges preserve knowledge without arithmetic or repetition", () => {
  const seeded = createLeadProfile(runtime({ persisted_data: { cash_available: "known" }, existing_model_interest: "Fiat Toro", meta_referral: { present: true, advertised_model: "Fiat Toro", advertised_modality: "financing" } }), "2026-09-01T00:00:00Z");
  for (const incoming of [known(null), emptyExtraction().cash_available]) {
    const profile = accumulateExtraction(seeded, extraction({ cash_available: incoming, commercial_intent: known("active") }), "2026-09-01T00:01:00Z");
    assert.deepEqual([profile.cash_available.status, profile.cash_available.knowledge_state, profile.cash_available.value], ["known", "known_unmaterialized", null]);
    assert.equal(calculateInitialCapacity(profile).cash_component, null);
    const output = evaluateCandidateOffline({ runtimeInput: runtime({ persisted_data: { cash_available: "known" }, existing_model_interest: "Fiat Toro", meta_referral: { present: true, advertised_model: "Fiat Toro", advertised_modality: "financing" } }), extraction: extraction({ cash_available: incoming, target_installment: target(450_000), commercial_intent: known("active") }) });
    assert.ok(!output.missing_commercial_fields.includes("cash_available"));
    assert.doesNotMatch(output.reply_text, /\$|persisted/i);
  }
});

test("concrete persisted values preserve, conflict, and correct with history", () => {
  const seeded = createLeadProfile(runtime({ persisted_data: { cash_available: { ...money(5_000_000), history: [] } } }), "2026-09-01T00:00:00Z");
  assert.equal(accumulateExtraction(seeded, extraction(), "2026-09-01T00:01:00Z").cash_available.value.amount, 5_000_000);
  assert.equal(accumulateExtraction(seeded, extraction({ cash_available: money(6_000_000) }), "2026-09-01T00:01:00Z").cash_available.status, "conflicting");
  const corrected = accumulateExtraction(seeded, extraction({ cash_available: money(6_000_000), corrections: [{ field: "cash_available", previous_value: { amount: 5_000_000, currency: "ARS" }, new_value: { amount: 6_000_000, currency: "ARS" }, explicit: true, evidence: [evidence("ahora tengo seis millones")] }] }), "2026-09-01T00:01:00Z");
  assert.equal(corrected.cash_available.value.amount, 6_000_000);
  assert.equal(corrected.cash_available.history.at(-1).event, "explicit_correction");
});

test("limited messages preserve prior model/modality and do not infer financing", () => {
  for (const text of ["Sólo decime la cuota", "¿cómo seguimos?", "y el precio?", "eso nomás"]) {
    const output = evaluateCandidateOffline({ runtimeInput: runtime({ inbound_message: { event_type: "customer_message", text }, existing_model_interest: "Fiat Toro", persisted_data: { purchase_modality: "cash", cash_available: money(10_000_000) } }), extraction: extraction({ concrete_query: { present: true, topic: "price", blocks_progress: true } }) });
    assert.equal(output.profile.model_interest.status, "known");
    assert.equal(output.profile.purchase_modality.value, "cash");
  }
  const noContext = evaluateCandidateOffline({ runtimeInput: runtime({ inbound_message: { event_type: "customer_message", text: "Sólo decime la cuota" } }), extraction: extraction({ concrete_query: { present: true, topic: "installment", blocks_progress: true } }) });
  assert.equal(noContext.profile.purchase_modality.status, "unknown");
});
