import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const migration = readFileSync(new URL("../supabase/migrations/20260903133015_unify_canonical_next_action.sql", import.meta.url), "utf8");
const modelSource = readFileSync(new URL("../vendedores/supervisor/followup-model.js", import.meta.url), "utf8");
const sellerCrm = readFileSync(new URL("../vendedores/crm.js", import.meta.url), "utf8");
const sellerHtml = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");
const supervisor = readFileSync(new URL("../vendedores/supervisor/supervisor.js", import.meta.url), "utf8");
const reassignment = readFileSync(new URL("../supabase/migrations/20260901131303_supervisor_portfolio_reassignment.sql", import.meta.url), "utf8");
const datero = readFileSync(new URL("../vendedores/app.js", import.meta.url), "utf8");
const recalls = readFileSync(new URL("../vendedores/recalls.js", import.meta.url), "utf8");
const sales = readFileSync(new URL("../vendedores/sales.js", import.meta.url), "utf8");

const context = { Intl, Date };
context.globalThis = context;
runInNewContext(modelSource, context);
const model = context.grupoSurFollowUpModel;
const now = "2026-09-03T15:00:00-03:00";

function lead(crm) {
  return {
    id: "lead-test",
    assigned_seller_user_id: "seller-test",
    assigned_at: "2026-09-03T10:00:00-03:00",
    customer_name: "Cliente sintético",
    crm
  };
}

function summary(overrides = {}) {
  return { management_count: 1, completed_today: false, ...overrides };
}

test("1. una gestión manual cancela explícitamente el protocolo anterior", () => {
  assert.ok(migration.includes("perform private.cancel_lead_contact_protocol(p_lead_id, 'Gestión manual registrada')"));
  assert.ok(migration.includes("and status in ('pending', 'scheduled')"));
});

test("2. la nueva acción manual es la única acción canónica", () => {
  const current = lead({ status: "en_proceso", next_contact_at: "2026-09-04T16:00:00-03:00", next_contact_note: "Volver a llamar", next_contact_source: "manual" });
  const derived = model.deriveFollowUpStatus(current, summary({ next_task_due_start: "2026-09-01T10:00:00-03:00", next_task_channel: "call", next_task_call_attempt: 1 }), now);
  assert.equal(derived.key, "upcoming");
  assert.equal(derived.nextAction.at, "2026-09-04T16:00:00-03:00");
  assert.equal(derived.nextAction.source, "manual");
});

test("3. el comentario independiente sigue usando su RPC documental", () => {
  assert.ok(sellerCrm.includes('rpc("add_lead_comment"'));
  assert.ok(supervisor.includes('rpc("add_lead_comment"'));
  assert.ok(!migration.includes("create or replace function public.add_lead_comment"));
});

test("4. comment no cuenta como gestión comercial", () => {
  assert.match(migration, /activity_type not in \('comment', 'assignment', 'manual_creation'\)/);
});

test("5. comment no cuenta como Completada hoy", () => {
  const exclusions = migration.match(/activity_type not in \('comment', 'assignment', 'manual_creation'\)/g) || [];
  assert.ok(exclusions.length >= 2);
});

test("6. una acción manual vencida determina Vencida", () => {
  const derived = model.deriveFollowUpStatus(
    lead({ status: "en_proceso", next_contact_at: "2026-09-03T14:00:00-03:00", next_contact_note: "Llamar", next_contact_source: "manual" }),
    summary(),
    now
  );
  assert.equal(derived.key, "overdue");
});

test("7. Llamada 1 sin respuesta activa WhatsApp 1", () => {
  assert.ok(migration.includes("if v_call_attempt in (1, 4) then"));
  assert.ok(migration.includes("v_next_task_id := private.sync_protocol_next_action"));
  assert.ok(migration.includes("and task.status = 'scheduled'"));
});

test("8. WhatsApp 1 enviado avanza a la llamada siguiente", () => {
  assert.ok(migration.includes("if v_task.channel = 'whatsapp' and p_outcome = 'no_answer'"));
  assert.ok(migration.includes("where task.sequence_id = p_sequence_id"));
  assert.ok(migration.includes("order by task.sequence_order"));
});

test("9. las llamadas de media tarde y tarde usan los helpers canónicos", () => {
  assert.ok(migration.includes("private.contact_window_start(v_day, v_slot)"));
  assert.ok(migration.includes("private.contact_window_end(v_day, v_slot)"));
  assert.ok(migration.includes("elsif v_local::time < time '16:00'"));
  assert.ok(migration.includes("elsif v_local::time < time '19:00'"));
});

test("10. el protocolo avanza por seis franjas comerciales válidas", () => {
  assert.ok(migration.includes("for v_call_attempt in 1..6 loop"));
  assert.ok(migration.includes("v_cursor := v_call_end + interval '1 second'"));
});

