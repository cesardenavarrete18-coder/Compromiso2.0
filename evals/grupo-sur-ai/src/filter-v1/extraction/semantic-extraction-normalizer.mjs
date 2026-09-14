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
  // Family R2: a bare "no" is not by itself evidence of trade-in rejection - "No lo se
  // todavia", "No se", "No recuerdo", "No gracias", "No, es muy caro" and "No tengo decidido
  // todavia" all contain "no" yet none of them reject the trade-in offer; the old
  // `/\b(no|me la quedo|no la entrego)\b/` pattern treated the bare word as sufficient and
  // wrongly resolved trade_in=no for all of them. Rejection now requires either (a) a phrase
  // unambiguously scoped to the trade-in concept itself (mirrors safety-firewall.mjs's
  // parentNegative, which already gets this right for the negation-scope firewall), or (b) a
  // bare "no" combined with the customer naming what they want INSTEAD (explicitTarget) -
  // needed because "No, la Amarok es la que quiero comprar." answering an exclusive
  // trade-in question is a real, already-tested rejection-by-substitution (see
  // "explicit current target overrides prior trade-in question" in
  // filter-v1-final-closure.test.mjs) that carries no scoped rejection phrase of its own.
  const explicitTradeRejectionPhrase = /\b(?:no tengo (?:un )?(?:usado|auto|vehiculo|camioneta)|no (?:lo |la )?voy a entregar|no (?:lo |la )?entrego(?: (?:el|mi) (?:auto|usado|vehiculo|camioneta))?|(?:el|mi) (?:auto|usado|vehiculo|camioneta) no\b|sin (?:entregar )?(?:usado|auto|vehiculo|camioneta)|me (?:lo|la) quedo|me quedo con (?:el|mi) (?:auto|usado|vehiculo|camioneta))\b/.test(text);
  const explicitTradeNo = explicitTradeRejectionPhrase || (/\bno\b/.test(text) && explicitTarget);
  // entreg\w* (not the literal "entregar") so conjugations the customer/assistant actually
  // use in traffic - "entregando", "entrego", "entregás" - are recognized too; the current
  // message's own trade-in check below already used this broader stem.
  const tradeQuestion = /\b(usado|auto|vehiculo|camioneta)\b[^?]*(entreg\w*|parte de pago)|\b(entreg\w*|parte de pago)\b/.test(previousText);
  const ownershipQuestion = /\b(tenes|posees|contas con)\b[^?]*\b(auto|vehiculo|camioneta|usado)\b/.test(previousText) && !tradeQuestion;
  const targetQuestion = /\b(que|cual)\b[^?]*\b(modelo|auto|vehiculo)\b[^?]*(buscas|queres|interesa)/.test(previousText);
  const shortAnswer = text.split(/\s+/).length <= 8;
  // Family Q3 (2nd audit round): "multiple alternatives" is judged by whether the SAME
  // question also names a non-trade-in commercial path (financing, cash, a down payment)
  // alongside its trade-in clause - not by which conjunction/punctuation joins the options.
  // Detecting via " o " alone was wrong on both sides: it flagged "¿Tenés auto o camioneta
  // para entregar?" as multi-alternative even though "auto"/"camioneta" are just two
  // synonyms for the SAME trade-in offer (still an exclusive trade-in question - a bare "sí"
  // must keep resolving yes, per "contextual trade-in answer is not a target" in
  // filter-v1-final-closure.test.mjs); and it missed equivalent phrasings that list
  // alternatives without " o " at all, e.g. a comma list or "financiación/contado/usado".
  // Keying off the presence of an actual competing commercial-mode keyword fixes both.
  const NON_TRADE_IN_ALTERNATIVE = /\b(financia\w*|contado|efectivo|anticipo|cuotas?)\b/;
  const isMultiAlternativeQuestion = tradeQuestion && NON_TRADE_IN_ALTERNATIVE.test(previousText);
  // Family Q3 (3rd audit round): inside a multi-alternative question, "auto|vehiculo|
  // camioneta" alone are not sufficient evidence of trade-in - they describe the TARGET
  // vehicle just as easily ("quiero financiar el auto", "quiero el 208 financiado"). Only an
  // unambiguous signal counts here: usado, permuta, parte de pago, or an entregar-family verb.
  const currentHasUnambiguousTradeInSignal = /\b(usado|permut\w*|parte de pago|entreg\w*)\b/.test(text);
  if (tradeQuestion && (shortAnswer || explicitTarget)) {
    // explicitTarget must NOT exempt a multi-alternative answer from disambiguation:
    // naming the target model can classify vehicle_mentions as "target" (below), but it is
    // not evidence of trade_in=yes on its own (Family Q3, 3rd audit round) - so it is
    // deliberately absent from this condition, unlike the vehicle-role assignment further
    // down which still uses it.
    const answersADifferentAlternative = isMultiAlternativeQuestion && !currentHasUnambiguousTradeInSignal && !explicitTradeNo;
    if (answersADifferentAlternative) {
      // The current turn most likely resolved a DIFFERENT alternative (financing, cash, an
      // amount...), not trade-in. A provider that nonetheless proposed trade_in_intent=yes
      // for this turn is a hallucination and must be corrected here - an early `return`
      // that merely preserves whatever the provider proposed is not enough (Family Q3, 2nd
      // audit round).
      extraction.trade_in_intent = "not_present";
      extraction.evidence.trade_in_intent = null;
      return;
    }
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

// Family S2: purchase_mode_literal is a raw provider field (string|null, never validated
// against evidence anywhere in the pipeline) whose ONLY consumer in the whole codebase was
// this downgrade condition. Gating survival of a genuine declaration on it being non-null
// meant a real, unambiguous statement ("Lo voy a financiar. ¿Cuánto me queda la cuota?")
// was silently erased whenever the provider left the literal null in the same turn as a
// price/installment query - purchase_mode_literal was never a reliable signal to begin
// with. Replaced entirely by a deterministic check directly on the CURRENT MESSAGE (and,
// for a short contextual answer, the immediately preceding assistant question): only an
// unambiguous first-person declaration verb phrase counts, scoped to declarative clauses
// (a question clause is never itself a declaration, regardless of which words it contains).
// This also neutralizes a provider hallucination with no textual support - "¿Qué cuota
// tiene?" proposing financed, "¿Cuánto sale de contado?" proposing cash - the same way
// Family Q3 already neutralizes an unsupported trade_in_intent proposal.
const FINANCED_DECLARATION = /\b(?:lo voy a financiar|voy a financiarlo|lo quiero financiar|quiero financiarlo|lo financio|voy con financiacion)\b/;
const CASH_DECLARATION = /\b(?:lo pago al contado|lo compro al contado|voy de contado|pago en efectivo|voy al contado)\b/;
const PURCHASE_MODE_QUESTION = /\b(?:contado|efectivo)\b[^?]*\bfinanciad[oa]\b|\bfinanciad[oa]\b[^?]*\b(?:contado|efectivo)\b/;
const INDECISION_MARKER = /\b(?:no se|tal vez|quizas|capaz)\b/;

// Isolates declarative wording from interrogative wording within the same message ("Lo voy a
// financiar, ¿qué anticipo necesito?" must not be discarded just because the SAME turn also
// asks a question) - a proper ¿...? pair is stripped first, then any remaining informal
// ...? span without a leading ¿. What is left is split into clauses on . and ! only, and a
// clause opening with "si" (a conditional/hypothetical marker - "Si lo financiara...") is
// excluded, since a hypothetical is never a real decision.
function declarativeClauses(text) {
  const declarativeOnly = text.replace(/¿[^?]*\?/g, " ").replace(/[^.!¿]*\?/g, " ");
  return declarativeOnly.split(/[.!]+/).map(part => part.trim()).filter(Boolean).filter(clause => !/^si\b/.test(clause));
}

function detectPurchaseModeDeclaration(input) {
  const current = input?.current_message;
  if (!current) return null;
  const text = fold(current.text);
  for (const clause of declarativeClauses(text)) {
    if (FINANCED_DECLARATION.test(clause)) return "financed";
    if (CASH_DECLARATION.test(clause)) return "cash";
  }
  // A bare "Financiado"/"Contado" only counts as a declaration when it directly answers a
  // question whose sole topic was the payment mode itself - mirrors the same contextual
  // short-answer pattern already used for trade-in questions in normalizeContextualSemantics.
  const previous = input?.recent_conversation?.[0];
  const previousText = previous?.role === "assistant" ? fold(previous.text) : "";
  const shortAnswer = text.trim().split(/\s+/).length <= 4;
  if (PURCHASE_MODE_QUESTION.test(previousText) && shortAnswer && !INDECISION_MARKER.test(text)) {
    if (/\bfinanciad[oa]\b/.test(text)) return "financed";
    if (/\b(?:contado|efectivo)\b/.test(text)) return "cash";
  }
  return null;
}

export function normalizeSemanticExtraction(candidate, input = null) {
  const normalized = emptySemanticExtraction();
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(candidate, key)) normalized[key] = structuredClone(candidate[key]);
  const ignored = Object.keys(candidate).filter(key => !allowed.has(key));
  const forbidden = ignored.filter(key => FORBIDDEN_EFFECT_FIELDS.includes(key));

  // Queries are not purchase declarations, regardless of a provider proposal.
  normalizeQueryIntent(normalized, input);
  // Family S2: only a message with real current-turn context is re-classified here - no
  // current_message at all (offline/unit callers) preserves whatever the candidate proposed,
  // matching every other contextual normalizer function in this file.
  if (input?.current_message) normalized.purchase_mode_statement = detectPurchaseModeDeclaration(input) ?? "not_present";
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
