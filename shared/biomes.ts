// Lesson-world biomes per week. Shared so the server can award the "Werelden" badges with
// the same week → biome mapping the client draws.

export type BiomeId = "bos" | "dorp" | "stad" | "haven" | "jungle" | "woestijn" | "bergen" | "campus";

export const BIOME_ORDER: readonly BiomeId[] = ["bos", "dorp", "stad", "haven", "jungle", "woestijn", "bergen"];

/**
 * Biome for a week: the fixed order, truncated for short readers; the last week is always
 * campus. Long readers cycle the order, with a per-cycle salt so repeats look different.
 */
export function biomeForWeek(weekIndex: number, totalWeeks: number): { biome: BiomeId; salt: string } {
  if (weekIndex >= totalWeeks - 1) return { biome: "campus", salt: "campus" };
  const n = BIOME_ORDER.length;
  return { biome: BIOME_ORDER[weekIndex % n]!, salt: `cycle-${Math.floor(weekIndex / n)}` };
}
