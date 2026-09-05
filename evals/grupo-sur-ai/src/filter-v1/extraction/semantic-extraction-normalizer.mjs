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
  else if (target && !tradeIn && !owned) vehicle.role = "target";

  const source = evidenceText(vehicle);
  if (vehicle.model_text && !source.includes(fold(vehicle.model_text)) && source.includes(fold(vehicle.literal ?? ""))) {
    vehicle.model_text = vehicle.literal;
    vehicle.version_text = null;
  }
}

function normalizeRequestedAction(extraction) {
  const action = extraction.requested_action;
  if (!action) return;
  const text = evidenceText(action);
  const matches = [
    ["deposit", /\b(sen(?:a|ar|arlo|arla)|reserv(?:ar|arlo|arla)|deposit(?:ar|o))\b/],
    ["transfer", /\b(transfer(?:ir|encia|irlo|irla)|transfiero)\b/],
    ["documents", /\b(documentacion|documentos?|papeles?)\b.*\b(enviar|mandar|presentar|llevar)\b|\b(enviar|mandar|presentar)\b.*\b(documentacion|documentos?|papeles?)\b/],
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

export function normalizeSemanticExtraction(candidate) {
  const normalized = emptySemanticExtraction();
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(candidate, key)) normalized[key] = structuredClone(candidate[key]);
  const ignored = Object.keys(candidate).filter(key => !allowed.has(key));
  const forbidden = ignored.filter(key => FORBIDDEN_EFFECT_FIELDS.includes(key));

  // Queries are not purchase declarations, regardless of a provider proposal.
  if (["installment_offer", "model_value", "delivery_advance", "subscription_amount", "ambiguous_initial_amount", "technical_question"].includes(normalized.query_intent) && normalized.purchase_mode_literal == null) normalized.purchase_mode_statement = "not_present";
  normalized.vehicle_mentions.forEach(normalizeVehicle);
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