test("11. el protocolo nuevo tiene exactamente 6 llamadas y 2 WhatsApp", () => {
  assert.ok(migration.includes("for v_call_attempt in 1..6 loop"));
  assert.ok(migration.includes("if v_call_attempt in (1, 4) then"));
  assert.ok(sellerCrm.includes("6 llamadas · 2 WhatsApp"));
});

test("12. WhatsApp aparece solo tras la primera llamada de cada bloque diario", () => {
  assert.match(migration, /v_call_attempt in \(1, 4\)/);
  assert.ok(!migration.includes("v_call_attempt in (2, 3, 5, 6)"));
});

test("13. cliente responde y el protocolo restante se cancela", () => {
  assert.ok(migration.includes("p_outcome in ('answered', 'invalid', 'no_interest', 'requested_no_contact')"));
  assert.ok(migration.includes("when 'answered' then 'El cliente respondió'"));
});

test("14. una respuesta con próxima fecha deja source manual", () => {
  assert.ok(migration.includes("next_contact_source = 'manual'"));
  assert.ok(migration.includes("'manual_follow_up', true"));
});

test("15. un estado terminal queda sin próxima acción", () => {
  assert.ok(migration.includes("crm.status in ('venta', 'desistir', 'invalido')"));
  assert.match(migration, /next_contact_at = null,[\s\S]*next_contact_source = null/);
});

test("16. los pasos futuros no pueden aparecer como vencidos", () => {
  assert.ok(migration.includes("where status = 'pending'"));
  assert.ok(migration.includes("status = 'scheduled'"));
  assert.ok(migration.includes("lead_contact_tasks_one_pending_per_lead_idx"));
});

test("17. una tarea legacy vieja no compite con una gestión posterior", () => {
  const current = lead({ status: "en_proceso", next_contact_at: null, next_contact_note: "", next_contact_source: null });
  const derived = model.deriveFollowUpStatus(current, summary({ next_task_due_start: "2026-09-01T10:00:00-03:00", next_task_channel: "call", next_task_call_attempt: 1 }), now);
  assert.equal(derived.key, "unscheduled");
  assert.equal(derived.nextAction, null);
});

test("18. toda programación automática conserva Buenos Aires y evita el pasado", () => {
  assert.ok(migration.includes("America/Argentina/Buenos_Aires"));
  assert.ok(migration.includes("greatest(coalesce(p_after, now()), now())"));
  assert.equal(model.TIME_ZONE, "America/Argentina/Buenos_Aires");
});

test("19. Supervisor y vendedor leen la misma próxima acción de lead_crm", () => {
  assert.ok(sellerCrm.includes("next_contact_at, next_contact_note, next_contact_source"));
  assert.ok(modelSource.includes("crm.next_contact_source !== \"protocol\""));
  assert.ok(migration.includes("task.due_start = crm.next_contact_at"));
});

test("20. la migración no altera políticas RLS", () => {
  assert.ok(!migration.match(/alter table .* disable row level security/i));
  assert.ok(!migration.match(/drop policy/i));
  assert.ok(migration.includes("security invoker"));
});

test("21. la reasignación Supervisor conserva el reinicio canónico", () => {
  assert.ok(reassignment.includes("private.assign_lead_to_seller_with_reason"));
  assert.ok(migration.includes("create or replace function private.start_contact_sequence_after_assignment"));
  assert.ok(migration.includes("'Lead reasignado a otro vendedor'"));
});

test("22. Datero permanece intacto", () => {
  assert.ok(datero.includes('id="applicationForm"') || sellerHtml.includes('id="applicationForm"'));
  assert.ok(sellerCrm.includes('window.grupoSurCommercialApplication.open({ origin: "crm_lead"'));
});

test("23. Rellamados permanece intacto", () => {
  assert.ok(recalls.includes('rpc("record_recall_attempt"'));
  assert.ok(recalls.includes("grupoSur:recalls-open"));
});

test("24. Mis Ventas y Presupuestos mantienen su aislamiento", () => {
  assert.ok(sales.includes("loadSales"));
  assert.ok(sales.includes("loadQuotes"));
  assert.ok(sales.includes("state.userId"));
});

test("25. Desistir conserva el flujo de base fría", () => {
  assert.ok(migration.includes("cold_base_at = case when p_status = 'desistir' then now()"));
  assert.ok(migration.includes("status = 'desistir'"));
});

test("el formulario ya no duplica el motivo y usa Resultado/comentario", () => {
  assert.ok(!sellerHtml.includes("Motivo del próximo contacto"));
  assert.ok(!sellerHtml.includes('id="crmNextContactNoteInput"'));
  assert.ok(sellerCrm.includes("p_next_contact_note: terminalStatus ? \"\" : note"));
  assert.ok(migration.includes("'Próximo contacto programado'"));
});
