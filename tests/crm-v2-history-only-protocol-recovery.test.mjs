import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const uiSource = readFileSync(new URL("../vendedores/mobile-navigation.js", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/migrations/20260909224500_crm_v2_recover_history_only_no_contact.sql", import.meta.url), "utf8");

test("history-only Sin contacto renders recovery action and calls canonical RPC", async () => {
  const listeners = {};
  const rpcCalls = [];
  let insertedPanel = null;
  let reloads = 0;

  const menu = {
    open: false,
    contains() { return false; },
    addEventListener(type, fn) { (listeners[`menu:${type}`] ||= []).push(fn); }
  };
  const label = { textContent: "Nueva gestión" };
  const errorBox = { textContent: "" };
  const experience = { hidden: false };
  const protocolTarget = {
    firstChild: null,
    querySelector(selector) {
      if (selector === ".crm-protocol-history") return {};
      if (selector === ".crm-protocol-day") return null;
      if (selector === "[data-reconcile-protocol], [data-start-current-protocol]") {
        return insertedPanel ? {} : null;
      }
      return null;
    },
    insertBefore(node) { insertedPanel = node; },
  };

  const elements = {
    mobileCrmMenu: menu,
    mobileCrmMenuLabel: label,
    proposeLeadButton: null,
    mobileProposeLeadButton: null,
    crmNoContactExperience: experience,
    crmNoContactProtocol: protocolTarget,
    crmNoContactError: errorBox,
  };

  let observerCallback = null;
  class FakeMutationObserver {
    constructor(callback) { observerCallback = callback; }
    observe() {}
  }

  const document = {
    getElementById(id) { return elements[id] ?? null; },
    querySelector() { return null; },
    createElement() { return { className: "", innerHTML: "" }; },
    addEventListener(type, fn) { (listeners[`document:${type}`] ||= []).push(fn); },
  };

  const session = new Map();
  const window = {
    grupoSurSupabaseClient: {
      async rpc(name, payload) {
        rpcCalls.push({ name, payload });
        return { data: "new-sequence", error: null };
      }
    },
    sessionStorage: {
      getItem(key) { return session.get(key) ?? null; },
      setItem(key, value) { session.set(key, value); },
      removeItem(key) { session.delete(key); }
    },
    location: { reload() { reloads += 1; } },
    setTimeout(fn) { fn(); return 1; },
    setInterval() { return 1; },
    clearInterval() {},
  };

  const context = { window, document, MutationObserver: FakeMutationObserver, console };
  context.globalThis = context;
  runInNewContext(uiSource, context);

  const card = {
    dataset: { crmLeadId: "lead-history-only" },
    closest(selector) { return selector === "[data-crm-lead-id]" ? this : null; }
  };
  const cardEvent = { target: card };
  listeners["document:click"].forEach((fn) => fn(cardEvent));

  assert.ok(insertedPanel, "recovery panel should be injected");
  assert.match(insertedPanel.innerHTML, /Iniciar protocolo actual/);
  assert.match(insertedPanel.innerHTML, /18 llamadas en 9 franjas/);

  const button = {
    disabled: false,
    textContent: "Iniciar protocolo actual",
    closest(selector) { return selector === "[data-start-current-protocol]" ? this : null; }
  };
  const buttonEvent = { target: button };
  listeners["document:click"].forEach((fn) => fn(buttonEvent));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(rpcCalls, [{
    name: "reconcile_lead_contact_protocol",
    payload: { p_lead_id: "lead-history-only" }
  }]);
  assert.equal(reloads, 1);
  assert.equal(session.get("grupoSur:reopenRecoveredLead"), "lead-history-only");

  assert.ok(observerCallback, "protocol DOM should be observed for async CRM rendering");
});

test("recovery migration is narrow and preserves historical tasks", () => {
  assert.match(migrationSource, /v_crm_status <> 'no_contesta'/);
  assert.match(migrationSource, /v_recovery_without_active := true/);
  assert.match(migrationSource, /next_contact_at = null/);
  assert.match(migrationSource, /next_contact_source = null/);
  assert.match(migrationSource, /historical_tasks_preserved', true/);
  assert.match(migrationSource, /private\.create_lead_contact_sequence\(p_lead_id, v_seller, now\(\)\)/);
  assert.doesNotMatch(migrationSource, /delete\s+from\s+public\.lead_contact_tasks/i);
  assert.doesNotMatch(migrationSource, /delete\s+from\s+public\.lead_contact_sequences/i);
});
