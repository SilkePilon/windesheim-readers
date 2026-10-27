import { Hono } from "hono";
import { z } from "zod";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, type UIMessage } from "ai";
import { fsrs, createEmptyCard, Rating, type Card, type Grade } from "ts-fsrs";
import { db, schema } from "../db";
import { limits } from "../limits";
import { displayName, requireUser, type AppEnv } from "../middleware";
import { checkAnswer, correctAnswer, explanationOf, publicQuestion, shuffle } from "../lib/answers";
import {
  awardXpOnly,
  cardMasteryByLesson,
  dayKey,
  getOrCreateProgress,
  startOfDay,
  startOfWeek,
  updateProgress,
  xpSince,
} from "../lib/game";
import { getQuests, recordQuestEvent } from "../lib/quests";
import { awardWithQuests } from "../lib/award";
import { badgeOverview, checkBadges, eventsForReason } from "../lib/badges";
import type { QuestEvent } from "../../shared/quests";
import { computeMastery, levelFromXp, quizXpFactor, quizXpPerCorrect, XP, type BadgeId } from "../../shared/game";
import { isBadgeId } from "../../shared/badges";
import { getPageText } from "../ai/pipeline";
import { gradeExplanation, gradeOpenAnswer, tutorInstructions } from "../ai/tutor";
import { getModel } from "../ai/providers";
import { chapterPath, PUBLIC_AUDIO_COLUMNS, publicAudio } from "../ai/audio";
import { parseRange } from "../lib/audio-codec";

/** Listening at least this share of the luisterles counts as having read the summary. */
const LISTENED_SHARE = 0.9;

const scheduler = fsrs({ enable_fuzz: true });

/** Today's quiz XP factor for this user and lesson (diminishing after 3 quizzes per day). */
async function todayQuizFactor(userId: string, lessonId: string) {
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(schema.attempt)
    .where(and(eq(schema.attempt.userId, userId), eq(schema.attempt.lessonId, lessonId), eq(schema.attempt.kind, "quiz"), gte(schema.attempt.createdAt, startOfDay())));
  return quizXpFactor(n);
}

/** Next-due interval (ms from `now`) per rating, from FSRS `repeat()` previews. */
function previewIntervals(card: Card, now: Date) {
  const rec = scheduler.repeat(card, now);
  const ms = (g: Grade) => rec[g].card.due.getTime() - now.getTime();
  return { again: ms(Rating.Again), hard: ms(Rating.Hard), good: ms(Rating.Good), easy: ms(Rating.Easy) };
}

interface QuizSession {
  userId: string;
  lessonId: string;
  questionIds: string[];
  results: Map<string, boolean>;
  createdAt: number;
}
const quizSessions = new Map<string, QuizSession>();

function createQuizSession(userId: string, lessonId: string, questionIds: string[]) {
  const cutoff = Date.now() - 3 * 60 * 60 * 1000;
  for (const [id, s] of quizSessions) if (s.createdAt < cutoff) quizSessions.delete(id);
  const id = nanoid();
  quizSessions.set(id, { userId, lessonId, questionIds, results: new Map(), createdAt: Date.now() });
  return id;
}
const NEW_CARDS_PER_SESSION = 15;

/**
 * Award XP, advance the daily quests and check the badges the action can earn, with one
 * badge check for the whole action (see awardWithQuests). `lessonId` scopes the mastery check.
 */
const award = (userId: string, amount: number, reason: string, events: QuestEvent[] = [], lessonId?: string) =>
  awardWithQuests(
    {
      awardXp: awardXpOnly,
      recordQuestEvent,
      checkBadges: (u, r, ctx) => checkBadges(u, [...(ctx.xp ? (["xp"] as const) : []), ...eventsForReason(r)], { ...ctx.xp, lessonId: ctx.lessonId }),
    },
    userId,
    amount,
    reason,
    events,
    lessonId ?? events.map((e) => ("lessonId" in e ? e.lessonId : undefined)).find(Boolean),
  );

