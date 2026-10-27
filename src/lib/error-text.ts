import type { TFunction } from "i18next";
import { ApiError } from "./api";

/** Server error codes with their own wording (`errors.<CODE>` in the locales). */
const KNOWN = ["ALREADY_RUNNING", "LESSON_NOT_READY", "AUDIO_NOT_READY", "NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN"] as const;

/**
 * Readable text for a failed request: known codes get localized text; other bare codes
 * (`HTTP_500`, `INTERNAL_ERROR`) and network failures fall back to "Er ging iets mis".
 * A human-readable server message (e.g. a provider error for admins) is shown as-is.
 */
export function errorText(e: unknown, t: TFunction) {
  const code = e instanceof ApiError ? e.code : e instanceof Error ? e.message : "";
  if ((KNOWN as readonly string[]).includes(code)) return t(`errors.${code}`);
  if (e instanceof ApiError && typeof e.data.message === "string" && e.data.message.trim()) return e.data.message;
  if (!code || /^[A-Z0-9_]+$/.test(code) || e instanceof TypeError) return t("common.error");
  return code;
}
