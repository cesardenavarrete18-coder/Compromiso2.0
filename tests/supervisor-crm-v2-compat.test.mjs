import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const supervisorHtml = readFileSync(new URL("../vendedores/supervisor/index.html", import.meta.url), "utf8");
const supervisorJs = readFileSync(new URL("../vendedores/supervisor/supervisor.js", import.meta.url), "utf8");
const followUpSource = readFileSync(new URL("../vendedores/supervisor/followup-model.js", import.meta.url), "utf8");
const reassignmentMigration = readFileSync(new URL("../supabase/migrations/20260901131303_supervisor_portfolio_reassignment.sql", import.meta.url), "utf8");
const releaseHardeningMigration = readFileSync(new URL("../supabase/migrations/20260909090000_crm_v2_release_hardening.sql", import.meta.url), "utf8");

const context = {};
context.globalThis = context;
runInNewContext(followUpSource, context);
const followUpModel = context.grupoSurFollowUpModel;

function lead(overrides) {
  return Object.assign({
    id: "lead-1",
    assigned_seller_user_id: "seller-1",
    crm: { status: "no_contesta", priority: "normal" }
  }, overrides);
}

test("CRM V2 taxonomy: labels renamed, contacto_futuro visible, historic states kept", () => {
  assert.match(supervisorJs, /no_contesta: "Sin contacto"/);
  assert.match(supervisorJs, /contacto_futuro: "Pide contacto futuro"/);
  assert.match(supervisorJs, /en_proceso: "En Gestión"/);
  assert.doesNotMatch(supervisorJs, /no_contesta: "No contesta"/);
  assert.doesNotMatch(supervisorJs, /en_proceso: "En proceso"/);
  for (const stage of ["Nuevo", "Entrevista", "Cierre", "Seña", "Venta", "Desistir", "Inválido"]) {
    assert.ok(supervisorJs.includes(stage), stage);
  }
  assert.match(supervisorHtml, /option value="contacto_futuro">Pide contacto futuro</);
  assert.match(supervisorHtml, /option value="no_contesta">Sin contacto</);
  assert.match(supervisorHtml, /option value="en_proceso">En Gestión</);
});

test("Sin contacto: la próxima acción viene del protocolo, nunca 'Sin programar' con protocolo activo", () => {
  const active = lead({ crm: { status: "no_contesta" } });
  const summaryWithProtocol = {
    next_task_id: "task-1",
    next_task_due_start: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    next_task_channel: "call",
    next_task_call_attempt: 3
  };
  const derived = followUpModel.deriveFollowUpStatus(active, summaryWithProtocol);
  assert.equal(derived.key, "overdue");
  assert.notEqual(derived.label, "SIN PROGRAMAR");
  assert.ok(derived.nextAction);
  assert.equal(derived.nextAction.source, "protocol_recommendation");
});

test("Sin contacto sin protocolo activo (caso real) queda Sin programar, no se inventa una fecha", () => {
  const active = lead({ crm: { status: "no_contesta" } });
  const derived = followUpModel.deriveFollowUpStatus(active, {});
  assert.equal(derived.key, "unscheduled");
});

test("Pide contacto futuro clasifica vencida/hoy/próxima según next_contact_at manual", () => {
  const overdue = lead({ crm: { status: "contacto_futuro", next_contact_at: new Date(Date.now() - 1000).toISOString(), next_contact_source: "manual" } });
  const future = lead({ crm: { status: "contacto_futuro", next_contact_at: new Date(Date.now() + 86400000).toISOString(), next_contact_source: "manual" } });
  assert.equal(followUpModel.deriveFollowUpStatus(overdue, {}).key, "overdue");
  assert.equal(followUpModel.deriveFollowUpStatus(future, {}).key, "upcoming");
});

test("Entrevista prioriza fecha/hora de la entrevista sobre la agenda manual ausente", () => {
  const withInterview = lead({ crm: { status: "entrevista", interview_at: new Date(Date.now() + 26 * 3600000).toISOString() } });
  const derived = followUpModel.deriveFollowUpStatus(withInterview, {});
  assert.equal(derived.key, "upcoming");
  assert.notEqual(derived.key, "unscheduled");
  assert.equal(derived.nextAction.source, "interview");
});

test("Entrevista prioriza interview_at incluso con una agenda manual vieja también cargada", () => {
  const withBoth = lead({
    crm: {
      status: "entrevista",
      interview_at: new Date(Date.now() + 26 * 3600000).toISOString(),
      next_contact_at: new Date(Date.now() - 5 * 3600000).toISOString(),
      next_contact_source: "manual"
    }
  });
  const derived = followUpModel.deriveFollowUpStatus(withBoth, {});
  assert.equal(derived.nextAction.source, "interview");
  assert.equal(derived.key, "upcoming", "a stale manual date must not make an upcoming interview read as overdue");
});

