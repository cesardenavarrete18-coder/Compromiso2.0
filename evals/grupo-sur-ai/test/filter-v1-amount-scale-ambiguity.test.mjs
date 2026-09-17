import test from "node:test";
import assert from "node:assert/strict";
import { emptySemanticExtraction } from "../src/filter-v1/extraction/semantic-extraction-contract.mjs";
import { extractSemanticMessage } from "../src/filter-v1/extraction/semantic-extractor.mjs";
import { semanticExtractionToEngine } from "../src/filter-v1/extraction/semantic-engine-adapter.mjs";
import { runFilterV1Integration } from "../src/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../src/filter-v1/contracts.mjs";

// Pre-canary blocker (real Candidate 2 incident, lead e8ffcdc7): "puedo pagar cuotas de
// 300 a 500 x mes" was extracted as amount_mentions with numeric_value 300 and 500,
// certainty "explicit", confirmation_recommended false - and persisted directly as
// monthly_installment_capacity=500 known/customer_message. No stage between the raw
// provider output and next_state ever challenged this: the deterministic normalizer's
// normalizeArgentineAmount() only ever ADDS confidence when a literal contains an
// explicit scale word (millones/palos/lucas) - it never removes confidence from an
// amount that lacks one. monthly_installment_capacity feeds commercial-actionability.mjs
// directly, so an unscaled/wrongly-scaled "500" (500 pesos vs the almost-certainly
// intended 500.000) can silently corrupt the one signal that gates a real handoff.
//
// Root cause: the SEMANTIC_EXTRACTOR_SYSTEM_PROMPT already instructs exactly the right
// behavior ("Si el contexto no distingue el tipo o la escala, usa unknown_amount/ambiguous
// y numeric_value null", with "Tengo 5.000 para entrar" => ambiguous as a worked example)
// and the provider schema already supports it fully (certainty:"ambiguous",
// confirmation_recommended, needs_clarification.code:"amount_scale_or_currency" all
// pre-exist). The gap is that nothing DETERMINISTIC enforces this when the LLM itself
// fails to follow its own prompt on a given call - which is exactly what happened in
// production. Fix: normalizeArgentineAmount's multiplier list gains "mil" (it already
// had "millones"/"palos"/"lucas" - "mil" being absent was an inconsistency, not a
// boundary), and a new, purely defensive check (hasSelfEvidentScale) downgrades an
// "explicit" monthly_installment_capacity/down_payment_capacity amount to ambiguous/null
// whenever the literal itself contains no self-evident scale (scale word, currency word,
// or the customer having typed the full digit count out) - it never invents or upscales
// a value, it only refuses to trust an unsupported claim, mirroring the ambiguous shape
// the prompt already asks the provider to produce for "Tengo 5.000 para entrar".

const msg = (text, id = "m1", role = "customer") => ({ id, role, text, created_at: "2026-09-17T15:00:00Z" });
const ev = (literal, source_message_id = "m1") => ({ source_message_id, literal });
const candidate = overrides => {
  const result = { ...emptySemanticExtraction(), ...overrides, evidence: { ...emptySemanticExtraction().evidence, ...(overrides.evidence ?? {}) } };
  for (const key of ["human_request", "strong_action", "do_not_contact"])
    if (typeof result[key] === "boolean") result[key] = result[key] ? { type: key, evidence: result.evidence[key] } : null;
  return result;
};
const extract = (text, output) => extractSemanticMessage({ client: async () => output, current_message: msg(text), recent_conversation: [], previous_filter_state: null, acquisition_context: null, known_catalog_context: null });

// A: real incident shape - two amount_mentions (300, 500), the LLM itself proposing
// "explicit"/confirmation_recommended:false exactly as it did in production.
test("A (RED): 'cuotas de 300 a 500 x mes' - provider says explicit 300/500, must NOT survive as known capacity", async () => {
  const text = "puedo pagar cuotas de 300 a 500 x mes";
  const amounts = [
    { kind: "monthly_installment_capacity", numeric_value: 300, currency: null, literal: text, certainty: "explicit", confirmation_recommended: false, evidence: ev(text) },
    { kind: "monthly_installment_capacity", numeric_value: 500, currency: null, literal: text, certainty: "explicit", confirmation_recommended: false, evidence: ev(text) },
  ];
  const out = await extract(text, candidate({ amount_mentions: amounts }));
  for (const amount of out.extraction.amount_mentions) {
    assert.equal(amount.numeric_value, null);
    assert.equal(amount.certainty, "ambiguous");
    assert.equal(amount.confirmation_recommended, true);
  }
  assert.ok(out.extraction.needs_clarification.some(c => c.code === "amount_scale_or_currency"));
  const engineFields = semanticExtractionToEngine(out.extraction);
  assert.equal("monthly_installment_capacity" in engineFields, false);
});

