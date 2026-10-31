/**
 * Gulf time helpers. Gulf zones have no daylight saving, so a zone's offset is constant and
 * "next 08:00 local" is simple arithmetic.
 */
export const COUNTRY_TZ: Record<string, string> = {
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  QA: "Asia/Qatar",
  KW: "Asia/Kuwait",
  BH: "Asia/Bahrain",
  OM: "Asia/Muscat",
};
export const GST = "Asia/Dubai";

/** Work week: UAE Mon–Fri; KSA and the rest of the GCC Sun–Thu. 0 = Sunday. */
export function workdaysFor(timezone: string): number[] {
  return timezone === "Asia/Dubai" ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4];
}

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function localParts(date: Date, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

/** Minutes the zone is ahead of UTC (e.g. +240 for Dubai). */
export function offsetMinutes(timezone: string, at = new Date()): number {
  const p = localParts(at, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

export function localDateKey(date: Date, timezone: string): string {
  const p = localParts(date, timezone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The next moment that is hh:mm local time, strictly after `from`. */
export function nextLocalTime(from: Date, timezone: string, hour: number, minute = 0): Date {
  const p = localParts(from, timezone);
  const off = offsetMinutes(timezone, from);
  let t = Date.UTC(p.year, p.month - 1, p.day, hour, minute) - off * 60_000;
  if (t <= from.getTime()) t += 86_400_000;
  return new Date(t);
}

/** Start of the local day containing `date`, as a UTC Date. */
export function startOfLocalDay(date: Date, timezone: string): Date {
  const p = localParts(date, timezone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - offsetMinutes(timezone, date) * 60_000);
}

export function isWorkday(date: Date, timezone: string): boolean {
  return workdaysFor(timezone).includes(localParts(date, timezone).weekday);
}

/** True when `date` is the first workday of its local week (Mon in UAE, Sun in KSA). */
export function isFirstWorkdayOfWeek(date: Date, timezone: string): boolean {
  return localParts(date, timezone).weekday === workdaysFor(timezone)[0];
}