test("Seña muestra la acción posterior sin degradar el estado comercial", () => {
  const withPostDeposit = lead({ crm: { status: "sena", post_deposit_action_at: new Date(Date.now() + 3600000).toISOString() } });
  const derived = followUpModel.deriveFollowUpStatus(withPostDeposit, {});
  assert.equal(derived.nextAction.source, "post_deposit");
  assert.equal(derived.active, true);
});

test("Seña prioriza post_deposit_action_at incluso con una agenda manual vieja también cargada", () => {
  const withBoth = lead({
    crm: {
      status: "sena",
      post_deposit_action_at: new Date(Date.now() + 3600000).toISOString(),
      next_contact_at: new Date(Date.now() - 5 * 3600000).toISOString(),
      next_contact_source: "manual"
    }
  });
  const derived = followUpModel.deriveFollowUpStatus(withBoth, {});
  assert.equal(derived.nextAction.source, "post_deposit");
  assert.notEqual(derived.key, "overdue", "a stale manual date must not make an upcoming post-deposit action read as overdue");
});

test("Sin contacto prioriza el protocolo incluso con una agenda manual vieja también cargada", () => {
  const withBoth = lead({
    crm: {
      status: "no_contesta",
      next_contact_at: new Date(Date.now() - 5 * 3600000).toISOString(),
      next_contact_source: "manual"
    }
  });
  const summaryWithProtocol = {
    next_task_id: "task-x",
    next_task_due_start: new Date(Date.now() + 26 * 3600000).toISOString(),
    next_task_channel: "call",
    next_task_call_attempt: 2
  };
  const derived = followUpModel.deriveFollowUpStatus(withBoth, summaryWithProtocol);
  assert.equal(derived.nextAction.source, "protocol_recommendation");
  assert.equal(derived.key, "upcoming");
});

test("terminales no aparecen como activos ni son reasignables", () => {
  for (const status of ["venta", "desistir", "invalido"]) {
    const terminalLead = lead({ crm: { status } });
    const derived = followUpModel.deriveFollowUpStatus(terminalLead, {});
    assert.equal(derived.active, false);
    assert.equal(followUpModel.isReassignable(terminalLead), false);
  }
});

test("selección masiva descarta Leads terminales ocultos al recalcular la lista visible", () => {
  const visible = [lead({ id: "a", crm: { status: "no_contesta" } }), lead({ id: "b", crm: { status: "venta" } })];
  const pruned = followUpModel.pruneSelection(["a", "b"], visible);
  assert.deepEqual(pruned, ["a"]);
});

test("reassign_leads_to_seller sigue siendo la única fuente de verdad para bloquear terminales", () => {
  assert.match(reassignmentMigration, /v_lead\.crm_status in \('venta', 'desistir', 'invalido'\)/);
  assert.match(reassignmentMigration, /Los Leads con estado terminal no se pueden reasignar/);
  assert.match(reassignmentMigration, /El vendedor seleccionado no está activo/);
});

test("la reasignación hereda la protección de opt-out del ciclo comercial (PR1)", () => {
  assert.match(releaseHardeningMigration, /start_lead_crm_cycle[\s\S]{0,400}p_override_opt_out boolean default false/);
  assert.match(releaseHardeningMigration, /v_do_not_contact and not p_override_opt_out/);
});

test("Supervisor usa reassign_leads_to_seller tanto en reasignación individual como masiva", () => {
  const calls = supervisorJs.match(/rpc\("reassign_leads_to_seller"/g) || [];
  assert.equal(calls.length, 2);
});

test("Ventas para confirmar filtra pending en el backend; sin segunda lógica contradictoria en frontend", () => {
  const salesQuery = supervisorJs.match(/lead_sale_requests[\s\S]{0,700}\.eq\("status", "pending"\)/);
  assert.ok(salesQuery, "the sales query must filter status=pending server-side");
  assert.doesNotMatch(supervisorJs, /state\.sales\.filter\(function[^)]*\)\s*\{\s*return[^}]*status/);
});

test("Rechazo de venta: el mensaje refleja el estado comercial resultante real (Seña vs Cierre)", () => {
  assert.match(supervisorJs, /var reviewedLeadId = state\.activeSale\.lead_id;/);
  assert.match(supervisorJs, /resultingStatus\.status === "sena"/);
  assert.match(supervisorJs, /"La venta fue observada y el Lead permanece en Seña\."/);
  assert.match(supervisorJs, /"La venta fue observada y volvió a Cierre\."/);
});
