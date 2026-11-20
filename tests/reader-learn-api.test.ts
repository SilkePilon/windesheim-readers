// The whole-reader daily session and overview API (spec: "The daily session (server)").
import { afterAll, beforeAll, describe, expect, setSystemTime, spyOn, test } from "bun:test";
import { websocket } from "@hono/bun";
import { and, eq, inArray } from "drizzle-orm";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { resetEmailGate } from "../server/lib/email-gate";
import { dayKey } from "../server/lib/time";

runMigrations();
const { app } = await import("../server/app");
const { getQuizSession } = await import("../server/routes/learn");

let server: ReturnType<typeof Bun.serve>;
let base = "";
const saved = { header: env.clientIpHeader, disabled: env.rateLimitDisabled, stub: process.env.AI_STUB };

const links = new Map<string, string>();
const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
  const m = /\[magic-link\] (\S+)\n\s+(\S+)/.exec(String(args[0]));
  if (m) links.set(m[1]!, m[2]!);
});

let n = 0;
async function login(email: string) {
  links.delete(email);
  const ip = `198.42.${Math.floor(++n / 250)}.${n % 250}`;
  const r = await fetch(`${base}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:5173", "x-test-ip": ip },
    body: JSON.stringify({ email, callbackURL: "/" }),
  });
  expect(r.status).toBe(200);
  const url = new URL(links.get(email)!);
  const v = await fetch(`${base}${url.pathname}${url.search}`, { redirect: "manual", headers: { "x-test-ip": ip } });
  return v.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

type Who = "student" | "fresh" | "admin";
const EMAILS: Record<Who, string> = {
  student: "rla-student@student.windesheim.nl",
  fresh: "rla-fresh@student.windesheim.nl",
  admin: "rla-admin@windesheim.nl",
};
const cookies: Record<Who, string> = { student: "", fresh: "", admin: "" };
const ids: Record<Who, string> = { student: "", fresh: "", admin: "" };

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY);

const R = "rl-reader";
const R_HIDDEN = "rl-hidden";
const L = ["rl-L1", "rl-L2", "rl-L3", "rl-L4"] as const;
const L_PENDING = "rl-L5";
const L_HIDDEN = "rl-H1";
const qid = (lesson: string, i: number) => `${lesson}-q${i}`;
const OPEN_Q = "rl-L1-open";

function seed() {
  db.insert(schema.reader)
    .values([
      { id: R, title: "Reader", fileName: "a.pdf", status: "ready", published: true },
      { id: R_HIDDEN, title: "Hidden", fileName: "b.pdf", status: "ready", published: false },
    ])
    .run();
  db.insert(schema.lesson)
    .values([
      ...L.map((id, i) => ({ id, readerId: R, code: `1.${i + 1}`, title: `Les ${i + 1}`, week: 1, position: i, startPage: 1, endPage: 2, status: "ready" as const })),
      { id: L_PENDING, readerId: R, code: "1.5", title: "Les 5", week: 1, position: 4, startPage: 1, endPage: 2, status: "pending" as const },
      { id: L_HIDDEN, readerId: R_HIDDEN, code: "9.1", title: "Hidden", week: 1, position: 0, startPage: 1, endPage: 2, status: "ready" as const },
    ])
    .run();
  // 4 multiple choice questions per lesson (option 0 is right), one open question in lesson 1.
  db.insert(schema.question)
    .values([
      ...[...L, L_PENDING, L_HIDDEN].flatMap((lessonId) =>
        [1, 2, 3, 4].map((i) => ({
          id: qid(lessonId, i),
          lessonId,
          type: "mc" as const,
          prompt: `Vraag ${i}`,
          data: { type: "mc" as const, options: ["goed", "fout"], answer: 0, explanation: "Uitleg" },
        })),
      ),
      { id: OPEN_Q, lessonId: L[0], type: "open" as const, prompt: "Leg uit", data: { type: "open" as const, modelAnswer: "Model", rubric: ["punt"] } },
      {
        id: `${L_PENDING}-open`,
        lessonId: L_PENDING,
        type: "open" as const,
        prompt: "Leg uit",
        data: { type: "open" as const, modelAnswer: "Model", rubric: ["punt"] },
      },
    ])
    .run();
  db.insert(schema.flashcard)
    .values([
      { id: "rl-c11", lessonId: L[0], front: "F11", back: "B11" },
      { id: "rl-c12", lessonId: L[0], front: "F12", back: "B12" },
      { id: "rl-c21", lessonId: L[1], front: "F21", back: "B21" },
      { id: "rl-c22", lessonId: L[1], front: "F22", back: "B22" },
      { id: "rl-c31", lessonId: L[2], front: "F31", back: "B31" },
      { id: "rl-c41", lessonId: L[3], front: "F41", back: "B41" },
    ])
    .run();
  const review = (flashcardId: string, lessonId: string, state: number, dueDays: number) => ({
    userId: ids.student,
    flashcardId,
    lessonId,
    due: at(dueDays),
    stability: 5,
    difficulty: 5,
    elapsedDays: 3,
    scheduledDays: 5,
    learningSteps: 0,
    reps: 3,
    lapses: state === 3 ? 1 : 0,
    state,
    lastReview: at(-4),
  });
  db.insert(schema.cardReview)
    .values([review("rl-c11", L[0], 2, -1), review("rl-c12", L[0], 2, -2), review("rl-c21", L[1], 3, -1), review("rl-c22", L[1], 2, 5)])
    .run();
  db.insert(schema.lessonProgress)
    .values([
      { userId: ids.student, lessonId: L[1], bestQuiz: 0.5 },
      { userId: ids.student, lessonId: L[2], summaryRead: true },
      // Opened but nothing done: lesson 4 is not started.
      { userId: ids.student, lessonId: L[3] },
    ])
    .run();
}

beforeAll(async () => {
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch, websocket });
  base = `http://127.0.0.1:${server.port}`;
  env.clientIpHeader = "x-test-ip";
  env.rateLimitDisabled = true;
  process.env.AI_STUB = "1";
  for (const who of ["student", "fresh", "admin"] as const) cookies[who] = await login(EMAILS[who]);
  db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.email, EMAILS.admin)).run();
  for (const who of ["student", "fresh", "admin"] as const) ids[who] = db.select().from(schema.user).where(eq(schema.user.email, EMAILS[who])).get()!.id;
  seed();
});
afterAll(() => {
  // Other files share this database (and read the new tables unscoped): leave nothing behind.
  db.delete(schema.reader).where(inArray(schema.reader.id, [R, R_HIDDEN])).run();
  server.stop(true);
  logSpy.mockRestore();
  resetEmailGate();
  Object.assign(env, { clientIpHeader: saved.header, rateLimitDisabled: saved.disabled });
  if (saved.stub === undefined) delete process.env.AI_STUB;
  else process.env.AI_STUB = saved.stub;
});

