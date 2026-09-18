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
  // "presio" is a confirmed, non-hypothetical spelling alias of "precio" (real Candidate 3
  // traffic: 4 inbound messages contain "presio" vs 44 with "precio") - added as an explicit
  // alias, not fuzzy/Levenshtein matching, and scoped to this one observed variant only.
  const price = /\b(precio|presio|cuanto (?:sale|cuesta|vale)|que valor|cual es el valor|valor de)\b/.test(text);
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
    // "mil" is as explicit and dictionary-standard a scale word as "millones" - it
    // belongs alongside it, not just the slang terms ("palos"/"lucas"), and its
    // absence here (while "lucas", its slang synonym, was already handled) was an
    // inconsistency in this list, not a deliberate scope boundary.
    const scaled = literal.match(/\b(\d+)\s*(mil|millones?|palos?|lucas?)\b/);
    // scaled[2] is the whole matched word already ("mil", "millon"/"millones",
    // "palo"/"palos" or "luca"/"lucas") - this must be an ANCHORED equality check,
    // not a bare substring test: "millones" itself contains "mil" as a substring,
    // so an unanchored /mil/.test() would wrongly multiply "2 millones" by 1_000.
    if (scaled) value = Number(scaled[1]) * (/^(mil|lucas?)$/.test(scaled[2]) ? 1_000 : 1_000_000);
  }
  if (value !== null) {
    amount.numeric_value = value;
    if (amount.certainty === "ambiguous") amount.certainty = "explicit";
  }
}

