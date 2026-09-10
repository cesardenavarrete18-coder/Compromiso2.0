const fold = value => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const epistemic = /\b(no se|no recuerdo|no conozco|no estoy segur[oa]|ni idea)\b/;
const attribute = /\b(version|ano|kilometros|km|motor|patente|detalle(?:s)?(?: del vehiculo)?)\b/;
// Family Q2: parent-level trade-in rejection must be scoped to the current customer turn.
// Besides canonical phrases ("no entrego el auto"), real traffic also uses elliptical
// corrections such as "solo el efectivo, el auto no". Keep this deliberately narrower
// than a generic `no`, so price/financing disagreement cannot clear a valid trade-in.
const parentNegative = /\b(?:no tengo (?:un )?(?:usado|auto|vehiculo|camioneta)|no (?:lo |la )?voy a entregar|no entrego (?:el |mi )?(?:auto|usado|vehiculo|camioneta)|(?:el|mi) (?:auto|usado|vehiculo|camioneta) no\b|sin (?:entregar )?(?:usado|auto|vehiculo|camioneta)|me (?:lo|la) quedo|me quedo con (?:el|mi) (?:auto|usado|vehiculo|camioneta))\b/;

export function applyNegationScopeFirewall(normalized, { currentMessage = "", previousState = null } = {}) {
  const extraction = structuredClone(normalized ?? {});
  const text = fold(currentMessage);
  const result = { applied: false, neutralized: [], evidence: [] };

  // Explicit current-turn rejection outranks stale/history-derived trade-in intent. The
  // semantic normalizer/adapter will then materialize has_trade_in=no for the engine, whose
  // profile gate stops all trade_in_* follow-up questions.
  if (parentNegative.test(text)) {
    if (extraction.trade_in_intent !== "no") {
      extraction.trade_in_intent = "no";
      result.applied = true;
      result.neutralized.push("stale_trade_in_intent");
      result.evidence.push("explicit_parent_trade_in_rejection");
    }
    return { extraction, result };
  }

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
