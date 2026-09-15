import assert from "node:assert/strict";
import test from "node:test";
import { createFilterState, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";
import { decideHandoff } from "../../../supabase/functions/_shared/filter-v1/handoff-policy.mjs";
import { commerciallyActionable } from "../../../supabase/functions/_shared/filter-v1/commercial-actionability.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { runV2Shadow } from "../../../supabase/functions/_shared/ai-v2-shadow/pipeline.mjs";

// Family T: V2_SHADOW_CANDIDATE_1's first real production blocker, found auditing lead
// 47c57e5d... (11 real turns, anonymized here). purchase_mode was correctly "missing"
// (the customer never declared a modality - not an extraction bug), but the engine had
// no way to use the OTHER real commercial signal the customer volunteered (a used
// trade-in fully identified, a declared monthly installment capacity of $300.000, clear
// purchase intent) to progress the conversation: deriveCommercialProfile.complete gates
// EVERYTHING on purchase_mode being resolved, chooseNextQuestion is a blind "first
// missing field wins" with no memory of what was already asked, and decideHandoff has
// no path to "ready" other than a fully complete profile. The result: the same literal
// question ("contado o financiado?") repeated 9 times in 11 turns while V1 (unaware of
// any of this machinery) reached a real human handoff by turn 10.
//
// This file's tests are written RED-first against pre-Family-T code and only pass once
// commercial-actionability.mjs exists, handoff-policy.mjs gains the new branch, and
// filter-v1-engine.mjs wires attempt-tracked question selection ahead of it.

const prov = { source: "test_fixture", evidence: null };
const customerProv = { source: "customer_message", evidence: null };
const metaProv = { source: "meta_referral", evidence: null };
const catalog = { brands: [{ id: "b1", name: "Volkswagen" }], models: [{ id: "m1", name: "Fox", brand_id: "b1" }], model_versions: [] };

function baseState({ targetProvenance = prov } = {}) {
  return createFilterState({ targetModel: { brand: "Volkswagen", model: "Nivus" }, targetProvenance });
}

// ---------------------------------------------------------------------------
// Unit tests: commerciallyActionable() in isolation
// ---------------------------------------------------------------------------

test("Family T - actionability 1: trade-in identity known + capacity known -> actionable", () => {
  const state = baseState();
  state.has_trade_in = field("yes", "known", customerProv);
  state.trade_in_vehicle.brand = field("Volkswagen", "known", customerProv);
  state.trade_in_vehicle.model = field("Fox", "known", customerProv);
  state.monthly_installment_capacity = field(300000, "known", customerProv);
  assert.equal(commerciallyActionable(state, {}), true);
});

test("Family T - actionability 2: purchase_mode financed + capacity known -> actionable", () => {
  const state = baseState();
  state.purchase_mode = field("financed", "known", customerProv);
  state.down_payment_amount = field(4000000, "known", customerProv);
  assert.equal(commerciallyActionable(state, {}), true);
});

test("Family T - actionability 3 (sentinel, trade-in only): trade-in identity known WITHOUT any capacity -> NOT actionable", () => {
  const state = baseState();
  state.has_trade_in = field("yes", "known", customerProv);
  state.trade_in_vehicle.brand = field("Volkswagen", "known", customerProv);
  state.trade_in_vehicle.model = field("Fox", "known", customerProv);
  assert.equal(commerciallyActionable(state, {}), false);
});

test("Family T - actionability 4 (sentinel, capacity only): monthly_installment_capacity known WITHOUT trade-in or financed purchase_mode -> NOT actionable", () => {
  const state = baseState();
  state.monthly_installment_capacity = field(300000, "known", customerProv);
  assert.equal(commerciallyActionable(state, {}), false);
});

test("Family T - River Plate sentinel: target_model known ONLY via meta_referral, no other disclosure -> NOT actionable", () => {
  const state = baseState({ targetProvenance: metaProv });
  assert.equal(commerciallyActionable(state, {}), false);
});

test("Family T - sentinel: financing inquiry alone ('¿trabajan financiación?' / '¿cuánto queda la cuota?') carries no known fact -> NOT actionable", () => {
  const state = baseState();
  // A pure query never resolves any field (Family S) - nothing is known yet.
  assert.equal(commerciallyActionable(state, {}), false);
});

test("Family T - provenance gate: a capacity fact NOT sourced from customer_message must not activate actionability even if paired with trade-in identity", () => {
  const state = baseState();
  state.has_trade_in = field("yes", "known", customerProv);
  state.trade_in_vehicle.brand = field("Volkswagen", "known", customerProv);
  state.trade_in_vehicle.model = field("Fox", "known", customerProv);
  // Hypothetical non-customer provenance (e.g. a future CRM import) - must never count.
  state.monthly_installment_capacity = field(300000, "known", { source: "crm_structured", evidence: null });
  assert.equal(commerciallyActionable(state, {}), false);
});

test("Family T - explicit human request / strong action are always actionable regardless of other facts", () => {
  const state = baseState();
  assert.equal(commerciallyActionable(state, { explicitHumanRequest: true }), true);
  assert.equal(commerciallyActionable(state, { strongAction: true }), true);
});

// ---------------------------------------------------------------------------
// decideHandoff: new ready/follow_up branch, decoupled from qualification
// ---------------------------------------------------------------------------

test("Family T - handoff matrix: actionable + incomplete profile -> handoff_status=ready, qualification_status=follow_up (NOT qualified), stop_questions=true", () => {
  const decision = decideHandoff({ profileComplete: false, commerciallyActionable: true });
  assert.equal(decision.handoff_status, "ready");
  assert.equal(decision.next_action, "handoff");
  assert.equal(decision.qualification_status, "follow_up");
  assert.equal(decision.stop_questions, true);
});

test("Family T - handoff matrix: DNC always wins over actionability", () => {
  const decision = decideHandoff({ doNotContact: true, commerciallyActionable: true });
  assert.equal(decision.handoff_status, "closed_or_routed");
  assert.equal(decision.qualification_status, "unqualified");
});

test("Family T - handoff matrix: explicit human request/strong action still win over actionable-only path (unchanged precedence)", () => {
  const decision = decideHandoff({ explicitHumanRequest: true, commerciallyActionable: true, profileComplete: false });
  assert.equal(decision.handoff_status, "immediate");
});

test("Family T - handoff matrix: not actionable + incomplete profile -> unchanged not_ready behavior", () => {
  const decision = decideHandoff({ profileComplete: false, commerciallyActionable: false });
  assert.equal(decision.handoff_status, "not_ready");
  assert.equal(decision.next_action, "ask_next_missing_component");
});

test("Family T - no double handoff: calling decideHandoff again on an already-ready actionable state is idempotent, not a second/different handoff", () => {
  const first = decideHandoff({ profileComplete: false, commerciallyActionable: true });
  const second = decideHandoff({ profileComplete: false, commerciallyActionable: true });
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------
// Integration: runFilterV1Integration - engine wiring, sentinels, no-inference guard
// ---------------------------------------------------------------------------

function runTurn({ state, extraction = {} }) {
  return runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns: [], bank_offers: [],
    previous_filter_state: state, expected_state_version: state.state_version ?? 0, current_extraction: extraction,
  });
}

test("Family T - engine sentinel: River Plate (meta model + 'quiero más información') -> not actionable, follow_up, not_ready", () => {
  const result = runTurn({ state: baseState({ targetProvenance: metaProv }), extraction: { query_intent: "general_information" } });
  assert.equal(result.handoff_decision.qualification_status, "follow_up");
  assert.equal(result.handoff_decision.handoff_status, "not_ready");
});

test("Family T - engine sentinel: financing inquiry alone -> not actionable", () => {
  const result = runTurn({ state: baseState(), extraction: { query_intent: "installment_offer" } });
  assert.equal(result.handoff_decision.handoff_status, "not_ready");
});

test("Family T - engine guard: capacity mention alone never infers purchase_mode (axiom, unchanged)", () => {
  const result = runTurn({ state: baseState(), extraction: { extracted_fields: { monthly_installment_capacity: 300000 } } });
  assert.equal(result.next_state.purchase_mode.status, "missing", "must NOT infer financed from a bare cuota/capacity mention");
  assert.equal(result.next_state.monthly_installment_capacity.value, 300000);
});

test("Family T - engine: trade-in identity + capacity in the same turn reaches ready handoff without a complete profile", () => {
  const result = runTurn({
    state: baseState(),
    extraction: { extracted_fields: { has_trade_in: "yes", trade_in_vehicle: { brand: "Volkswagen", model: "Fox" }, monthly_installment_capacity: 300000 } },
  });
  assert.equal(result.next_state.purchase_mode.status, "missing");
  assert.equal(result.next_state.commercial_profile.complete, false, "profile must stay formally incomplete (purchase_mode still missing) - actionability is a separate dimension");
  assert.equal(result.handoff_decision.handoff_status, "ready");
  assert.equal(result.handoff_decision.qualification_status, "follow_up");
  assert.equal(result.handoff_decision.next_action, "handoff");
  assert.equal(result.response_plan.next_filter_question, null, "no further question once actionable");
});

test("Family T - engine: DNC still suppresses everything even with actionable facts present", () => {
  const state = baseState();
  state.has_trade_in = field("yes", "known", customerProv);
  state.trade_in_vehicle.brand = field("Volkswagen", "known", customerProv);
  state.trade_in_vehicle.model = field("Fox", "known", customerProv);
  state.monthly_installment_capacity = field(300000, "known", customerProv);
  const result = runTurn({ state, extraction: { noncommercial: true } });
  assert.equal(result.handoff_decision.handoff_status, "closed_or_routed");
});

test("Family T - engine: explicit human request ('Quiero hablar con un vendedor') -> immediate, unchanged", () => {
  const result = runTurn({ state: baseState(), extraction: { human_request: true } });
  assert.equal(result.handoff_decision.handoff_status, "immediate");
});

test("Family T - engine: strong action ('Quiero reservarlo') -> immediate, unchanged", () => {
  const result = runTurn({ state: baseState(), extraction: { strong_action: true } });
  assert.equal(result.handoff_decision.handoff_status, "immediate");
});

// ---------------------------------------------------------------------------
// Anti-repetition: multi-turn, real Shadow chain (Family L's own turn() pattern)
// ---------------------------------------------------------------------------

function memoryRepo() {
  const runs = new Map();
  return {
    async claim(mid, lid) { if (runs.has(mid)) return { created: false, run: runs.get(mid) }; const run = { id: mid, lead_id: lid }; runs.set(mid, run); return { created: true, run }; },
    async complete(id, record) { runs.set(id, { ...runs.get(id), ...record }); },
    async fail(id, record) { runs.set(id, { ...runs.get(id), ...record }); },
  };
}

async function turn({ state, extraction = {}, message = "hola" }) {
  const filterInput = { lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns: [], bank_offers: [], previous_filter_state: state };
  const result = await runV2Shadow({
    env: { AI_V2_SHADOW_MODE: "true" },
    input: { lead: { id: "lead1" }, inboundMessage: { id: `m-${Math.random()}`, body: message, created_at: "2026-09-15T00:00:00Z" }, filterInput },
    repository: memoryRepo(),
    extractSemantic: async () => ({ extraction }),
    runFilter: runFilterV1Integration,
    v1Decision: null,
  });
  assert.equal(result.status, "completed", JSON.stringify(result));
  return result.record;
}

test("Family T - anti-repetition: purchase_mode cannot be asked with the identical literal a 3rd time without a strategy change", async () => {
  let record = await turn({ state: baseState(), extraction: {}, message: "hola" });
  assert.equal(record.response_plan.next_filter_question, "purchase_mode");
  const firstQuestionText = record.v2_candidate_reply;

  record = await turn({ state: record.next_state, extraction: {}, message: "no sé todavía" });
  assert.equal(record.response_plan.next_filter_question, "purchase_mode", "2nd identical ask is still allowed");
  assert.equal(record.v2_candidate_reply, firstQuestionText);

  // A 3rd turn with still no answer and no new fact must NOT ask purchase_mode
  // with the same literal a 3rd time - it must fall through to a different
  // question (or defer to contact_preference) instead of looping forever.
  record = await turn({ state: record.next_state, extraction: {}, message: "mmm" });
  assert.notEqual(record.response_plan.next_filter_question, "purchase_mode", "purchase_mode must be exhausted after 2 identical attempts");
});

test("Family T - real case regression (anonymized): initial interest -> trade-in -> brand/model -> km -> monthly capacity ($300.000) -> valuation -> purchase intent reaches ready handoff before turn 11, without ever inferring purchase_mode", async () => {
  let record = await turn({ state: baseState(), extraction: { query_intent: "general_information" }, message: "Hola, quiero más info" });
  assert.equal(record.next_state.purchase_mode.status, "missing");

  record = await turn({ state: record.next_state, extraction: { extracted_fields: { has_trade_in: "yes" } }, message: "Tengo un usado para entregar" });
  assert.equal(record.next_state.purchase_mode.status, "missing");

  record = await turn({ state: record.next_state, extraction: { extracted_fields: { trade_in_vehicle: { brand: "Volkswagen", model: "Fox" } } }, message: "Es un Volkswagen Fox" });
  assert.equal(record.next_state.purchase_mode.status, "missing");
  assert.equal(record.next_state.trade_in_vehicle.model.value, "Fox");

  record = await turn({ state: record.next_state, extraction: { extracted_fields: { trade_in_vehicle: { km: 239000 } } }, message: "Tiene 239.000 km" });
  assert.equal(record.next_state.purchase_mode.status, "missing");

  record = await turn({ state: record.next_state, extraction: { extracted_fields: { monthly_installment_capacity: 300000 } }, message: "Puedo pagar cuotas de 300.000 por mes" });
  assert.equal(record.next_state.purchase_mode.status, "missing", "capacity mention must never infer purchase_mode");

  // By this turn (5, well before the observed 11-turn stuck pattern) enough real
  // commercial signal exists - trade-in fully identified + declared capacity -
  // for the lead to be commercially actionable, without ever resolving purchase_mode.
  assert.equal(record.handoff_decision.handoff_status, "ready", "must reach ready handoff before turn 11 (observed stuck pattern)");
  assert.equal(record.handoff_decision.qualification_status, "follow_up", "actionable is NOT the same as qualified");
  assert.equal(record.handoff_decision.next_action, "handoff");
  assert.equal(record.response_plan.next_filter_question, null, "must stop asking once actionable");
  assert.equal(record.next_state.commercial_profile.complete, false, "profile stays formally incomplete - purchase_mode was never declared, and must never be inferred");
});

// ---------------------------------------------------------------------------
// Independent review corrections (post-01833e9): 3 concrete fixes, RED-first.
// ---------------------------------------------------------------------------

// Fix 1: contact_priority must stay decoupled from commercial actionability -
// contactPriority() already owns temporal urgency (now/same_day/unknown/future
// -> hot/warm/cold), and decideHandoff's commerciallyActionable branch must
// never redefine it as a hardcoded "warm".

test("Family T fix 1 - actionable + timing unknown preserves 'cold' from contactPriority(), not a hardcoded urgency", () => {
  const result = runTurn({
    state: (() => { const s = baseState(); s.has_trade_in = field("yes", "known", customerProv); s.trade_in_vehicle.brand = field("Volkswagen", "known", customerProv); s.trade_in_vehicle.model = field("Fox", "known", customerProv); s.monthly_installment_capacity = field(300000, "known", customerProv); return s; })(),
    extraction: {},
  });
  assert.equal(result.handoff_decision.handoff_status, "ready");
  assert.equal(result.handoff_decision.contact_priority, null, "decideHandoff must not assert a priority here - the engine's own contactPriority() computation must survive");
  assert.equal(result.next_state.contact_priority, "cold", "unknown timing must stay cold even though the lead is actionable");
});

test("Family T fix 1 - actionable + timing 'now' preserves 'hot' from contactPriority()", () => {
  const state = (() => { const s = baseState(); s.has_trade_in = field("yes", "known", customerProv); s.trade_in_vehicle.brand = field("Volkswagen", "known", customerProv); s.trade_in_vehicle.model = field("Fox", "known", customerProv); s.monthly_installment_capacity = field(300000, "known", customerProv); return s; })();
  const result = runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns: [], bank_offers: [],
    previous_filter_state: state, expected_state_version: state.state_version ?? 0,
    current_extraction: { contact_preference: { timing: "now", literal: "ahora", callback_at: null } },
    event_at: "2026-01-05T15:00:00Z",
  });
  assert.equal(result.handoff_decision.handoff_status, "ready");
  assert.equal(result.next_state.contact_priority, "hot");
});

