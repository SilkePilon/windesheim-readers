// Data for the whole-reader learning page: the daily session plan input and the overview
// (spec: "The daily session (server)"). The planning itself is pure (shared/reader-session).
import { and, asc, desc, eq, gt, inArray, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "../db";
import { aiQuota } from "./ai-quota";
import { cardMasteryByLesson } from "./game";
import { scheduler, toCard } from "./fsrs";
import { dayKey, previousDay } from "./time";
import { computeMastery } from "../../shared/game";
import { DONE_MASTERY } from "../../shared/path";
import { hashSeed } from "../../shared/rng";
import { buildSessionPlan, daysToExam, type PlanCard, type PlanLesson, type PlanQuestion, type SessionPlan, type SessionPlanInput } from "../../shared/reader-session";

type User = { id: string; role: string };
type ReaderRow = typeof schema.reader.$inferSelect;
export type LessonRow = { id: string; code: string; title: string; week: number; position: number; mastery: number; started: boolean };
type ReviewRow = typeof schema.cardReview.$inferSelect;
type QuestionRow = typeof schema.question.$inferSelect;

const QUIZ_TYPES = ["mc", "tf", "fill", "order"] as const;
/** FSRS Review and Relearning: cards reviewed before, the only ones that can be pulled forward. */
const REVIEWED_STATES = [2, 3];

/** The reader when this user may see it: published, or any reader for admins. */
export async function visibleReader(user: User, readerId: string): Promise<ReaderRow | null> {
  const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, readerId) });
  if (!r || (!r.published && user.role !== "admin")) return null;
  return r;
}

/** Completed sessions today for this reader (drives the XP factor and the plan seed). */
export async function sessionDay(userId: string, readerId: string, day = dayKey()) {
  return db.query.readerSessionDay.findFirst({
    where: and(eq(schema.readerSessionDay.userId, userId), eq(schema.readerSessionDay.readerId, readerId), eq(schema.readerSessionDay.day, day)),
  });
}

/** Consecutive days with a completed session, ending today or yesterday. */
export async function sessionDayStreak(userId: string, readerId: string, now = new Date()) {
  const rows = await db
    .select({ day: schema.readerSessionDay.day })
    .from(schema.readerSessionDay)
    .where(and(eq(schema.readerSessionDay.userId, userId), eq(schema.readerSessionDay.readerId, readerId), isNotNull(schema.readerSessionDay.completedAt)))
    .orderBy(desc(schema.readerSessionDay.day))
    .limit(400);
  const today = dayKey(now);
  let expect = rows[0]?.day === today ? today : previousDay(today);
  let streak = 0;
  for (const r of rows) {
    if (r.day !== expect) break;
    streak++;
    expect = previousDay(expect);
  }
  return streak;
}

/** Lesson mastery (as on home) for these lessons. */
export async function lessonMastery(userId: string, lessonIds: string[]): Promise<Map<string, number>> {
  if (!lessonIds.length) return new Map();
  const [progress, cards] = await Promise.all([
    db.select().from(schema.lessonProgress).where(and(eq(schema.lessonProgress.userId, userId), inArray(schema.lessonProgress.lessonId, lessonIds))),
    cardMasteryByLesson(userId, { lessonIds: db.select({ id: schema.lesson.id }).from(schema.lesson).where(inArray(schema.lesson.id, lessonIds)) }),
  ]);
  const by = new Map(progress.map((p) => [p.lessonId, p]));
  return new Map(
    lessonIds.map((id) => {
      const p = by.get(id);
      return [id, computeMastery({ bestQuiz: p?.bestQuiz ?? 0, bestExplain: p?.bestExplain ?? 0, summaryRead: p?.summaryRead ?? false, cardMastery: cards.get(id) ?? 0 })];
    }),
  );
}

export interface PlanData {
  reader: ReaderRow;
  input: SessionPlanInput;
  lessons: LessonRow[];
  sessionsToday: number;
  /** Review rows (due and pull-forward) by flashcard id. */
  reviews: Map<string, ReviewRow>;
  /** Quiz and open questions of the started, ready lessons, by id. */
  questions: Map<string, QuestionRow>;
}

