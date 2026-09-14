import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-normalizer.mjs";
import { semanticExtractionToEngine } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-engine-adapter.mjs";
import { emptySemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-contract.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";
import { createFilterState, deriveCommercialProfile, field } from "../../../supabase/functions/_shared/filter-v1/contracts.mjs";

// Family S (structural plumbing, post-Family-R, PR #77 merged as d0ba356): two known defects
// that block commercial_profile from ever being reachable, even though deriveCommercialProfile
// and handoff-policy themselves are untouched and correct.

const catalog = {
  brands: [{ id: "b-peugeot", name: "Peugeot" }],
  models: [{ id: "m-208", name: "208", brand_id: "b-peugeot" }, { id: "m-408", name: "408", brand_id: "b-peugeot" }],
  model_versions: [],
};
const prov = { source: "test_fixture", evidence: null };

function customerTurn(text, id = "m-current") {
  return { id, text };
}
function assistantQuestion(text, id = "m-prev") {
  return { id, role: "assistant", text };
}
function runTurn(previousResultOrState, extraction, campaigns = []) {
  const previous_filter_state = previousResultOrState?.next_state ?? previousResultOrState ?? undefined;
  const expected_state_version = previousResultOrState?.next_state?.state_version ?? 0;
  return runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog, campaigns, bank_offers: [],
    previous_filter_state, expected_state_version, current_extraction: extraction,
  });
}
function priorTarget(modelId, modelName) {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: modelId, model: modelName }, "known", prov);
  return state;
}

// =====================================================================================
// S1 — trade_in_vehicle.version vs trade_in_vehicle.variant
// =====================================================================================

function tradeInTurn(fields, text) {
  const raw = { ...emptySemanticExtraction(), trade_in_intent: "yes", trade_in_vehicle: fields };
  return semanticExtractionToEngine(raw, { current_message: customerTurn(text) });
}
function known(value, literal) {
  return { value, status: "known", evidence: [{ source_message_id: "m-current", literal }] };
}

test("Family S1.1 (critical): provider version=known('Allure') materializes as state.trade_in_vehicle.variant, never a parallel 'version' field", () => {
  const engineExtraction = tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("208", "208"),
    version: known("Allure", "Allure"), year: known("2019", "2019"),
  }, "Peugeot 208 Allure 2019");
  const result = runTurn(undefined, engineExtraction);
  assert.equal(result.next_state.trade_in_vehicle.variant.status, "known");
  assert.equal(result.next_state.trade_in_vehicle.variant.value, "Allure");
  assert.equal(result.next_state.trade_in_vehicle.version, undefined, "state must never carry a parallel 'version' field alongside 'variant'");
});

test("Family S1.2: 'No se que version es' materializes variant as explicitly_unknown", () => {
  const engineExtraction = tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("208", "208"),
    version: { value: null, status: "explicitly_unknown", evidence: [{ source_message_id: "m-current", literal: "no se que version es" }] },
  }, "Peugeot 208, no se que version es");
  const result = runTurn(undefined, engineExtraction);
  assert.equal(result.next_state.trade_in_vehicle.variant.status, "explicitly_unknown");
  assert.equal(result.next_state.trade_in_vehicle.version, undefined);
});

test("Family S1.3: no version mentioned at all leaves variant missing", () => {
  const engineExtraction = tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("208", "208"),
  }, "Peugeot 208");
  const result = runTurn(undefined, engineExtraction);
  assert.equal(result.next_state.trade_in_vehicle.variant.status, "missing");
  assert.equal(result.next_state.trade_in_vehicle.version, undefined);
});

test("Family S1.4: brand/model/year/km alongside version all materialize normally, version enters as variant", () => {
  const engineExtraction = tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("208", "208"), version: known("Allure", "Allure"),
    year: known("2019", "2019"), mileage_km: known(90000, "90.000 km"),
  }, "Peugeot 208 Allure 2019, 90.000 km");
  const result = runTurn(undefined, engineExtraction);
  assert.equal(result.next_state.trade_in_vehicle.brand.value, "Peugeot");
  assert.equal(result.next_state.trade_in_vehicle.model.value, "208");
  assert.equal(result.next_state.trade_in_vehicle.variant.value, "Allure");
  assert.equal(result.next_state.trade_in_vehicle.year.value, "2019");
  assert.equal(result.next_state.trade_in_vehicle.km.value, 90000);
});

