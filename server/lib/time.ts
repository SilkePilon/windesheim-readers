// Europe/Amsterdam calendar helpers (pure: no DB).

const TZ = "Europe/Amsterdam";

export function dayKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function hourInTz(d = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(d));
}

export function previousDay(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Whole days from day key `a` to day key `b` (b later → positive). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
}

/** 0 = Sunday … 6 = Saturday, for a day key. */
export function weekday(key: string) {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

function tzOffsetMs(d: Date) {
  return (
    new Date(d.toLocaleString("en-US", { timeZone: TZ })).getTime() -
    new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime()
  );
}

/** Midnight (Amsterdam) of the current day. */
export function startOfDay(d = new Date()) {
  return new Date(new Date(`${dayKey(d)}T00:00:00Z`).getTime() - tzOffsetMs(d));
}

/** Monday 00:00 (Amsterdam) of the current week. */
export function startOfWeek(d = new Date()) {
  const local = new Date(`${dayKey(d)}T00:00:00Z`);
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return new Date(local.getTime() - tzOffsetMs(d));
}

/** Monday 00:00 (Amsterdam) of the week before the one `d` is in. */
export function startOfPreviousWeek(d = new Date()) {
  return startOfWeek(new Date(startOfWeek(d).getTime() - 12 * 3600e3));
}
