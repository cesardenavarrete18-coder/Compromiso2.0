export const PLAN_FACT_FIELDS = Object.freeze({
  model_reference_value: "final_price",
  installment_offer: "installment_amount",
  delivery_advance: "advance_amount",
});

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function resolvePlanFact({ targetModelId, campaigns = [], factType, usedVehicleSubject = false }) {
  const sourceField = PLAN_FACT_FIELDS[factType];
  if (!sourceField) throw new TypeError(`UNSUPPORTED_PLAN_FACT_TYPE:${factType}`);
  // Family Q: campaigns only ever carry 0km pricing. A price/installment/advance query
  // about a used unit of the model must never be answered from that data - there is no
  // structured used-vehicle price source, and estimating one would be fabrication. Guarded
  // here, not only upstream, so no future caller of resolvePlanFact can bypass it.
  if (usedVehicleSubject) return Object.freeze({ fact_type: factType, status: "not_materialized", value: null, source_campaign_id: null, source_field: sourceField, reason: "used_vehicle_subject_has_no_structured_source" });
  const candidates = campaigns.flatMap(campaign => {
    const value = numericValue(campaign[sourceField]);
    return campaign.active === true && campaign.model_id === targetModelId && value !== null
      ? [{ campaign, value }]
      : [];
  });
  if (!candidates.length) return Object.freeze({ fact_type: factType, status: "not_materialized", value: null, source_campaign_id: null, source_field: sourceField });
  candidates.sort((left, right) => left.value - right.value || String(left.campaign.id).localeCompare(String(right.campaign.id)));
  const selected = candidates[0];
  return Object.freeze({
    fact_type: factType,
    status: "resolved",
    value: selected.value,
    source_campaign_id: selected.campaign.id,
    source_field: sourceField,
    provenance: Object.freeze({ source: "public.campaigns", source_campaign_id: selected.campaign.id, field: sourceField, value: selected.value }),
  });
}

export function assessMultiFactCombination(facts = []) {
  const campaignIds = [...new Set(facts.filter(fact => fact?.status === "resolved").map(fact => fact.source_campaign_id).filter(Boolean))];
  const crossCampaign = campaignIds.length > 1;
  return Object.freeze({
    cross_campaign_combination: crossCampaign,
    can_present_as_single_alternative: facts.length > 0 && !crossCampaign && campaignIds.length === 1,
    source_campaign_ids: campaignIds,
    warning: crossCampaign ? "DO_NOT_PRESENT_AS_SINGLE_OPERATION" : null,
  });
}
