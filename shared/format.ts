const UNITS = {
  nl: { min: "min", hour: "uur", day: "dag", days: "dagen", month: "mnd", year: "jr" },
  en: { min: "min", hour: "h", day: "day", days: "days", month: "mo", year: "yr" },
} as const;

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Compact human interval, e.g. "8 min", "2 dagen", "1,5 mnd". Months = 30 days, years = 365 days. */
export function formatInterval(ms: number, locale: "nl" | "en"): string {
  const u = UNITS[locale];
  const dec = (n: number) => {
    const s = (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return locale === "nl" ? s.replace(".", ",") : s;
  };
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} ${u.hour}`;
  if (ms < 30 * DAY) {
    const d = Math.round(ms / DAY);
    return `${d} ${d === 1 ? u.day : u.days}`;
  }
  if (ms < 365 * DAY) return `${dec(ms / (30 * DAY))} ${u.month}`;
  return `${dec(ms / (365 * DAY))} ${u.year}`;
}
