import type { TFunction } from "i18next";
import { notify } from "@/lib/notify";
import { errorText } from "@/lib/error-text";
import { openFeedback } from "@/lib/feedback";
import { errorSeed, isReportable } from "@/lib/report-error";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/queries";

/**
 * Error toast for a failed request. Real failures (5xx, network) get a "Melden" action that
 * opens the feedback sheet as a bug with the error attached; only for a logged-in user
 * (the cached `me`), so there is never a dead button. `text` overrides the toast text.
 */
export function notifyError(e: unknown, t: TFunction, text?: string): void {
  const loggedIn = !!queryClient.getQueryData(qk.me);
  const report = loggedIn && isReportable(e);
  notify.error(text ?? errorText(e, t), report ? { action: { label: t("feedback.report"), onClick: () => openFeedback(errorSeed(e)) } } : undefined);
}
