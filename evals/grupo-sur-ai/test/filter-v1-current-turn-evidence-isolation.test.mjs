import test from "node:test";
import assert from "node:assert/strict";
import { emptySemanticExtraction } from "../src/filter-v1/extraction/semantic-extraction-contract.mjs";
import { extractSemanticMessage } from "../src/filter-v1/extraction/semantic-extractor.mjs";
import { semanticExtractionToEngine } from "../src/filter-v1/extraction/semantic-engine-adapter.mjs";
import { runFilterV1Integration } from "../src/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../src/filter-v1/contracts.mjs";

// Pre-canary blocker (real Candidate 3 incident, lead 8abcbc5e-61d9-400d-a01d-b6363e06aa3a):
// T1 customer said "Entregando el usado mas 10.000.000 cuanto seria la cuotas" - correctly
// resolved as down_payment_capacity=10000000, evidence anchored in T1's own message. T2
// customer said only "Si". The provider nonetheless re-emitted the SAME literal/value under a
// DIFFERENT kind (monthly_installment_capacity), with evidence sourced entirely from T1's
// message id - none from T2's "Si". sanitizeSemanticEvidence's validateEvidence() only checks
// that a message with that id exists somewhere in [current_message, ...recent_conversation]
// and that the literal appears in it; it has no notion of "this turn" vs "any prior turn", so
// the resurrected claim passed and created next_state.monthly_installment_capacity=10000000
// known/customer_message - a capacity the customer never stated on "Si". This directly feeds
// commercial-actionability.mjs.
//
// Axiom: conversation history is CONTEXT, not permission to mint a new material customer
// fact. A material amount_mention for turn N needs evidence anchored in turn N's own message.
// Every legitimate contextual resolution already in this codebase (trade-in/purchase-mode
// short answers, the pre-existing "$10 millones" contextual down-payment test) already
// includes the CURRENT message in its evidence array alongside any prior one - this fix only
// enforces that same existing convention for amount_mentions specifically (the two kinds that
// actually reach next_state: monthly_installment_capacity, down_payment_capacity).

const msg = (text, id, role = "customer") => ({ id, role, text, created_at: "2026-09-18T15:00:00Z" });
const ev = (literal, source_message_id) => ({ source_message_id, literal });
const candidate = overrides => {
  const result = { ...emptySemanticExtraction(), ...overrides, evidence: { ...emptySemanticExtraction().evidence, ...(overrides.evidence ?? {}) } };
  for (const key of ["human_request", "strong_action", "do_not_contact"])
    if (typeof result[key] === "boolean") result[key] = result[key] ? { type: key, evidence: result.evidence[key] } : null;
  return result;
};
const extract = (currentMsg, output, recent_conversation = []) => extractSemanticMessage({ client: async () => output, current_message: currentMsg, recent_conversation, previous_filter_state: null, acquisition_context: null, known_catalog_context: null });

// 1: REAL BUG reproduction (anonymized, same shape as the real Candidate 3 case).
test("1 (RED, real bug): 'Si' cannot resurrect a prior turn's amount as a new monthly_installment_capacity fact", async () => {
  const t1 = msg("Entregando el usado mas 10.000.000 cuanto seria la cuotas", "t1");
  const t2 = msg("Si", "t2");
  const staleAmount = { kind: "monthly_installment_capacity", literal: "10.000.000", currency: null, certainty: "explicit", confirmation_recommended: false, numeric_value: 10000000, evidence: [ev(t1.text, t1.id)] };
  const out = await extract(t2, candidate({ amount_mentions: [staleAmount] }), [t1]);
  assert.equal(out.extraction.amount_mentions[0].numeric_value, null);
  assert.equal(out.extraction.amount_mentions[0].certainty, "ambiguous");
  const engineFields = semanticExtractionToEngine(out.extraction);
  assert.equal("monthly_installment_capacity" in engineFields, false);
});

// 2: same old value/kind re-emitted from stale evidence - persisted state must stay intact,
// this turn contributes nothing new.
test("2: 'Si' re-emitting the SAME down_payment_capacity from T1-only evidence contributes no fresh fact; persisted state is untouched", async () => {
  const t1 = msg("Tengo 10.000.000 de anticipo", "t1");
  const t2 = msg("Si", "t2");
  const staleAmount = { kind: "down_payment_capacity", literal: "10.000.000", currency: null, certainty: "explicit", confirmation_recommended: false, numeric_value: 10000000, evidence: [ev(t1.text, t1.id)] };
  const out = await extract(t2, candidate({ amount_mentions: [staleAmount] }), [t1]);
  assert.equal(out.extraction.amount_mentions[0].numeric_value, null);
  const engineFields = semanticExtractionToEngine(out.extraction);
  assert.equal("down_payment_amount" in engineFields, false);

  const prov = { source: "customer_message", evidence: null };
  const state = createFilterState();
  state.down_payment_amount = field(10000000, "known", prov);
  const result = runFilterV1Integration({
    lead: { id: "l", metadata: {}, do_not_contact: false }, attribution: null, conversation_control: { mode: "ai" },
    previous_filter_state: state, expected_state_version: state.state_version, current_extraction: engineFields,
    campaigns: [], catalog: { brands: [], models: [], model_versions: [] },
    event_at: "2026-09-18T15:00:00Z", timezone: "America/Argentina/Buenos_Aires",
    business_calendar: { timeZone: "America/Argentina/Buenos_Aires", operatingWeekdays: [1, 2, 3, 4, 5, 6] },
  });
  assert.equal(result.next_state.down_payment_amount.value, 10000000);
  assert.equal(result.next_state.down_payment_amount.status, "known");
});

