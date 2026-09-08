import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");
const crm = readFileSync(new URL("../vendedores/crm.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../vendedores/crm.css", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260907150000_crm_v2_transition_matrix.sql", import.meta.url), "utf8");
const sales = readFileSync(new URL("../vendedores/sales.js", import.meta.url), "utf8");
const transitionsSource = readFileSync(new URL("../vendedores/crm-transition-model.js", import.meta.url), "utf8");
const context = {}; context.globalThis = context; runInNewContext(transitionsSource, context);
const transitions = context.grupoSurCRMTransitions;

function rpc(name, next = "revoke all on function") {
  const start = migration.indexOf(`create or replace function public.${name}`);
  return start < 0 ? "" : migration.slice(start, migration.indexOf(next, start));
}

test("los seis estados restantes reutilizan el único shell y herramientas existentes", () => {
  assert.equal((html.match(/id="crmStateWorkspace"/g) || []).length, 1);
  assert.ok(crm.includes('["entrevista", "cierre", "sena", "venta", "desistir", "invalido"]'));
  for (const id of ["crmBudgetButton", "crmSaleButton", "crmCommentButton", "crmTimeline", "crmCustomerHistory", "crmChat"]) assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, id);
  assert.ok(css.includes(".crm-state-panel"));
});

test("Entrevista admite sólo Presencial/Videollamada y sus estados operativos no cambian el funnel", () => {
  const operation = rpc("record_interview_operation");
  assert.match(operation, /p_mode not in \('presencial', 'videollamada'\)/);
  assert.match(operation, /p_operational_status not in \('scheduled', 'confirmed', 'rescheduled', 'no_show'\)/);
  assert.match(operation, /where lead_id = p_lead_id and status = 'entrevista'/);
  assert.doesNotMatch(operation, /update public\.lead_crm set\s+status\s*=/);
  assert.ok(operation.includes("Una entrevista completada requiere registrar el resultado comercial"));
  for (const status of ["scheduled", "confirmed", "rescheduled", "no_show", "completed"]) assert.ok(migration.includes(`'${status}'`));
  assert.ok(crm.includes('data-interview-operation="rescheduled"'));
  assert.ok(crm.includes('data-interview-operation="no_show"'));
  assert.ok(crm.includes("Completar entrevista y registrar resultado"));
});

test("Entrevista y Cierre respetan exactamente la matriz final", () => {
  assert.deepEqual(Array.from(transitions.allowedFrom("entrevista")), ["en_proceso", "entrevista", "cierre", "sena", "venta", "desistir"]);
  assert.deepEqual(Array.from(transitions.allowedFrom("cierre")), ["cierre", "entrevista", "en_proceso", "sena", "venta", "desistir"]);
  assert.equal(transitions.canTransition("entrevista", "cierre"), true);
  assert.equal(transitions.canTransition("entrevista", "en_proceso"), true);
  assert.equal(transitions.canTransition("cierre", "entrevista"), true);
  assert.equal(transitions.canTransition("cierre", "en_proceso"), true);
  assert.equal(transitions.canTransition("cierre", "sena"), true);
  assert.ok(crm.includes("La modalidad, capacidad, anticipo, usado y calificación deben estar resueltos antes de esta etapa"));
  assert.doesNotMatch(crm.match(/if \(status === "cierre"\)[\s\S]*?else if/)?.[0] || "", /input.*capacidad|input.*anticipo|input.*modalidad/i);
});

test("Seña es persistente y sus acciones posteriores no cambian el estado comercial", () => {
  assert.deepEqual(Array.from(transitions.allowedFrom("sena")), ["sena", "venta", "desistir"]);
  assert.equal(transitions.canTransition("sena", "cierre"), false);
  assert.equal(transitions.canTransition("sena", "en_proceso"), false);
  assert.equal(transitions.canTransition("sena", "entrevista"), false);
  const postDeposit = rpc("record_post_deposit_interview");
  assert.match(postDeposit, /where lead_id = p_lead_id and status = 'sena'/);
  assert.doesNotMatch(postDeposit, /update public\.lead_crm set\s+status\s*=/);
  assert.ok(crm.includes('data-post-deposit-operation="scheduled"'));
  assert.ok(crm.includes('data-post-deposit-operation="confirmed"'));
  assert.ok(crm.includes('data-post-deposit-operation="rescheduled"'));
  assert.ok(crm.includes('data-post-deposit-operation="completed"'));
  const management = migration.slice(migration.indexOf("create or replace function public.record_lead_follow_up"), migration.indexOf("create or replace function public.record_contact_answer_with_transition"));
  assert.ok(management.includes("deposit_amount = coalesce(p_deposit_amount, deposit_amount)"));
  assert.ok(management.includes("deposit_at = case when p_status = 'sena' then now() else deposit_at end"));
});

test("Venta permanece terminal y reutiliza Datero/Administración", () => {
  assert.deepEqual(Array.from(transitions.allowedFrom("venta")), ["venta"]);
  assert.ok(crm.includes("data-open-existing-datero"));
  assert.ok(crm.includes('openView("sales")'));
  assert.ok(sales.includes("commercial_applications"));
  assert.ok(sales.includes("request_admin_sales_call"));
  assert.ok(crm.includes("El estado permanece Venta y no vuelve al funnel comercial"));
  const requestSale = rpc("request_lead_sale_v2");
  const reviewSale = rpc("review_lead_sale");
  assert.doesNotMatch(requestSale, /public\.sales_quotes/);
  assert.doesNotMatch(requestSale, /notes, quote_id/);
  assert.ok(requestSale.includes("if p_quote_id is null then"));
  assert.ok(requestSale.includes("insert into public.lead_sale_requests (lead_id, seller_user_id, vehicle, sale_amount, notes)"));
  assert.ok(requestSale.includes("p_quote_id is not null and not private.sale_quote_matches_lead"));
  assert.ok(requestSale.includes("private.create_lead_sale_request_with_quote"));
  assert.ok(migration.includes("Este entorno no soporta asociar presupuestos a solicitudes de venta"));
  assert.ok(requestSale.includes("case when v_current_status = 'sena' then 'sena' else 'cierre' end"));
  assert.doesNotMatch(reviewSale, /reviewed_by|reviewed_at|review_note\s*=/);
  assert.ok(reviewSale.includes("perform private.enrich_lead_sale_request_review"));
  assert.ok(reviewSale.includes("insert into public.sales_cases"));
  assert.ok(reviewSale.includes("case when p_approved then 'venta' when v_current_status = 'sena' then 'sena' else 'cierre' end"));
});

test("Desistir e Inválido son terminales manuales con trazabilidad", () => {
  assert.deepEqual(Array.from(transitions.allowedFrom("desistir")), []);
  assert.deepEqual(Array.from(transitions.allowedFrom("invalido")), []);
  assert.equal(transitions.canTransition("desistir", "nuevo"), false);
  assert.equal(transitions.canTransition("invalido", "nuevo"), false);
  assert.ok(migration.includes("p_status = 'desistir' and trim(coalesce(p_note, '')) = 'No contactado post protocolo' then now()"));
  assert.ok(migration.includes("else 'Oportunidad desistida' end"));
  assert.match(migration, /p_status in \('invalido', 'desistir'\)[\s\S]*Indicá el motivo/);
  assert.ok(migration.includes("previous_status = case when p_status in ('desistir', 'invalido')"));
  assert.ok(crm.includes('baseCold ? "Base fría"'));
  assert.ok(crm.includes("Histórica sin fecha inferida"));
  assert.ok(crm.includes("Una reactivación requiere un nuevo ciclo autorizado"));
});
