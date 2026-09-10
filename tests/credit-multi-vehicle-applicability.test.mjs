import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const coreSource = fs.readFileSync(path.join(root, "vendedores", "credit-applicability-core.js"), "utf8");
const sandbox = { globalThis: {}, Intl, Date, Set };
vm.createContext(sandbox);
vm.runInContext(coreSource, sandbox);
const core = sandbox.globalThis.grupoSurCreditApplicability;
const migrationPath = path.join(root, "supabase", "migrations", "20260910131500_bank_credit_multi_vehicle_applicability.sql");

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

test("credit validity uses Buenos Aires commercial date instead of UTC", () => {
  assert.equal(core.argentinaDateKey(new Date("2026-09-10T01:30:00.000Z")), "2026-09-09");
  assert.equal(core.argentinaDateKey(new Date("2026-09-10T03:30:00.000Z")), "2026-09-10");
});

test("migration is ordered after CRM V2 and keeps RPC security-invoker", () => {
  assert.equal(fs.existsSync(path.join(root, "supabase", "migrations", "20260909130000_bank_credit_multi_vehicle_applicability.sql")), false);
  assert.equal(fs.existsSync(migrationPath), true);
  const migration = fs.readFileSync(migrationPath, "utf8");
  assert.match(migration, /alter column model_id drop not null/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /private\.current_user_is_admin\(\)/i);
  assert.match(migration, /validate_sales_quote_bank_credit_applicability/i);
  assert.match(migration, /version\.model_id = new\.model_id/i);
  assert.match(migration, /revoke all on function public\.admin_upsert_bank_credit_offer/i);
  assert.match(migration, /grant execute on function public\.admin_upsert_bank_credit_offer[\s\S]*to authenticated/i);
});

test("Postgres rejects inactive, expired or non-applicable bank credit quotes", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");
  assert.match(migration, /join public\.bank_credit_offers offer on offer\.id = link\.offer_id/i);
  assert.match(migration, /join public\.models model on model\.id = version\.model_id/i);
  assert.match(migration, /offer\.active = true/i);
  assert.match(migration, /version\.active = true/i);
  assert.match(migration, /model\.active = true/i);
  assert.match(migration, /America\/Argentina\/Buenos_Aires/i);
  assert.match(migration, /offer\.valid_from is null or offer\.valid_from <= v_today/i);
  assert.match(migration, /offer\.valid_to is null or offer\.valid_to >= v_today/i);
});

test("seller and admin adapters filter applicability by version model_id", () => {
  const seller = fs.readFileSync(path.join(root, "vendedores", "credit-multi-vehicle-seller.js"), "utf8");
  const admin = fs.readFileSync(path.join(root, "vendedores", "credit-multi-vehicle-admin.js"), "utf8");
  assert.match(seller, /offerAppliesToModel\(offer, modelId\)/);
  assert.match(seller, /model_id: model\.id/);
  assert.match(seller, /core\.argentinaDateKey\(new Date\(\)\)/);
  assert.match(admin, /admin_upsert_bank_credit_offer/);
  assert.match(admin, /p_version_ids: Array\.from\(state\.selectedVersionIds\)/);
  assert.match(admin, /sales_quotes[\s\S]*bank_credit_offer_id/);
  assert.match(admin, /update\(\{ active: false \}\)/);
});

test("legacy single-model selector cannot block the multi-model form", () => {
  const loader = fs.readFileSync(path.join(root, "vendedores", "supabase-config.js"), "utf8");
  assert.match(loader, /legacyCreditModel\.required = false/);
  assert.match(loader, /legacyCreditModel\.disabled = true/);
  assert.match(loader, /20260910-1/);
});
