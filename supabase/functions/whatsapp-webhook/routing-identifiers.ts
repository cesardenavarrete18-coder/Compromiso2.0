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

export function mentionsTikTok(text: string) {
  return /\btik\s*tok\b/i.test(String(text || ""));
}

export function knownAdvisorName(text: string, advisorNames: string[]) {
  const source = ` ${normalizedPersonName(text)} `;
  const matches = advisorNames.filter((name) => {
    const normalized = normalizedPersonName(name);
    return normalized.length >= 5 && source.includes(` ${normalized} `);
  });
  return matches.length === 1 ? matches[0] : "";
}
