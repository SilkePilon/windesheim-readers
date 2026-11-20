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

/** A bug report seed for `e`: message, plus status/code/path for API errors. No stack (the collector caps it anyway). */
export function errorSeed(e: unknown, apiPath?: string): FeedbackSeed {
  if (e instanceof ApiError) {
    return { type: "bug", error: { message: e.code, status: e.status, code: e.code, ...(apiPath ? { apiPath } : {}) } };
  }
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return { type: "bug", error: { message: message || "Unknown error", ...(apiPath ? { apiPath } : {}) } };
}