/** Everything `buildSessionPlan` needs, from ready lessons of a visible reader only. Null = not visible. */
export async function loadPlanInput(user: User, readerId: string, now = new Date()): Promise<PlanData | null> {
  const reader = await visibleReader(user, readerId);
  if (!reader) return null;
  const lessonRows = await db
    .select({ id: schema.lesson.id, code: schema.lesson.code, title: schema.lesson.title, week: schema.lesson.week, position: schema.lesson.position })
    .from(schema.lesson)
    .where(and(eq(schema.lesson.readerId, reader.id), eq(schema.lesson.status, "ready")))
    .orderBy(asc(schema.lesson.week), asc(schema.lesson.position));
  const lessonIds = lessonRows.map((l) => l.id);
  const today = dayKey(now);
  const examDate = reader.examDate ?? null;

  const [progress, cardMastery, reviewedLessons, dueRows, pullRows, questionRows, results, day] = lessonIds.length
    ? await Promise.all([
        db
          .select()
          .from(schema.lessonProgress)
          .where(and(eq(schema.lessonProgress.userId, user.id), inArray(schema.lessonProgress.lessonId, lessonIds))),
        cardMasteryByLesson(user.id, { lessonIds: db.select({ id: schema.lesson.id }).from(schema.lesson).where(inArray(schema.lesson.id, lessonIds)) }),
        db
          .selectDistinct({ lessonId: schema.cardReview.lessonId })
          .from(schema.cardReview)
          .where(and(eq(schema.cardReview.userId, user.id), inArray(schema.cardReview.lessonId, lessonIds))),
        db
          .select()
          .from(schema.cardReview)
          .where(and(eq(schema.cardReview.userId, user.id), inArray(schema.cardReview.lessonId, lessonIds), lte(schema.cardReview.due, now))),
        examDate == null
          ? Promise.resolve([] as ReviewRow[])
          : db
              .select()
              .from(schema.cardReview)
              .where(
                and(
                  eq(schema.cardReview.userId, user.id),
                  inArray(schema.cardReview.lessonId, lessonIds),
                  inArray(schema.cardReview.state, REVIEWED_STATES),
                  gt(schema.cardReview.due, new Date(Math.max(examDate, now.getTime()))),
                ),
              ),
        db.select().from(schema.question).where(inArray(schema.question.lessonId, lessonIds)),
        db
          .select({ questionId: schema.questionResult.questionId, lastCorrect: schema.questionResult.lastCorrect })
          .from(schema.questionResult)
          .innerJoin(schema.question, eq(schema.question.id, schema.questionResult.questionId))
          .where(and(eq(schema.questionResult.userId, user.id), inArray(schema.question.lessonId, lessonIds))),
        sessionDay(user.id, reader.id, today),
      ])
    : [[], new Map<string, number>(), [], [], [], [], [], await sessionDay(user.id, reader.id, today)];

  const progressBy = new Map(progress.map((p) => [p.lessonId, p]));
  const reviewed = new Set(reviewedLessons.map((r) => r.lessonId));
  const lessons: LessonRow[] = lessonRows.map((l) => {
    const p = progressBy.get(l.id);
    return {
      ...l,
      mastery: computeMastery({
        bestQuiz: p?.bestQuiz ?? 0,
        bestExplain: p?.bestExplain ?? 0,
        summaryRead: p?.summaryRead ?? false,
        cardMastery: cardMastery.get(l.id) ?? 0,
      }),
      started: reviewed.has(l.id) || !!p && (p.summaryRead || p.bestQuiz > 0 || p.bestExplain > 0 || p.listenMs > 0),
    };
  });

  const lastCorrect = new Map(results.map((r) => [r.questionId, r.lastCorrect]));
  const toPlanQuestion = (q: QuestionRow): PlanQuestion => ({
    id: q.id,
    lessonId: q.lessonId,
    seen: lastCorrect.has(q.id),
    lastCorrect: lastCorrect.get(q.id) ?? null,
  });
  const quiz = questionRows.filter((q) => (QUIZ_TYPES as readonly string[]).includes(q.type));
  const open = questionRows.filter((q) => q.type === "open");

  const toPlanCard = (r: ReviewRow): PlanCard => ({ id: r.flashcardId, lessonId: r.lessonId, due: r.due.getTime() });
  const examDay = examDate == null ? null : new Date(examDate);
  const pullForwardCards: PlanCard[] = examDay
    ? pullRows.map((r) => ({ ...toPlanCard(r), pullForward: true, retrievabilityAtExam: scheduler.get_retrievability(toCard(r), examDay, false) }))
    : [];

  const sessionsToday = day?.sessions ?? 0;
  const grade = aiQuota(user, "grade", now);
  const input: SessionPlanInput = {
    now: now.getTime(),
    examDate,
    seed: hashSeed(`${user.id}:${reader.id}:${today}:${sessionsToday}`),
    dueCards: dueRows.map(toPlanCard),
    pullForwardCards,
    questions: quiz.map(toPlanQuestion),
    openQuestions: open.map(toPlanQuestion),
    lessons: lessons.map((l): PlanLesson => ({ id: l.id, mastery: l.mastery, started: l.started })),
    openAllowed: grade === null || grade.remaining > 0,
  };
  return {
    reader,
    input,
    lessons,
    sessionsToday,
    reviews: new Map([...dueRows, ...pullRows].map((r) => [r.flashcardId, r])),
    questions: new Map(questionRows.map((q) => [q.id, q])),
  };
}