test("Family T fix 1 - actionable + timing 'same_day' preserves 'warm' from contactPriority() (not a coincidental hardcode)", () => {
  const state = (() => { const s = baseState(); s.has_trade_in = field("yes", "known", customerProv); s.trade_in_vehicle.brand = field("Volkswagen", "known", customerProv); s.trade_in_vehicle.model = field("Fox", "known", customerProv); s.monthly_installment_capacity = field(300000, "known", customerProv); return s; })();
  const result = runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns: [], bank_offers: [],
    previous_filter_state: state, expected_state_version: state.state_version ?? 0,
    current_extraction: { contact_preference: { timing: "same_day", literal: "hoy a la tarde", callback_at: null } },
    event_at: "2026-01-05T15:00:00Z",
  });
  assert.equal(result.handoff_decision.handoff_status, "ready");
  assert.equal(result.next_state.contact_priority, "warm");
});

// Fix 2: a new commercial fact this turn must not be met with an immediate
// repeat of the exact question that went unanswered, even before
// MAX_IDENTICAL_ASKS(=2) is reached.

test("Family T fix 2 (RED case) - T1 asks purchase_mode; T2 customer doesn't answer it but declares has_trade_in=yes -> must NOT immediately re-ask purchase_mode", async () => {
  let record = await turn({ state: baseState(), extraction: {}, message: "hola" });
  assert.equal(record.response_plan.next_filter_question, "purchase_mode", "sanity: T1 asks purchase_mode");

  record = await turn({ state: record.next_state, extraction: { extracted_fields: { has_trade_in: "yes" } }, message: "Tengo un usado para entregar" });
  assert.notEqual(record.response_plan.next_filter_question, "purchase_mode", "a brand-new fact this turn must not be met with the identical unanswered question again - not even on the 2nd attempt");
});

