const dateKey = (date, timeZone) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const weekday = (date, timeZone) => Number(new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date).replace(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/, value => ({ Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }[value])));

function addCalendarDay(date) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + 1); return next; }

export function nextBusinessDate(eventAt, { timeZone = "America/Argentina/Buenos_Aires", operatingWeekdays = [1, 2, 3, 4, 5, 6], closedDates = [] } = {}) {
  let cursor = new Date(eventAt);
  for (let count = 0; count < 14; count += 1) {
    cursor = addCalendarDay(cursor);
    if (operatingWeekdays.includes(weekday(cursor, timeZone)) && !closedDates.includes(dateKey(cursor, timeZone))) return dateKey(cursor, timeZone);
  }
  throw new RangeError("NO_BUSINESS_DAY_IN_CALENDAR_WINDOW");
}

export function contactPriority({ timing = "unknown", eventAt, callbackAt = null, calendar = {} }) {
  if (timing === "now") return "hot";
  if (timing === "unknown") return "cold";
  if (["same_day", "next_business_day"].includes(timing) && !callbackAt) return "warm";
  if (!eventAt || !callbackAt) return "cold";
  const timeZone = calendar.timeZone ?? "America/Argentina/Buenos_Aires";
  const callbackDate = dateKey(new Date(callbackAt), timeZone);
  const eventDate = dateKey(new Date(eventAt), timeZone);
  return callbackDate === eventDate || callbackDate === nextBusinessDate(eventAt, calendar) ? "warm" : "cold";
}
