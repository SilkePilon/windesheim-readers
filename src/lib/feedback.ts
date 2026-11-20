/**
 * Feedback sheet, client side: the open/seed store and the session draft. In the main chunk
 * (help button, error toasts, crash screen); the context collector and the screenshot
 * shrinker live in `./feedback-collect`, loaded with the sheet.
 * Kept free of `@/lib/i18n` (and anything importing it) so bun can test it without a DOM.
 */
import { useSyncExternalStore } from "react";
import { LIMITS } from "@shared/limits";
import type { FeedbackContext, FeedbackType } from "@shared/feedback";

// ----- open/seed store -----

export type FeedbackSeed = { type?: FeedbackType; error?: FeedbackContext["error"] };
export type FeedbackState = { open: boolean; seed: FeedbackSeed | null };

let state: FeedbackState = { open: false, seed: null };
const listeners = new Set<() => void>();
const set = (next: FeedbackState) => {
  state = next;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Open the feedback sheet; a seed preselects the type and attaches an error. */
export function openFeedback(seed?: FeedbackSeed): void {
  set({ open: true, seed: seed ?? null });
}

export function closeFeedback(): void {
  if (state.open) set({ ...state, open: false });
}

/** The current snapshot (stable between changes). */
export const getFeedbackState = (): FeedbackState => state;

export function useFeedbackState(): FeedbackState {
  return useSyncExternalStore(subscribe, getFeedbackState, getFeedbackState);
}

// ----- session draft -----

/**
 * What the student typed or picked, kept while the sheet is closed and reopened (in
 * memory only). It belongs to one user: read or written for another user id, it is
 * dropped first, so a shared device never shows the previous student's draft.
 */
export interface FeedbackDraft {
  type: FeedbackType;
  message: string;
  screenshot: Blob | null;
}
const emptyDraft = (): FeedbackDraft => ({ type: "feedback", message: "", screenshot: null });
let draft: FeedbackDraft = emptyDraft();
let draftOwner: string | null = null;

const own = (userId: string) => {
  if (draftOwner !== userId) {
    draft = emptyDraft();
    draftOwner = userId;
  }
};
export const getDraft = (userId: string): FeedbackDraft => (own(userId), draft);
export const saveDraft = (userId: string, patch: Partial<FeedbackDraft>) => {
  own(userId);
  draft = { ...draft, ...patch };
};
export const clearDraft = () => {
  draft = emptyDraft();
  draftOwner = null;
};

/** The draft to start the sheet with: a seed type (e.g. Bug from an error) overrides the draft's. */
export function openDraft(userId: string, seed: FeedbackSeed | null): FeedbackDraft {
  if (seed?.type) saveDraft(userId, { type: seed.type });
  return getDraft(userId);
}

/** On sign-out: close the sheet and forget the draft. */
export function resetFeedback(): void {
  closeFeedback();
  clearDraft();
}

/** Message length rule shared with the server: 10–4000 code points after trimming. */
export function messageValid(message: string): boolean {
  const n = [...message.trim()].length;
  return n >= LIMITS.feedback.message.min && n <= LIMITS.feedback.message.max;
}
