// Feedback sheet, client side: the open/seed store, the context collector and the image size math.
import { afterEach, describe, expect, test } from "bun:test";
import { LIMITS } from "@shared/limits";
import {
  clearDraft,
  closeFeedback,
  getDraft,
  openDraft,
  resetFeedback,
  saveDraft,
  getFeedbackState,
  messageValid,
  openFeedback,
} from "../src/lib/feedback";
import { collectContext, fitWithin, resizeOptions } from "../src/lib/feedback-collect";

const win = (standalone = false) => ({
  innerWidth: 390,
  innerHeight: 844,
  matchMedia: (q: string) => ({ matches: standalone && q === "(display-mode: standalone)" }),
});
const nav = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" };
const base = { pathname: "/lesson/abc", locale: "nl", theme: "dark", nav, win: win() };

describe("collectContext", () => {
  test("path, app version, browser, viewport, locale and theme", () => {
    const c = collectContext(base);
    expect(c.path).toBe("/lesson/abc");
    expect(c.appVersion).toBe("test");
    expect(c.browser).toBe("Safari 18 · iOS");
    expect(c.userAgent).toBe(nav.userAgent);
    expect(c.viewport).toBe("390×844");
    expect(c.locale).toBe("nl");
    expect(c.theme).toBe("dark");
    expect(c.standalone).toBe(false);
    expect(c.error).toBeUndefined();
  });

  test("the path never includes a query or hash", () => {
    expect(collectContext({ ...base, pathname: "/lesson/abc?view=listen#x" }).path).toBe("/lesson/abc");
  });

  test("standalone when the display-mode media query matches", () => {
    expect(collectContext({ ...base, win: win(true) }).standalone).toBe(true);
  });

  test("reader and lesson titles are included when known", () => {
    const c = collectContext({ ...base, reader: { title: "Reader A" }, lesson: { code: "1.2", title: "Lesson B" } });
    expect(c).toMatchObject({ readerTitle: "Reader A", lessonCode: "1.2", lessonTitle: "Lesson B" });
  });

  test("strings are capped to the server limits", () => {
    const c = collectContext({
      ...base,
      pathname: "/" + "p".repeat(1000),
      locale: "x".repeat(50),
      theme: "y".repeat(50),
      nav: { userAgent: "u".repeat(1000) },
      reader: { title: "r".repeat(500) },
      lesson: { code: "c".repeat(100), title: "l".repeat(500) },
      error: { message: "m".repeat(2000), code: "C".repeat(500), apiPath: "/a".repeat(500), status: 500, stack: "s".repeat(10 * 1024) },
    });
    expect(c.path.length).toBe(300);
    expect(c.userAgent.length).toBe(400);
    expect(c.locale.length).toBe(20);
    expect(c.theme.length).toBe(20);
    expect(c.readerTitle!.length).toBe(200);
    expect(c.lessonCode!.length).toBe(50);
    expect(c.lessonTitle!.length).toBe(200);
    expect(c.error!.message.length).toBe(500);
    expect(c.error!.code!.length).toBe(100);
    expect(c.error!.apiPath!.length).toBe(300);
    expect(c.error!.stack!.length).toBe(4096);
    expect(c.error!.status).toBe(500);
  });

  test("a cut never leaves half a surrogate pair", () => {
    const c = collectContext({ ...base, reader: { title: "a" + "😀".repeat(150) } });
    expect(c.readerTitle!.length).toBeLessThanOrEqual(200);
    expect(c.readerTitle!.endsWith("😀")).toBe(true);
  });

  test("an out-of-range or fractional status is dropped", () => {
    expect(collectContext({ ...base, error: { message: "x", status: 1200 } }).error!.status).toBeUndefined();
    expect(collectContext({ ...base, error: { message: "x", status: 4.5 } }).error!.status).toBeUndefined();
    expect(collectContext({ ...base, error: { message: "x", status: 0 } }).error!.status).toBe(0);
  });

  test("the whole context stays within 8 KB by trimming the stack", () => {
    const c = collectContext({
      ...base,
      pathname: "/" + "é".repeat(299),
      nav: { userAgent: "€".repeat(400) },
      reader: { title: "€".repeat(200) },
      lesson: { code: "€".repeat(50), title: "€".repeat(200) },
      error: { message: "€".repeat(500), apiPath: "€".repeat(300), stack: "€".repeat(4096) },
    });
    const bytes = new TextEncoder().encode(JSON.stringify(c)).length;
    expect(bytes).toBeLessThanOrEqual(LIMITS.feedback.contextBytes);
    expect(c.error!.stack!.length).toBeGreaterThan(0);
    expect(c.error!.stack!.length).toBeLessThan(4096);
  });

  test("still fits when escaped control characters fill every field", () => {
    const ctl = (n: number) => "\u0001".repeat(n);
    const c = collectContext({
      ...base,
      pathname: "/" + ctl(299),
      nav: { userAgent: ctl(400) },
      reader: { title: ctl(200) },
      lesson: { code: ctl(50), title: ctl(200) },
      error: { message: ctl(500), apiPath: ctl(300), code: ctl(100), stack: ctl(4096) },
    });
    expect(new TextEncoder().encode(JSON.stringify(c)).length).toBeLessThanOrEqual(LIMITS.feedback.contextBytes);
  });

  test("works without navigator or window", () => {
    const c = collectContext({ pathname: "/", locale: "en", theme: "system", nav: { userAgent: "" }, win: { innerWidth: 0, innerHeight: 0 } });
    expect(c.browser).toBe("Onbekend");
    expect(c.standalone).toBe(false);
  });
});

