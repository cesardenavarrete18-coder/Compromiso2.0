const normalize = value => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-AR").replace(/[^a-z0-9]+/g, " ").trim();
const aliases = row => [...new Set([row.name, row.brand, row.model, ...(Array.isArray(row.aliases) ? row.aliases : [])].filter(Boolean).map(normalize))];

export function adaptCatalogRows({ brands = [], models = [], model_versions = [] } = {}) {
  const brandById = new Map(brands.map(row => [String(row.id), Object.freeze({ brand_id: String(row.id), brand: row.name, aliases: aliases(row), active: row.active !== false })]));
  const normalizedModels = models.map(row => {
    const brand = brandById.get(String(row.brand_id));
    return Object.freeze({ model_id: String(row.id), model: row.name, aliases: aliases(row), brand_id: String(row.brand_id), brand: brand?.brand ?? null, active: row.active !== false });
  });
  const modelById = new Map(normalizedModels.map(model => [model.model_id, model]));
  const versions = model_versions.map(row => Object.freeze({ version_id: String(row.id), version: row.name, aliases: aliases(row), model_id: String(row.model_id), active: row.active !== false }));
  return Object.freeze({ brands: Object.freeze([...brandById.values()]), models: Object.freeze(normalizedModels), versions: Object.freeze(versions), modelById });
}

export function resolveBrand(catalog, mention) {
  const key = normalize(mention);
  return catalog.brands.find(row => row.active && row.aliases.includes(key)) ?? null;
}

export function resolveModel(catalog, mention, { brandId = null } = {}) {
  const key = normalize(mention);
  const matches = catalog.models.filter(row => row.active && (!brandId || row.brand_id === brandId) && (row.aliases.includes(key) || normalize(`${row.brand} ${row.model}`) === key));
  return matches.length === 1 ? matches[0] : null;
}

export function resolveVersion(catalog, mention, { modelId = null } = {}) {
  const key = normalize(mention);
  const matches = catalog.versions.filter(row => row.active && (!modelId || row.model_id === modelId) && row.aliases.includes(key));
  return matches.length === 1 ? matches[0] : null;
}

export function resolveModelCandidates(catalog, mentions = []) {
  const candidates = [...new Map(mentions.flatMap(mention => {
    const key = normalize(typeof mention === "string" ? mention : mention.model ?? mention.literal);
    return catalog.models.filter(row => row.active && (row.aliases.includes(key) || normalize(`${row.brand} ${row.model}`) === key));
  }).map(row => [row.model_id, row])).values()];
  if (!candidates.length) return Object.freeze({ status: "unknown", brand: null, candidates: [], clarification_required: false });
  if (candidates.length === 1) return Object.freeze({ status: "single", brand: candidates[0].brand, target: candidates[0], candidates, clarification_required: false });
  const brands = new Set(candidates.map(row => row.brand_id));
  return Object.freeze({ status: brands.size === 1 ? "same_brand_multiple" : "cross_brand_multiple", brand: brands.size === 1 ? candidates[0].brand : null, target: null, candidates, clarification_required: true });
}
