const COMMERCIAL = new Set(["price", "final_price", "installment", "advance", "bonus", "rate", "campaign_terms", "bank_credit", "financed_amount", "term_count", "plan"]);

export function resolveStructuredCommercialFacts({ targetModelId, campaigns = [], bankOffers = [] }) {
  const active = campaigns.filter(row => row.active !== false && String(row.model_id) === String(targetModelId));
  const alternatives = active.map(row => ({ campaign_id: row.id, name: row.name ?? row.plan_name ?? null, final_price: row.final_price ?? row.price ?? null, advance: row.advance_amount ?? row.advance ?? null, installment: row.installment_amount ?? row.installment ?? null, term_count: row.installment_count ?? row.term_count ?? row.installments ?? null, bonus: row.bonus ?? null, valid_until: row.valid_until ?? null }));
  return Object.freeze({ status: alternatives.length === 1 ? "single" : alternatives.length > 1 ? "alternatives" : "not_found", target_model_id: targetModelId ?? null, alternatives, bank_offers: bankOffers.filter(row => row.active !== false && (!row.model_id || String(row.model_id) === String(targetModelId))) });
}

export function reconcileKnowledge(structuredFacts, evidence = []) {
  const conflicts = [];
  const technical = [];
  for (const fact of evidence) {
    if (COMMERCIAL.has(fact.type)) { conflicts.push({ code: "RAG_STRUCTURED_CONFLICT", ignored: fact }); continue; }
    technical.push(fact);
  }
  return { technical_facts: technical, conflicts };
}

export function buildAllowedFacts({ targetModel, structuredFacts, technicalFacts = [], customerFacts = {}, operationalConstraints = {} }) {
  return Object.freeze({ target_model: targetModel ?? null, commercial_facts: structuredFacts, technical_facts: technicalFacts, customer_known_facts: customerFacts, operational_constraints: operationalConstraints });
}
