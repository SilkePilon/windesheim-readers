// Badge awarding: `checkBadges` evaluates only the badges an event can affect, the silent
// startup backfill evaluates everything, `badgeOverview` feeds GET /api/me/badges.
import { and, count, countDistinct, eq, gte, inArray, isNotNull, lt, max, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { BADGE_IDS, BADGE_LIST, BADGES, badgeProgress, badgesReached, isBadgeId, type BadgeId, type BadgeMetric } from "../../shared/badges";
import { computeMastery } from "../../shared/game";
import { DONE_MASTERY } from "../../shared/path";
import {
  dayHistoryBadges,
  hasWinStreak,
  isComeback,
  isWeekendPair,
  masteryBadges,
  MASTER_MASTERY,
  timeOfDayBadges,
  weeklyWinners,
  type BadgeEvent,
  type LessonMastery,
} from "./badge-rules";

export { eventsForReason, type BadgeEvent } from "./badge-rules";
import { dayKey, hourInTz, previousDay, startOfPreviousWeek, startOfWeek, weekKey } from "./time";

export interface BadgeContext {
  /** user_stats.lastActiveDay before this XP award. */
  prevActiveDay?: string | null;
  /** The streak after this XP award. */
  streak?: number;
  /** The lesson the action was on: mastery badges then only look at this lesson (see masteryCheck). */
  lessonId?: string;
  /** End-of-battle facts for this player. */
  battle?: { perfect: boolean };
  now?: Date;
}

/** Battle XP reasons: the 1st place of a battle with 3+ players is stored as a win. */
export const BATTLE_REASONS = ["battle", "battle_win"] as const;

const BY_EVENT: Record<BadgeEvent, BadgeId[]> = {
  xp: ["first_steps", "streak_3", "streak_7", "streak_14", "streak_30", "streak_60", "streak_100", "night_owl", "early_bird", "weekend_warrior", "comeback"],
  card: ["cards_50", "cards_100", "cards_500", "cards_1000", "cards_2500"],
  quiz: ["first_quiz", "perfect_quiz", "perfect_quiz_5", "perfect_quiz_25", "quiz_80_10"],
  explain: ["first_explain", "explain_10", "explain_master"],
  open: ["open_10"],
  mastery: [
    "lesson_master", "lesson_master_5", "lesson_master_10", "week_master", "reader_master",
    "world_bos", "world_dorp", "world_stad", "world_haven", "world_jungle", "world_woestijn", "world_bergen", "graduated",
  ],
  quest: ["first_quest", "quests_daily_3", "quests_10", "quests_50"],
  battle: ["first_battle", "battle_winner", "battle_wins_5", "battle_wins_25", "battle_streak_3", "battle_perfect"],
  battle_host: ["battle_host"],
};

export async function earnedBadges(userId: string) {
  return db.select({ id: schema.userBadge.badge, earnedAt: schema.userBadge.earnedAt }).from(schema.userBadge).where(eq(schema.userBadge.userId, userId));
}

/** Insert the badges (idempotent via the unique index); returns the newly granted ones. */
export async function grantBadges(userId: string, ids: BadgeId[]): Promise<BadgeId[]> {
  if (!ids.length) return [];
  const rows = await db
    .insert(schema.userBadge)
    .values([...new Set(ids)].map((badge) => ({ userId, badge })))
    .onConflictDoNothing()
    .returning({ badge: schema.userBadge.badge });
  const got = new Set(rows.map((r) => r.badge));
  return BADGE_IDS.filter((id) => got.has(id));
}

// ---------- metrics (cheap aggregates) ----------

const one = async (q: Promise<{ n: number | null }[]>) => Number((await q)[0]?.n ?? 0);

const xpCount = (userId: string, reasons: readonly string[]) =>
  one(db.select({ n: count() }).from(schema.xpEvent).where(and(eq(schema.xpEvent.userId, userId), inArray(schema.xpEvent.reason, reasons))));

const attemptWhere = (userId: string, kind: "quiz" | "battle") => and(eq(schema.attempt.userId, userId), eq(schema.attempt.kind, kind));

const METRIC: Record<Exclude<BadgeMetric, "streak" | "masteredLessons">, (userId: string) => Promise<number>> = {
  cards: (u) => xpCount(u, ["card"]),
  // Explanations and open answers both store a kind "explain" attempt; the XP reason tells them apart.
  explanations: (u) => xpCount(u, ["explain"]),
  openAnswers: (u) => xpCount(u, ["open"]),
  battleWins: (u) => xpCount(u, ["battle_win"]),
  quizzes: (u) => one(db.select({ n: count() }).from(schema.attempt).where(attemptWhere(u, "quiz"))),
  perfectQuizzes: (u) =>
    one(
      db
        .select({ n: count() })
        .from(schema.attempt)
        .where(and(attemptWhere(u, "quiz"), sql`${schema.attempt.score} = ${schema.attempt.maxScore} and ${schema.attempt.maxScore} >= 5`)),
    ),
  quiz80Lessons: (u) =>
    one(
      db
        .select({ n: countDistinct(schema.attempt.lessonId) })
        .from(schema.attempt)
        .where(and(attemptWhere(u, "quiz"), sql`${schema.attempt.score} * 5 >= ${schema.attempt.maxScore} * 4`)),
    ),
  battles: (u) => one(db.select({ n: count() }).from(schema.attempt).where(attemptWhere(u, "battle"))),
  quests: (u) =>
    one(
      db
        .select({ n: count() })
        .from(schema.questProgress)
        .where(and(eq(schema.questProgress.userId, u), isNotNull(schema.questProgress.completedAt))),
    ),
};

async function bestExplain(u: string) {
  return one(db.select({ n: max(schema.lessonProgress.bestExplain) }).from(schema.lessonProgress).where(eq(schema.lessonProgress.userId, u)));
}

/** A day on which all 3 daily quests were completed. */
async function hadFullQuestDay(u: string) {
  const [row] = await db
    .select({ day: schema.questProgress.dayKey })
    .from(schema.questProgress)
    .where(and(eq(schema.questProgress.userId, u), isNotNull(schema.questProgress.completedAt)))
    .groupBy(schema.questProgress.dayKey)
    .having(sql`count(*) >= 3`)
    .limit(1);
  return !!row;
}

/** Newest-first battle results (won or not) of this user. */
async function recentBattles(u: string, n = 3) {
  const rows = await db
    .select({ reason: schema.xpEvent.reason })
    .from(schema.xpEvent)
    .where(and(eq(schema.xpEvent.userId, u), inArray(schema.xpEvent.reason, BATTLE_REASONS)))
    .orderBy(sql`${schema.xpEvent.createdAt} desc, rowid desc`)
    .limit(n);
  return rows.map((r) => r.reason === "battle_win");
}

/**
 * Mastery of every ready lesson in the readers this user has touched (any progress row or
 * card review). Same formula as /readers; scoped to the user's readers to stay cheap.
 */
export async function lessonMasteries(u: string): Promise<LessonMastery[]> {
  const [progress, learned] = await Promise.all([
    db.select().from(schema.lessonProgress).where(eq(schema.lessonProgress.userId, u)),
    db
      .select({
        lessonId: schema.cardReview.lessonId,
        learned: sql<number>`sum(case when ${schema.cardReview.state} = 2 then 1.0 when ${schema.cardReview.state} in (1, 3) then 0.5 else 0 end)`,
      })
      .from(schema.cardReview)
      .where(eq(schema.cardReview.userId, u))
      .groupBy(schema.cardReview.lessonId),
  ]);
  const touched = [...new Set([...progress.map((p) => p.lessonId), ...learned.map((l) => l.lessonId)])];
  if (!touched.length) return [];
  const readerIds = db.selectDistinct({ id: schema.lesson.readerId }).from(schema.lesson).where(inArray(schema.lesson.id, touched));
  const lessons = await db
    .select({ id: schema.lesson.id, readerId: schema.lesson.readerId, week: schema.lesson.week })
    .from(schema.lesson)
    .where(and(inArray(schema.lesson.readerId, readerIds), eq(schema.lesson.status, "ready")));
  if (!lessons.length) return [];
  const totals = new Map(
    (
      await db
        .select({ lessonId: schema.flashcard.lessonId, n: count() })
        .from(schema.flashcard)
        .where(inArray(schema.flashcard.lessonId, lessons.map((l) => l.id)))
        .groupBy(schema.flashcard.lessonId)
    ).map((r) => [r.lessonId, r.n]),
  );
  const learnedBy = new Map(learned.map((l) => [l.lessonId, Number(l.learned ?? 0)]));
  const progressBy = new Map(progress.map((p) => [p.lessonId, p]));
  return lessons.map((l) => {
    const p = progressBy.get(l.id);
    const total = totals.get(l.id) ?? 0;
    return {
      readerId: l.readerId,
      week: l.week,
      mastery: computeMastery({
        bestQuiz: p?.bestQuiz ?? 0,
        bestExplain: p?.bestExplain ?? 0,
        summaryRead: p?.summaryRead ?? false,
        cardMastery: total ? (learnedBy.get(l.id) ?? 0) / total : 0,
      }),
    };
  });
}

// ---------- awarding ----------

/** One lesson's mastery for this user in a single indexed query (flashcard_lesson_idx + PK lookups). */
export async function lessonMastery(u: string, lessonId: string) {
  const [row] = db.all<{ total: number; learned: number | null; quiz: number | null; explain: number | null; read: number | null }>(sql`
    select
      (select count(*) from ${schema.flashcard} where ${schema.flashcard.lessonId} = ${lessonId}) as total,
      (select sum(case when r.state = 2 then 1.0 when r.state in (1, 3) then 0.5 else 0 end)
         from ${schema.flashcard} f join card_review r on r.user_id = ${u} and r.flashcard_id = f.id
         where f.lesson_id = ${lessonId}) as learned,
      lp.best_quiz as quiz, lp.best_explain as explain, lp.summary_read as read
    from (select 1) left join lesson_progress lp on lp.user_id = ${u} and lp.lesson_id = ${lessonId}`);
  return computeMastery({
    bestQuiz: row?.quiz ?? 0,
    bestExplain: row?.explain ?? 0,
    summaryRead: !!row?.read,
    cardMastery: row?.total ? Number(row.learned ?? 0) / row.total : 0,
  });
}

/** Last seen mastery band per user+lesson: 0 = below done (0.8), 1 = done, 2 = mastered (0.9). */
const masteryBand = new Map<string, number>();
const MAX_BANDS = 50_000;

/**
 * Whether the mastery/world badges need the (reader-wide) recompute: only when the touched
 * lesson moves up into a band (done ≥ 0.8, mastered ≥ 0.9) not yet seen for it in this
 * process. A lesson below 0.8 can't complete a week, world, reader or lesson badge, so the
 * usual card review costs one cheap query here. Without a lesson, always recompute.
 * Returns null when no recompute is needed, else a `commit` to call once the recompute
 * succeeded (so a failed one is retried by the next event instead of being forgotten).
 */
export async function masteryCrossed(u: string, lessonId: string | undefined): Promise<(() => void) | null> {
  if (!lessonId) return () => {};
  const m = await lessonMastery(u, lessonId);
  const band = m >= MASTER_MASTERY ? 2 : m >= DONE_MASTERY ? 1 : 0;
  const key = `${u}:${lessonId}`;
  const prev = masteryBand.get(key);
  if (!(band > 0 && (prev === undefined || band > prev))) {
    if (band !== prev) rememberBand(key, band);
    return null;
  }
  return () => rememberBand(key, band);
}

function rememberBand(key: string, band: number) {
  if (masteryBand.size >= MAX_BANDS) masteryBand.clear();
  masteryBand.set(key, band);
}

/**
 * Evaluate the badges `events` can affect and grant the ones now earned. Returns the newly
 * granted ids (for `XpResult.newBadges` → toast). Categories whose badges are all earned
 * already are skipped, so a veteran's card review costs one indexed lookup.
 */
export async function checkBadges(u: string, events: BadgeEvent[], ctx: BadgeContext = {}): Promise<BadgeId[]> {
  const kinds = new Set(events);
  const earned = new Set((await earnedBadges(u)).map((b) => b.id));
  const open = (k: BadgeEvent) => kinds.has(k) && BY_EVENT[k].some((id) => !earned.has(id));
  const hit: BadgeId[] = [];
  const reached = async (metric: Exclude<BadgeMetric, "streak" | "masteredLessons">) => hit.push(...badgesReached(metric, await METRIC[metric](u)));
  const now = ctx.now ?? new Date();

  if (open("xp")) {
    const today = dayKey(now);
    hit.push("first_steps", ...badgesReached("streak", ctx.streak ?? 0), ...timeOfDayBadges(hourInTz(now)));
    if (isWeekendPair(ctx.prevActiveDay, today)) hit.push("weekend_warrior");
    if (isComeback(ctx.prevActiveDay, today)) hit.push("comeback");
  }
  if (open("card")) await reached("cards");
  if (open("quiz")) {
    await reached("quizzes");
    await reached("perfectQuizzes");
    await reached("quiz80Lessons");
  }
  if (open("explain")) {
    await reached("explanations");
    if ((await bestExplain(u)) >= 0.9) hit.push("explain_master");
  }
  if (open("open")) await reached("openAnswers");
  const commitBand = open("mastery") ? await masteryCrossed(u, ctx.lessonId) : null;
  if (commitBand) {
    const m = masteryBadges(await lessonMasteries(u));
    hit.push(...badgesReached("masteredLessons", m.mastered), ...m.badges);
    commitBand();
  }
  if (open("quest")) {
    await reached("quests");
    if (await hadFullQuestDay(u)) hit.push("quests_daily_3");
  }
  if (open("battle")) {
    await reached("battles");
    await reached("battleWins");
    if (hasWinStreak(await recentBattles(u))) hit.push("battle_streak_3");
    if (ctx.battle?.perfect) hit.push("battle_perfect");
  }
  if (open("battle_host")) hit.push("battle_host");

  const granted = await grantBadges(u, hit.filter((id) => !earned.has(id)));
  if (kinds.has("xp")) {
    // Its own guard: a weekly failure must not lose the badges granted above (they get toasted).
    try {
      granted.push(...(await maybeAwardWeekly(u, now)));
    } catch (err) {
      console.error("[badges] weekly award failed", err);
    }
  }
  return granted;
}

// ---------- weekly leaderboard badges (lazy, no cron) ----------

const weeklyKey = (weekStart: Date) => `badges.weekly.${dayKey(weekStart)}`;
let weeklyCheckedFor: string | null = null;

/** How many finished weeks the lazy check looks back for unranked (e.g. quiet) weeks. */
const WEEKLY_LOOKBACK = 8;

/**
 * Rank a finished week (all users, as the leaderboard does) and grant its top 3 / #1 to those who show on it, in one synchronous SQLite transaction
 * with the claim (a settings row): either the week is claimed and its badges granted, or
 * nothing is written. Returns null when the week was already claimed (unless `force`).
 */
function awardWeek(from: Date, to: Date, { force = false } = {}): Map<string, BadgeId[]> | null {
  return db.transaction((tx) => {
    const claimed = tx.insert(schema.setting).values({ key: weeklyKey(from), value: "done" }).onConflictDoNothing().returning().all();
    if (!claimed.length && !force) return null;
    const ranked = tx
      .select({ userId: schema.xpEvent.userId, show: schema.user.showOnLeaderboard, xp: sql<number>`sum(${schema.xpEvent.amount})`.as("week_xp") })
      .from(schema.xpEvent)
      .innerJoin(schema.user, eq(schema.user.id, schema.xpEvent.userId))
      .where(and(gte(schema.xpEvent.createdAt, from), lt(schema.xpEvent.createdAt, to)))
      .groupBy(schema.xpEvent.userId)
      .orderBy(sql`week_xp desc`, schema.xpEvent.userId)
      .all();
    const out = new Map<string, BadgeId[]>();
    for (const w of weeklyWinners(ranked.map((r) => ({ userId: r.userId, xp: Number(r.xp), show: r.show })))) {
      const rows = tx
        .insert(schema.userBadge)
        .values(w.badges.map((badge) => ({ userId: w.userId, badge })))
        .onConflictDoNothing()
        .returning({ badge: schema.userBadge.badge })
        .all();
      out.set(w.userId, rows.map((r) => r.badge as BadgeId));
    }
    return out;
  });
}

/**
 * On an XP event, rank every finished week that isn't ranked yet (newest first, stopping
 * at the first ranked one; at most WEEKLY_LOOKBACK), so a week followed by a quiet week is
 * still ranked. Returns what this user got (others see theirs on their profile). The
 * in-memory key only skips the check once it succeeded for the current week.
 */
export async function maybeAwardWeekly(u: string, now = new Date()): Promise<BadgeId[]> {
  const prev = startOfPreviousWeek(now);
  const key = weeklyKey(prev);
  if (weeklyCheckedFor === key) return [];
  const mine: BadgeId[] = [];
  let from = prev;
  let to = startOfWeek(now);
  for (let i = 0; i < WEEKLY_LOOKBACK; i++) {
    const got = awardWeek(from, to);
    if (!got) break;
    mine.push(...(got.get(u) ?? []));
    to = from;
    from = startOfPreviousWeek(from);
  }
  weeklyCheckedFor = key;
  return mine;
}

/** Tests: forget the in-memory "this week is done" shortcut. */
export function resetWeeklyCache() {
  weeklyCheckedFor = null;
}

// ---------- backfill ----------

/** Let timers and requests run between chunks of a long backfill. */
export const yieldToEventLoop = () => new Promise<void>((r) => setTimeout(r, 0));

/** Bump when badges are added whose criteria existing data can already meet. */
export const BACKFILL_VERSION = "1";
const BACKFILL_KEY = "badges.backfill";

/** Every badge `u` has earned according to the stored data (no live-only context). */
async function earnableFromData(u: string, events: { createdAt: Date; reason: string }[]): Promise<BadgeId[]> {
  const stats = await db.query.userStats.findFirst({ where: eq(schema.userStats.userId, u) });
  const hit: BadgeId[] = [];
  for (const metric of Object.keys(METRIC) as (keyof typeof METRIC)[]) hit.push(...badgesReached(metric, await METRIC[metric](u)));
  hit.push(...badgesReached("streak", Math.max(stats?.longestStreak ?? 0, stats?.streak ?? 0)));
  if ((await bestExplain(u)) >= 0.9) hit.push("explain_master");
  const m = masteryBadges(await lessonMasteries(u));
  hit.push(...badgesReached("masteredLessons", m.mastered), ...m.badges);
  if (await hadFullQuestDay(u)) hit.push("quests_daily_3");
  if (events.length || (stats?.xp ?? 0) > 0) hit.push("first_steps");
  for (const e of events) hit.push(...timeOfDayBadges(hourInTz(e.createdAt)));
  const days = events.map((e) => dayKey(e.createdAt));
  if (stats?.lastActiveDay) days.push(stats.lastActiveDay);
  hit.push(...dayHistoryBadges(days));
  const battles = events.filter((e) => (BATTLE_REASONS as readonly string[]).includes(e.reason)).reverse();
  for (let i = 0; i + 3 <= battles.length; i++) {
    if (hasWinStreak(battles.slice(i, i + 3).map((e) => e.reason === "battle_win"))) {
      hit.push("battle_streak_3");
      break;
    }
  }
  return [...new Set(hit)];
}

/**
 * Silently grant every badge existing data already earns (no toasts: nothing is returned
 * to a client), plus the weekly top-3/#1 of every finished week. Idempotent; runs once per
 * BACKFILL_VERSION at server start unless `force`d (the admin endpoint / tests).
 */
export async function backfillBadges({ force = false } = {}): Promise<{ users: number; granted: number }> {
  const marker = await db.query.setting.findFirst({ where: eq(schema.setting.key, BACKFILL_KEY) });
  if (!force && marker?.value === BACKFILL_VERSION) return { users: 0, granted: 0 };

  const all = await db
    .select({ userId: schema.xpEvent.userId, createdAt: schema.xpEvent.createdAt, reason: schema.xpEvent.reason })
    .from(schema.xpEvent)
    .orderBy(schema.xpEvent.createdAt, sql`rowid`);
  const byUser = new Map<string, typeof all>();
  for (const e of all) {
    const list = byUser.get(e.userId);
    if (list) list.push(e);
    else byUser.set(e.userId, [e]);
  }

  const users = await db.select({ id: schema.user.id }).from(schema.user);
  let granted = 0;
  for (const { id } of users) {
    granted += (await grantBadges(id, await earnableFromData(id, byUser.get(id) ?? []))).length;
    await yieldToEventLoop();
  }

  // Finished weeks with XP, oldest first; each week is claimed so the lazy check skips it.
  const thisWeek = startOfWeek().getTime();
  const weekKeys = new Set<string>();
  for (const e of all) weekKeys.add(weekKey(dayKey(e.createdAt)));
  const weeks = new Set<number>();
  for (const k of weekKeys) {
    const w = startOfWeek(new Date(`${k}T12:00:00Z`)).getTime();
    if (w < thisWeek) weeks.add(w);
  }
  for (const w of [...weeks].sort((a, b) => a - b)) {
    const got = awardWeek(new Date(w), startOfWeek(new Date(w + 8 * 864e5)), { force: true });
    for (const ids of got?.values() ?? []) granted += ids.length;
    await yieldToEventLoop();
  }

  await db
    .insert(schema.setting)
    .values({ key: BACKFILL_KEY, value: BACKFILL_VERSION })
    .onConflictDoUpdate({ target: schema.setting.key, set: { value: BACKFILL_VERSION, updatedAt: new Date() } });
  return { users: users.length, granted };
}

// ---------- overview (GET /api/me/badges) ----------

export async function badgeOverview(u: string) {
  const [earned, stats] = await Promise.all([earnedBadges(u), db.query.userStats.findFirst({ where: eq(schema.userStats.userId, u) })]);
  // A streak is only "alive" if the user was active today or yesterday (as on /me).
  const today = dayKey();
  const alive = stats?.lastActiveDay === today || stats?.lastActiveDay === previousDay(today);
  const metrics: Partial<Record<BadgeMetric, number>> = { streak: alive ? (stats?.streak ?? 0) : 0 };
  for (const metric of Object.keys(METRIC) as (keyof typeof METRIC)[]) metrics[metric] = await METRIC[metric](u);
  metrics.masteredLessons = masteryBadges(await lessonMasteries(u)).mastered;
  const earnedAt = new Map(earned.filter((b) => isBadgeId(b.id)).map((b) => [b.id, b.earnedAt]));
  return BADGE_LIST.map(({ id }) => {
    const at = earnedAt.get(id);
    const progress = BADGES[id].progress && !at ? badgeProgress(id, metrics) : undefined;
    return { id, earnedAt: at ?? null, ...(progress && { progress }) };
  });
}
