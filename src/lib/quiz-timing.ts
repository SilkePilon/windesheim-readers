/**
 * After checking, the next button fills and moves on by itself, after enough time to read the
 * sheet: a base pause plus ~4 words per second of explanation (and correct answer), capped so
 * it never drags. Wrong answers get a longer base. Tapping the sheet stops it altogether.
 */
export function autoAdvanceMs(correct: boolean, text: string) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const base = correct ? 1500 : 2500;
  return Math.round(Math.min(correct ? 8000 : 10000, Math.max(correct ? 2000 : 3500, base + words * 250)));
}
