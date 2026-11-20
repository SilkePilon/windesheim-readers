/**
 * Which failures are worth a "Melden" button, and what to pre-fill in the report.
 * Pure (no i18n, no UI) so bun can test it.
 */
import { ApiError } from "./api";
import type { FeedbackSeed } from "./feedback";

/** Real failures: server errors (5xx) and network errors. Never the user's own input or limits (4xx, 429). */
export function isReportable(e: unknown): boolean {
  if (e instanceof ApiError) return e.status >= 500;
  return e instanceof TypeError;
}

/** A machine code like `INTERNAL_ERROR`; anything else may be raw server text (SQLite errors and the like). */
const SAFE_CODE = /^[A-Z0-9_]+$/;

/**
 * A bug report seed for `e`: message, plus status/code/path for API errors. No stack (the
 * collector caps it anyway). The report can end up in a public GitHub issue, so a 5xx gets a
 * generic message and keeps its code only when it is a plain machine code, and a network
 * failure says just that (never the browser's own text).
 */
export function errorSeed(e: unknown, apiPath?: string): FeedbackSeed {
  const path = apiPath ? { apiPath } : {};
  if (e instanceof ApiError) {
    if (e.status >= 500) {
      const code = SAFE_CODE.test(e.code) ? { code: e.code } : {};
      return { type: "bug", error: { message: `Server error ${e.status}`, status: e.status, ...code, ...path } };
    }
    return { type: "bug", error: { message: e.code, status: e.status, code: e.code, ...path } };
  }
  if (e instanceof TypeError) return { type: "bug", error: { message: "Network error", ...path } };
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return { type: "bug", error: { message: message || "Unknown error", ...path } };
}