test("Family S1.5 (Family R3 protection): switching vehicle after variant is known discards the old variant", () => {
  const turn1 = runTurn(undefined, tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("208", "208"), version: known("Allure", "Allure"),
    year: known("2019", "2019"), mileage_km: known(90000, "90.000 km"),
  }, "Peugeot 208 Allure 2019, 90.000 km"));
  assert.equal(turn1.next_state.trade_in_vehicle.variant.value, "Allure");

  const turn2 = runTurn(turn1, tradeInTurn({
    brand: known("Peugeot", "Peugeot"), model: known("408", "408"), year: known("2013", "2013"),
  }, "Tengo un Peugeot 408 2013 para entregar"));
  assert.equal(turn2.next_state.trade_in_vehicle.model.value, "408");
  assert.equal(turn2.next_state.trade_in_vehicle.year.value, "2013");
  assert.equal(turn2.next_state.trade_in_vehicle.variant.status, "missing", "the 208's Allure variant must not survive as the 408's variant");
  assert.equal(turn2.next_state.trade_in_vehicle.km.status, "missing");
});

test("Family S1.6 (reachability, deriveCommercialProfile untouched): a fully-informed trade-in resolves trade_in_variant=known", () => {
  const state = createFilterState();
  state.has_trade_in = field("yes", "known", prov);
  state.trade_in_vehicle.brand = field("Peugeot", "known", prov);
  state.trade_in_vehicle.model = field("208", "known", prov);
  state.trade_in_vehicle.variant = field("Allure", "known", prov);
  state.trade_in_vehicle.year = field("2019", "known", prov);
  state.trade_in_vehicle.km = field(90000, "known", prov);
  const profile = deriveCommercialProfile(state);
  assert.equal(profile.components.trade_in_variant, "known");
});

test("Family S1.7 (reachability, deriveCommercialProfile untouched): a fully-informed cash + trade-in profile is complete", () => {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: "m-208", model: "208" }, "known", prov);
  state.purchase_mode = field("cash", "known", prov);
  state.has_trade_in = field("yes", "known", prov);
  state.trade_in_vehicle.brand = field("Peugeot", "known", prov);
  state.trade_in_vehicle.model = field("208", "known", prov);
  state.trade_in_vehicle.variant = field("Allure", "known", prov);
  state.trade_in_vehicle.year = field("2019", "known", prov);
  state.trade_in_vehicle.km = field(90000, "known", prov);
  const profile = deriveCommercialProfile(state);
  assert.equal(profile.complete, true);
});

// =====================================================================================
// S2 — purchase_mode declaration vs query
// =====================================================================================

function normalizePurchaseMode(rawStatement, currentText, previousText, queryIntent) {
  const candidate = { ...emptySemanticExtraction(), purchase_mode_statement: rawStatement, query_intent: queryIntent ?? "none" };
  const input = { current_message: customerTurn(currentText), recent_conversation: previousText ? [assistantQuestion(previousText)] : [] };
  return normalizeSemanticExtraction(candidate, input);
}

test("Family S2.1 (critical): 'Lo voy a financiar. Cuanto me queda la cuota?' survives as financed despite co-occurring installment query", () => {
  const { extraction } = normalizePurchaseMode("financed", "Lo voy a financiar. Cuanto me queda la cuota?", null, "installment_offer");
  assert.equal(extraction.purchase_mode_statement, "financed");
});

test("Family S2.2 (critical): 'Lo compro al contado. Cuanto sale?' survives as cash despite co-occurring price query", () => {
  const { extraction } = normalizePurchaseMode("cash", "Lo compro al contado. Cuanto sale?", null, "model_value");
  assert.equal(extraction.purchase_mode_statement, "cash");
});

