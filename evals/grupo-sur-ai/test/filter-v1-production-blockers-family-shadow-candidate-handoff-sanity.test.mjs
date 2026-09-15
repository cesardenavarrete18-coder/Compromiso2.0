import assert from "node:assert/strict";
import test from "node:test";
import { extractSemanticMessage } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extractor.mjs";
import { emptySemanticExtraction } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-extraction-contract.mjs";
import { semanticExtractionToEngine } from "../../../supabase/functions/_shared/filter-v1/extraction/semantic-engine-adapter.mjs";
import { runFilterV1Integration } from "../../../supabase/functions/_shared/filter-v1/integration/filter-v1-engine.mjs";

// V2 Shadow Production Candidate, B6 (handoff sanity): the historical sample audited during
// Qualification Policy Calibration showed 0 strong_action / 0 human_request across 150 real
// leads. Before deploying, this file empirically confirms - end-to-end, real sanitizer +
// normalizer + adapter + engine, not a mock - whether the deterministic guards actually
// recognize the phrasings a real customer would use.
//
// Two independent, unrelated mechanisms produce handoff_status="immediate":
// - human_request: gated directly by semantic-evidence-sanitizer.mjs's signalGuards.human_request
//   (requires an hablar/llamar/contactar verb co-occurring with asesor/vendedor/persona/alguien).
// - strong_action: NEVER settable directly by the provider - the normalizer unconditionally
//   resets it to null and only re-derives it from requested_action.type after
//   normalizeRequestedAction() reclassifies that type against its own 5-pattern allowlist
//   (deposit/transfer/documents/visit/advance_purchase). A raw candidate must propose
//   requested_action (any initial type, e.g. "other"), never strong_action itself.
//
// Neither signalGuards nor handoff-policy.mjs nor normalizeRequestedAction's pattern list were
// touched by Family R or Family S (confirmed: zero diff on semantic-evidence-sanitizer.mjs and
// handoff-policy.mjs between the commit currently live in Production and this candidate) - so
// any gap found here is PRE-EXISTING, identical in Production today, not a regression introduced
// by this deploy. Per instruction, no fix is applied here without a root cause investigation of
// its own scope - this file's job is only to make the current, real behavior visible and
// auditable before the deploy, not to change it.

async function runPhrase(text, proposedSignal) {
  const raw = { ...emptySemanticExtraction(), ...proposedSignal };
  const input = {
    current_message: { id: "m1", role: "customer", text, created_at: "2026-09-15T00:00:00Z" },
    recent_conversation: [], previous_filter_state: null, acquisition_context: null, known_catalog_context: null,
  };
  const result = await extractSemanticMessage({ client: async () => structuredClone(raw), ...input });
  if (result.status !== "ok") return { status: result.status, errors: result.errors };
  const engineExtraction = semanticExtractionToEngine(result.extraction, input);
  const engine = runFilterV1Integration({
    lead: {}, conversation_control: { mode: "ai" }, catalog: { brands: [], models: [], model_versions: [] }, campaigns: [], bank_offers: [],
    previous_filter_state: undefined, expected_state_version: 0, current_extraction: engineExtraction,
  });
  return { status: "ok", handoff_status: engine.handoff_decision.handoff_status, next_action: engine.handoff_decision.next_action };
}

function humanRequestCandidate(text) {
  return { human_request: { type: "human_request", evidence: [{ source_message_id: "m1", literal: text }] } };
}
function requestedActionCandidate(text) {
  return { requested_action: { type: "other", certainty: "explicit", evidence: [{ source_message_id: "m1", literal: text }] } };
}

test("Handoff sanity 1: 'Quiero hablar con un vendedor' -> human_request recognized, handoff immediate", async () => {
  const result = await runPhrase("Quiero hablar con un vendedor", humanRequestCandidate("Quiero hablar con un vendedor"));
  assert.equal(result.status, "ok");
  assert.equal(result.handoff_status, "immediate");
  assert.equal(result.next_action, "handoff");
});

test("Handoff sanity 2 (KNOWN PRE-EXISTING GAP, not a Family R/S regression): '¿Me pueden llamar?' - no 'asesor/vendedor/persona/alguien' named, signalGuards.human_request does not match, and no requested_action pattern covers a bare callback request", async () => {
  const result = await runPhrase("¿Me pueden llamar?", humanRequestCandidate("¿Me pueden llamar?"));
  assert.equal(result.status, "ok");
  assert.notEqual(result.handoff_status, "immediate", "current guard does not recognize a bare callback request - documented gap, not fixed here");
});

test("Handoff sanity 3: 'Quiero reservar' -> requested_action reclassified as 'deposit' ('reservar' pattern), strong_action, handoff immediate", async () => {
  const result = await runPhrase("Quiero reservar", requestedActionCandidate("Quiero reservar"));
  assert.equal(result.status, "ok");
  assert.equal(result.handoff_status, "immediate");
  assert.equal(result.next_action, "handoff");
});

test("Handoff sanity 4: 'Quiero señarlo' -> requested_action reclassified as 'deposit' ('senarlo' pattern), strong_action, handoff immediate", async () => {
  const result = await runPhrase("Quiero señarlo", requestedActionCandidate("Quiero señarlo"));
  assert.equal(result.status, "ok");
  assert.equal(result.handoff_status, "immediate");
  assert.equal(result.next_action, "handoff");
});

test("Handoff sanity 5: '¿Dónde transfiero?' -> requested_action reclassified as 'transfer' ('transfiero' pattern), strong_action, handoff immediate", async () => {
  const result = await runPhrase("¿Dónde transfiero?", requestedActionCandidate("¿Dónde transfiero?"));
  assert.equal(result.status, "ok");
  assert.equal(result.handoff_status, "immediate");
  assert.equal(result.next_action, "handoff");
});

test("Handoff sanity 6: 'Quiero avanzar con la compra' -> requested_action reclassified as 'advance_purchase' ('avanzar...compra' pattern), strong_action, handoff immediate", async () => {
  const result = await runPhrase("Quiero avanzar con la compra", requestedActionCandidate("Quiero avanzar con la compra"));
  assert.equal(result.status, "ok");
  assert.equal(result.handoff_status, "immediate");
  assert.equal(result.next_action, "handoff");
});