/**
 * Mark the summary read and award its XP exactly once (atomic claim, so concurrent "read" and
 * "listened" calls can't both award). Returns null when it was already read.
 */
async function markSummaryRead(userId: string, lessonId: string) {
  await getOrCreateProgress(userId, lessonId);
  const claimed = await db
    .update(schema.lessonProgress)
    .set({ summaryRead: true, updatedAt: new Date() })
    .where(and(eq(schema.lessonProgress.userId, userId), eq(schema.lessonProgress.lessonId, lessonId), eq(schema.lessonProgress.summaryRead, false)))
    .returning({ userId: schema.lessonProgress.userId });
  if (!claimed.length) return null;
  return award(userId, XP.summaryRead, "summary", [], lessonId);
}

/** Lessons visible to this user: from published readers (admins see all). */
async function visibleLesson(lessonId: string, isAdmin: boolean) {
  const row = await db
    .select({ lesson: schema.lesson, reader: schema.reader })
    .from(schema.lesson)
    .innerJoin(schema.reader, eq(schema.reader.id, schema.lesson.readerId))
    .where(eq(schema.lesson.id, lessonId))
    .get();
  if (!row || row.lesson.status !== "ready") return null;
  if (!row.reader.published && !isAdmin) return null;
  return row;
}

function toCard(r: typeof schema.cardReview.$inferSelect): Card {
  return {
    due: r.due,
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsedDays,
    scheduled_days: r.scheduledDays,
    learning_steps: r.learningSteps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    last_review: r.lastReview ?? undefined,
  };
}

function fromCard(c: Card) {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ?? null,
  };
}

async function dueCount(userId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(schema.cardReview)
    .innerJoin(schema.lesson, eq(schema.lesson.id, schema.cardReview.lessonId))
    .innerJoin(schema.reader, eq(schema.reader.id, schema.lesson.readerId))
    .where(and(eq(schema.cardReview.userId, userId), lte(schema.cardReview.due, new Date()), eq(schema.reader.published, true)));
  return r?.n ?? 0;
}

