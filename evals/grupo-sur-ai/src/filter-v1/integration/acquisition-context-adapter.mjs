import { resolveModelCandidates } from "./catalog-adapter.mjs";

const normalizeText = value => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-AR").replace(/[^a-z0-9]+/g, " ").trim();
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Family P: the real Meta referral payload (and the lead_attributions row derived from it)
// only ever carries free-text headline/body copy - there is no structured model_candidates
// or advertised_model field anywhere in this system (no such column exists on
// lead_attributions, and Meta never sends one). Without this, referral_target could never
// resolve regardless of attribution-row timing. Mirrors the word-scan V1's own
// advertisedVehicle()/mentionedVehicle() (whatsapp-webhook/index.ts) already does against
// its own hardcoded vehicle list - here driven by the real catalog instead, so it stays in
// sync with active models/aliases rather than a second hand-maintained list.
function resolveReferralTextCandidates(catalog, text) {
  const empty = Object.freeze({ status: "unknown", brand: null, candidates: [], clarification_required: false });
  if (!catalog) return empty;
  const haystack = normalizeText(text);
  if (!haystack) return empty;
  const matches = catalog.models.filter(model => model.active && model.aliases.some(alias => alias && new RegExp(`\\b${escapeRegex(alias)}\\b`).test(haystack)));
  const unique = [...new Map(matches.map(model => [model.model_id, model])).values()];
  if (!unique.length) return empty;
  if (unique.length === 1) return Object.freeze({ status: "single", brand: unique[0].brand, target: unique[0], candidates: unique, clarification_required: false });
  const brands = new Set(unique.map(model => model.brand_id));
  return Object.freeze({ status: brands.size === 1 ? "same_brand_multiple" : "cross_brand_multiple", brand: brands.size === 1 ? unique[0].brand : null, target: null, candidates: unique, clarification_required: true });
}

// fallbackReferral: the raw Meta referral object already available synchronously at
// claim-time in lead.metadata.referral (whatsapp-webhook/index.ts writes it via
// claim_whatsapp_lead's p_metadata before Shadow ever runs). The lead_attributions row for
// this same turn is written by V1 much later in the same webhook invocation (after routing,
// seller assignment and the leads update) - Shadow's parallel read can and does race ahead
// of that write on a brand-new lead's first turn. Falling back to the metadata copy removes
// the dependency on that row's timing entirely, without touching V1's own write path at all.
export function adaptAcquisitionContext(attribution = null, catalog = null, fallbackReferral = null) {
  const row = attribution ?? {};
  const structuredReferral = row.raw_referral && Object.keys(row.raw_referral).length ? row.raw_referral : null;
  const referral = structuredReferral ?? fallbackReferral ?? {};
  const explicitMentions = row.referral_model_candidates ?? referral.model_candidates ?? (referral.advertised_model ? [referral.advertised_model] : []);
  const structuredResolution = catalog && explicitMentions.length ? resolveModelCandidates(catalog, explicitMentions) : null;
  const resolution = structuredResolution ?? resolveReferralTextCandidates(catalog, `${referral.headline ?? ""} ${referral.body ?? ""}`);
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
