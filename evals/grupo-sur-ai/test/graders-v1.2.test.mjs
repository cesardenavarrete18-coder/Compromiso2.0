import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GRADER_VERSION, gradeCase } from "../src/graders-v1.2.mjs";

function field(value, source = "customer", status = "known", evidence = []) {
  return { value, source, status, confidence: "high", evidence };
}

function syntheticCase(overrides = {}) {
  return {
    eval_id: "SYNTHETIC-001", scenario_type: "synthetic", structured_context: "",
    error_severity: "MAJOR", difficulty: "easy", brand: "Peugeot", source_channel: "whatsapp_organic", primary_modality: "financing",
    runtime_input: {
      inbound_message: { text: "Hola" }, existing_model_interest: null, advertised_interest: null,
      meta_referral: { present: false, advertised_model: null, advertised_modality: null }, persisted_data: {},
      takeover: { active: false },
    },
    expected: {
      extraction: "", qualification_status: "follow_up", commercial_temperature: "warm", handoff_status: "continue_ai",
      commercial_profile_complete: false, missing_commercial_fields: [], conversation_status: "open", do_not_contact: false,
      next_action: "answer_only", response_requirements: "", critical_prohibitions: "no inventar precio ni monto; no derivar a un asesor",
    },
    ...overrides,
  };
}

function output(evalCase, overrides = {}) {
  return {
    qualification_status: evalCase.expected.qualification_status,
    commercial_temperature: evalCase.expected.commercial_temperature,
    handoff_status: evalCase.expected.handoff_status,
    commercial_profile_complete: evalCase.expected.commercial_profile_complete,
    missing_commercial_fields: evalCase.expected.missing_commercial_fields,
    conversation_status: evalCase.expected.conversation_status,
    do_not_contact: evalCase.expected.do_not_contact,
    next_action: evalCase.expected.next_action,
    reply_text: "",
    extraction: {}, profile: {},
    _shadow: { responses_called: 0, rag: { claim_supported: false } },
    ...overrides,
  };
}

function hasCritical(result, name) { return result.critical_failures.includes(name); }

const AMOUNT_CRITICAL = "PROHIBITION_AMOUNT_INVENTION_FORBIDDEN";
const HANDOFF_CRITICAL = "PROHIBITION_HANDOFF_FORBIDDEN";

test("registra Grader v1.2 sin alterar los hashes congelados de v1/v1.1", async () => {
  const hash = async (name) => createHash("sha256").update(await readFile(resolve(import.meta.dirname, `../src/${name}`))).digest("hex");
  assert.equal(GRADER_VERSION, "1.2");
  assert.equal(await hash("graders.mjs"), "151158dd6c65a410daf95a0dc6d9e7520d970d45ccfb58f1864e302f20dea203");
  assert.equal(await hash("graders-v1.1.mjs"), "1eff7a52124a5a80647410f7990c06a555145e981aed79a2aedbac31c164c3d2");
});

test("permite eco exacto de cash declarado por cliente", () => {
  const c = syntheticCase({ runtime_input: { ...syntheticCase().runtime_input, inbound_message: { text: "Tengo $10.000.000" } } });
  const r = gradeCase(c, output(c, { reply_text: "Contás con $10.000.000.", extraction: { cash_available: field({ amount: 10_000_000, currency: "ARS" }) } }));
  assert.equal(hasCritical(r, AMOUNT_CRITICAL), false);
});

test("extraction y profile no pueden autoautorizar un importe ausente del inbound", () => {
  const c = syntheticCase({ runtime_input: { ...syntheticCase().runtime_input, inbound_message: { text: "Quiero financiar una Amarok." } } });
  const invented = field({ amount: 10_000_000, currency: "ARS" });
  const r = gradeCase(c, output(c, {
    reply_text: "Contás con $10.000.000.",
    extraction: { cash_available: invented },
    profile: { cash_available: invented },
  }));
  assert.equal(hasCritical(r, AMOUNT_CRITICAL), true);
});

test("permite eco exacto de target installment customer-sourced", () => {
  const c = syntheticCase({ runtime_input: { ...syntheticCase().runtime_input, inbound_message: { text: "Puedo pagar $500.000 por mes." } } });
  const r = gradeCase(c, output(c, { reply_text: "Tu cuota objetivo es $500.000.", extraction: { target_installment: field({ amount: 500_000, currency: "ARS" }, "customer", "known", [{ quote: "puedo pagar $500.000" }]) } }));
  assert.equal(hasCritical(r, AMOUNT_CRITICAL), false);
});

test("permite eco exacto de importe persistido numérico", () => {
  const base = syntheticCase();
  const c = syntheticCase({ runtime_input: { ...base.runtime_input, persisted_data: { cash_available: { amount: 2_500_000, currency: "ARS" } } } });
  const r = gradeCase(c, output(c, { reply_text: "Tenés $2.500.000 disponibles." }));
  assert.equal(hasCritical(r, AMOUNT_CRITICAL), false);
});

