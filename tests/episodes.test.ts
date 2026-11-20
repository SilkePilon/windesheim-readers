// Weekly audio episodes (admin pipeline) on the typed audio queue, against the throwaway DB.
// AI_STUB=1: the episode script is the deterministic stub; TTS is an injected fake.
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { websocket } from "@hono/bun";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import type { SpeakFn } from "../server/ai/speech";
import type { AudioJobDeps } from "../server/ai/audio";

const savedStub = process.env.AI_STUB;
process.env.AI_STUB = "1";

const { db, runMigrations, schema } = await import("../server/db");
const { env } = await import("../server/env");
const { pcmToWav, tone } = await import("../server/lib/audio-codec");
const audio = await import("../server/ai/audio");
const ep = await import("../server/ai/episodes");
const { resetEmailGate } = await import("../server/lib/email-gate");

runMigrations();
const { app } = await import("../server/app");

const voiceConfig: AudioJobDeps["voiceConfig"] = async () => ({ choice: { provider: "google", model: "gemini-3.8-flash-tts", voice: "Sulafat" }, apiKey: "test-key" });
const speak: SpeakFn = async () => pcmToWav(tone(100));
const deps: AudioJobDeps = { speak, voiceConfig };

const R = "ep-reader";
const epRow = (week: number, readerId = R) =>
  db.query.readerEpisode.findFirst({ where: and(eq(schema.readerEpisode.readerId, readerId), eq(schema.readerEpisode.week, week)) });
const weekLessons = (week: number, readerId = R) =>
  db
    .select({ id: schema.lesson.id, generatedAt: schema.lesson.generatedAt, startPage: schema.lesson.startPage, endPage: schema.lesson.endPage })
    .from(schema.lesson)
    .where(and(eq(schema.lesson.readerId, readerId), eq(schema.lesson.week, week), eq(schema.lesson.status, "ready")));

async function seedReader(id: string) {
  await db.insert(schema.reader).values({ id, title: "Reader", fileName: "r.pdf", status: "ready", published: true }).onConflictDoNothing();
  const base = { readerId: id, title: "Les", summary: "Samenvatting.", keyPoints: ["Punt"], status: "ready" as const, generatedAt: new Date(1000) };
  await db
    .insert(schema.lesson)
    .values([
      { ...base, id: `${id}-1`, code: "1.1", week: 1, position: 0, startPage: 1, endPage: 2 },
      { ...base, id: `${id}-2`, code: "1.2", week: 1, position: 1, startPage: 3, endPage: 4 },
      { ...base, id: `${id}-3`, code: "2.1", week: 2, position: 2, startPage: 5, endPage: 6 },
      { ...base, id: `${id}-4`, code: "1.3", week: 1, position: 3, startPage: 7, endPage: 8, status: "pending" as const },
      { ...base, id: `${id}-5`, code: "3.1", week: 3, position: 4, startPage: 9, endPage: 9, status: "error" as const },
    ])
    .onConflictDoNothing();
}

// ---------- app (admin routes) ----------

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
  const ip = `198.43.${Math.floor(++n / 250)}.${n % 250}`;
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
const cookies = { student: "", admin: "" };
const ADMIN = "ep-admin@windesheim.nl";
const call = (method: string, path: string, who: "student" | "admin") =>
  fetch(`${base}/api/admin${path}`, { method, headers: { cookie: cookies[who], origin: "http://localhost:5173", "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });

beforeAll(async () => {
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch, websocket });
  base = `http://127.0.0.1:${server.port}`;
  env.clientIpHeader = "x-test-ip";
  env.rateLimitDisabled = true;
  cookies.student = await login("ep-student@student.windesheim.nl");
  cookies.admin = await login(ADMIN);
  db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.email, ADMIN)).run();
  await seedReader(R);
});
afterAll(() => {
  server.stop(true);
  logSpy.mockRestore();
  resetEmailGate();
  Object.assign(env, { clientIpHeader: saved.header, rateLimitDisabled: saved.disabled });
  if (savedStub === undefined) delete process.env.AI_STUB;
  else process.env.AI_STUB = savedStub;
});

describe("episode script", () => {
  test("stub: hook, one lesson chapter per ready lesson in position order, connect, selftest, recap", async () => {
    const s = await ep.generateEpisodeScript(R, 1);
    expect(s.title).toBeTruthy();
    expect(s.chapters.map((c) => c.kind)).toEqual(["hook", "lesson", "lesson", "connect", "selftest", "recap"]);
    expect(s.chapters[1]!.title).toContain("1.1");
    expect(s.chapters[2]!.title).toContain("1.2");
  });
});

