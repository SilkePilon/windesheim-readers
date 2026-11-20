// FSRS helpers shared by the lesson routes and the reader session (card rows <-> ts-fsrs cards).
import { fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import type { schema } from "../db";

export const scheduler = fsrs({ enable_fuzz: true });

/** Next-due interval (ms from `now`) per rating, from FSRS `repeat()` previews. */
export function previewIntervals(card: Card, now: Date) {
  const rec = scheduler.repeat(card, now);
  const ms = (g: Grade) => rec[g].card.due.getTime() - now.getTime();
  return { again: ms(Rating.Again), hard: ms(Rating.Hard), good: ms(Rating.Good), easy: ms(Rating.Easy) };
}

export function toCard(r: typeof schema.cardReview.$inferSelect): Card {
  return {
    due: r.due,
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsedDays,
    scheduled_days: r.scheduledDays,
    learning_steps: r.learningSteps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    last_review: r.lastReview ?? undefined,
  };
}

export function fromCard(c: Card) {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ?? null,
  };
}
