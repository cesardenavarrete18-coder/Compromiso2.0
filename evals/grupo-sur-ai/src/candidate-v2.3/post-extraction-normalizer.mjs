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
  const humanRequest = /\b(?:pasame|comunicame|quiero hablar|que me atienda|contactame)\b[^.!?]{0,45}\b(?:alguien|persona|humano|asesor(?:a)?|vendedor(?:a)?|representante|operador(?:a)?)\b|\b(?:asesor(?:a)?|persona|humano)\b[^.!?]{0,35}\b(?:me llame|me contacte|me atienda)\b/i.test(text);
  const documentationReady = /\b(?:tengo|ya tengo|cuento con|prepare|presente)\b[^.!?]{0,35}\b(?:la )?documentacion\b/i.test(text)
    && /\b(?:avanz|inici|present|entreg|list[oa]|hoy|ahora)\b/i.test(text);
  const explicitPlan = /\b(?:quiero|elijo|voy con|me interesa|contrato|prefiero|seria)\b[^.!?]{0,45}\bplan(?: de ahorro)?\b|\bplan de ahorro\b[^.!?]{0,35}\b(?:es mi opcion|me sirve|quiero)\b/i.test(text);
  const explicitFinancing = /\b(?:quiero|elijo|voy con|prefiero|seria)\b[^.!?]{0,45}\bfinanciacion\b/i.test(text);
  if (deposit) { output.deposit_intent = knownField("ready", { message_id: messageId, quote: raw }); output.commercial_action_request = knownField("deposit", { message_id: messageId, quote: raw }); output.commercial_intent = knownField("action_ready", { message_id: messageId, quote: raw }); }
  if (visit) { output.visit_intent = knownField("requested", { message_id: messageId, quote: raw }); output.commercial_action_request = knownField("visit", { message_id: messageId, quote: raw }); output.commercial_intent = knownField("action_ready", { message_id: messageId, quote: raw }); }
  if (humanRequest) output.human_request = knownField("explicit", { message_id: messageId, quote: raw });
  if (documentationReady) { output.commercial_action_request = knownField("documentation", { message_id: messageId, quote: raw }); output.commercial_intent = knownField("action_ready", { message_id: messageId, quote: raw }); }
  // Exact modality requires transactional language. Merely discussing cuotas,
  // anticipos or financing in general is retained only as financing_context.
  const proposedModality = output.purchase_modality?.value;
  // Extraction evidence is model-generated and cannot establish provenance.
  // New customer-sourced modality must be supported by the literal inbound turn.
  const modalityEvidence = text;
  const supportedCustomerModality = output.purchase_modality?.status === "known" && output.purchase_modality.source === "customer" && (
    proposedModality === "financing" && /\b(?:financiar|financiacion|financiado|financiada)\b/i.test(modalityEvidence)
    || proposedModality === "savings_plan" && /\bplan(?: de ahorro)?\b/i.test(modalityEvidence)
    || proposedModality === "credit" && /\bcredito\b/i.test(modalityEvidence)
    || proposedModality === "used_plus_financing" && /\b(?:usado|entrego|entregar|dejo|tomo)\b/i.test(modalityEvidence) && /\b(?:financiar|financiacion|financiado|financiada)\b/i.test(modalityEvidence)
    || proposedModality === "cash" && explicitCash
  );
  if (explicitPlan) output.purchase_modality = knownField("savings_plan", { message_id: messageId, quote: raw });
  else if (explicitFinancing && proposedModality !== "used_plus_financing") output.purchase_modality = knownField("financing", { message_id: messageId, quote: raw });
  else if (financingContext && output.purchase_modality?.status === "known" && output.purchase_modality.source !== "customer") {
    // Persisted and Meta state are resolved by the accumulator and must not be
    // erased by a neutral current turn.
  } else if (financingContext && output.purchase_modality?.status === "known" && !supportedCustomerModality) {
    output.purchase_modality = { ...output.purchase_modality, value: null, status: "unknown", confidence: "high", source: "system", evidence: [] };
  }
  const vehicleMentions = mentions.map(({ brand, model, trade }) => ({ brand, model, trade }));
  const existing = runtimeInput.existing_model_interest && canonicalParts(runtimeInput.existing_model_interest);
  const advertised = runtimeInput.meta_referral?.advertised_model && canonicalParts(runtimeInput.meta_referral.advertised_model);
  for (const item of [existing, advertised].filter(Boolean)) if (!vehicleMentions.some(v => normalize(`${v.brand} ${v.model}`) === normalize(`${item.brand} ${item.model}`))) vehicleMentions.push({ ...item, trade: false });
  if (/\btera\b[^?]{0,35}\b(?:pick[ -]?up|camioneta pickup)\b/i.test(text)) {
    const tera = vehicleMentions.find(item => /^tera$/i.test(item.model));
    if (tera) tera.pickup_question = true;
  }
  return { extraction: output, signals: { financing_context: financingContext, commercial_continuity: commercialContinuity, model_comparison: comparison, vehicle_mentions: vehicleMentions } };
}
