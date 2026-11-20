/**
 * Pure copy helpers for the whole-reader learning page and its home card.
 * No React or i18n imports: the components translate the keys these return.
 */

import type { ReaderLearn } from "@/lib/types";

/** Same share as the server's `LISTENED_SHARE`: an episode counts as heard at 90%. */
export const EPISODE_DONE_SHARE = 0.9;

/** The countdown line: the i18n key and, for "in n days", the count. */
export function examLabel(days: number | null): { key: string; n?: number } {
  if (days === null) return { key: "readerLearn.exam.none" };
  if (days < 0) return { key: "readerLearn.exam.past" };
  if (days === 0) return { key: "readerLearn.exam.today" };
  if (days === 1) return { key: "readerLearn.exam.tomorrow" };
  return { key: "readerLearn.exam.inDays", n: days };
}

/** The non-zero parts of the estimate line ("12 kaarten · 8 vragen · 1 uitleg"), in that order. */
export function estimateParts(e: { cards: number; questions: number; open: number }): { key: string; n: number }[] {
  const parts = [
    { key: "readerLearn.estimate.cards", n: e.cards },
    { key: "readerLearn.estimate.questions", n: e.questions },
    { key: "readerLearn.estimate.open", n: e.open },
  ];
  return parts.filter((p) => p.n > 0);
}

type EpisodeRow = ReaderLearn["episodes"][number];

/** Heard far enough to count (and to show the check). */
export const episodeDone = (ep: EpisodeRow) => ep.durationSec > 0 && ep.listenMs >= EPISODE_DONE_SHARE * ep.durationSec * 1000;

/** Where the resume bar stands (0..1); 0 when not started or done. */
export function episodeResume(ep: EpisodeRow): number {
  if (episodeDone(ep) || ep.durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, ep.positionMs / (ep.durationSec * 1000)));
}

/** Whole minutes for a duration in seconds, at least 1. */
export const durationMinutes = (sec: number) => Math.max(1, Math.round(sec / 60));
