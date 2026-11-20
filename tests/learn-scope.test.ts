// Pins /api/review/queue, /api/readers and cardMasteryByLesson against a reference that does
// it the old way (read every lesson and every review of the user), so scoping those queries
// can't change a single value in the responses.
import { afterAll, beforeAll, describe, expect, setSystemTime, spyOn, test } from "bun:test";
import { websocket } from "@hono/bun";
import { and, eq } from "drizzle-orm";
import { fsrs, createEmptyCard, Rating, type Card, type Grade } from "ts-fsrs";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { resetEmailGate } from "../server/lib/email-gate";
import { cardMasteryByLesson } from "../server/lib/game";
import { computeMastery } from "../shared/game";

runMigrations();
const { app } = await import("../server/app");

let server: ReturnType<typeof Bun.serve>;
let base = "";
const saved = { header: env.clientIpHeader, disabled: env.rateLimitDisabled };

const links = new Map<string, string>();
const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
  const m = /\[magic-link\] (\S+)\n\s+(\S+)/.exec(String(args[0]));
  if (m) links.set(m[1]!, m[2]!);
});

let n = 0;
async function login(email: string) {
  links.delete(email);
  const ip = `198.41.${Math.floor(++n / 250)}.${n % 250}`;
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

const STUDENT = "ls-student@student.windesheim.nl";
const ADMIN = "ls-admin@windesheim.nl";
const cookies = { student: "", admin: "" };
const ids = { student: "", admin: "" };

// One fixed clock for the server and the reference: FSRS fuzz is seeded by the review time.
const NOW = new Date(Math.floor(Date.now() / 1000) * 1000);
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const R_PUB = "ls-reader-pub";
const R_HIDDEN = "ls-reader-hidden";
const LESSONS = [
  { id: "ls-L1", readerId: R_PUB, code: "1.1A", position: 0 },
  { id: "ls-L2", readerId: R_PUB, code: "1.2A", position: 1 },
  { id: "ls-L3", readerId: R_HIDDEN, code: "2.1A", position: 0 },
] as const;
const card = (lesson: number, i: number) => `ls-c${lesson}${i}`;

/** [lesson index, card index, state, due in days, last review in days] per review row. */
type Seed = [number, number, number, number, number | null];
const REVIEWS: Record<"student" | "admin", Seed[]> = {
  student: [
    [1, 1, 2, -2, -10], // L1: review, due
    [1, 2, 1, 3, -1], // L1: learning, not due
    [2, 1, 3, -1, -4], // L2: relearning, due
    [2, 2, 2, 5, -6], // L2: review, not due
    [2, 3, 0, -3, null], // L2: state new, due
    [3, 1, 2, -5, -2], // L3 (hidden reader): review, due
    [3, 2, 1, 2, -3], // L3: learning, not due
  ],
  admin: [
    [1, 3, 2, -1, -7],
    [3, 1, 3, -2, -1],
    [3, 3, 2, 4, -9],
  ],
};

function seed() {
  db.insert(schema.reader)
    .values([
      { id: R_PUB, title: "Published", course: "C1", fileName: "a.pdf", status: "ready", published: true, createdAt: at(-30) },
      { id: R_HIDDEN, title: "Hidden", course: null, fileName: "b.pdf", status: "ready", published: false, createdAt: at(-20) },
    ])
    .run();
  db.insert(schema.lesson)
    .values(LESSONS.map((l) => ({ ...l, title: `Les ${l.code}`, week: 1, startPage: 1, endPage: 2, status: "ready" as const })))
    .run();
  db.insert(schema.flashcard)
    .values(LESSONS.flatMap((l, li) => [1, 2, 3].map((i) => ({ id: card(li + 1, i), lessonId: l.id, front: `F${li + 1}${i}`, back: `B${li + 1}${i}` }))))
    .run();
  for (const who of ["student", "admin"] as const) {
    db.insert(schema.cardReview)
      .values(
        REVIEWS[who].map(([li, i, state, due, last]) => ({
          userId: ids[who],
          flashcardId: card(li, i),
          lessonId: LESSONS[li - 1]!.id,
          due: at(due),
          stability: 1.5 + li + i / 10,
          difficulty: 4 + i,
          elapsedDays: 2,
          scheduledDays: 3,
          learningSteps: state === 1 ? 1 : 0,
          reps: state === 0 ? 0 : 2 + i,
          lapses: state === 3 ? 1 : 0,
          state,
          lastReview: last === null ? null : at(last),
        })),
      )
      .run();
  }
  db.insert(schema.lessonProgress)
    .values([
      { userId: ids.student, lessonId: "ls-L1", summaryRead: true, bestQuiz: 0.8, bestExplain: 0, updatedAt: at(-1) },
      { userId: ids.student, lessonId: "ls-L2", summaryRead: false, bestQuiz: 0, bestExplain: 0.5, updatedAt: at(-3) },
      { userId: ids.student, lessonId: "ls-L3", summaryRead: true, bestQuiz: 1, bestExplain: 1, updatedAt: at(-2) },
      { userId: ids.admin, lessonId: "ls-L3", summaryRead: true, bestQuiz: 0.4, bestExplain: 0, updatedAt: at(-1) },
    ])
    .run();
}

beforeAll(async () => {
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch, websocket });
  base = `http://127.0.0.1:${server.port}`;
  env.clientIpHeader = "x-test-ip";
  env.rateLimitDisabled = true;
  cookies.student = await login(STUDENT);
  cookies.admin = await login(ADMIN);
  db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.email, ADMIN)).run();
  ids.student = db.select().from(schema.user).where(eq(schema.user.email, STUDENT)).get()!.id;
  ids.admin = db.select().from(schema.user).where(eq(schema.user.email, ADMIN)).get()!.id;
  seed();
  setSystemTime(NOW);
});
afterAll(() => {
  setSystemTime();
  server.stop(true);
  logSpy.mockRestore();
  resetEmailGate();
  Object.assign(env, { clientIpHeader: saved.header, rateLimitDisabled: saved.disabled });
});

