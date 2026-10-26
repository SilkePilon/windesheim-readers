import { expect, test, describe } from "bun:test";
import { lessonLevel, nextStep } from "../shared/levels";

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
});
