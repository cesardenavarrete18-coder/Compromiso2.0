import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const migration = readFileSync(new URL("../supabase/migrations/20260903202218_protocol_advisory_layer.sql", import.meta.url), "utf8");
const canonicalMigration = readFileSync(new URL("../supabase/migrations/20260903133015_unify_canonical_next_action.sql", import.meta.url), "utf8");
const sellerRlsMigration = readFileSync(new URL("../supabase/migrations/20260815120000_lead_crm_agenda.sql", import.meta.url), "utf8");
const agendaSource = readFileSync(new URL("../vendedores/agenda-model.js", import.meta.url), "utf8");
const followUpSource = readFileSync(new URL("../vendedores/supervisor/followup-model.js", import.meta.url), "utf8");
const sellerCrm = readFileSync(new URL("../vendedores/crm.js", import.meta.url), "utf8");
const sellerHtml = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");
const recalls = readFileSync(new URL("../vendedores/recalls.js", import.meta.url), "utf8");
const sales = readFileSync(new URL("../vendedores/sales.js", import.meta.url), "utf8");

function loadModel(source, property) {
  const context = { Intl, Date };
  context.globalThis = context;
  runInNewContext(source, context);
  return context[property];
}

const agenda = loadModel(agendaSource, "grupoSurAgendaModel");
const followUp = loadModel(followUpSource, "grupoSurFollowUpModel");
const before = "2026-09-03T16:55:00-03:00";
const after = "2026-09-03T17:05:00-03:00";
const task = { id: "task-1", status: "pending", due_start: "2026-09-03T17:00:00-03:00", due_end: "2026-09-03T19:00:00-03:00", channel: "call", call_attempt: 1 };

function lead(status = "nuevo", action = {}) {
  return {
    id: "lead-1",
    assigned_seller_user_id: "seller-a",
    assigned_at: "2026-09-03T15:00:00-03:00",
    crm: { status, next_contact_at: null, next_contact_note: "", next_contact_source: null, ...action }
  };
}

function functionBody(name) {
  const start = migration.indexOf(`create or replace function ${name}`);
  const next = migration.indexOf("create or replace function ", start + 1);
  return migration.slice(start, next < 0 ? migration.length : next);
}

test("1. Nuevo con recomendación a las 17 permanece en Nuevos por atender", () => {
  assert.equal(agenda.agendaBucket(lead("nuevo"), before), "new");
  assert.equal(agenda.protocolRecommendation(lead("nuevo"), task, before).past, false);
});

test("2. Nuevo con recomendación pasada permanece en Nuevos por atender", () => {
  assert.equal(agenda.agendaBucket(lead("nuevo"), after), "new");
  assert.equal(agenda.protocolRecommendation(lead("nuevo"), task, after).past, true);
});

test("3. una recomendación nunca convierte un Nuevo en Contacto vencido", () => {
  assert.notEqual(agenda.agendaBucket(lead("nuevo"), after), "overdue");
});

test("4. crear y sincronizar protocolo no escribe lead_crm.next_contact", () => {
  ["private.create_lead_contact_sequence", "private.sync_protocol_next_action"].forEach((name) => {
    const body = functionBody(name);
    assert.ok(body);
    assert.doesNotMatch(body, /update public\.lead_crm/i);
    assert.doesNotMatch(body, /insert into public\.lead_crm/i);
  });
});

test("5. No respondió promueve una recomendación sin crear agenda manual", () => {
  assert.ok(canonicalMigration.includes("p_outcome = 'no_answer' and status = 'nuevo'"));
  assert.ok(canonicalMigration.includes("v_next_task_id := private.sync_protocol_next_action"));
  assert.doesNotMatch(functionBody("private.sync_protocol_next_action"), /(update|insert into) public\.lead_crm/i);
});

test("6. WhatsApp enviado promueve una recomendación sin crear agenda manual", () => {
  assert.ok(canonicalMigration.includes("v_task.channel = 'whatsapp' and p_outcome = 'no_answer'"));
  assert.ok(canonicalMigration.includes("p_outcome not in ('no_answer', 'answered', 'sent'"));
  assert.doesNotMatch(functionBody("private.sync_protocol_next_action"), /next_contact_source/);
});

test("7. Respondió cancela protocolo y crea únicamente agenda manual", () => {
  assert.ok(canonicalMigration.includes("perform private.cancel_lead_contact_protocol(v_task.lead_id"));
  assert.ok(canonicalMigration.includes("next_contact_source = 'manual'"));
  assert.ok(sellerCrm.includes("p_note: note"));
  assert.ok(sellerCrm.includes("p_next_contact_note: note"));
});

test("8. gestión manual cancela protocolo y conserva su agenda", () => {
  assert.ok(canonicalMigration.includes("perform private.cancel_lead_contact_protocol(p_lead_id, 'Gestión manual registrada')"));
  assert.ok(canonicalMigration.includes("next_contact_source = case when p_status in ('desistir', 'invalido') or p_next_contact_at is null then null else 'manual' end"));
});

test("9. próxima acción manual pasada clasifica Vencido", () => {
  assert.equal(agenda.agendaBucket(lead("en_proceso", { next_contact_at: "2026-09-03T16:00:00-03:00", next_contact_source: "manual" }), after), "overdue");
});

