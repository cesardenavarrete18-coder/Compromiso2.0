import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260914152500_protocol_clock_metrics_strict.sql", "utf8");
const strictUi = readFileSync("vendedores/supervisor/supervisor-protocol-strict.js", "utf8");
const followup = readFileSync("vendedores/supervisor/followup-model.js", "utf8");

test("expired unfinished protocol work is skipped immediately at due_end", () => {
  assert.match(migration, /task\.status in \('pending', 'scheduled'\)[\s\S]*task\.due_end <= now\(\)/i);
  assert.doesNotMatch(migration, /v_future_task_exists/i);
  assert.doesNotMatch(migration, /v_current_window_start/i);
  assert.match(migration, /status = 'skipped'/i);
  assert.match(migration, /outcome = 'skipped'/i);
});

test("automatic misses are system activity and never seller management", () => {
  assert.match(migration, /v_sequence\.lead_id,\s*null,\s*'follow_up'/i);
  assert.match(migration, /'origin', 'protocol_clock'/i);
  assert.match(migration, /metadata ->> 'origin'[\s\S]*<> 'protocol_clock'/i);
  assert.match(migration, /metadata ->> 'reason'[\s\S]*<> 'window_expired_without_recorded_attempt'/i);
});

test("completed today counts real completed tasks but excludes skipped tasks", () => {
  const completedTaskBlock = migration.match(/left join lateral \(\s*select bool_or\([\s\S]*?\) completed_task on true/i)?.[0] || "";
  assert.match(completedTaskBlock, /task\.status = 'completed'/i);
  assert.doesNotMatch(completedTaskBlock, /task\.status in \('completed', 'skipped'\)/i);
});

test("protocol performance exposes skipped calls and omitted percentage", () => {
  assert.match(migration, /skipped_calls bigint/i);
  assert.match(migration, /omitted_pct numeric/i);
  assert.match(migration, /task\.status = 'skipped'/i);
  assert.match(migration, /100\.0 \* rollup\.skipped_calls \/ rollup\.due_calls/i);
});

test("Supervisor strict module refreshes the clock before loading metrics", () => {
  const refreshIndex = strictUi.indexOf('rpc("refresh_due_contact_protocols")');
  const portfolioIndex = strictUi.indexOf('rpc("get_supervisor_portfolio_followup_v2")');
  assert.ok(refreshIndex >= 0);
  assert.ok(portfolioIndex > refreshIndex);
  assert.match(strictUi, /protocol_call_skipped_today/);
  assert.match(strictUi, /intento omitido hoy/);
  assert.match(strictUi, /omitidas/);
});

test("Supervisor loader cache-busts operational code and loads strict module", () => {
  assert.match(followup, /supervisor-operational\.js\?v=20260914-2/);
  assert.match(followup, /supervisor-protocol-strict\.js\?v=20260914-1/);
});
