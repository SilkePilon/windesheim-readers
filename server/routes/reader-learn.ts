// Whole-reader learning: the overview and today's mixed session (spec: "The daily session (server)").
import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db";
import { limits } from "../limits";
import { requireUser, type AppEnv } from "../middleware";
import { publicQuestion } from "../lib/answers";
import { previewIntervals, toCard } from "../lib/fsrs";
import { updateProgress } from "../lib/game";
import { dayKey } from "../lib/time";
import { lessonMastery, loadPlanInput, readerOverview, sessionDayStreak, visibleReader } from "../lib/reader-learn";
import { award, createQuizSession, getQuizSession, LISTENED_SHARE } from "./learn";
import { episodeChapterPath } from "../ai/episodes";
import { readyLessons } from "../ai/concept-map";
import { visibleMap } from "../../shared/concept-map";
import { serveChapter } from "../lib/audio-file";
import { quizXpPerCorrect, sessionXpFactor, XP } from "../../shared/game";
import { buildSessionPlan, mainLessonId, sessionMastery } from "../../shared/reader-session";
import * as input from "../lib/input";


const positiveInt = (v: string) => (/^\d{1,6}$/.test(v) && Number(v) >= 1 ? Number(v) : null);

/** The episode of a visible reader's week; `null` means 404 (hidden reader or no such episode). */
async function visibleEpisode(u: Parameters<typeof visibleReader>[0], readerId: string, weekParam: string) {
  const week = positiveInt(weekParam);
  if (week == null) return null;
  const reader = await visibleReader(u, readerId);
  if (!reader) return null;
  const ep = await db.query.readerEpisode.findFirst({
    where: and(eq(schema.readerEpisode.readerId, reader.id), eq(schema.readerEpisode.week, week)),
  });
  return ep ? { reader, week, ep } : null;
}
const episodeTotalMs = (chapters: { durationMs: number }[]) => chapters.reduce((a, c) => a + c.durationMs, 0);