test("Family S2.3 (critical, hallucination): '¿Se puede financiar?' must stay not_present even if the provider proposes financed", () => {
  const { extraction } = normalizePurchaseMode("financed", "Se puede financiar?", null, "installment_offer");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

test("Family S2.4 (critical, hallucination): '¿Que cuota tiene?' must stay not_present even if the provider proposes financed", () => {
  const { extraction } = normalizePurchaseMode("financed", "Que cuota tiene?", null, "installment_offer");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

test("Family S2.5 (critical, hallucination): '¿Cuanto sale de contado?' must stay not_present even if the provider proposes cash", () => {
  const { extraction } = normalizePurchaseMode("cash", "Cuanto sale de contado?", null, "model_value");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

test("Family S2.6 (critical, hypothetical): 'Si lo financiara, cuanto pagaria?' must stay not_present", () => {
  const { extraction } = normalizePurchaseMode("financed", "Si lo financiara, cuanto pagaria?", null, "installment_offer");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

test("Family S2.7 (critical, indecision): 'No se si contado o financiado' must NOT resolve as known", () => {
  const { extraction } = normalizePurchaseMode("financed", "No se si contado o financiado", null, "none");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

test("Family S2.7b (indecision variants): 'Estoy entre contado y financiacion' / 'Capaz financiado' must NOT resolve as known", () => {
  for (const text of ["Estoy entre contado y financiacion", "Capaz financiado"]) {
    const { extraction } = normalizePurchaseMode("financed", text, null, "none");
    assert.equal(extraction.purchase_mode_statement, "not_present", `expected not_present for: ${text}`);
  }
});

const PURCHASE_MODE_QUESTION = "Lo vas a hacer de contado o financiado?";

test("Family S2.8 (critical, contextual): assistant asks contado-o-financiado, customer answers 'Financiado' -> financed", () => {
  const { extraction } = normalizePurchaseMode("not_present", "Financiado", PURCHASE_MODE_QUESTION, "none");
  assert.equal(extraction.purchase_mode_statement, "financed");
});

test("Family S2.9 (critical, contextual): assistant asks contado-o-financiado, customer answers 'Contado' -> cash", () => {
  const { extraction } = normalizePurchaseMode("not_present", "Contado", PURCHASE_MODE_QUESTION, "none");
  assert.equal(extraction.purchase_mode_statement, "cash");
});

test("Family S2.10 (critical, correction): prior state financed, 'Mejor lo pago al contado' switches to cash", () => {
  const state = priorTarget("m-208", "208");
  state.purchase_mode = field("financed", "known", prov);
  const raw = { ...emptySemanticExtraction(), query_intent: "none", purchase_mode_statement: "not_present" };
  const engineExtraction = semanticExtractionToEngine(
    normalizeSemanticExtraction(raw, { current_message: customerTurn("Mejor lo pago al contado") }).extraction,
    { current_message: customerTurn("Mejor lo pago al contado") },
  );
  const result = runTurn(state, engineExtraction);
  assert.equal(result.next_state.purchase_mode.value, "cash");
});

test("Family S2.11 (critical, persistence): prior state financed, '¿Que motor trae?' must NOT erase it", () => {
  const state = priorTarget("m-208", "208");
  state.purchase_mode = field("financed", "known", prov);
  const raw = { ...emptySemanticExtraction(), query_intent: "technical_question", purchase_mode_statement: "not_present" };
  const engineExtraction = semanticExtractionToEngine(
    normalizeSemanticExtraction(raw, { current_message: customerTurn("Que motor trae?") }).extraction,
    { current_message: customerTurn("Que motor trae?") },
  );
  const result = runTurn(state, engineExtraction);
  assert.equal(result.next_state.purchase_mode.value, "financed", "an unrelated turn with no new declaration must not reset a persisted purchase_mode");
});

test("Family S2.12 (critical): 'Lo voy a financiar. Que motor trae?' still resolves financed despite the technical question", () => {
  const { extraction } = normalizePurchaseMode("financed", "Lo voy a financiar. Que motor trae?", null, "technical_question");
  assert.equal(extraction.purchase_mode_statement, "financed");
});

test("Family S2.13 (interest is not a decision): 'Me interesa saber la financiacion' must NOT resolve as financed", () => {
  const { extraction } = normalizePurchaseMode("financed", "Me interesa saber la financiacion", null, "installment_offer");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

test("Family S2.14 (interest is not a decision): 'Quiero saber que financiacion tienen' must NOT resolve as financed", () => {
  const { extraction } = normalizePurchaseMode("financed", "Quiero saber que financiacion tienen", null, "installment_offer");
  assert.equal(extraction.purchase_mode_statement, "not_present");
});

// =====================================================================================
// Family S integrated — end-to-end reachability of commercial_profile.complete
// =====================================================================================

test("Family S integrated - 1: cash, no trade-in, no financing sub-fields needed -> complete", () => {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: "m-208", model: "208" }, "known", prov);
  state.purchase_mode = field("cash", "known", prov);
  state.has_trade_in = field("no", "known", prov);
  const profile = deriveCommercialProfile(state);
  assert.equal(profile.complete, true);
});

test("Family S integrated - 2: financed, no trade-in, down payment + installment capacity known -> complete", () => {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: "m-208", model: "208" }, "known", prov);
  state.purchase_mode = field("financed", "known", prov);
  state.down_payment_amount = field(5000000, "known", prov);
  state.monthly_installment_capacity = field(300000, "known", prov);
  state.has_trade_in = field("no", "known", prov);
  const profile = deriveCommercialProfile(state);
  assert.equal(profile.complete, true);
});

test("Family S integrated - 3: cash, complete trade-in (brand/model/variant/year/km known) -> complete", () => {
  const state = createFilterState();
  state.target_model = field({ brand_id: "b-peugeot", brand: "Peugeot", model_id: "m-208", model: "208" }, "known", prov);
  state.purchase_mode = field("cash", "known", prov);
  state.has_trade_in = field("yes", "known", prov);
  state.trade_in_vehicle.brand = field("Peugeot", "known", prov);
  state.trade_in_vehicle.model = field("208", "known", prov);
  state.trade_in_vehicle.variant = field("Allure", "known", prov);
  state.trade_in_vehicle.year = field("2019", "known", prov);
  state.trade_in_vehicle.km = field(90000, "known", prov);
  const profile = deriveCommercialProfile(state);
  assert.equal(profile.complete, true);
});
