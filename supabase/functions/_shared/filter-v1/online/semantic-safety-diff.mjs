const CATEGORICAL_PATHS = new Set([
  "query_intent", "purchase_mode_statement", "amount_mentions.kind",
  "vehicle_mentions.role", "vehicle_mentions.roles", "vehicle_mentions.contains",
  "trade_in_intent", "requested_action.type",
]);

const DECISION_SENSITIVE = [
  /^query_intent$/,
  /^purchase_mode_statement$/,
  /^amount_mentions\.(kind|numeric_value)$/,
  /^vehicle_mentions\.(role|roles|model_text|models|contains)$/,
  /^trade_in_intent$/,
  /^trade_in_vehicle\.(brand|model|version|year|mileage_km)(\.|$)/,
  /^requested_action\.type$/,
  /^(human_request|strong_action|do_not_contact)$/,
  /^customer_corrections\.(field|to_literal)$/,
];

export const isDecisionSensitivePath = path => DECISION_SENSITIVE.some(pattern => pattern.test(path));

function typeFor(check) {
  if (!check.actual.length || check.actual.every(value => value == null)) return "OMISSION";
  if (check.expected == null || check.expected === false || (Array.isArray(check.expected) && check.expected.length === 0)) return "WRONG_POSITIVE";
  if (CATEGORICAL_PATHS.has(check.path)) return "WRONG_CLASSIFICATION";
  return "WRONG_VALUE";
}

const detail = (check, stage) => Object.freeze({
  stage,
  type: typeFor(check),
  path: check.path,
  expected: check.expected,
  actual: check.actual,
  decision_sensitive: isDecisionSensitivePath(check.path),
});

export function classifySemanticChecks(checks, stage) {
  return checks.filter(check => !check.pass).map(check => detail(check, stage));
}

// Negative expectations that are implicit in the sparse FVS expected objects.
export function implicitPositiveDifferences(expected, actual, stage) {
  if (!actual) return [];
  const differences = [];
  const add = (path, expectedValue, actualValue, code) => differences.push(Object.freeze({ stage, type: "WRONG_POSITIVE", path, expected: expectedValue, actual: [actualValue], decision_sensitive: true, code }));
  if (expected.purchase_mode_statement === "not_present" && actual.purchase_mode_statement !== "not_present") add("purchase_mode_statement", "not_present", actual.purchase_mode_statement, "UNSUPPORTED_PURCHASE_MODE");
  if (expected.trade_in_intent === "not_present" && actual.trade_in_intent === "yes") add("trade_in_intent", "not_present", actual.trade_in_intent, "OWNED_AS_TRADE_IN");
  if (expected.requested_action === null && actual.requested_action) add("requested_action.type", null, actual.requested_action.type, "ACTION_TIMING_AS_ACTION");
  for (const signal of ["human_request", "strong_action", "do_not_contact"])
    if (expected[signal] !== true && actual[signal] !== null) add(signal, null, actual[signal], `UNSUPPORTED_${signal.toUpperCase()}`);
  return differences;
}

export function falseInferenceDetails(differences, { unsafe = false } = {}) {
  const seen = new Set();
  return differences.filter(item => {
    const key = `${item.path}:${item.type}`;
    if (item.type === "OMISSION" || (unsafe && !item.decision_sensitive) || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function neutralizedDetails(rawFalse, unsafeFalse) {
  const surviving = new Set(unsafeFalse.map(item => `${item.path}:${item.type}`));
  return rawFalse.filter(item => !surviving.has(`${item.path}:${item.type}`)).map(item => Object.freeze({ ...item, neutralized: true }));
}
