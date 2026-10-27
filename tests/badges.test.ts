import { describe, expect, test } from "bun:test";
import * as lucide from "lucide-react";
import { BADGE_CATEGORIES, BADGE_ICONS, BADGE_IDS, BADGE_LIST, BADGES, badgeProgress, badgesReached, isBadgeId } from "../shared/badges";
import { BADGE_ICON } from "../src/components/game/badge-icons";
import nl from "../src/locales/nl";
import en from "../src/locales/en";
import {
  dayHistoryBadges,
  hasWinStreak,
  isComeback,
  isWeekendPair,
  masteryBadges,
  timeOfDayBadges,
  weeklyWinners,
  eventsForReason,
} from "../server/lib/badge-rules";

const ORIGINAL = [
  "first_steps", "streak_3", "streak_7", "streak_30", "perfect_quiz", "cards_100",
  "cards_500", "explain_master", "lesson_master", "battle_winner", "night_owl", "early_bird",
];
const TONES = ["primary", "info", "success", "warning", "danger", "gold", "hard"];

describe("badge catalogue", () => {
  test("about 50 badges with unique ids, every category used", () => {
    expect(BADGE_LIST.length).toBeGreaterThanOrEqual(48);
    expect(new Set(BADGE_IDS).size).toBe(BADGE_IDS.length);
    for (const c of BADGE_CATEGORIES) expect(BADGE_LIST.some((b) => b.category === c)).toBe(true);
    expect(BADGE_LIST.every((b) => BADGE_CATEGORIES.includes(b.category))).toBe(true);
  });

  test("the 12 original ids stay valid", () => {
    for (const id of ORIGINAL) expect(isBadgeId(id)).toBe(true);
    expect(isBadgeId("nope")).toBe(false);
  });

  test("every badge has nl + en name and description, and categories/tiers are translated", () => {
    for (const id of BADGE_IDS) {
      for (const m of [nl, en]) {
        const copy = (m.badges as Record<string, { name: string; desc: string }>)[id];
        expect(copy?.name, `${id} name`).toBeTruthy();
        expect(copy?.desc, `${id} desc`).toBeTruthy();
      }
    }
    expect(Object.keys(nl.badges).sort()).toEqual([...BADGE_IDS].sort());
    expect(Object.keys(en.badges).sort()).toEqual([...BADGE_IDS].sort());
    for (const c of BADGE_CATEGORIES) expect(nl.badgeCategories[c] && en.badgeCategories[c]).toBeTruthy();
  });

  test("icons are real lucide icons and mapped on the client; tones and tiers are valid", () => {
    for (const name of BADGE_ICONS) expect(name in lucide, name).toBe(true);
    for (const b of BADGE_LIST) {
      expect(BADGE_ICON[b.icon], b.id).toBe((lucide as unknown as Record<string, unknown>)[b.icon] as never);
      expect(TONES).toContain(b.tone);
      expect(["bronze", "silver", "gold"]).toContain(b.tier);
    }
  });

  test("progress targets are positive and grow with the tier within a metric", () => {
    const byMetric = new Map<string, { tier: number; target: number }[]>();
    for (const b of BADGE_LIST) {
      if (!("progress" in b)) continue;
      expect(b.progress.target).toBeGreaterThan(0);
      byMetric.set(b.progress.metric, [...(byMetric.get(b.progress.metric) ?? []), { tier: ["bronze", "silver", "gold"].indexOf(b.tier), target: b.progress.target }]);
    }
    for (const list of byMetric.values()) {
      const sorted = [...list].sort((a, b) => a.target - b.target);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.tier).toBeGreaterThanOrEqual(sorted[i - 1]!.tier);
    }
  });
});

describe("metric helpers", () => {
  test("badgesReached returns every badge whose target is met", () => {
    expect(badgesReached("cards", 49)).toEqual([]);
    expect(badgesReached("cards", 100)).toEqual(["cards_50", "cards_100"]);
    expect(badgesReached("streak", 14)).toEqual(["streak_3", "streak_7", "streak_14"]);
    expect(badgesReached("battleWins", 1)).toEqual(["battle_winner"]);
  });

  test("badgeProgress caps at the target and is absent without a metric", () => {
    expect(badgeProgress("cards_500", { cards: 142 })).toEqual({ value: 142, target: 500 });
    expect(badgeProgress("cards_50", { cards: 142 })).toEqual({ value: 50, target: 50 });
    expect(badgeProgress("cards_50", {})).toEqual({ value: 0, target: 50 });
    expect(badgeProgress("night_owl", { cards: 1 })).toBeUndefined();
    expect(BADGES.explain_master.progress).toBeUndefined();
  });

  test("XP reasons map to the badge events they can trigger", () => {
    expect(eventsForReason("card")).toEqual(["card", "mastery"]);
    expect(eventsForReason("open")).toEqual(["open"]);
    expect(eventsForReason("battle")).toEqual([]);
  });
});

