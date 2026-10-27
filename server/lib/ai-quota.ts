import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { dayKey } from "./time";

/**
 * Daily limits on the student AI features (tutor chat, explain-it-back grading, open-question
 * grading), persisted in `ai_usage` so a restart doesn't reset them. The limits are admin
 * settings (`setting` row "limits"); 0 means unlimited and admins are exempt. The day is the
 * Amsterdam calendar day.
 */
export const AI_FEATURES = ["tutor", "explain", "grade"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_DAILY_DEFAULTS: Record<AiFeature, number> = { tutor: 30, explain: 20, grade: 30 };
export const AI_DAILY_LIMIT_MAX = 1000;

/** Setting names, e.g. `tutorDailyLimit`. */
export const settingName = (f: AiFeature) => `${f}DailyLimit` as const;
export type AiLimitSettings = { [F in AiFeature as `${F}DailyLimit`]: number };

const LIMITS_KEY = "limits";
type Stored = Partial<Record<string, unknown>>;

function loadStored(tx: Pick<typeof db, "select"> = db): Stored {
  const row = tx.select({ value: schema.setting.value }).from(schema.setting).where(eq(schema.setting.key, LIMITS_KEY)).get();
  try {
    return row ? (JSON.parse(row.value) as Stored) : {};
  } catch {
    return {};
  }
}

function limitIn(s: Stored, f: AiFeature): number {
  const v = s[settingName(f)];
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : AI_DAILY_DEFAULTS[f];
}

export function getAiDailyLimit(f: AiFeature): number {
  return limitIn(loadStored(), f);
}

export function getAiLimitSettings(): AiLimitSettings {
  const s = loadStored();
  return Object.fromEntries(AI_FEATURES.map((f) => [settingName(f), limitIn(s, f)])) as AiLimitSettings;
}

export function setAiDailyLimits(limits: Partial<Record<AiFeature, number>>) {
  const s = loadStored();
  for (const f of AI_FEATURES) if (limits[f] !== undefined) s[settingName(f)] = limits[f];
  const value = JSON.stringify(s);
  db.insert(schema.setting)
    .values({ key: LIMITS_KEY, value })
    .onConflictDoUpdate({ target: schema.setting.key, set: { value, updatedAt: new Date() } })
    .run();
}

/** Next Amsterdam midnight after `now` (correct on DST days: Amsterdam is UTC+1 or UTC+2). */
export function nextMidnight(now = new Date()): Date {
  const today = dayKey(now);
  // 30 h after today's UTC midnight is always on the next Amsterdam day.
  const next = dayKey(new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 3600e3));
  for (const offsetH of [2, 1]) {
    const t = Date.parse(`${next}T00:00:00Z`) - offsetH * 3600e3;
    if (dayKey(new Date(t)) === next && dayKey(new Date(t - 1)) !== next) return new Date(t);
  }
  throw new Error(`no Amsterdam midnight found after ${now.toISOString()}`);
}

export const secondsUntilMidnight = (now = new Date()) => Math.max(1, Math.ceil((nextMidnight(now).getTime() - now.getTime()) / 1000));

type Who = { id: string; role?: string | null };

export type AiQuota = { limit: number; used: number; remaining: number };

const t = schema.aiUsage;
const usageOf = (userId: string, day: string, f: AiFeature) => and(eq(t.userId, userId), eq(t.day, day), eq(t.kind, f));

/** Today's quota for one feature; null when unlimited or for admins. */
export function aiQuota(user: Who, f: AiFeature, now = new Date()): AiQuota | null {
  if (user.role === "admin") return null;
  const limit = getAiDailyLimit(f);
  if (limit === 0) return null;
  const used = db.select({ count: t.count }).from(t).where(usageOf(user.id, dayKey(now), f)).get()?.count ?? 0;
  return { limit, used, remaining: Math.max(0, limit - used) };
}

/** Today's quota for every feature (`GET /me/ai-quota`). */
export function aiQuotas(user: Who, now = new Date()): Record<AiFeature, AiQuota | null> {
  return Object.fromEntries(AI_FEATURES.map((f) => [f, aiQuota(user, f, now)])) as Record<AiFeature, AiQuota | null>;
}

export type ConsumeResult =
  | { ok: true; quota: AiQuota | null; refund: () => void }
  | { ok: false; feature: AiFeature; limit: number; retryAfter: number };

const noop = () => {};

/**
 * Counts one use of `f`, or refuses when today's limit is reached. One synchronous
 * transaction, and the increment itself is a single conditional upsert, so concurrent
 * requests can never push the count past the limit. `refund()` gives the use back (on the
 * day it was counted) when the model call fails; calling it more than once is harmless.
 */
export function consumeAi(user: Who, f: AiFeature, now = new Date()): ConsumeResult {
  if (user.role === "admin") return { ok: true, quota: null, refund: noop };
  const day = dayKey(now);
  return db.transaction(
    (tx) => {
      const limit = limitIn(loadStored(tx), f);
      const row = tx
        .insert(t)
        .values({ userId: user.id, day, kind: f, count: 1 })
        .onConflictDoUpdate({
          target: [t.userId, t.day, t.kind],
          set: { count: sql`${t.count} + 1` },
          // 0 = unlimited: still counted (handy for stats), never refused.
          setWhere: limit > 0 ? sql`${t.count} < ${limit}` : undefined,
        })
        .returning({ count: t.count })
        .get();
      if (limit > 0 && (!row || row.count > limit)) {
        return { ok: false, feature: f, limit, retryAfter: secondsUntilMidnight(now) } as const;
      }
      let refunded = false;
      const refund = () => {
        if (refunded) return;
        refunded = true;
        db.update(t)
          .set({ count: sql`${t.count} - 1` })
          .where(and(usageOf(user.id, day, f), gt(t.count, 0)))
          .run();
      };
      const used = row!.count;
      const quota = limit === 0 ? null : { limit, used, remaining: Math.max(0, limit - used) };
      return { ok: true, quota, refund } as const;
    },
    { behavior: "immediate" },
  );
}

/** The 429 body for a refused use. */
export const dailyLimitBody = (r: Extract<ConsumeResult, { ok: false }>) => ({
  error: "AI_DAILY_LIMIT" as const,
  feature: r.feature,
  limit: r.limit,
  retryAfter: r.retryAfter,
});