const req = (who: Who, path: string, body?: unknown) =>
  fetch(`${base}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: cookies[who], ...(body === undefined ? {} : { "content-type": "application/json", origin: "http://localhost:5173" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function ok<T = any>(who: Who, path: string, body?: unknown): Promise<T> {
  const r = await req(who, path, body);
  expect(r.status).toBe(200);
  return (await r.json()) as T;
}

type Item = { kind: "card"; card: { id: string; lessonId: string; lessonCode: string } } | { kind: "question" | "open"; question: { id: string; lessonId: string; code: string; type: string } };
type Session = { sessionId: string | null; needsStart: boolean; xpPerCorrect: number; resumed?: boolean; items: Item[] };
const questionsOf = (s: Session) => s.items.flatMap((i) => (i.kind === "question" ? [i.question] : []));
const check = (sessionId: string, questionId: string, right: boolean) => ok("student", `/questions/${questionId}/check`, { sessionId, answer: right ? 0 : 1 });

/** A new session, then 3 lesson-1 questions answered, `right` of them correctly. */
async function playLesson1(right: number) {
  const s = await ok<Session>("student", `/readers/${R}/session`);
  const l1 = questionsOf(s).filter((q) => q.lessonId === L[0]);
  expect(l1.length).toBe(3);
  for (const [i, q] of l1.entries()) await check(s.sessionId!, q.id, i < right);
  return { s, l1 };
}

describe("GET /readers/:id/learn", () => {
  test("student: started reader overview", async () => {
    const o = await ok("student", `/readers/${R}/learn`);
    expect(o.reader).toEqual({ id: R, title: "Reader", examDate: null });
    expect(o.needsStart).toBe(false);
    expect(o.due).toBe(3);
    expect(o.pullForward).toBe(0);
    expect(o.daysToExam).toBeNull();
    expect(o.progress.totalLessons).toBe(4);
    expect(o.today).toEqual({ done: false, xp: 0, sessions: 0 });
    expect(o.sessionDayStreak).toBe(0);
    expect(o.estimate.cards).toBe(3);
    expect(o.estimate.questions).toBe(9);
    expect(o.estimate.open).toBe(1);
    expect(o.estimate.minutes).toBe(Math.round((3 * 10 + 9 * 30 + 120) / 60));
    expect(o.episodes).toEqual([]);
    expect(o.conceptMap).toBe(false);
    expect(o.weakLessons.every((l: { id: string }) => [L[0], L[1], L[2]].includes(l.id as never))).toBe(true);
  });

  test("signed out: 401", async () => {
    expect((await fetch(`${base}/api/readers/${R}/learn`)).status).toBe(401);
    expect((await fetch(`${base}/api/readers/${R}/session`)).status).toBe(401);
  });

  test("unpublished reader: 404 for a student, 200 for an admin", async () => {
    expect((await req("student", `/readers/${R_HIDDEN}/learn`)).status).toBe(404);
    expect((await req("student", `/readers/${R_HIDDEN}/session`)).status).toBe(404);
    expect((await req("student", `/readers/nope/learn`)).status).toBe(404);
    const o = await ok("admin", `/readers/${R_HIDDEN}/learn`);
    expect(o.reader.id).toBe(R_HIDDEN);
  });

  test("fresh student: needs to start, current lesson is the first", async () => {
    const o = await ok("fresh", `/readers/${R}/learn`);
    expect(o.needsStart).toBe(true);
    expect(o.currentLessonId).toBe(L[0]);
    expect(o.due).toBe(0);
    expect(o.estimate).toEqual({ cards: 0, questions: 0, open: 0, minutes: 0 });
    const s = await ok<Session>("fresh", `/readers/${R}/session`);
    expect(s).toMatchObject({ sessionId: null, needsStart: true, items: [] });
  });
});

describe("GET /readers/:id/session", () => {
  test("peek then replay: after a check, a refresh is the same session and the first check stands", async () => {
    // First of the session tests (nothing else open yet), and created in the past, so it has
    // expired by the time the later tests run.
    setSystemTime(new Date(Date.now() - 4 * 3600_000));
    try {
      const a = await ok<Session>("student", `/readers/${R}/session`);
      const q = questionsOf(a)[0]!;
      await check(a.sessionId!, q.id, false);
      const b = await ok<Session>("student", `/readers/${R}/session`);
      expect(b.sessionId).toBe(a.sessionId);
      // The checked question isn't offered again; the rest is unchanged.
      expect(b.items).toEqual(a.items.filter((i) => i.kind === "card" || i.question.id !== q.id));
      const again = await check(b.sessionId!, q.id, true);
      expect(again.correct).toBe(true);
      expect(getQuizSession(a.sessionId!)!.results.get(q.id)).toBe(false);
    } finally {
      setSystemTime();
      // The checks were recorded per question; the later tests start from a clean slate.
      db.delete(schema.questionResult).where(eq(schema.questionResult.userId, ids.student)).run();
    }
  });

  test("only started, ready lessons; cards are the due cards; at most 3 questions per lesson", async () => {
    const s = await ok<Session>("student", `/readers/${R}/session`);
    expect(s.needsStart).toBe(false);
    expect(typeof s.sessionId).toBe("string");
    expect(s.xpPerCorrect).toBe(10);
    expect(s.resumed).toBeUndefined();
    const lessons = s.items.map((i) => (i.kind === "card" ? i.card.lessonId : i.question.lessonId));
    expect(lessons).not.toContain(L[3]);
    expect(lessons).not.toContain(L_PENDING);
    const cards = s.items.flatMap((i) => (i.kind === "card" ? [i.card] : []));
    expect(cards.map((c) => c.id).sort()).toEqual(["rl-c11", "rl-c12", "rl-c21"]);
    expect(cards.find((c) => c.id === "rl-c21")!.lessonCode).toBe("1.2");
    const qs = questionsOf(s);
    expect(qs.length).toBe(9);
    for (const l of [L[0], L[1], L[2]]) expect(qs.filter((q) => q.lessonId === l).length).toBeLessThanOrEqual(3);
    expect(qs.every((q) => q.type === "mc" && typeof q.code === "string")).toBe(true);
    // Card items keep the review-queue shape.
    const card = s.items.find((i) => i.kind === "card")!;
    expect(Object.keys((card as { card: object }).card).sort()).toEqual(["back", "front", "id", "intervals", "isNew", "lessonCode", "lessonId"]);
    const open = s.items.filter((i) => i.kind === "open");
    expect(open.length).toBe(1);
  });

  test("a refresh gives the same open session back", async () => {
    const a = await ok<Session>("student", `/readers/${R}/session`);
    const b = await ok<Session>("student", `/readers/${R}/session`);
    expect(b.sessionId).toBe(a.sessionId);
    expect(b.items).toEqual(a.items);
    expect(b.resumed).toBe(true);
  });
});

describe("check and submit", () => {
  test("submitting without answering a quiz question doesn't count as a session", async () => {
    const s = await ok<Session>("student", `/readers/${R}/session`);
    expect(questionsOf(s).length).toBeGreaterThan(0);
    const res = await ok("student", `/readers/${R}/session/submit`, { sessionId: s.sessionId });
    expect(res).toMatchObject({ xp: 0, correct: 0, total: 0, perLesson: [], award: null });
    const day = db
      .select()
      .from(schema.readerSessionDay)
      .where(and(eq(schema.readerSessionDay.userId, ids.student), eq(schema.readerSessionDay.readerId, R), eq(schema.readerSessionDay.day, dayKey())))
      .get();
    expect(day).toBeUndefined();
    const o = await ok("student", `/readers/${R}/learn`);
    expect(o.today).toEqual({ done: false, xp: 0, sessions: 0 });
    // The session is used up all the same.
    expect((await req("student", `/readers/${R}/session/submit`, { sessionId: s.sessionId })).status).toBe(400);
    // The next real session still pays the full factor (checked in the test below: 2 correct = 20 XP).
    expect((await ok<Session>("student", `/readers/${R}/session`)).xpPerCorrect).toBe(10);
  });

  test("checks across lessons, first check counts, submit pays and records", async () => {
    const { s, l1 } = await playLesson1(2);
    const l2 = questionsOf(s).find((q) => q.lessonId === L[1])!;
    await check(s.sessionId!, l2.id, false);
    // The first check is stored; a second check doesn't change the session result.
    const again = await check(s.sessionId!, l1[2]!.id, true);
    expect(again.correct).toBe(true);
    const qr = (id: string) =>
      db.select().from(schema.questionResult).where(and(eq(schema.questionResult.userId, ids.student), eq(schema.questionResult.questionId, id))).get();
    expect(qr(l2.id)).toMatchObject({ seen: 1, lastCorrect: false });
    expect(qr(l1[0]!.id)).toMatchObject({ seen: 1, lastCorrect: true });
    expect(qr(l1[2]!.id)).toMatchObject({ seen: 1, lastCorrect: false });

    const res = await ok("student", `/readers/${R}/session/submit`, { sessionId: s.sessionId });
    expect(res.xp).toBe(20);
    expect(res.correct).toBe(2);
    expect(res.total).toBe(4);
    expect(res.perLesson).toContainEqual({ lessonId: L[0], code: "1.1", correct: 2, total: 3 });
    expect(res.perLesson).toContainEqual({ lessonId: L[1], code: "1.2", correct: 0, total: 1 });
    expect(res.dayStreak).toBe(1);
    expect(res.award.gained).toBeGreaterThanOrEqual(20);

    const p = (lessonId: string) =>
      db.select().from(schema.lessonProgress).where(and(eq(schema.lessonProgress.userId, ids.student), eq(schema.lessonProgress.lessonId, lessonId))).get()!;
    expect(p(L[0]).bestQuiz).toBeCloseTo((2 / 3) * 0.6, 10);
    expect(p(L[1]).bestQuiz).toBe(0.5); // 1 question: no mastery update
    const attempts = db.select().from(schema.attempt).where(eq(schema.attempt.userId, ids.student)).all();
    expect(attempts.filter((a) => a.kind === "session").map((a) => [a.lessonId, a.score, a.maxScore]).sort()).toEqual([
      [L[0], 2, 3],
      [L[1], 0, 1],
    ]);
    expect(attempts.some((a) => a.kind === "quiz")).toBe(false);

    const second = await req("student", `/readers/${R}/session/submit`, { sessionId: s.sessionId });
    expect(second.status).toBe(400);
    expect(await second.json()).toEqual({ error: "NO_SESSION" });
    // A submitted session no longer accepts checks.
    expect((await req("student", `/questions/${l1[0]!.id}/check`, { sessionId: s.sessionId, answer: 0 })).status).toBe(400);
  });

  test("sessions and lesson quizzes don't accept each other's ids", async () => {
    const s = await ok<Session>("student", `/readers/${R}/session`);
    expect((await req("student", `/lessons/${L[0]}/quiz/submit`, { sessionId: s.sessionId })).status).toBe(400);
    const quiz = await ok("student", `/lessons/${L[0]}/quiz`);
    const r = await req("student", `/readers/${R}/session/submit`, { sessionId: quiz.sessionId });
    expect(r.status).toBe(400);
    // Another reader's id in the path.
    expect((await req("admin", `/readers/${R_HIDDEN}/session/submit`, { sessionId: s.sessionId })).status).toBe(400);
  });

  test("2nd session of the day pays 50%, 3rd 10%; day record counts 3", async () => {
    const s2 = await ok<Session>("student", `/readers/${R}/session`);
    expect(s2.xpPerCorrect).toBe(5);
    const two = await playLesson1(3);
    const r2 = await ok("student", `/readers/${R}/session/submit`, { sessionId: two.s.sessionId });
    expect(r2.xp).toBe(15);
    const three = await playLesson1(3);
    const r3 = await ok("student", `/readers/${R}/session/submit`, { sessionId: three.s.sessionId });
    expect(r3.xp).toBe(3);
    const day = db
      .select()
      .from(schema.readerSessionDay)
      .where(and(eq(schema.readerSessionDay.userId, ids.student), eq(schema.readerSessionDay.readerId, R), eq(schema.readerSessionDay.day, dayKey())))
      .get()!;
    expect(day.sessions).toBe(3);
    expect(day.xp).toBe(20 + 15 + 3);
    expect(day.questions).toBe(4 + 3 + 3);
    expect(day.correct).toBe(2 + 3 + 3);
    expect(day.completedAt).not.toBeNull();
    const o = await ok("student", `/readers/${R}/learn`);
    expect(o.today).toEqual({ done: true, xp: 38, sessions: 3 });
    expect(o.sessionDayStreak).toBe(1);
  });

  test("a session older than 3 hours can't be checked or submitted", async () => {
    const s = await ok<Session>("student", `/readers/${R}/session`);
    const q = questionsOf(s)[0]!;
    setSystemTime(new Date(Date.now() + 3 * 3600_000 + 60_000));
    try {
      expect((await req("student", `/questions/${q.id}/check`, { sessionId: s.sessionId, answer: 0 })).status).toBe(400);
      const r = await req("student", `/readers/${R}/session/submit`, { sessionId: s.sessionId });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "NO_SESSION" });
    } finally {
      setSystemTime();
    }
  });

  test("the lesson quiz XP is untouched by reader sessions", async () => {
    const quiz = await ok("student", `/lessons/${L[0]}/quiz`);
    expect(quiz.xpPerCorrect).toBe(10);
  });
});

describe("open answer in a session", () => {
  test("grade with the sessionId raises bestExplain at 0.6 weight; without it, not", async () => {
    const s = await ok<Session>("student", `/readers/${R}/session`);
    const open = s.items.find((i) => i.kind === "open") as { question: { id: string; lessonId: string } };
    expect(open.question.id).toBe(OPEN_Q);
    const bestExplain = () =>
      db.select().from(schema.lessonProgress).where(and(eq(schema.lessonProgress.userId, ids.student), eq(schema.lessonProgress.lessonId, L[0]))).get()!.bestExplain;
    expect(bestExplain()).toBe(0);
    const g = await ok("student", `/questions/${OPEN_Q}/grade`, { answer: "abcdefghij", sessionId: s.sessionId });
    expect(g.score).toBe(50);
    expect(bestExplain()).toBeCloseTo(0.3, 10);
    const g2 = await ok("student", `/questions/${OPEN_Q}/grade`, { answer: "a".repeat(80) });
    expect(g2.score).toBe(100);
    expect(bestExplain()).toBeCloseTo(0.3, 10);
  });
});

describe("exam pull-forward", () => {
  test("a review card due after a near exam joins the session", async () => {
    db.update(schema.reader).set({ examDate: at(10).getTime() }).where(eq(schema.reader.id, R)).run();
    db.insert(schema.cardReview)
      .values({
        userId: ids.student,
        flashcardId: "rl-c31",
        lessonId: L[2],
        due: at(30),
        stability: 30,
        difficulty: 5,
        elapsedDays: 3,
        scheduledDays: 30,
        learningSteps: 0,
        reps: 4,
        lapses: 0,
        state: 2,
        lastReview: at(-1),
      })
      .run();
    // The session that was open was built before the exam date: used up (an empty submit doesn't count).
    const open = await ok<Session>("student", `/readers/${R}/session`);
    expect((await ok("student", `/readers/${R}/session/submit`, { sessionId: open.sessionId })).award).toBeNull();
    const o = await ok("student", `/readers/${R}/learn`);
    expect(o.daysToExam).toBe(10);
    expect(o.pullForward).toBeGreaterThanOrEqual(1);
    expect(o.due).toBe(3);
    const s = await ok<Session>("student", `/readers/${R}/session`);
    const cards = s.items.flatMap((i) => (i.kind === "card" ? [i.card.id] : []));
    expect(cards).toContain("rl-c31");
    // Due after the exam, but not a review card in state 2/3 → never pulled; due before the exam → not pulled either.
    expect(cards).not.toContain("rl-c22");
  });
});

describe("resuming an open session", () => {
  test("a refresh leaves out the cards reviewed, questions checked and open answers graded in it", async () => {
    const a = await ok<Session>("student", `/readers/${R}/session`);
    const card = a.items.find((i) => i.kind === "card") as { card: { id: string } };
    const q = questionsOf(a)[0]!;
    const open = a.items.find((i) => i.kind === "open") as { question: { id: string } };
    expect(card && q && open).toBeTruthy();
    await ok("student", `/review`, { flashcardId: card.card.id, rating: 3 });
    await check(a.sessionId!, q.id, true);
    await ok("student", `/questions/${open.question.id}/grade`, { answer: "abcdefghij", sessionId: a.sessionId });
    const b = await ok<Session>("student", `/readers/${R}/session`);
    expect(b.sessionId).toBe(a.sessionId);
    expect(b.resumed).toBe(true);
    const keys = (s: Session) => s.items.map((i) => (i.kind === "card" ? i.card.id : i.question.id));
    expect(keys(b)).not.toContain(card.card.id);
    expect(keys(b)).not.toContain(q.id);
    expect(keys(b)).not.toContain(open.question.id);
    expect(keys(b)).toEqual(keys(a).filter((k) => ![card.card.id, q.id, open.question.id].includes(k)));
  });
});
