import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");
const crm = readFileSync(new URL("../vendedores/crm.js", import.meta.url), "utf8");
const mobileNavigation = readFileSync(new URL("../vendedores/mobile-navigation.js", import.meta.url), "utf8");
const agendaModelSource = readFileSync(new URL("../vendedores/agenda-model.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../vendedores/crm.css", import.meta.url), "utf8");
const context = { Intl, Date };
context.globalThis = context;
runInNewContext(agendaModelSource, context);
const model = context.grupoSurAgendaModel;

function lead(id, status, nextContactAt, createdAt = "2026-09-07T12:00:00-03:00") {
  return {
    id,
    created_at: createdAt,
    crm: { status, next_contact_at: nextContactAt || null, next_contact_note: "Contactar", next_contact_source: nextContactAt ? "manual" : null }
  };
}

test("Mi Cartera reemplaza Mi agenda en todas las superficies de navegación", () => {
  assert.match(html, />\s*Mi Cartera\s*<\/button>/);
  assert.match(html, /id="crmAgendaTitle">Mi Cartera<\/h2>/);
  assert.doesNotMatch(html, />\s*Mi agenda\s*<\/button>/i);
  assert.ok(crm.includes('viewName === "agenda" ? "Mi Cartera"'));
  assert.ok(mobileNavigation.includes('agenda: "Mi Cartera"'));
  assert.doesNotMatch(html, /Cartera comercial/);
});

test("Mi Cartera expone filtros de estado y vistas operativas accesibles", () => {
  for (const status of ["all", "nuevo", "no_contesta", "contacto_futuro", "en_proceso", "entrevista", "cierre", "sena"]) {
    assert.ok(html.includes(`data-portfolio-status="${status}"`));
  }
  for (const view of ["today", "overdue", "upcoming"]) assert.ok(html.includes(`data-portfolio-view="${view}"`));
  assert.ok(crm.includes('state.portfolioStatus = button.dataset.portfolioStatus'));
  assert.ok(crm.includes('state.portfolioView = state.portfolioView === button.dataset.portfolioView ? "all"'));
});

test("la priorización usa únicamente el próximo contacto manual canónico", () => {
  const now = "2026-09-07T15:00:00-03:00";
  const rows = [
    lead("next-late", "en_proceso", "2026-09-08T18:00:00-03:00"),
    lead("today-late", "cierre", "2026-09-07T18:00:00-03:00"),
    lead("overdue-late", "en_proceso", "2026-09-07T14:30:00-03:00"),
    lead("today-early", "entrevista", "2026-09-07T16:00:00-03:00"),
    lead("new", "nuevo", null, "2026-09-07T10:00:00-03:00"),
    lead("overdue-early", "no_contesta", "2026-09-06T11:00:00-03:00"),
    lead("next-early", "sena", "2026-09-08T09:00:00-03:00"),
    lead("legacy", "en_proceso", null)
  ];
  const sections = model.portfolioSections(rows, { now, status: "all" });
  assert.deepEqual(Array.from(sections.overdue, item => item.id), ["overdue-early", "overdue-late"]);
  assert.deepEqual(Array.from(sections.today, item => item.id), ["today-early", "today-late"]);
  assert.deepEqual(Array.from(sections.upcoming, item => item.id), ["next-early", "next-late"]);
  assert.deepEqual(Array.from(sections.newLead, item => item.id), ["new"]);
  assert.deepEqual(Array.from(sections.integrity, item => item.id), ["legacy"]);
});

test("el filtro de estado incluye la taxonomía V2 sin inferir estados", () => {
  const rows = [lead("future", "contacto_futuro", "2026-09-08T10:00:00-03:00"), lead("management", "en_proceso", "2026-09-08T11:00:00-03:00")];
  const filtered = model.portfolioSections(rows, { now: "2026-09-07T15:00:00-03:00", status: "contacto_futuro" });
  assert.deepEqual(Array.from(filtered.upcoming, item => item.id), ["future"]);
});

test("la UI usa tarjetas operativas responsive y no crea Sin próximo contacto", () => {
  assert.ok(crm.includes('data-card-stage="'));
  assert.ok(crm.includes('cardActionLabel(crm.status)'));
  assert.ok(styles.includes(".portfolio-card"));
  assert.ok(styles.includes("@media(max-width:760px)"));
  assert.doesNotMatch(crm, /agendaGroup\("Sin próxima acción"/);
  assert.doesNotMatch(html, />Sin próximo contacto</i);
});