// requireUser per route, not `.use()`: mounted on /api, a router-wide middleware would also run
// (a second session lookup) for every /api request that falls through to `learn`.
export const readerLearn = new Hono<AppEnv>()

  .get("/readers/:id/learn", requireUser, async (c) => {
    const o = await readerOverview(c.get("user"), c.req.param("id"));
    if (!o) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json(o);
  })

  /** The ready concept map, limited to the reader's ready lessons, with the student's mastery per lesson. */
  .get("/readers/:id/concept-map", requireUser, async (c) => {
    const u = c.get("user");
    const reader = await visibleReader(u, c.req.param("id"));
    if (!reader) return c.json({ error: "NOT_FOUND" }, 404);
    const m = await db.query.conceptMap.findFirst({ where: eq(schema.conceptMap.readerId, reader.id) });
    if (m?.status !== "ready" || !m.data) return c.json({ error: "NOT_FOUND" }, 404);
    const lessons = await readyLessons(reader.id);
    const mastery = await lessonMastery(u.id, lessons.map((l) => l.id));
    return c.json({
      ...visibleMap(m.data, new Set(lessons.map((l) => l.id))),
      lessons: lessons.map((l) => ({ id: l.id, code: l.code, title: l.title, week: l.week, mastery: mastery.get(l.id) ?? 0 })),
    });
  })

  // ----- weekly episodes (audio; students never get the script) -----
  .get("/readers/:id/episodes/:week", requireUser, async (c) => {
    const u = c.get("user");
    const found = await visibleEpisode(u, c.req.param("id"), c.req.param("week"));
    if (!found) return c.json({ error: "NOT_FOUND" }, 404);
    const { reader, week, ep } = found;
    if (ep.status !== "ready" || !ep.chapters.length) return c.json({ error: "AUDIO_NOT_READY" }, 409);
    const p = await db.query.episodeProgress.findFirst({
      where: and(eq(schema.episodeProgress.userId, u.id), eq(schema.episodeProgress.readerId, reader.id), eq(schema.episodeProgress.week, week)),
    });
    return c.json({
      week,
      title: ep.title ?? "",
      status: ep.status,
      chapters: ep.chapters.map((ch) => ({ n: ch.n, title: ep.script?.chapters[ch.n - 1]?.title ?? "", durationMs: ch.durationMs })),
      totalMs: episodeTotalMs(ep.chapters),
      positionMs: p?.positionMs ?? 0,
      listenMs: p?.listenMs ?? 0,
    });
  })

  .get("/readers/:id/episodes/:week/:file{[0-9]+\\.mp3}", requireUser, async (c) => {
    const found = await visibleEpisode(c.get("user"), c.req.param("id"), c.req.param("week"));
    if (!found) return c.json({ error: "NOT_FOUND" }, 404);
    const n = Number.parseInt(c.req.param("file"), 10);
    if (found.ep.status !== "ready" || !found.ep.chapters.some((ch) => ch.n === n)) return c.json({ error: "NOT_FOUND" }, 404);
    return serveChapter(c, episodeChapterPath(found.reader.id, found.week, n));
  })

  /** Resume position + listen credit. Pays XP.episodeListen once per student and episode; never touches lesson progress. */
  .post("/readers/:id/episodes/:week/progress", requireUser, limits.writes, async (c) => {
    const u = c.get("user");
    const found = await visibleEpisode(u, c.req.param("id"), c.req.param("week"));
    if (!found) return c.json({ error: "NOT_FOUND" }, 404);
    const { reader, week, ep } = found;
    const body = input.audioProgress.parse(await c.req.json());
    if (ep.status !== "ready" || !ep.chapters.length) return c.json({ error: "AUDIO_NOT_READY" }, 409);
    const totalMs = episodeTotalMs(ep.chapters);
    const positionMs = Math.min(body.positionMs, totalMs);
    const heard = Math.min(body.heardMs ?? body.positionMs, totalMs);
    const [row] = await db
      .insert(schema.episodeProgress)
      .values({ userId: u.id, readerId: reader.id, week, positionMs, listenMs: heard })
      .onConflictDoUpdate({
        target: [schema.episodeProgress.userId, schema.episodeProgress.readerId, schema.episodeProgress.week],
        set: { positionMs, listenMs: sql`max(${schema.episodeProgress.listenMs}, ${heard})`, updatedAt: new Date() },
      })
      .returning({ listenMs: schema.episodeProgress.listenMs });
    const listenMs = row?.listenMs ?? heard;
    let reward = null;
    if (listenMs >= LISTENED_SHARE * totalMs) {
      // Claimed atomically, so two concurrent posts can't both pay.
      const claimed = await db
        .update(schema.episodeProgress)
        .set({ awarded: true })
        .where(
          and(
            eq(schema.episodeProgress.userId, u.id),
            eq(schema.episodeProgress.readerId, reader.id),
            eq(schema.episodeProgress.week, week),
            eq(schema.episodeProgress.awarded, false),
          ),
        )
        .returning({ week: schema.episodeProgress.week });
      if (claimed.length) reward = await award(u.id, XP.episodeListen, "episode");
    }
    return c.json({ listenMs, award: reward });
  })

  /** Today's session. The plan is seeded per user, reader, day and completed sessions, so a refresh gives the same one. */
  .get("/readers/:id/session", requireUser, limits.writes, async (c) => {
    const u = c.get("user");
    const now = new Date();
    const data = await loadPlanInput(u, c.req.param("id"), now);
    if (!data) return c.json({ error: "NOT_FOUND" }, 404);
    const plan = buildSessionPlan(data.input);
    const xpPerCorrect = quizXpPerCorrect(sessionXpFactor(data.sessionsToday));
    if (plan.needsStart) return c.json({ sessionId: null, needsStart: true, xpPerCorrect, items: [] });

    const code = new Map(data.lessons.map((l) => [l.id, l.code]));
    const cardIds = plan.items.filter((i) => i.kind === "card").map((i) => i.id);
    const flashcards = new Map(
      cardIds.length
        ? (await db.select().from(schema.flashcard).where(inArray(schema.flashcard.id, cardIds))).map((f) => [f.id, f])
        : [],
    );
    type Question = ReturnType<typeof publicQuestion> & { lessonId: string; code: string };
    type Item =
      | { kind: "card"; card: { id: string; lessonId: string; lessonCode: string; front: string; back: string; isNew: boolean; intervals: ReturnType<typeof previewIntervals> } }
      | { kind: "question" | "open"; question: Question };
    const items = plan.items.flatMap((item): Item[] => {
      if (item.kind === "card") {
        const f = flashcards.get(item.id);
        const r = data.reviews.get(item.id);
        if (!f || !r) return [];
        return [
          {
            kind: "card",
            card: { id: f.id, lessonId: f.lessonId, lessonCode: code.get(f.lessonId) ?? "", front: f.front, back: f.back, isNew: false, intervals: previewIntervals(toCard(r), now) },
          },
        ];
      }
      const q = data.questions.get(item.id);
      if (!q) return [];
      return [{ kind: item.kind, question: { ...publicQuestion(q), lessonId: q.lessonId, code: code.get(q.lessonId) ?? "" } }];
    });
    const questionIds = items.flatMap((i) => (i.kind === "card" ? [] : [i.question.id]));
    const sessionId = createQuizSession(u.id, null, questionIds, data.reader.id, { cards: plan.counts.cards });
    return c.json({ sessionId, needsStart: false, xpPerCorrect, items });
  })

  .post("/readers/:id/session/submit", requireUser, limits.writes, async (c) => {
    const u = c.get("user");
    const { sessionId } = input.sessionSubmit.parse(await c.req.json());
    const reader = await visibleReader(u, c.req.param("id"));
    if (!reader) return c.json({ error: "NOT_FOUND" }, 404);
    // Checked and claimed in one synchronous step, so two concurrent submits can't both pay.
    const session = getQuizSession(sessionId);
    if (!session || session.userId !== u.id || session.readerId !== reader.id || session.submitted) return c.json({ error: "NO_SESSION" }, 400);
    session.submitted = true;

    // Only checked quiz questions count (open answers are graded on their own).
    const checked = [...session.results.keys()];
    const rows = checked.length
      ? await db
          .select({ id: schema.question.id, lessonId: schema.question.lessonId, code: schema.lesson.code })
          .from(schema.question)
          .innerJoin(schema.lesson, eq(schema.lesson.id, schema.question.lessonId))
          .where(inArray(schema.question.id, checked))
      : [];
    const per = new Map<string, { lessonId: string; code: string; correct: number; total: number }>();
    for (const r of rows) {
      const l = per.get(r.lessonId) ?? { lessonId: r.lessonId, code: r.code, correct: 0, total: 0 };
      l.total++;
      if (session.results.get(r.id)) l.correct++;
      per.set(r.lessonId, l);
    }
    const perLesson = [...per.values()];
    const correct = perLesson.reduce((s, l) => s + l.correct, 0);
    const total = perLesson.reduce((s, l) => s + l.total, 0);

    // The day record first: its atomic increment decides which session of the day this is.
    const now = new Date();
    const day = dayKey(now);
    const [rec] = await db
      .insert(schema.readerSessionDay)
      .values({ userId: u.id, readerId: reader.id, day, sessions: 1, completedAt: now, cards: session.cards ?? 0, questions: total, correct })
      .onConflictDoUpdate({
        target: [schema.readerSessionDay.userId, schema.readerSessionDay.readerId, schema.readerSessionDay.day],
        set: {
          sessions: sql`${schema.readerSessionDay.sessions} + 1`,
          completedAt: sql`coalesce(${schema.readerSessionDay.completedAt}, ${now.getTime()})`,
          cards: sql`${schema.readerSessionDay.cards} + ${session.cards ?? 0}`,
          questions: sql`${schema.readerSessionDay.questions} + ${total}`,
          correct: sql`${schema.readerSessionDay.correct} + ${correct}`,
        },
      })
      .returning({ sessions: schema.readerSessionDay.sessions });
    const xp = Math.round(correct * XP.quizCorrect * sessionXpFactor((rec?.sessions ?? 1) - 1));
    if (xp > 0) {
      await db
        .update(schema.readerSessionDay)
        .set({ xp: sql`${schema.readerSessionDay.xp} + ${xp}` })
        .where(and(eq(schema.readerSessionDay.userId, u.id), eq(schema.readerSessionDay.readerId, reader.id), eq(schema.readerSessionDay.day, day)));
    }

    if (perLesson.length) {
      await db
        .insert(schema.attempt)
        .values(perLesson.map((l) => ({ id: nanoid(), userId: u.id, lessonId: l.lessonId, kind: "session" as const, score: l.correct, maxScore: l.total })));
    }
    // Mastery before this session's update, for the main-lesson tie-break (weakest wins).
    const mastery = await lessonMastery(u.id, perLesson.map((l) => l.lessonId));
    for (const l of perLesson) {
      const m = sessionMastery(l.correct, l.total);
      if (m != null) await updateProgress(u.id, l.lessonId, { quiz: m });
    }
    const main = mainLessonId(perLesson.map((l) => ({ lessonId: l.lessonId, total: l.total, mastery: mastery.get(l.lessonId) ?? 0 })));
    const res = await award(u.id, xp, "session", main && total ? [{ kind: "quiz_submit", pct: correct / total, lessonId: main }] : [], main ?? undefined);
    const dayStreak = await sessionDayStreak(u.id, reader.id, now);
    return c.json({ xp, correct, total, perLesson, dayStreak, award: res });
  });
