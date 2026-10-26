import { describe, expect, test } from "bun:test";
import { DEFAULT_BATTLE_SETTINGS, isDoubled, scoreAnswer, type BattleSettings } from "../shared/battle";

const s = (over: Partial<BattleSettings> = {}): BattleSettings => ({ ...DEFAULT_BATTLE_SETTINGS, ...over });
const base = { correct: true, msLeft: 10_000, totalMs: 20_000, streak: 1, isLast: false };

describe("scoreAnswer", () => {
  test("wrong answers score nothing, whatever the settings", () => {
    expect(scoreAnswer({ ...base, correct: false, settings: s() })).toBe(0);
    expect(scoreAnswer({ ...base, correct: false, settings: s({ points: "allDouble" }), isLast: true })).toBe(0);
  });

  test("normal: 500 base + up to 500 for speed + 50 per extra streak (max 250)", () => {
    expect(scoreAnswer({ ...base, settings: s() })).toBe(750);
    expect(scoreAnswer({ ...base, msLeft: 20_000, settings: s() })).toBe(1000);
    expect(scoreAnswer({ ...base, msLeft: 0, settings: s() })).toBe(500);
    expect(scoreAnswer({ ...base, msLeft: -300, settings: s() })).toBe(500);
    expect(scoreAnswer({ ...base, streak: 3, settings: s() })).toBe(850);
    expect(scoreAnswer({ ...base, streak: 12, settings: s() })).toBe(1000);
  });

  test("bonus toggles: off means the base only", () => {
    expect(scoreAnswer({ ...base, streak: 4, settings: s({ speedBonus: false }) })).toBe(650);
    expect(scoreAnswer({ ...base, streak: 4, settings: s({ streakBonus: false }) })).toBe(750);
    expect(scoreAnswer({ ...base, streak: 4, settings: s({ speedBonus: false, streakBonus: false }) })).toBe(500);
  });

  test("allDouble doubles every question, lastDouble only the last", () => {
    expect(scoreAnswer({ ...base, settings: s({ points: "allDouble" }) })).toBe(1500);
    expect(scoreAnswer({ ...base, settings: s({ points: "lastDouble" }) })).toBe(750);
    expect(scoreAnswer({ ...base, isLast: true, settings: s({ points: "lastDouble" }) })).toBe(1500);
    expect(scoreAnswer({ ...base, streak: 2, isLast: true, settings: s({ points: "allDouble", speedBonus: false }) })).toBe(1100);
  });

  test("isDoubled", () => {
    expect(isDoubled(s(), true)).toBe(false);
    expect(isDoubled(s({ points: "lastDouble" }), false)).toBe(false);
    expect(isDoubled(s({ points: "lastDouble" }), true)).toBe(true);
    expect(isDoubled(s({ points: "allDouble" }), false)).toBe(true);
  });
});
