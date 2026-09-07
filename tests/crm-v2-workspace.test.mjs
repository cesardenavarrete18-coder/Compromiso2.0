import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../vendedores/index.html", import.meta.url), "utf8");
const crm = readFileSync(new URL("../vendedores/crm.js", import.meta.url), "utf8");
const management = readFileSync(new URL("../vendedores/en-gestion.js", import.meta.url), "utf8");
const transitionSource = readFileSync(new URL("../vendedores/crm-transition-model.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260908120000_crm_v2_transition_matrix.sql", import.meta.url), "utf8");
const context = {};
context.globalThis = context;
runInNewContext(transitionSource, context);
const transitions = context.grupoSurCRMTransitions;

test("el Workspace común abre Nuevo y En gestión antes de mostrar el diálogo", () => {
  const openLead = crm.match(/async function openLead\(leadId\)[\s\S]*?await Promise\.all/)?.[0] || "";
  assert.ok(html.includes('id="crmWorkspaceBack"'));
  assert.ok(html.includes('id="crmWorkspaceContext"'));
  assert.ok(openLead.indexOf('leadDialog.classList.toggle("crm-v2-workspace"') < openLead.indexOf("leadDialog.showModal()"));
  assert.ok(openLead.indexOf("grupoSurEnGestionExperience.openLead(lead)") < openLead.indexOf("leadDialog.showModal()"));
  assert.ok(management.includes("function openLead(lead)"));
});

test("Nuevo pregunta por contacto y presenta sólo resultados válidos", () => {
  assert.ok(html.includes("¿Pudiste contactar al cliente?"));
  assert.ok(html.includes('data-contact-decision="answered"'));
  assert.ok(html.includes('data-contact-decision="no_answer"'));
  assert.ok(crm.includes('["contacto_futuro", "en_proceso", "entrevista", "cierre", "sena", "venta", "desistir"]'));
  assert.ok(crm.includes('["no_contesta", "invalido"]'));
});

test("Sin contacto completa o inicia protocolo y no crea agenda manual", () => {
  const flow = crm.match(/async function registerNewNoAnswer\(\)[\s\S]*?^  }/m)?.[0] || "";
  assert.ok(flow.includes('rpc("restart_lead_contact_sequence"'));
  assert.ok(flow.includes('completeContactTask(pending.id, "no_answer")'));
  assert.doesNotMatch(flow, /record_lead_follow_up|next_contact_at/);
});

test("la matriz canónica bloquea Inválido después del contacto", () => {
  for (const status of ["contacto_futuro", "en_proceso", "entrevista", "cierre", "sena", "venta"]) {
    assert.equal(transitions.canTransition(status, "invalido"), false, status);
  }
  assert.equal(transitions.canTransition("nuevo", "invalido"), true);
  assert.equal(transitions.canTransition("no_contesta", "invalido"), true);
  assert.throws(() => transitions.assertTransition("en_proceso", "invalido"), /no está permitida/);
});

test("frontend y RPC validan la misma transición antes de persistir", () => {
  const save = crm.match(/async function saveManagement\(\)[\s\S]*?^  }/m)?.[0] || "";
  assert.ok(save.includes("transitionModel.assertTransition"));
  assert.ok(migration.includes("private.crm_transition_allowed(v_previous_status, p_status)"));
  assert.match(migration, /when 'en_proceso' then p_to in \('en_proceso','entrevista','cierre','sena','venta','desistir'\)/);
  assert.match(migration, /when 'sena' then p_to in \('sena','venta','desistir'\)/);
});

test("el Workspace reutiliza herramientas e historial existentes", () => {
  for (const id of ["crmWhatsappLink", "crmCommentButton", "crmBudgetButton", "crmSaleButton", "crmTimeline", "crmCustomerHistory", "crmChat"]) {
    assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, id);
  }
  assert.ok(html.includes("Historial"));
  assert.ok(html.includes("Consultas previas"));
  assert.ok(html.includes("Conversación IA"));
});
