import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// public.supervisor_manage_lead (live definition last touched by
// 20260903133015_unify_canonical_next_action.sql) still carried CRM V1
// behavior. This forward-only migration hardens it in place; these tests pin
// the 11 invariants from the audit against the new migration's SQL text, the
// same way the rest of this suite verifies RPC bodies without a live DB.
const migration = readFileSync(
  new URL("../supabase/migrations/20260909140100_supervisor_manage_lead_v2_hardening.sql", import.meta.url),
  "utf8"
);

test("1/10. Supervisor jamás setea cold_base_at: es exclusivo del agotamiento automático del protocolo", () => {
  const statusUpdate = migration.slice(
    migration.indexOf("if p_action = 'status' then"),
    migration.indexOf("if p_status = 'desistir' and p_desist_reason = 'requested_no_contact'")
  );
  assert.doesNotMatch(statusUpdate, /cold_base_at\s*=/, "the status-change UPDATE must never assign cold_base_at, on desistir or invalido alike");
  assert.match(migration, /Base fría is exclusively the automatic protocol-exhaustion signal/);
});

test("2. Toda transición de Supervisor respeta private.crm_transition_allowed", () => {
  assert.match(migration, /if not private\.crm_transition_allowed\(v_crm\.status, p_status\) then/);
  assert.match(migration, /raise exception 'Transición comercial no permitida: % → %', v_crm\.status, p_status;/);
});

test("3. Seña sólo puede permanecer, pasar a Venta o Desistir (delegado a crm_transition_allowed, no reimplementado)", () => {
  // The RPC does not special-case sena's allowed targets itself; it defers to
  // the single canonical matrix so the two paths can never disagree.
  assert.doesNotMatch(migration, /p_status\s*=\s*'sena'\s*and\s*v_crm\.status\s*not in/);
  const statusBranch = migration.slice(migration.indexOf("if p_action = 'status' then"));
  const transitionCheckIndex = statusBranch.indexOf("crm_transition_allowed");
  assert.ok(transitionCheckIndex > -1 && transitionCheckIndex < statusBranch.indexOf("update public.lead_crm set"));
});

test("4. Sin contacto (no_contesta) no exige next_contact_at manual", () => {
  const statusBranch = migration.slice(migration.indexOf("if p_action = 'status' then"), migration.indexOf("-- Legacy free-text"));
  assert.doesNotMatch(statusBranch, /p_status = 'no_contesta'[\s\S]{0,80}p_next_contact_at is null/);
});

test("5. Entrar a Sin contacto limpia la agenda manual y asegura el protocolo canónico", () => {
  assert.match(migration, /if p_status = 'no_contesta' then perform private\.cancel_lead_contact_protocol/);
  assert.match(migration, /next_contact_at = case when p_status in \('invalido', 'desistir', 'no_contesta'\) then null/);
  assert.match(migration, /if p_status = 'no_contesta' then\s*\n\s*if private\.create_lead_contact_sequence\(p_lead_id, v_seller, now\(\)\) is null then/);
});

test("6. 'schedule' rechaza mezclar agenda manual con un Lead en Sin contacto (no cancela el protocolo en su lugar)", () => {
  const scheduleBranch = migration.slice(migration.indexOf("if p_action = 'schedule' then"), migration.indexOf("if p_action = 'status' then"));
  assert.match(scheduleBranch, /if v_crm\.status = 'no_contesta' then\s*\n\s*raise exception 'El Lead está en Sin contacto/);
  const rejectIndex = scheduleBranch.indexOf("raise exception 'El Lead está en Sin contacto");
  const cancelIndex = scheduleBranch.indexOf("cancel_lead_contact_protocol");
  assert.ok(rejectIndex < cancelIndex, "the no_contesta rejection must happen before any cancel_lead_contact_protocol call in schedule");
});

test("7. Desistir manual exige un motivo estructurado válido (misma enumeración que las RPC del vendedor)", () => {
  assert.match(migration, /if p_status = 'desistir' and p_desist_reason is null then\s*\n\s*raise exception 'Seleccioná el motivo del desistimiento';/);
  assert.match(migration, /'no_interest', 'conditions_not_viable', 'chose_other_option',\s*\n\s*'postponed_without_date', 'requested_no_contact', 'other'/);
});

test("8. requested_no_contact aplica el opt-out real del Lead", () => {
  assert.match(migration, /if p_status = 'desistir' and p_desist_reason = 'requested_no_contact' then\s*\n\s*perform private\.apply_lead_opt_out\(p_lead_id, trim\(coalesce\(p_note, ''\)\)\);/);
});

test("9. Inválido nunca genera Base fría (mismo SET clause que Desistir, sin cold_base_at)", () => {
  const statusUpdate = migration.slice(migration.indexOf("update public.lead_crm set", migration.indexOf("if p_action = 'status' then")), migration.indexOf("if p_status = 'desistir' and p_desist_reason = 'requested_no_contact'"));
  assert.match(statusUpdate, /status_reason = case when p_status in \('invalido', 'desistir'\) then trim\(p_note\)/);
  assert.doesNotMatch(statusUpdate, /cold_base_at\s*=/);
});

test("10. La gestión legacy ('management') falla cerrado ante un 'answered' desde Nuevo/Sin contacto en vez de inventar un resultado", () => {
  const legacyBranch = migration.slice(migration.indexOf("-- Legacy free-text"));
  assert.match(legacyBranch, /if v_crm\.status in \('nuevo', 'no_contesta'\) and p_contact_outcome = 'answered' then\s*\n\s*raise exception/);
  assert.doesNotMatch(legacyBranch, /status = 'en_proceso'/);
});

test("11. La gestión legacy no cancela el protocolo activo de forma indiscriminada", () => {
  const legacyBranch = migration.slice(migration.indexOf("-- Legacy free-text"));
  assert.ok(!legacyBranch.includes("cancel_lead_contact_protocol"), "the legacy management branch must never touch the protocol, unconditionally or otherwise");
  assert.match(legacyBranch, /if v_crm\.status = 'no_contesta' and p_next_contact_at is not null then\s*\n\s*raise exception 'El Lead está en Sin contacto/);
});

test("12. El nuevo parámetro p_desist_reason reemplaza la firma previa de 8 parámetros sin ambigüedad en PostgREST", () => {
  assert.match(migration, /drop function if exists public\.supervisor_manage_lead\(uuid, text, text, text, text, timestamptz, text, text\);/);
  assert.match(migration, /p_desist_reason text default null/);
  assert.match(migration, /revoke all on function public\.supervisor_manage_lead\(uuid, text, text, text, text, timestamptz, text, text, text\) from public, anon;/);
  assert.match(migration, /grant execute on function public\.supervisor_manage_lead\(uuid, text, text, text, text, timestamptz, text, text, text\) to authenticated;/);
});

test("13. La migración no toca RLS y notifica a PostgREST para recargar el esquema", () => {
  assert.ok(!migration.match(/alter table .* disable row level security/i));
  assert.ok(!migration.match(/drop policy/i));
  assert.match(migration, /notify pgrst, 'reload schema';/);
});
