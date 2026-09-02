import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sales = readFileSync(new URL("../vendedores/sales.js", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../supabase/migrations/20260902142617_fix_seller_isolation_and_desist_recall.sql", import.meta.url),
  "utf8"
);

test("Desistir usa un nombre válido al crear el rellamado", () => {
  assert.match(migration, /v_customer_name := left\(trim\(coalesce\(v_lead\.customer_name, ''\)\), 120\)/);
  assert.match(migration, /if char_length\(v_customer_name\) < 2 then\s+v_customer_name := 'Cliente sin nombre'/);
  assert.match(migration, /new\.status = 'desistir'/);
  assert.match(migration, /now\(\) \+ interval '15 days'/);
});

test("Mis Ventas consulta y conserva solamente casos del usuario autenticado", () => {
  const loadSales = sales.slice(
    sales.indexOf("async function loadSales()"),
    sales.indexOf("function processChip")
  );

  assert.match(loadSales, /\.eq\("seller_user_id", requestedUserId\)/);
  assert.match(loadSales, /requestVersion !== state\.salesLoadVersion \|\| state\.userId !== requestedUserId/);
  assert.match(loadSales, /item\.seller_user_id === requestedUserId/);
  assert.match(loadSales, /ownedCaseIds\.has\(item\.sales_case_id\)/);
});

test("una respuesta tardía del vendedor anterior no reemplaza las ventas de la sesión nueva", async () => {
  const loadSalesSource = sales.slice(
    sales.indexOf("async function loadSales()"),
    sales.indexOf("function processChip")
  );
  const state = {
    userId: "seller-old",
    salesLoadVersion: 0,
    cases: [],
    applications: {},
    events: {},
    notifications: []
  };
  const gates = [Promise.withResolvers(), Promise.withResolvers()];
  const batchUsers = ["seller-old", "seller-new"];
  let queryCount = 0;
  const supabaseClient = {
    from(table) {
      const batch = Math.floor(queryCount++ / 4);
      const query = {
        select() { return query; },
        eq() { return query; },
        not() { return query; },
        order() { return query; },
        limit() { return query; },
        then(resolve, reject) {
          return gates[batch].promise.then(() => {
            const userId = batchUsers[batch];
            if (table === "sales_cases") return { data: [{ id: "case-" + userId, seller_user_id: userId }] };
            if (table === "commercial_applications") return { data: [{ id: "app-" + userId, seller_user_id: userId, sales_case_id: "case-" + userId }] };
            if (table === "sales_case_events") return { data: [{ id: "event-" + userId, sales_case_id: "case-" + userId }] };
            return { data: [{ id: "notification-" + userId, recipient_user_id: userId, sales_case_id: "case-" + userId }] };
          }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  const rendered = [];
  const loadSales = Function(
    "state",
    "supabaseClient",
    "ensureUser",
    "renderSales",
    '"use strict"; ' + loadSalesSource + "; return loadSales;"
  )(state, supabaseClient, async () => state.userId, () => rendered.push(state.cases.map((item) => item.id)));

  const oldLoad = loadSales();
  await Promise.resolve();
  state.salesLoadVersion += 1;
  state.userId = "seller-new";
  const newLoad = loadSales();
  await Promise.resolve();

  gates[1].resolve();
  await newLoad;
  assert.deepEqual(state.cases.map((item) => item.id), ["case-seller-new"]);

  gates[0].resolve();
  await oldLoad;
  assert.deepEqual(state.cases.map((item) => item.id), ["case-seller-new"]);
  assert.deepEqual(rendered, [["case-seller-new"]]);
});

test("cerrar sesión invalida cargas pendientes y limpia Mis Ventas", () => {
  const reset = sales.slice(
    sales.indexOf("function resetSellerState()"),
    sales.indexOf("async function ensureUser()")
  );
  const authChange = sales.slice(sales.lastIndexOf("supabaseClient.auth.onAuthStateChange"));

  assert.match(reset, /state\.salesLoadVersion \+= 1/);
  assert.match(reset, /state\.userId = ""/);
  assert.match(reset, /state\.cases = \[\]/);
  assert.match(authChange, /event === "SIGNED_OUT"/);
  assert.match(authChange, /resetSellerState\(\)/);
});
