import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sales = readFileSync(new URL("../vendedores/sales.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");

const minuteMarkup = html.slice(
  html.indexOf('id="salesMinuteDialog"'),
  html.indexOf('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js')
);
const openMinute = sales.slice(
  sales.indexOf("function openMinute(caseId)"),
  sales.indexOf("async function saveMinute(event)")
);
const saveMinute = sales.slice(
  sales.indexOf("async function saveMinute(event)"),
  sales.indexOf("function minuteRow(label, value)")
);

function input(name) {
  const match = minuteMarkup.match(new RegExp('<input[^>]*name="' + name + '"[^>]*>'));
  assert.ok(match, "No se encontró " + name);
  return match[0];
}

test("salesMinuteForm deja planType readonly sin deshabilitarlo", () => {
  assert.match(input("planType"), /\sreadonly(?:\s|>)/);
  assert.doesNotMatch(input("planType"), /\sdisabled(?:\s|>)/);
});

test("salesMinuteForm deja agreedPrice readonly sin deshabilitarlo", () => {
  assert.match(input("agreedPrice"), /\sreadonly(?:\s|>)/);
  assert.doesNotMatch(input("agreedPrice"), /\sdisabled(?:\s|>)/);
});

test("la Minuta mantiene plan y precio provenientes del Datero aprobado", () => {
  assert.ok(sales.includes("provisional && provisional.plan_type"));
  assert.ok(sales.includes("provisional && provisional.agreed_price != null ? provisional.agreed_price : salesCase.sale_amount"));
  assert.ok(openMinute.includes("approvedMinuteConditions(state.activeCase)"));
  assert.ok(openMinute.includes("minuteForm.elements.planType.value = approved.planType"));
  assert.ok(openMinute.includes("minuteForm.elements.agreedPrice.value = Number.isFinite(approved.agreedPrice)"));
});

test("saveMinute persiste las condiciones aprobadas y no valores sustituidos en el DOM", () => {
  assert.ok(saveMinute.includes("var approved = approvedMinuteConditions(state.activeCase)"));
  assert.ok(saveMinute.includes("plan_type: approved.planType"));
  assert.ok(saveMinute.includes("agreed_price: approved.agreedPrice"));
  assert.ok(!saveMinute.includes("plan_type: f.planType"));
  assert.ok(!saveMinute.includes("agreed_price: Number(f.agreedPrice"));
});

test("los campos de primer y segundo pago continúan editables y persistidos desde el formulario", () => {
  for (const name of ["firstPaymentDate", "firstPaymentAmount", "secondPaymentDate", "secondPaymentAmount"]) {
    assert.doesNotMatch(input(name), /\sreadonly(?:\s|>)/, name);
    assert.doesNotMatch(input(name), /\sdisabled(?:\s|>)/, name);
  }
  assert.ok(saveMinute.includes("firstDate = f.firstPaymentDate.value"));
  assert.ok(saveMinute.includes("firstAmount = f.firstPaymentAmount.value"));
  assert.ok(saveMinute.includes("secondDate = f.secondPaymentDate.value"));
  assert.ok(saveMinute.includes("secondAmount = f.secondPaymentAmount.value"));
});
