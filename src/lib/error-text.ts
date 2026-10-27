import type { TFunction } from "i18next";
import { ApiError, parseRetryAfter } from "./api";

/** Server error codes with their own wording (`errors.<CODE>` in the locales). */
const KNOWN = ["ALREADY_RUNNING", "LESSON_NOT_READY", "AUDIO_NOT_READY", "NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN", "VALIDATION", "PAYLOAD_TOO_LARGE"] as const;
/** Input refused by the server: invalid (400) or too large (413). */
const INPUT_ERRORS = ["VALIDATION", "PAYLOAD_TOO_LARGE"] as const;

/**
 * Readable text for a failed request: known codes get localized text; other bare codes
 * (`HTTP_500`, `INTERNAL_ERROR`) and network failures fall back to "Er ging iets mis".
 * A human-readable server message (e.g. a provider error for admins) is shown as-is.
 */
export function errorText(e: unknown, t: TFunction) {
  const limited = rateLimitText(e, t);
  if (limited) return limited;
  const code = e instanceof ApiError ? e.code : e instanceof Error ? e.message : "";
  if ((KNOWN as readonly string[]).includes(code)) return t(`errors.${code}`);
  if (e instanceof ApiError && typeof e.data.message === "string" && e.data.message.trim()) return e.data.message;
  if (!code || /^[A-Z0-9_]+$/.test(code) || e instanceof TypeError) return t("common.error");
  return code;
}

/** "45 seconden", "3 minuten", "2 uur": a wait rounded up to a unit a person reads easily. */
export function formatWait(seconds: number, t: TFunction) {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return t("common.wait.seconds", { count: s });
  const m = Math.ceil(s / 60);
  if (m < 90) return t("common.wait.minutes", { count: m });
  return t("common.wait.hours", { count: Math.ceil(m / 60) });
}

/**
 * Wait time of a rate-limited request (HTTP 429 / `RATE_LIMITED`), or null when `e` isn't one.
 * Also reads errors whose message is the raw JSON body (the AI SDK chat transport does that).
 */
export function rateLimitInfo(e: unknown): { retryAfter?: number } | null {
  if (e instanceof ApiError) {
    if (e.status !== 429 && e.code !== "RATE_LIMITED") return null;
    return { retryAfter: e.retryAfter ?? parseRetryAfter(e.data) };
  }
  if (e instanceof Error) {
    const body = parseJson(e.message);
    const status = (e as { statusCode?: unknown }).statusCode;
    if (body?.error === "RATE_LIMITED" || status === 429 || e.message.trim() === "RATE_LIMITED") {
      return { retryAfter: parseRetryAfter(body) };
    }
  }
  return null;
}

/**
 * Friendly text when the server refused the input itself (400 VALIDATION, 413 PAYLOAD_TOO_LARGE),
 * else null. Also reads errors whose message is the raw JSON body (the AI SDK chat transport).
 */
export function inputErrorText(e: unknown, t: TFunction): string | null {
  let code = "";
  if (e instanceof ApiError) code = e.status === 413 ? "PAYLOAD_TOO_LARGE" : e.code;
  else if (e instanceof Error) {
    const body = parseJson(e.message);
    code = typeof body?.error === "string" ? body.error : e.message.trim();
  }
  return (INPUT_ERRORS as readonly string[]).includes(code) ? t(`errors.${code}`) : null;
}

/** The text for a failed request: rate limit, refused input, else `fallback`. */
export const requestErrorText = (e: unknown, t: TFunction, fallback: string) => rateLimitText(e, t) ?? inputErrorText(e, t) ?? fallback;

function parseJson(text: string): { error?: unknown; retryAfter?: unknown } | null {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** Localized "too many requests, try again in …" for a rate-limited request, else null. */
export function rateLimitText(e: unknown, t: TFunction): string | null {
  const info = rateLimitInfo(e);
  if (!info) return null;
  return info.retryAfter ? t("errors.RATE_LIMITED", { time: formatWait(info.retryAfter, t) }) : t("errors.RATE_LIMITED_SOON");
}
