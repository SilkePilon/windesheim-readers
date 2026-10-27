import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { AiFeature, AiQuota, AiQuotas } from "./types";

export const AI_QUOTA_KEY = ["me", "ai-quota"] as const;

/**
 * Today's quota for one AI feature (null: unlimited, or an admin), plus helpers to count a
 * use right away and to reload the server's numbers after a request.
 */
export function useAiQuota(feature: AiFeature) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: AI_QUOTA_KEY, queryFn: () => api.get<AiQuotas>("/me/ai-quota") });
  const quota: AiQuota | null = data?.[feature] ?? null;
  return {
    quota,
    /** Count one use now (optimistic); `refresh` replaces it with the server's count. */
    countUse: () => {
      if (!quota || !data) return;
      qc.setQueryData<AiQuotas>(AI_QUOTA_KEY, { ...data, [feature]: { ...quota, used: quota.used + 1, remaining: Math.max(0, quota.remaining - 1) } });
    },
    refresh: () => void qc.invalidateQueries({ queryKey: AI_QUOTA_KEY }),
  };
}

/**
 * The feature whose daily limit refused a request (429 `AI_DAILY_LIMIT`, or the tutor's older
 * `TUTOR_DAILY_LIMIT`), else null. Also reads errors whose message is the raw JSON body (the
 * AI SDK chat transport).
 */
export function dailyLimitFeature(e: unknown): AiFeature | null {
  let body: Record<string, unknown> | null = null;
  if (e instanceof ApiError) body = { ...e.data, error: e.code };
  else if (e instanceof Error) {
    try {
      const v: unknown = JSON.parse(e.message);
      if (v && typeof v === "object") body = v as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (body?.error === "TUTOR_DAILY_LIMIT") return "tutor";
  if (body?.error !== "AI_DAILY_LIMIT") return null;
  return body.feature === "explain" || body.feature === "grade" || body.feature === "tutor" ? body.feature : null;
}
