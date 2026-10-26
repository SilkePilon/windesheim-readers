import { MASTERY_WEIGHTS } from "./game";

/** Lesson level 0-5 from mastery 0..1 (epsilon guards float error, e.g. 0.4 * 5). */
export function lessonLevel(mastery: number): number {
  return Math.min(5, Math.floor(mastery * 5 + 1e-9));
}

export type NextStep = { kind: "cards" | "quiz" | "explain" | "read"; gain: number } | null;

/** The component that adds the most mastery. Ties: cards > quiz > explain > read. */
export function nextStep(p: {
  bestQuiz: number;
  bestExplain: number;
  summaryRead: boolean;
  cardMastery: number;
  cardsLeft: number;
}): NextStep {
  const candidates: { kind: "cards" | "quiz" | "explain" | "read"; gain: number }[] = [
    { kind: "cards", gain: MASTERY_WEIGHTS.cards * (1 - p.cardMastery) },
    { kind: "quiz", gain: MASTERY_WEIGHTS.quiz * (1 - p.bestQuiz) },
    { kind: "explain", gain: MASTERY_WEIGHTS.explain * (1 - p.bestExplain) },
    { kind: "read", gain: MASTERY_WEIGHTS.read * (p.summaryRead ? 0 : 1) },
  ];
  let best: (typeof candidates)[number] | null = null;
  for (const c of candidates) {
    // epsilon so float noise (0.2 * 0.75 vs 0.3 * 0.5) still counts as a tie
    if (c.gain > 1e-9 && (!best || c.gain > best.gain + 1e-9)) best = c;
  }
  return best;
}
