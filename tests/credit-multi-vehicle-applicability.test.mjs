import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const coreSource = fs.readFileSync(path.join(root, "vendedores", "credit-applicability-core.js"), "utf8");
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(coreSource, sandbox);
const core = sandbox.globalThis.grupoSurCreditApplicability;

test("multi-model credit applies only through linked active versions", () => {
  const offer = {
    id: "credit-1",
    model_id: null,
    versions: [
      { version: { id: "polo-track", model_id: "polo", name: "Track", active: true } },
      { version: { id: "tera-trend", model_id: "tera", name: "Trend", active: true } },
      { version: { id: "tera-old", model_id: "tera", name: "Archivada", active: false } }
    ]
  };
  assert.equal(core.offerAppliesToModel(offer, "polo"), true);
  assert.equal(core.offerAppliesToModel(offer, "tera"), true);
  assert.equal(core.offerAppliesToModel(offer, "nivus"), false);
  assert.deepEqual(Array.from(core.activeVersionsForModel(offer, "tera"), v => v.id), ["tera-trend"]);
});

test("model selection is a snapshot of current active versions", () => {
  const models = [{ id: "polo", name: "Polo" }, { id: "tera", name: "Tera" }];
  const versions = [
    { id: "p1", model_id: "polo", active: true },
    { id: "p2", model_id: "polo", active: true },
    { id: "p-old", model_id: "polo", active: false },
    { id: "t1", model_id: "tera", active: true }
  ];
  const groups = core.groupSelectedVersions(models, versions, new Set(["p1", "p2"]));
  assert.equal(groups[0].allSelected, true);
  assert.equal(groups[0].selectedCount, 2);
  assert.equal(groups[1].selectedCount, 0);
});

test("migration keeps legacy anchor nullable and RPC security-invoker", () => {
  const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260909130000_bank_credit_multi_vehicle_applicability.sql"), "utf8");
  assert.match(migration, /alter column model_id drop not null/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /private\.current_user_is_admin\(\)/i);
  assert.match(migration, /revoke all on function public\.admin_upsert_bank_credit_offer/i);
  assert.match(migration, /grant execute on function public\.admin_upsert_bank_credit_offer[\s\S]*to authenticated/i);
});

test("seller and admin adapters filter applicability by version model_id", () => {
  const seller = fs.readFileSync(path.join(root, "vendedores", "credit-multi-vehicle-seller.js"), "utf8");
  const admin = fs.readFileSync(path.join(root, "vendedores", "credit-multi-vehicle-admin.js"), "utf8");
  assert.match(seller, /offerAppliesToModel\(offer, modelId\)/);
  assert.match(seller, /model_id: model\.id/);
  assert.match(admin, /admin_upsert_bank_credit_offer/);
  assert.match(admin, /p_version_ids: Array\.from\(state\.selectedVersionIds\)/);
});
