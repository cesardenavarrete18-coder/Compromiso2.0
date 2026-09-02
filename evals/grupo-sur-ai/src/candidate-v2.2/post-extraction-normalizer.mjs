import { OPERATIVE_VEHICLE_CATALOG } from "./operative-catalog.mjs";
import { knownField } from "./extraction-schema.mjs";

const normalize = value => String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const evidence = (text, messageId) => ({ message_id: messageId, quote: text });
const canonicalParts = canonical => { const [brand, ...model] = String(canonical).split(/\s+/); return { brand, model: model.join(" ") }; };

// The deployed runtime catalog includes aliases (for example t-cross/tcross).
// Grouping by normalized model name makes uniqueness explicit rather than
// assuming every lexical match can identify a brand.
function buildCatalogIndex(entries) {
  const byModel = new Map();
  for (const [alias, canonical] of entries) {
    const vehicle = canonicalParts(canonical);
    const modelKey = normalize(vehicle.model);
    const current = byModel.get(modelKey) || { canonicals: new Map(), aliases: new Set() };
    current.canonicals.set(normalize(canonical), vehicle);
    const normalizedAlias = normalize(alias);
    current.aliases.add(normalizedAlias);
    const aliasModel = normalizedAlias.split(" ").slice(1).join(" ");
    if (aliasModel) current.aliases.add(aliasModel);
    current.aliases.add(modelKey);
    byModel.set(modelKey, current);
  }
  return [...byModel.values()].filter(item => item.canonicals.size === 1).map(item => ({
    ...[...item.canonicals.values()][0], aliases: [...item.aliases].sort((a, b) => b.length - a.length),
  }));
}

export const operativeVehicleCatalog = Object.freeze(buildCatalogIndex(OPERATIVE_VEHICLE_CATALOG));
const hasComparison = text => /\b(?:vs|versus|compar(?:o|ar|ando)|entre|o bien|cualquiera)\b/i.test(text);
const isTradeClause = (text, index) => /(?:entrego|dejo|tomo|usado)(?:\s+un[ao]?)?[^,.]{0,35}$/i.test(text.slice(Math.max(0, index - 50), index));
function mentionsIn(text) {
  const matches = [];
  for (const vehicle of operativeVehicleCatalog) for (const alias of vehicle.aliases) {
    const match = new RegExp(`(?:^|\\b)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\b|$)`, "i").exec(text);
    if (match) { matches.push({ ...vehicle, alias, index: match.index, trade: isTradeClause(text, match.index) }); break; }
  }
  return matches;
}

export function normalizePostExtraction({ extraction, runtimeInput = {} }) {
  const output = structuredClone(extraction); const raw = runtimeInput.inbound_message?.text || ""; const text = normalize(raw);
  const messageId = runtimeInput.inbound_message?.id || "inbound"; const mentions = mentionsIn(text);
  const targetMentions = mentions.filter(item => !item.trade); const comparison = (output.ambiguities || []).some(item => item.kind === "model_comparison") || (hasComparison(text) && targetMentions.length > 1);
  if (comparison) {
    output.model_interest = { ...output.model_interest, value: null, status: "unknown", evidence: [] };
    if (!(output.ambiguities || []).some(item => item.kind === "model_comparison")) output.ambiguities.push({ field: "model_interest", kind: "model_comparison", evidence: [evidence(raw, messageId)] });
  } else if (targetMentions.length === 1 && output.model_interest?.status !== "conflicting") {
    const found = targetMentions[0]; output.model_interest = knownField({ brand: found.brand, model: found.model, variant: output.model_interest?.value?.variant || null }, { message_id: messageId, quote: found.alias });
  }
  const tradeMention = mentions.find(item => item.trade);
  if (tradeMention) {
    output.has_trade_in = knownField("yes", { message_id: messageId, quote: raw });
    output.trade_in.brand = knownField(tradeMention.brand, { message_id: messageId, quote: tradeMention.alias });
    output.trade_in.model = knownField(tradeMention.model, { message_id: messageId, quote: tradeMention.alias });
  }
  const explicitCash = /\b(?:lo|la) compro al contado\b|\bquiero comprar(?:lo|la| [^?.]{1,40}) al contado\b|\bquiero pag(?:ar|arlo|arla)(?: [^?.]{0,30})? al contado\b|\bpago (?:el )?total\b|\bpago todo(?: en efectivo)?\b|\bquiero hacer la operacion al contado\b/i.test(text);
  const priceIdiom = /\b(?:precio|valor)(?: [^?.]{0,35})? (?:de|al) contado\b|\bcuanto (?:sale|cuesta|vale)(?: [^?.]{0,35})? (?:de|al) contado\b|\bdescuento pagando al contado\b/i.test(text);
  if (explicitCash) output.purchase_modality = knownField("cash", { message_id: messageId, quote: raw });
  else if (priceIdiom && output.purchase_modality?.value === "cash") output.purchase_modality = { ...output.purchase_modality, value: null, status: "unknown", confidence: "high", source: "system", evidence: [] };
  const financingContext = /\b(?:cuota|anticipo|financi|plan|con cuanto retiro|cuanto tendria que poner)\b/i.test(text);
  const commercialContinuity = /\b(?:precio|cuota|anticipo|entrega|equipamiento|plan|financi|disponibilidad|tiktok|anuncio)\b/i.test(text);
  const deposit = /\b(?:quiero (?:senarlo|senarla|reservarlo|reservarla)|hago la reserva|avanzo con la sena)\b/i.test(text);
  const visit = /\b(?:voy hoy|voy a ir|me acerco(?: hoy| manana)?|quiero ir (?:a|al)|quiero coordinar una visita)\b/i.test(text);
  if (deposit) { output.deposit_intent = knownField("ready", { message_id: messageId, quote: raw }); output.commercial_action_request = knownField("deposit", { message_id: messageId, quote: raw }); output.commercial_intent = knownField("action_ready", { message_id: messageId, quote: raw }); }
  if (visit) { output.visit_intent = knownField("requested", { message_id: messageId, quote: raw }); output.commercial_action_request = knownField("visit", { message_id: messageId, quote: raw }); output.commercial_intent = knownField("action_ready", { message_id: messageId, quote: raw }); }
  return { extraction: output, signals: { financing_context: financingContext, commercial_continuity: commercialContinuity, model_comparison: comparison } };
}
