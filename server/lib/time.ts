// Europe/Amsterdam calendar helpers (pure: no DB).

const TZ = "Europe/Amsterdam";

// Intl formatters are expensive to construct: build each once.
const DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const HOUR_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });
const PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23",
});

export function dayKey(d = new Date()) {
  return DAY_FMT.format(d);
}

export function hourInTz(d = new Date()) {
  return Number(HOUR_FMT.format(d));
}

/** Day key of the Monday of the week that contains day key `key`. */
export function weekKey(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
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
  const p: Record<string, number> = {};
  for (const x of PARTS_FMT.formatToParts(d)) if (x.type !== "literal") p[x.type] = Number(x.value);
  const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return local - Math.floor(d.getTime() / 1000) * 1000;
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
