import { and, count, eq, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db";
import type { BadgeId } from "../../shared/badges";
import type { QuestId } from "../../shared/quests";
import { dayKey, previousDay } from "./time";

export { dayKey, startOfDay, startOfWeek } from "./time";
export { grantBadge } from "./badges";

export interface XpResult {
  xp: number;
  gained: number;
  streak: number;
  newBadges: BadgeId[];
  /** Daily quests completed by this action. */
  quests?: QuestId[];
}

/** What the XP badges (streak, comeback, weekend, ...) need to know about an award. */
export interface XpBadgeContext {
  /** user_stats.lastActiveDay before this award. */
  prevActiveDay: string | null;
  /** The streak after this award. */
  streak: number;
}

/**
 * Award XP and update the daily streak, without checking badges: the caller passes
 * `badgeCtx` to one `checkBadges(userId, ["xp", ...])` for the whole action, so the earned
 * set is read once.
 */
export async function awardXpOnly(userId: string, amount: number, reason: string): Promise<XpResult & { badgeCtx: XpBadgeContext }> {
  amount = Math.max(0, Math.round(amount));
  const today = dayKey();

  const stats =
    (await db.query.userStats.findFirst({ where: eq(schema.userStats.userId, userId) })) ??
    (await db.insert(schema.userStats).values({ userId }).returning())[0]!;

  let streak = stats.streak;
  if (stats.lastActiveDay !== today) {
    streak = stats.lastActiveDay === previousDay(today) ? streak + 1 : 1;
  }
  const xp = stats.xp + amount;
  await db
    .update(schema.userStats)
    .set({ xp, streak, longestStreak: Math.max(stats.longestStreak, streak), lastActiveDay: today })
    .where(eq(schema.userStats.userId, userId));

  if (amount > 0) await db.insert(schema.xpEvent).values({ id: nanoid(), userId, amount, reason });

  return { xp, gained: amount, streak, newBadges: [], badgeCtx: { prevActiveDay: stats.lastActiveDay, streak } };
}

export async function getOrCreateProgress(userId: string, lessonId: string) {
  const existing = await db.query.lessonProgress.findFirst({
    where: and(eq(schema.lessonProgress.userId, userId), eq(schema.lessonProgress.lessonId, lessonId)),
  });
  if (existing) return existing;
  return (await db.insert(schema.lessonProgress).values({ userId, lessonId }).returning())[0]!;
}

export async function updateProgress(
  userId: string,
  lessonId: string,
  patch: { summaryRead?: boolean; quiz?: number; explain?: number },
) {
  const p = await getOrCreateProgress(userId, lessonId);
  await db
    .update(schema.lessonProgress)
    .set({
      summaryRead: patch.summaryRead ?? p.summaryRead,
      bestQuiz: Math.max(p.bestQuiz, patch.quiz ?? 0),
      bestExplain: Math.max(p.bestExplain, patch.explain ?? 0),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.lessonProgress.userId, userId), eq(schema.lessonProgress.lessonId, lessonId)));
}

/** Per lesson card mastery: cards in FSRS "Review" state count fully, cards still in (re)learning count half. */
export async function cardMasteryByLesson(userId: string) {
  const rows = await db
    .select({
      lessonId: schema.flashcard.lessonId,
      total: count(schema.flashcard.id),
      learned: sql<number>`sum(case when ${schema.cardReview.state} = 2 then 1.0 when ${schema.cardReview.state} in (1, 3) then 0.5 else 0 end)`,
    })
    .from(schema.flashcard)
    .leftJoin(
      schema.cardReview,
      and(eq(schema.cardReview.flashcardId, schema.flashcard.id), eq(schema.cardReview.userId, userId)),
    )
    .groupBy(schema.flashcard.lessonId);
  return new Map(rows.map((r) => [r.lessonId, r.total ? Number(r.learned ?? 0) / r.total : 0]));
}

export async function xpSince(userId: string, since: Date) {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.xpEvent.amount}), 0)` })
    .from(schema.xpEvent)
    .where(and(eq(schema.xpEvent.userId, userId), gte(schema.xpEvent.createdAt, since)));
  return Number(r?.n ?? 0);
}
