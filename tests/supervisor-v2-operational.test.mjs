import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260912110000_supervisor_v2_operational_metrics.sql", "utf8");
const operational = readFileSync("vendedores/supervisor/supervisor-operational.js", "utf8");
const followup = readFileSync("vendedores/supervisor/followup-model.js", "utf8");

test("Supervisor V2 adds an additive portfolio read model without replacing the legacy RPC", () => {
  assert.match(migration, /create or replace function public\.get_supervisor_portfolio_followup_v2\(\)/i);
  assert.match(migration, /from public\.get_supervisor_portfolio_followup\(\) base/i);
  assert.match(migration, /seller_user_id uuid/i);
  assert.match(migration, /protocol_sequence_id uuid/i);
  assert.match(migration, /next_task_due_end timestamptz/i);
  assert.match(migration, /protocol_current_call_attempt integer/i);
  assert.match(migration, /protocol_exhausted boolean/i);
});

test("protocol performance measures seller calls that actually became due", () => {
  assert.match(migration, /create or replace function public\.get_supervisor_protocol_performance/i);
  assert.match(migration, /task\.channel = 'call'/i);
  assert.match(migration, /task\.due_end <= least\(sequence\.terminal_at, now\(\)\)/i);
  assert.match(migration, /task\.completed_at <= task\.due_end/i);
  assert.match(migration, /compliance_pct numeric/i);
  assert.match(migration, /on_time_pct numeric/i);
});

test("both operational RPCs are restricted to management and authenticated execution", () => {
  assert.equal((migration.match(/private\.current_user_is_management\(\)/g) || []).length, 2);
  assert.match(migration, /revoke all on function public\.get_supervisor_portfolio_followup_v2\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.get_supervisor_portfolio_followup_v2\(\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.get_supervisor_protocol_performance\(date, date\) from public, anon/i);
});

test("Supervisor operational UI separates protocol urgency from management urgency", () => {
  assert.match(operational, /En protocolo/);
  assert.match(operational, /Protocolo vencido/);
  assert.match(operational, /Protocolo agotado/);
  assert.match(operational, /Gestión vencida/);
  assert.match(operational, /next_task_due_end/);
  assert.match(operational, /operational_status === "entrevista"/);
  assert.match(operational, /operational_status === "sena"/);
});

test("seller cards expose protocol compliance and on-time performance", () => {
  assert.match(operational, /get_supervisor_protocol_performance/);
  assert.match(operational, /cumplimiento/);
  assert.match(operational, /en horario/);
  assert.match(operational, /seller_user_id/);
});

test("lead inbox gets explicit qualification and priority filters without inventing temperature", () => {
  assert.match(operational, /Calificación IA/);
  assert.match(operational, /qualified/);
  assert.match(operational, /follow_up/);
  assert.match(operational, /unqualified/);
  assert.match(operational, /Prioridad/);
  assert.match(operational, /Prioridad baja/);
  assert.match(operational, /Hot \/ Warm \/ Cold · próximamente/);
  assert.doesNotMatch(operational, /commercial_temperature\s*=/);
});

test("manual lead copy reflects the current 18-call, 9-band protocol", () => {
  assert.match(operational, /18 llamadas en 9 franjas comerciales/);
  assert.match(operational, /lunes a sábado/);
  assert.doesNotMatch(operational, /programará automáticamente los siete intentos/);
});

test("operational module is browser-only loaded from the Supervisor follow-up model", () => {
  assert.match(followup, /typeof window !== "undefined" && typeof document !== "undefined"/);
  assert.match(followup, /supervisor-operational\.js\?v=20260912-1/);
});
