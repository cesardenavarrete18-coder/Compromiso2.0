const fold = value => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const epistemic = /\b(no se|no recuerdo|no conozco|no estoy segur[oa]|ni idea)\b/;
const attribute = /\b(version|ano|kilometros|km|motor|patente|detalle(?:s)?(?: del vehiculo)?)\b/;
const parentNegative = /\b(no tengo (?:un )?(?:usado|auto|vehiculo)|no (?:lo |la )?voy a entregar|no entrego (?:el |mi )?(?:auto|usado|vehiculo))\b/;

export function applyNegationScopeFirewall(normalized, { currentMessage = "", previousState = null } = {}) {
  const extraction = structuredClone(normalized ?? {});
  const text = fold(currentMessage);
  const result = { applied: false, neutralized: [], evidence: [] };
  if (parentNegative.test(text)) return { extraction, result };
  if (!(epistemic.test(text) && attribute.test(text)) || extraction.trade_in_intent !== "no") return { extraction, result };
  extraction.trade_in_intent = "not_present";
  if (extraction.evidence) extraction.evidence.trade_in_intent = null;
  result.applied = true;
  result.neutralized.push("trade_in_intent=no");
  result.evidence.push("epistemic_attribute_negation");
  // Preserve a parent only when it was already evidenced; never synthesize one.
  if (previousState?.has_trade_in?.status === "known" && previousState.has_trade_in.value === "yes") {
    extraction.trade_in_intent = "yes";
    result.evidence.push("previous_shadow_state");
  }
  return { extraction, result };
}
