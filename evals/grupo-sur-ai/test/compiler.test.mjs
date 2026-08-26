import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { compileGoldenDataset } from "../src/golden-compiler.mjs";

test("compila exactamente los 100 casos congelados contra matriz 1.4", async () => {
  const dataset = await compileGoldenDataset(resolve(import.meta.dirname, "../golden_dataset_ia_comercial_grupo_sur_v1.md"));
  assert.equal(dataset.cases.length, 100);
  assert.equal(new Set(dataset.cases.map((item) => item.eval_id)).size, 100);
  assert.equal(dataset.cases[0].eval_id, "GSV1-001");
  assert.equal(dataset.cases.at(-1).eval_id, "GSV1-100");
  assert.ok(dataset.cases.every((item) => item.matrix_version === "1.4"));
  assert.ok(dataset.cases.every((item) => item.runtime_input?.text));
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
});
