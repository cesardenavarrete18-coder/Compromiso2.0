import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../vendedores/agenda-model.js", import.meta.url), "utf8");
const context = { Intl, Date };
context.globalThis = context;
runInNewContext(source, context);
const agenda = context.grupoSurAgendaModel;

const NOW = "2026-09-12T16:04:00-03:00";

function lead(id, crm) {
  return {
    id,
    created_at: "2026-09-12T10:00:00-03:00",
    assigned_at: "2026-09-12T10:00:00-03:00",
    crm
  };
}

test("una entrevista futura usa interview_at como acción de agenda y va a Próximos", () => {
  const current = lead("martin", {
    status: "entrevista",
    interview_at: "2026-09-14T14:00:00-03:00",
    interview_operational_status: "scheduled",
    interview_objective: "Ver el Polo Track y definir la operación",
    next_contact_at: "2026-09-11T11:00:00-03:00",
    next_contact_note: "Agenda vieja",
    next_contact_source: "manual"
  });

  const action = agenda.manualAction(current);
  assert.equal(action.at, "2026-09-14T14:00:00-03:00");
  assert.equal(action.note, "Ver el Polo Track y definir la operación");
  assert.equal(action.source, "interview");
  assert.equal(agenda.agendaBucket(current, NOW), "upcoming");
});

test("una entrevista de hoy todavía futura va a Hoy", () => {
  const current = lead("hoy", {
    status: "entrevista",
    interview_at: "2026-09-12T18:00:00-03:00",
    interview_operational_status: "confirmed",
    interview_objective: "Definir financiación"
  });
  assert.equal(agenda.agendaBucket(current, NOW), "today");
});

test("una entrevista vencida sin resultado requiere atención", () => {
  for (const operationalStatus of ["scheduled", "confirmed", "rescheduled", null]) {
    const current = lead("vencida-" + String(operationalStatus), {
      status: "entrevista",
      interview_at: "2026-09-12T14:00:00-03:00",
      interview_operational_status: operationalStatus,
      interview_objective: "Entrevista pendiente"
    });
    assert.equal(agenda.agendaBucket(current, NOW), "overdue", String(operationalStatus));
  }
});

test("no-show, completada sin transición y entrevista sin fecha quedan como inconsistencia", () => {
  for (const crm of [
    { status: "entrevista", interview_at: "2026-09-14T14:00:00-03:00", interview_operational_status: "no_show" },
    { status: "entrevista", interview_at: "2026-09-14T14:00:00-03:00", interview_operational_status: "completed" },
    { status: "entrevista", interview_at: null, interview_operational_status: "scheduled", next_contact_at: "2026-09-14T14:00:00-03:00", next_contact_source: "manual" }
  ]) {
    assert.equal(agenda.manualAction(lead("integrity", crm)), null);
    assert.equal(agenda.agendaBucket(lead("integrity", crm), NOW), "unscheduled");
  }
});

test("Próximos ordena entrevistas cronológicamente por interview_at", () => {
  const later = lead("later", {
    status: "entrevista",
    interview_at: "2026-09-15T10:00:00-03:00",
    interview_operational_status: "scheduled"
  });
  const sooner = lead("sooner", {
    status: "entrevista",
    interview_at: "2026-09-14T14:00:00-03:00",
    interview_operational_status: "scheduled"
  });

  const sections = agenda.portfolioSections([later, sooner], { now: NOW });
  assert.equal(sections.upcoming.length, 2);
  assert.equal(sections.upcoming[0].id, "sooner");
  assert.equal(sections.upcoming[1].id, "later");
  assert.equal(sections.integrity.length, 0);
});

test("las acciones manuales fuera de Entrevista conservan su comportamiento", () => {
  const current = lead("gestion", {
    status: "en_proceso",
    next_contact_at: "2026-09-14T17:00:00-03:00",
    next_contact_note: "Volver a llamar",
    next_contact_source: "manual"
  });
  const action = agenda.manualAction(current);
  assert.equal(action.at, "2026-09-14T17:00:00-03:00");
  assert.equal(action.note, "Volver a llamar");
  assert.equal(action.source, "manual");
  assert.equal(agenda.agendaBucket(current, NOW), "upcoming");
});
