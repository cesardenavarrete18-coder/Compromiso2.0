import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

// This file executes the REAL vendedores/crm.js (unmodified) inside a
// minimal hand-built DOM/Supabase harness and dispatches REAL click events
// through crm.js's own delegated listener. It exists specifically because a
// prior review found that SQL-text assertions alone missed a real wiring
// bug: "Contestó" on a Nuevo Lead never actually set
// state.pendingProtocolAnsweredTaskId, so the seller-visible click never
// reached record_contact_answer_with_transition. No new dependency (e.g.
// jsdom) is introduced: this project has no package.json/build step, and
// Vercel's deploy is pinned to an explicit buildCommand, so adding one
// purely for tests is avoided.

const crmSource = readFileSync(new URL("../vendedores/crm.js", import.meta.url), "utf8");
const agendaSource = readFileSync(new URL("../vendedores/agenda-model.js", import.meta.url), "utf8");
const transitionSource = readFileSync(new URL("../vendedores/crm-transition-model.js", import.meta.url), "utf8");

function loadStandalone(source, property) {
  const context = { Intl, Date, console };
  context.globalThis = context;
  runInNewContext(source, context);
  return context[property];
}

const agendaModel = loadStandalone(agendaSource, "grupoSurAgendaModel");
const transitionModel = loadStandalone(transitionSource, "grupoSurCRMTransitions");