describe("badge rules", () => {
  test("time of day", () => {
    expect(timeOfDayBadges(23)).toEqual(["night_owl"]);
    expect(timeOfDayBadges(3)).toEqual(["night_owl"]);
    expect(timeOfDayBadges(6)).toEqual(["early_bird"]);
    expect(timeOfDayBadges(12)).toEqual([]);
  });

  test("weekend warrior: Sunday right after an active Saturday", () => {
    // 2026-10-24 is a Saturday, 2026-10-25 a Sunday.
    expect(isWeekendPair("2026-10-24", "2026-10-25")).toBe(true);
    expect(isWeekendPair("2026-10-23", "2026-10-25")).toBe(false);
    expect(isWeekendPair("2026-10-25", "2026-10-26")).toBe(false);
    expect(isWeekendPair(null, "2026-10-25")).toBe(false);
  });

  test("comeback: at least 7 whole days away", () => {
    expect(isComeback("2026-10-01", "2026-10-09")).toBe(true);
    expect(isComeback("2026-10-01", "2026-10-08")).toBe(false);
    expect(isComeback(null, "2026-10-09")).toBe(false);
  });

  test("history (backfill) finds weekends and comebacks", () => {
    expect(dayHistoryBadges(["2026-10-24", "2026-10-25"])).toEqual(["weekend_warrior"]);
    expect(dayHistoryBadges(["2026-10-25", "2026-10-26"])).toEqual([]);
    expect(dayHistoryBadges(["2026-09-01", "2026-09-20"])).toEqual(["comeback"]);
  });

  test("win streak needs the latest 3 battles all won", () => {
    expect(hasWinStreak([true, true, true, false])).toBe(true);
    expect(hasWinStreak([true, false, true, true])).toBe(false);
    expect(hasWinStreak([true, true])).toBe(false);
  });

  test("mastery + worlds", () => {
    const L = (readerId: string, week: number, mastery: number) => ({ readerId, week, mastery });
    // 3 weeks: bos, dorp, campus.
    const lessons = [L("r", 1, 0.95), L("r", 1, 0.92), L("r", 2, 0.85), L("r", 3, 0.1), L("x", 1, 0.5)];
    const m = masteryBadges(lessons);
    expect(m.mastered).toBe(2);
    expect(m.badges.sort()).toEqual(["week_master", "world_bos", "world_dorp"]);
    const done = masteryBadges([L("r", 1, 0.95), L("r", 2, 0.91), L("r", 3, 0.9)]);
    expect(done.badges.sort()).toEqual(["graduated", "reader_master", "week_master", "world_bos", "world_dorp"]);
    // Campus never maps to a world badge; one week only is campus.
    expect(masteryBadges([L("s", 1, 1)]).badges.sort()).toEqual(["graduated", "reader_master", "week_master"]);
    expect(masteryBadges([]).badges).toEqual([]);
  });

  test("a biome that repeats (long readers) needs all its weeks done", () => {
    // 9 weeks: bos … bergen, bos again, campus.
    const weeks = Array.from({ length: 9 }, (_, w) => ({ readerId: "r", week: w + 1, mastery: w === 7 ? 0 : 0.85 }));
    expect(masteryBadges(weeks).badges).not.toContain("world_bos");
    expect(masteryBadges(weeks).badges).toContain("world_dorp");
  });

  test("weekly winners: top 3 / #1, only with 2+ ranked players, hidden users rank but get nothing", () => {
    const r = (userId: string, xp: number, show = true) => ({ userId, xp, show });
    expect(weeklyWinners([r("a", 50)])).toEqual([]);
    expect(weeklyWinners([r("a", 50), r("b", 20)])).toEqual([
      { userId: "a", badges: ["weekly_top3", "weekly_first"] },
      { userId: "b", badges: ["weekly_top3"] },
    ]);
    expect(weeklyWinners([r("a", 50), r("b", 20), r("c", 10), r("d", 5)])).toEqual([
      { userId: "a", badges: ["weekly_top3", "weekly_first"] },
      { userId: "b", badges: ["weekly_top3"] },
      { userId: "c", badges: ["weekly_top3"] },
    ]);
    // A hidden #1 takes the place (as on the leaderboard): the best visible user is #2, not first.
    expect(weeklyWinners([r("h", 90, false), r("a", 50), r("b", 20), r("c", 10)])).toEqual([
      { userId: "a", badges: ["weekly_top3"] },
      { userId: "b", badges: ["weekly_top3"] },
    ]);
    // A hidden player still counts towards the minimum.
    expect(weeklyWinners([r("h", 90, false), r("a", 50)])).toEqual([{ userId: "a", badges: ["weekly_top3"] }]);
  });
});