test("Family T fix 2 - repeating with NO new fact is still allowed up to MAX_IDENTICAL_ASKS (safety net unchanged)", async () => {
  let record = await turn({ state: baseState(), extraction: {}, message: "hola" });
  assert.equal(record.response_plan.next_filter_question, "purchase_mode");
  record = await turn({ state: record.next_state, extraction: {}, message: "no sé todavía" });
  assert.equal(record.response_plan.next_filter_question, "purchase_mode", "no new fact arrived - the 2nd identical ask is still allowed");
});

// Fix 3: contact_preference used as the exhausted-fields fallback must obey
// the SAME asked_once discipline as Family L's own contact-preference ask -
// reusing the flag, not a new counter.

test("Family T fix 3 (RED case) - contact_preference fallback must not loop forever once already asked_once", async () => {
  // Force a profile where purchase_mode is the ONLY eligible field (model known,
  // has_trade_in explicitly "no" so no trade_in_* sub-components activate).
  const state = baseState();
  state.has_trade_in = field("no", "known", customerProv);

  let record = await turn({ state, extraction: {}, message: "hola" }); // attempt 1
  assert.equal(record.response_plan.next_filter_question, "purchase_mode");
  record = await turn({ state: record.next_state, extraction: {}, message: "no sé" }); // attempt 2 (exhausted after this)
  assert.equal(record.response_plan.next_filter_question, "purchase_mode");
  record = await turn({ state: record.next_state, extraction: {}, message: "mmm" }); // exhausted fallback -> contact_preference, 1st time
  assert.equal(record.response_plan.next_filter_question, "contact_preference");
  assert.equal(record.next_state.contact_preference.asked_once, true, "the fallback ask must mark the SAME asked_once flag Family L uses");

  record = await turn({ state: record.next_state, extraction: {}, message: "todavía nada" }); // exhausted fallback again, already asked_once
  assert.equal(record.response_plan.next_filter_question, null, "must NOT repeat contact_preference a 2nd time via this fallback - go silent instead");
});
