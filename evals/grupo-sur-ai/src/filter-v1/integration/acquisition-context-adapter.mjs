import { resolveModelCandidates } from "./catalog-adapter.mjs";

export function adaptAcquisitionContext(attribution = null, catalog = null) {
  const row = attribution ?? {};
  const referral = row.raw_referral ?? {};
  const explicitMentions = row.referral_model_candidates ?? referral.model_candidates ?? (referral.advertised_model ? [referral.advertised_model] : []);
  const resolution = catalog ? resolveModelCandidates(catalog, explicitMentions) : { status: "unknown", candidates: [] };
  return Object.freeze({
    platform: row.platform ?? null,
    campaign_id: row.campaign_id ?? null,
    campaign_name: row.campaign_name ?? null,
    adset_id: row.adset_id ?? null,
    ad_id: row.ad_id ?? null,
    headline: row.headline ?? referral.headline ?? null,
    body: row.body ?? referral.body ?? null,
    advertised_modality: referral.advertised_modality ?? null,
    referral_model_candidates: resolution.candidates ?? [],
    referral_target: resolution.status === "single" ? resolution.target : null,
  });
}
