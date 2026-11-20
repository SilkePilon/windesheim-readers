/**
 * The daily reader session's step state: which item is up, which items were answered and the
 * submitted result. Pure (no React or i18n), so it can be tested on its own.
 */

import type { ReaderSessionResult } from "@/lib/types";

export interface SessionState {
  /** The item on screen. Stays on the last item once `done`. */
  index: number;
  total: number;
  /** Past the last item: time to submit. */
  done: boolean;
  /** Indexes of the items that were rated, checked or graded. */
  answered: Set<number>;
  result?: ReaderSessionResult;
}

export type SessionAction =
  | { type: "card-rated"; at: number }
  | { type: "checked"; at: number; correct: boolean }
  | { type: "graded"; at: number }
  | { type: "next"; from: number }
  | { type: "submitted"; result: ReaderSessionResult }
  /** A freshly loaded session with this many items (`done`: a resumed session with nothing left, submit it). */
  | { type: "reset"; total: number; done?: boolean };

export function initSession(total: number): SessionState {
  return { index: 0, total, done: false, answered: new Set() };
}

function answer(s: SessionState): SessionState {
  if (s.answered.has(s.index)) return s;
  return { ...s, answered: new Set(s.answered).add(s.index) };
}

function advance(s: SessionState): SessionState {
  if (s.index + 1 >= s.total) return { ...s, done: true };
  return { ...s, index: s.index + 1 };
}

export function sessionReducer(s: SessionState, a: SessionAction): SessionState {
  if (a.type === "reset") return a.done ? { ...initSession(a.total), done: true } : initSession(a.total);
  if (a.type === "submitted") return { ...s, done: true, result: a.result };
  if (s.done) return s;
  // Each step names the item it belongs to: a late timer or a double tap for an item that's
  // already gone (e.g. auto-advance and the next button both firing) changes nothing.
  if ((a.type === "next" ? a.from : a.at) !== s.index) return s;
  switch (a.type) {
    // A card has no feedback step: rating it moves straight on.
    case "card-rated":
      return advance(answer(s));
    case "checked":
    case "graded":
      return answer(s);
    case "next":
      return advance(s);
  }
}

/** 0..1 over all items; only answered items count. */
export function sessionProgress(s: SessionState): number {
  return s.total ? s.answered.size / s.total : 0;
}

/** A lesson in the result is weak below 60% correct; it gets highlighted with a link to practise. */
export function isWeakLesson(l: { correct: number; total: number }): boolean {
  return l.total > 0 && l.correct / l.total < 0.6;
}
