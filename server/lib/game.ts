import { and, count, eq, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db";
import type { BadgeId } from "../../shared/game";

const TZ = "Europe/Amsterdam";

export function dayKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function hourInTz(d = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(d));
}

function previousDay(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function tzOffsetMs(d: Date) {
  return (
    new Date(d.toLocaleString("en-US", { timeZone: TZ })).getTime() -
    new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime()
  );
}

/** Midnight (Amsterdam) of the current day. */
export function startOfDay(d = new Date()) {
  return new Date(new Date(`${dayKey(d)}T00:00:00Z`).getTime() - tzOffsetMs(d));
}

/** Monday 00:00 (Amsterdam) of the current week. */
export function startOfWeek(d = new Date()) {
  const local = new Date(`${dayKey(d)}T00:00:00Z`);
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return new Date(local.getTime() - tzOffsetMs(d));
}

export async function grantBadge(userId: string, badge: BadgeId) {
  const res = await db.insert(schema.userBadge).values({ userId, badge }).onConflictDoNothing().returning();
  return res.length > 0;
}

export interface XpResult {
  xp: number;
  gained: number;
  streak: number;
  newBadges: BadgeId[];
}

/** Award XP, update the daily streak and check streak / time badges. */
export async function awardXp(userId: string, amount: number, reason: string): Promise<XpResult> {
  amount = Math.max(0, Math.round(amount));
  const today = dayKey();
  const newBadges: BadgeId[] = [];

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

  const check = async (cond: boolean, b: BadgeId) => {
    if (cond && (await grantBadge(userId, b))) newBadges.push(b);
  };
  await check(true, "first_steps");
  await check(streak >= 3, "streak_3");
  await check(streak >= 7, "streak_7");
  await check(streak >= 30, "streak_30");
  const h = hourInTz();
  await check(h >= 23 || h < 4, "night_owl");
  await check(h >= 5 && h < 7, "early_bird");

  return { xp, gained: amount, streak, newBadges };
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

export async function totalReviews(userId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(schema.xpEvent)
    .where(and(eq(schema.xpEvent.userId, userId), eq(schema.xpEvent.reason, "card")));
  return r?.n ?? 0;
}

export async function xpSince(userId: string, since: Date) {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.xpEvent.amount}), 0)` })
    .from(schema.xpEvent)
    .where(and(eq(schema.xpEvent.userId, userId), gte(schema.xpEvent.createdAt, since)));
  return Number(r?.n ?? 0);
}