export const learn = new Hono<AppEnv>()
  .use(requireUser)

  // ----- me -----
  .get("/me", async (c) => {
    const u = c.get("user");
    const [stats, badges, todayXp, weekXp, due] = await Promise.all([
      db.query.userStats.findFirst({ where: eq(schema.userStats.userId, u.id) }),
      db.select().from(schema.userBadge).where(eq(schema.userBadge.userId, u.id)).orderBy(desc(schema.userBadge.earnedAt)),
      xpSince(u.id, startOfDay()),
      xpSince(u.id, startOfWeek()),
      dueCount(u.id),
    ]);
    const xp = stats?.xp ?? 0;
    // A streak is only "alive" if the user was active today or yesterday.
    const yesterday = new Date(Date.now() - 864e5);
    const alive = stats?.lastActiveDay === dayKey() || stats?.lastActiveDay === dayKey(yesterday);
    return c.json({
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        nickname: u.nickname ?? null,
        displayName: displayName({ nickname: u.nickname ?? null, name: u.name, email: u.email }),
        role: u.role,
        showOnLeaderboard: u.showOnLeaderboard ?? true,
        locale: u.locale === "nl" || u.locale === "en" ? u.locale : null,
      },
      stats: {
        xp,
        ...levelFromXp(xp),
        streak: alive ? (stats?.streak ?? 0) : 0,
        longestStreak: stats?.longestStreak ?? 0,
        activeToday: stats?.lastActiveDay === dayKey(),
        todayXp,
        weekXp,
        due,
      },
      badges: badges.filter((b) => isBadgeId(b.badge)).map((b) => ({ id: b.badge as BadgeId, earnedAt: b.earnedAt })),
      quests: await getQuests(u.id),
    });
  })

  /** Every badge in catalogue order: earnedAt (or null) and, for locked counted ones, progress. */
  .get("/me/badges", async (c) => c.json(await badgeOverview(c.get("user").id)))

  .patch("/me", limits.writes, async (c) => {
    const body = z
      .object({
        nickname: z.string().trim().max(24).nullable().optional(),
        showOnLeaderboard: z.boolean().optional(),
        locale: z.enum(["nl", "en"]).optional(),
      })
      .parse(await c.req.json());
    await db.update(schema.user).set(body).where(eq(schema.user.id, c.get("user").id));
    return c.json({ ok: true });
  })

  // ----- catalogue -----
  .get("/readers", async (c) => {
    const u = c.get("user");
    const isAdmin = u.role === "admin";
    const readers = await db
      .select()
      .from(schema.reader)
      .where(isAdmin ? undefined : eq(schema.reader.published, true))
      .orderBy(desc(schema.reader.createdAt));
    if (!readers.length) return c.json([]);
    const lessons = await db
      .select({
        id: schema.lesson.id,
        readerId: schema.lesson.readerId,
        code: schema.lesson.code,
        title: schema.lesson.title,
        week: schema.lesson.week,
        status: schema.lesson.status,
      })
      .from(schema.lesson)
      .where(and(inArray(schema.lesson.readerId, readers.map((r) => r.id)), eq(schema.lesson.status, "ready")))
      .orderBy(asc(schema.lesson.position));
    const progress = await db.select().from(schema.lessonProgress).where(eq(schema.lessonProgress.userId, u.id));
    const cardMastery = await cardMasteryByLesson(u.id);
    const lastStudied = await lastStudiedByLesson(u.id, progress);
    return c.json(
      readers.map((r) => ({
        id: r.id,
        title: r.title,
        course: r.course,
        published: r.published,
        lastStudiedLessonId: latestLesson(
          lessons.filter((l) => l.readerId === r.id).map((l) => l.id),
          lastStudied,
        ),
        lessons: lessons
          .filter((l) => l.readerId === r.id)
          .map((l) => {
            const p = progress.find((x) => x.lessonId === l.id);
            return {
              ...l,
              mastery: computeMastery({
                bestQuiz: p?.bestQuiz ?? 0,
                bestExplain: p?.bestExplain ?? 0,
                summaryRead: p?.summaryRead ?? false,
                cardMastery: cardMastery.get(l.id) ?? 0,
              }),
            };
          }),
      })),
    );
  })

  .get("/lessons/:id", async (c) => {
    const u = c.get("user");
    const row = await visibleLesson(c.req.param("id"), u.role === "admin");
    if (!row) return c.json({ error: "NOT_FOUND" }, 404);
    const { lesson: l, reader: r } = row;
    const [terms, cardCount, qCounts, progress, cardMastery, siblings] = await Promise.all([
      db.select({ term: schema.term.term, definition: schema.term.definition }).from(schema.term).where(eq(schema.term.lessonId, l.id)),
      db.select({ n: count() }).from(schema.flashcard).where(eq(schema.flashcard.lessonId, l.id)),
      db
        .select({ type: schema.question.type, n: count() })
        .from(schema.question)
        .where(eq(schema.question.lessonId, l.id))
        .groupBy(schema.question.type),
      getOrCreateProgress(u.id, l.id),
      cardMasteryByLesson(u.id),
      db
        .select({ id: schema.lesson.id, code: schema.lesson.code, title: schema.lesson.title })
        .from(schema.lesson)
        .where(and(eq(schema.lesson.readerId, r.id), eq(schema.lesson.status, "ready")))
        .orderBy(asc(schema.lesson.position)),
    ]);
    const idx = siblings.findIndex((s) => s.id === l.id);
    const cm = cardMastery.get(l.id) ?? 0;
    return c.json({
      id: l.id,
      code: l.code,
      title: l.title,
      week: l.week,
      startPage: l.startPage,
      endPage: l.endPage,
      summary: l.summary,
      keyPoints: l.keyPoints ?? [],
      reader: { id: r.id, title: r.title },
      terms,
      flashcardCount: cardCount[0]?.n ?? 0,
      quizCount: qCounts.filter((q) => q.type !== "open").reduce((a, q) => a + q.n, 0),
      openCount: qCounts.find((q) => q.type === "open")?.n ?? 0,
      progress: {
        summaryRead: progress.summaryRead,
        bestQuiz: progress.bestQuiz,
        bestExplain: progress.bestExplain,
        cardMastery: cm,
        mastery: computeMastery({ ...progress, cardMastery: cm }),
      },
      prev: siblings[idx - 1] ?? null,
      next: siblings[idx + 1] ?? null,
    });
  })

  .post("/lessons/:id/read", limits.writes, async (c) => {
    const u = c.get("user");
    const row = await visibleLesson(c.req.param("id"), u.role === "admin");
    if (!row) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json((await markSummaryRead(u.id, row.lesson.id)) ?? { gained: 0 });
  })

  // ----- luisterles (audio summary; never the script) -----
  .get("/lessons/:id/audio", async (c) => {
    const u = c.get("user");
    const row = await visibleLesson(c.req.param("id"), u.role === "admin");
    if (!row) return c.json({ error: "NOT_FOUND" }, 404);
    const [audio, progress] = await Promise.all([
      db.query.lessonAudio.findFirst({ where: eq(schema.lessonAudio.lessonId, row.lesson.id), columns: PUBLIC_AUDIO_COLUMNS }),
      db.query.lessonProgress.findFirst({ where: and(eq(schema.lessonProgress.userId, u.id), eq(schema.lessonProgress.lessonId, row.lesson.id)) }),
    ]);
    return c.json({ ...publicAudio(row.lesson.id, audio), listenMs: progress?.listenMs ?? 0, summaryRead: progress?.summaryRead ?? false });
  })

  .get("/lessons/:id/audio/:file{[0-9]+\\.mp3}", async (c) => {
    const u = c.get("user");
    const row = await visibleLesson(c.req.param("id"), u.role === "admin");
    if (!row) return c.json({ error: "NOT_FOUND" }, 404);
    const n = Number.parseInt(c.req.param("file"), 10);
    const audio = await db.query.lessonAudio.findFirst({ where: eq(schema.lessonAudio.lessonId, row.lesson.id), columns: { chapters: true } });
    const f = Bun.file(chapterPath(row.lesson.id, n));
    if (!audio?.chapters.some((ch) => ch.n === n) || !(await f.exists())) return c.json({ error: "NOT_FOUND" }, 404);
    const size = f.size;
    // /api stays network-only in the service worker; the browser may cache it privately (URLs carry ?v=).
    const headers: Record<string, string> = { "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=86400" };
    const range = parseRange(c.req.header("range"), size);
    if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    if (range)
      return new Response(f.slice(range.start, range.end + 1), {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": String(range.end - range.start + 1) },
      });
    return new Response(f, { headers: { ...headers, "Content-Length": String(size) } });
  })

  /**
   * Resume position + completion. `positionMs` is stored for "resume where you left off";
   * `heardMs` (media time actually played, if the client tracks it) or else the position decides
   * whether ≥ 90% was listened, which marks the summary read once (same XP path as /read).
   */
  .post("/lessons/:id/audio/progress", limits.writes, async (c) => {
    const u = c.get("user");
    const row = await visibleLesson(c.req.param("id"), u.role === "admin");
    if (!row) return c.json({ error: "NOT_FOUND" }, 404);
    const body = z
      .object({ positionMs: z.number().int().min(0).max(6 * 3600_000), heardMs: z.number().int().min(0).max(6 * 3600_000).optional() })
      .parse(await c.req.json());
    const audio = publicAudio(
      row.lesson.id,
      await db.query.lessonAudio.findFirst({ where: eq(schema.lessonAudio.lessonId, row.lesson.id), columns: PUBLIC_AUDIO_COLUMNS }),
    );
    if (audio.status !== "ready") return c.json({ error: "AUDIO_NOT_READY" }, 409);
    const listenMs = Math.min(body.positionMs, audio.totalMs);
    await getOrCreateProgress(u.id, row.lesson.id);
    await db
      .update(schema.lessonProgress)
      .set({ listenMs })
      .where(and(eq(schema.lessonProgress.userId, u.id), eq(schema.lessonProgress.lessonId, row.lesson.id)));
    const heard = body.heardMs ?? body.positionMs;
    const reward = heard >= LISTENED_SHARE * audio.totalMs ? await markSummaryRead(u.id, row.lesson.id) : null;
    const p = await db.query.lessonProgress.findFirst({ where: and(eq(schema.lessonProgress.userId, u.id), eq(schema.lessonProgress.lessonId, row.lesson.id)) });
    return c.json({ listenMs, summaryRead: p?.summaryRead ?? false, award: reward });
  })

  // ----- flashcards (FSRS spaced repetition) -----
  .get("/lessons/:id/flashcards", async (c) => {
    const u = c.get("user");
    const row = await visibleLesson(c.req.param("id"), u.role === "admin");
    if (!row) return c.json({ error: "NOT_FOUND" }, 404);
    const cards = await db
      .select({ id: schema.flashcard.id, front: schema.flashcard.front, back: schema.flashcard.back, state: schema.cardReview.state, due: schema.cardReview.due })
      .from(schema.flashcard)
      .leftJoin(schema.cardReview, and(eq(schema.cardReview.flashcardId, schema.flashcard.id), eq(schema.cardReview.userId, u.id)))
      .where(eq(schema.flashcard.lessonId, row.lesson.id));
    return c.json(cards);
  })

  /** Study queue: due cards first, then new ones. Optional lessonId to scope to a lesson. */
  .get("/review/queue", async (c) => {
    const u = c.get("user");
    const lessonId = c.req.query("lessonId");
    const now = new Date();
    const publishedLessons = db
      .select({ id: schema.lesson.id })
      .from(schema.lesson)
      .innerJoin(schema.reader, eq(schema.reader.id, schema.lesson.readerId))
      .where(u.role === "admin" ? undefined : eq(schema.reader.published, true));

    const scope = lessonId ? eq(schema.flashcard.lessonId, lessonId) : inArray(schema.flashcard.lessonId, publishedLessons);

    const due = await db
      .select({ id: schema.flashcard.id, lessonId: schema.flashcard.lessonId, front: schema.flashcard.front, back: schema.flashcard.back, isNew: sql<boolean>`0` })
      .from(schema.cardReview)
      .innerJoin(schema.flashcard, eq(schema.flashcard.id, schema.cardReview.flashcardId))
      .where(and(eq(schema.cardReview.userId, u.id), lte(schema.cardReview.due, now), scope))
      .orderBy(asc(schema.cardReview.due))
      .limit(100);

    // New cards only when studying a specific lesson (the global queue is for reviews).
    const fresh = lessonId
      ? await db
          .select({ id: schema.flashcard.id, lessonId: schema.flashcard.lessonId, front: schema.flashcard.front, back: schema.flashcard.back, isNew: sql<boolean>`1` })
          .from(schema.flashcard)
          .leftJoin(schema.cardReview, and(eq(schema.cardReview.flashcardId, schema.flashcard.id), eq(schema.cardReview.userId, u.id)))
          .where(and(scope, isNull(schema.cardReview.userId)))
          .limit(NEW_CARDS_PER_SESSION)
      : [];

    const lessonCodes = new Map(
      (await db.select({ id: schema.lesson.id, code: schema.lesson.code }).from(schema.lesson)).map((l) => [l.id, l.code]),
    );
    const reviews = new Map(
      (await db.select().from(schema.cardReview).where(eq(schema.cardReview.userId, u.id))).map((r) => [r.flashcardId, r]),
    );
    const preview = (id: string) => {
      const r = reviews.get(id);
      return previewIntervals(r ? toCard(r) : createEmptyCard(now), now);
    };
    return c.json(
      [...due, ...shuffle(fresh)].map((card) => ({
        ...card,
        isNew: !!card.isNew,
        lessonCode: lessonCodes.get(card.lessonId) ?? "",
        intervals: preview(card.id),
      })),
    );
  })

  .post("/review", limits.writes, async (c) => {
    const u = c.get("user");
    const { flashcardId, rating } = z.object({ flashcardId: z.string(), rating: z.number().int().min(1).max(4) }).parse(await c.req.json());
    const card = await db.query.flashcard.findFirst({ where: eq(schema.flashcard.id, flashcardId) });
    if (!card) return c.json({ error: "NOT_FOUND" }, 404);
    const existing = await db.query.cardReview.findFirst({
      where: and(eq(schema.cardReview.userId, u.id), eq(schema.cardReview.flashcardId, flashcardId)),
    });
    const now = new Date();
    const next = scheduler.next(existing ? toCard(existing) : createEmptyCard(now), now, rating as Grade).card;
    await db
      .insert(schema.cardReview)
      .values({ userId: u.id, flashcardId, lessonId: card.lessonId, ...fromCard(next) })
      .onConflictDoUpdate({ target: [schema.cardReview.userId, schema.cardReview.flashcardId], set: fromCard(next) });

    const res = await award(u.id, XP.card[rating] ?? 1, "card", [
      { kind: "card_review" },
      { kind: "card_lesson", lessonId: card.lessonId },
    ]);
    // `intervals`: fresh rating previews in case the card comes back in this session.
    return c.json({ ...res, due: next.due, intervals: previewIntervals(next, now) });
  })

  // ----- quiz (auto-graded) -----
  // A quiz is a server-side session: the first check of each question is what counts,
  // so peeking at the answer via /check and then submitting it doesn't work.
  .get("/lessons/:id/quiz", async (c) => {
    const u = c.get("user");
    const row = await visibleLesson(c.req.param("id"), u.role === "admin");
    if (!row) return c.json({ error: "NOT_FOUND" }, 404);
    const n = Math.min(20, Math.max(3, Number(c.req.query("n") ?? 10)));
    const qs = await db
      .select()
      .from(schema.question)
      .where(and(eq(schema.question.lessonId, row.lesson.id), sql`${schema.question.type} != 'open'`));
    // Easy -> hard ramp within a random sample.
    const picked = shuffle(qs).slice(0, n).sort((a, b) => a.difficulty - b.difficulty);
    const sessionId = createQuizSession(u.id, row.lesson.id, picked.map((q) => q.id));
    const xpPerCorrect = quizXpPerCorrect(await todayQuizFactor(u.id, row.lesson.id));
    return c.json({ sessionId, questions: picked.map(publicQuestion), xpPerCorrect });
  })

  .post("/questions/:id/check", limits.writes, async (c) => {
    const u = c.get("user");
    const { sessionId, answer } = z.object({ sessionId: z.string(), answer: z.unknown() }).parse(await c.req.json());
    const session = quizSessions.get(sessionId);
    const qid = c.req.param("id");
    if (!session || session.userId !== u.id || !session.questionIds.includes(qid)) return c.json({ error: "NO_SESSION" }, 400);
    const q = await db.query.question.findFirst({ where: eq(schema.question.id, qid) });
    if (!q || q.type === "open") return c.json({ error: "NOT_FOUND" }, 404);
    const correct = checkAnswer(q.data, answer);
    if (!session.results.has(qid)) session.results.set(qid, correct);
    return c.json({ correct, correctAnswer: correctAnswer(q.data), explanation: explanationOf(q.data) });
  })

  .post("/lessons/:id/quiz/submit", limits.writes, async (c) => {
    const u = c.get("user");
    const lessonId = c.req.param("id");
    const { sessionId } = z.object({ sessionId: z.string() }).parse(await c.req.json());
    const session = quizSessions.get(sessionId);
    if (!session || session.userId !== u.id || session.lessonId !== lessonId) return c.json({ error: "NO_SESSION" }, 400);
    quizSessions.delete(sessionId);
    const max = session.questionIds.length;
    const correct = [...session.results.values()].filter(Boolean).length;

    // Diminishing XP after 3 quizzes on the same lesson per day, to keep the leaderboard fair.
    const factor = await todayQuizFactor(u.id, lessonId);
    const perfect = correct === max && max >= 5;

    await db.insert(schema.attempt).values({ id: nanoid(), userId: u.id, lessonId, kind: "quiz", score: correct, maxScore: max });
    await updateProgress(u.id, lessonId, { quiz: max >= 5 ? correct / max : (correct / max) * 0.6 });
    const res = await award(u.id, (correct * XP.quizCorrect + (perfect ? XP.quizPerfectBonus : 0)) * factor, "quiz", [
      { kind: "quiz_submit", pct: correct / max, lessonId },
    ]);
    return c.json({ ...res, correct, max });
  })

  // ----- open questions (AI graded) -----
  .get("/lessons/:id/open", async (c) => {
    const u = c.get("user");
    const row = await visibleLesson(c.req.param("id"), u.role === "admin");
    if (!row) return c.json({ error: "NOT_FOUND" }, 404);
    const qs = await db
      .select()
      .from(schema.question)
      .where(and(eq(schema.question.lessonId, row.lesson.id), eq(schema.question.type, "open")));
    return c.json(qs.map(publicQuestion));
  })

  .post("/questions/:id/grade", limits.ai, async (c) => {
    const u = c.get("user");
    const q = await db.query.question.findFirst({ where: eq(schema.question.id, c.req.param("id")) });
    if (!q || q.data.type !== "open") return c.json({ error: "NOT_FOUND" }, 404);
    const { answer } = z.object({ answer: z.string().trim().min(3).max(4000) }).parse(await c.req.json());
    const grade = await gradeOpenAnswer({
      question: q.prompt,
      modelAnswer: q.data.modelAnswer,
      rubric: q.data.rubric,
      answer,
      locale: u.locale ?? "nl",
    });
    await db.insert(schema.attempt).values({ id: nanoid(), userId: u.id, lessonId: q.lessonId, kind: "explain", score: grade.score, maxScore: 100 });
    const res = await award(u.id, grade.score * XP.openPerPoint, "open", [{ kind: "open", lessonId: q.lessonId }]);
    return c.json({ ...grade, ...res, modelAnswer: q.data.modelAnswer });
  })

  // ----- explain it back (Feynman) -----
  .post("/lessons/:id/explain", limits.ai, async (c) => {
    const u = c.get("user");
    const lessonId = c.req.param("id");
    const row = await visibleLesson(lessonId, u.role === "admin");
    if (!row) return c.json({ error: "NOT_FOUND" }, 404);
    const { concept, explanation } = z
      .object({ concept: z.string().min(1).max(200), explanation: z.string().trim().min(20).max(4000) })
      .parse(await c.req.json());
    const source = await getPageText(row.lesson.readerId, row.lesson.startPage, row.lesson.endPage);
    const grade = await gradeExplanation({ concept, source, explanation, locale: u.locale ?? "nl" });
    await db.insert(schema.attempt).values({ id: nanoid(), userId: u.id, lessonId, kind: "explain", score: grade.score, maxScore: 100 });
    await updateProgress(u.id, lessonId, { explain: grade.score / 100 });
    const res = await award(u.id, grade.score * XP.explainPerPoint, "explain", [
      { kind: "explain", score: grade.score, lessonId },
    ]);
    return c.json({ ...grade, ...res });
  })

  // ----- AI tutor chat (streaming) -----
  .post("/lessons/:id/chat", limits.ai, async (c) => {
    const u = c.get("user");
    const row = await visibleLesson(c.req.param("id"), u.role === "admin");
    if (!row) return c.json({ error: "NOT_FOUND" }, 404);
    const { messages } = (await c.req.json()) as { messages: UIMessage[] };
    const source = await getPageText(row.lesson.readerId, row.lesson.startPage, row.lesson.endPage);
    const result = streamText({
      model: await getModel("fast"),
      instructions: tutorInstructions({ lessonCode: row.lesson.code, lessonTitle: row.lesson.title, source, locale: u.locale ?? "nl" }),
      messages: await convertToModelMessages(messages.slice(-20)),
      maxOutputTokens: 1200,
    });
    return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
  })

  // ----- leaderboard -----
  .get("/leaderboard", async (c) => {
    const u = c.get("user");
    const period = c.req.query("period") === "all" ? "all" : "week";
    const rows =
      period === "all"
        ? await db
            .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email, nickname: schema.user.nickname, show: schema.user.showOnLeaderboard, xp: schema.userStats.xp, streak: schema.userStats.streak })
            .from(schema.userStats)
            .innerJoin(schema.user, eq(schema.user.id, schema.userStats.userId))
            .where(sql`${schema.userStats.xp} > 0`)
            .orderBy(desc(schema.userStats.xp))
        : await db
            .select({
              id: schema.user.id,
              name: schema.user.name,
              email: schema.user.email,
              nickname: schema.user.nickname,
              show: schema.user.showOnLeaderboard,
              xp: sql<number>`sum(${schema.xpEvent.amount})`.as("week_xp"),
              streak: schema.userStats.streak,
            })
            .from(schema.xpEvent)
            .innerJoin(schema.user, eq(schema.user.id, schema.xpEvent.userId))
            .leftJoin(schema.userStats, eq(schema.userStats.userId, schema.user.id))
            .where(gte(schema.xpEvent.createdAt, startOfWeek()))
            .groupBy(schema.user.id)
            .orderBy(desc(sql`week_xp`));

    const ranked = rows.map((r, i) => ({ ...r, rank: i + 1, xp: Number(r.xp ?? 0) }));
    const visible = ranked.filter((r) => r.show || r.id === u.id);
    const toEntry = (r: (typeof ranked)[number]) => ({
      rank: r.rank,
      name: displayName(r),
      xp: r.xp,
      streak: r.streak ?? 0,
      level: levelFromXp(r.xp).level,
      me: r.id === u.id,
    });
    const me = ranked.find((r) => r.id === u.id);
    return c.json({
      period,
      top: visible.slice(0, 50).map(toEntry),
      me: me ? toEntry(me) : null,
      totalPlayers: ranked.length,
    });
  });

