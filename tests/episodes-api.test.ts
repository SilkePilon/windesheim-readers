// Student endpoints for the weekly audio episodes: meta, ranged MP3, progress + one-time XP.
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { websocket } from "@hono/bun";
import { and, eq, inArray } from "drizzle-orm";
import { mkdir, rm } from "node:fs/promises";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { episodeChapterPath, episodeDir } from "../server/ai/episodes";
import { resetEmailGate } from "../server/lib/email-gate";

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

const EMAIL = "ep-student@student.windesheim.nl";
let cookie = "";
let userId = "";
const R = "ep-reader";
const R_HIDDEN = "ep-hidden";
const TOTAL = 20_000;

async function login() {
  const ip = "198.43.1.1";
  const r = await fetch(`${base}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:5173", "x-test-ip": ip },
    body: JSON.stringify({ email: EMAIL, callbackURL: "/" }),
  });
  expect(r.status).toBe(200);
  const url = new URL(links.get(EMAIL)!);
  const v = await fetch(`${base}${url.pathname}${url.search}`, { redirect: "manual", headers: { "x-test-ip": ip } });
  return v.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

beforeAll(async () => {
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch, websocket });
  base = `http://127.0.0.1:${server.port}`;
  env.clientIpHeader = "x-test-ip";
  env.rateLimitDisabled = true;
  cookie = await login();
  userId = db.select().from(schema.user).where(eq(schema.user.email, EMAIL)).get()!.id;
  db.insert(schema.reader)
    .values([
      { id: R, title: "Reader", fileName: "a.pdf", status: "ready", published: true },
      { id: R_HIDDEN, title: "Hidden", fileName: "b.pdf", status: "ready", published: false },
    ])
    .run();
  db.insert(schema.lesson).values({ id: "ep-L1", readerId: R, code: "1.1", title: "Les", week: 1, position: 0, startPage: 1, endPage: 2, status: "ready" }).run();
  const chapters = [
    { n: 1, durationMs: 12_000, bytes: 100 },
    { n: 2, durationMs: 8_000, bytes: 100 },
  ];
  db.insert(schema.readerEpisode)
    .values([
      { readerId: R, week: 1, status: "ready", title: "Aflevering 1", chapters, generatedAt: new Date(1_700_000_000_000) },
      { readerId: R, week: 2, status: "generating", title: null },
      { readerId: R_HIDDEN, week: 1, status: "ready", title: "Hidden", chapters },
    ])
    .run();
  for (const [reader, week] of [[R, 1], [R_HIDDEN, 1]] as const) {
    await mkdir(episodeDir(reader, week), { recursive: true });
    for (const n of [1, 2]) await Bun.write(episodeChapterPath(reader, week, n), new Uint8Array(100).map((_, i) => i));
  }
});
afterAll(async () => {
  db.delete(schema.reader).where(inArray(schema.reader.id, [R, R_HIDDEN])).run();
  await rm(episodeDir(R, 1), { recursive: true, force: true });
  await rm(episodeDir(R_HIDDEN, 1), { recursive: true, force: true });
  server.stop(true);
  logSpy.mockRestore();
  resetEmailGate();
  Object.assign(env, { clientIpHeader: saved.header, rateLimitDisabled: saved.disabled });
});

const get = (path: string, headers: Record<string, string> = {}) => fetch(`${base}/api${path}`, { headers: { cookie, ...headers } });
const post = (path: string, body: unknown) =>
  fetch(`${base}/api${path}`, { method: "POST", headers: { cookie, "content-type": "application/json", origin: "http://localhost:5173" }, body: JSON.stringify(body) });

