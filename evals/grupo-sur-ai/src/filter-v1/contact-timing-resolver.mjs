// Deterministic literal -> contact timing classification (Family L). The
// semantic extractor only captures the raw phrase (contact_preference_expression
// = { literal, certainty, evidence }); resolving WHEN that literal actually means
// is calendar arithmetic, not something an LLM should decide (FORBIDDEN_EFFECT_FIELDS
// already excludes business-logic outputs from the extractor's own contract).
// This never fabricates a specific instant the literal did not give — when only a
// lower bound or a day is known, that goes into callback_window, and callback_at
// stays null.
import { dateKey, nextBusinessDate } from "./contact-priority.mjs";

const fold = value => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const HOUR_LOWER_BOUND = /despues de las?\s*(\d{1,2})/;

export function resolveContactTiming({ literal, eventAt, calendar = {} } = {}) {
  const text = fold(literal);
  const hourMatch = text.match(HOUR_LOWER_BOUND);

  if (/\b(ahora|ya|en este momento)\b/.test(text)) {
    return Object.freeze({ timing: "now", callback_at: null, callback_window: null });
  }
  if (/semana (?:que viene|proxima)|proxima semana/.test(text)) {
    return Object.freeze({ timing: "future", callback_at: null, callback_window: null });
  }
  if (/\bpasado manana\b/.test(text)) {
    // Two business days out is not "next" business day — record the day window
    // without claiming next_business_day's priority semantics for it.
    return Object.freeze({ timing: "future", callback_at: null, callback_window: null });
  }
  if (/\bmanana\b/.test(text)) {
    const date = eventAt ? nextBusinessDate(eventAt, calendar) : null;
    return Object.freeze({ timing: "next_business_day", callback_at: null, callback_window: date ? Object.freeze({ date, from_hour: hourMatch ? Number(hourMatch[1]) : null }) : null });
  }
  if (/\bhoy\b/.test(text)) {
    const timeZone = calendar.timeZone ?? "America/Argentina/Buenos_Aires";
    const date = eventAt ? dateKey(new Date(eventAt), timeZone) : null;
    return Object.freeze({ timing: "same_day", callback_at: null, callback_window: date && hourMatch ? Object.freeze({ date, from_hour: Number(hourMatch[1]) }) : null });
  }
  return Object.freeze({ timing: "unknown", callback_at: null, callback_window: null });
}
