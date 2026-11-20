import { describe, expect, test } from "bun:test";
import { initSession, isWeakLesson, sessionProgress, sessionReducer } from "../src/lib/session-runner";
import type { ReaderSessionResult } from "../src/lib/types";

const RESULT: ReaderSessionResult = {
  xp: 30,
  correct: 3,
  total: 4,
  perLesson: [{ lessonId: "l1", code: "1.1", correct: 3, total: 4 }],
  dayStreak: 2,
  award: { xp: 130, gained: 30 } as ReaderSessionResult["award"],
};

describe("sessionReducer", () => {
  test("progress advances only on answered items", () => {
    let s = initSession(4);
    expect(sessionProgress(s)).toBe(0);
    // Moving on without answering (skipping an open question) doesn't add progress.
    s = sessionReducer(s, { type: "next", from: 0 });
    expect(s.index).toBe(1);
    expect(sessionProgress(s)).toBe(0);
    s = sessionReducer(s, { type: "checked", at: 1, correct: false });
    expect(sessionProgress(s)).toBe(0.25);
    // Checking the same item twice counts once.
    s = sessionReducer(s, { type: "checked", at: 1, correct: true });
    expect(sessionProgress(s)).toBe(0.25);
    s = sessionReducer(s, { type: "next", from: 1 });
    s = sessionReducer(s, { type: "graded", at: 2 });
    expect(sessionProgress(s)).toBe(0.5);
    expect(s.index).toBe(2);
  });

  test("a rated card counts and moves straight on", () => {
    let s = initSession(3);
    s = sessionReducer(s, { type: "card-rated", at: 0 });
    expect(s.index).toBe(1);
    expect([...s.answered]).toEqual([0]);
    expect(s.done).toBe(false);
  });

  test("next past the last item sets done", () => {
    let s = initSession(2);
    s = sessionReducer(s, { type: "checked", at: 0, correct: true });
    s = sessionReducer(s, { type: "next", from: 0 });
    expect(s.done).toBe(false);
    s = sessionReducer(s, { type: "checked", at: 1, correct: true });
    s = sessionReducer(s, { type: "next", from: 1 });
    expect(s.done).toBe(true);
    expect(s.index).toBe(1);
    expect(sessionProgress(s)).toBe(1);
    // Once done, further actions change nothing.
    expect(sessionReducer(s, { type: "next", from: 1 })).toBe(s);
  });

  test("rating the last card sets done", () => {
    const s = sessionReducer(initSession(1), { type: "card-rated", at: 0 });
    expect(s.done).toBe(true);
  });

  test("submitted stores the result", () => {
    let s = sessionReducer(initSession(1), { type: "card-rated", at: 0 });
    s = sessionReducer(s, { type: "submitted", result: RESULT });
    expect(s.result).toEqual(RESULT);
    expect(s.done).toBe(true);
  });

  test("a stale next (auto-advance and the button both firing) skips nothing", () => {
    let s = initSession(3);
    s = sessionReducer(s, { type: "checked", at: 0, correct: true });
    s = sessionReducer(s, { type: "next", from: 0 });
    const after = sessionReducer(s, { type: "next", from: 0 });
    expect(after).toBe(s);
    expect(after.index).toBe(1);
  });

  test("a stale card-rated neither advances nor marks the current item", () => {
    let s = sessionReducer(initSession(3), { type: "card-rated", at: 0 });
    const after = sessionReducer(s, { type: "card-rated", at: 0 });
    expect(after).toBe(s);
    expect(after.index).toBe(1);
    expect([...after.answered]).toEqual([0]);
    s = sessionReducer(s, { type: "checked", at: 0, correct: true });
    expect([...s.answered]).toEqual([0]);
  });

  test("reset starts over with a new total", () => {
    let s = sessionReducer(initSession(1), { type: "card-rated", at: 0 });
    s = sessionReducer(s, { type: "reset", total: 5 });
    expect(s).toEqual(initSession(5));
  });

  test("an empty session has no progress and is not done", () => {
    const s = initSession(0);
    expect(sessionProgress(s)).toBe(0);
    expect(s.done).toBe(false);
  });
});

describe("isWeakLesson", () => {
  test("under 60% correct is weak", () => {
    expect(isWeakLesson({ correct: 1, total: 2 })).toBe(true);
    expect(isWeakLesson({ correct: 2, total: 3 })).toBe(false);
    expect(isWeakLesson({ correct: 0, total: 0 })).toBe(false);
  });
});
