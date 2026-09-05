import { emptySemanticExtraction, FORBIDDEN_EFFECT_FIELDS } from "./semantic-extraction-contract.mjs";

const allowed = new Set(Object.keys(emptySemanticExtraction()));
const fold = value => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const evidenceText = item => fold((Array.isArray(item.evidence) ? item.evidence : [item.evidence]).filter(Boolean).map(value => value.literal).join(" "));

function normalizeAmountKind(amount) {
  const text = evidenceText(amount);
  const monthly = /\b(cuotas?|mensual(?:es)?|por (?:cada )?mes|al mes)\b/.test(text);
  const downPayment = /\b(anticipo|entrada|entrega inicial)\b/.test(text);
  if (monthly && downPayment) {
    amount.kind = "unknown_amount";
    amount.certainty = "ambiguous";
  } else if (monthly) amount.kind = "monthly_installment_capacity";
  else if (downPayment) amount.kind = "down_payment_capacity";
  return monthly && downPayment;
}

function mentionContext(vehicle) {
  const text = evidenceText(vehicle);
  const literal = fold(vehicle.literal ?? vehicle.model_text ?? "");
  const index = literal ? text.indexOf(literal) : -1;
  if (index < 0) return text;
  const before = text.slice(0, index);
  const after = text.slice(index + literal.length);
  const left = Math.max(before.lastIndexOf("."), before.lastIndexOf(","), before.lastIndexOf(" y "));
  const candidates = [after.indexOf("."), after.indexOf(","), after.indexOf(" y ")].filter(value => value >= 0);
  return `${before.slice(left + 1)} ${literal} ${after.slice(0, candidates.length ? Math.min(...candidates) : undefined)}`;
}

function normalizeVehicle(vehicle) {
  const text = mentionContext(vehicle);
  const tradeIn = /\b(entreg(?:o|ar|aria|ue)|parte de pago|tom(?:en|ar).*usado|canje)\b/.test(text);
  const owned = /\b(tengo|poseo|es mi[oa]?|mi (?:auto|camioneta|vehiculo|coche))\b/.test(text);
  const target = /\b(quiero|busco|compr(?:ar|o)|me interesa|estoy viendo|voy por)\b/.test(text);
  if (tradeIn && !target) vehicle.role = "trade_in";
  else if (owned && !target) vehicle.role = "owned_only";
  else if (target && !tradeIn && !owned && !["target_candidate", "comparison"].includes(vehicle.role)) vehicle.role = "target";

  const source = evidenceText(vehicle);
  if (vehicle.model_text && !source.includes(fold(vehicle.model_text)) && source.includes(fold(vehicle.literal ?? ""))) {
    vehicle.model_text = vehicle.literal;
    vehicle.version_text = null;
  }
}

const evidenceFor = message => ({ source_message_id: message.id, literal: message.text });

function normalizeContextualSemantics(extraction, input) {
  const current = input?.current_message;
  const previous = input?.recent_conversation?.[0];
  if (!current) return;
  const text = fold(current.text);
  const previousText = previous?.role === "assistant" ? fold(previous.text) : "";
  const explicitTarget = /\b(quiero|busco|comprar|es la que quiero|me decidi por)\b/.test(text);
  const explicitTradeNo = /\b(no|me la quedo|no la entrego)\b/.test(text);
  const tradeQuestion = /\b(usado|auto|vehiculo|camioneta)\b[^?]*(entregar|parte de pago)|\b(entregar|parte de pago)\b/.test(previousText);
  const ownershipQuestion = /\b(tenes|posees|contas con)\b[^?]*\b(auto|vehiculo|camioneta|usado)\b/.test(previousText) && !tradeQuestion;
  const targetQuestion = /\b(que|cual)\b[^?]*\b(modelo|auto|vehiculo)\b[^?]*(buscas|queres|interesa)/.test(previousText);
  const shortAnswer = text.split(/\s+/).length <= 8;
  if (tradeQuestion && (shortAnswer || explicitTarget)) {
    extraction.trade_in_intent = explicitTradeNo ? "no" : "yes";
    extraction.evidence.trade_in_intent = [evidenceFor(current), evidenceFor(previous)];
    for (const vehicle of extraction.vehicle_mentions) {
      vehicle.role = explicitTarget ? "target" : "trade_in";
      vehicle.certainty = explicitTarget ? "explicit" : "contextual";
      vehicle.evidence = [evidenceFor(current), evidenceFor(previous)];
    }
    if (!explicitTarget) extraction.customer_corrections = extraction.customer_corrections.filter(item => item.field !== "target_model");
  } else if (ownershipQuestion && shortAnswer) {
    extraction.trade_in_intent = "not_present";
    extraction.evidence.trade_in_intent = null;
    for (const vehicle of extraction.vehicle_mentions) { vehicle.role = "owned_only"; vehicle.certainty = "contextual"; vehicle.evidence = [evidenceFor(current), evidenceFor(previous)]; }
    extraction.customer_corrections = extraction.customer_corrections.filter(item => item.field !== "target_model");
  } else if (targetQuestion && shortAnswer) {
    for (const vehicle of extraction.vehicle_mentions) { vehicle.role = "target"; vehicle.certainty = "contextual"; vehicle.evidence = [evidenceFor(current), evidenceFor(previous)]; }
  }
}

