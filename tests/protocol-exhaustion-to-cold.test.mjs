import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260914190000_protocol_exhaustion_to_cold.sql",
  "utf8",
);

test("truthful skipped calls count as protocol exhaustion without fabricating contact", () => {
  assert.match(migration, /task\.status = 'completed' and task\.outcome = 'no_answer'/i);
  assert.match(migration, /task\.status = 'skipped' and task\.outcome = 'skipped'/i);
  assert.match(migration, /evidence\.answered_count = 0/i);
  assert.match(migration, /evidence\.cancelled_count = 0/i);
});

test("current 18-call protocol and immediate legacy 6-call protocol are recognized", () => {
  assert.match(migration, /evidence\.call_count = 18[\s\S]*evidence\.protocol_band_count = 9/i);
  assert.match(migration, /evidence\.call_count = 6[\s\S]*evidence\.whatsapp_count = 2/i);
  assert.doesNotMatch(migration, /evidence\.call_count = 3/i);
});

test("exhaustion cannot override human commercial progress", () => {
  assert.match(migration, /crm\.status in \('nuevo', 'no_contesta'\)/i);
  assert.match(migration, /crm\.next_contact_at is null/i);
  assert.match(migration, /crm\.interview_at is null/i);
  assert.match(migration, /crm\.deposit_at is null/i);
  assert.match(migration, /crm\.sale_confirmation_status = 'none'/i);
  assert.match(migration, /not exists \([\s\S]*public\.sales_cases/i);
});

test("completed recognized sequences centrally transition the CRM card to Base fria", () => {
  assert.match(migration, /lead_contact_sequences_classify_exhausted/i);
  assert.match(migration, /new\.status = 'completed'/i);
  assert.match(migration, /status = 'desistir'/i);
  assert.match(migration, /status_reason = 'No contactado post protocolo'/i);
  assert.match(migration, /cold_base_at = coalesce\(v_completed_at, now\(\)\)/i);
});

test("task-result RPC no longer rejects a completed sequence merely because some windows were skipped", () => {
  const rpc = migration.match(/create or replace function public\.record_contact_task_result[\s\S]*?\n\$\$;/i)?.[0] || "";
  assert.match(rpc, /public\.complete_contact_task/i);
  assert.doesNotMatch(rpc, /18 llamadas \/ 9 franjas/i);
  assert.doesNotMatch(rpc, /raise exception 'La secuencia finalizada/i);
});

test("historical exhausted rows are reconciled and recall timing is anchored to protocol completion", () => {
  assert.match(migration, /protocol_exhaustion_backfill/i);
  assert.match(migration, /available_at = least\(available_at, \$1 \+ interval '15 days'\)/i);
  assert.match(migration, /to_regclass\('public\.lead_recall_items'\)/i);
});
