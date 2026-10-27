// Pure badge rules (no DB): unit-tested in tests/badges.test.ts.
import type { BadgeId } from "../../shared/badges";
import { biomeForWeek, type BiomeId } from "../../shared/biomes";
import { DONE_MASTERY } from "../../shared/path";
import { daysBetween, previousDay, weekday } from "./time";

/** What just happened; each kind only evaluates the badges it can affect. */
export type BadgeEvent = "xp" | "card" | "quiz" | "explain" | "open" | "mastery" | "quest" | "battle" | "battle_host";

/** Badge events implied by an XP reason (the award path). */
export function eventsForReason(reason: string): BadgeEvent[] {
  switch (reason) {
    case "card":
      return ["card", "mastery"];
    case "quiz":
      return ["quiz", "mastery"];
    case "explain":
      return ["explain", "mastery"];
    case "summary":
      return ["mastery"];
    case "open":
      return ["open"];
    default:
      return [];
  }
}

/** A lesson counts towards the Meesterschap badges at this mastery. */
export const MASTER_MASTERY = 0.9;
/** Full days without any activity before coming back earns "comeback". */
export const COMEBACK_DAYS = 7;
/** Weekly leaderboard badges need at least this many ranked players that week (hidden ones count, as on the leaderboard). */
export const WEEKLY_MIN_PLAYERS = 2;

export function timeOfDayBadges(hour: number): BadgeId[] {
  const out: BadgeId[] = [];
  if (hour >= 23 || hour < 4) out.push("night_owl");
  if (hour >= 5 && hour < 7) out.push("early_bird");
  return out;
}

/** Active today after being away for at least COMEBACK_DAYS whole days. */
export function isComeback(prevActiveDay: string | null | undefined, today: string) {
  return !!prevActiveDay && daysBetween(prevActiveDay, today) > COMEBACK_DAYS;
}

/** Active on a Sunday right after being active on the Saturday before. */
export function isWeekendPair(prevActiveDay: string | null | undefined, today: string) {
  return weekday(today) === 0 && prevActiveDay === previousDay(today);
}

/** Day-based badges from a user's whole activity history (for the backfill). */
export function dayHistoryBadges(days: Iterable<string>): BadgeId[] {
  const sorted = [...new Set(days)].sort();
  const set = new Set(sorted);
  const out: BadgeId[] = [];
  if (sorted.some((d) => weekday(d) === 0 && set.has(previousDay(d)))) out.push("weekend_warrior");
  if (sorted.some((d, i) => i > 0 && isComeback(sorted[i - 1], d))) out.push("comeback");
  return out;
}

export interface LessonMastery {
  readerId: string;
  week: number;
  mastery: number;
}

const WORLD_BADGE: Record<Exclude<BiomeId, "campus">, BadgeId> = {
  bos: "world_bos",
  dorp: "world_dorp",
  stad: "world_stad",
  haven: "world_haven",
  jungle: "world_jungle",
  woestijn: "world_woestijn",
  bergen: "world_bergen",
};

/**
 * Meesterschap + Werelden badges from the mastery of every ready lesson in the readers the
 * user studies. Week/reader mastered = all its lessons ≥ 90 %. A biome counts once, in some
 * reader, every lesson of the week(s) drawn as that biome is done (≥ 80 %, as on the world
 * map); "graduated" = every lesson of a reader done (the campus finale is reached).
 */
export function masteryBadges(lessons: LessonMastery[]): { mastered: number; badges: BadgeId[] } {
  const out = new Set<BadgeId>();
  const byReader = new Map<string, LessonMastery[]>();
  for (const l of lessons) byReader.set(l.readerId, [...(byReader.get(l.readerId) ?? []), l]);
  for (const ls of byReader.values()) {
    const weeks = [...new Set(ls.map((l) => l.week))].sort((a, b) => a - b);
    const biomeDone = new Map<BiomeId, boolean>();
    weeks.forEach((w, k) => {
      const inWeek = ls.filter((l) => l.week === w);
      if (inWeek.every((l) => l.mastery >= MASTER_MASTERY)) out.add("week_master");
      const { biome } = biomeForWeek(k, weeks.length);
      biomeDone.set(biome, (biomeDone.get(biome) ?? true) && inWeek.every((l) => l.mastery >= DONE_MASTERY));
    });
    for (const [biome, done] of biomeDone) if (done && biome !== "campus") out.add(WORLD_BADGE[biome]);
    if (ls.every((l) => l.mastery >= MASTER_MASTERY)) out.add("reader_master");
    if (ls.every((l) => l.mastery >= DONE_MASTERY)) out.add("graduated");
  }
  return { mastered: lessons.filter((l) => l.mastery >= MASTER_MASTERY).length, badges: [...out] };
}

/** Three battles in a row won: `recent` = the user's latest battle results, newest first. */
export function hasWinStreak(recent: boolean[], n = 3) {
  return recent.length >= n && recent.slice(0, n).every(Boolean);
}

/**
 * Weekly top 3 / #1 from that week's ranking (highest XP first). The ranking covers every
 * user, like the leaderboard; only users who show on it get a badge for their place.
 */
export function weeklyWinners(ranked: { userId: string; xp: number; show: boolean }[]) {
  const players = ranked.filter((r) => r.xp > 0);
  if (players.length < WEEKLY_MIN_PLAYERS) return [];
  return players
    .slice(0, 3)
    .map((r, i) => ({ ...r, i }))
    .filter((r) => r.show)
    .map((r) => ({ userId: r.userId, badges: (r.i === 0 ? ["weekly_top3", "weekly_first"] : ["weekly_top3"]) as BadgeId[] }));
}
