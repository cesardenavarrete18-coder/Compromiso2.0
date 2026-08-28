import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

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
  crm.indexOf('commercialBrandSelect.addEventListener')
);
const selectorSubmit = crm.slice(
  crm.indexOf('commercialSelectionForm.addEventListener("submit"'),
  crm.indexOf('document.getElementById("crmRefreshButton")')
);

test("Precalificado → Completar solicitud comercial sigue abriendo applicationView", () => {
  assert.ok(app.includes('openCommercialApplication({ origin: "prequalification" })'));
  assert.ok(applicationOpener.includes('setView("application")'));
  assert.ok(applicationOpener.includes('if (!state.prequalificationId)'));
});

test("CRM Lead → Enviar datero pasa por el selector y luego abre el mismo applicationView", () => {
  assert.ok(crmSaleHandler.includes("openCommercialSelection(this)"));
  assert.ok(selectorSubmit.includes('window.grupoSurCommercialApplication.open({ origin: "crm_lead", lead: lead, campaignId: campaign.id })'));
  assert.ok(app.includes("open: openCommercialApplication"));
  assert.ok(applicationOpener.includes('setView("application")'));
});

test("existe un solo applicationForm y un solo applicationView", () => {
  assert.equal((html.match(/id="applicationForm"/g) || []).length, 1);
  assert.equal((html.match(/id="applicationView"/g) || []).length, 1);
});

test("el selector no usa crmSaleDialog, presupuestos ni Precalificación", () => {
  assert.ok(html.includes('id="crmCommercialSelectionDialog"'));
  assert.ok(!html.includes('id="crmSaleDialog"'));
  assert.ok(!crmSaleHandler.includes("saleDialog.showModal()"));
  assert.ok(!crmSaleHandler.includes('from("sales_quotes")'));
  assert.ok(!crmSaleHandler.includes("prequalification"));
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

test("Marca, Modelo, Versión y Plan provienen del catálogo central vigente", () => {
  assert.ok(app.includes('.from("campaigns")'));
  assert.ok(app.includes("row.active && model.active && brand.active"));
  assert.ok(app.includes("model.offers.filter(isCampaignActive)"));
  for (const id of ["crmCommercialBrand", "crmCommercialModel", "crmCommercialVersion", "crmCommercialPlan"]) {
    assert.equal((html.match(new RegExp('id="' + id + '"', "g")) || []).length, 1, id);
  }
  assert.ok(crm.includes("autoSelectOnly(commercialModelSelect"));
  assert.ok(crm.includes("autoSelectOnly(commercialVersionSelect"));
  assert.ok(crm.includes("autoSelectOnly(commercialPlanSelect"));
});

test("la campaña se resuelve exclusivamente por campaign_id real", () => {
  assert.ok(app.includes("item.campaignId === campaignId"));
  assert.ok(selectorSubmit.includes("campaignId: campaign.id"));
  assert.ok(app.includes("payload.campaign_id = state.applicationContext.campaignId"));
  assert.ok(migration.includes("where campaign.id = v_application.campaign_id"));
  assert.ok(!applicationOpener.includes("model_interest"));
});

test("Tera como interés no altera una venta Peugeot 208 y 70/30 y 80/20 conservan IDs distintos", () => {
  const lead = { model_interest: "Volkswagen Tera" };
  const offer = (id, plan, finalPrice) => ({
    campaignId: id, campaign: plan, versionName: "Allure", transmission: "MT",
    installmentCount: 84, finalPrice, advanceAmount: 6000000, installmentAmount: 450000,
    active: true, validFrom: "", validTo: ""
  });
  const context = {
    BRANDS: {
      Volkswagen: { models: [{ id: "tera", name: "Tera", image: "tera.webp", active: true, offers: [offer("campaign-tera", "70/30", 35000000)] }] },
      Peugeot: { models: [{ id: "208", name: "208", image: "208.webp", active: true, offers: [offer("campaign-208-70", "70/30", 31000000), offer("campaign-208-80", "80/20", 33500000)] }] }
    }
  };
  const helpers = app.slice(app.indexOf("function vehicleVersion"), app.indexOf("async function loadCentralCampaigns"))
    + app.slice(app.indexOf("function isCampaignActive"), app.indexOf("function initials"));
  runInNewContext(helpers + '; catalog = buildCommercialCatalog(); selected70 = resolveCommercialCampaign("campaign-208-70"); selected80 = resolveCommercialCampaign("campaign-208-80");', context);
  const peugeot = context.catalog.find((brand) => brand.name === "Peugeot");
  const version = peugeot.models[0].versions[0];
  assert.equal(lead.model_interest, "Volkswagen Tera");
  assert.equal(`${context.selected70.brandName} ${context.selected70.model.name} ${version.label}`, "Peugeot 208 Allure MT");
  assert.deepEqual(Array.from(version.campaigns, (campaign) => campaign.id), ["campaign-208-70", "campaign-208-80"]);
  assert.notEqual(context.selected70.offer.campaignId, context.selected80.offer.campaignId);
  assert.notEqual(context.selected70.offer.finalPrice, context.selected80.offer.finalPrice);
  assert.ok(!migration.includes("update public.leads"));
});

test("el Plan y el valor final quedan canónicos y readonly en el Datero CRM", () => {
  assert.ok(applicationOpener.includes("applicationForm.elements.planType.readOnly = isCrmLead"));
  assert.ok(applicationOpener.includes("applicationForm.elements.agreedPrice.readOnly = true"));
  assert.ok(applicationOpener.includes("planType: planDescription(state.model)"));
  assert.ok(applicationOpener.includes("agreedPrice: state.model.finalPrice"));
  assert.ok(app.includes("agreedPrice: Number(state.model.finalPrice) || null"));
});

test("la operación conserva identidad y condiciones canónicas de la campaña", () => {
  for (const value of [
    "campaignId: state.model.campaignId",
    "modelId: state.model.id",
    "version: state.model.versionName",
    "transmission: state.model.transmission",
    "installmentCount: state.model.installmentCount",
    "advanceAmount: state.model.advanceAmount",
    "installmentAmount: state.model.installmentAmount",
    "bonus: state.model.bonus",
    "image: state.model.image"
  ]) assert.ok(app.includes(value), value);
  assert.ok(migration.includes("v_application.campaign_id"));
  assert.ok(migration.includes("v_application.installments_to_pay is distinct from v_installment_count"));
  assert.ok(migration.includes("v_application.agreed_price is distinct from v_final_price"));
  assert.ok(migration.includes("commercial_snapshot ->> 'version' is distinct from v_version_name"));
  assert.ok(migration.includes("commercial_snapshot ->> 'advanceAmount'"));
  assert.ok(migration.includes("commercial_snapshot -> 'benefits' is distinct from to_jsonb(v_benefits)"));
});

test("faltantes obligatorios bloquean Continuar con un mensaje claro", () => {
  assert.ok(app.includes("function commercialCampaignError"));
  assert.ok(app.includes("no tiene un valor final vigente cargado"));
  assert.ok(app.includes("no tiene anticipo o cuota vigentes cargados"));
  assert.ok(crm.includes("!campaign || Boolean(validationError)"));
  assert.ok(selectorSubmit.includes("validateCampaign(campaign.id)"));
  assert.ok(selectorSubmit.includes("if (error) return"));
  assert.ok(migration.includes("La campaña seleccionada tiene datos obligatorios incompletos"));
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
