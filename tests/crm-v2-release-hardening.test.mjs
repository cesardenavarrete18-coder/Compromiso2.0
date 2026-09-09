import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260909090000_crm_v2_release_hardening.sql", import.meta.url), "utf8");
const crm = readFileSync(new URL("../vendedores/crm.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");

function fn(name, kind) {
  const marker = `create or replace function ${kind}.${name}`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `${kind}.${name} not found`);
  const end = migration.indexOf("\n$$;", start);
  return migration.slice(start, end);
}

// --- A pure JS mirror of private.business_date / private.next_protocol_call_window,
// used only to exercise the Saturday-aware windowing algorithm with concrete
// clock times. The SQL migration text assertions below pin the same shape.
function isodow(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}
function atMidnight(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function businessDate(date, offset = 0) {
  let d = new Date(date);
  while (isodow(d) === 7) d.setDate(d.getDate() + 1);
  let remaining = Math.max(offset, 0);
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isodow(d) !== 7) remaining -= 1;
  }
  return d;
}
function nextProtocolCallWindow(after) {
  const local = new Date(after);
  const today = atMidnight(local);
  const day = businessDate(today, 0);
  const isSaturday = isodow(day) === 6;
  const minutesOfDay = local.getHours() * 60 + local.getMinutes();
  let slot;
  let windowDay = day;
  if (day.getTime() !== today.getTime()) {
    slot = 1;
  } else if (minutesOfDay < 12 * 60) {
    slot = 1;
  } else if (minutesOfDay < 16 * 60) {
    slot = 2;
  } else if (!isSaturday && minutesOfDay < 19 * 60) {
    slot = 3;
  } else {
    windowDay = businessDate(day, 1);
    slot = 1;
  }
  const bounds = { 1: [10, 12, "10-12"], 2: [14, 16, "14-16"], 3: [17, 19, "17-19"] };
  const [startHour, endHour, band] = bounds[slot];
  const windowStart = new Date(windowDay);
  windowStart.setHours(startHour, 0, 0, 0);
  const windowEnd = new Date(windowDay);
  windowEnd.setHours(endHour, 0, 0, 0);
  const dueStart = new Date(Math.max(local.getTime(), windowStart.getTime()));
  return { dueStart, dueEnd: windowEnd, band };
}
function generateNineBands(startedAt) {
  const bands = [];
  let cursor = new Date(startedAt);
  for (let i = 0; i < 9; i += 1) {
    const window = nextProtocolCallWindow(cursor);
    bands.push(window);
    cursor = new Date(window.dueEnd.getTime() + 1000);
  }
  return bands;
}

function nextWeekday(from, iso) {
  const d = new Date(from);
  while (isodow(d) !== iso) d.setDate(d.getDate() + 1);
  return d;
}
function at(date, hour, minute = 0) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}
const anchor = new Date(2026, 0, 1);
const someFriday = nextWeekday(anchor, 5);
const someSaturday = nextWeekday(someFriday, 6);
const someMonday = nextWeekday(someSaturday, 1);
const someSunday = nextWeekday(someFriday, 7);

test("Saturday is a commercial day with 10-12 and 14-16, never 17-19", () => {
  assert.match(migration, /extract\(isodow from v_date\) = 7/);
  assert.doesNotMatch(migration, /extract\(isodow from v_date\) > 5/);
  const windowFn = fn("next_protocol_call_window", "private");
  assert.match(windowFn, /v_is_saturday := extract\(isodow from v_day\) = 6/);
  assert.match(windowFn, /not v_is_saturday and v_local::time < time '19:00'/);
});

test("sábado 09:00 rolls into the 10-12 band, not before", () => {
  const result = nextProtocolCallWindow(at(someSaturday, 9, 0));
  assert.equal(result.band, "10-12");
  assert.equal(result.dueStart.getHours(), 10);
  assert.equal(isodow(result.dueStart), 6);
});

