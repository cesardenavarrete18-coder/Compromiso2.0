import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sales = readFileSync(new URL("../vendedores/sales.js", import.meta.url), "utf8");
const admin = readFileSync(new URL("../vendedores/admventas/admventas.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260827190000_restore_shared_final_minute.sql", import.meta.url), "utf8");

test("un savings_plan aprobado habilita la Minuta Definitiva", () => {
  assert.ok(sales.includes('function requiresFinalMinute(salesCase) { return caseOfferType(salesCase) === "savings_plan"; }'));
  assert.ok(sales.includes('var minuteRequired = requiresFinalMinute(item); var canMinute = minuteRequired && (item.status === "minute_pending" || item.cdn_scoring_status === "observed")'));
  assert.ok(sales.includes('canMinute ? \'<button class="primary-button compact-button" data-open-minute'));
  assert.ok(migration.includes("case when v_offer_type = 'bank_credit' then 'quality_control' else 'minute_pending' end"));
});

test("un bank_credit aprobado no muestra ni habilita Completar minuta", () => {
  assert.ok(sales.includes('minuteRequired ? "La minuta todavía no fue enviada" : "Crédito aprobado · no requiere Minuta Definitiva"'));
  assert.ok(sales.includes("if (!requiresFinalMinute(state.activeCase)) return;"));
  assert.ok(admin.includes('"No requerida para créditos bancarios o de terminal"'));
  assert.ok(admin.includes('!minuteRequired || !application'));
});

test("bank_credit queda fuera de cualquier consulta de campaigns o campaign_id", () => {
  const offerTypeHelper = sales.slice(sales.indexOf("function caseOfferType"), sales.indexOf("function renderSales"));
  assert.ok(!offerTypeHelper.includes("campaignIdForCase"));
  assert.ok(!offerTypeHelper.includes('from("campaigns")'));
  const openMinute = sales.slice(sales.indexOf("async function openMinute"), sales.indexOf("async function verifyCaseCanSubmit"));
  assert.ok(openMinute.indexOf("if (!requiresFinalMinute(state.activeCase)) return;") < openMinute.indexOf("fetchCurrentCampaign"));
  const sqlOfferType = migration.slice(migration.indexOf("create or replace function private.sales_case_offer_type"), migration.indexOf("create or replace function private.resolve_current_sales_plan"));
  assert.ok(!sqlOfferType.includes("public.campaigns"));
  assert.ok(!sqlOfferType.includes("campaign_id"));
  const enforcement = migration.slice(migration.indexOf("create or replace function private.enforce_plan_minute_identity"), migration.indexOf("create or replace function public.get_sales_case_current_plan"));
  assert.ok(enforcement.indexOf("v_offer_type = 'bank_credit'") < enforcement.indexOf("private.resolve_current_sales_plan(new.sales_case_id)"));
});

test("el crédito conserva aviso al administrativo y las tres etapas del circuito", () => {
  assert.ok(sales.includes("request_admin_sales_call"));
  assert.ok(migration.includes("v_offer_type is distinct from 'bank_credit' and not exists"));
  const stages = migration.slice(migration.indexOf("create or replace function public.record_sales_stage"));
  for (const stage of ["cdn_scoring", "dealer_scoring", "contract"]) assert.ok(stages.includes(stage), stage);
  assert.ok(stages.includes("when 'approved' then 'dealer_scoring'"));
  assert.ok(stages.includes("when 'approved' then 'contract_signature'"));
  assert.ok(stages.includes("when p_outcome = 'approved' then 'formation_group'"));
  assert.ok(admin.includes('stageCard(item, "cdn_scoring", item.cdn_scoring_status, !closed && (!minuteRequired || !!application))'));
  for (const existingCreditFeature of ["bank_credit_offers", "bank_credit_offer_id", "breakage_amount", "final_advance_amount"]) assert.ok(sales.includes(existingCreditFeature), existingCreditFeature);
});