describe("feedback store", () => {
  afterEach(() => closeFeedback());

  test("openFeedback opens with the seed; closeFeedback closes", () => {
    expect(getFeedbackState().open).toBe(false);
    openFeedback({ type: "bug" });
    expect(getFeedbackState()).toEqual({ open: true, seed: { type: "bug" } });
    closeFeedback();
    expect(getFeedbackState().open).toBe(false);
  });

  test("openFeedback without a seed has a null seed", () => {
    openFeedback();
    expect(getFeedbackState()).toEqual({ open: true, seed: null });
  });

  test("the snapshot is stable between changes (useSyncExternalStore)", () => {
    openFeedback({ type: "idea" });
    expect(getFeedbackState()).toBe(getFeedbackState());
  });
});

describe("messageValid", () => {
  test("10 to 4000 code points after trimming", () => {
    expect(messageValid("   short   ")).toBe(false);
    expect(messageValid("0123456789")).toBe(true);
    expect(messageValid("😀".repeat(10))).toBe(true);
    expect(messageValid("x".repeat(4001))).toBe(false);
  });
});

describe("session draft", () => {
  afterEach(() => clearDraft());
  const shot = new Blob(["x"], { type: "image/webp" });

  test("starts empty with type feedback", () => {
    expect(getDraft("a")).toEqual({ type: "feedback", message: "", screenshot: null });
  });

  test("saveDraft keeps changes for the same user", () => {
    saveDraft("a", { message: "hallo daar" });
    saveDraft("a", { type: "idea", screenshot: shot });
    expect(getDraft("a")).toEqual({ type: "idea", message: "hallo daar", screenshot: shot });
  });

  test("a draft saved for user a is gone when read for user b", () => {
    saveDraft("a", { message: "geheim bericht van a", screenshot: shot });
    expect(getDraft("b")).toEqual({ type: "feedback", message: "", screenshot: null });
    // ... and dropped, not just hidden: a is not given it back either.
    expect(getDraft("a").message).toBe("");
  });

  test("saving for another user never merges into the old user's draft", () => {
    saveDraft("a", { message: "van a", screenshot: shot });
    saveDraft("b", { type: "bug" });
    expect(getDraft("b")).toEqual({ type: "bug", message: "", screenshot: null });
  });

  test("clearDraft empties it", () => {
    saveDraft("a", { message: "iets", screenshot: shot });
    clearDraft();
    expect(getDraft("a")).toEqual({ type: "feedback", message: "", screenshot: null });
  });

  test("openDraft: a seed type overrides the draft's type and is kept", () => {
    saveDraft("a", { type: "idea", message: "half bericht" });
    expect(openDraft("a", { type: "bug" })).toEqual({ type: "bug", message: "half bericht", screenshot: null });
    expect(getDraft("a").type).toBe("bug");
  });

  test("openDraft without a seed type keeps the draft's type", () => {
    saveDraft("a", { type: "idea" });
    expect(openDraft("a", null).type).toBe("idea");
    expect(openDraft("a", { error: { message: "x" } }).type).toBe("idea");
  });

  test("resetFeedback (sign-out) clears the draft and closes the sheet", () => {
    saveDraft("a", { message: "iets" });
    openFeedback({ type: "bug" });
    resetFeedback();
    expect(getFeedbackState().open).toBe(false);
    expect(getDraft("a").message).toBe("");
  });
});

describe("resizeOptions", () => {
  test("null when the image already fits", () => {
    expect(resizeOptions(1600, 900, 1600)).toBeNull();
  });
  test("only the long side is given, so the decoder keeps the aspect ratio", () => {
    expect(resizeOptions(8000, 6000, 1600)).toEqual({ resizeWidth: 1600, resizeQuality: "high" });
    expect(resizeOptions(6000, 8000, 1600)).toEqual({ resizeHeight: 1600, resizeQuality: "high" });
  });
});

describe("fitWithin", () => {
  test("keeps small images as they are", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  test("scales the long side down to the max", () => {
    expect(fitWithin(3200, 1800, 1600)).toEqual({ width: 1600, height: 900 });
    expect(fitWithin(1170, 2532, 1600)).toEqual({ width: 739, height: 1600 });
  });
});

describe("feedback error codes", () => {
  test("BAD_IMAGE and FILE_TOO_LARGE have their own nl and en text", async () => {
    const i18next = (await import("i18next")).default;
    const { ApiError } = await import("../src/lib/api");
    const { errorText } = await import("../src/lib/error-text");
    const nl = (await import("../src/locales/nl")).default;
    const en = (await import("../src/locales/en")).default;
    const i18n = i18next.createInstance();
    await i18n.init({ resources: { nl: { translation: nl }, en: { translation: en } }, lng: "nl" });
    for (const lng of ["nl", "en"] as const) {
      const t = i18n.getFixedT(lng);
      for (const code of ["BAD_IMAGE", "FILE_TOO_LARGE"]) {
        const text = errorText(new ApiError(400, code), t);
        expect(text).toBe((lng === "nl" ? nl : en).errors[code]!);
        // The client-side throw (prepareScreenshot) reads the same.
        expect(errorText(new Error(code), t)).toBe(text);
      }
    }
  });
});
