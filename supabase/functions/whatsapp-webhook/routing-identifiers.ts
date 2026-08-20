export function candidateCodes(text: string) {
  return Array.from(new Set(text.toUpperCase().match(/\b[A-Z]{2,}[A-Z0-9_-]*\d[A-Z0-9_-]*\b/g) || []));
}

export function candidateAdvisorName(text: string) {
  const match = text.match(/\b(?:asesor(?:a)?|vendedor(?:a)?)\s*[:\-]\s*([^\n,;]{3,120})/i);
  return match?.[1]?.trim().replace(/\s+/g, " ").slice(0, 120) || "";
}

export function normalizedPersonName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}
