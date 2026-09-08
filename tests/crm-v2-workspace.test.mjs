import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");
const crm = readFileSync(new URL("../vendedores/crm.js", import.meta.url), "utf8");
const management = readFileSync(new URL("../vendedores/en-gestion.js", import.meta.url), "utf8");
const agendaModel = readFileSync(new URL("../vendedores/agenda-model.js", import.meta.url), "utf8");
const sales = readFileSync(new URL("../vendedores/sales.js", import.meta.url), "utf8");
const transitionSource = readFileSync(new URL("../vendedores/crm-transition-model.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260907150000_crm_v2_transition_matrix.sql", import.meta.url), "utf8");
const contactAnswerIntegration = readFileSync(new URL("./crm-v2-contact-answer.integration.sql", import.meta.url), "utf8");
const context = {};
context.globalThis = context;
runInNewContext(transitionSource, context);
const transitions = context.grupoSurCRMTransitions;

const agendaContext = {};
agendaContext.globalThis = agendaContext;
runInNewContext(agendaModel, agendaContext);
const agenda = agendaContext.grupoSurAgendaModel;

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
  assert.ok(agendaModel.includes("performed_at, recorded_at, completed_at"));
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

test("la respuesta atómica registra la tarea sin invocar la transición legacy intermedia", () => {
  const flow = migration.match(/create or replace function public\.record_contact_answer_with_transition[\s\S]*?grant execute on function public\.record_contact_answer_with_transition[\s\S]*?authenticated;/)?.[0] || "";
  assert.doesNotMatch(flow, /record_contact_task_result|complete_contact_task\s*\(/);
  assert.match(flow, /select \* into v_task[\s\S]*for update/);
  assert.ok(flow.includes("v_task.status <> 'pending'"));
  assert.ok(flow.includes("v_task.seller_user_id <> v_user_id"));
  assert.ok(flow.includes("private.crm_transition_allowed(v_previous_status, p_status)"));
  for (const assignment of ["status = 'completed'", "outcome = 'answered'", "completed_at = now()", "performed_at = p_performed_at", "recorded_at = now()", "completed_by = v_user_id"]) assert.ok(flow.includes(assignment), assignment);
  assert.ok(flow.indexOf("update public.lead_contact_tasks") < flow.indexOf("private.cancel_lead_contact_protocol"));
  assert.ok(flow.indexOf("private.cancel_lead_contact_protocol") < flow.indexOf("update public.lead_crm"));
  assert.ok(flow.includes("last_contact_at = p_performed_at"));
  assert.ok(flow.includes("last_contact_outcome = 'answered'"));
  assert.ok(flow.includes("next_contact_source = case when p_status in ('contacto_futuro', 'en_proceso') then 'manual'"));
  assert.ok(flow.includes("En gestión requiere un próximo contacto con fecha y hora"));
  assert.ok(flow.includes("Programá el contacto solicitado"));
});

test("la prueba SQL aislada cubre éxito, rollback integral e Inválido", () => {
  for (const expected of [
    "Sin contacto -> En gestión must apply the final state",
    "answered task must preserve performed_at and recorded_at",
    "remaining protocol tasks must be cancelled",
    "Sin contacto -> Pide contacto futuro must succeed",
    "failed final transition must roll back the answered attempt",
    "failed final transition must leave Sin contacto observable",
    "Inválido must remain available from Sin contacto",
    "confirmed interview must remain Entrevista",
    "rescheduled interview must remain Entrevista",
    "no-show must not change the commercial status",
    "Entrevista -> Cierre must complete the interview",
    "Cierre -> Entrevista must be allowed",
    "Entrevista -> En Gestión must be allowed",
    "Cierre -> Seña must preserve amount and date",
    "post-deposit interview must not change Seña",
    "rejected transitions must preserve Seña",
    "Seña -> Desistir must preserve deposit amount and date",
    "Seña -> Venta must succeed through approval",
    "Venta must enter the existing Administration circuit"
  ]) assert.ok(contactAnswerIntegration.includes(expected), expected);
  assert.ok(contactAnswerIntegration.includes("status = 'pending' and outcome = '' and performed_at is null and recorded_at is null"));
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

function expectedProtocol(startValue) {
  const bands = [{ key: "10-12", start: 10, end: 12 }, { key: "14-16", start: 14, end: 16 }, { key: "17-19", start: 17, end: 19 }];
  const start = new Date(startValue);
  let cursor = new Date(start);
  const windows = [];
  const localParts = value => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
    return Object.fromEntries(parts.map(part => [part.type, part.value]));
  };
  const localIso = (date, hour) => `${date}T${String(hour).padStart(2, "0")}:00:00-03:00`;
  const nextBusinessDate = date => {
    const result = new Date(`${date}T12:00:00Z`);
    do result.setUTCDate(result.getUTCDate() + 1); while ([0, 6].includes(result.getUTCDay()));
    return result.toISOString().slice(0, 10);
  };
  while (windows.length < 9) {
    const local = localParts(cursor);
    let date = `${local.year}-${local.month}-${local.day}`;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if ([0, 6].includes(weekday)) {
      do date = nextBusinessDate(date); while ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay()));
      cursor = new Date(localIso(date, 10));
    }
    const hour = Number(localParts(cursor).hour) + Number(localParts(cursor).minute) / 60;
    let band = bands.find(item => hour < item.end);
    if (!band) {
      date = nextBusinessDate(date);
      cursor = new Date(localIso(date, 10));
      band = bands[0];
    }
    const dueStart = new Date(Math.max(cursor, new Date(localIso(date, band.start))));
    const dueEnd = new Date(localIso(date, band.end));
    windows.push({ date, band: band.key, dueStart, dueEnd });
    cursor = new Date(dueEnd.getTime() + 1000);
  }
  let lastDate = "";
  let protocolDay = 0;
  return windows.flatMap((window, windowIndex) => {
    if (window.date !== lastDate) { protocolDay += 1; lastDate = window.date; }
    return [1, 2].map(attempt => ({ channel: "call", protocol_day: protocolDay, protocol_band: window.band, band_attempt: attempt, sequence_order: windowIndex * 2 + attempt, due_start: window.dueStart.toISOString(), due_end: window.dueEnd.toISOString() }));
  });
}

