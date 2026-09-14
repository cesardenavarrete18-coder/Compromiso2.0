import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260912153500_protocol_clock_advance_and_truthful_misses.sql", import.meta.url), "utf8");
const agenda = readFileSync(new URL("../vendedores/agenda-model.js", import.meta.url), "utf8");

test("seller task loading prioritizes every unfinished protocol task instead of the oldest 3500 rows", () => {
  assert.match(agenda, /ACTIVE_TASK_STATUSES = \["pending", "scheduled"\]/);
  assert.match(agenda, /\.in\("status", ACTIVE_TASK_STATUSES\)/);
  assert.match(agenda, /\.range\(offset, offset \+ TASK_PAGE_SIZE - 1\)/);
  assert.match(agenda, /loadActiveSequenceContext/);
  assert.match(agenda, /\.in\("sequence_id", chunk\)/);
  assert.doesNotMatch(agenda, /\.order\("due_start", \{ ascending: true \}\)\.limit\(3500\)/);
});

test("seller refreshes the protocol clock before reading task state", () => {
  assert.match(agenda, /rpc\("refresh_due_contact_protocols"\)/);
  assert.match(agenda, /var refreshError = await refreshProtocolClock\(client\)/);
  assert.match(agenda, /missingRefreshRpc/);
});

test("protocol advancement never rewrites original due windows", () => {
  const syncStart = migration.indexOf("create or replace function private.sync_protocol_next_action");
  const refreshStart = migration.indexOf("create or replace function public.refresh_due_contact_protocols");
  const sync = migration.slice(syncStart, refreshStart);
  assert.match(sync, /set status = 'pending'/);
  assert.doesNotMatch(sync, /set[\s\S]*due_start\s*=/i);
  assert.doesNotMatch(sync, /set[\s\S]*due_end\s*=/i);
  assert.doesNotMatch(sync, /next_protocol_call_window/);
  assert.doesNotMatch(sync, /next_protocol_whatsapp_window/);
});

test("expired predecessor tasks become truthful skipped work, never synthetic no-answer", () => {
  assert.match(migration, /status = 'skipped'/);
  assert.match(migration, /outcome = 'skipped'/);
  assert.match(migration, /No realizada: ventana vencida/);
  assert.match(migration, /performed_at = null/);
  assert.match(migration, /task\.due_end < v_current_window_start/);
  assert.match(migration, /task\.due_start <= now\(\)[\s\S]*task\.due_end >= now\(\)/);
  assert.doesNotMatch(migration, /outcome\s*=\s*'no_answer'/);
});

test("final missed work closes only the protocol sequence and does not fabricate Base fria", () => {
  assert.match(migration, /Calendario finalizado con intentos no realizados/);
  assert.match(migration, /update public\.lead_contact_sequences/);
  assert.doesNotMatch(migration, /cold_base_at\s*=\s*now\(\)/);
  assert.doesNotMatch(migration, /status\s*=\s*'desistir'/);
});

test("refresh RPC is authenticated-only and seller scoped unless management", () => {
  assert.match(migration, /private\.current_user_active\(\)/);
  assert.match(migration, /v_is_management or sequence\.seller_user_id = v_user_id/);
  assert.match(migration, /revoke all on function public\.refresh_due_contact_protocols\(\) from public, anon/);
  assert.match(migration, /grant execute on function public\.refresh_due_contact_protocols\(\) to authenticated/);
});