// 3: current-turn valid capacity - the customer states it themselves, evidence anchored in
// the current message.
test("3: 'Sí, puedo pagar 500.000 por mes' - current-turn evidence, monthly_installment_capacity allowed", async () => {
  const current = msg("Sí, puedo pagar 500.000 por mes", "m1");
  const amount = { kind: "monthly_installment_capacity", literal: current.text, currency: "ARS", certainty: "explicit", confirmation_recommended: false, numeric_value: 500000, evidence: [ev(current.text, current.id)] };
  const out = await extract(current, candidate({ amount_mentions: [amount] }));
  assert.equal(out.extraction.amount_mentions[0].numeric_value, 500000);
  assert.equal(out.extraction.amount_mentions[0].certainty, "explicit");
});

// 4: current-turn short numeric answer to an explicit capacity question - the existing
// contextual convention (current message evidence present, prior assistant question cited
// too) already covers this, mirroring the pre-existing "$10 millones" contextual test.
test("4: '500.000' answering an explicit monthly-capacity question - accepted via current-turn evidence, mirrors existing contextual convention", async () => {
  const prior = msg("¿Qué monto podés destinar por mes a la cuota?", "a1", "assistant");
  const current = msg("500.000", "m1");
  const amount = { kind: "monthly_installment_capacity", literal: "500.000", currency: null, certainty: "contextual", confirmation_recommended: true, numeric_value: 500000, evidence: [ev(current.text, current.id), ev(prior.text, prior.id)] };
  const out = await extract(current, candidate({ amount_mentions: [amount] }), [prior]);
  assert.equal(out.extraction.amount_mentions[0].numeric_value, 500000);
});

// 5: history must not change semantic kind - a prior down_payment can never become monthly
// capacity on a later unrelated turn merely because the resurrected (wider) excerpt of that
// prior message also happens to contain "cuotas" (the exact real mechanism: T1's own narrow
// evidence excerpt "mas 10.000.000" never matched either keyword, correctly staying
// down_payment_capacity; the T2 stale re-emission cited the FULL T1 sentence instead, whose
// wider text does contain "cuotas", so the deterministic kind-reclassifier alone - independent
// of whatever kind the provider proposed - flips it to monthly_installment_capacity).
test("5: a prior down_payment_capacity mention can never surface as monthly_installment_capacity on an unrelated later turn via a wider resurrected excerpt", async () => {
  const t1 = msg("Entregando el usado mas 10.000.000 cuanto seria la cuotas", "t1");
  const t2 = msg("dale", "t2");
  const staleAmount = { kind: "down_payment_capacity", literal: "10.000.000", currency: null, certainty: "explicit", confirmation_recommended: false, numeric_value: 10000000, evidence: [ev(t1.text, t1.id)] };
  const out = await extract(t2, candidate({ amount_mentions: [staleAmount] }), [t1]);
  assert.equal(out.extraction.amount_mentions[0].kind, "monthly_installment_capacity", "sanity: the deterministic reclassifier does flip kind from the wider stale excerpt, which is exactly why current-turn anchoring (not kind alone) must be the guard");
  assert.equal(out.extraction.amount_mentions[0].numeric_value, null);
  assert.equal(out.extraction.amount_mentions[0].certainty, "ambiguous");
});

// 6: actionability safety - a fully-identified trade-in lead must not become actionable off a
// stale, cross-turn-resurrected capacity claim.
test("6 (actionability safety, real lead shape): stale resurrected capacity cannot make a fully-identified trade-in lead commercially actionable", async () => {
  const prov = { source: "customer_message", evidence: null };
  const state = createFilterState();
  state.has_trade_in = field("yes", "known", prov);
  state.trade_in_vehicle.brand = field("Volkswagen", "known", prov);
  state.trade_in_vehicle.model = field("Tera", "known", prov);

  const t1 = msg("Entregando el usado mas 10.000.000 cuanto seria la cuotas", "t1");
  const t2 = msg("Si", "t2");
  const staleAmount = { kind: "monthly_installment_capacity", literal: "10.000.000", currency: null, certainty: "explicit", confirmation_recommended: false, numeric_value: 10000000, evidence: [ev(t1.text, t1.id)] };
  const semantic = await extract(t2, candidate({ amount_mentions: [staleAmount] }), [t1]);
  const current_extraction = semanticExtractionToEngine(semantic.extraction);
  assert.equal("monthly_installment_capacity" in current_extraction, false);

  const out = runFilterV1Integration({
    lead: { id: "l", metadata: {}, do_not_contact: false }, attribution: null, conversation_control: { mode: "ai" },
    previous_filter_state: state, expected_state_version: state.state_version, current_extraction,
    campaigns: [], catalog: { brands: [], models: [], model_versions: [] },
    event_at: "2026-09-18T15:00:00Z", timezone: "America/Argentina/Buenos_Aires",
    business_calendar: { timeZone: "America/Argentina/Buenos_Aires", operatingWeekdays: [1, 2, 3, 4, 5, 6] },
  });
  assert.notEqual(out.next_state.monthly_installment_capacity.status, "known");
  assert.equal(out.handoff_decision.handoff_status, "not_ready");
  assert.notEqual(out.handoff_decision.next_action, "handoff");
});
