// Family T: a lead can be worth a human seller's time ("commercially actionable")
// without every formal filter component being resolved (profileComplete). This is a
// separate dimension from BOTH profileComplete and qualification_status - see
// handoff-policy.mjs. It must never be confused with "the customer merely showed
// interest" (River Plate axiom: interest != qualification), so every fact consulted
// here must be something the CUSTOMER explicitly declared in their own words, never a
// fact whose only origin is the acquisition channel (meta_referral / campaign context /
// crm_structured / canonical_state) or a pure query with nothing resolved. target_model
// (which CAN legitimately carry meta_referral/crm_structured/canonical_state provenance)
// is therefore never consulted here at all - by construction, an ad-derived model can
// never by itself produce actionability, regardless of how confident the referral is.
//
// Conservative v1 definition (deliberately narrow - widen only with real Shadow
// evidence, per the Qualification Policy Calibration precedent): actionable when the
// customer has both identified a concrete used vehicle to trade in AND declared a
// capacity figure, OR has declared financed as the purchase_mode AND a capacity figure,
// OR asked for a human directly (those two signals already drove immediate handoff
// before Family T and are unconditionally sufficient here too).
const isCustomerDeclared = fieldValue => fieldValue?.status === "known" && fieldValue.provenance?.source === "customer_message";

export function commerciallyActionable(state, { explicitHumanRequest = false, strongAction = false } = {}) {
  if (explicitHumanRequest || strongAction) return true;

  const capacityDeclared = isCustomerDeclared(state.monthly_installment_capacity) || isCustomerDeclared(state.down_payment_amount);

  const tradeInIdentified = isCustomerDeclared(state.has_trade_in) && state.has_trade_in.value === "yes"
    && isCustomerDeclared(state.trade_in_vehicle?.brand) && isCustomerDeclared(state.trade_in_vehicle?.model);
  if (tradeInIdentified && capacityDeclared) return true;

  const financedWithCapacity = isCustomerDeclared(state.purchase_mode) && state.purchase_mode.value === "financed" && capacityDeclared;
  if (financedWithCapacity) return true;

  return false;
}
