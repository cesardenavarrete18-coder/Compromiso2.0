function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function firstName(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned || /^\+?\d+$/.test(cleaned)) return "";
  return cleaned.split(" ")[0].slice(0, 40);
}

export function polishCommercialReply(reply: string, customerName: string, isFirstReply: boolean) {
  let value = String(reply || "").trim().replace(/\s+/g, " ");
  if (!value || isFirstReply) return value;

  const fullName = String(customerName || "").trim().replace(/\s+/g, " ");
  const nameParts = fullName.split(" ").filter(Boolean);
  const alternatives = nameParts.map((_, index) => nameParts.slice(0, nameParts.length - index).join(" "))
    .filter(Boolean).sort((left, right) => right.length - left.length).map(escaped);
  if (!alternatives.length) return value;

  const names = alternatives.join("|");
  value = value
    .replace(new RegExp(`^(?:¡?hola|buen(?:os días|as tardes|as noches))[,! ]+(?:${names})[,!:; ]*`, "i"), "")
    .replace(new RegExp(`^(?:perfecto|genial|buenísimo|buenisimo),\\s*(?:${names})[,!:;. ]*`, "i"), "")
    .replace(new RegExp(`^(?:${names})[,!:; ]+`, "i"), "")
    .trim();
  return value ? value.charAt(0).toLocaleUpperCase("es-AR") + value.slice(1) : value;
}

export function handoffReply(modelInterest: string) {
  const model = String(modelInterest || "").trim();
  return `Con lo que me contaste ya tengo una buena base${model ? ` sobre ${model}` : ""}. Voy a derivar tu consulta a un asesor para que te pase la información concreta y continúe con vos por acá.`;
}

export function shouldForceHandoff(priorAssistantReplies: number, qualificationStatus: string) {
  return priorAssistantReplies >= 4 && qualificationStatus !== "unqualified";
}

export function hasKnownCommercialOperation(conversation: string) {
  return /\b(contado|financiaci[oó]n|financiar|financiado|plan(?:\s+de\s+ahorro)?|anticipo|entrego?\s+(?:un\s+)?usado|tengo\s+(?:un\s+)?usado|cr[eé]dito)\b/i.test(String(conversation || ""));
}

export function qualifyAndHandoffReply(reply: string, modelInterest: string) {
  const value = String(reply || "").trim();
  const invertedQuestionStart = value.indexOf("¿");
  const questionEnd = value.indexOf("?");
  const previousSentenceEnd = questionEnd >= 0
    ? Math.max(value.lastIndexOf(".", questionEnd), value.lastIndexOf("!", questionEnd))
    : -1;
  const questionStart = invertedQuestionStart >= 0
    ? invertedQuestionStart
    : questionEnd >= 0 ? previousSentenceEnd + 1 : -1;
  let informativePart = (questionStart >= 0 ? value.slice(0, questionStart) : value).trim();
  informativePart = informativePart
    .replace(/\b(?:para avanzar|para orientarte|para ayudarte)(?:\s+con[^.!?]*)?[,;:]?\s*$/i, "")
    .replace(/[,:;\s]+$/, "")
    .trim();
  const handoff = handoffReply(modelInterest);
  if (!informativePart || /\basesor(?:a)?\b/i.test(informativePart)) return informativePart || handoff;
  return `${informativePart} ${handoff}`;
}

export function enforceVehicleFacts(reply: string, modelInterest: string) {
  let value = String(reply || "").trim();
  if (/\btera\b/i.test(String(modelInterest || ""))) {
    value = value.replace(/\b(?:un|una)?\s*(?:muy\s+buena?|excelente)?\s*pick[\s-]?up\b/gi, "un SUV compacto");
  }
  return value.replace(/\s+/g, " ").trim();
}

export function tiktokIdentifierReply(customerName: string, isFirstReply: boolean, modelInterest = "") {
  const greeting = isFirstReply ? `¡Hola${firstName(customerName) ? ` ${firstName(customerName)}` : ""}! ` : "";
  const model = String(modelInterest || "").trim();
  const context = /\btera\b/i.test(model)
    ? "La Volkswagen Tera es un SUV compacto"
    : model ? `Tengo registrada tu consulta por ${model}` : "Gracias por escribirnos desde TikTok";
  return `${greeting}${context}. Para asignarte al asesor del vivo, pasame su código de vendedor o escribí “Asesor: nombre y apellido”.`;
}
