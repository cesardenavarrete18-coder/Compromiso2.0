import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const modelSource = readFileSync(new URL("../vendedores/supervisor/followup-model.js", import.meta.url), "utf8");
const supervisor = readFileSync(new URL("../vendedores/supervisor/supervisor.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../vendedores/supervisor/index.html", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260828211336_supervisor_portfolio_followup.sql", import.meta.url), "utf8");
const noFirstContactMigration = readFileSync(new URL("../supabase/migrations/20260903183940_fix_supervisor_no_first_contact_definition.sql", import.meta.url), "utf8");
const reassignmentMigration = readFileSync(new URL("../supabase/migrations/20260901131303_supervisor_portfolio_reassignment.sql", import.meta.url), "utf8");
const advisoryMigration = readFileSync(new URL("../supabase/migrations/20260903202218_protocol_advisory_layer.sql", import.meta.url), "utf8");
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
  return { management_count: 1, first_management_at: "2026-08-28T11:00:00-03:00", first_effective_contact_at: "2026-08-28T11:00:00-03:00", without_first_contact: false, completed_today: false, ...overrides };
}

test("1. Lead asignado sin actividades queda Sin gestión registrada", () => {
  const result = model.deriveFollowUpStatus(lead(), summary({ management_count: 0, first_management_at: null, first_effective_contact_at: null, without_first_contact: false }), now);
  assert.equal(result.key, "unmanaged");
  assert.equal(result.withoutManagement, true);
  assert.equal(result.withoutFirstContact, false);
});

test("2. Lead con gestión pero sin contacto conserva la dimensión Sin primer contacto", () => {
  const current = lead({ crm: { status: "no_contesta", priority: "normal" } });
  const result = model.deriveFollowUpStatus(current, summary({ first_effective_contact_at: null, without_first_contact: true }), now);
  assert.equal(result.withoutFirstContact, true);
  assert.equal(result.withoutManagement, false);
});

test("2b. El frontend no infiere Sin primer contacto solo por ausencia de contacto efectivo", () => {
  const result = model.deriveFollowUpStatus(lead(), summary({ first_effective_contact_at: null, without_first_contact: false }), now);
  assert.equal(result.withoutFirstContact, false);
});

test("2c. La RPC exige no_contesta, gestión real e historia exclusivamente sin respuesta", () => {
  assert.match(noFirstContactMigration, /crm\.status = 'no_contesta'/);
  assert.match(noFirstContactMigration, /activity\.has_real_management/);
  assert.match(noFirstContactMigration, /activity\.has_disqualifying_history/);
  assert.match(noFirstContactMigration, /item\.metadata ->> 'previous_status'/);
  assert.match(noFirstContactMigration, /'nuevo', 'no_contesta'/);
});

test("2d. answered, En proceso, Entrevista, Cierre, Seña y Venta excluyen para siempre", () => {
  assert.match(noFirstContactMigration, /'no_answer', 'sent', 'skipped'/);
  assert.match(noFirstContactMigration, /'interview', 'sale_request', 'sale_confirmation'/);
  assert.match(noFirstContactMigration, /crm\.interview_at is null/);
  assert.match(noFirstContactMigration, /crm\.deposit_at is null/);
  assert.match(noFirstContactMigration, /crm\.sale_confirmation_status = 'none'/);
});

test("2e. La respuesta legacy inequívoca por WhatsApp se excluye sin interpretar texto libre", () => {
  const exactLegacyMarker = "respuesta recibida por whatsapp";
  assert.ok(noFirstContactMigration.includes(`lower(trim(coalesce(item.title, ''))) = '${exactLegacyMarker}'`));
  assert.ok(noFirstContactMigration.includes(`lower(trim(coalesce(crm.last_contact_outcome, ''))) not in (`));
  assert.match(noFirstContactMigration, new RegExp(`'answered',\\s*'${exactLegacyMarker}'`));
  assert.ok(!noFirstContactMigration.includes("like '%whatsapp%'"));
});

test("2f. Comentarios y reasignaciones no alteran la historia comercial", () => {
  assert.match(noFirstContactMigration, /item\.activity_type <> 'comment'/);
  assert.match(noFirstContactMigration, /not in \('comment', 'assignment', 'manual_creation'\)/);
  assert.ok(!noFirstContactMigration.includes("item.created_at >= lead.assigned_at\n          and item.activity_type not in ('comment', 'assignment', 'manual_creation')\n      ) as has_real_management"));
});

test("2g. Intentos fallidos de llamada y WhatsApp mantienen Sin primer contacto", () => {
  assert.match(noFirstContactMigration, /not in \('', 'no_answer', 'sent', 'skipped'\)/);
  const current = lead({ crm: { status: "no_contesta", priority: "normal" } });
  assert.equal(model.deriveFollowUpStatus(current, summary({ without_first_contact: true }), now).withoutFirstContact, true);
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

test("5. Recomendación posterior no convierte un Lead en Próxima", () => {
  const result = model.deriveFollowUpStatus(
    lead({ crm: { status: "no_contesta", next_contact_at: null, next_contact_note: "", next_contact_source: null } }),
    summary({ next_task_id: "task-2", next_task_due_start: "2026-08-29T10:00:00-03:00", next_task_channel: "call", next_task_call_attempt: 2 }),
    now
  );
  assert.equal(result.key, "unscheduled");
  assert.equal(result.nextAction, null);
  assert.equal(result.protocolRecommendation.source, "protocol_recommendation");
});

test("6. Lead trabajado sin acción queda Sin próxima acción", () => {
  const result = model.deriveFollowUpStatus(lead({ crm: { status: "en_proceso", priority: "normal" } }), summary(), now);
  assert.equal(result.key, "unscheduled");
});

test("6b. metrics incluye el KPI Completadas hoy", () => {
  const activeLead = lead();
  const inactiveLead = lead({ id: "lead-2", crm: { status: "venta", priority: "normal" } });
  const rows = [
    { lead: activeLead, derived: model.deriveFollowUpStatus(activeLead, summary({ completed_today: true }), now) },
    { lead: inactiveLead, derived: model.deriveFollowUpStatus(inactiveLead, summary({ completed_today: true }), now) }
  ];
  assert.equal(model.metrics(rows).completedToday, 1);
  assert.ok(supervisor.includes('["Completadas hoy", kpis.completedToday'));
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

test("19. Protocolo sigue visible como recomendación sin alimentar la agenda", () => {
  assert.ok(sellerCrm.includes('rpc("complete_contact_task_with_follow_up"'));
  assert.ok(migration.includes("from public.lead_contact_tasks task"));
  assert.ok(modelSource.includes('sourceLabel: "RECOMENDADO"'));
  assert.ok(modelSource.includes("return manualAction(lead)"));
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

test("24. Cartera permite seleccionar filas y todos los resultados visibles", () => {
  assert.ok(html.includes('id="portfolioSelectVisible"'));
  assert.ok(html.includes('id="portfolioBulkBar"'));
  assert.ok(supervisor.includes("data-portfolio-select"));
  assert.ok(supervisor.includes("state.visiblePortfolioLeadIds"));
});

test("25. La reasignación masiva exige vendedor activo y motivo", () => {
  assert.ok(html.includes('id="portfolioBulkSeller"'));
  assert.ok(html.includes('id="portfolioBulkReason"'));
  assert.ok(supervisor.includes("Indicá el motivo de la reasignación masiva."));
  assert.ok(reassignmentMigration.includes("role::text = 'seller'"));
  assert.ok(reassignmentMigration.includes("and active = true"));
  assert.ok(reassignmentMigration.includes("Indicá un motivo válido para la reasignación masiva"));
});

test("26. La operación masiva es una única RPC atómica", () => {
  assert.ok(supervisor.includes('rpc("reassign_leads_to_seller"'));
  assert.ok(reassignmentMigration.includes("for update"));
  assert.ok(reassignmentMigration.includes("v_locked_count <> v_expected_count"));
  assert.ok(reassignmentMigration.includes("perform private.assign_lead_to_seller_with_reason"));
  assert.ok(!supervisor.includes('leadIds.forEach(function (leadId)'));
});

test("27. El detalle permite reasignar individualmente con la misma semántica", () => {
  assert.ok(html.includes('id="supervisorReassignSeller"'));
  assert.ok(html.includes('id="supervisorReassignSave"'));
  assert.ok(supervisor.includes("p_lead_ids: [state.activeConversationLead.id]"));
  assert.ok(reassignmentMigration.includes("create or replace function public.assign_lead_to_seller"));
  assert.ok(reassignmentMigration.includes("private.assign_lead_to_seller_with_reason"));
});

test("28. La reasignación registra origen, destino, Supervisor y motivo", () => {
  assert.ok(reassignmentMigration.includes("'previous_seller_user_id', v_previous_seller"));
  assert.ok(reassignmentMigration.includes("'seller_user_id', p_seller_user_id"));
  assert.ok(reassignmentMigration.includes("'supervisor_user_id', p_actor_user_id"));
  assert.ok(reassignmentMigration.includes("'reason', v_reason"));
  assert.ok(reassignmentMigration.includes("Motivo: %s"));
});

test("29. Cambiar assigned_seller_user_id conserva el reinicio canónico del protocolo", () => {
  assert.ok(reassignmentMigration.includes("assigned_seller_user_id = p_seller_user_id"));
  assert.ok(advisoryMigration.includes("Lead reasignado a otro vendedor"));
  assert.ok(advisoryMigration.includes("perform private.create_lead_contact_sequence"));
  assert.ok(advisoryMigration.includes("v_manual_action is not null"));
});

test("30. Al cambiar filtros la selección conserva solo Leads visibles y reasignables", () => {
  const visibleInFilterA = lead({ id: "lead-a" });
  const visibleInFilterB = lead({ id: "lead-b" });
  assert.deepEqual(Array.from(model.pruneSelection(["lead-a"], [visibleInFilterB])), []);
  assert.deepEqual(Array.from(model.pruneSelection(["lead-a", "lead-b"], [visibleInFilterB])), ["lead-b"]);
  assert.ok(supervisor.includes("followUpModel.pruneSelection(state.portfolioSelection, visibleLeads)"));
});

test("31. Leads terminales no son seleccionables y abortan la RPC antes de mutar", () => {
  ["venta", "desistir", "invalido"].forEach((status) => {
    assert.equal(model.isReassignable(lead({ crm: { status, priority: "normal" } })), false);
  });
  assert.ok(supervisor.includes("Los Leads terminales no se pueden reasignar"));
  assert.ok(reassignmentMigration.includes("join public.lead_crm crm on crm.lead_id = lead.id"));
  assert.ok(reassignmentMigration.includes("for update of lead, crm"));
  const terminalValidation = reassignmentMigration.indexOf("v_lead.crm_status in ('venta', 'desistir', 'invalido')");
  const firstMutation = reassignmentMigration.indexOf("perform private.assign_lead_to_seller_with_reason", terminalValidation);
  assert.ok(terminalValidation > -1 && firstMutation > terminalValidation);
});

test("32. Vendedores pausados no quedan habilitados como destino de reasignación", () => {
  assert.ok(supervisor.includes('settings.paused ? " disabled" : ""'));
  assert.ok(supervisor.includes('settings.paused ? " · pausado" : ""'));
  assert.ok(supervisor.includes("seller.active && !settings.paused"));
  assert.ok(supervisor.includes("El vendedor seleccionado no está disponible para reasignaciones."));
});
