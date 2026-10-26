import { useCallback, useSyncExternalStore } from "react";
import { storageGet, storageSet } from "@/lib/storage";

export type InstallPlatform = "installed" | "prompt" | "ios-safari" | "unsupported";

/** Chromium's install event; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "wr.install.dismissedAt";
const INSTALLED_KEY = "wr.install.installed";
export const INSTALL_SNOOZE_MS = 1_209_600_000; // 14 days

/**
 * Which install path this browser offers. Already running standalone wins; then the
 * Chromium install prompt; then iOS Safari (manual "Add to Home Screen"). iOS Chrome,
 * Firefox, Edge etc. can't install, so they and everything else are "unsupported".
 */
export function installPlatform(env: { ua: string; standalone: boolean; hasPrompt: boolean }): InstallPlatform {
  if (env.standalone) return "installed";
  if (env.hasPrompt) return "prompt";
  const ios = /iPhone|iPad|iPod/.test(env.ua);
  const safari = /Version\/[\d.]+.*Safari\//.test(env.ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(env.ua);
  return ios && safari ? "ios-safari" : "unsupported";
}

/** Auto-show the install drawer: installable, on mobile, and not dismissed in the last 14 days. */
export function shouldShowInstall(p: {
  platform: InstallPlatform;
  dismissedAt: number | null;
  now: number;
  isMobile: boolean;
}): boolean {
  if (!p.isMobile) return false;
  if (p.platform !== "prompt" && p.platform !== "ios-safari") return false;
  if (p.dismissedAt === null) return true;
  // A dismissal "in the future" (clock skew) counts as now, so it can't snooze forever.
  return p.now - Math.min(p.dismissedAt, p.now) >= INSTALL_SNOOZE_MS;
}

// Module-level store: the beforeinstallprompt event fires early (often before React
// mounts), so it's captured here and kept for the drawer.
let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let dismissedThisSession = false;
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  for (const l of listeners) l();
};

const standaloneQuery = () => window.matchMedia("(display-mode: standalone)");

function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return standaloneQuery().matches || nav.standalone === true;
}

let captured = false;
/** Call once before React renders so an early `beforeinstallprompt` isn't missed. */
export function captureInstallPrompt(): void {
  if (captured || typeof window === "undefined") return;
  captured = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep Chrome's mini-infobar away; we show our own drawer
    deferred = e as BeforeInstallPromptEvent;
    installedNow = false;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    storageSet(INSTALLED_KEY, "1");
    notify();
  });
  standaloneQuery().addEventListener("change", notify);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function currentPlatform(): InstallPlatform {
  // A remembered install counts until Chromium offers the prompt again (it doesn't while
  // the app is installed, so a fresh prompt means it was uninstalled).
  const remembered = installedNow || (storageGet(INSTALLED_KEY) === "1" && !deferred);
  return installPlatform({ ua: navigator.userAgent, standalone: isStandalone() || remembered, hasPrompt: !!deferred });
}

/**
 * The stored dismissal time, clamped to `now`: a timestamp from the future (clock skew)
 * would otherwise snooze the drawer indefinitely.
 */
export function parseDismissedAt(raw: string | null, now: number): number | null {
  const v = Number(raw);
  if (!raw || !Number.isFinite(v) || v <= 0) return null;
  return Math.min(v, now);
}

export function installDismissedAt(): number | null {
  const now = Date.now();
  if (dismissedThisSession) return now;
  const raw = storageGet(DISMISSED_KEY);
  const at = parseDismissedAt(raw, now);
  // Persist the clamp, so the 14 days run from now rather than from the future value.
  if (at !== null && String(at) !== raw) storageSet(DISMISSED_KEY, String(at));
  return at;
}

export function useInstall() {
  // The snapshot is the version counter; the platform is derived on each render.
  useSyncExternalStore(subscribe, () => version);
  const platform = currentPlatform();

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    const e = deferred;
    if (!e) return "unavailable";
    await e.prompt();
    const { outcome } = await e.userChoice;
    deferred = null; // a prompt event can only be used once
    notify();
    return outcome;
  }, []);

  const dismiss = useCallback(() => {
    dismissedThisSession = true; // also holds when storage is blocked
    storageSet(DISMISSED_KEY, String(Date.now()));
  }, []);

  return { platform, promptInstall, dismiss };
}
