export function reminderText(modelInterest: string) {
  const model = String(modelInterest || "").trim();
  return model
    ? `Te escribo por tu consulta sobre ${model}. Si todavía te interesa, decime qué información necesitás y te ayudo por acá.`
    : "Te escribo por tu consulta del 0 km. Si todavía te interesa, decime qué información necesitás y te ayudo por acá.";
}
