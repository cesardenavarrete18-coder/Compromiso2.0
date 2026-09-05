export function buildFilterInput({ lead, messages = [], attribution = null, catalog = [], campaigns = [], modelVersions = [], bankOffers = [], conversationControl = null, previousRun = null, inboundMessage, now }) {
  const visible = messages.filter(item => new Date(item.created_at).getTime() <= new Date(inboundMessage.created_at).getTime()).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const prior = visible.filter(item => item.id !== inboundMessage.id).slice(-12);
  return { lead, attribution, catalog, campaigns, model_versions: modelVersions, bank_offers: bankOffers, conversation_control: conversationControl, previous_filter_state: previousRun?.next_state ?? null, current_message: { id: inboundMessage.id, text: inboundMessage.body }, recent_conversation: prior.reverse().map(item => ({ id: item.id, role: item.direction === "outbound" ? "assistant" : "customer", text: item.body })), event_at: inboundMessage.created_at, now };
}

export function selectPreviousShadowRun(runs, leadId, inboundCreatedAt) {
  return runs.filter(run => run.lead_id === leadId && run.status === "completed" && new Date(run.created_at) < new Date(inboundCreatedAt)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] ?? null;
}