const get = async (path: string, who: "student" | "admin") => {
  const r = await fetch(`${base}/api${path}`, { headers: { cookie: cookies[who] } });
  expect(r.status).toBe(200);
  return r.json();
};

// ---------- the reference: the old, unscoped way ----------

const scheduler = fsrs({ enable_fuzz: true });
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
function previewIntervals(c: Card, now: Date) {
  const rec = scheduler.repeat(c, now);
  const ms = (g: Grade) => rec[g].card.due.getTime() - now.getTime();
  return { again: ms(Rating.Again), hard: ms(Rating.Hard), good: ms(Rating.Good), easy: ms(Rating.Easy) };
}

function all() {
  return {
    readers: db.select().from(schema.reader).all(),
    lessons: db.select().from(schema.lesson).all(),
    cards: db.select().from(schema.flashcard).all(),
  };
}

function refQueue(who: "student" | "admin", lessonId?: string) {
  const { readers, lessons, cards } = all();
  const published = new Set(readers.filter((r) => r.published).map((r) => r.id));
  const visible = new Set(lessons.filter((l) => who === "admin" || published.has(l.readerId)).map((l) => l.id));
  const code = new Map(lessons.map((l) => [l.id, l.code]));
  const reviews = new Map(db.select().from(schema.cardReview).where(eq(schema.cardReview.userId, ids[who])).all().map((r) => [r.flashcardId, r]));
  const inScope = (c: (typeof cards)[number]) => (lessonId ? c.lessonId === lessonId : visible.has(c.lessonId));
  const due = cards.filter((c) => inScope(c) && reviews.has(c.id) && reviews.get(c.id)!.due.getTime() <= NOW.getTime());
  const fresh = lessonId ? cards.filter((c) => inScope(c) && !reviews.has(c.id)) : [];
  return [...due.map((c) => ({ c, isNew: false })), ...fresh.map((c) => ({ c, isNew: true }))]
    .map(({ c, isNew }) => {
      const r = reviews.get(c.id);
      return {
        id: c.id,
        lessonId: c.lessonId,
        front: c.front,
        back: c.back,
        isNew,
        lessonCode: code.get(c.lessonId) ?? "",
        intervals: previewIntervals(r ? toCard(r) : createEmptyCard(NOW), NOW),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function refMastery(userId: string) {
  const { cards } = all();
  const reviews = new Map(db.select().from(schema.cardReview).where(eq(schema.cardReview.userId, userId)).all().map((r) => [r.flashcardId, r]));
  const acc = new Map<string, { total: number; learned: number }>();
  for (const c of cards) {
    const a = acc.get(c.lessonId) ?? { total: 0, learned: 0 };
    const s = reviews.get(c.id)?.state;
    a.total++;
    a.learned += s === 2 ? 1 : s === 1 || s === 3 ? 0.5 : 0;
    acc.set(c.lessonId, a);
  }
  return new Map([...acc].map(([id, a]) => [id, a.learned / a.total]));
}

function refReaders(who: "student" | "admin") {
  const { readers, lessons } = all();
  const progress = db.select().from(schema.lessonProgress).where(eq(schema.lessonProgress.userId, ids[who])).all();
  const cm = refMastery(ids[who]);
  return readers
    .filter((r) => [R_PUB, R_HIDDEN].includes(r.id) && (who === "admin" || r.published))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      id: r.id,
      title: r.title,
      course: r.course,
      published: r.published,
      lessons: lessons
        .filter((l) => l.readerId === r.id && l.status === "ready")
        .sort((a, b) => a.position - b.position)
        .map((l) => {
          const p = progress.find((x) => x.lessonId === l.id);
          return {
            id: l.id,
            readerId: l.readerId,
            code: l.code,
            title: l.title,
            week: l.week,
            status: l.status,
            mastery: computeMastery({
              bestQuiz: p?.bestQuiz ?? 0,
              bestExplain: p?.bestExplain ?? 0,
              summaryRead: p?.summaryRead ?? false,
              cardMastery: cm.get(l.id) ?? 0,
            }),
          };
        }),
    }));
}

const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));

