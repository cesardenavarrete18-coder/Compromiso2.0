import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../vendedores/final-minute.js", import.meta.url), "utf8");
const context = { window: {}, Intl, Date, Number, String, Array, JSON, Promise, setTimeout };
vm.createContext(context);
vm.runInContext(source, context);
const minute = context.window.grupoSurFinalMinute;

const campaignRow = {
  id: "campaign-tera",
  updated_at: "2026-08-27T14:00:00.000Z",
  plan_name: "Plan 70/30",
  version_name: "Trend 1.6 MSI",
  transmission: "MT",
  installment_count: 84,
  final_price: 31000000,
  advance_amount: 9000000,
  installment_amount: 430000,
  installment_is_from: true,
  active: true,
  bonus: "Bonificación vigente",
  benefits: ["Entrega pactada"],
  model: { name: "Tera", image_path: "/assets/vw-tera.webp", brand: { name: "Volkswagen" } }
};

test("las fechas visibles usan dd/mm/yyyy y rechazan fechas imposibles", () => {
  assert.equal(minute.parseDisplayDate("27/08/2026"), "2026-08-27");
  assert.equal(minute.displayDateInput("2026-08-27"), "27/08/2026");
  assert.equal(minute.parseDisplayDate("31/02/2026"), "");
  assert.equal(minute.parseDisplayDate("2026-08-27"), "");
});

test("la campaña normalizada conserva todos los datos centrales sin defaults", () => {
  const campaign = minute.normalizeCampaign(campaignRow);
  assert.deepEqual(JSON.parse(JSON.stringify(campaign)), {
    id: "campaign-tera",
    updatedAt: "2026-08-27T14:00:00.000Z",
    active: true,
    validFrom: "",
    validTo: "",
    brand: "Volkswagen",
    model: "Tera",
    version: "Trend 1.6 MSI MT",
    versionName: "Trend 1.6 MSI",
    transmission: "MT",
    planName: "Plan 70/30",
    planDescription: "Plan 70/30 · 84 cuotas",
    installmentCount: 84,
    finalPrice: 31000000,
    advanceAmount: 9000000,
    installmentAmount: 430000,
    installmentIsFrom: true,
    bonus: "Bonificación vigente",
    benefits: ["Entrega pactada"],
    image: "/assets/vw-tera.webp"
  });
  assert.equal(minute.normalizeCampaign({ model: {} }).installmentCount, null);
});

test("la huella detecta un cambio de precio o versión de la ficha", () => {
  const original = minute.normalizeCampaign(campaignRow);
  const changed = minute.normalizeCampaign({ ...campaignRow, final_price: 32000000, updated_at: "2026-08-27T14:05:00.000Z" });
  assert.notEqual(minute.campaignFingerprint(original), minute.campaignFingerprint(changed));
});

test("el snapshot registra campaign_id, precio vigente y momento de lectura", () => {
  const campaign = minute.normalizeCampaign(campaignRow);
  const snapshot = minute.commercialSnapshot(campaign, { caseCode: "GS-VTA-1", prequalificationCode: "GS-20260827-ABC", sellerName: "Cesar", sellerCode: "GS-01" });
  assert.equal(snapshot.campaign_id, "campaign-tera");
  assert.equal(snapshot.final_price, 31000000);
  assert.equal(snapshot.total_installments, 84);
  assert.equal(snapshot.prequalification_code, "GS-20260827-ABC");
  assert.ok(snapshot.campaign_read_at);
});

test("el renderer compartido conserva la estructura histórica completa", () => {
  const campaign = minute.normalizeCampaign(campaignRow);
  const snapshot = minute.commercialSnapshot(campaign, { caseCode: "GS-VTA-1", prequalificationCode: "GS-20260827-ABC", sellerName: "Cesar de Navarrete", sellerCode: "GS-01" });
  const application = {
    request_code: "GS-VTA-1-R1",
    submitted_at: "2026-08-27T17:30:00.000Z",
    commercial_snapshot: snapshot,
    first_name: "Adrian Angel",
    last_name: "Schocron",
    document_type: "DNI",
    document_number: "22551899",
    cuil: "20225518999",
    birth_date: "1971-12-25",
    address: "12 de Octubre",
    city_province: "Quilmes",
    postal_code: "1878",
    marital_status: "Casado/a",
    spouse_name: "Claudia",
    spouse_document: "27206355",
    primary_phone: "1144354439",
    alternate_phone: "1144354439",
    email: "cliente@example.com",
    contact_schedule: "10 a 16 hs",
    employment_status: "Monotributista / autónomo",
    employer_name: "Actividad independiente",
    employment_seniority: "7",
    monthly_income: 2000000,
    automatic_debit: false,
    deferred_installment: false,
    installments_paid: 1,
    installments_to_pay: 83,
    plan_type: "Plan 70/30 · 84 cuotas",
    agreed_price: 31000000,
    first_payment_date: "2026-08-27",
    first_payment_amount: 430000,
    second_payment_date: null,
    second_payment_amount: null
  };
  const html = minute.buildHtml(minute.fromApplication(application, { caseCode: "GS-VTA-1" }));
  for (const expected of ["minute-brand-logo", "minute-vehicle", "Datos del cliente", "Contacto y situación laboral", "Condiciones comerciales", "Constancia y condiciones", "Primer pago", "Segundo pago", "Bonificación", "Firma del cliente", "GS-MINUTA-2026-01"]) assert.ok(html.includes(expected), expected);
  assert.ok(html.includes("27/08/2026"));
  assert.ok(html.includes("25/12/1971"));
  assert.ok(!html.includes("1971-12-25"));
  assert.ok(html.includes("$ 31.000.000"));
});
