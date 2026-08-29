import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const modelSource = readFileSync(new URL("../vendedores/supervisor/followup-model.js", import.meta.url), "utf8");
const supervisor = readFileSync(new URL("../vendedores/supervisor/supervisor.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../vendedores/supervisor/index.html", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260828211336_supervisor_portfolio_followup.sql", import.meta.url), "utf8");
const sellerCrm = readFileSync(new URL("../vendedores/crm.js", import.meta.url), "utf8");
const sellerHtml = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");
const recalls = readFileSync(new URL("../vendedores/supervisor/lead-bases.js", import.meta.url), "utf8");

const context = { Intl, Date };
context.globalThis = context;
runInNewContext(modelSource, context);
const model = context.grupoSurFollowUpModel;
const now = "2026-08-28T15:00:00-03:00";

function lead(overrides = {}) {
  return {
    id: "lead-1",
    customer_name: "Cliente Prueba",
    customer_phone: "1155555555",
    model_interest: "Peugeot 208",
    intent_summary: "Consulta comercial",
    assigned_seller_user_id: "seller-1",
    assigned_at: "2026-08-28T10:00:00-03:00",
    priority: "normal",
    crm: { status: "nuevo", priority: "normal", next_contact_at: null, next_contact_note: "", next_contact_source: null },
    ...overrides
  };
}

function summary(overrides = {}) {
  return { management_count: 1, first_management_at: "2026-08-28T11:00:00-03:00", first_effective_contact_at: "2026-08-28T11:00:00-03:00", completed_today: false, ...overrides };
}

test("1. Lead asignado sin actividades queda Sin gestión registrada", () => {
  const result = model.deriveFollowUpStatus(lead(), summary({ management_count: 0, first_management_at: null, first_effective_contact_at: null }), now);
  assert.equal(result.key, "unmanaged");
  assert.equal(result.withoutManagement, true);
});

test("2. Lead con gestión pero sin contacto conserva la dimensión Sin primer contacto", () => {
  const result = model.deriveFollowUpStatus(lead(), summary({ first_effective_contact_at: null }), now);
  assert.equal(result.withoutFirstContact, true);
  assert.equal(result.withoutManagement, false);
});

test("3. Próxima acción pasada queda Vencida", () => {
  const result = model.deriveFollowUpStatus(lead({ crm: { status: "en_proceso", next_contact_at: "2026-08-28T13:00:00-03:00", next_contact_note: "Llamar", next_contact_source: "manual" } }), summary(), now);
  assert.equal(result.key, "overdue");
});

test("4. Acción del día queda Hoy usando Buenos Aires", () => {
  const result = model.deriveFollowUpStatus(lead({ crm: { status: "en_proceso", next_contact_at: "2026-08-28T18:00:00-03:00", next_contact_note: "Enviar propuesta", next_contact_source: "manual" } }), summary(), now);
  assert.equal(result.key, "today");
  assert.equal(model.TIME_ZONE, "America/Argentina/Buenos_Aires");
});

test("5. Acción posterior a hoy queda Próxima", () => {
  const result = model.deriveFollowUpStatus(lead(), summary({ next_task_due_start: "2026-08-29T10:00:00-03:00", next_task_channel: "call", next_task_call_attempt: 2 }), now);
  assert.equal(result.key, "upcoming");
  assert.equal(result.nextAction.source, "protocol");
});

test("6. Lead trabajado sin acción queda Sin próxima acción", () => {
  const result = model.deriveFollowUpStatus(lead({ crm: { status: "en_proceso", priority: "normal" } }), summary(), now);
  assert.equal(result.key, "unscheduled");
});

test("7. filtro por vendedor", () => {
  const entry = model.deriveFollowUpStatus(lead(), summary({ management_count: 0 }), now);
  assert.equal(model.matchesFilters(lead(), entry, { seller: "seller-1", historical: false }), true);
  assert.equal(model.matchesFilters(lead(), entry, { seller: "seller-2", historical: false }), false);
});

test("8. filtro por estado comercial", () => {
  const current = lead({ crm: { status: "entrevista", priority: "high" } });
  const derived = model.deriveFollowUpStatus(current, summary(), now);
  assert.equal(model.matchesFilters(current, derived, { status: "entrevista", historical: false }), true);
  assert.equal(model.matchesFilters(current, derived, { status: "cierre", historical: false }), false);
});

test("9. filtro por prioridad", () => {
  const current = lead({ crm: { status: "en_proceso", priority: "high" } });
  const derived = model.deriveFollowUpStatus(current, summary(), now);
  assert.equal(model.matchesFilters(current, derived, { priority: "high", historical: false }), true);
});

test("10. filtro por situación de seguimiento", () => {
  const current = lead({ crm: { status: "en_proceso", next_contact_at: "2026-08-28T13:00:00-03:00", next_contact_note: "Llamar", next_contact_source: "manual" } });
  const derived = model.deriveFollowUpStatus(current, summary(), now);
  assert.equal(model.matchesFilters(current, derived, { situation: "overdue", historical: false }), true);
  assert.equal(model.matchesFilters(current, derived, { situation: "today", historical: false }), false);
});

test("11. filtros vendedor + estado + situación se combinan", () => {
  const current = lead({ crm: { status: "en_proceso", priority: "normal", next_contact_at: "2026-08-28T13:00:00-03:00", next_contact_note: "Llamar", next_contact_source: "manual" } });
  const derived = model.deriveFollowUpStatus(current, summary(), now);
  assert.equal(model.matchesFilters(current, derived, { seller: "seller-1", status: "en_proceso", situation: "overdue", historical: false }), true);
  assert.equal(model.matchesFilters(current, derived, { seller: "seller-1", status: "cierre", situation: "overdue", historical: false }), false);
});

test("12. Supervisor puede abrir el detalle completo del Lead", () => {
  assert.ok(html.includes('id="leadSupervisionOverview"'));
  assert.ok(supervisor.includes("renderLeadSupervisionOverview(lead)"));
  assert.ok(supervisor.includes("loadLeadSupervisionHistory(lead)"));
});

test("13. Supervisor puede agregar comentario", () => {
  assert.ok(html.includes('id="supervisorCommentSave"'));
  assert.ok(supervisor.includes('rpc("add_lead_comment"'));
});

test("14. Supervisor puede programar próxima acción", () => {
  assert.ok(supervisor.includes('runSupervisorManagement("schedule"'));
  assert.ok(migration.includes("p_next_contact_at is null or p_next_contact_at <= now()"));
  assert.ok(migration.includes("'Próxima acción programada'"));
});

test("15. Supervisor puede reprogramar conservando el valor anterior", () => {
  assert.ok(migration.includes("'Próxima acción reprogramada'"));
  assert.ok(migration.includes("'previous_next_contact_at', v_crm.next_contact_at"));
});

test("16. Toda acción del Supervisor queda atribuida", () => {
  assert.ok(migration.includes("v_user_id uuid := (select auth.uid())"));
  assert.ok(migration.includes("p_lead_id,\n      v_user_id"));
  assert.ok(supervisor.includes('role + " · " + (actor.full_name'));
});

test("17. Historial anterior se conserva", () => {
  assert.ok(!migration.match(/delete\s+from\s+public\.lead_activities/i));
  assert.ok(!migration.match(/update\s+public\.lead_activities/i));
  assert.ok(supervisor.includes('.order("created_at", { ascending: false }).limit(150)'));
});

test("18. Vendedor continúa viendo y gestionando sus Leads", () => {
  assert.ok(sellerCrm.includes("async function saveManagement()"));
  assert.ok(sellerCrm.includes('rpc("record_lead_follow_up"'));
  assert.ok(sellerHtml.includes('id="crmSaveManagement"'));
});

test("19. Protocolo de contacto sigue funcionando y alimenta la cartera", () => {
  assert.ok(sellerCrm.includes('rpc("complete_contact_task_with_follow_up"'));
  assert.ok(migration.includes("from public.lead_contact_tasks task"));
  assert.ok(modelSource.includes('sourceLabel: "PROTOCOLO"'));
});

test("20. Rellamados no se modifica", () => {
  assert.ok(recalls.includes('rpc("assign_recall_items"'));
  assert.ok(recalls.includes('rpc("review_seller_lead_submission"'));
});

test("21. Flujo de Datero no se modifica", () => {
  assert.ok(sellerCrm.includes('window.grupoSurCommercialApplication.open({ origin: "crm_lead"'));
  assert.ok(sellerHtml.includes('id="applicationForm"'));
});

test("22. Aprobación de ventas continúa intacta", () => {
  assert.ok(supervisor.includes('rpc("review_lead_sale"'));
  assert.ok(html.includes('id="saleApproveButton"'));
});

test("23. KPIs adicionales aclaran que pueden superponerse con Activos", () => {
  assert.ok(html.includes("Sin primer contacto” y “Completadas hoy” pueden superponerse"));
  assert.ok(html.includes("los KPIs no necesariamente suman el total de Activos"));
});