function normalizeQueryIntent(extraction, input) {
  const current = input?.current_message;
  if (!current) return;
  const text = fold(current.text);
  const price = /\b(precio|cuanto (?:sale|cuesta|vale)|que valor|cual es el valor|valor de)\b/.test(text);
  const technical = /\b(motor|motorizacion|potencia|cilindrada|caja|transmision|automatic[ao]|manual|version|equipamiento|seguridad|airbags?|adas|consumo|carroceria|pick[ -]?up|suv|dimensiones|baul|capacidad de carga|traccion|llantas|multimedia)\b/.test(text);
  const technicalQuestion = technical && (/\?/.test(text) || /^(?:¿)?(que|cual|es|tiene|trae)\b/.test(text));
  const ambiguousInitial = /\b(suscrib\w*|entr(?:o|ar) al plan|arranc(?:o|ar) el plan|con cuanto (?:puedo )?entrar|necesito de entrada)\b/.test(text);
  if (ambiguousInitial) {
    extraction.query_intent = "ambiguous_initial_amount";
    extraction.evidence.query_intent = [evidenceFor(current)];
    if (!extraction.needs_clarification.some(item => item.code === "initial_amount_intent")) extraction.needs_clarification.push({ code: "initial_amount_intent", evidence: [evidenceFor(current)] });
  } else if (technicalQuestion && !price) {
    extraction.query_intent = "technical_question";
    extraction.evidence.query_intent = [evidenceFor(current)];
  } else if (price) {
    extraction.query_intent = "model_value";
    extraction.evidence.query_intent = [evidenceFor(current)];
  } else if (extraction.query_intent === "model_value") {
    extraction.query_intent = technicalQuestion ? "technical_question" : "general_information";
    extraction.evidence.query_intent = [evidenceFor(current)];
  }
}

function normalizeAlternatives(extraction, input) {
  const text = fold(input?.current_message?.text ?? "");
  if (extraction.vehicle_mentions.length < 2 || !/\b(o|entre)\b/.test(text)) return;
  const alternatives = extraction.vehicle_mentions.filter(item => ["target", "target_candidate"].includes(item.role));
  if (alternatives.length < 2) return;
  alternatives.forEach(item => { item.role = "target_candidate"; });
  if (!extraction.needs_clarification.some(item => ["multiple_target_models", "cross_brand_target"].includes(item.code))) extraction.needs_clarification.push({ code: "multiple_target_models", evidence: [evidenceFor(input.current_message)] });
}

function normalizeRequestedAction(extraction) {
  const action = extraction.requested_action;
  if (!action) return;
  const text = evidenceText(action);
  const matches = [
    ["deposit", /\b(sen(?:a|ar|arlo|arla)|reserv(?:ar|arlo|arla)|deposit(?:ar|o))\b/],
    ["transfer", /\b(transfer(?:ir|encia|irlo|irla)|transfiero)\b/],
    ["documents", /\b(documentacion|documentos?|papeles?)\b.*\b(enviar|mand(?:ar|o)|presentar|llevar)\b|\b(enviar|mand(?:ar|o)|presentar)\b.*\b(documentacion|documentos?|papeles?)\b/],
    ["visit", /\b(ir|voy|puedo ir|visitar)\b[^.?!]*(verlo|verla|concesionari[oa]|local)|\bvisita\b/],
    ["advance_purchase", /\b(avanzar|seguir adelante)\b[^.?!]*\b(compra|operacion)\b/],
  ].filter(([, pattern]) => pattern.test(text));
  if (matches.length === 1) action.type = matches[0][0];
  else if (action.type === "other" || matches.length > 1) extraction.requested_action = null;
}

function normalizeArgentineAmount(amount) {
  const literal = amount.literal?.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  if (!literal) return;
  let value = null;
  if (/\bcero\b/.test(literal)) value = 0;
  else if (/\bdiez\s+millones\b/.test(literal)) value = 10_000_000;
  else {
    const scaled = literal.match(/\b(\d+)\s*(millones?|palos?|lucas?)\b/);
    if (scaled) value = Number(scaled[1]) * (/lucas?/.test(scaled[2]) ? 1_000 : 1_000_000);
  }
  if (value !== null) {
    amount.numeric_value = value;
    if (amount.certainty === "ambiguous") amount.certainty = "explicit";
  }
}

export function normalizeSemanticExtraction(candidate, input = null) {
  const normalized = emptySemanticExtraction();
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(candidate, key)) normalized[key] = structuredClone(candidate[key]);
  const ignored = Object.keys(candidate).filter(key => !allowed.has(key));
  const forbidden = ignored.filter(key => FORBIDDEN_EFFECT_FIELDS.includes(key));

  // Queries are not purchase declarations, regardless of a provider proposal.
  normalizeQueryIntent(normalized, input);
  if (["installment_offer", "model_value", "delivery_advance", "ambiguous_initial_amount", "technical_question"].includes(normalized.query_intent) && normalized.purchase_mode_literal == null) normalized.purchase_mode_statement = "not_present";
  normalized.vehicle_mentions.forEach(normalizeVehicle);
  normalizeContextualSemantics(normalized, input);
  normalizeAlternatives(normalized, input);
  for (const amount of normalized.amount_mentions) {
    const conflictingKind = normalizeAmountKind(amount);
    normalizeArgentineAmount(amount);
    if (conflictingKind) amount.certainty = "ambiguous";
    if (amount.certainty === "ambiguous") { amount.numeric_value = null; amount.currency = null; }
    if (amount.numeric_value === 0) amount.numeric_value = 0;
  }
  normalizeRequestedAction(normalized);
  // This operational signal is deterministic: provider proposals never bypass the action allowlist.
  normalized.strong_action = null;
  if (normalized.requested_action && ["visit", "deposit", "transfer", "documents", "advance_purchase"].includes(normalized.requested_action.type))
    normalized.strong_action = { type: "strong_action", evidence: structuredClone(normalized.requested_action.evidence) };
  return Object.freeze({ extraction: normalized, ignored_fields: ignored, forbidden_effect_fields: forbidden });
}
