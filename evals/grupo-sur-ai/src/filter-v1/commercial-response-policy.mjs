import { assessMultiFactCombination } from "./plan-fact-resolver.mjs";

export function buildCommercialResponsePlan({ intent, answerFact = null, facts = [], nextFilterQuestion = null, handoff = null, promotionalContext = null } = {}) {
  const combination = assessMultiFactCombination(facts.length ? facts : answerFact ? [answerFact] : []);
  const warnings = [];
  if (combination.cross_campaign_combination) warnings.push(combination.warning);
  const stopped = Boolean(handoff);
  return Object.freeze({
    answer_kind: intent ?? "unknown",
    answer_fact: answerFact,
    knowledge_request: answerFact?.status === "requires_knowledge_lookup" ? { subject_model: answerFact.subject_model, source: "authorized_knowledge" } : null,
    commercial_framing_allowed: !stopped,
    promotional_hook: promotionalContext ? { kind: "general", source_campaign_id: promotionalContext.source_campaign_id } : null,
    next_filter_question: stopped ? null : nextFilterQuestion,
    handoff,
    cross_campaign_combination: combination.cross_campaign_combination,
    can_present_as_single_alternative: combination.can_present_as_single_alternative,
    warnings: Object.freeze(warnings),
  });
}

export const COMMERCIAL_COPY_GUARDS = Object.freeze({
  framing_required: true,
  scarcity_required: false,
  physical_stock_used: false,
  allowed_promotion_detail: "general_hook",
});
