import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { compileGoldenDataset } from "../src/golden-compiler.mjs";
import { validateRuntimeInput } from "../src/production-state-adapter.mjs";

test("compila exactamente los 100 casos congelados contra matriz 1.4", async () => {
  const dataset = await compileGoldenDataset(resolve(import.meta.dirname, "../golden_dataset_ia_comercial_grupo_sur_v1.md"));
  assert.equal(dataset.cases.length, 100);
  assert.equal(new Set(dataset.cases.map((item) => item.eval_id)).size, 100);
  assert.equal(dataset.cases[0].eval_id, "GSV1-001");
  assert.equal(dataset.cases.at(-1).eval_id, "GSV1-100");
  assert.ok(dataset.cases.every((item) => item.matrix_version === "1.4"));
  assert.ok(dataset.cases.every((item) => item.runtime_input?.inbound_message?.event_type !== "customer_message" || item.runtime_input.inbound_message.text));
  assert.ok(dataset.cases.every((item) => item.brand && item.primary_modality));
});

test("GSV1-001 conserva el expected congelado", async () => {
  const dataset = await compileGoldenDataset(resolve(import.meta.dirname, "../golden_dataset_ia_comercial_grupo_sur_v1.md"));
  const item = dataset.cases.find((entry) => entry.eval_id === "GSV1-001");
  assert.equal(item.expected.qualification_status, "follow_up");
  assert.equal(item.expected.commercial_temperature, "warm");
  assert.equal(item.expected.handoff_status, "continue_ai");
  assert.equal(item.expected.commercial_profile_complete, false);
  assert.deepEqual(item.expected.missing_commercial_fields, ["cash_available", "target_installment"]);
  assert.equal(item.expected.next_action, "obtain_cash_available");
  assert.equal(item.runtime_input.existing_model_interest, "Peugeot 208");
  assert.match(item.runtime_input.inbound_message.text, /Financiar/);
  assert.ok(item.runtime_input.known_state_requirements.includes("existing_model_interest"));
});

test("valida las distribuciones canónicas sin inferir metadata desde prosa", async () => {
  const dataset = await compileGoldenDataset(resolve(import.meta.dirname, "../golden_dataset_ia_comercial_grupo_sur_v1.md"));
  const count = (field, value) => dataset.cases.filter((item) => item[field] === value).length;
  assert.deepEqual({ Volkswagen: count("brand", "Volkswagen"), Peugeot: count("brand", "Peugeot"), Fiat: count("brand", "Fiat") }, { Volkswagen: 34, Peugeot: 33, Fiat: 33 });
  assert.deepEqual({
    financing: count("primary_modality", "financing"), savings_plan: count("primary_modality", "savings_plan"),
    cash: count("primary_modality", "cash"), credit: count("primary_modality", "credit"),
    used_plus_financing: count("primary_modality", "used_plus_financing"), neutral_or_unknown: count("primary_modality", "neutral_or_unknown"),
  }, { financing: 45, savings_plan: 8, cash: 6, credit: 8, used_plus_financing: 7, neutral_or_unknown: 26 });
});

test("un caso stateful falla cerrado si el dato conocido no llega al runtime", async () => {
  const dataset = await compileGoldenDataset(resolve(import.meta.dirname, "../golden_dataset_ia_comercial_grupo_sur_v1.md"));
  const input = structuredClone(dataset.cases[0].runtime_input);
  input.existing_model_interest = null;
  assert.throws(() => validateRuntimeInput(input, "GSV1-001"), /STATEFUL_INPUT_NOT_DELIVERED:GSV1-001:existing_model_interest/);
});

test("ningún caso compacto envía la descripción del escenario como mensaje", async () => {
  const dataset = await compileGoldenDataset(resolve(import.meta.dirname, "../golden_dataset_ia_comercial_grupo_sur_v1.md"));
  const compactWithoutQuote = dataset.cases.filter((item) => item.input_fidelity === "compact_case_context_compilation");
  assert.equal(compactWithoutQuote.length, 39);
  assert.ok(compactWithoutQuote.every((item) => item.runtime_input.inbound_message.text !== item.structured_context));
});