describe("episode endpoints", () => {
  test("hidden reader, unknown or malformed week: 404", async () => {
    expect((await get(`/readers/${R_HIDDEN}/episodes/1`)).status).toBe(404);
    expect((await get(`/readers/${R_HIDDEN}/episodes/1/1.mp3`)).status).toBe(404);
    expect((await post(`/readers/${R_HIDDEN}/episodes/1/progress`, { positionMs: 1 })).status).toBe(404);
    expect((await get(`/readers/${R}/episodes/9`)).status).toBe(404);
    expect((await get(`/readers/${R}/episodes/0`)).status).toBe(404);
    expect((await get(`/readers/${R}/episodes/abc`)).status).toBe(404);
    expect((await get(`/readers/${R}/episodes/1/9.mp3`)).status).toBe(404);
  });

  test("an episode that is not ready: 409", async () => {
    const r = await get(`/readers/${R}/episodes/2`);
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toBe("AUDIO_NOT_READY");
    expect((await post(`/readers/${R}/episodes/2/progress`, { positionMs: 1 })).status).toBe(409);
  });

  test("meta has chapters and totals, no script", async () => {
    const r = await get(`/readers/${R}/episodes/1`);
    expect(r.status).toBe(200);
    const m = (await r.json()) as Record<string, unknown>;
    expect(m).toMatchObject({ week: 1, title: "Aflevering 1", status: "ready", version: "1700000000000", totalMs: TOTAL, positionMs: 0, listenMs: 0 });
    expect((m.chapters as unknown[]).length).toBe(2);
    expect(m.script).toBeUndefined();
  });

  test("Range request gives 206 with 10 bytes", async () => {
    const r = await get(`/readers/${R}/episodes/1/1.mp3`, { Range: "bytes=0-9" });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 0-9/100");
    expect((await r.arrayBuffer()).byteLength).toBe(10);
    const whole = await get(`/readers/${R}/episodes/1/2.mp3`);
    expect(whole.status).toBe(200);
    expect((await whole.arrayBuffer()).byteLength).toBe(100);
  });

  test("progress: no award at 50%, 5 XP at 95% once, lesson progress untouched", async () => {
    const before = db.select().from(schema.lessonProgress).where(eq(schema.lessonProgress.userId, userId)).all();
    const a = (await (await post(`/readers/${R}/episodes/1/progress`, { positionMs: TOTAL / 2 })).json()) as { listenMs: number; award: unknown };
    expect(a).toEqual({ listenMs: TOTAL / 2, award: null });
    const b = (await (await post(`/readers/${R}/episodes/1/progress`, { positionMs: 0.95 * TOTAL })).json()) as { listenMs: number; award: { xp: number } | null };
    expect(b.award?.xp).toBe(5);
    const c = (await (await post(`/readers/${R}/episodes/1/progress`, { positionMs: TOTAL })).json()) as { listenMs: number; award: unknown };
    expect(c).toEqual({ listenMs: TOTAL, award: null });
    // Seeking back keeps the best listen but moves the resume position.
    const d = (await (await post(`/readers/${R}/episodes/1/progress`, { positionMs: 1000 })).json()) as { listenMs: number };
    expect(d.listenMs).toBe(TOTAL);
    expect(db.select().from(schema.lessonProgress).where(eq(schema.lessonProgress.userId, userId)).all()).toEqual(before);
    const m = (await (await get(`/readers/${R}/episodes/1`)).json()) as { positionMs: number; listenMs: number };
    expect(m).toMatchObject({ positionMs: 1000, listenMs: TOTAL });
  });

  test("the learn overview lists the ready episode with the student's position", async () => {
    const o = (await (await get(`/readers/${R}/learn`)).json()) as { episodes: { week: number; positionMs: number; listenMs: number }[] };
    expect(o.episodes).toEqual([expect.objectContaining({ week: 1, positionMs: 1000, listenMs: TOTAL })]);
  });

  test("a stored episode stays listed and playable while regenerating or after a failed regeneration", async () => {
    for (const status of ["pending", "generating", "error"] as const) {
      db.update(schema.readerEpisode).set({ status }).where(and(eq(schema.readerEpisode.readerId, R), eq(schema.readerEpisode.week, 1))).run();
      const o = (await (await get(`/readers/${R}/learn`)).json()) as { episodes: { week: number }[] };
      expect(o.episodes.map((e) => e.week)).toEqual([1]);
      const meta = await get(`/readers/${R}/episodes/1`);
      expect(meta.status).toBe(200);
      expect(((await meta.json()) as { status: string }).status).toBe(status);
      expect((await get(`/readers/${R}/episodes/1/1.mp3`)).status).toBe(200);
      expect((await post(`/readers/${R}/episodes/1/progress`, { positionMs: 2000 })).status).toBe(200);
    }
    db.update(schema.readerEpisode).set({ status: "ready" }).where(and(eq(schema.readerEpisode.readerId, R), eq(schema.readerEpisode.week, 1))).run();
    // Week 2 never had chapters: still not ready, and not listed.
    expect((await get(`/readers/${R}/episodes/2`)).status).toBe(409);
    expect((await get(`/readers/${R}/episodes/2/1.mp3`)).status).toBe(404);
  });

  test("an episode without generatedAt gets a version from its chapters", async () => {
    db.update(schema.readerEpisode).set({ generatedAt: null }).where(and(eq(schema.readerEpisode.readerId, R), eq(schema.readerEpisode.week, 1))).run();
    const a = ((await (await get(`/readers/${R}/episodes/1`)).json()) as { version: string }).version;
    expect(a).toMatch(/^\d+$/);
    expect(a).not.toBe("1700000000000");
    db.update(schema.readerEpisode).set({ generatedAt: new Date(1_700_000_000_000) }).where(and(eq(schema.readerEpisode.readerId, R), eq(schema.readerEpisode.week, 1))).run();
  });
});
