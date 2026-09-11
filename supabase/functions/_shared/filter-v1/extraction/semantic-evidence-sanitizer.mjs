import { emptySemanticExtraction } from "./semantic-extraction-contract.mjs";
import { validateEvidence } from "./semantic-extraction-validator.mjs";

const present = value => value !== null && value !== undefined && value !== false && (!Array.isArray(value) || value.length > 0);
const fold = value => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
// Family Q3: mileage_km is the only numeric field in trade_in_vehicle, and the provider has
// been observed routing a monetary figure there ("valor 13.000.000") with no unit signal at
// all. It is not enough to check that a km-shaped token exists SOMEWHERE in the evidence
// (2nd audit round): when the evidence literal is the whole customer message - "Peugeot 408
// 2013, 130.000 km, valor 13.000.000" - that message legitimately contains "km" even when
// the value the provider proposes for mileage_km is actually the monetary figure. The guard
// must instead confirm the claimed numeric value is the SAME number textually bound to a km
// marker (immediately before "km"/"k.m", or right after "kilometraje" with only a short
// connector word like "real(es)"), not merely that a km token is present anywhere.
const parseArgentineInteger = raw => {
  const digits = String(raw).replace(/[.,]/g, "");
  return digits.length ? Number(digits) : null;
};
const KM_NUMBER_BEFORE = /(\d[\d.,]*)\s*(?:k\.?ms?\.?|kilometr\w*)\b/g;
const KM_NUMBER_AFTER = /\b(?:k\.?ms?\.?|kilometr\w*)\b(?:\s+(?:real(?:es)?|aprox(?:imad[oa]s?)?|actual(?:es)?|recorrid[oa]s?))?\s+(\d[\d.,]*)/g;
function kmBoundNumbers(text) {
  const numbers = [];
  for (const pattern of [KM_NUMBER_BEFORE, KM_NUMBER_AFTER]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const parsed = parseArgentineInteger(match[1]);
      if (parsed !== null) numbers.push(parsed);
    }
  }
  return numbers;
}
const signalGuards = {
  human_request: text => /\b(hablar|habla|pasame|pasar?me|necesito hablar|comunicarme)\b[^.?!]*(asesor|vendedor|persona|alguien)(\b|$)/.test(text) || /\b(llam(?:e|en|arme)|contact(?:e|en|arme))\b[^.?!]*(asesor|vendedor|persona|alguien)\b|\b(asesor|vendedor|persona|alguien)\b[^.?!]*\b(llam(?:e|en|arme)|contact(?:e|en|arme))\b/.test(text),
  strong_action: text => /\b(ir a verl[oa]|voy a ir|transferir|transfiero|senarl[oa]|senar|depositar|enviar? los papeles|papeles listos|quiero avanzar)\b/.test(text),
  do_not_contact: text => /\b(no me (escriban|contacten|llamen)(?: mas)?|no quiero (?:que me (?:llamen|escriban|contacten)|recibir mensajes)|dej(?:en|a) de (?:llamarme|escribirme|contactarme)|borrenme|borrame)\b/.test(text),
};

/** Removes only unsupported fields and enriches accepted evidence with deterministic offsets. */
export function sanitizeSemanticEvidence(candidate, input) {
  const extraction = structuredClone(candidate);
  const messages = [input.current_message, ...(input.recent_conversation ?? [])].filter(Boolean);
  const warnings = [];
  const valid = (evidence, path) => {
    if (!validateEvidence(evidence, messages)) { warnings.push({ code: "INVALID_OR_MISSING_EVIDENCE", field: path }); return false; }
    const list = Array.isArray(evidence) ? evidence : [evidence];
    for (const item of list) {
      const message = messages.find(value => value.id === item.source_message_id);
      item.start = message.text.indexOf(item.literal);
      item.end = item.start + item.literal.length;
    }
    return true;
  };
  for (const key of ["amount_mentions", "vehicle_mentions", "customer_corrections", "needs_clarification"])
    extraction[key] = extraction[key].filter((item, index) => !present(item) || valid(item.evidence, `${key}.${index}`));
  for (const key of ["requested_action", "contact_preference_expression", "customer_name", "customer_location"])
    if (present(extraction[key]) && !valid(extraction[key].evidence, key)) extraction[key] = null;
  for (const [key, item] of Object.entries(extraction.trade_in_vehicle ?? {})) {
    if (!present(item)) continue;
    if (!valid(item.evidence, `trade_in_vehicle.${key}`)) { delete extraction.trade_in_vehicle[key]; continue; }
    if (key === "mileage_km" && item.status === "known") {
      const evidenceList = Array.isArray(item.evidence) ? item.evidence : [item.evidence];
      const evidenceText = fold(evidenceList.map(entry => entry.literal).join(" "));
      const boundToClaimedValue = kmBoundNumbers(evidenceText).includes(Number(item.value));
      if (!boundToClaimedValue) {
        delete extraction.trade_in_vehicle[key];
        warnings.push({ code: "MILEAGE_WITHOUT_KM_EVIDENCE", field: `trade_in_vehicle.${key}` });
      }
    }
  }
  const defaults = emptySemanticExtraction();
  const scalarSignals = {
    query_intent: extraction.query_intent !== "none",
    purchase_mode_statement: extraction.purchase_mode_statement !== "not_present",
    trade_in_intent: extraction.trade_in_intent !== "not_present",
  };
  for (const [key, material] of Object.entries(scalarSignals)) {
    if (material && !valid(extraction.evidence?.[key], key)) {
      extraction[key] = defaults[key];
      if (extraction.evidence) extraction.evidence[key] = null;
    }
  }
  for (const key of Object.keys(signalGuards)) {
    const signal = extraction[key];
    if (signal === null) continue;
    if (!valid(signal?.evidence, key)) { extraction[key] = null; continue; }
    const evidence = Array.isArray(signal.evidence) ? signal.evidence : [signal.evidence];
    if (!signalGuards[key](fold(evidence.map(item => item.literal).join(" ")))) {
      extraction[key] = null;
      warnings.push({ code: "SEMANTIC_SIGNAL_GUARD_REJECTED", field: key });
    }
  }
  return { extraction, warnings };
}