test("el protocolo V2 canónico comienza en la primera franja disponible y completa 9 franjas", () => {
  const creator = migration.match(/create or replace function private\.create_lead_contact_sequence[\s\S]*?revoke all on function private\.create_lead_contact_sequence/)?.[0] || "";
  assert.ok(creator.includes("for v_band_number in 1..9 loop"));
  assert.ok(creator.includes("private.next_protocol_call_window(v_cursor)"));
  assert.ok(creator.includes("for v_band_attempt in 1..2 loop"));
  assert.ok(creator.includes("v_cursor := v_call_end + interval '1 second'"));
  assert.ok(creator.includes("if v_call_attempt in (1, 4) then"));

  const scenarios = [
    ["09:00", "2026-09-14T09:00:00-03:00", "10-12"],
    ["10:30", "2026-09-14T10:30:00-03:00", "10-12"],
    ["15:00", "2026-09-14T15:00:00-03:00", "14-16"],
    ["16:30", "2026-09-14T16:30:00-03:00", "17-19"],
    ["después de 19:00", "2026-09-14T19:30:00-03:00", "10-12"]
  ];
  for (const [label, startedAt, firstBand] of scenarios) {
    const tasks = expectedProtocol(startedAt);
    assert.equal(tasks.length, 18, label);
    assert.equal(new Set(tasks.map(task => `${task.protocol_day}:${task.protocol_band}`)).size, 9, label);
    assert.equal(tasks[0].protocol_band, firstBand, label);
    if (label === "15:00" || label === "16:30") assert.equal(tasks[0].due_start.slice(0, 10), new Date(startedAt).toISOString().slice(0, 10), label);
    assert.ok(tasks.every(task => new Date(task.due_end) >= new Date(startedAt)), label);
    for (const key of new Set(tasks.map(task => `${task.protocol_day}:${task.protocol_band}`))) assert.equal(tasks.filter(task => `${task.protocol_day}:${task.protocol_band}` === key).length, 2, `${label} ${key}`);
    assert.equal(agenda.isCanonicalV2Protocol(tasks, startedAt), true, label);
  }
});

test("la reconciliación legacy es explícita, conserva realizados y cancela sólo pendientes", () => {
  const reconciliation = migration.match(/create or replace function public\.reconcile_lead_contact_protocol[\s\S]*?grant execute on function public\.reconcile_lead_contact_protocol\(uuid\) to authenticated;/)?.[0] || "";
  assert.ok(reconciliation.includes("count(*) = 18"));
  assert.ok(reconciliation.includes("count(distinct (protocol_day, protocol_band)) = 9"));
  assert.ok(reconciliation.includes("max(protocol_day) between 3 and 4"));
  assert.match(reconciliation, /where sequence_id = v_sequence_id and status in \('pending', 'scheduled'\)/);
  const taskUpdate = reconciliation.match(/update public\.lead_contact_tasks[\s\S]*?where sequence_id = v_sequence_id and status in \('pending', 'scheduled'\);/)?.[0] || "";
  assert.doesNotMatch(taskUpdate, /performed_at\s*=|completed_at\s*=/);
  assert.doesNotMatch(reconciliation, /delete\s+from/i);
  assert.ok(reconciliation.includes("insert into public.lead_activities"));
  assert.ok(reconciliation.includes("'follow_up', 'Protocolo reconciliado a CRM V2'"));
  assert.doesNotMatch(reconciliation, /'management'/);
  assert.ok(reconciliation.includes("previous_sequence_id"));
  assert.ok(reconciliation.includes("private.create_lead_contact_sequence"));
  assert.ok(crm.includes('data-reconcile-protocol'));
  const openLead = crm.match(/async function openLead\(leadId\)[\s\S]*?await Promise\.all/)?.[0] || "";
  assert.doesNotMatch(openLead, /reconcile_lead_contact_protocol/);
});

test("Modo compatible carga historial pero bloquea la transición atómica inexistente", () => {
  assert.ok(crm.includes("state.taskSchema === \"legacy\""));
  assert.ok(crm.includes("La transición atómica y la reconciliación requieren la migración CRM V2"));
  assert.ok(crm.includes('if (state.taskSchema !== "v2")'));
  assert.ok(crm.includes("Registrar una respuesta con transición desde el protocolo requiere la migración CRM V2"));
  assert.ok(crm.includes("Hora registrada (legacy)"));
  assert.ok(crm.includes('taskTitle(task)'));
  assert.ok(crm.includes('"Llamada " + task.call_attempt + " de " + total'));
});
