// Feedback reports against the real app (Bun.serve, as in server/index.ts): create with and
// without a screenshot, validation, rate limit, admin-only inbox routes and file cleanup.
import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { websocket } from "@hono/bun";
import { eq } from "drizzle-orm";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { resetEmailGate } from "../server/lib/email-gate";
import { limits } from "../server/limits";
import * as store from "../server/lib/feedback-store";

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
  const ip = `198.30.${Math.floor(++n / 250)}.${n % 250}`;
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

const STUDENT = "fb-student@student.windesheim.nl";
const ADMIN = "fb-admin@windesheim.nl";
let student = "";
let admin = "";
beforeAll(async () => {
  student = await login(STUDENT);
  admin = await login(ADMIN);
  db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.email, ADMIN)).run();
});

const PNG_1x1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (ch) => ch.charCodeAt(0),
);
const CONTEXT = {
  path: "/lesson/abc",
  readerTitle: "Reader",
  lessonCode: "1.1A",
  lessonTitle: "Les",
  appVersion: "dev",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/605.1.15",
  browser: "Safari 18 · iOS",
  viewport: "390x844",
  locale: "nl",
  theme: "dark",
  standalone: false,
};

function form(fields: { type?: string; message?: string; context?: unknown; screenshot?: Blob | string }) {
  const f = new FormData();
  f.set("type", fields.type ?? "bug");
  f.set("message", fields.message ?? "The quiz button does nothing");
  f.set("context", typeof fields.context === "string" ? fields.context : JSON.stringify(fields.context ?? CONTEXT));
  if (fields.screenshot !== undefined) f.set("screenshot", fields.screenshot);
  return f;
}
/** Resets the feedback limit first (5 an hour would refuse most tests); the rate-limit test opts out. */
const post = (f: FormData, cookie = student, resetLimit = true) => {
  if (resetLimit) limits.feedback.reset();
  return fetch(`${base}/api/feedback`, { method: "POST", headers: { cookie, origin: "http://localhost:5173" }, body: f });
};
const call = (method: string, path: string, cookie = admin, body?: unknown) =>
  fetch(`${base}/api/admin/feedback${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const row = (id: string) => db.select().from(schema.feedback).where(eq(schema.feedback.id, id)).get();
const fileOf = (name: string) => join(env.uploadDir, "feedback", name);

async function expectError(r: Response, status: number, error: string) {
  const text = await r.text();
  expect([r.status, JSON.parse(text).error]).toEqual([status, error]);
  expect(text.length).toBeLessThan(4000);
}

async function create(fields: Parameters<typeof form>[0] = {}) {
  const r = await post(form(fields));
  expect(r.status).toBe(201);
  return (await r.json()) as { id: string; screenshotDropped?: true };
}

describe("POST /api/feedback", () => {
  test("without a screenshot: 201 and a new row", async () => {
    const { id, screenshotDropped } = await create();
    expect(screenshotDropped).toBeUndefined();
    const r = row(id)!;
    expect(r).toMatchObject({ type: "bug", message: "The quiz button does nothing", status: "new", screenshot: null, githubUrl: null });
    expect(r.context).toEqual(CONTEXT);
    const u = db.select().from(schema.user).where(eq(schema.user.email, STUDENT)).get()!;
    expect(r.userId).toBe(u.id);
  });

  test("signed out: 401", async () => {
    await expectError(await post(form({}), ""), 401, "UNAUTHORIZED");
  });

  test("with a 1x1 PNG: the file is stored and admins get it back as image/png, no-store", async () => {
    const { id } = await create({ screenshot: new Blob([PNG_1x1], { type: "image/png" }) });
    const r = row(id)!;
    expect(r.screenshot).toBe(`${id}.png`);
    expect(existsSync(fileOf(r.screenshot!))).toBe(true);
    const img = await call("GET", `/${id}/screenshot`);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("cache-control")).toBe("private, no-store");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG_1x1);
  });

  test("HTML labelled as a PNG: 400 BAD_IMAGE, no file and no row", async () => {
    const before = db.select().from(schema.feedback).all().length;
    const fake = new Blob(["<html><script>alert(1)</script></html>"], { type: "image/png" });
    await expectError(await post(form({ screenshot: fake })), 400, "BAD_IMAGE");
    expect(db.select().from(schema.feedback).all().length).toBe(before);
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: "image/svg+xml" });
    await expectError(await post(form({ screenshot: svg })), 400, "BAD_IMAGE");
    await expectError(await post(form({ screenshot: "not a file" })), 400, "BAD_IMAGE");
  });

  test("a screenshot over 5 MB: 400 FILE_TOO_LARGE", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG_1x1);
    await expectError(await post(form({ screenshot: new Blob([big], { type: "image/png" }) })), 400, "FILE_TOO_LARGE");
  });

  test("a body over the feedback cap: 413", async () => {
    const huge = new Uint8Array(7 * 1024 * 1024);
    await expectError(await post(form({ screenshot: new Blob([huge], { type: "image/png" }) })), 413, "PAYLOAD_TOO_LARGE");
  });

  test("message of 9 characters, a bad type or a missing context: 400 VALIDATION", async () => {
    await expectError(await post(form({ message: "123456789" })), 400, "VALIDATION");
    await expectError(await post(form({ message: "   123456789    " })), 400, "VALIDATION");
    await expectError(await post(form({ message: "x".repeat(4001) })), 400, "VALIDATION");
    await expectError(await post(form({ type: "rant" })), 400, "VALIDATION");
    await expectError(await post(form({ context: "{not json" })), 400, "VALIDATION");
    const f = form({});
    f.delete("context");
    await expectError(await post(f), 400, "VALIDATION");
  });

  test("a 10-character message counts code points, trimmed", async () => {
    const { id } = await create({ message: "  😀😀😀😀😀😀😀😀😀😀  " });
    expect(row(id)!.message).toBe("😀😀😀😀😀😀😀😀😀😀");
  });

  test("unknown context keys are stripped; string caps apply", async () => {
    const { id } = await create({ context: { ...CONTEXT, cookie: "session=secret", nested: { a: 1 } } });
    expect(Object.keys(row(id)!.context)).not.toContain("cookie");
    expect(Object.keys(row(id)!.context)).not.toContain("nested");
    await expectError(await post(form({ context: { ...CONTEXT, path: "/" + "x".repeat(300) } })), 400, "VALIDATION");
    await expectError(await post(form({ context: { ...CONTEXT, userAgent: "x".repeat(401) } })), 400, "VALIDATION");
    await expectError(await post(form({ context: { ...CONTEXT, error: { message: "x".repeat(501) } } })), 400, "VALIDATION");
    await expectError(await post(form({ context: { ...CONTEXT, standalone: "yes" } })), 400, "VALIDATION");
    const withError = await create({ context: { ...CONTEXT, error: { message: "boom", status: 500, code: "INTERNAL", apiPath: "/api/x", stack: "at x\nat y" } } });
    expect(row(withError.id)!.context.error).toEqual({ message: "boom", status: 500, code: "INTERNAL", apiPath: "/api/x", stack: "at x\nat y" });
  });

  test("a context over 8 KB: 400 VALIDATION", async () => {
    const big = JSON.stringify({ ...CONTEXT, padding: "x".repeat(8 * 1024) });
    await expectError(await post(form({ context: big })), 400, "VALIDATION");
  });

  test("the 6th report in an hour: 429 RATE_LIMITED", async () => {
    for (let i = 0; i < 5; i++) expect((await post(form({}), student, false)).status).toBe(201);
    const r = await post(form({}), student, false);
    expect(r.headers.get("retry-after")).toBeTruthy();
    await expectError(r, 429, "RATE_LIMITED");
  });

  test("over the 500 MB directory cap: saved without the screenshot", async () => {
    const spy = spyOn(store, "feedbackDirBytes").mockResolvedValue(store.FEEDBACK_DIR_CAP + 1);
    try {
      const { id, screenshotDropped } = await create({ screenshot: new Blob([PNG_1x1], { type: "image/png" }) });
      expect(screenshotDropped).toBe(true);
      expect(row(id)!.screenshot).toBeNull();
      expect(existsSync(fileOf(`${id}.png`))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("admin inbox", () => {
  test("a student gets 403 on every admin feedback route", async () => {
    const { id } = await create({ screenshot: new Blob([PNG_1x1], { type: "image/png" }) });
    for (const [method, path, body] of [
      ["GET", ""],
      ["GET", "?status=new"],
      ["GET", "/count"],
      ["PATCH", `/${id}`, { status: "done" }],
      ["DELETE", `/${id}`],
      ["GET", `/${id}/screenshot`],
    ] as [string, string, unknown?][]) {
      await expectError(await call(method, path, student, body), 403, "FORBIDDEN");
    }
    await expectError(await call("GET", "", ""), 401, "UNAUTHORIZED");
    expect(row(id)!.status).toBe("new");
    expect(existsSync(fileOf(`${id}.png`))).toBe(true);
  });

  test("list filters by status and type, newest first, with the reporter and repo", async () => {
    const a = await create({ type: "idea", message: "First idea for the app" });
    await Bun.sleep(5);
    const b = await create({ type: "idea", message: "Second idea for the app" });
    db.update(schema.feedback).set({ status: "in_progress" }).where(eq(schema.feedback.id, a.id)).run();

    const r = await call("GET", "?type=idea");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { repo: string; items: Record<string, unknown>[] };
    expect(body.repo).toBe(env.githubRepo);
    const ids = body.items.map((i) => i.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    expect(body.items.every((i) => i.type === "idea")).toBe(true);
    const item = body.items.find((i) => i.id === b.id)!;
    expect(item).toMatchObject({ type: "idea", message: "Second idea for the app", status: "new", githubUrl: null, hasScreenshot: false, context: CONTEXT });
    expect(item.reporter).toEqual({ name: expect.any(String), email: STUDENT });
    expect(typeof item.createdAt).toBe("string");
    expect(item).not.toHaveProperty("screenshot");
    expect(item).not.toHaveProperty("userId");

    const prog = (await (await call("GET", "?status=in_progress&type=idea")).json()) as { items: { id: string; status: string }[] };
    expect(prog.items.map((i) => i.id)).toContain(a.id);
    expect(prog.items.map((i) => i.id)).not.toContain(b.id);
    expect(prog.items.every((i) => i.status === "in_progress")).toBe(true);
    await expectError(await call("GET", "?status=bogus"), 400, "VALIDATION");
  });

  test("a report of a deleted account has reporter null", async () => {
    const { id } = await create();
    db.update(schema.feedback).set({ userId: null }).where(eq(schema.feedback.id, id)).run();
    const body = (await (await call("GET", "")).json()) as { items: { id: string; reporter: unknown }[] };
    expect(body.items.find((i) => i.id === id)!.reporter).toBeNull();
  });

  test("count returns the number of new reports", async () => {
    const before = ((await (await call("GET", "/count")).json()) as { new: number }).new;
    const expected = db.select().from(schema.feedback).where(eq(schema.feedback.status, "new")).all().length;
    expect(before).toBe(expected);
    const { id } = await create();
    expect(((await (await call("GET", "/count")).json()) as { new: number }).new).toBe(before + 1);
    expect((await call("PATCH", `/${id}`, admin, { status: "done" })).status).toBe(200);
    expect(((await (await call("GET", "/count")).json()) as { new: number }).new).toBe(before);
  });

  test("PATCH sets status and githubUrl and bumps updatedAt; bad input is refused", async () => {
    const { id } = await create();
    const old = row(id)!.updatedAt.getTime();
    await Bun.sleep(5);
    expect((await call("PATCH", `/${id}`, admin, { status: "in_progress" })).status).toBe(200);
    expect(row(id)!.status).toBe("in_progress");
    expect(row(id)!.updatedAt.getTime()).toBeGreaterThan(old);
    const url = "https://github.com/SilkePilon/windesheim-readers/issues/12";
    const ok = await call("PATCH", `/${id}`, admin, { githubUrl: url });
    expect(await ok.json()).toEqual({ ok: true });
    expect(row(id)!.githubUrl).toBe(url);
    expect((await call("PATCH", `/${id}`, admin, { githubUrl: null })).status).toBe(200);
    expect(row(id)!.githubUrl).toBeNull();

    await expectError(await call("PATCH", `/${id}`, admin, { githubUrl: "http://evil" }), 400, "VALIDATION");
    await expectError(await call("PATCH", `/${id}`, admin, { githubUrl: "https://github.com.evil.io/x" }), 400, "VALIDATION");
    await expectError(await call("PATCH", `/${id}`, admin, { githubUrl: "https://github.com/" + "x".repeat(300) }), 400, "VALIDATION");
    await expectError(await call("PATCH", `/${id}`, admin, { githubUrl: "javascript:alert(1)//https://github.com/" }), 400, "VALIDATION");
    await expectError(await call("PATCH", `/${id}`, admin, { status: "closed" }), 400, "VALIDATION");
    await expectError(await call("PATCH", `/${id}`, admin, {}), 400, "VALIDATION");
    await expectError(await call("PATCH", `/${id}`, admin, { status: "done", message: "x" }), 400, "VALIDATION");
    expect(row(id)!.status).toBe("in_progress");
    await expectError(await call("PATCH", "/does-not-exist", admin, { status: "done" }), 404, "NOT_FOUND");
  });

  test("DELETE removes the row and the file; a file already gone is fine; then 404", async () => {
    const a = await create({ screenshot: new Blob([PNG_1x1], { type: "image/png" }) });
    const nameA = row(a.id)!.screenshot!;
    expect(await (await call("DELETE", `/${a.id}`)).json()).toEqual({ ok: true });
    expect(row(a.id)).toBeUndefined();
    expect(existsSync(fileOf(nameA))).toBe(false);

    const b = await create({ screenshot: new Blob([PNG_1x1], { type: "image/png" }) });
    unlinkSync(fileOf(row(b.id)!.screenshot!));
    expect((await call("DELETE", `/${b.id}`)).status).toBe(200);
    expect(row(b.id)).toBeUndefined();
    await expectError(await call("DELETE", `/${b.id}`), 404, "NOT_FOUND");
  });

  test("screenshot: 404 without one, and 404 when the file is gone", async () => {
    const plain = await create();
    await expectError(await call("GET", `/${plain.id}/screenshot`), 404, "NOT_FOUND");
    await expectError(await call("GET", "/does-not-exist/screenshot"), 404, "NOT_FOUND");
    const gone = await create({ screenshot: new Blob([PNG_1x1], { type: "image/png" }) });
    unlinkSync(fileOf(row(gone.id)!.screenshot!));
    await expectError(await call("GET", `/${gone.id}/screenshot`), 404, "NOT_FOUND");
  });
});
