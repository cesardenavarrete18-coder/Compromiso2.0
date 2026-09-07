export function decideHandoff({ humanOwned = false, doNotContact = false, noncommercial = false, explicitHumanRequest = false, strongAction = false, profileComplete = false, contactTiming = "unknown" } = {}) {
  if (humanOwned) return Object.freeze({ handoff_status: "human_owned", next_action: "no_ai_response", qualification_status: profileComplete ? "qualified" : "follow_up", contact_priority: "hot", stop_questions: true });
  if (doNotContact || noncommercial) return Object.freeze({ handoff_status: "closed_or_routed", next_action: "close_or_route_noncommercial", qualification_status: "unqualified", contact_priority: "cold", stop_questions: true });
  if (explicitHumanRequest || strongAction) return Object.freeze({ handoff_status: "immediate", next_action: "handoff", qualification_status: profileComplete ? "qualified" : "follow_up", contact_priority: "hot", stop_questions: true });
  if (profileComplete) return Object.freeze({ handoff_status: "ready", next_action: contactTiming === "unknown" ? "complete_filter" : "handoff", qualification_status: "qualified", contact_priority: contactTiming === "unknown" ? "cold" : null, stop_questions: contactTiming === "unknown" });
  return Object.freeze({ handoff_status: "not_ready", next_action: "ask_next_missing_component", qualification_status: "follow_up", contact_priority: null, stop_questions: false });
}
