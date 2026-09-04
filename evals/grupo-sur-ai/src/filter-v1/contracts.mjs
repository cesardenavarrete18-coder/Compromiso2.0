export const FIELD_STATUSES = Object.freeze(["known", "missing", "explicitly_unknown", "conflicting"]);
export const PURCHASE_MODES = Object.freeze(["cash", "financed", "unknown"]);
export const QUERY_INTENTS = Object.freeze([
  "model_value", "installment_offer", "delivery_advance", "subscription_amount",
  "ambiguous_initial_amount", "technical_question", "purchase_mode_statement",
  "human_request", "strong_action", "filter_answer", "unknown",
]);

export function field(value = null, status = "missing", provenance = null) {
  if (!FIELD_STATUSES.includes(status)) throw new TypeError(`INVALID_FIELD_STATUS:${status}`);
  if (status === "known" && (value === null || value === undefined)) throw new TypeError("KNOWN_FIELD_REQUIRES_VALUE");
  if (status === "known" && !provenance) throw new TypeError("KNOWN_FIELD_REQUIRES_PROVENANCE");
  return Object.freeze({ value, status, provenance });
}

export const missingField = () => field();

export function createFilterState({ targetModel = null, targetProvenance = null } = {}) {
  return {
    target_model: targetModel === null ? missingField() : field(targetModel, "known", targetProvenance),
    purchase_mode: field("unknown", "missing"),
    down_payment_amount: missingField(),
    monthly_installment_capacity: missingField(),
    has_trade_in: field("unknown", "missing"),
    trade_in_vehicle: Object.fromEntries(["brand", "model", "variant", "year", "km"].map(key => [key, missingField()])),
    contact_preference: { timing: "unknown", literal: null, callback_at: null, callback_window: null, asked_once: false },
    requested_action: null,
  };
}

const resolved = candidate => ["known", "explicitly_unknown"].includes(candidate.status);

export function deriveCommercialProfile(state) {
  const components = { model: state.target_model, purchase_mode: state.purchase_mode, has_trade_in: state.has_trade_in };
  if (state.purchase_mode.value === "financed") {
    components.down_payment_amount = state.down_payment_amount;
    components.monthly_installment_capacity = state.monthly_installment_capacity;
  }
  if (state.has_trade_in.value === "yes") Object.assign(components, Object.fromEntries(Object.entries(state.trade_in_vehicle).map(([key, value]) => [`trade_in_${key}`, value])));
  const values = Object.values(components);
  const known_count = values.filter(value => value.status === "known").length;
  const explicitly_unknown_count = values.filter(value => value.status === "explicitly_unknown").length;
  return Object.freeze({
    components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, value.status])),
    component_score: values.length ? (known_count + explicitly_unknown_count) / values.length : 0,
    known_count,
    explicitly_unknown_count,
    complete: values.every(resolved),
  });
}

export function registerOwnedVehicle(state, vehicle) {
  return { ...state, owned_vehicles: [...(state.owned_vehicles ?? []), { ...vehicle, role: "owned_only" }] };
}
