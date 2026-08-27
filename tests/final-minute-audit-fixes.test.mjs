import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sellerHtml = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");
const sales = readFileSync(new URL("../vendedores/sales.js", import.meta.url), "utf8");
const sharedForm = readFileSync(new URL("../vendedores/final-minute-form.js", import.meta.url), "utf8");
const adminHtml = readFileSync(new URL("../vendedores/admventas/index.html", import.meta.url), "utf8");
const admin = readFileSync(new URL("../vendedores/admventas/admventas.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260827190000_restore_shared_final_minute.sql", import.meta.url), "utf8");

test("existe una sola implementación del formulario definitivo con adapters por origen", () => {
  assert.ok(!sellerHtml.includes("salesMinuteDialog"));
  assert.ok(!sellerHtml.includes("salesMinuteForm"));
  assert.ok(sellerHtml.includes("/vendedores/final-minute-form.js"));
  assert.equal((sharedForm.match(/id="finalMinuteForm"/g) || []).length, 1);
  assert.ok(sharedForm.includes("prequalification: function"));
  assert.ok(sharedForm.includes("sales: function"));
  assert.ok(sales.includes("window.grupoSurFinalMinuteForm.mount()"));
  assert.ok(sales.includes('origin = provisional ? "prequalification" : "sales"'));
  assert.ok(sellerHtml.includes('id="applicationForm"'));
});

test("la validación server-side aplica a todo INSERT definitivo sin confiar en source", () => {
  assert.ok(migration.includes("if new.sales_case_id is null then"));
  assert.ok(migration.includes("before insert or update on public.commercial_applications"));
  assert.ok(!migration.includes("if coalesce(new.commercial_snapshot ->> 'source'"));
  assert.ok(migration.includes("private.resolve_current_sales_plan(new.sales_case_id)"));
  for (const required of ["campaign_id", "campaign_active", "model_active", "brand_active", "version_name", "plan_name", "installment_count", "final_price", "advance_amount", "installment_amount", "bonus", "image_path", "campaign_updated_at"]) assert.ok(migration.includes(required), required);
  assert.ok(migration.includes("new.brand_name := trim(v_plan.brand_name)"));
  assert.ok(migration.includes("new.agreed_price := v_plan.final_price"));
  assert.ok(migration.includes("La Minuta Definitiva es inmutable"));
});

test("Administración revisa contra campaña vigente y no edita campos comerciales", () => {
  const form = adminHtml.slice(adminHtml.indexOf('id="minuteEditForm"'), adminHtml.indexOf("</form></dialog>", adminHtml.indexOf('id="minuteEditForm"')));
  for (const name of ["brand_name", "model_name", "version_name", "plan_type", "total_installments", "agreed_price"]) assert.match(form, new RegExp('name="' + name + '"[^>]*readonly'));
  for (const name of ["birth_date", "first_payment_date", "second_payment_date"]) assert.match(form, new RegExp('name="' + name + '"[^>]*type="text"[^>]*placeholder="dd/mm/yyyy"'));
  assert.ok(!form.includes('type="date"'));
  assert.ok(admin.includes('rpc("get_sales_case_current_plan"'));
  assert.ok(admin.includes("finalMinute.parseDisplayDate"));
  const saveEditor = admin.slice(admin.indexOf("async function saveMinuteEdit"), admin.indexOf("async function uploadDocument"));
  for (const protectedName of ["brand_name", "model_name", "version_name", "plan_type", "total_installments", "agreed_price", "installments_paid", "installments_to_pay"]) {
    assert.ok(!saveEditor.includes('changes["' + protectedName + '"]'), protectedName);
    assert.ok(!saveEditor.includes('changes.' + protectedName), protectedName);
  }
  const revise = migration.slice(migration.indexOf("create or replace function public.revise_sales_minute"));
  assert.ok(revise.includes("private.resolve_current_sales_plan(p_sales_case_id)"));
  assert.ok(revise.includes("'campaign_updated_at', v_plan.campaign_updated_at"));
  assert.ok(revise.includes("v_new.supersedes_application_id := v_current.id"));
  assert.ok(revise.indexOf("insert into public.commercial_applications") < revise.indexOf("set status = 'superseded'"));
});