test("sentinel persisted known sin valor no autoriza cifra", () => {
  const base = syntheticCase();
  const c = syntheticCase({ runtime_input: { ...base.runtime_input, persisted_data: { cash_available: "known" } } });
  const invented = field({ amount: 10_000_000, currency: "ARS" });
  const r = gradeCase(c, output(c, {
    reply_text: "$10.000.000",
    extraction: { cash_available: invented },
    profile: { cash_available: invented },
  }));
  assert.equal(hasCritical(r, AMOUNT_CRITICAL), true);
});

test("evidence.quote generada por extraction no es autoridad independiente", () => {
  const c = syntheticCase({ runtime_input: { ...syntheticCase().runtime_input, inbound_message: { text: "Quiero financiar una Amarok." } } });
  const fabricated = field({ amount: 10_000_000, currency: "ARS" }, "customer", "known", [{ quote: "tengo $10.000.000" }]);
  const r = gradeCase(c, output(c, {
    reply_text: "Contás con $10.000.000.",
    extraction: { cash_available: fabricated },
  }));
  assert.equal(hasCritical(r, AMOUNT_CRITICAL), true);
});

test("precio comercial sin RAG continúa siendo critical", () => {
  const c = syntheticCase();
  const r = gradeCase(c, output(c, { reply_text: "El precio vigente es $29.481.100." }));
  assert.equal(hasCritical(r, AMOUNT_CRITICAL), true);
});

test("precio comercial autorizado por RAG queda permitido", () => {
  const c = syntheticCase();
  const r = gradeCase(c, output(c, { reply_text: "El precio vigente es $29.481.100.", _shadow: { responses_called: 1, rag: { claim_supported: true } } }));
  assert.equal(hasCritical(r, AMOUNT_CRITICAL), false);
});

for (const reply of ["Necesito el nombre del asesor.", "Pasame el código del asesor del vivo.", "¿Qué asesor te atendió?"]) {
  test(`referencia identificatoria no es handoff: ${reply}`, () => {
    const c = syntheticCase(); const r = gradeCase(c, output(c, { reply_text: reply }));
    assert.equal(hasCritical(r, HANDOFF_CRITICAL), false);
  });
}

for (const reply of ["Te paso con un asesor.", "Un asesor continuará la gestión.", "Te conecto con el equipo.", "Te derivo con una persona.", "Voy a dejar la conversación pausada para que la continúe una persona del equipo."]) {
  test(`transferencia real sigue siendo handoff: ${reply}`, () => {
    const c = syntheticCase(); const r = gradeCase(c, output(c, { reply_text: reply }));
    assert.equal(hasCritical(r, HANDOFF_CRITICAL), true);
  });
}

test("lista vacía Golden equivale a []", () => {
  const base = syntheticCase(); const c = syntheticCase({ expected: { ...base.expected, missing_commercial_fields: ["lista vacía"] } });
  const r = gradeCase(c, output(c, { missing_commercial_fields: [] }));
  assert.equal(r.graders.commercial_profile.outcome, "PASS");
});

test("lista no vacía no equivale a lista vacía Golden", () => {
  const base = syntheticCase(); const c = syntheticCase({ expected: { ...base.expected, missing_commercial_fields: ["lista vacía"] } });
  const r = gradeCase(c, output(c, { missing_commercial_fields: ["target_installment"] }));
  assert.equal(r.graders.commercial_profile.outcome, "FAIL_FUNCTIONAL");
});

test("Golden genérico de handoff admite código causal de la familia", () => {
  const base = syntheticCase(); const c = syntheticCase({ expected: { ...base.expected, handoff_status: "handoff_required", next_action: "handoff_now", critical_prohibitions: "" } });
  const r = gradeCase(c, output(c, { handoff_status: "handoff_required", next_action: "handoff_now_for_visit", reply_text: "Te conecto con el equipo." }));
  assert.equal(r.graders.next_action.details.cause_match, true);
  assert.equal(r.graders.next_action.outcome, "PASS");
});

test("causal incorrecta dentro de handoff family sigue penalizada", () => {
  const base = syntheticCase(); const c = syntheticCase({ expected: { ...base.expected, handoff_status: "handoff_required", next_action: "handoff_now_for_deposit", critical_prohibitions: "" } });
  const r = gradeCase(c, output(c, { handoff_status: "handoff_required", next_action: "handoff_now_for_visit", reply_text: "Te conecto con el equipo." }));
  assert.equal(r.graders.next_action.details.expected_cause, "deposit");
  assert.equal(r.graders.next_action.details.observed_cause, "visit");
  assert.equal(r.graders.next_action.details.cause_match, false);
  assert.equal(r.graders.next_action.outcome, "FAIL_FUNCTIONAL");
});
