import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../vendedores/app.js", import.meta.url), "utf8");
const crm = readFileSync(new URL("../vendedores/crm.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260827230000_crm_lead_shared_datero.sql", import.meta.url), "utf8");

const applicationOpener = app.slice(
  app.indexOf("function openCommercialApplication(context)"),
  app.indexOf("function saveCommercialApplication(data)")
);
const crmSaleHandler = crm.slice(
  crm.indexOf('document.getElementById("crmSaleButton").addEventListener'),
  crm.indexOf('document.getElementById("crmSaleSubmit").addEventListener')
);

test("Precalificado → Completar solicitud comercial sigue abriendo applicationView", () => {
  assert.ok(app.includes('openCommercialApplication({ origin: "prequalification" })'));
  assert.ok(applicationOpener.includes('setView("application")'));
  assert.ok(applicationOpener.includes('if (!state.prequalificationId)'));
});

test("CRM Lead → Enviar datero abre el mismo applicationView", () => {
  assert.ok(crmSaleHandler.includes('window.grupoSurCommercialApplication.open({ origin: "crm_lead", lead: lead })'));
  assert.ok(app.includes("open: openCommercialApplication"));
  assert.ok(applicationOpener.includes('setView("application")'));
});

test("existe un solo applicationForm y un solo applicationView", () => {
  assert.equal((html.match(/id="applicationForm"/g) || []).length, 1);
  assert.equal((html.match(/id="applicationView"/g) || []).length, 1);
});

test("Enviar datero no abre crmSaleDialog", () => {
  assert.ok(crmSaleHandler.includes("leadDialog.close()"));
  assert.ok(!crmSaleHandler.includes("saleDialog.showModal()"));
  assert.ok(!crmSaleHandler.includes('from("sales_quotes")'));
});

test("el Datero precarga únicamente los datos personales existentes del Lead", () => {
  assert.ok(crm.includes("customer:customers(full_name,primary_phone,email,document_number,cuil)"));
  for (const mapping of [
    "customer.full_name || lead.customer_name",
    "customer.primary_phone || lead.customer_phone",
    "customer.email || \"\"",
    "customer.cuil || \"\"",
    "customer.document_number || \"\""
  ]) assert.ok(app.includes(mapping), mapping);
  assert.ok(applicationOpener.includes("applicationForm.elements.cuil.readOnly = !isCrmLead"));
});

test("un Datero originado desde CRM se guarda y se envía a Supervisión", () => {
  assert.ok(app.includes("payload.lead_id = state.applicationContext.leadId"));
  assert.ok(app.includes('? "submit_crm_lead_sale"'));
  assert.ok(migration.includes("create function public.submit_crm_lead_sale"));
  assert.ok(migration.includes("insert into public.lead_sale_requests"));
  assert.ok(migration.includes("provisional_application_id"));
  assert.ok(migration.includes("sale_confirmation_status = 'pending'"));
  assert.ok(migration.includes("'Datero enviado a supervisión'"));
});

test("el flujo original de Precalificado conserva su persistencia", () => {
  assert.ok(app.includes("payload.prequalification_event_id = state.prequalificationId"));
  assert.ok(app.includes(': "submit_prequalification_sale"'));
  assert.ok(app.includes('onConflict: isCrmLead ? "lead_id" : "prequalification_event_id"'));
  assert.ok(!migration.includes("create or replace function public.submit_prequalification_sale"));
});