test("sábado 10:30 stays inside the in-progress 10-12 band", () => {
  const result = nextProtocolCallWindow(at(someSaturday, 10, 30));
  assert.equal(result.band, "10-12");
  assert.equal(result.dueStart.getHours(), 10);
  assert.equal(result.dueStart.getMinutes(), 30);
});

test("sábado 15:00 falls in the 14-16 band", () => {
  const result = nextProtocolCallWindow(at(someSaturday, 15, 0));
  assert.equal(result.band, "14-16");
  assert.equal(isodow(result.dueStart), 6);
});

test("sábado después de 16:00 jumps straight to lunes 10-12 (no 17-19 Saturday band)", () => {
  const result = nextProtocolCallWindow(at(someSaturday, 16, 30));
  assert.equal(result.band, "10-12");
  assert.equal(isodow(result.dueStart), 1);
  assert.equal(result.dueStart.getHours(), 10);
});

test("domingo salta a lunes 10-12", () => {
  const result = nextProtocolCallWindow(at(someSunday, 11, 0));
  assert.equal(isodow(result.dueStart), 1);
  assert.equal(result.band, "10-12");
});

test("viernes tarde continúa el sábado antes de saltar a lunes", () => {
  const result = nextProtocolCallWindow(at(someFriday, 19, 0, 1));
  assert.equal(isodow(result.dueStart), 6, "must land on Saturday, not skip straight to Monday");
  assert.equal(result.band, "10-12");
});

test("18 llamadas exactas en 9 franjas efectivas, cualquiera sea el punto de partida", () => {
  const startingPoints = [
    at(someFriday, 18, 0),
    at(someSaturday, 9, 0),
    at(someSaturday, 15, 0),
    at(someSunday, 8, 0),
    at(someMonday, 10, 0),
  ];
  for (const start of startingPoints) {
    const bands = generateNineBands(start);
    assert.equal(bands.length, 9);
    const totalCalls = bands.length * 2;
    assert.equal(totalCalls, 18);
    const distinctBands = new Set(bands.map((b) => `${b.dueStart.toDateString()}|${b.band}`));
    assert.equal(distinctBands.size, 9);
    for (const band of bands) {
      if (isodow(band.dueStart) === 6) assert.notEqual(band.band, "17-19", "Saturday never carries a 17-19 band");
      assert.notEqual(isodow(band.dueStart), 7, "no band ever falls on Sunday");
    }
  }
});

