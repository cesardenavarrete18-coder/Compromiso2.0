import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260908120000_crm_v2_protocol_hardening.sql", import.meta.url), "utf8");
const crm = readFileSync(new URL("../vendedores/crm.js", import.meta.url), "utf8");

function rpc(name, end) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, name);
  return migration.slice(start, migration.indexOf(end || "revoke all on function", start));
}

test("Sin contacto is protocol-driven and idempotently guarantees CRM V2", () => {
  const followUp = rpc("record_lead_follow_up");
  const future = rpc("start_no_contact_protocol_from_future");
  assert.match(followUp, /p_status in \('contacto_futuro', 'en_proceso', 'cierre', 'sena'\) and p_next_contact_at is null/);
  assert.doesNotMatch(followUp, /p_status in \('no_contesta', 'contacto_futuro'[^\n]*p_next_contact_at is null/);
  assert.ok(followUp.includes("next_contact_at = case when p_status in ('no_contesta', 'desistir', 'invalido') then null"));
  assert.ok(followUp.includes("if p_status = 'no_contesta' then"));
  assert.match(followUp, /private\.create_lead_contact_sequence\(p_lead_id, v_seller, now\(\)\)/);
  assert.match(future, /status = 'no_contesta'[\s\S]*next_contact_source = null/);
  assert.match(future, /private\.create_lead_contact_sequence\(p_lead_id, v_seller, now\(\)\)/);
  assert.ok(crm.includes('field.hidden = terminalStatus || protocolStatus'));
  assert.doesNotMatch(crm, /status === "no_contesta" && !nextContact/);
});

test("generic completion is internal, cannot record answered, and cannot classify Base fria", () => {
  const complete = rpc("complete_contact_task");
  const wrapper = rpc("complete_contact_task_with_follow_up");
  const result = rpc("record_contact_task_result");
  assert.ok(migration.includes("revoke all on function public.complete_contact_task(uuid, text, text) from public, anon, authenticated"));
  for (const generic of [complete, wrapper, result]) {
    assert.ok(generic.includes("Una respuesta requiere record_contact_answer_with_transition"));
  }
  for (const generic of [complete, wrapper]) {
    assert.doesNotMatch(generic, /cold_base_at = now\(\)|'segment', 'base_fria'|6 llamadas|Protocolo completado sin respuesta/);
  }
  assert.match(complete, /cold_base_at = null/);
  for (const terminalField of [
    "previous_status = v_previous_status",
    "terminal_at = now()",
    "next_contact_at = null",
    "next_contact_note = ''",
    "next_contact_source = null",
    "cold_base_at = null"
  ]) assert.ok(complete.includes(terminalField), terminalField);
  assert.match(complete, /select status into v_previous_status[\s\S]*for update/);
  assert.doesNotMatch(wrapper, /v_lead_id|v_next_note|next_contact_at\s*=|next_contact_note\s*=/);
  assert.ok(wrapper.includes("return public.complete_contact_task(p_task_id, p_outcome, p_note)"));
  assert.ok(crm.includes('p_next_contact_at: null, p_next_contact_note: ""'));
  assert.ok(crm.includes('rpc("record_contact_answer_with_transition"'));
});

test("only verified canonical exhaustion classifies Base fria exactly once", () => {
  const result = rpc("record_contact_task_result");
  assert.match(result, /count\(\*\) filter \(where channel = 'call'\) = 18/);
  assert.match(result, /count\(distinct \(protocol_day, protocol_band\)\) filter \(where channel = 'call'\) = 9/);
  assert.match(result, /status = 'completed' and outcome = 'no_answer'\) = 18/);
  assert.match(result, /and cold_base_at is null[\s\S]*returning lead_id into v_classified_lead_id/);
  assert.equal((migration.match(/cold_base_at = now\(\)/g) || []).length, 1);
  assert.equal((migration.match(/'segment', 'base_fria'/g) || []).length, 1);
  assert.doesNotMatch(migration, /6 llamadas|Protocolo completado sin respuesta/);
});

test("E2E fixture covers all pre-main protocol invariants", () => {
  const fixture = readFileSync(new URL("./crm-v2-contact-answer.integration.sql", import.meta.url), "utf8");
  for (const assertion of [
    "Nuevo -> no_contesta must not require a manual next contact",
    "entering no_contesta repeatedly must keep exactly one active sequence",
    "no_contesta must use the 18-call, 9-band, 2-WhatsApp protocol",
    "contacto_futuro without answer must enter no_contesta with one canonical protocol",
    "no_interest must desist terminally, preserve previous status, and avoid Base fria",
    "requested_no_contact must desist terminally, preserve previous status, and opt out without Base fria",
    "Invalid must be terminal, preserve previous status, and avoid Base fria",
    "partial protocol completion must not create Base fria",
    "Base fría requires all 18 canonical calls without answer",
    "only completed canonical protocol emits one Base fría activity"
  ]) assert.ok(fixture.includes(assertion), assertion);
  assert.ok(fixture.includes("expected non-atomic answered rejection"));
});