// Pre-canary blocker (real Candidate 2 incident): a monthly_installment_capacity or
// down_payment_capacity amount whose numeric_value came from the provider (LLM) as
// "explicit"/"contextual" is trustworthy only when the literal ITSELF makes the scale
// unambiguous - an explicit scale word (mil/millones/palos/lucas), an explicit
// currency/unit word, or enough digits that the customer plainly typed the full
// number out (e.g. "300.000", not "300"). Real incident: "cuotas de 300 a 500 x mes"
// was extracted as numeric_value 300/500, certainty "explicit" - the literal alone
// never says whether the customer meant 300 pesos or 300 mil pesos, but the provider
// asserted a specific answer anyway, and nothing downstream ever challenged it. This
// is a pure trust boundary: it never invents or upscales a value (that would be the
// "no inferir escalas por intuición" violation) - it only refuses to accept an
// unsupported "explicit" claim, downgrading it to the same ambiguous/null shape the
// provider is already expected to produce for a genuinely scale-less mention (see
// "Tengo 5.000 para entrar" in the prompt). Zero is exempt: "cero" has no scale to be
// ambiguous about.
const AMBIGUOUS_CAPACITY_KINDS = new Set(["monthly_installment_capacity", "down_payment_capacity"]);
// Mirrors the convention already used by every legitimate contextual resolution elsewhere in
// this file (trade-in/purchase-mode short answers, the "$10 millones" contextual down-payment
// case): the CURRENT message must be part of the proof, not just conversation history. No
// current_message at all (offline/unit callers) preserves prior behavior, matching every other
// contextual normalizer function here.
function hasCurrentTurnEvidence(amount, input) {
  const currentId = input?.current_message?.id;
  if (!currentId) return true;
  const evidence = Array.isArray(amount.evidence) ? amount.evidence : [amount.evidence].filter(Boolean);
  return evidence.some(item => item?.source_message_id === currentId);
}
const EXPLICIT_SCALE_OR_CURRENCY_WORDS = /\b(mil|millon\w*|palos?|lucas?|pesos?|dolares|ars|u\$s)\b/;
// "Nm" (e.g. "2m") is not a new capability being added here: the provider itself
// already reliably resolves it to millions unassisted in real traffic (confirmed,
// e.g. real Candidate 2 lead e8ffcdc7: "2m" -> numeric_value 2000000, correctly).
// This only teaches the TRUST check the same abbreviation, so this fix does not
// regress that already-relied-upon behavior. It is scoped to a digit immediately
// followed by "m" - distinct from "k", which is audited as unsupported (see report).
const DIGIT_M_ABBREVIATION = /\b\d+\s*m\b/;
function hasSelfEvidentScale(literal) {
  if (EXPLICIT_SCALE_OR_CURRENCY_WORDS.test(literal) || DIGIT_M_ABBREVIATION.test(literal)) return true;
  const digitGroups = literal.replace(/[.,]/g, "").match(/\d+/g) ?? [];
  return digitGroups.some(group => group.length >= 4);
}
function flagAmbiguousCapacityScale(normalized, amount) {
  amount.certainty = "ambiguous";
  amount.confirmation_recommended = true;
  if (!normalized.needs_clarification.some(item => item.code === "amount_scale_or_currency" && item.evidence === amount.evidence))
    normalized.needs_clarification.push({ code: "amount_scale_or_currency", evidence: amount.evidence });
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
const INDECISION_MARKER = /\b(?:no se|tal vez|quizas|capaz|estoy entre)\b/;
// "Interest in information" is not a decision: "Me interesa saber la financiación" and "Quiero
// saber qué financiación tienen" are about the grammatical object of "saber" (finding out), never
// "financiar"/"pagar" (doing). This is deliberately narrow to that verb framing, not a broader
// financing-topic keyword match, so it does not swallow a real declaration that happens to share
// vocabulary with an information request.
const INFORMATIONAL_INTEREST = /\b(?:me interesa saber|quiero saber|quisiera saber|necesito saber)\b/;
// Loose (non-declaration-grade) signals used ONLY to detect that BOTH commercial paths were named
// in the same turn - "conflicting" needs a coarser net than a firm declaration does, since the
// customer is naming two options, not committing to either with the same verb-phrase precision.
const CASH_SIGNAL = /\b(?:contado|efectivo|cash)\b/;
const FINANCED_SIGNAL = /\b(?:financ\w+|credito|plan)\b/;

// Isolates declarative wording from interrogative wording within the same message ("Lo voy a
// financiar, ¿qué anticipo necesito?" must not be discarded just because the SAME turn also
// asks a question) - a proper ¿...? pair is stripped first, then any remaining informal
// ...? span without a leading ¿. The informal-span match itself stops at a comma (not just at
// . and !): "Lo voy a financiar, que anticipo necesito?" has no ¿ and no ./!, so without the
// comma boundary the informal-question match would run from the very start of the string and
// swallow the declaration along with the question it shares a clause with. What is left is
// split into clauses on . and ! only. declarativeClausesRaw keeps a hypothetical "si..." clause
// in (needed to tell "the only declarative content was a hypothetical" apart from "there was no
// declarative content at all"); declarativeClauses filters it out for every other purpose, since
// a hypothetical is never a real decision.
function declarativeClausesRaw(text) {
  const declarativeOnly = text.replace(/¿[^?]*\?/g, " ").replace(/[^.!,¿]*\?/g, " ");
  return declarativeOnly.split(/[.!]+/).map(part => part.trim()).filter(Boolean);
}
function declarativeClauses(text) {
  return declarativeClausesRaw(text).filter(clause => !/^si\b/.test(clause));
}

// Real customer traffic drops the "?" entirely on a colloquial question ("qué planes ofrecen",
// FVS-028) at least as often as it uses one - WH_QUESTION_LEAD catches those the same way
// normalizeQueryIntent's own technicalQuestion check already leans on a leading question word
// (que|cual|es|tiene|trae) as a query signal independent of punctuation.
const WH_QUESTION_LEAD = /^(?:que|cual|como|cuanto|cuando|donde|quien|hay)\b/;

// A clause only counts as being ABOUT purchase mode - for indecision or informational-interest
// purposes - when it also carries a loose cash/financed signal. "No sé qué versión es" and "No
// sé si viene automática" both match INDECISION_MARKER's "no se", but neither is doubt about HOW
// to pay; only "no se si contado o financiado" is. Same for INFORMATIONAL_INTEREST: "Quiero saber
// qué motor trae" is not a financing question, "Quiero saber qué financiación tienen" is.
function clauseHasModeSignal(clause) {
  return CASH_SIGNAL.test(clause) || FINANCED_SIGNAL.test(clause);
}

// Family S2 (4th post-merge audit round): INDECISION_MARKER/INFORMATIONAL_INTEREST were tested
// against the WHOLE message, so doubt or curiosity about a DIFFERENT attribute in one clause
// ("No sé qué versión es.", "Quiero saber qué motor trae.") neutralized a real purchase_mode
// signal sitting in a completely separate clause ("Quiero entrar en un plan.") - the same
// whole-message-scope bug the 3rd round already fixed for "?", now recurring for these two
// markers. Both are now scoped per-clause via clauseHasModeSignal, and only an
// indecision/informational clause that is ALSO the sole source of purchase-mode content
// (no other clause independently carries a signal) is allowed to neutralize.
//
// This function resolves each message into exactly one of four outcomes, checked in order:
//   1. EXPLICIT (return {mode, evidence}): an unambiguous first-person commitment verb-phrase in a
//      non-interrogative, non-hypothetical clause, or (2) a short contextual answer to a
//      payment-mode question. Always overrides the provider.
//   3. A wholly hypothetical declarative remainder (declarativeClausesRaw found clauses but
//      declarativeClauses filtered all of them out as "si..."), or a clause expressing genuine
//      indecision ABOUT purchase mode specifically (INDECISION_MARKER + clauseHasModeSignal, e.g.
//      "no se si contado o financiado") -> EXPLICIT_NEGATIVE. Checked unconditionally, even
//      without a "?" anywhere ("Estoy entre contado y financiacion" has none).
//   4. CONFLICTING (return {mode:"conflicting", evidence}): the message's PLAIN non-interrogative
//      clauses (every non-interrogative clause except one that is itself informational-interest-
//      about-mode - see step 5) together name BOTH commercial paths (a coarser, signal-level
//      check - see CASH_SIGNAL/FINANCED_SIGNAL). Checked before step 5 so a conflicting
//      declaration sharing a turn with a question, or with an informational clause, still
//      resolves conflicting.
//   5. EXPLICIT_NEGATIVE (return {mode:"not_present", evidence:null}): the plain clauses carry no
//      purchase-mode signal at all, AND EITHER an informational-interest-about-mode clause was
//      the only mode-related content in the turn ("Quiero saber qué financiación tienen.",
//      regardless of punctuation), OR the message is fundamentally a question (a "?" anywhere, or
//      a colloquial WH-lead with none) with nothing else to go on. Never a decision, so any
//      provider proposal here is a hallucination and is neutralized, evidence included. An
//      informational clause sharing the turn with a DIFFERENT, signal-bearing plain clause
//      ("Quiero entrar en un plan. Quiero saber qué financiación tienen.") does not reach this
//      step at all - the plain clause's signal already carries the message to step 6.
//   6. INCONCLUSIVE (return null): the plain clauses carry a purchase-mode signal too loose to
//      classify outright, e.g. "Quiero entrar en un plan." on its own, or sharing a turn with an
//      unrelated question or an informational clause about the SAME topic. The caller leaves the
//      candidate's own value untouched instead of defaulting it to "not_present" -
//      sanitizeSemanticEvidence already reset any material scalar signal with invalid or missing
//      evidence to "not_present" before this function ever runs, so trusting what survives that
//      gate here does not reopen the hallucination hole S2 was written to close.
function detectPurchaseModeDeclaration(input) {
  const current = input?.current_message;
  if (!current) return null;
  const text = fold(current.text);
  const rawClauses = declarativeClausesRaw(text);
  const clauses = rawClauses.filter(clause => !/^si\b/.test(clause));

  for (const clause of clauses) {
    if (FINANCED_DECLARATION.test(clause)) return { mode: "financed", evidence: [evidenceFor(current)] };
    if (CASH_DECLARATION.test(clause)) return { mode: "cash", evidence: [evidenceFor(current)] };
  }
  // A bare "Financiado"/"Contado" only counts as a declaration when it directly answers a
  // question whose sole topic was the payment mode itself - mirrors the same contextual
  // short-answer pattern already used for trade-in questions in normalizeContextualSemantics.
  const previous = input?.recent_conversation?.[0];
  const previousText = previous?.role === "assistant" ? fold(previous.text) : "";
  const shortAnswer = text.trim().split(/\s+/).length <= 4;
  if (PURCHASE_MODE_QUESTION.test(previousText) && shortAnswer && !INDECISION_MARKER.test(text)) {
    if (/\bfinanciad[oa]\b/.test(text)) return { mode: "financed", evidence: [evidenceFor(current), evidenceFor(previous)] };
    if (/\b(?:contado|efectivo)\b/.test(text)) return { mode: "cash", evidence: [evidenceFor(current), evidenceFor(previous)] };
  }

  if (rawClauses.length > 0 && clauses.length === 0) return { mode: "not_present", evidence: null }; // every declarative clause was hypothetical
  if (clauses.some(clause => INDECISION_MARKER.test(clause) && clauseHasModeSignal(clause))) return { mode: "not_present", evidence: null };

  const informationalClauses = clauses.filter(clause => INFORMATIONAL_INTEREST.test(clause) && clauseHasModeSignal(clause));
  const plainClauses = clauses.filter(clause => !informationalClauses.includes(clause));
  const plainText = plainClauses.join(" ");

  if (CASH_SIGNAL.test(plainText) && FINANCED_SIGNAL.test(plainText)) return { mode: "conflicting", evidence: [evidenceFor(current)] };

  if (!clauseHasModeSignal(plainText)) {
    if (informationalClauses.length > 0) return { mode: "not_present", evidence: null };
    const isQuery = /\?/.test(text) || WH_QUESTION_LEAD.test(text.trim());
    if (isQuery) return { mode: "not_present", evidence: null };
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
  // matching every other contextual normalizer function in this file. A null result
  // (inconclusive) means this deterministic layer has no basis to decide either way - the
  // candidate's own already-evidence-validated value (and its evidence) is left exactly as
  // sanitizeSemanticEvidence produced it, never forced to "not_present". Every other outcome
  // (explicit, conflicting, explicit_negative) overrides the candidate and carries its own
  // evidence in lockstep with the statement, so a stale evidence.purchase_mode_statement from a
  // just-neutralized provider proposal never survives, and a statement synthesized here always
  // carries real, validator-satisfying evidence.
  if (input?.current_message) {
    const declaration = detectPurchaseModeDeclaration(input);
    if (declaration) {
      normalized.purchase_mode_statement = declaration.mode;
      normalized.evidence.purchase_mode_statement = declaration.evidence;
      if (declaration.mode === "conflicting" && !normalized.needs_clarification.some(item => item.code === "conflicting_purchase_mode"))
        normalized.needs_clarification.push({ code: "conflicting_purchase_mode", evidence: declaration.evidence });
    }
  }
  normalized.vehicle_mentions.forEach(normalizeVehicle);
  normalizeContextualSemantics(normalized, input);
  normalizeAlternatives(normalized, input);
  for (const amount of normalized.amount_mentions) {
    const conflictingKind = normalizeAmountKind(amount);
    normalizeArgentineAmount(amount);
    if (conflictingKind) amount.certainty = "ambiguous";
    // Pre-canary blocker (real Candidate 3 incident, lead 8abcbc5e): conversation history is
    // CONTEXT, not permission to mint a new material fact. Real bug: T1 customer said
    // "Entregando el usado mas 10.000.000 cuanto seria la cuotas" (correctly resolved as
    // down_payment_capacity=10000000, current-turn evidence). T2 customer said only "Si" - the
    // provider nonetheless re-emitted the SAME literal/value under a DIFFERENT kind
    // (monthly_installment_capacity), with evidence sourced ENTIRELY from T1's message id, none
    // from T2. sanitizeSemanticEvidence's validateEvidence() only checks that a message with
    // that id exists somewhere in [current_message, ...recent_conversation] and that the
    // literal appears in it - it has no concept of "this turn" vs "any prior turn", so the
    // resurrected claim passed validation and created a capacity the customer never stated on
    // "Si". A capacity/down-payment mention is only ever material here in the two kinds that
    // reach next_state (AMBIGUOUS_CAPACITY_KINDS): every legitimate contextual resolution
    // already elsewhere in this file (trade-in short answers, purchase-mode short answers, the
    // pre-existing "$10 millones" contextual down-payment test) always includes the CURRENT
    // message in its evidence array alongside any prior one - this only enforces that same
    // existing convention for amounts, it does not forbid prior-turn context from being cited
    // too. If a material capacity amount cites no evidence at all from the current turn, it is
    // downgraded the same way an unsupported-scale claim is (ambiguous/null below) - never
    // dropped from state (a previously-persisted value is untouched; only this turn's own
    // proposal is rejected).
    if (AMBIGUOUS_CAPACITY_KINDS.has(amount.kind) && amount.certainty !== "ambiguous" && !hasCurrentTurnEvidence(amount, input)) {
      amount.certainty = "ambiguous";
    }
    if (AMBIGUOUS_CAPACITY_KINDS.has(amount.kind) && amount.certainty !== "ambiguous" && amount.numeric_value !== null && amount.numeric_value !== 0
      && !hasSelfEvidentScale(fold(amount.literal ?? ""))) {
      flagAmbiguousCapacityScale(normalized, amount);
    }
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