// B: "mil" explicitly stated - must resolve to the true scale, exercising the extended
// normalizeArgentineAmount multiplier (mil now sits alongside millones/palos/lucas).
test("B: 'cuotas de 300 mil a 500 mil por mes' - explicit 'mil' resolves to 300000/500000, not flagged ambiguous", async () => {
  const text = "puedo pagar cuotas de 300 mil a 500 mil por mes";
  const amounts = [
    { kind: "monthly_installment_capacity", numeric_value: 300, currency: null, literal: "300 mil", certainty: "explicit", confirmation_recommended: false, evidence: ev(text) },
    { kind: "monthly_installment_capacity", numeric_value: 500, currency: null, literal: "500 mil", certainty: "explicit", confirmation_recommended: false, evidence: ev(text) },
  ];
  const out = await extract(text, candidate({ amount_mentions: amounts }));
  assert.deepEqual(out.extraction.amount_mentions.map(a => a.numeric_value), [300000, 500000]);
  for (const amount of out.extraction.amount_mentions) assert.equal(amount.certainty, "explicit");
  assert.ok(!out.extraction.needs_clarification.some(c => c.code === "amount_scale_or_currency"));
});

// C: full digits typed out - self-evident, must survive untouched.
test("C: 'puedo pagar 300.000 por mes' - full digit count is self-evident, survives as 300000", async () => {
  const text = "puedo pagar 300.000 por mes";
  const amount = { kind: "monthly_installment_capacity", numeric_value: 300000, currency: "ARS", literal: text, certainty: "explicit", confirmation_recommended: false, evidence: ev(text) };
  const out = await extract(text, candidate({ amount_mentions: [amount] }));
  assert.equal(out.extraction.amount_mentions[0].numeric_value, 300000);
  assert.equal(out.extraction.amount_mentions[0].certainty, "explicit");
});

// D: "k" is audited, confirmed NOT a supported scale word anywhere in the codebase (see
// report section A). Per instruction, silent support is not added - the literal has no
// self-evident scale by any existing deterministic rule, so it is conservatively flagged
// ambiguous even though a real LLM might confidently (and correctly) resolve "300k" itself.
test("D: 'puedo pagar 300k por mes' - 'k' is not a supported scale marker anywhere in this codebase; flagged ambiguous rather than silently trusted or silently supported", async () => {
  const text = "puedo pagar 300k por mes";
  const amount = { kind: "monthly_installment_capacity", numeric_value: 300000, currency: null, literal: text, certainty: "explicit", confirmation_recommended: false, evidence: ev(text) };
  const out = await extract(text, candidate({ amount_mentions: [amount] }));
  assert.equal(out.extraction.amount_mentions[0].numeric_value, null);
  assert.equal(out.extraction.amount_mentions[0].certainty, "ambiguous");
  assert.ok(out.extraction.needs_clarification.some(c => c.code === "amount_scale_or_currency"));
});

// E: explicit currency word makes a small literal number trustworthy AS STATED - never
// multiplied just because it looks implausible for a car installment.
test("E: 'puedo pagar 300 pesos por mes' - explicit currency word, 300 survives literally, never multiplied", async () => {
  const text = "puedo pagar 300 pesos por mes";
  const amount = { kind: "monthly_installment_capacity", numeric_value: 300, currency: "ARS", literal: text, certainty: "explicit", confirmation_recommended: false, evidence: ev(text) };
  const out = await extract(text, candidate({ amount_mentions: [amount] }));
  assert.equal(out.extraction.amount_mentions[0].numeric_value, 300);
  assert.equal(out.extraction.amount_mentions[0].certainty, "explicit");
});

// F: current, already-relied-upon behavior for the "Nm" abbreviation (real production
// case: "2m" -> 2000000) must not regress.
test("F (regression guard): 'tengo 2m de anticipo' preserves current behavior, 2000000", async () => {
  const text = "tengo 2m de anticipo";
  const amount = { kind: "down_payment_capacity", numeric_value: 2000000, currency: null, literal: text, certainty: "explicit", confirmation_recommended: false, evidence: ev(text) };
  const out = await extract(text, candidate({ amount_mentions: [amount] }));
  assert.equal(out.extraction.amount_mentions[0].numeric_value, 2000000);
  assert.equal(out.extraction.amount_mentions[0].certainty, "explicit");
});

