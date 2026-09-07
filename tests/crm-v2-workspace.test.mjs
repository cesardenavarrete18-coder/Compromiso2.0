import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");
const crm = readFileSync(new URL("../vendedores/crm.js", import.meta.url), "utf8");
const management = readFileSync(new URL("../vendedores/en-gestion.js", import.meta.url), "utf8");
const sales = readFileSync(new URL("../vendedores/sales.js", import.meta.url), "utf8");
const transitionSource = readFileSync(new URL("../vendedores/crm-transition-model.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260907150000_crm_v2_transition_matrix.sql", import.meta.url), "utf8");
const context = {};
context.globalThis = context;
runInNewContext(transitionSource, context);
const transitions = context.grupoSurCRMTransitions;

test("el Workspace común abre Nuevo y En gestión antes de mostrar el diálogo", () => {
  const openLead = crm.match(/async function openLead\(leadId\)[\s\S]*?await Promise\.all/)?.[0] || "";
  assert.ok(html.includes('id="crmWorkspaceBack"'));
  assert.ok(html.includes('id="crmWorkspaceContext"'));
  assert.ok(openLead.indexOf('leadDialog.classList.toggle("crm-v2-workspace"') < openLead.indexOf("leadDialog.showModal()"));
  assert.ok(openLead.indexOf("grupoSurEnGestionExperience.openLead(lead)") < openLead.indexOf("leadDialog.showModal()"));
  assert.ok(management.includes("function openLead(lead)"));
});

test("Nuevo pregunta por contacto y presenta sólo resultados válidos", () => {
  assert.ok(html.includes("¿Pudiste contactar al cliente?"));
  assert.ok(html.includes('data-contact-decision="answered"'));
  assert.ok(html.includes('data-contact-decision="no_answer"'));
  assert.ok(crm.includes('["contacto_futuro", "en_proceso", "entrevista", "cierre", "sena", "venta", "desistir"]'));
  assert.ok(crm.includes('["no_contesta", "invalido"]'));
});

test("Sin contacto completa o inicia protocolo y no crea agenda manual", () => {
  const flow = crm.match(/async function registerNewNoAnswer\(\)[\s\S]*?^  }/m)?.[0] || "";
  assert.ok(flow.includes('rpc("restart_lead_contact_sequence"'));
  assert.ok(flow.includes('completeContactTask(pending.id, "no_answer")'));
  assert.doesNotMatch(flow, /record_lead_follow_up|next_contact_at/);
});

test("la matriz canónica bloquea Inválido después del contacto", () => {
  for (const status of ["contacto_futuro", "en_proceso", "entrevista", "cierre", "sena", "venta"]) {
    assert.equal(transitions.canTransition(status, "invalido"), false, status);
  }
  assert.equal(transitions.canTransition("nuevo", "invalido"), true);
  assert.equal(transitions.canTransition("no_contesta", "invalido"), true);
  assert.throws(() => transitions.assertTransition("en_proceso", "invalido"), /no está permitida/);
});

test("frontend y RPC validan la misma transición antes de persistir", () => {
  const save = crm.match(/async function saveManagement\(\)[\s\S]*?^  }/m)?.[0] || "";
  assert.ok(save.includes("transitionModel.assertTransition"));
  assert.ok(migration.includes("private.crm_transition_allowed(v_previous_status, p_status)"));
  assert.match(migration, /when 'en_proceso' then p_to in \('en_proceso','entrevista','cierre','sena','venta','desistir'\)/);
  assert.match(migration, /when 'sena' then p_to in \('sena','venta','desistir'\)/);
});

