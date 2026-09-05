import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const webhook = readFileSync(
  new URL("../supabase/functions/whatsapp-webhook/index.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/20260905173149_rename_volkswagen_polo_model.sql", import.meta.url),
  "utf8",
);

test("WhatsApp canonicalizes Volkswagen Polo without the Robust suffix", () => {
  assert.ok(webhook.includes('["volkswagen polo", "Volkswagen Polo"]'));
  assert.ok(!webhook.includes('["volkswagen polo", "Volkswagen Polo Robust"]'));
});

test("the migration renames the stable catalog row and rejects a duplicate Polo", () => {
  assert.ok(migration.includes("model.name = 'Polo Robust'"));
  assert.ok(migration.includes("model.name = 'Polo'"));
  assert.ok(migration.includes("name = 'Polo'"));
  assert.ok(migration.includes("a different Volkswagen Polo row already exists"));
  assert.ok(!migration.includes("delete from public.models"));
  assert.ok(!migration.includes("insert into public.models"));
});

test("structured CRM fields are normalized and human-authored history is preserved", () => {
  for (const table of [
    "public.leads",
    "public.commercial_applications",
    "public.sales_quotes",
    "public.lead_crm",
    "public.lead_sale_requests",
    "public.sales_cases",
  ]) {
    assert.ok(migration.includes(`update ${table}`), table);
  }

  assert.ok(!migration.includes("update public.lead_activities"));
  assert.ok(!migration.includes("update public.sales_notifications"));
});
