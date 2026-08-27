import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../vendedores/app.js", import.meta.url), "utf8");
const sales = readFileSync(new URL("../vendedores/sales.js", import.meta.url), "utf8");
const sellerHtml = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");
const adminHtml = readFileSync(new URL("../vendedores/admventas/index.html", import.meta.url), "utf8");
const admin = readFileSync(new URL("../vendedores/admventas/admventas.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260827190000_restore_shared_final_minute.sql", import.meta.url), "utf8");

test("el Datero sigue siendo provisorio, sin pagos y enviado a Supervisión", () => {
  const dateroRenderer = app.slice(app.indexOf("function buildMinute(data)"), app.indexOf("function printMinute()"));
  assert.ok(dateroRenderer.includes("Datero provisorio"));
  assert.ok(dateroRenderer.includes("Este datero no registra ni acredita pagos"));
  assert.ok(!dateroRenderer.includes('minuteRow("Primer pago"'));
  assert.ok(!dateroRenderer.includes('minuteRow("Segundo pago"'));
  assert.ok(app.includes('rpc("submit_prequalification_sale"'));
});

test("Mis Ventas no conserva el renderer simplificado ni fallbacks comerciales", () => {
  assert.ok(!sales.includes("printSalesMinute"));
  assert.ok(!sales.includes("deriveMinuteCommercial"));
  assert.ok(!sales.includes("|| 84"));
  assert.ok(!sales.includes("salesCase.vehicle.toLowerCase().includes"));
  assert.ok(sales.includes("fetchCurrentCampaign(campaignIdForCase(state.activeCase))"));
  assert.ok(sales.includes("revalidateCampaign(errorBox)"));
});

test("los campos centrales están bloqueados y las fechas definitivas no usan input date", () => {
  const form = sellerHtml.slice(sellerHtml.indexOf('id="salesMinuteForm"'), sellerHtml.indexOf("</form></dialog>", sellerHtml.indexOf('id="salesMinuteForm"')));
  for (const name of ["brandName", "modelName", "versionName", "planType", "totalInstallments", "agreedPrice", "advanceAmount", "installmentAmount", "bonus"]) {
    assert.match(form, new RegExp('name="' + name + '"[^>]*readonly'));
  }
  for (const name of ["birthDate", "firstPaymentDate", "secondPaymentDate"]) {
    assert.match(form, new RegExp('name="' + name + '"[^>]*type="text"[^>]*placeholder="dd/mm/yyyy"'));
  }
  assert.ok(!form.includes('type="date"'));
});

test("vendedor y Administración imprimen con el mismo renderer compartido", () => {
  assert.ok(sellerHtml.includes("/vendedores/final-minute.js"));
  assert.ok(adminHtml.includes("/vendedores/final-minute.js"));
  assert.ok(sales.includes("finalMinute.print"));
  assert.ok(admin.includes("finalMinute.print"));
  assert.ok(!admin.includes("Minuta de venta · ' + escapeHtml(state.activeCase.case_code)"));
});

test("la base valida campaign_id, versión de campaña y cuotas reales sin default 84", () => {
  assert.ok(migration.includes("sale_request.provisional_application_id"));
  assert.ok(migration.includes("sale_request.quote_id is not null"));
  assert.ok(migration.includes("sales_case.quote_id = sale_request.quote_id"));
  assert.ok(migration.includes("quote.id = sale_request.quote_id"));
  assert.ok(migration.includes("campaign_updated_at"));
  assert.ok(migration.includes("v_total_installments - 1"));
  assert.ok(!migration.includes("else 83"));
  assert.ok(!migration.includes("coalesce(84"));
});

test("la emisión se bloquea fuera del estado posterior a aprobación", () => {
  assert.ok(sales.includes('result.data.status === "minute_pending" || result.data.cdn_scoring_status === "observed"'));
  assert.ok(sales.includes("La Minuta Definitiva solo puede emitirse después de la aprobación de Supervisión"));
});
