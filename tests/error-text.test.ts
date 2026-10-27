import { describe, expect, test } from "bun:test";
import i18next, { type TFunction } from "i18next";
import { ApiError, parseRetryAfter } from "../src/lib/api";
import { errorText, formatWait, rateLimitText } from "../src/lib/error-text";
import nl from "../src/locales/nl";
import en from "../src/locales/en";

const t = ((k: string) => `t:${k}`) as unknown as TFunction;

test("errorText never shows raw codes", () => {
  expect(errorText(new ApiError(409, "ALREADY_RUNNING"), t)).toBe("t:errors.ALREADY_RUNNING");
  expect(errorText(new ApiError(500, "HTTP_500"), t)).toBe("t:common.error");
  expect(errorText(new ApiError(500, "INTERNAL_ERROR"), t)).toBe("t:common.error");
  expect(errorText(new TypeError("Failed to fetch"), t)).toBe("t:common.error");
  expect(errorText(undefined, t)).toBe("t:common.error");
  expect(errorText(new ApiError(400, "INVALID_VOICE", { message: "Unknown voice" }), t)).toBe("Unknown voice");
  expect(errorText(new Error("Gemini quota exceeded"), t)).toBe("Gemini quota exceeded");
});

describe("rate limits (429)", async () => {
  const i18n = i18next.createInstance();
  await i18n.init({ resources: { nl: { translation: nl }, en: { translation: en } }, lng: "nl", fallbackLng: "nl" });
  const nlT = i18n.getFixedT("nl");
  const enT = i18n.getFixedT("en");

  test("formatWait picks seconds, minutes or hours", () => {
    expect(formatWait(1, nlT)).toBe("1 seconde");
    expect(formatWait(45, nlT)).toBe("45 seconden");
    expect(formatWait(60, nlT)).toBe("1 minuut");
    expect(formatWait(61, nlT)).toBe("2 minuten");
    expect(formatWait(14 * 60 + 30, enT)).toBe("15 minutes");
    expect(formatWait(20 * 3600, enT)).toBe("20 hours");
  });

  test("errorText shows the wait for RATE_LIMITED", () => {
    const e = new ApiError(429, "RATE_LIMITED", { error: "RATE_LIMITED", retryAfter: 42 }, 42);
    expect(errorText(e, nlT)).toBe("Te veel aanvragen. Probeer het over 42 seconden opnieuw.");
    expect(errorText(e, enT)).toBe("Too many requests. Try again in 42 seconds.");
    // better-auth's own limiter: a 429 without our body.
    expect(errorText(new ApiError(429, "RATE_LIMITED", { message: "Too many requests." }), nlT)).toBe(nl.errors.RATE_LIMITED_SOON!);
  });

  test("rateLimitText reads the AI SDK chat error (JSON body as message) and ignores other errors", () => {
    const chat = Object.assign(new Error(JSON.stringify({ error: "RATE_LIMITED", retryAfter: 240 })), { statusCode: 429 });
    expect(rateLimitText(chat, nlT)).toBe("Te veel aanvragen. Probeer het over 4 minuten opnieuw.");
    expect(rateLimitText(new Error("boom"), nlT)).toBeNull();
    expect(rateLimitText(new ApiError(500, "HTTP_500"), nlT)).toBeNull();
    expect(rateLimitText(undefined, nlT)).toBeNull();
  });

  test("parseRetryAfter: body first, then the header", () => {
    expect(parseRetryAfter({ retryAfter: 12 }, "99")).toBe(12);
    expect(parseRetryAfter({}, "99")).toBe(99);
    expect(parseRetryAfter({}, null)).toBeUndefined();
    expect(parseRetryAfter({ retryAfter: "x" })).toBeUndefined();
  });
});
