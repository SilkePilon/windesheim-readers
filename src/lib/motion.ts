import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { createBrowserRouter } from "react-router";

/**
 * Motion helpers (spec §2): page transitions via the View Transitions API, a scoped
 * view transition for in-page swaps (quiz questions), a first-mount entrance flag for
 * staggered lists, and a count-up tween. Everything is instant under
 * prefers-reduced-motion and a no-op where View Transitions are unsupported.
 */

export type NavDir = "forward" | "back";

interface Loc {
  pathname: string;
  search: string;
}

/** Sibling pages in tab order (dock / rail, then the admin tabs): moving right slides forward. */
const TAB_ORDER = ["/", "/review", "/battle", "/leaderboard", "/profile", "/admin", "/admin/settings", "/admin/users"];

const depth = (l: Loc) => l.pathname.split("/").filter(Boolean).length + (l.search.length > 1 ? 1 : 0);

/**
 * Which way a navigation slides. `pop` is the history direction for back/forward
 * buttons; `hint` is the location state, where `{ navDir: "back" }` forces a back
 * slide (e.g. a "previous lesson" link). Otherwise tabs follow their order and going
 * up the hierarchy (lesson → path, quiz → lesson) slides back.
 */
export function navDirection(from: Loc, to: Loc, opts: { pop?: NavDir | null; hint?: unknown } = {}): NavDir {
  if (opts.pop) return opts.pop;
  const hint = opts.hint as { navDir?: unknown } | null | undefined;
  if (hint && (hint.navDir === "back" || hint.navDir === "forward")) return hint.navDir;
  const a = TAB_ORDER.indexOf(from.pathname);
  const b = TAB_ORDER.indexOf(to.pathname);
  if (a >= 0 && b >= 0 && a !== b) return b < a ? "back" : "forward";
  return depth(to) < depth(from) ? "back" : "forward";
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const canTransition = () =>
  typeof document !== "undefined" && typeof document.startViewTransition === "function" && !prefersReducedMotion();

type Router = ReturnType<typeof createBrowserRouter>;

/**
 * Turns on react-router's `viewTransition` for every push navigation (links,
 * `navigate()`; back/forward follow the push they undo) and marks the slide direction on
 * <html data-nav-dir> for the CSS in index.css. Replace navigations (redirects, URL
 * syncs like the battle code) stay instant; so do ones that only change state/hash
 * (`data-nav-dir="none"`). Call once, before rendering <RouterProvider>, so this
 * subscriber runs first.
 */
export function installPageTransitions(router: Router) {
  if (typeof document === "undefined" || typeof document.startViewTransition !== "function") return;
  // A transition interrupted by the next navigation is skipped, which rejects its
  // `ready` promise; react-router doesn't handle that, so it would log as uncaught.
  const start = document.startViewTransition.bind(document);
  document.startViewTransition = ((arg?: Parameters<typeof start>[0]) => {
    const t = start(arg);
    t.ready.catch(() => {});
    return t;
  }) as typeof document.startViewTransition;

  const navigate = router.navigate;
  router.navigate = ((to: unknown, opts?: { replace?: boolean; viewTransition?: boolean }) => {
    if (typeof to === "number") return navigate(to);
    const viewTransition = opts?.viewTransition ?? (!opts?.replace && !prefersReducedMotion());
    return navigate(to as never, { ...opts, viewTransition });
  }) as Router["navigate"];

  const idx = () => (window.history.state as { idx?: number } | null)?.idx ?? 0;
  let lastIdx = idx();
  let last = router.state.location;
  router.subscribe((state, { viewTransitionOpts }) => {
    const loc = state.location;
    if (loc.key === last.key) return; // not a navigation (loading state, fetchers)
    const now = idx();
    if (viewTransitionOpts) {
      const same = loc.pathname === last.pathname && loc.search === last.search;
      const pop = state.historyAction === "POP" ? (now < lastIdx ? "back" : "forward") : null;
      document.documentElement.dataset.navDir = same ? "none" : navDirection(last, loc, { pop, hint: loc.state });
    }
    lastIdx = now;
    last = loc;
  });
}

/**
 * Runs a state update inside a scoped view transition: <html data-vt={kind}> selects
 * the CSS for it (e.g. "quiz" slides the old question out left, the new one in right).
 * Without support or with reduced motion the update simply runs.
 */
export function withViewTransition(kind: string, update: () => void) {
  if (!canTransition()) return update();
  const root = document.documentElement;
  root.dataset.vt = kind;
  const t = document.startViewTransition(() => flushSync(update));
  void t.finished.finally(() => {
    if (root.dataset.vt === kind) delete root.dataset.vt;
  });
}

/**
 * True for the first 1.2 s after `ready` first turns true (data arrived), so a list
 * gets its staggered fade-up once per mount and not again on refetches or filter
 * changes. The stagger itself takes ~0.5 s; the margin covers a page transition that
 * holds rendering, since dropping the class early would cut the fade short.
 */
export function useEntrance(ready = true) {
  const [phase, setPhase] = useState<"wait" | "run" | "done">("wait");
  if (ready && phase === "wait") setPhase("run");
  useEffect(() => {
    if (phase !== "run") return;
    const id = setTimeout(() => setPhase("done"), 1200);
    return () => clearTimeout(id);
  }, [phase]);
  return ready && phase !== "done";
}

/**
 * Tweens a number up to `value` (ease-out, ≤ 600 ms). Starts at `from` on mount
 * (default: `value`, so no tween), snaps on decreases and under reduced motion.
 */
export function useCountUp(value: number, { from, duration = 600 }: { from?: number; duration?: number } = {}) {
  const [shown, setShown] = useState(from ?? value);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  useEffect(() => {
    const start = shownRef.current;
    if (value <= start || prefersReducedMotion()) {
      setShown(value);
      return;
    }
    let t0: number | null = null;
    let id = 0;
    const tick = (now: number) => {
      t0 ??= now; // frame time, not performance.now(): the two clocks can differ
      const p = Math.min(1, Math.max(0, (now - t0) / duration));
      setShown(Math.round(start + (value - start) * (1 - (1 - p) ** 3)));
      if (p < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value, duration]);
  return shown;
}

/** True while a view transition runs (false where `:active-view-transition` is unsupported). */
function inViewTransition() {
  try {
    return document.documentElement.matches(":active-view-transition");
  } catch {
    return false;
  }
}

/**
 * Runs `cb` once no view transition is running (right away if none is). Scrolling the
 * page during one shifts its snapshots, so e.g. the world map waits before it scrolls
 * to the current lesson. Returns a cancel function.
 */
export function afterViewTransition(cb: () => void) {
  let id = 0;
  const wait = () => {
    if (inViewTransition()) id = requestAnimationFrame(wait);
    else cb();
  };
  wait();
  return () => cancelAnimationFrame(id);
}
