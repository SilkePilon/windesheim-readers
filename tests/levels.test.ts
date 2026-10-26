import { expect, test, describe } from "bun:test";
import { lessonLevel, nextStep, nextStepHint } from "../shared/levels";

describe("levels", () => {
  test("lessonLevel", () => {
    expect(lessonLevel(0)).toBe(0);
    expect(lessonLevel(0.39)).toBe(1);
    expect(lessonLevel(0.4)).toBe(2);
    expect(lessonLevel(1)).toBe(5);
  });
  test("nextStep", () => {
    expect(nextStep({ bestQuiz: 0, bestExplain: 0, summaryRead: false, cardMastery: 0, cardsLeft: 14 })?.kind).toBe("quiz");
    expect(nextStep({ bestQuiz: 1, bestExplain: 1, summaryRead: true, cardMastery: 1, cardsLeft: 0 })).toBeNull();
    expect(nextStep({ bestQuiz: 1, bestExplain: 0.25, summaryRead: true, cardMastery: 0.5, cardsLeft: 7 })?.kind).toBe("cards");
  });
  describe("nextStepHint", () => {
    const hint = (p: { mastery: number; bestQuiz: number; bestExplain: number; summaryRead: boolean; cardMastery: number; flashcardCount: number }) => {
      const cardsLeft = Math.ceil(p.flashcardCount * (1 - p.cardMastery) - 1e-9);
      return nextStepHint({ mastery: p.mastery, flashcardCount: p.flashcardCount, cardsLeft, step: nextStep({ ...p, cardsLeft }) });
    };
    test("normal case: 2 cards reach the next level", () => {
      // 0.1 read + 0.4 × 0.5 quiz = 0.3 (level 1); 2 of 4 cards add 0.15 → 0.45 (level 2)
      expect(hint({ mastery: 0.3, bestQuiz: 0.5, bestExplain: 0, summaryRead: true, cardMastery: 0, flashcardCount: 4 })).toEqual({ key: "cards", n: 2, level: 2 });
    });
    test("cards capped: all remaining cards still land on the same level", () => {
      // 1.1B: 0.1 + 0.4 + 0.18 + 0.15 = 0.83 (level 4); both cards left add 0.15 → 0.98, still level 4
      const h = hint({ mastery: 0.83, bestQuiz: 1, bestExplain: 0.9, summaryRead: true, cardMastery: 0.5, flashcardCount: 4 });
      expect(h).toEqual({ key: "cardsAll", n: 2 });
    });
    test("read step that can't cross a level boundary", () => {
      // 0.4 quiz + 0.3 cards = 0.7 (level 3) → reading adds 0.1 → 0.8 = level 4: crosses
      expect(nextStepHint({ mastery: 0.7, flashcardCount: 4, cardsLeft: 0, step: { kind: "read", gain: 0.1 } })).toEqual({ key: "read", level: 4 });
      // 0.65 (level 3) + 0.1 = 0.75, still level 3
      expect(nextStepHint({ mastery: 0.65, flashcardCount: 4, cardsLeft: 0, step: { kind: "read", gain: 0.1 } })).toEqual({ key: "readNoLevel" });
    });
    test("quiz and explain without a reachable level", () => {
      expect(nextStepHint({ mastery: 0.79, flashcardCount: 0, cardsLeft: 0, step: { kind: "quiz", gain: 0.004 } })).toEqual({ key: "quizNoLevel" });
      expect(nextStepHint({ mastery: 0.5, flashcardCount: 0, cardsLeft: 0, step: { kind: "explain", gain: 0.02 } })).toEqual({ key: "explainNoLevel" });
      expect(nextStepHint({ mastery: 0, flashcardCount: 0, cardsLeft: 0, step: { kind: "quiz", gain: 0.4 } })).toEqual({ key: "quiz", level: 1 });
    });
    test("max and nothing left", () => {
      expect(nextStepHint({ mastery: 1, flashcardCount: 4, cardsLeft: 0, step: null })).toEqual({ key: "max" });
      expect(nextStepHint({ mastery: 0.5, flashcardCount: 0, cardsLeft: 0, step: null })).toBeNull();
    });
  });
});