export interface ReaderLearn {
  reader: { id: string; title: string; examDate: number | null };
  daysToExam: number | null;
  progress: { mastery: number; masteredLessons: number; totalLessons: number };
  due: number;
  pullForward: number;
  today: { done: boolean; xp: number; sessions: number };
  sessionDayStreak: number;
  estimate: { cards: number; questions: number; open: number; minutes: number };
  needsStart: boolean;
  currentLessonId: string | null;
  weakLessons: { id: string; code: string; title: string; mastery: number }[];
  episodes: { week: number; title: string; durationSec: number; positionMs: number; listenMs: number }[];
  conceptMap: boolean;
}

const WEAK_LESSONS = 3;

/** The reader page overview in one call. Null = the reader isn't visible to this user. */
export async function readerOverview(user: User, readerId: string, now = new Date()): Promise<ReaderLearn | null> {
  const data = await loadPlanInput(user, readerId, now);
  if (!data) return null;
  const { reader, input, lessons } = data;
  const plan: SessionPlan = buildSessionPlan(input);
  const pulled = new Set(input.pullForwardCards.map((c) => c.id));

  const [day, streak, episodeRows, listened, map] = await Promise.all([
    sessionDay(user.id, reader.id, dayKey(now)),
    sessionDayStreak(user.id, reader.id, now),
    db
      .select()
      .from(schema.readerEpisode)
      .where(and(eq(schema.readerEpisode.readerId, reader.id), eq(schema.readerEpisode.status, "ready")))
      .orderBy(asc(schema.readerEpisode.week)),
    db.select().from(schema.episodeProgress).where(and(eq(schema.episodeProgress.userId, user.id), eq(schema.episodeProgress.readerId, reader.id))),
    db.query.conceptMap.findFirst({ where: eq(schema.conceptMap.readerId, reader.id), columns: { status: true } }),
  ]);
  const heard = new Map(listened.map((p) => [p.week, p]));

  const total = lessons.length;
  return {
    reader: { id: reader.id, title: reader.title, examDate: reader.examDate ?? null },
    daysToExam: daysToExam(now.getTime(), reader.examDate ?? null),
    progress: {
      mastery: total ? lessons.reduce((sum, l) => sum + l.mastery, 0) / total : 0,
      masteredLessons: lessons.filter((l) => l.mastery >= DONE_MASTERY).length,
      totalLessons: total,
    },
    due: input.dueCards.length,
    pullForward: plan.items.filter((i) => i.kind === "card" && pulled.has(i.id)).length,
    today: { done: day?.completedAt != null, xp: day?.xp ?? 0, sessions: day?.sessions ?? 0 },
    sessionDayStreak: streak,
    estimate: { ...plan.counts, minutes: plan.minutes },
    needsStart: plan.needsStart,
    currentLessonId: lessons.find((l) => l.mastery < DONE_MASTERY)?.id ?? null,
    weakLessons: lessons
      .filter((l) => l.started && l.mastery < DONE_MASTERY)
      .sort((a, b) => a.mastery - b.mastery || a.week - b.week || a.position - b.position)
      .slice(0, WEAK_LESSONS)
      .map(({ id, code, title, mastery }) => ({ id, code, title, mastery })),
    episodes: episodeRows.map((e) => ({
      week: e.week,
      title: e.title ?? "",
      durationSec: Math.round(e.chapters.reduce((sum, ch) => sum + ch.durationMs, 0) / 1000),
      positionMs: heard.get(e.week)?.positionMs ?? 0,
      listenMs: heard.get(e.week)?.listenMs ?? 0,
    })),
    conceptMap: map?.status === "ready",
  };
}