/**
 * When the user last studied each lesson (ms): the latest quiz/explain attempt, card
 * review or lesson_progress update. Progress rows without any progress are skipped,
 * because opening a lesson page creates one.
 */
async function lastStudiedByLesson(userId: string, progress: (typeof schema.lessonProgress.$inferSelect)[]) {
  const [attempts, reviews] = await Promise.all([
    db
      .select({ lessonId: schema.attempt.lessonId, at: sql<number>`max(${schema.attempt.createdAt})` })
      .from(schema.attempt)
      .where(eq(schema.attempt.userId, userId))
      .groupBy(schema.attempt.lessonId),
    db
      .select({ lessonId: schema.cardReview.lessonId, at: sql<number>`max(${schema.cardReview.lastReview})` })
      .from(schema.cardReview)
      .where(eq(schema.cardReview.userId, userId))
      .groupBy(schema.cardReview.lessonId),
  ]);
  const last = new Map<string, number>();
  const bump = (lessonId: string | null, at: number | null) => {
    if (lessonId && at != null && at > (last.get(lessonId) ?? -1)) last.set(lessonId, Number(at));
  };
  for (const r of attempts) bump(r.lessonId, r.at);
  for (const r of reviews) bump(r.lessonId, r.at);
  for (const p of progress) if (p.summaryRead || p.bestQuiz > 0 || p.bestExplain > 0) bump(p.lessonId, p.updatedAt.getTime());
  return last;
}

/** The most recently studied of these lessons, or null when none has been studied. */
function latestLesson(lessonIds: string[], last: Map<string, number>): string | null {
  let best: string | null = null;
  for (const id of lessonIds) {
    const at = last.get(id);
    if (at !== undefined && (best === null || at > last.get(best)!)) best = id;
  }
  return best;
}