// G: explicit "millones" - already-supported deterministic multiplication, unaffected.
test("G: 'tengo 2 millones de anticipo' resolves to 2000000 via the existing deterministic multiplier", async () => {
  const text = "tengo 2 millones de anticipo";
  const amount = { kind: "down_payment_capacity", numeric_value: null, currency: null, literal: text, certainty: "ambiguous", confirmation_recommended: true, evidence: ev(text) };
  const out = await extract(text, candidate({ amount_mentions: [amount] }));
  assert.equal(out.extraction.amount_mentions[0].numeric_value, 2000000);
  assert.equal(out.extraction.amount_mentions[0].certainty, "explicit");
});

// H: no "por mes"/"cuota" context at all - must never even be classified as
// monthly_installment_capacity, independent of the scale question.
test("H: 'puedo pagar entre 300 y 500' with no monthly/cuota context - never assumed as monthly_installment_capacity", async () => {
  const text = "puedo pagar entre 300 y 500";
  const amounts = [
    { kind: "unknown_amount", numeric_value: null, currency: null, literal: text, certainty: "ambiguous", confirmation_recommended: true, evidence: ev(text) },
  ];
  const out = await extract(text, candidate({ amount_mentions: amounts }));
  const engineFields = semanticExtractionToEngine(out.extraction);
  assert.equal("monthly_installment_capacity" in engineFields, false);
});

// I: bare small number with "cuota" context but no scale evidence - same gap as A, singular.
test("I: 'cuota de 450' - no self-evident scale, flagged ambiguous rather than trusted as 450", async () => {
  const text = "cuota de 450";
  const amount = { kind: "monthly_installment_capacity", numeric_value: 450, currency: null, literal: text, certainty: "explicit", confirmation_recommended: false, evidence: ev(text) };
  const out = await extract(text, candidate({ amount_mentions: [amount] }));
  assert.equal(out.extraction.amount_mentions[0].numeric_value, null);
  assert.equal(out.extraction.amount_mentions[0].certainty, "ambiguous");
});

// J: full digit count typed out - self-evident, survives.
test("J: 'cuota de 450.000' - full digit count is self-evident, survives as 450000", async () => {
  const text = "cuota de 450.000";
  const amount = { kind: "monthly_installment_capacity", numeric_value: 450000, currency: "ARS", literal: text, certainty: "explicit", confirmation_recommended: false, evidence: ev(text) };
  const out = await extract(text, candidate({ amount_mentions: [amount] }));
  assert.equal(out.extraction.amount_mentions[0].numeric_value, 450000);
  assert.equal(out.extraction.amount_mentions[0].certainty, "explicit");
});

// Actionability safety (mandatory, end-to-end integration): the ambiguous-capacity case
// (A) must never be able to contribute to commerciallyActionable=true, even when every
// other trade-in identity field is already customer-declared and known.
test("Actionability safety: ambiguous capacity from 'cuotas de 300 a 500 x mes' cannot make a fully-identified trade-in lead commercially actionable", async () => {
  const prov = { source: "customer_message", evidence: null };
  let state = createFilterState();
  state.has_trade_in = field("yes", "known", prov);
  state.trade_in_vehicle.brand = field("Fox", "known", prov);
  state.trade_in_vehicle.model = field("Gol", "known", prov);

  const text = "puedo pagar cuotas de 300 a 500 x mes";
  const amounts = [
    { kind: "monthly_installment_capacity", numeric_value: 300, currency: null, literal: text, certainty: "explicit", confirmation_recommended: false, evidence: ev(text) },
    { kind: "monthly_installment_capacity", numeric_value: 500, currency: null, literal: text, certainty: "explicit", confirmation_recommended: false, evidence: ev(text) },
  ];
  const semantic = await extract(text, candidate({ amount_mentions: amounts }));
  const current_extraction = semanticExtractionToEngine(semantic.extraction);
  assert.equal("monthly_installment_capacity" in current_extraction, false);

  const out = runFilterV1Integration({
    lead: { id: "l", metadata: {}, do_not_contact: false }, attribution: null, conversation_control: { mode: "ai" },
    previous_filter_state: state, expected_state_version: state.state_version, current_extraction,
    campaigns: [], catalog: { brands: [], models: [], model_versions: [] },
    event_at: "2026-09-17T15:00:00Z", timezone: "America/Argentina/Buenos_Aires",
    business_calendar: { timeZone: "America/Argentina/Buenos_Aires", operatingWeekdays: [1, 2, 3, 4, 5, 6] },
  });
  assert.notEqual(out.next_state.monthly_installment_capacity.status, "known");
  assert.equal(out.handoff_decision.handoff_status, "not_ready");
  assert.notEqual(out.handoff_decision.next_action, "handoff");
});
