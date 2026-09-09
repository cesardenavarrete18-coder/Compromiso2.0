import assert from "node:assert/strict";
import test from "node:test";
import { runV2Shadow } from "../../../supabase/functions/_shared/ai-v2-shadow/pipeline.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { semanticExtractionToEngine } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-engine-adapter.mjs";
import { emptySemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-contract.mjs";
import { contactPriority } from "../../../supabase/functions/_shared/filter-v1/contact-priority.mjs";
import { createFilterState, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";

// Family L: semantic-engine-adapter.mjs hardcoded contact_preference.timing to
// "unknown" no matter what the customer's literal actually said, so real
// expressions ("ahora", "hoy a la tarde", "mañana después de las 17", "la
// semana que viene") never reached contactPriority() at all. Separately, the
// engine never read or wrote state.contact_preference.asked_once, and
// decideHandoff's own stop_questions=true for a complete-but-unknown-timing
// profile silenced next_filter_question forever — so "ask contact preference"
// could never actually be asked even once.

const MONDAY = "2026-01-05T15:00:00Z"; // a Monday afternoon, Argentina time

function contactExpr(literal) {
  return { ...emptySemanticExtraction(), contact_preference_expression: { literal, certainty: "explicit", evidence: [] } };
}

test("Family L - A: 'Llamame ahora.' resolves to now/hot", () => {
  const engineExtraction = semanticExtractionToEngine(contactExpr("Llamame ahora."), { event_at: MONDAY });
  assert.equal(engineExtraction.contact_preference.timing, "now");
  assert.equal(contactPriority({ timing: engineExtraction.contact_preference.timing, eventAt: MONDAY, callbackAt: engineExtraction.contact_preference.callback_at }), "hot");
});

test("Family L - B: 'Hoy a la tarde me sirve.' resolves to same_day/warm", () => {
  const engineExtraction = semanticExtractionToEngine(contactExpr("Hoy a la tarde me sirve."), { event_at: MONDAY });
  assert.equal(engineExtraction.contact_preference.timing, "same_day");
  assert.equal(contactPriority({ timing: engineExtraction.contact_preference.timing, eventAt: MONDAY, callbackAt: engineExtraction.contact_preference.callback_at }), "warm");
});

test("Family L - C: 'Mañana después de las 17.' resolves the day via the business calendar, records a window, never fabricates an exact instant", () => {
  const engineExtraction = semanticExtractionToEngine(contactExpr("Mañana después de las 17."), { event_at: MONDAY });
  assert.equal(engineExtraction.contact_preference.timing, "next_business_day");
  assert.equal(engineExtraction.contact_preference.callback_at, null, "must never invent an exact minute the literal did not give");
  assert.equal(engineExtraction.contact_preference.callback_window.date, "2026-01-06");
  assert.equal(engineExtraction.contact_preference.callback_window.from_hour, 17);
  assert.equal(contactPriority({ timing: engineExtraction.contact_preference.timing, eventAt: MONDAY, callbackAt: engineExtraction.contact_preference.callback_at }), "warm");
});

test("Family L - D: 'La semana que viene.' resolves to future", () => {
  const engineExtraction = semanticExtractionToEngine(contactExpr("La semana que viene."), { event_at: MONDAY });
  assert.equal(engineExtraction.contact_preference.timing, "future");
  assert.equal(contactPriority({ timing: engineExtraction.contact_preference.timing, eventAt: MONDAY, callbackAt: engineExtraction.contact_preference.callback_at }), "cold");
});

// --- E/F/G: asked_once persistence across turns, driven through the real engine ---

const catalog = { brands: [{ id: "b1", name: "Peugeot" }], models: [{ id: "208", name: "208", brand_id: "b1" }], model_versions: [] };
const prov = { source: "test_fixture", evidence: null };

// financed + down_payment/monthly resolved keeps this fixture clear of a
// separate, pre-existing, out-of-scope quirk in chooseNextQuestion (order.find
// treats a component absent from deriveCommercialProfile's own conditional set —
// e.g. down_payment_amount for a cash buyer — as unresolved, since it is
// `undefined` rather than "known"). Not a Family L concern; sidestepped here
// exactly as Families H/J/K already do.
function completeFinancedProfile() {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b1", brand: "Peugeot", model_id: "208", model: "208" }, "known", prov);
  state.purchase_mode = field("financed", "known", prov);
  state.down_payment_amount = field(4000000, "known", prov);
  state.monthly_installment_capacity = field(400000, "known", prov);
  state.has_trade_in = field("no", "known", prov);
  return state;
}

function memoryRepo() {
  const runs = new Map();
  return {
    async claim(mid, lid) { if (runs.has(mid)) return { created: false, run: runs.get(mid) }; const run = { id: mid, lead_id: lid }; runs.set(mid, run); return { created: true, run }; },
    async complete(id, record) { runs.set(id, { ...runs.get(id), ...record }); },
    async fail(id, record) { runs.set(id, { ...runs.get(id), ...record }); },
  };
}

async function turn({ state, extraction = {}, message = "hola" }) {
  const filterInput = { lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns: [], bank_offers: [], previous_filter_state: state, event_at: MONDAY };
  const result = await runV2Shadow({
    env: { AI_V2_SHADOW_MODE: "true" },
    input: { lead: { id: "lead1" }, inboundMessage: { id: `m-${Math.random()}`, body: message, created_at: MONDAY }, filterInput },
    repository: memoryRepo(),
    extractSemantic: async () => ({ extraction }),
    runFilter: runFilterV1Integration,
    v1Decision: null,
  });
  assert.equal(result.status, "completed", JSON.stringify(result));
  return result.record;
}

test("Family L - E: complete profile + unknown timing + asked_once=false asks contact preference exactly once and marks asked_once", async () => {
  const record = await turn({ state: completeFinancedProfile(), extraction: {}, message: "hola" });
  assert.equal(record.response_plan.next_filter_question, "contact_preference");
  assert.match(record.v2_candidate_reply, /horario/i);
  assert.equal((record.v2_candidate_reply.match(/\?/g) ?? []).length, 1);
  assert.equal(record.next_state.contact_preference.asked_once, true);
});

test("Family L - F: next turn without a timing answer, asked_once=true, does not repeat the question; stays qualified/ready/cold", async () => {
  const first = await turn({ state: completeFinancedProfile(), extraction: {}, message: "hola" });
  const second = await turn({ state: first.next_state, extraction: {}, message: "todavía no sé" });
  assert.notEqual(second.response_plan.next_filter_question, "contact_preference");
  assert.equal((second.v2_candidate_reply.match(/\?/g) ?? []).length, 0, "must not pose the contact-preference question again");
  assert.equal(second.handoff_decision.qualification_status, "qualified");
  assert.equal(second.handoff_decision.handoff_status, "ready");
  assert.equal(second.next_state.contact_priority, "cold");
  assert.equal(second.next_state.contact_preference.asked_once, true);
});

test("Family L - G: once the customer informs timing, the literal is kept and it is never asked again", async () => {
  const first = await turn({ state: completeFinancedProfile(), extraction: {}, message: "hola" });
  const second = await turn({ state: first.next_state, extraction: { contact_preference: { timing: "same_day", literal: "hoy a la tarde", callback_at: null } }, message: "hoy a la tarde" });
  assert.equal(second.next_state.contact_preference.literal, "hoy a la tarde");
  assert.equal(second.would_handoff, true, "known timing on a complete profile is a ready handoff (Family I)");
  assert.equal((second.v2_candidate_reply.match(/\?/g) ?? []).length, 0, "must not ask contact preference again once it is known");
});