// ---------- the pins ----------

describe("cardMasteryByLesson", () => {
  test("unscoped equals the reference", async () => {
    const got = await cardMasteryByLesson(ids.student);
    for (const [id, v] of refMastery(ids.student)) expect([id, got.get(id)]).toEqual([id, v]);
    expect(got.get("ls-L1")).toBe(0.5);
    expect(got.get("ls-L2")).toBe(0.5);
    expect(got.get("ls-L3")).toBe(0.5);
  });

  test("{ lessonId } is the unscoped map restricted to that lesson", async () => {
    const full = await cardMasteryByLesson(ids.student);
    const one = await cardMasteryByLesson(ids.student, { lessonId: "ls-L1" });
    expect([...one]).toEqual([["ls-L1", full.get("ls-L1")!]]);
  });

  test("{ lessonIds: subquery } keeps only those lessons, with the same values", async () => {
    const full = await cardMasteryByLesson(ids.student);
    const visible = db
      .select({ id: schema.lesson.id })
      .from(schema.lesson)
      .innerJoin(schema.reader, eq(schema.reader.id, schema.lesson.readerId))
      .where(and(eq(schema.reader.published, true), eq(schema.reader.id, R_PUB)));
    const scoped = await cardMasteryByLesson(ids.student, { lessonIds: visible });
    expect([...scoped.keys()].sort()).toEqual(["ls-L1", "ls-L2"]);
    for (const [id, v] of scoped) expect(v).toBe(full.get(id)!);
  });
});

describe("GET /api/review/queue", () => {
  for (const who of ["student", "admin"] as const) {
    for (const lessonId of [undefined, "ls-L1", "ls-L2", "ls-L3"]) {
      if (who === "student" && lessonId === "ls-L3") {
        test("student ?lessonId=ls-L3 (unpublished reader) is 404", async () => {
          const res = await fetch(`${base}/api/review/queue?lessonId=ls-L3`, { headers: { cookie: cookies.student } });
          expect(res.status).toBe(404);
        });
        continue;
      }
      test(`${who}${lessonId ? ` ?lessonId=${lessonId}` : ""} matches the reference`, async () => {
        const items = (await get(`/review/queue${lessonId ? `?lessonId=${lessonId}` : ""}`, who)) as { id: string }[];
        const ref = refQueue(who, lessonId);
        expect(ref.length).toBeGreaterThan(0);
        const mine = byId(items).filter((i) => i.id.startsWith("ls-"));
        expect(mine).toEqual(ref);
        // No extra keys and none missing.
        for (const i of items) expect(Object.keys(i).sort()).toEqual(["back", "front", "id", "intervals", "isNew", "lessonCode", "lessonId"]);
      });
    }
  }

  test("the student's global queue leaves out the hidden reader", async () => {
    const items = (await get("/review/queue", "student")) as { id: string; isNew: boolean }[];
    const mine = items.filter((i) => i.id.startsWith("ls-")).map((i) => i.id).sort();
    expect(mine).toEqual(["ls-c11", "ls-c21", "ls-c23"]);
    expect(items.every((i) => !i.isNew)).toBe(true);
  });
});

describe("GET /api/readers", () => {
  for (const who of ["student", "admin"] as const) {
    test(`${who}: lessons and mastery match the reference`, async () => {
      const got = (await get("/readers", who)) as { id: string; lastStudiedLessonId: string | null }[];
      const mine = got.filter((r) => r.id.startsWith("ls-"));
      expect(mine.map(({ lastStudiedLessonId: _, ...r }) => r)).toEqual(refReaders(who));
    });
  }

  test("lastStudiedLessonId per reader", async () => {
    const student = (await get("/readers", "student")) as { id: string; lastStudiedLessonId: string | null }[];
    const admin = (await get("/readers", "admin")) as { id: string; lastStudiedLessonId: string | null }[];
    const last = (xs: typeof student) => Object.fromEntries(xs.filter((r) => r.id.startsWith("ls-")).map((r) => [r.id, r.lastStudiedLessonId]));
    // Student: L1 progress at -1 day beats L2's review at -4 and progress at -3.
    expect(last(student)).toEqual({ [R_PUB]: "ls-L1" });
    // Admin: L3 review at -1 day; L1 review at -7 days.
    expect(last(admin)).toEqual({ [R_HIDDEN]: "ls-L3", [R_PUB]: "ls-L1" });
  });
});
