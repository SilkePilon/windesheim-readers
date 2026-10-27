import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { dayKey } from "./time";

/**
 * Daily limit on AI tutor messages per student, persisted in `ai_usage` so a restart doesn't
 * reset it. The limit is an admin setting (`setting` row "limits"); 0 means unlimited and
 * admins are exempt. The day is the Amsterdam calendar day.
 */
export const TUTOR_DAILY_LIMIT_DEFAULT = 30;
export const TUTOR_DAILY_LIMIT_MAX = 1000;
const LIMITS_KEY = "limits";

interface StoredLimits {
  tutorDailyLimit?: number;
}

function loadLimits(tx: Pick<typeof db, "select"> = db): StoredLimits {
  const row = tx.select({ value: schema.setting.value }).from(schema.setting).where(eq(schema.setting.key, LIMITS_KEY)).get();
  try {
    return row ? (JSON.parse(row.value) as StoredLimits) : {};
  } catch {
    return {};
  }
}

const limitOf = (s: StoredLimits) =>
  Number.isInteger(s.tutorDailyLimit) && s.tutorDailyLimit! >= 0 ? s.tutorDailyLimit! : TUTOR_DAILY_LIMIT_DEFAULT;

export function getTutorDailyLimit(): number {
  return limitOf(loadLimits());
}

export function setTutorDailyLimit(limit: number) {
  const value = JSON.stringify({ ...loadLimits(), tutorDailyLimit: limit });
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

export type TutorQuota = { limit: number; used: number; remaining: number };

/** Today's quota for a student; null when unlimited or for admins. */
export function tutorQuota(user: Who, now = new Date()): TutorQuota | null {
  if (user.role === "admin") return null;
  const limit = getTutorDailyLimit();
  if (limit === 0) return null;
  const t = schema.aiUsage;
  const row = db
    .select({ count: t.count })
    .from(t)
    .where(and(eq(t.userId, user.id), eq(t.day, dayKey(now)), eq(t.kind, "tutor")))
    .get();
  const used = row?.count ?? 0;
  return { limit, used, remaining: Math.max(0, limit - used) };
}

export type ConsumeResult =
  | { ok: true; quota: TutorQuota | null }
  | { ok: false; limit: number; retryAfter: number };

/**
 * Counts one tutor message, or refuses when today's limit is reached. One synchronous
 * transaction, and the increment itself is a single conditional upsert, so concurrent
 * requests can never push the count past the limit.
 */
export function consumeTutorMessage(user: Who, now = new Date()): ConsumeResult {
  if (user.role === "admin") return { ok: true, quota: null };
  const day = dayKey(now);
  const t = schema.aiUsage;
  return db.transaction(
    (tx) => {
      const limit = limitOf(loadLimits(tx));
      const row = tx
        .insert(t)
        .values({ userId: user.id, day, kind: "tutor", count: 1 })
        .onConflictDoUpdate({
          target: [t.userId, t.day, t.kind],
          set: { count: sql`${t.count} + 1` },
          // 0 = unlimited: still counted (handy for stats), never refused.
          setWhere: limit > 0 ? sql`${t.count} < ${limit}` : undefined,
        })
        .returning({ count: t.count })
        .get();
      if (limit > 0 && (!row || row.count > limit)) {
        return { ok: false, limit, retryAfter: secondsUntilMidnight(now) } as const;
      }
      if (limit === 0) return { ok: true, quota: null } as const;
      const used = row!.count;
      return { ok: true, quota: { limit, used, remaining: Math.max(0, limit - used) } } as const;
    },
    { behavior: "immediate" },
  );
}