test("el vendedor no puede convertir manualmente un cierre terminal en Nuevo", () => {
  assert.equal(transitions.canTransition("desistir", "nuevo"), false);
  assert.equal(transitions.canTransition("invalido", "nuevo"), false);
  assert.match(migration, /if p_status = 'nuevo' then\s+raise exception 'Nuevo es un estado de ingreso/);
  assert.doesNotMatch(transitionSource, /desistir:\s*\[[^\]]*nuevo/);
  assert.doesNotMatch(transitionSource, /invalido:\s*\[[^\]]*nuevo/);
});

test("una reactivación autorizada inicia un ciclo explícito en Nuevo", () => {
  const reactivation = migration.match(/create or replace function public\.reactivate_lead_cycle[\s\S]*?grant execute on function public\.reactivate_lead_cycle[\s\S]*?authenticated;/)?.[0] || "";
  assert.ok(reactivation.includes("private.current_user_is_management()"));
  assert.ok(reactivation.includes("routing_reason = 'authorized_reactivation'"));
  assert.ok(reactivation.includes("private.start_lead_crm_cycle"));
  assert.ok(migration.includes("status = 'nuevo'"));
});

test("una transferencia autorizada inicia el nuevo ciclo sin usar la matriz comercial", () => {
  const assignmentTrigger = migration.match(/create or replace function private\.start_contact_sequence_after_assignment[\s\S]*?revoke all on function private\.start_contact_sequence_after_assignment/)?.[0] || "";
  assert.ok(assignmentTrigger.includes("old.assigned_seller_user_id is distinct from new.assigned_seller_user_id"));
  assert.ok(assignmentTrigger.includes("private.start_lead_crm_cycle"));
  assert.ok(assignmentTrigger.includes("'transfer'"));
  assert.doesNotMatch(assignmentTrigger, /crm_transition_allowed/);
});

test("el nuevo ciclo conserva una instantánea y nunca elimina el historial previo", () => {
  const cycle = migration.match(/create or replace function private\.start_lead_crm_cycle[\s\S]*?revoke all on function private\.start_lead_crm_cycle/)?.[0] || "";
  assert.ok(cycle.includes("insert into public.lead_activities"));
  assert.ok(cycle.includes("'previous_status', v_previous.status"));
  assert.ok(cycle.includes("'previous_next_contact_at', v_previous.next_contact_at"));
  assert.ok(cycle.includes("'previous_deposit_amount', v_previous.deposit_amount"));
  assert.doesNotMatch(cycle, /delete\s+from\s+public\.(lead_activities|lead_assignments|lead_contact_tasks)/i);
});

test("el Workspace reutiliza herramientas e historial existentes", () => {
  for (const id of ["crmWhatsappLink", "crmCommentButton", "crmBudgetButton", "crmSaleButton", "crmTimeline", "crmCustomerHistory", "crmChat"]) {
    assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, id);
  }
  assert.ok(html.includes("Historial"));
  assert.ok(html.includes("Consultas previas"));
  assert.ok(html.includes("Conversación IA"));
});

test("Sin contacto renderiza cada intento por día, franja, canal y resultado", () => {
  assert.ok(html.includes('id="crmNoContactExperience"'));
  assert.ok(crm.includes("function renderNoContactProtocol(lead)"));
  assert.ok(crm.includes('class="crm-protocol-day"'));
  assert.ok(crm.includes('class="crm-protocol-attempt '));
  for (const field of ["Hora efectiva", "Registrado", "Resultado"]) assert.ok(crm.includes(field));
  assert.ok(crm.includes("performed_at, recorded_at, completed_at"));
});

test("cada intento registra hora efectiva separada de la hora de registro", () => {
  const flow = migration.match(/create or replace function public\.record_contact_task_result[\s\S]*?grant execute on function public\.record_contact_task_result[\s\S]*?authenticated;/)?.[0] || "";
  assert.ok(migration.includes("add column if not exists performed_at timestamptz"));
  assert.ok(migration.includes("add column if not exists recorded_at timestamptz"));
  assert.ok(flow.includes("performed_at = p_performed_at"));
  assert.ok(flow.includes("recorded_at = now()"));
});

test("el fin de protocolo desiste con motivo canónico y clasifica Base fría", () => {
  const flow = migration.match(/create or replace function public\.record_contact_task_result[\s\S]*?grant execute on function public\.record_contact_task_result[\s\S]*?authenticated;/)?.[0] || "";
  assert.ok(flow.includes("status = 'desistir'"));
  assert.ok(flow.includes("status_reason = 'No contactado post protocolo'"));
  assert.ok(flow.includes("cold_base_at = now()"));
  assert.ok(flow.includes("'segment', 'base_fria'"));
  assert.doesNotMatch(transitionSource, /base_fria\s*:/);
});

test("Pide contacto futuro distingue vencimiento de No contestó", () => {
  assert.ok(html.includes('id="crmFutureContactExperience"'));
  assert.ok(crm.includes("Contacto solicitado vencido"));
  assert.ok(crm.includes("no se infiere que el cliente no contestó"));
  assert.ok(html.includes('data-future-result="rescheduled"'));
  assert.ok(crm.includes('rpc("start_no_contact_protocol_from_future"'));
  assert.ok(migration.includes("where lead_id = p_lead_id and status = 'contacto_futuro' for update"));
});

test("una respuesta desde Sin contacto ofrece sólo resultados comerciales válidos", () => {
  const valid = '["contacto_futuro", "en_proceso", "entrevista", "cierre", "sena", "venta", "desistir"]';
  assert.ok(crm.includes(valid));
  assert.ok(crm.includes("state.pendingProtocolAnsweredTaskId"));
  assert.ok(crm.includes('rpc("record_contact_answer_with_transition"'));
  assert.match(migration, /p_status not in \('contacto_futuro', 'en_proceso', 'entrevista', 'cierre', 'sena', 'desistir'\)/);
});

test("smoke: las herramientas comunes siguen siendo instancias únicas", () => {
  for (const id of ["crmWhatsappLink", "crmCommentButton", "crmBudgetButton", "crmSaleButton", "crmTimeline", "crmCustomerHistory", "crmChat"]) {
    assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, id);
  }
  assert.ok(sales.includes('document.getElementById("crmBudgetButton")'));
  assert.ok(crm.includes('document.getElementById("crmSaleButton")'));
  assert.ok(crm.includes('document.getElementById("crmCommentButton")'));
  assert.ok(crm.includes('document.getElementById("crmWhatsappLink").href'));
});
