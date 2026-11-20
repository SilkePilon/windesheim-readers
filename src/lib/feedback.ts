/**
 * Feedback sheet, client side: the open/seed store, the session draft, the automatic
 * context collector and the screenshot shrinker.
 * Kept free of `@/lib/i18n` (and anything importing it) so bun can test it without a DOM.
 */
import { useSyncExternalStore } from "react";
import { LIMITS } from "@shared/limits";
import { shortBrowser, type FeedbackContext, type FeedbackType } from "@shared/feedback";

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

/** What the student typed or picked, kept while the sheet is closed and reopened (in memory only). */
export interface FeedbackDraft {
  type: FeedbackType;
  message: string;
  screenshot: Blob | null;
}
const emptyDraft = (): FeedbackDraft => ({ type: "feedback", message: "", screenshot: null });
let draft: FeedbackDraft = emptyDraft();
export const getDraft = (): FeedbackDraft => draft;
export const saveDraft = (patch: Partial<FeedbackDraft>) => {
  draft = { ...draft, ...patch };
};
export const clearDraft = () => {
  draft = emptyDraft();
};

/** Message length rule shared with the server: 10–4000 code points after trimming. */
export function messageValid(message: string): boolean {
  const n = [...message.trim()].length;
  return n >= LIMITS.feedback.message.min && n <= LIMITS.feedback.message.max;
}

// ----- context collector -----

/** The server's caps on context strings (server/lib/input.ts feedbackContext). */
const CAP = {
  path: 300,
  title: 200,
  lessonCode: 50,
  appVersion: 50,
  userAgent: 400,
  browser: 100,
  viewport: 30,
  locale: 20,
  theme: 20,
  errorMessage: 500,
  errorCode: 100,
  apiPath: 300,
  stack: 4096,
} as const;

/** At most `max` UTF-16 units (what zod's `.max` counts), never cutting a surrogate pair in half. */
function cap(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = s.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}
const capOpt = (s: string | undefined, max: number) => (s === undefined ? undefined : cap(s, max));

type WinLike = { innerWidth: number; innerHeight: number; matchMedia?: (q: string) => { matches: boolean } };

export interface CollectInput {
  pathname: string;
  locale: string;
  theme: string;
  reader?: { title: string };
  lesson?: { code: string; title: string };
  error?: FeedbackContext["error"];
  nav?: Pick<Navigator, "userAgent">;
  win?: WinLike;
}

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** The automatic context sent with a report, capped to what the server accepts. */
export function collectContext(input: CollectInput): FeedbackContext {
  const nav = input.nav ?? (typeof navigator !== "undefined" ? navigator : { userAgent: "" });
  const win: WinLike | undefined = input.win ?? (typeof window !== "undefined" ? window : undefined);
  const userAgent = nav.userAgent ?? "";
  let standalone = false;
  try {
    standalone = !!win?.matchMedia?.("(display-mode: standalone)").matches;
  } catch {
    standalone = false;
  }

  const ctx: FeedbackContext = {
    path: cap(input.pathname.split(/[?#]/)[0] ?? "", CAP.path),
    appVersion: cap(typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev", CAP.appVersion),
    userAgent: cap(userAgent, CAP.userAgent),
    browser: cap(shortBrowser(userAgent), CAP.browser),
    viewport: cap(win ? `${Math.round(win.innerWidth)}×${Math.round(win.innerHeight)}` : "", CAP.viewport),
    locale: cap(input.locale, CAP.locale),
    theme: cap(input.theme, CAP.theme),
    standalone,
  };
  if (input.reader) ctx.readerTitle = cap(input.reader.title, CAP.title);
  if (input.lesson) {
    ctx.lessonCode = cap(input.lesson.code, CAP.lessonCode);
    ctx.lessonTitle = cap(input.lesson.title, CAP.title);
  }
  if (input.error) {
    const e = input.error;
    const status = Number.isInteger(e.status) && e.status! >= 0 && e.status! <= 999 ? e.status : undefined;
    ctx.error = {
      message: cap(e.message ?? "", CAP.errorMessage),
      ...(status !== undefined && { status }),
      ...(e.code !== undefined && { code: capOpt(e.code, CAP.errorCode) }),
      ...(e.apiPath !== undefined && { apiPath: capOpt(e.apiPath, CAP.apiPath) }),
      ...(e.stack !== undefined && { stack: capOpt(e.stack, CAP.stack) }),
    };
  }
  return fitContext(ctx);
}

/**
 * Keep the JSON within the server's 8 KB: trim the stack first, then the other long
 * free-text fields. One UTF-16 unit is at most 6 bytes of JSON (an escaped control
 * character), so cutting `over / 6` units per round never cuts more than needed.
 */
function fitContext(ctx: FeedbackContext): FeedbackContext {
  const max = LIMITS.feedback.contextBytes;
  const trimmable: { get: () => string | undefined; set: (v: string | undefined) => void }[] = [
    { get: () => ctx.error?.stack, set: (v) => void (ctx.error!.stack = v) },
    { get: () => ctx.error?.message, set: (v) => void (ctx.error!.message = v ?? "") },
    { get: () => ctx.userAgent, set: (v) => void (ctx.userAgent = v ?? "") },
    { get: () => ctx.error?.apiPath, set: (v) => void (ctx.error!.apiPath = v) },
    { get: () => ctx.lessonTitle, set: (v) => void (ctx.lessonTitle = v) },
    { get: () => ctx.readerTitle, set: (v) => void (ctx.readerTitle = v) },
  ];
  for (const field of trimmable) {
    let over = bytes(ctx) - max;
    while (over > 0) {
      const v = field.get();
      if (!v) break;
      field.set(cap(v, Math.max(0, v.length - Math.ceil(over / 6))));
      over = bytes(ctx) - max;
    }
    if (over <= 0) break;
  }
  if (ctx.error && ctx.error.stack === "") delete ctx.error.stack;
  return ctx;
}

// ----- screenshot -----

export const SCREENSHOT_MAX_SIDE = 1600;

/** Size that fits `max` on the long side, keeping the aspect ratio; never scales up. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const k = max / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

async function decode(file: Blob): Promise<{ img: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    return { img: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));

/**
 * Shrink a picked image to at most 1600 px on the long side and re-encode it as WebP
 * (JPEG where the browser can't encode WebP). Re-encoding also drops EXIF (location).
 * Throws `Error("BAD_IMAGE")` when the file isn't an image the browser can read.
 */
export async function prepareScreenshot(file: File): Promise<Blob> {
  let decoded: Awaited<ReturnType<typeof decode>>;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error("BAD_IMAGE");
  }
  try {
    const { width, height } = fitWithin(decoded.width, decoded.height, SCREENSHOT_MAX_SIDE);
    if (!width || !height) throw new Error("BAD_IMAGE");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("BAD_IMAGE");
    ctx.drawImage(decoded.img, 0, 0, width, height);
    const webp = await toBlob(canvas, "image/webp");
    if (webp && webp.type === "image/webp") return webp;
    // JPEG has no transparency: put white behind the picture instead of black.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    const jpeg = await toBlob(canvas, "image/jpeg");
    if (!jpeg) throw new Error("BAD_IMAGE");
    return jpeg;
  } finally {
    decoded.done();
  }
}
