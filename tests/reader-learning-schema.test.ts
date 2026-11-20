// Reader-learning schema: new tables round-trip, cascade on reader delete, and the admin examDate field.
import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { websocket } from "@hono/bun";
import { eq } from "drizzle-orm";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { resetEmailGate } from "../server/lib/email-gate";
import { limits } from "../server/limits";

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
const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

beforeAll(() => {
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch, websocket });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => {
  server.stop(true);
  logSpy.mockRestore();
  warnSpy.mockRestore();
  resetEmailGate();
  Object.assign(env, { clientIpHeader: saved.header, rateLimitDisabled: saved.disabled });
});
let n = 0;
beforeEach(() => {
  for (const l of Object.values(limits)) l.reset();
  resetEmailGate();
  env.clientIpHeader = "x-test-ip";
  env.rateLimitDisabled = false;
});

async function login(email: string) {
  links.delete(email);
  const ip = `198.50.${Math.floor(++n / 250)}.${n % 250}`;
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

const STUDENT = "rl-student@student.windesheim.nl";
const ADMIN = "rl-admin@windesheim.nl";
let student = "";
let admin = "";
beforeAll(async () => {
  for (const l of Object.values(limits)) l.reset();
  resetEmailGate();
  env.clientIpHeader = "x-test-ip";
  env.rateLimitDisabled = false;
  student = await login(STUDENT);
  admin = await login(ADMIN);
  db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.email, ADMIN)).run();
});


const call = (method: string, path: string, body?: unknown) =>
  fetch(`${base}/api/admin/readers${path}`, {
    method,
    headers: { cookie: admin, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

function seedReader(id: string) {
  db.insert(schema.reader).values({ id, title: "R", fileName: "r.pdf" }).run();
  db.insert(schema.lesson).values({ id: `${id}-l`, readerId: id, code: "1.1A", title: "L", startPage: 1, endPage: 2 }).run();
  db.insert(schema.question)
    .values({ id: `${id}-q`, lessonId: `${id}-l`, type: "tf", prompt: "p", data: { type: "tf", answer: true, explanation: "e" } })
    .run();
}

describe("reader-learning tables", () => {
  test("each new table round-trips and reader delete cascades", async () => {
    const uid = db.select().from(schema.user).where(eq(schema.user.email, STUDENT)).get()!.id;
    seedReader("rl1");
    db.insert(schema.readerEpisode)
      .values({
        readerId: "rl1",
        week: 1,
        status: "ready",
        title: "Week 1",
        script: { title: "t", chapters: [] } as never,
        chapters: [{ n: 1, durationMs: 1000, bytes: 10 }],
        sourceSnapshot: [{ lessonId: "rl1-l", generatedAt: null, startPage: 1, endPage: 2 }],
      })
      .run();
    db.insert(schema.conceptMap).values({ readerId: "rl1", status: "pending", data: { nodes: [], edges: [] } as never }).run();
    db.insert(schema.readerSessionDay).values({ userId: uid, readerId: "rl1", day: "2026-11-20" }).run();
    db.insert(schema.episodeProgress).values({ userId: uid, readerId: "rl1", week: 1, listenMs: 5, positionMs: 3 }).run();
    db.insert(schema.questionResult).values({ userId: uid, questionId: "rl1-q", lastCorrect: true, seen: 1, lastAt: new Date(1000) }).run();

    expect(db.select().from(schema.readerEpisode).where(eq(schema.readerEpisode.readerId, "rl1")).get()).toMatchObject({
      week: 1,
      status: "ready",
      chapters: [{ n: 1, durationMs: 1000, bytes: 10 }],
      sourceSnapshot: [{ lessonId: "rl1-l", generatedAt: null, startPage: 1, endPage: 2 }],
    });
    expect(db.select().from(schema.conceptMap).where(eq(schema.conceptMap.readerId, "rl1")).get()).toMatchObject({ readerId: "rl1", status: "pending" });
    expect(db.select().from(schema.readerSessionDay).where(eq(schema.readerSessionDay.readerId, "rl1")).get()).toMatchObject({ sessions: 0, xp: 0, cards: 0, questions: 0, correct: 0, completedAt: null });
    expect(db.select().from(schema.episodeProgress).where(eq(schema.episodeProgress.readerId, "rl1")).get()).toMatchObject({ listenMs: 5, positionMs: 3, awarded: false });
    expect(db.select().from(schema.questionResult).where(eq(schema.questionResult.questionId, "rl1-q")).get()).toMatchObject({ lastCorrect: true, seen: 1 });

    await call("DELETE", "/rl1");
    expect(db.select().from(schema.readerEpisode).where(eq(schema.readerEpisode.readerId, "rl1")).all()).toHaveLength(0);
    expect(db.select().from(schema.conceptMap).where(eq(schema.conceptMap.readerId, "rl1")).all()).toHaveLength(0);
    expect(db.select().from(schema.readerSessionDay).where(eq(schema.readerSessionDay.readerId, "rl1")).all()).toHaveLength(0);
    expect(db.select().from(schema.episodeProgress).where(eq(schema.episodeProgress.readerId, "rl1")).all()).toHaveLength(0);
    expect(db.select().from(schema.questionResult).where(eq(schema.questionResult.questionId, "rl1-q")).all()).toHaveLength(0);
  });
});

describe("admin examDate", () => {
  test("set, read back, clear, and reject a non-number", async () => {
    seedReader("rl2");
    expect((await call("PATCH", "/rl2", { examDate: 1798000000000 })).status).toBe(200);
    expect(((await (await call("GET", "/rl2")).json()) as { examDate: number | null }).examDate).toBe(1798000000000);
    expect((await call("PATCH", "/rl2", { examDate: null })).status).toBe(200);
    expect(((await (await call("GET", "/rl2")).json()) as { examDate: number | null }).examDate).toBeNull();
    expect((await call("PATCH", "/rl2", { examDate: "x" })).status).toBe(400);
  });
});
