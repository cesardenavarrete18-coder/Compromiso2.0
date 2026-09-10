import assert from "node:assert/strict";
import test from "node:test";
import { applyNegationScopeFirewall } from "../../../supabase/functions/_shared/ai-v2-shadow/safety-firewall.mjs";
import { semanticExtractionToEngine } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-engine-adapter.mjs";
import { emptySemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-contract.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";

// Family Q2 (real Production incidents, 2026-09-10):
// - Andres: canonical trade-in Peugeot 307 2006/200.000 km was later contaminated with
//   target Partner on a short "Las cuotas?" turn, then "Solo el efectivo.el auto no" failed
//   to clear has_trade_in=yes and the engine kept asking trade_in_variant.
// - Nacho: history/context repeatedly reconstructed Partner trade-in semantics, proving the
//   used-vehicle path is exercised by organic traffic and that contextual role evidence must
//   not be allowed to overwrite canonical vehicle identity by itself.

const catalog = {
  brands: [{ id: "b-peugeot", name: "Peugeot" }],
  models: [
    { id: "m-partner", name: "Partner", brand_id: "b-peugeot" },
    { id: "m-307", name: "307", brand_id: "b-peugeot" },
  ],
  model_versions: [],
};
const prov = { source: "test_fixture", evidence: null };

function priorPartnerWith307TradeIn() {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: "m-partner", model: "Partner" }, "known", prov);
  state.has_trade_in = field("yes", "known", prov);
  state.trade_in_vehicle.brand = field("Peugeot", "known", prov);
  state.trade_in_vehicle.model = field("307", "known", prov);
  state.trade_in_vehicle.year = field("2006", "known", prov);
  state.trade_in_vehicle.km = field(200000, "known", prov);
  return state;
}

test("Family Q2 - 1 (exact incident): 'Solo el efectivo.el auto no' overrides stale trade_in_intent=yes", () => {
  const candidate = { ...emptySemanticExtraction(), purchase_mode_statement: "cash", trade_in_intent: "yes" };
  const prior = priorPartnerWith307TradeIn();
  const firewalled = applyNegationScopeFirewall(candidate, { currentMessage: "Solo el efectivo.el auto no", previousState: prior });
  assert.equal(firewalled.extraction.trade_in_intent, "no");
  assert.equal(firewalled.result.applied, true);
  assert.ok(firewalled.result.evidence.includes("explicit_parent_trade_in_rejection"));
});

test("Family Q2 - 2: canonical explicit rejection 'No entrego el auto' overrides stale yes", () => {
  const candidate = { ...emptySemanticExtraction(), trade_in_intent: "yes" };
  const firewalled = applyNegationScopeFirewall(candidate, { currentMessage: "No entrego el auto", previousState: priorPartnerWith307TradeIn() });
  assert.equal(firewalled.extraction.trade_in_intent, "no");
});

test("Family Q2 - 3 (negative control): generic disagreement about cuotas must not clear trade-in", () => {
  const candidate = { ...emptySemanticExtraction(), trade_in_intent: "yes" };
  const firewalled = applyNegationScopeFirewall(candidate, { currentMessage: "No, las cuotas están muy altas", previousState: priorPartnerWith307TradeIn() });
  assert.equal(firewalled.extraction.trade_in_intent, "yes");
  assert.equal(firewalled.result.applied, false);
});

test("Family Q2 - 4 (exact contamination shape): contextual Partner reconstructed from history on 'Las cuotas?' cannot materialize trade_in_vehicle", () => {
  const raw = {
    ...emptySemanticExtraction(),
    query_intent: "installment_offer",
    trade_in_intent: "yes",
    vehicle_mentions: [{
      literal: "Partner",
      brand_text: "Peugeot",
      model_text: "Partner",
      version_text: null,
      role: "trade_in",
      certainty: "contextual",
      evidence: [
        { source_message_id: "m-current", literal: "Las cuotas?" },
        { source_message_id: "m-prev", literal: "Gracias por contar con 12 millones y tu Peugeot 307... la Partner..." },
      ],
    }],
  };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: { id: "m-current", text: "Las cuotas?" } });
  assert.equal(engineExtraction.extracted_fields.trade_in_vehicle, undefined);
});

test("Family Q2 - 5 (positive control): a trade-in named by the current customer turn still materializes normally", () => {
  const raw = {
    ...emptySemanticExtraction(),
    trade_in_intent: "yes",
    vehicle_mentions: [{
      literal: "Peugeot 307 2006",
      brand_text: "Peugeot",
      model_text: "307",
      version_text: null,
      role: "trade_in",
      certainty: "contextual",
      evidence: [{ source_message_id: "m-current", literal: "Tengo un Peugeot 307 2006" }],
    }],
  };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: { id: "m-current", text: "Tengo un Peugeot 307 2006" } });
  assert.deepEqual(engineExtraction.extracted_fields.trade_in_vehicle, { brand: "Peugeot", model: "307" });
});

test("Family Q2 - 6 (end-to-end exact correction): cash + 'el auto no' makes has_trade_in=no and stops every trade-in follow-up", () => {
  const prior = priorPartnerWith307TradeIn();
  const candidate = { ...emptySemanticExtraction(), purchase_mode_statement: "cash", trade_in_intent: "yes" };
  const currentMessage = { id: "m-current", text: "Solo el efectivo.el auto no" };
  const firewalled = applyNegationScopeFirewall(candidate, { currentMessage: currentMessage.text, previousState: prior });
  const engineExtraction = semanticExtractionToEngine(firewalled.extraction, { current_message: currentMessage });
  const result = runFilterV1Integration({
    lead: {},
    conversation_control: { mode: "ai" },
    catalog,
    campaigns: [],
    bank_offers: [],
    previous_filter_state: prior,
    expected_state_version: 0,
    current_extraction: engineExtraction,
  });
  assert.equal(result.next_state.purchase_mode.value, "cash");
  assert.equal(result.next_state.has_trade_in.value, "no");
  assert.ok(!String(result.response_plan?.next_filter_question ?? "").startsWith("trade_in_"));
  assert.ok(!Object.keys(result.next_state.commercial_profile.components).some(key => key.startsWith("trade_in_")));
});

test("Family Q2 - 7 (state protection): unrelated short question cannot replace the canonical 307 with target Partner", () => {
  const prior = priorPartnerWith307TradeIn();
  const raw = {
    ...emptySemanticExtraction(),
    query_intent: "installment_offer",
    trade_in_intent: "yes",
    vehicle_mentions: [{
      literal: "Partner",
      brand_text: "Peugeot",
      model_text: "Partner",
      version_text: null,
      role: "trade_in",
      certainty: "contextual",
      evidence: [
        { source_message_id: "m-current", literal: "Las cuotas?" },
        { source_message_id: "m-prev", literal: "La cuota de la Partner..." },
      ],
    }],
  };
  const currentMessage = { id: "m-current", text: "Las cuotas?" };
  const engineExtraction = semanticExtractionToEngine(raw, { current_message: currentMessage });
  const result = runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns: [], bank_offers: [],
    previous_filter_state: prior, expected_state_version: 0, current_extraction: engineExtraction,
  });
  assert.equal(result.next_state.trade_in_vehicle.model.value, "307");
  assert.equal(result.next_state.trade_in_vehicle.year.value, "2006");
  assert.equal(result.next_state.trade_in_vehicle.km.value, 200000);
});
