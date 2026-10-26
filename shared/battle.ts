/** Battle lobby settings and scoring, shared by the server (authoritative) and the client (UI). */

export const QUESTION_SECONDS = [10, 20, 30, 60] as const;
export const POINTS_MODES = ["normal", "lastDouble", "allDouble"] as const;
export const DIFFICULTIES = ["easy", "mixed", "hard"] as const;
export const COUNT_MIN = 5;
export const COUNT_MAX = 20;

export interface BattleSettings {
  questionSeconds: (typeof QUESTION_SECONDS)[number];
  points: (typeof POINTS_MODES)[number];
  /** Wanted number of questions; the room may hold fewer when the pool is smaller. */
  count: number;
  difficulty: (typeof DIFFICULTIES)[number];
  speedBonus: boolean;
  streakBonus: boolean;
  /** Ranking between questions (the final podium always shows). */
  showScoreboard: boolean;
}

export const DEFAULT_BATTLE_SETTINGS: BattleSettings = {
  questionSeconds: 20,
  points: "normal",
  count: 10,
  difficulty: "mixed",
  speedBonus: true,
  streakBonus: true,
  showScoreboard: true,
};

/** question.difficulty (1..3) a setting keeps; null = all of them. */
export const DIFFICULTY_LEVEL: Record<BattleSettings["difficulty"], number | null> = { easy: 1, mixed: null, hard: 3 };

const BASE = 500;
const SPEED_MAX = 500;
const STREAK_STEP = 50;
const STREAK_MAX_STEPS = 5;

export const isDoubled = (settings: Pick<BattleSettings, "points">, isLast: boolean) =>
  settings.points === "allDouble" || (settings.points === "lastDouble" && isLast);

/**
 * Points for one answer, Kahoot-style: 500 for correct, up to 500 for speed, +50 per
 * extra answer in a streak (max +250); then ×2 on doubled questions.
 * `streak` counts this answer (1 = first correct in a row).
 */
export function scoreAnswer({
  correct,
  msLeft,
  totalMs,
  streak,
  settings,
  isLast,
}: {
  correct: boolean;
  msLeft: number;
  totalMs: number;
  streak: number;
  settings: Pick<BattleSettings, "points" | "speedBonus" | "streakBonus">;
  isLast: boolean;
}): number {
  if (!correct) return 0;
  let points = BASE;
  if (settings.speedBonus) points += Math.round(SPEED_MAX * Math.min(1, Math.max(0, msLeft / totalMs)));
  if (settings.streakBonus) points += Math.min(STREAK_MAX_STEPS, Math.max(0, streak - 1)) * STREAK_STEP;
  return isDoubled(settings, isLast) ? points * 2 : points;
}