function matchesSimpleAttributeSelector(el, selector) {
  const m = /^\[data-([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
  if (!m) return false;
  const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const val = el.dataset[key];
  if (val === undefined) return false;
  return m[2] === undefined || val === m[2];
}

function makeElement(id) {
  const listeners = {};
  const el = {
    id,
    dataset: {},
    style: {},
    value: "",
    textContent: "",
    innerHTML: "",
    disabled: false,
    hidden: true,
    open: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    dispatch(type, event) { (listeners[type] || []).forEach((fn) => fn.call(el, event || { target: el, preventDefault() {}, stopPropagation() {} })); },
    click() { el.dispatch("click"); },
    focus() {},
    scrollIntoView() {},
    showModal() { el.open = true; },
    close() { el.open = false; },
    submit() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() {},
    matches(selector) { return matchesSimpleAttributeSelector(el, selector); },
    closest(selector) { return matchesSimpleAttributeSelector(el, selector) ? el : null; }
  };
  return el;
}

function fakeQuery(resultFactory) {
  const q = {
    select() { return q; },
    order() { return q; },
    limit() { return q; },
    eq() { return q; },
    then(resolve, reject) { return Promise.resolve(resultFactory()).then(resolve, reject); }
  };
  return q;
}

function buildHarness({ leadRow, taskRow, rpcResponses }) {
  const rpcCalls = [];
  const elementsById = new Map();
  const elementsBySelector = new Map();
  const documentListeners = {};
  const fakeDocument = {
    getElementById(id) {
      if (!elementsById.has(id)) elementsById.set(id, makeElement(id));
      return elementsById.get(id);
    },
    querySelector(selector) {
      if (!elementsBySelector.has(selector)) elementsBySelector.set(selector, makeElement(selector));
      return elementsBySelector.get(selector);
    },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { (documentListeners[type] = documentListeners[type] || []).push(fn); },
    createElement() { return makeElement("dynamic"); },
    head: { appendChild() {} }
  };

  const supabaseClient = {
    rpc(name, payload) {
      rpcCalls.push({ name, payload });
      const responder = rpcResponses && rpcResponses[name];
      const result = responder ? responder(payload) : { data: null, error: null };
      return Promise.resolve(result);
    },
    from(table) {
      if (table === "leads") return fakeQuery(() => ({ data: [leadRow], error: null }));
      if (table === "lead_contact_tasks") return fakeQuery(() => ({ data: taskRow ? [taskRow] : [], error: null }));
      return fakeQuery(() => ({ data: [], error: null }));
    }
  };

  const commercialApplication = { requested: false, opened: null };
  const context = {
    window: {
      grupoSurSupabaseClient: supabaseClient,
      grupoSurAgendaModel: agendaModel,
      grupoSurCRMTransitions: transitionModel,
      grupoSurCommercialApplication: {
        getCatalog: async () => { commercialApplication.requested = true; throw new Error("stub-catalog-no-campaigns"); },
        validateCampaign: () => "",
        open: (args) => { commercialApplication.opened = args; }
      }
    },
    document: fakeDocument,
    Intl,
    Date,
    console,
    navigator: { onLine: true }
  };
  context.window.window = context.window;
  context.globalThis = context;

  runInNewContext(crmSource, context);

  return {
    crm: context.window.grupoSurCRM,
    getElement: (id) => fakeDocument.getElementById(id),
    dispatchDocumentClick(target) {
      (documentListeners.click || []).forEach((fn) => fn.call(fakeDocument, { target, preventDefault() {}, stopPropagation() {} }));
    },
    rpcCalls,
    commercialApplication
  };
}

function tomorrowParts() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return { date: pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(), time: "10:00" };
}

test("Nuevo -> Contestó realmente arma la tarea respondida antes de elegir el resultado comercial", async () => {
  const leadRow = {
    id: "lead-1",
    customer_id: "cust-1",
    customer_phone: "+5491100000000",
    customer_name: "Cliente Nuevo",
    assigned_seller_user_id: "seller-1",
    crm: { status: "nuevo", priority: "normal", sale_confirmation_status: "none" }
  };
  const taskRow = {
    id: "task-1", sequence_id: "seq-1", lead_id: "lead-1", sequence_order: 1,
    channel: "call", call_attempt: 1, message_step: null, protocol_day: 1, protocol_band: "10-12",
    band_attempt: 1, due_start: new Date(Date.now() - 3600000).toISOString(), due_end: new Date().toISOString(),
    status: "pending", outcome: null
  };

  const harness = buildHarness({
    leadRow, taskRow,
    rpcResponses: { record_contact_answer_with_transition: () => ({ data: null, error: null }) }
  });

  assert.ok(harness.crm, "crm.js must expose window.grupoSurCRM");
  await harness.crm.refresh();
  await harness.crm.openLead("lead-1");
  assert.equal(harness.crm.getActiveLead().id, "lead-1");

  // Real click: "Contestó" in the Nuevo experience.
  const contestoButton = Object.assign(makeElement("contesto"), { dataset: { contactDecision: "answered" } });
  harness.dispatchDocumentClick(contestoButton);

  // Real click: pick "en_proceso" as the commercial outcome after Contestó.
  const enProcesoOutcome = Object.assign(makeElement("outcome-en-proceso"), { dataset: { crmTransition: "en_proceso" } });
  harness.dispatchDocumentClick(enProcesoOutcome);

  // Fill the manual form fields exactly as the real UI would before saving.
  const parts = tomorrowParts();
  harness.getElement("crmNoteInput").value = "El cliente pidió que lo llame mañana";
  harness.getElement("crmNextContactDateInput").value = parts.date;
  harness.getElement("crmNextContactTimeInput").value = parts.time;
  harness.getElement("crmPriorityInput").value = "normal";

  // Real click: "Guardar gestión".
  harness.getElement("crmSaveManagement").click();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const answeredCall = harness.rpcCalls.find((call) => call.name === "record_contact_answer_with_transition");
  assert.ok(answeredCall, "the real Contestó click path must call record_contact_answer_with_transition");
  assert.equal(answeredCall.payload.p_task_id, "task-1", "it must close the actual pending protocol task, not a guess");
  assert.equal(answeredCall.payload.p_status, "en_proceso");
  assert.ok(!harness.rpcCalls.some((call) => call.name === "record_lead_follow_up"), "must not fall back to the manual RPC when a real answered task exists");
});

test("Nuevo + tarea pendiente -> Venta cierra la respuesta atómica a Cierre y recién entonces abre el Datero", async () => {
  const leadRow = {
    id: "lead-2", customer_id: "cust-2", customer_phone: "+5491100000001", customer_name: "Cliente Nuevo 2",
    assigned_seller_user_id: "seller-1", crm: { status: "nuevo", priority: "normal", sale_confirmation_status: "none" }
  };
  const taskRow = {
    id: "task-2", sequence_id: "seq-2", lead_id: "lead-2", sequence_order: 1, channel: "call", call_attempt: 1,
    message_step: null, protocol_day: 1, protocol_band: "10-12", band_attempt: 1,
    due_start: new Date(Date.now() - 3600000).toISOString(), due_end: new Date().toISOString(), status: "pending", outcome: null
  };
  const harness = buildHarness({ leadRow, taskRow, rpcResponses: { record_contact_answer_with_transition: () => ({ data: null, error: null }) } });
  await harness.crm.refresh();
  await harness.crm.openLead("lead-2");

  const ventaButton = Object.assign(makeElement("venta-btn"), { dataset: { crmTransition: "venta" } });
  harness.dispatchDocumentClick(ventaButton);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const answeredCall = harness.rpcCalls.find((call) => call.name === "record_contact_answer_with_transition");
  assert.ok(answeredCall, "Nuevo->Venta must go through the atomic answered transition, not a side door");
  assert.equal(answeredCall.payload.p_task_id, "task-2");
  assert.equal(answeredCall.payload.p_status, "cierre");
  assert.ok(harness.commercialApplication.requested, "the Datero catalog must be requested only after the CRM state is prepared");
});

test("Nuevo sin tarea pendiente -> Venta no falsea una respuesta ni abre el Datero", async () => {
  const leadRow = {
    id: "lead-3", customer_id: "cust-3", customer_phone: "+5491100000002", customer_name: "Cliente Nuevo 3",
    assigned_seller_user_id: "seller-1", crm: { status: "nuevo", priority: "normal", sale_confirmation_status: "none" }
  };
  const harness = buildHarness({ leadRow, taskRow: null, rpcResponses: {} });
  await harness.crm.refresh();
  await harness.crm.openLead("lead-3");

  const ventaButton = Object.assign(makeElement("venta-btn"), { dataset: { crmTransition: "venta" } });
  harness.dispatchDocumentClick(ventaButton);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.rpcCalls.length, 0, "no RPC may fire when there is no real task to answer");
  assert.ok(!harness.commercialApplication.requested, "the Datero must never open without a real prior transition");
  assert.match(harness.getElement("crmNewError").textContent, /protocolo activa/i);
});

test("Cierre -> Venta abre el Datero directamente, sin ninguna transición", async () => {
  const leadRow = {
    id: "lead-4", customer_id: "cust-4", customer_phone: "+5491100000003", customer_name: "Cliente en Cierre",
    assigned_seller_user_id: "seller-1", crm: { status: "cierre", priority: "high", sale_confirmation_status: "none" }
  };
  const harness = buildHarness({ leadRow, taskRow: null, rpcResponses: {} });
  await harness.crm.refresh();
  await harness.crm.openLead("lead-4");

  const ventaButton = Object.assign(makeElement("venta-btn"), { dataset: { crmTransition: "venta" } });
  harness.dispatchDocumentClick(ventaButton);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.rpcCalls.length, 0, "already Cierre: no transition RPC should fire");
  assert.ok(harness.commercialApplication.requested, "Cierre must open the Datero directly");
});

test("Desistir manual sin motivo estructurado es rechazado por el frontend antes de llamar al backend", async () => {
  const leadRow = {
    id: "lead-5", customer_id: "cust-5", customer_phone: "+5491100000004", customer_name: "Cliente en gestión",
    assigned_seller_user_id: "seller-1", crm: { status: "en_proceso", priority: "normal", sale_confirmation_status: "none" }
  };
  const harness = buildHarness({ leadRow, taskRow: null, rpcResponses: {} });
  harness.crm.refresh ? await harness.crm.refresh() : null;
  await harness.crm.openLead("lead-5");

  harness.getElement("crmStatusInput").value = "desistir";
  harness.getElement("crmNoteInput").value = "El cliente ya no quiere continuar";
  harness.getElement("crmDesistReasonInput").value = "";
  harness.getElement("crmSaveManagement").click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.rpcCalls.length, 0, "no desistir RPC without a structured reason");
  assert.match(harness.getElement("crmFormError").textContent, /motivo del desistimiento/i);
});

