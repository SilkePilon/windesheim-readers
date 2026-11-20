// Dynamic compression (hono/compress) against the real app: JSON is gzipped, the tutor's
// event stream and ranged audio are left alone.
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { websocket } from "@hono/bun";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { resetEmailGate } from "../server/lib/email-gate";
import { limits } from "../server/limits";
import { chapterPath } from "../server/ai/audio";

runMigrations();
const { app } = await import("../server/app");

let server: ReturnType<typeof Bun.serve>;
let base = "";
const saved = { header: env.clientIpHeader, disabled: env.rateLimitDisabled, stub: process.env.AI_STUB };
const H = { "content-type": "application/json", origin: "http://localhost:5173" };

const links = new Map<string, string>();
const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
  const m = /\[magic-link\] (\S+)\n\s+(\S+)/.exec(String(args[0]));
  if (m) links.set(m[1]!, m[2]!);
});
const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

async function login(email: string) {
  const ip = "198.31.0.1";
  const r = await fetch(`${base}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { ...H, "x-test-ip": ip },
    body: JSON.stringify({ email, callbackURL: "/" }),
  });
  expect(r.status).toBe(200);
  const url = new URL(links.get(email)!);
  const v = await fetch(`${base}${url.pathname}${url.search}`, { redirect: "manual", headers: { "x-test-ip": ip } });
  return v.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

let cookie = "";
beforeAll(async () => {
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch, websocket });
  base = `http://127.0.0.1:${server.port}`;
  for (const l of Object.values(limits)) l.reset();
  resetEmailGate();
  env.clientIpHeader = "x-test-ip";
  env.rateLimitDisabled = true;
  process.env.AI_STUB = "1"; // never a real AI call
  for (let i = 0; i < 8; i++)
    db.insert(schema.reader)
      .values({ id: `cz-reader-${i}`, title: `Compressible reader ${i} `.repeat(8), fileName: "r.pdf", status: "ready", published: true, pageCount: 10 })
      .onConflictDoNothing()
      .run();
  db.insert(schema.lesson)
    .values({ id: "cz-lesson", readerId: "cz-reader-0", code: "1.1A", title: "L", week: 1, position: 0, startPage: 1, endPage: 2, status: "ready" })
    .onConflictDoNothing()
    .run();
  const mp3 = new Uint8Array(4096).map((_, i) => i % 251);
  const file = chapterPath("cz-lesson", 1);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, mp3);
  db.insert(schema.lessonAudio)
    .values({ lessonId: "cz-lesson", status: "ready", chapters: [{ n: 1, durationMs: 1000, bytes: mp3.length }] })
    .onConflictDoNothing()
    .run();
  cookie = await login("cz-student@student.windesheim.nl");
});
afterAll(() => {
  server.stop(true);
  logSpy.mockRestore();
  warnSpy.mockRestore();
  resetEmailGate();
  Object.assign(env, { clientIpHeader: saved.header, rateLimitDisabled: saved.disabled });
  if (saved.stub === undefined) delete process.env.AI_STUB;
  else process.env.AI_STUB = saved.stub;
});

// Bun's fetch decompresses transparently; `decompress: false` keeps the wire headers and bytes.
const raw = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, decompress: false } as RequestInit);

describe("dynamic compression", () => {
  test("is on by default", () => {
    expect(env.httpCompress).toBe(true);
  });

  test("JSON API responses are gzipped", async () => {
    const r = await raw("/api/readers", { headers: { cookie, "Accept-Encoding": "gzip" } });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Encoding")).toBe("gzip");
    const body = new Uint8Array(await r.arrayBuffer());
    const json = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(body))) as unknown[];
    expect(json.length).toBeGreaterThanOrEqual(8);
  });

  test("the tutor's event stream is not compressed", async () => {
    const r = await raw("/api/lessons/cz-lesson/chat", {
      method: "POST",
      headers: { ...H, cookie, "Accept-Encoding": "gzip" },
      body: JSON.stringify({ messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Hoi" }] }] }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toStartWith("text/event-stream");
    expect(r.headers.get("Content-Encoding")).toBeNull();
    expect(await r.text()).toContain("data:");
  });

  test("ranged audio is a plain 206", async () => {
    const r = await raw("/api/lessons/cz-lesson/audio/1.mp3", { headers: { cookie, Range: "bytes=0-9", "Accept-Encoding": "gzip" } });
    expect(r.status).toBe(206);
    expect(r.headers.get("Content-Encoding")).toBeNull();
    expect((await r.arrayBuffer()).byteLength).toBe(10);
  });
});