describe("generateEpisode", () => {
  test("writes a ready episode with chapter files and a source snapshot", async () => {
    const res = await ep.generateEpisode(R, 1, deps);
    expect(res.status).toBe("ready");
    const row = await epRow(1);
    expect(row?.status).toBe("ready");
    expect(row?.title).toBeTruthy();
    expect(row?.chapters.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(row?.script?.chapters.filter((c) => c.kind === "lesson")).toHaveLength(2);
    expect(row?.sourceSnapshot).toHaveLength(2);
    expect(row?.sourceSnapshot?.map((s) => s.lessonId)).toEqual([`${R}-1`, `${R}-2`]);
    expect(readdirSync(ep.episodeDir(R, 1)).sort()).toEqual(["1.mp3", "2.mp3", "3.mp3", "4.mp3", "5.mp3", "6.mp3"]);
    expect(existsSync(ep.episodeChapterPath(R, 1, 6))).toBe(true);
  });

  test("a successful regeneration resets resume positions, keeps listen credit", async () => {
    const userId = db.select().from(schema.user).where(eq(schema.user.email, "ep-student@student.windesheim.nl")).get()!.id;
    db.insert(schema.episodeProgress).values({ userId, readerId: R, week: 1, positionMs: 5_000, listenMs: 9_000, awarded: true }).run();
    const before = (await epRow(1))!.generatedAt!.getTime();
    await Bun.sleep(2);
    expect((await ep.generateEpisode(R, 1, deps)).status).toBe("ready");
    expect((await epRow(1))!.generatedAt!.getTime()).toBeGreaterThan(before);
    const p = db
      .select()
      .from(schema.episodeProgress)
      .where(and(eq(schema.episodeProgress.userId, userId), eq(schema.episodeProgress.readerId, R), eq(schema.episodeProgress.week, 1)))
      .get()!;
    expect(p).toMatchObject({ positionMs: 0, listenMs: 9_000, awarded: true });
  });

  test("a failing chapter leaves an error and no files", async () => {
    await seedReader("ep-fail");
    const failing: SpeakFn = async () => {
      throw new Error("TTS down");
    };
    const res = await ep.generateEpisode("ep-fail", 2, { speak: failing, voiceConfig, retryDelayMs: () => 0 });
    expect(res.status).toBe("error");
    const row = await epRow(2, "ep-fail");
    expect(row?.status).toBe("error");
    expect(row?.error).toMatch(/Chapter \d: TTS down/);
    expect(existsSync(ep.episodeDir("ep-fail", 2))).toBe(false);
  });

  test("staleness follows the week's lessons", async () => {
    const row = (await epRow(1))!;
    expect(ep.episodeIsStale(row, await weekLessons(1))).toBe(false);
    await db.update(schema.lesson).set({ generatedAt: new Date(9000) }).where(eq(schema.lesson.id, `${R}-1`));
    expect(ep.episodeIsStale(row, await weekLessons(1))).toBe(true);
    await db.update(schema.lesson).set({ generatedAt: new Date(1000) }).where(eq(schema.lesson.id, `${R}-1`));
    expect(ep.episodeIsStale(row, await weekLessons(1))).toBe(false);
    // Page range or the set of lessons changing also makes it stale.
    const lessons = await weekLessons(1);
    expect(ep.episodeIsStale(row, lessons.map((l, i) => (i === 0 ? { ...l, endPage: 5 } : l)))).toBe(true);
    expect(ep.episodeIsStale(row, lessons.slice(0, 1))).toBe(true);
  });
});

describe("typed audio queue", () => {
  test("episodes run one at a time and share the queue with lesson audio", async () => {
    await seedReader("ep-q");
    let active = 0;
    let peak = 0;
    const counting: SpeakFn = async () => {
      peak = Math.max(peak, ++active);
      await Bun.sleep(3);
      active--;
      return pcmToWav(tone(50));
    };
    const d: AudioJobDeps = { speak: counting, voiceConfig };
    const [weeks, lessonIds] = await Promise.all([ep.queueReaderEpisodes("ep-q", { deps: d }), audio.queueReaderAudio("ep-q", { lessonIds: ["ep-q-3"], deps: d })]);
    expect(weeks).toEqual([1, 2]);
    expect(lessonIds).toEqual(["ep-q-3"]);
    // Queued, not yet running.
    expect((await epRow(2, "ep-q"))?.status).toBe("pending");
    await audio.audioQueueIdle();
    // Two jobs at once would mean up to 4 TTS calls in flight.
    expect(peak).toBeLessThanOrEqual(2);
    const [w1, w2] = [await epRow(1, "ep-q"), await epRow(2, "ep-q")];
    expect([w1?.status, w2?.status]).toEqual(["ready", "ready"]);
    expect(w1!.generatedAt!.getTime()).toBeLessThanOrEqual(w2!.generatedAt!.getTime());
    const la = await db.query.lessonAudio.findFirst({ where: eq(schema.lessonAudio.lessonId, "ep-q-3") });
    expect(la?.status).toBe("ready");
    // Nothing missing any more: a second run queues nothing, `force` queues the selected week again.
    expect(await ep.queueReaderEpisodes("ep-q", { deps: d })).toEqual([]);
    expect(await ep.queueReaderEpisodes("ep-q", { weeks: [2], force: true, deps: d })).toEqual([2]);
    await audio.audioQueueIdle();
    expect((await epRow(2, "ep-q"))?.status).toBe("ready");
  });

  test("a fatal error in an episode stops the queue and fails the waiting jobs", async () => {
    await seedReader("ep-fatal");
    const noKey: AudioJobDeps = { speak, voiceConfig: async () => ({ choice: { provider: "openai", model: "gpt-4o-mini-tts", voice: "marin" }, apiKey: undefined }) };
    await ep.queueReaderEpisodes("ep-fatal", { deps: noKey });
    await audio.audioQueueIdle();
    expect((await epRow(1, "ep-fatal"))?.error).toMatch(/No API key/);
    expect((await epRow(2, "ep-fatal"))?.error).toMatch(/^Not generated/);
  });
});

describe("admin episode routes", () => {
  test("students get 403", async () => {
    expect((await call("GET", `/readers/${R}/episodes`, "student")).status).toBe(403);
    expect((await call("POST", `/readers/${R}/episodes`, "student")).status).toBe(403);
    expect((await call("DELETE", `/readers/${R}/episodes/1`, "student")).status).toBe(403);
  });

  test("GET lists every week with ready lessons", async () => {
    const r = await call("GET", `/readers/${R}/episodes`, "admin");
    expect(r.status).toBe(200);
    const list = (await r.json()) as { week: number; status: string; title: string | null; stale: boolean; durationSec: number; error: string | null }[];
    expect(list.map((x) => x.week)).toEqual([1, 2]);
    expect(list[0]).toMatchObject({ week: 1, status: "ready", stale: false, error: null });
    expect(list[0]!.durationSec).toBeGreaterThanOrEqual(0);
    expect(list[1]).toMatchObject({ week: 2, status: "none", stale: false });
  });

  test("POST validates the week and queues", async () => {
    expect((await call("POST", `/readers/${R}/episodes/0`, "admin")).status).toBe(400);
    expect((await call("POST", `/readers/${R}/episodes/abc`, "admin")).status).toBe(400);
    expect((await call("POST", `/readers/${R}/episodes/3`, "admin")).status).toBe(404); // no ready lessons
    expect((await call("POST", `/readers/nope/episodes`, "admin")).status).toBe(404);
    expect((await call("POST", `/readers/${R}/episodes/2`, "admin")).status).toBe(202);
    await audio.audioQueueIdle();
    expect((await epRow(2))?.status).toBe("ready");
    expect((await call("POST", `/readers/${R}/episodes`, "admin")).status).toBe(202);
    await audio.audioQueueIdle();
  });

  test("DELETE removes the row and the files", async () => {
    expect(existsSync(ep.episodeDir(R, 2))).toBe(true);
    expect((await call("DELETE", `/readers/${R}/episodes/x`, "admin")).status).toBe(400);
    const r = await call("DELETE", `/readers/${R}/episodes/2`, "admin");
    expect(r.status).toBe(204);
    expect(await epRow(2)).toBeUndefined();
    expect(existsSync(ep.episodeDir(R, 2))).toBe(false);
  });
});

describe("path safety", () => {
  test("DELETE /readers/:id with a traversal or slash id touches no files", async () => {
    const sentinel = join(env.uploadDir, "sentinel", "keep.txt");
    mkdirSync(join(env.uploadDir, "sentinel"), { recursive: true });
    writeFileSync(sentinel, "keep");
    // episodes root is UPLOAD_DIR/audio/episodes: ../../sentinel would be the sentinel folder.
    for (const id of ["..%2F..%2Fsentinel", "..%2Fx", "a%2Fb", "..%2F.."]) {
      const r = await call("DELETE", `/readers/${id}`, "admin");
      expect([400, 404]).toContain(r.status);
    }
    expect(existsSync(sentinel)).toBe(true);
    expect(existsSync(join(env.uploadDir, "audio"))).toBe(true);
    expect(existsSync(ep.episodeDir(R, 1))).toBe(true);
  });

  test("episode paths reject unsafe reader ids and weeks", async () => {
    expect(() => ep.episodeDir("../x", 1)).toThrow(/Invalid reader id/);
    expect(() => ep.episodeChapterPath("a/b", 1, 1)).toThrow(/Invalid reader id/);
    expect(() => ep.episodeDir(R, 0)).toThrow(/Invalid week/);
    await expect(ep.deleteReaderEpisodeFiles("../..")).rejects.toThrow(/Invalid reader id/);
    expect(await ep.generateEpisode("../..", 1, deps)).toEqual({ status: "skipped" });
    expect(existsSync(join(env.uploadDir, "sentinel", "keep.txt"))).toBe(true);
  });
});

describe("recoverAudio", () => {
  test("an interrupted episode becomes an error; episode files survive the sweep", async () => {
    await db.update(schema.readerEpisode).set({ status: "generating" }).where(and(eq(schema.readerEpisode.readerId, R), eq(schema.readerEpisode.week, 1)));
    await audio.recoverAudio();
    const row = await epRow(1);
    expect(row?.status).toBe("error");
    expect(row?.error).toMatch(/restart/);
    expect(existsSync(ep.episodeChapterPath(R, 1, 1))).toBe(true);
  });
});