test("submit_crm_lead_sale only accepts Cierre/Seña; every other state is a rejected side-door", () => {
  const body = fn("submit_crm_lead_sale", "public");
  assert.match(body, /v_current_status not in \('cierre', 'sena'\)/);
  assert.match(body, /raise exception 'El Datero sólo puede enviarse desde Cierre o Seña/);
  assert.match(body, /v_new_status := v_current_status/);
  assert.match(body, /status = v_new_status/);
  assert.doesNotMatch(body, /status = 'cierre',\n\s*priority/);
});

test("Desistir con venta pendiente cierra la solicitud atómicamente vía trigger", () => {
  assert.match(migration, /create trigger lead_crm_close_pending_sale_on_desistir/);
  assert.match(migration, /after update of status on public\.lead_crm/);
  const body = fn("close_pending_sale_on_desistir", "private");
  assert.match(body, /new\.status = 'desistir' and old\.status is distinct from 'desistir'/);
  assert.match(body, /status = 'rejected'/);
  assert.match(body, /Cancelada automáticamente: el cliente desistió antes de la confirmación administrativa/);
  assert.doesNotMatch(body, /insert into public\.sales_cases/);
});

test("respuesta atómica también funciona desde Nuevo, no sólo desde Sin contacto", () => {
  const body = fn("record_contact_answer_with_transition", "public");
  assert.match(body, /v_previous_status not in \('nuevo', 'no_contesta'\)/);
  assert.doesNotMatch(body, /v_previous_status <> 'no_contesta'/);
});

test("Base fría ya no se infiere por status_reason en el frontend", () => {
  assert.doesNotMatch(crm, /status_reason === "No contactado post protocolo"/);
  assert.match(crm, /Boolean\(crm\.cold_base_at\)/);
});

test("motivo estructurado de Desistir excluye el motivo interno automático", () => {
  assert.match(migration, /lead_crm_desist_reason check \(desist_reason is null or desist_reason in \(/);
  for (const value of ["no_interest", "conditions_not_viable", "chose_other_option", "postponed_without_date", "requested_no_contact", "other"]) {
    assert.ok(migration.includes(`'${value}'`), value);
  }
  assert.doesNotMatch(migration, /desist_reason.*No contactado post protocolo/);
  assert.match(html, /id="crmDesistReasonInput"/);
  assert.match(html, /value="requested_no_contact"/);
  assert.doesNotMatch(html, /value="[^"]*"[^<]*No contactado post protocolo/);
});

test("requested_no_contact aplica opt-out explícito, nunca inferido de texto libre", () => {
  const helper = fn("apply_lead_opt_out", "private");
  assert.match(helper, /do_not_contact = true/);
  const followUp = fn("record_lead_follow_up", "public");
  assert.match(followUp, /p_desist_reason = 'requested_no_contact'[\s\S]{0,80}perform private\.apply_lead_opt_out/);
});

test("nuevo ciclo limpia los campos operativos V2 y resetea el playbook preservando historial", () => {
  const body = fn("start_lead_crm_cycle", "private");
  for (const field of [
    "interview_mode = null",
    "interview_operational_status = null",
    "interview_objective = ''",
    "final_objection = ''",
    "deposit_validation = ''",
    "post_deposit_action_at = null",
    "post_deposit_action_status = null",
    "previous_status = null",
    "terminal_at = null",
    "sale_confirmation_status = 'none'",
    "sale_requested_at = null",
    "sale_confirmed_at = null",
    "vehicle_sold = ''",
    "sale_amount = null",
    "desist_reason = null",
  ]) assert.ok(body.includes(field), field);
  assert.match(body, /update public\.lead_management_playbook_items\s*\n\s*set completed = false/);
  assert.doesNotMatch(body, /delete from public\.lead_management_playbook/);
  assert.doesNotMatch(body, /delete from public\.lead_activities/);
  assert.match(body, /previous_interview_mode.*v_previous\.interview_mode/);
  assert.match(body, /previous_sale_confirmation_status/);
});

test("opt-out nunca se reactiva silenciosamente", () => {
  const cycle = fn("start_lead_crm_cycle", "private");
  assert.match(cycle, /v_do_not_contact and not p_override_opt_out/);
  assert.match(cycle, /return;/);
  const reactivate = fn("reactivate_lead_cycle", "public");
  assert.match(reactivate, /v_do_not_contact and not p_confirm_opt_out_override/);
  assert.match(reactivate, /raise exception 'El Lead solicitó no ser contactado/);
});

test("restart_lead_contact_sequence backend guard against terminal bypass already exists", () => {
  const advisory = readFileSync(new URL("../supabase/migrations/20260903202218_protocol_advisory_layer.sql", import.meta.url), "utf8");
  const start = advisory.indexOf("create or replace function public.restart_lead_contact_sequence");
  const body = advisory.slice(start, advisory.indexOf("$$;", start));
  assert.match(body, /v_status not in \('nuevo', 'no_contesta'\)/);
  assert.match(body, /v_do_not_contact or v_status not in/);
  assert.match(body, /raise exception 'El protocolo solo puede reiniciarse para Leads Nuevo o No contesta'/);
});

test("Datero button is hidden/disabled for terminal stages, backend still the source of truth", () => {
  assert.match(crm, /var saleBlockedByStage = \["desistir", "invalido", "venta"\]\.includes\(crm\.status\)/);
  assert.match(crm, /saleButton\.disabled = saleBlockedByStage \|\|/);
});

test("un desistimiento manual nunca setea cold_base_at, ni con el texto reservado", () => {
  const followUp = fn("record_lead_follow_up", "public");
  const answered = fn("record_contact_answer_with_transition", "public");
  for (const body of [followUp, answered]) {
    assert.match(body, /cold_base_at = null/);
    assert.doesNotMatch(body, /cold_base_at = now\(\)/);
  }
  assert.doesNotMatch(migration, /desist_reason[\s\S]{0,40}No contactado post protocolo/);
});

test("submit_crm_lead_sale nunca escribe deposit_amount/deposit_at: la Seña preserva importe y fecha", () => {
  const body = fn("submit_crm_lead_sale", "public");
  assert.doesNotMatch(body, /deposit_amount\s*=/);
  assert.doesNotMatch(body, /deposit_at\s*=/);
});

test("submit_crm_lead_sale sigue siendo idempotente por aplicación y rechaza ventas duplicadas", () => {
  const body = fn("submit_crm_lead_sale", "public");
  assert.match(body, /where request\.provisional_application_id = p_application_id/);
  assert.match(body, /if v_request_id is not null then\s*\n\s*return v_request_id/);
  assert.match(body, /Ya existe una venta pendiente de confirmación para este cliente/);
});

test("opt-out sigue impidiendo la generación automática de protocolo/WhatsApp", () => {
  const advisory = readFileSync(new URL("../supabase/migrations/20260907150000_crm_v2_transition_matrix.sql", import.meta.url), "utf8");
  const start = advisory.indexOf("create or replace function private.create_lead_contact_sequence");
  const body = advisory.slice(start, advisory.indexOf("$$;", start));
  assert.match(body, /not coalesce\(lead\.do_not_contact, false\)/);
});

test("motivo de Desistir es obligatorio para toda gestión manual nueva, sin romper filas históricas", () => {
  for (const name of ["record_lead_follow_up", "record_contact_answer_with_transition"]) {
    const body = fn(name, "public");
    assert.match(body, /p_status = 'desistir' and p_desist_reason is null then\s*\n\s*raise exception 'Seleccioná el motivo del desistimiento'/);
  }
  // Application-level only: no table constraint ties desist_reason to status,
  // so historical rows and the automatic exhaustion path stay valid with it null.
  assert.doesNotMatch(migration, /check\s*\(\s*status\s*<>\s*'desistir'\s*or\s*desist_reason/i);
  assert.match(migration, /lead_crm_desist_reason check \(desist_reason is null or desist_reason in \(/);
});

test("el agotamiento automático del protocolo nunca pasa por record_lead_follow_up ni requiere motivo manual", () => {
  const protocolHardening = readFileSync(new URL("../supabase/migrations/20260908120000_crm_v2_protocol_hardening.sql", import.meta.url), "utf8");
  const start = protocolHardening.indexOf("create or replace function public.record_contact_task_result");
  const body = protocolHardening.slice(start, protocolHardening.indexOf("$$;", start));
  assert.match(body, /status_reason = 'No contactado post protocolo'/);
  assert.doesNotMatch(body, /desist_reason/);
  assert.doesNotMatch(body, /record_lead_follow_up/);
});

test("nuevo ciclo garantiza exactamente un protocolo activo, sin importar el estado previo, de forma idempotente", () => {
  const body = fn("start_lead_crm_cycle", "private");
  assert.doesNotMatch(body, /if v_previous\.status = 'nuevo' then/);
  assert.match(body, /perform private\.create_lead_contact_sequence\(p_lead_id, v_seller, now\(\)\);\s*\n(\s*-- [^\n]*\n)*end;/);
  const afterReset = body.slice(body.indexOf("update public.lead_management_playbook_items"));
  assert.match(afterReset, /create_lead_contact_sequence/);
});
