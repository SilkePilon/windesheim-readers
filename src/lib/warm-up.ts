/**
 * One dynamic import per lazily loaded page. App.tsx's `lazy()` calls and the idle
 * warm-up share these, so each chunk is requested through the same import.
 * Pure on purpose: no React, i18n or static page imports.
 */
export const PAGE_LOADERS = {
  lesson: () => import("@/pages/lesson"),
  study: () => import("@/pages/lesson-study"),
  review: () => import("@/pages/review"),
  leaderboard: () => import("@/pages/leaderboard"),
  profile: () => import("@/pages/profile"),
  battle: () => import("@/pages/battle"),
  world: () => import("@/components/world/world-map"),
} satisfies Record<string, () => Promise<unknown>>;

/** Skip the background downloads when the user asked to save data. */
export function shouldWarmUp(nav: { connection?: { saveData?: boolean } }): boolean {
  return !nav.connection?.saveData;
}

type WarmWindow = Pick<Window, "setTimeout" | "clearTimeout"> & {
  requestIdleCallback?: Window["requestIdleCallback"];
  cancelIdleCallback?: Window["cancelIdleCallback"];
};

/** Run `run` once the browser is idle (or after 2 s without idle callbacks). Returns a cancel function. */
export function scheduleWarmUp(win: WarmWindow, run: () => void): () => void {
  if (win.requestIdleCallback) {
    const id = win.requestIdleCallback(run, { timeout: 4000 });
    return () => win.cancelIdleCallback?.(id);
  }
  const id = win.setTimeout(run, 2000);
  return () => win.clearTimeout(id);
}

const RELOAD_KEY = "wr-chunk-reload";

/** A chunk 404s after a deploy: reload once to pick up the new build; a second failure falls through. */
export function reloadOnceForStaleChunk(storage: Pick<Storage, "getItem" | "setItem">, reload: () => void): boolean {
  if (storage.getItem(RELOAD_KEY)) return false;
  storage.setItem(RELOAD_KEY, "1");
  reload();
  return true;
}
