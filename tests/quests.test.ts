import { expect, test, describe } from "bun:test";
import { QUESTS, applyEvent, questsForDay } from "../shared/quests";
import { dayKey } from "../server/lib/time";

describe("quests", () => {
  test("values", () => {
    expect(QUESTS.review_cards).toEqual({ target: 20, reward: 15 });
    expect(QUESTS.earn_xp).toEqual({ target: 60, reward: 10 });
    expect(QUESTS.two_lessons).toEqual({ target: 2, reward: 10 });
  });
  test("questsForDay deterministic, distinct, varies", () => {
    expect(questsForDay("u1", "2026-10-26")).toEqual(questsForDay("u1", "2026-10-26"));
    expect(new Set(questsForDay("u1", "2026-10-26")).size).toBe(3);
    const sets = new Set<string>();
    for (let d = 20; d < 27; d++) sets.add(questsForDay("u1", `2026-10-${d}`).join(","));
    expect(sets.size).toBeGreaterThanOrEqual(2);
  });
  test("earn_xp ignores quest xp", () => {
    expect(applyEvent("earn_xp", 50, [], { kind: "xp", amount: 15, reason: "quest" }).progress).toBe(50);
    expect(applyEvent("earn_xp", 50, [], { kind: "xp", amount: 15, reason: "quiz" }).progress).toBe(65);
  });
  test("thresholds", () => {
    expect(applyEvent("quiz_80", 0, [], { kind: "quiz_submit", pct: 0.79, lessonId: "a" }).progress).toBe(0);
    expect(applyEvent("quiz_80", 0, [], { kind: "quiz_submit", pct: 0.8, lessonId: "a" }).progress).toBe(1);
    expect(applyEvent("explain_60", 0, [], { kind: "explain", score: 59, lessonId: "a" }).progress).toBe(0);
    expect(applyEvent("explain_60", 0, [], { kind: "explain", score: 60, lessonId: "a" }).progress).toBe(1);
    expect(applyEvent("review_cards", 3, [], { kind: "card_review" }).progress).toBe(4);
    expect(applyEvent("open_answer", 0, [], { kind: "open", lessonId: "a" }).progress).toBe(1);
  });
  test("two_lessons distinct", () => {
    const s1 = applyEvent("two_lessons", 0, [], { kind: "card_lesson", lessonId: "a" });
    const s2 = applyEvent("two_lessons", s1.progress, s1.seenLessons, { kind: "quiz_submit", pct: 0, lessonId: "a" });
    expect(s2.progress).toBe(1);
    expect(applyEvent("two_lessons", s2.progress, s2.seenLessons, { kind: "open", lessonId: "b" }).progress).toBe(2);
  });
  test("dayKey Amsterdam midnight", () => {
    expect(dayKey(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-15");
  });
});
