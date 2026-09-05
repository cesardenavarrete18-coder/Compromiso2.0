import { FILTER_SCHEMA_VERSION, RUNTIME_FINGERPRINT, shadowConfig, v1DecisionSnapshot } from "./contracts.mjs";
import { applyNegationScopeFirewall } from "./safety-firewall.mjs";
import { buildAllowedFacts, reconcileKnowledge, resolveStructuredCommercialFacts } from "./facts.mjs";
import { generateCandidateReply } from "./response-generator.mjs";

export async function runV2Shadow({ env = {}, input, repository, extractSemantic, normalizeExtraction = value => value, runFilter, lookupKnowledge = async () => [], responseGenerator = generateCandidateReply, v1Decision = null }) {
  const config = shadowConfig(env);
  if (!config.enabled) return { status: "disabled" };
  const claimed = await repository.claim(input.inboundMessage.id, input.lead.id, input.previousRunId ?? null);
  if (!claimed.created) return { status: "duplicate", run: claimed.run };
  const started = Date.now();
  try {
    const semantic = await extractSemantic(input.filterInput, { model: config.filterModel });
    const normalized = semantic.extraction ?? semantic;
    const firewalled = applyNegationScopeFirewall(normalized, { currentMessage: input.inboundMessage.body, previousState: input.filterInput.previous_filter_state });
    const engineExtraction = normalizeExtraction(firewalled.extraction, input.filterInput);
    const engine = runFilter({ ...input.filterInput, current_extraction: engineExtraction });
    const targetId = engine.next_state?.target_model?.value?.model_id ?? null;
    const structured = resolveStructuredCommercialFacts({ targetModelId: targetId, campaigns: input.filterInput.campaigns, bankOffers: input.filterInput.bank_offers });
    const knowledgeRequest = engine.resolved_facts?.find(f => f.status === "requires_knowledge_lookup") ?? null;
    const evidence = knowledgeRequest ? await lookupKnowledge(knowledgeRequest) : [];
    const reconciled = reconcileKnowledge(structured, evidence);
    const allowedFacts = buildAllowedFacts({ targetModel: engine.next_state?.target_model?.value, structuredFacts: structured, technicalFacts: reconciled.technical_facts, operationalConstraints: { no_unverified_claims: true } });
    const humanMode = input.filterInput.conversation_control?.mode === "human";
    const wouldHandoff = engine.handoff_decision?.handoff_status === "requested" || engine.handoff_decision?.handoff === true;
    const candidate = responseGenerator({ currentMessage: input.inboundMessage.body, filterOutput: engine, nextState: engine.next_state, responsePlan: engine.response_plan, allowedFacts, knowledgeRequest, wouldHandoff, humanMode });
    const record = { status: "completed", schema_version: FILTER_SCHEMA_VERSION, runtime_fingerprint: RUNTIME_FINGERPRINT, filter_model: config.filterModel, latency_ms: Date.now() - started, v1_decision: v1DecisionSnapshot(v1Decision), semantic_extraction: semantic.extraction ?? semantic, normalized_extraction: normalized, safety_firewall_result: firewalled.result, engine_result: engine, next_state: engine.next_state, response_plan: engine.response_plan, handoff_decision: engine.handoff_decision, resolved_facts: engine.resolved_facts, structured_facts: structured, knowledge_request: knowledgeRequest, knowledge_evidence: evidence, error_code: reconciled.conflicts[0]?.code ?? null, v2_candidate_reply: candidate.text, candidate_reply_status: candidate.status, would_handoff: wouldHandoff, would_continue_answering: Boolean(wouldHandoff && !humanMode && candidate.text), would_suppress_for_human: humanMode };
    await repository.complete(claimed.run.id, record, input.inboundMessage.created_at, input.lead.id);
    return { status: "completed", record };
  } catch (error) {
    await repository.fail(claimed.run.id, { status: "failed", error_code: "SHADOW_PIPELINE_ERROR", error_detail: String(error?.message ?? error).slice(0, 1000), latency_ms: Date.now() - started });
    throw error;
  }
}

export async function runV2ShadowSafely(args, logger = console) {
  try { return await runV2Shadow(args); }
  catch (error) { logger.error("AI V2 shadow failed", error instanceof Error ? error.message : String(error)); return { status: "failed_isolated" }; }
}
