export const FILTER_V1_TECHNICAL_CATALOG = Object.freeze([
  Object.freeze({ brand: "Volkswagen", model: "Tera", aliases: Object.freeze(["VW Tera"]), body_type: "compact_suv", active: true }),
]);

export function findTechnicalModel(brand, model) {
  const key = `${brand} ${model}`.toLocaleLowerCase("es-AR");
  return FILTER_V1_TECHNICAL_CATALOG.find(entry => [`${entry.brand} ${entry.model}`, ...entry.aliases].some(alias => alias.toLocaleLowerCase("es-AR") === key)) ?? null;
}