test("10. próxima acción manual futura de hoy clasifica Programados para hoy", () => {
  assert.equal(agenda.agendaBucket(lead("en_proceso", { next_contact_at: "2026-09-03T18:00:00-03:00", next_contact_source: "manual" }), before), "today");
});

test("11. próxima acción manual de otro día clasifica Próximos contactos", () => {
  assert.equal(agenda.agendaBucket(lead("en_proceso", { next_contact_at: "2026-09-04T10:00:00-03:00", next_contact_source: "manual" }), before), "upcoming");
});

test("12. no_contesta con protocolo queda recomendado y no Vencido", () => {
  const current = lead("no_contesta");
  assert.equal(agenda.agendaBucket(current, after), "unscheduled");
  assert.equal(agenda.belongsToRecommendedSection(current, task, after), true);
  const labelBody = sellerCrm.match(/function recommendationLabel[\s\S]*?\n  }/)?.[0] || "";
  assert.ok(labelBody.includes("Recomendado pendiente"));
  assert.ok(!labelBody.includes("Vencido"));
});

test("13. Supervisor ignora protocolo para Vencida Hoy y Próxima", () => {
  const current = lead("no_contesta");
  const derived = followUp.deriveFollowUpStatus(current, { management_count: 1, next_task_id: task.id, next_task_due_start: task.due_start, next_task_channel: "call", next_task_call_attempt: 1 }, after);
  assert.equal(derived.key, "unscheduled");
  assert.equal(derived.nextAction, null);
  assert.equal(derived.protocolRecommendation.source, "protocol_recommendation");
});

test("14. Supervisor mantiene Sin gestión para Nuevo con protocolo", () => {
  const derived = followUp.deriveFollowUpStatus(lead("nuevo"), { management_count: 0, next_task_id: task.id, next_task_due_start: task.due_start, next_task_channel: "call", next_task_call_attempt: 1 }, after);
  assert.equal(derived.key, "unmanaged");
});

test("15. Sin primer contacto continúa usando la dimensión histórica del backend", () => {
  const derived = followUp.deriveFollowUpStatus(lead("no_contesta"), { management_count: 2, without_first_contact: true }, after);
  assert.equal(derived.withoutFirstContact, true);
});

test("16. reasignación preserva la agenda manual y no crea protocolo paralelo", () => {
  const creator = functionBody("private.create_lead_contact_sequence");
  assert.ok(creator.includes("v_manual_action"));
  assert.ok(creator.includes("v_manual_action is not null"));
  assert.ok(functionBody("private.start_contact_sequence_after_assignment").includes("private.create_lead_contact_sequence"));
});

test("17. reasignación sin agenda puede iniciar protocolo recomendado", () => {
  const assignment = functionBody("private.start_contact_sequence_after_assignment");
  assert.ok(assignment.includes("Lead reasignado a otro vendedor"));
  assert.ok(assignment.includes("greatest(coalesce(new.assigned_at, now()), now())"));
});

test("18. restart rechaza agenda manual y no modifica CRM", () => {
  const restart = functionBody("public.restart_lead_contact_sequence");
  assert.ok(restart.includes("v_next_contact_at is not null"));
  assert.ok(restart.includes("no se puede reiniciar el protocolo"));
  assert.doesNotMatch(restart, /update public\.lead_crm/i);
});

test("19. En proceso cancela el protocolo", () => {
  const statusSync = functionBody("private.sync_contact_sequence_with_status");
  assert.ok(statusSync.includes("new.status not in ('nuevo', 'no_contesta')"));
  assert.ok(statusSync.includes("private.cancel_lead_contact_protocol"));
});

test("20. comentarios independientes no afectan agenda", () => {
  assert.ok(sellerCrm.includes('rpc("add_lead_comment"'));
  assert.ok(!migration.includes("create or replace function public.add_lead_comment"));
});

test("21. Completadas hoy conserva intentos reales del protocolo", () => {
  assert.match(migration, /task\.status in \('completed', 'skipped'\)/);
  assert.match(migration, /task\.completed_at at time zone 'America\/Argentina\/Buenos_Aires'/);
});

test("22. Rellamados queda intacto", () => {
  assert.ok(recalls.includes('rpc("record_recall_attempt"'));
  assert.ok(!migration.includes("record_recall_attempt"));
});

test("23. Datero queda intacto", () => {
  assert.ok(sellerHtml.includes('id="applicationForm"'));
  assert.ok(sellerCrm.includes('origin: "crm_lead"'));
});

test("24. Desistir queda intacto", () => {
  assert.ok(canonicalMigration.includes("cold_base_at = case when p_status = 'desistir' then now()"));
  assert.ok(!migration.includes("create or replace function public.record_lead_follow_up"));
});

test("25. Mis Ventas y Presupuestos quedan intactos", () => {
  assert.ok(sales.includes("loadSales"));
  assert.ok(sales.includes("loadQuotes"));
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.sales_cases/i);
});

test("26. RLS vendedor A/B permanece intacta", () => {
  assert.ok(!migration.match(/disable row level security/i));
  assert.ok(!migration.match(/drop policy/i));
  assert.match(sellerRlsMigration, /assigned_seller_user_id = \(select auth\.uid\(\)\)/);
});
