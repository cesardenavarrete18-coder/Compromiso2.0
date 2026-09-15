export function decideHandoff({ humanOwned = false, doNotContact = false, noncommercial = false, explicitHumanRequest = false, strongAction = false, profileComplete = false, commerciallyActionable = false, contactTiming = "unknown" } = {}) {
  if (humanOwned) return Object.freeze({ handoff_status: "human_owned", next_action: "no_ai_response", qualification_status: profileComplete ? "qualified" : "follow_up", contact_priority: "hot", stop_questions: true });
  if (doNotContact || noncommercial) return Object.freeze({ handoff_status: "closed_or_routed", next_action: "close_or_route_noncommercial", qualification_status: "unqualified", contact_priority: "cold", stop_questions: true });
  if (explicitHumanRequest || strongAction) return Object.freeze({ handoff_status: "immediate", next_action: "handoff", qualification_status: profileComplete ? "qualified" : "follow_up", contact_priority: "hot", stop_questions: true });
  if (profileComplete) return Object.freeze({ handoff_status: "ready", next_action: contactTiming === "unknown" ? "complete_filter" : "handoff", qualification_status: "qualified", contact_priority: contactTiming === "unknown" ? "cold" : null, stop_questions: contactTiming === "unknown" });
  // Family T: a lead can be worth a human seller's time before every formal filter
  // component resolves - see commercial-actionability.mjs. This is deliberately NOT
  // "qualified" (interest + partial disclosure is not a confirmed purchase decision -
  // the qualification-semantics axiom from the P0 diagnostic still holds), only that
  // there is enough real, customer-declared signal to stop asking and hand off.
  // contact_priority is deliberately left null (not asserted here): it already has
  // its own, independent temporal-urgency semantics owned by contactPriority()
  // (now/same_day/next_business_day/unknown/future -> hot/warm/cold), computed by
  // the engine before decideHandoff runs and only overwritten when this object's
  // contact_priority is truthy - commercial actionability must never redefine
  // urgency on its own.
  if (commerciallyActionable) return Object.freeze({ handoff_status: "ready", next_action: "handoff", qualification_status: "follow_up", contact_priority: null, stop_questions: true });
  return Object.freeze({ handoff_status: "not_ready", next_action: "ask_next_missing_component", qualification_status: "follow_up", contact_priority: null, stop_questions: false });
}
