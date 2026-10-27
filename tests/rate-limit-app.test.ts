// The real app with every rate limit on, served by Bun.serve exactly like server/index.ts
// ({fetch, websocket}), so the client IP comes from the socket unless a test sets
// CLIENT_IP_HEADER. The e2e suite runs with RATE_LIMIT_DISABLED; this file is its counterpart.
import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { websocket } from "@hono/bun";
import { eq } from "drizzle-orm";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { resetEmailGate } from "../server/lib/email-gate";
import { limits } from "../server/limits";
import { messageGuard } from "../server/live/battle";
import { AI_DAILY_DEFAULTS, setAiDailyLimits, type AiFeature } from "../server/lib/ai-quota";
import { aiStubControl } from "../server/ai/chat-stub";

runMigrations();
const { app } = await import("../server/app");

let server: ReturnType<typeof Bun.serve>;
let base = "";
const H = { "content-type": "application/json", origin: "http://localhost:5173" };
const saved = { header: env.clientIpHeader, disabled: env.rateLimitDisabled };

/** Magic links printed by the console mailer (no RESEND_API_KEY in tests). */
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
// better-auth's own limiter (3 sign-ins per 10 s per IP) stays on and can't be reset, so
// every test speaks for a fresh client IP through CLIENT_IP_HEADER unless it opts out.
let n = 0;
let ip = "";
beforeEach(() => {
  for (const l of Object.values(limits)) l.reset();
  resetEmailGate();
  env.clientIpHeader = "x-test-ip";
  env.rateLimitDisabled = false;
  ip = `198.18.${Math.floor(++n / 250)}.${n % 250}`;
});

const signIn = (email: string, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { ...H, "x-test-ip": ip, ...headers },
    body: JSON.stringify({ email, callbackURL: "/" }),
  });

async function login(email: string) {
  links.delete(email);
  // A fresh IP per login, so better-auth's own (unresettable) limiter never gets in the way.
  const loginIp = `198.19.${Math.floor(++n / 250)}.${n % 250}`;
  const r = await signIn(email, { "x-test-ip": loginIp });
  expect(r.status).toBe(200);
  const url = new URL(links.get(email)!);
  const v = await fetch(`${base}${url.pathname}${url.search}`, { redirect: "manual", headers: { "x-test-ip": loginIp } });
  const cookie = v.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  expect(cookie).toContain("session_token");
  return cookie;
}

describe("magic-link email gate", () => {
  test("second link for the same address within a minute: 429 with retryAfter, nothing sent", async () => {
    expect((await signIn("Ann@Student.Windesheim.nl")).status).toBe(200);
    links.clear();
    const r = await signIn("ann@student.windesheim.nl");
    expect(r.status).toBe(429);
    const body = (await r.json()) as { error: string; retryAfter: number };
    expect(body.error).toBe("RATE_LIMITED");
    expect(body.retryAfter).toBeGreaterThan(55);
    expect(body.retryAfter).toBeLessThanOrEqual(60);
    expect(r.headers.get("Retry-After")).toBe(String(body.retryAfter));
    expect(links.size).toBe(0);
  });

  test("the answer doesn't reveal whether an account exists", async () => {
    await db.insert(schema.user).values({ id: "u-exists", name: "exists", email: "exists@windesheim.nl" }).onConflictDoNothing();
    const a = await signIn("exists@windesheim.nl");
    const b = await signIn("nobody-here@windesheim.nl");
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await a.text()).toBe(await b.text());
    const [a2, b2] = [await signIn("exists@windesheim.nl"), await signIn("nobody-here@windesheim.nl")];
    expect([a2.status, b2.status]).toEqual([429, 429]);
    const strip = (j: { retryAfter: number }) => ({ ...j, retryAfter: 0 });
    expect(strip(await a2.json())).toEqual(strip(await b2.json()));
  });

  test("atomic under concurrent requests: one address from 25 IPs at once sends exactly one email", async () => {
    const rs = await Promise.all(
      Array.from({ length: 25 }, (_, i) => signIn("race@student.windesheim.nl", { "x-test-ip": `203.0.113.${i + 1}` })),
    );
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(24);
    expect(db.select().from(schema.emailSendLog).where(eq(schema.emailSendLog.email, "race@student.windesheim.nl")).all()).toHaveLength(1);
  });

  test("atomic per IP: 8 different addresses at once from one IP reserve exactly 5", async () => {
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => signIn(`burst${i}@student.windesheim.nl`)));
    const bodies = (await Promise.all(rs.map((r) => r.json()))) as { error?: string }[];
    expect(bodies.filter((b) => b.error === "RATE_LIMITED")).toHaveLength(3); // the gate's answers
    expect(db.select().from(schema.emailSendLog).where(eq(schema.emailSendLog.ip, ip)).all()).toHaveLength(5);
    // better-auth's own burst limit (3 per 10 s) may refuse some of the 5; never more get through.
    expect(rs.filter((r) => r.status === 200).length).toBeLessThanOrEqual(5);
  });

  test("an untrimmed or oddly cased address counts as the same address", async () => {
    expect((await signIn("Case@Windesheim.NL")).status).toBe(200);
    const r = await signIn("case@windesheim.nl", { "x-test-ip": "198.51.100.200" });
    expect(r.status).toBe(429);
  });

  test("disallowed domains get their normal error and reserve nothing, but count per IP", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await signIn(`spam${i}@gmail.com`);
      const body = (await r.json()) as { message?: string; error?: string };
      // better-auth answers: its domain error, or (after 3 in 10 s) its own burst limit. Never our gate.
      if (i < 3) expect([r.status, body.message]).toEqual([403, "EMAIL_DOMAIN_NOT_ALLOWED"]);
      else expect(body.error).toBeUndefined();
    }
    expect(db.select().from(schema.emailSendLog).all()).toHaveLength(0);
    // The sign-in bucket (10 per 10 min per IP) is used up now, for every address.
    const r = await signIn("legit@windesheim.nl");
    expect(r.status).toBe(429);
    expect(((await r.json()) as { error: string }).error).toBe("RATE_LIMITED");
  });
});

describe("auth and api buckets (per IP from the socket)", () => {
  test("30 auth requests per 10 min; get-session has its own loose bucket", async () => {
    env.clientIpHeader = ""; // the socket address (127.0.0.1)
    for (let i = 0; i < 30; i++) expect((await fetch(`${base}/api/auth/ok`)).status).toBe(200);
    const r = await fetch(`${base}/api/auth/ok`);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(500);
    expect((await fetch(`${base}/api/auth/get-session`)).status).toBe(200);
    // A different client (via the configured proxy header) is unaffected.
    env.clientIpHeader = "cf-connecting-ip";
    expect((await fetch(`${base}/api/auth/ok`, { headers: { "cf-connecting-ip": "198.51.100.1" } })).status).toBe(200);
  });

  test("flood guard: 600 /api requests per minute per IP; /api/health is exempt", async () => {
    env.clientIpHeader = "";
    limits.api.limiter.reset();
    // Fill the bucket directly (600 real requests would only slow the suite down).
    for (let i = 0; i < 599; i++) limits.api.limiter.hit("ip:127.0.0.1");
    expect((await fetch(`${base}/api/readers`)).status).toBe(401);
    expect((await fetch(`${base}/api/readers`)).status).toBe(429);
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });
});

describe("per-user limits", () => {
  const poster = (cookie: string) => (path: string) => fetch(`${base}/api${path}`, { method: "POST", headers: { ...H, cookie }, body: "{}" });
  const userId = async (cookie: string) => ((await (await fetch(`${base}/api/me`, { headers: { cookie } })).json()) as { user: { id: string } }).user.id;

  test("each AI feature has its own burst bucket; writes have theirs", async () => {
    const post = poster(await login("ai-user@student.windesheim.nl"));
    for (let i = 0; i < 4; i++) expect((await post("/lessons/nope/explain")).status).toBe(404);
    const r = await post("/lessons/nope/explain");
    expect(r.status).toBe(429);
    const body = (await r.json()) as { error: string; retryAfter: number };
    expect(body.error).toBe("RATE_LIMITED");
    expect(body.retryAfter).toBeGreaterThan(50);
    // Explain is used up for the minute; grading and the tutor are not.
    for (let i = 0; i < 6; i++) expect((await post("/questions/nope/grade")).status).toBe(404);
    expect((await post("/questions/nope/grade")).status).toBe(429);
    for (let i = 0; i < 6; i++) expect((await post("/lessons/nope/chat")).status).toBe(404);
    expect((await post("/lessons/nope/chat")).status).toBe(429);
    expect((await post("/lessons/nope/read")).status).toBe(404);
    // Another user behind the same IP still has their own AI budget.
    expect((await poster(await login("ai-other@student.windesheim.nl"))("/lessons/nope/explain")).status).toBe(404);
  });

  test("the 10-minute window per feature (explain: 15)", async () => {
    let t = Date.now();
    const realNow = Date.now;
    const cookie = await login("ai-window@student.windesheim.nl");
    const post = poster(cookie);
    try {
      // 4 a minute, 15 per 10 minutes: step the clock a minute between bursts.
      Date.now = () => t;
      let ok = 0;
      for (let minute = 0; minute < 5; minute++, t += 61_000) {
        for (let i = 0; i < 4; i++) if ((await post("/lessons/nope/explain")).status === 404) ok++;
      }
      expect(ok).toBe(15);
    } finally {
      Date.now = realNow;
    }
  });

  test("the combined AI guard (40 per 10 min) caps all features together", async () => {
    const cookie = await login("ai-combined@student.windesheim.nl");
    const id = await userId(cookie);
    for (let i = 0; i < 39; i++) limits.ai.limiter.hit(`u:${id}`);
    const post = poster(cookie);
    expect((await post("/lessons/nope/explain")).status).toBe(404);
    expect((await post("/questions/nope/grade")).status).toBe(429); // its own bucket is untouched
    expect((await post("/lessons/nope/chat")).status).toBe(429);
  });

  test("admins get twice the burst limits, not an exemption", async () => {
    const cookie = await login("ai-admin@windesheim.nl");
    db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.email, "ai-admin@windesheim.nl")).run();
    const post = poster(cookie);
    for (let i = 0; i < 8; i++) expect((await post("/lessons/nope/explain")).status).toBe(404);
    expect((await post("/lessons/nope/explain")).status).toBe(429);
  });
});

describe("battle websocket", () => {
  function open(cookie: string) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/battle/ws`, { headers: { cookie } } as never);
    const msgs: { t: string; error?: string }[] = [];
    const closed = new Promise<number>((res) => (ws.onclose = (e) => res(e.code)));
    ws.onmessage = (e) => msgs.push(JSON.parse(String(e.data)));
    return { ws, msgs, closed, ready: new Promise((res) => (ws.onopen = res)) };
  }

  test("join is limited to 20 per minute per user (no guessing 6-digit codes)", async () => {
    const cookie = await login("guesser@student.windesheim.nl");
    const s = open(cookie);
    await s.ready;
    for (let i = 0; i < 21; i++) {
      s.ws.send(JSON.stringify({ t: "join", code: String(100000 + i) }));
      await Bun.sleep(i % 15 === 14 ? 2100 : 5); // stay under the per-connection message cap
    }
    await Bun.sleep(100);
    expect(s.msgs.filter((m) => m.error === "ROOM_NOT_FOUND")).toHaveLength(20);
    expect(s.msgs.at(-1)?.error).toBe("RATE_LIMITED");
    s.ws.close();
  }, 15_000);

  test("upgrades are limited to 30 per minute per IP", async () => {
    env.clientIpHeader = "";
    for (let i = 0; i < 30; i++) limits.battleUpgrade.limiter.hit("ip:127.0.0.1");
    const r = await fetch(`${base}/api/battle/ws`);
    expect(r.status).toBe(429);
  });

  test("message flood: extra messages are dropped, repeat offenders are closed with 4429", () => {
    let t = 0;
    const guard = messageGuard(() => t);
    const closes: number[] = [];
    const ws = { close: (code?: number) => void closes.push(code ?? 0) };
    const burst = () => Array.from({ length: 25 }, () => guard(ws)).filter(Boolean).length;
    expect(burst()).toBe(20);
    expect(closes).toEqual([]);
    t += 2_000;
    expect(burst()).toBe(20);
    t += 2_000;
    burst();
    expect(closes).toEqual([4429]);
  });

  test("a quiet connection is never closed", () => {
    let t = 0;
    const guard = messageGuard(() => t);
    const ws = { close: () => {
      throw new Error("closed");
    } };
    for (let i = 0; i < 1_000; i++) {
      expect(guard(ws)).toBe(true);
      t += 150;
    }
  });
});

describe("daily AI limits (persisted, admin settings)", () => {
  const stub = process.env.AI_STUB;
  beforeAll(() => {
    process.env.AI_STUB = "1"; // stub tutor and graders: never a real AI call
    db.insert(schema.reader).values({ id: "tq-reader", title: "R", fileName: "r.pdf", status: "ready", published: true }).onConflictDoNothing().run();
    db.insert(schema.lesson)
      .values({ id: "tq-lesson", readerId: "tq-reader", code: "1.1A", title: "L", week: 1, position: 0, startPage: 1, endPage: 2, status: "ready" })
      .onConflictDoNothing()
      .run();
    db.insert(schema.question)
      .values({ id: "tq-open", lessonId: "tq-lesson", type: "open", prompt: "Why?", difficulty: 2, data: { type: "open", modelAnswer: "Because", rubric: ["x"] } })
      .onConflictDoNothing()
      .run();
  });
  // Only the daily limits here: the burst buckets have their own tests above.
  beforeEach(() => {
    env.rateLimitDisabled = true;
    aiStubControl.fail = false;
  });
  afterAll(() => {
    if (stub === undefined) delete process.env.AI_STUB;
    else process.env.AI_STUB = stub;
    aiStubControl.fail = false;
    setAiDailyLimits(AI_DAILY_DEFAULTS);
  });

  const send: Record<AiFeature, (cookie: string) => Promise<Response>> = {
    tutor: (cookie) =>
      fetch(`${base}/api/lessons/tq-lesson/chat`, {
        method: "POST",
        headers: { ...H, cookie },
        body: JSON.stringify({ messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Hoi" }] }] }),
      }),
    explain: (cookie) =>
      fetch(`${base}/api/lessons/tq-lesson/explain`, {
        method: "POST",
        headers: { ...H, cookie },
        body: JSON.stringify({ concept: "Organisatie", explanation: "Een organisatie is een groep mensen met een doel." }),
      }),
    grade: (cookie) =>
      fetch(`${base}/api/questions/tq-open/grade`, { method: "POST", headers: { ...H, cookie }, body: JSON.stringify({ answer: "Omdat het zo is." }) }),
  };
  const quotas = async (cookie: string) => (await (await fetch(`${base}/api/me/ai-quota`, { headers: { cookie } })).json()) as Record<AiFeature, unknown>;

  for (const f of ["tutor", "explain", "grade"] as const) {
    test(`${f}: atomic under concurrency, 429 AI_DAILY_LIMIT shape`, async () => {
      setAiDailyLimits({ [f]: 4 });
      const cookie = await login(`dl-${f}@student.windesheim.nl`);
      const rs = await Promise.all(Array.from({ length: 12 }, () => send[f](cookie)));
      const ok = rs.filter((r) => r.status === 200);
      expect(ok).toHaveLength(4);
      expect(await ok[0]!.text()).toContain("Stub-");
      const refused = rs.filter((r) => r.status === 429);
      expect(refused).toHaveLength(8);
      const body = (await refused[0]!.json()) as { error: string; feature: string; limit: number; retryAfter: number };
      expect(body).toEqual({ error: "AI_DAILY_LIMIT", feature: f, limit: 4, retryAfter: body.retryAfter });
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(body.retryAfter).toBeLessThanOrEqual(25 * 3600);
      expect(refused[0]!.headers.get("Retry-After")).toBe(String(body.retryAfter));
      const q = await quotas(cookie);
      expect(q[f]).toEqual({ limit: 4, used: 4, remaining: 0 });
      // The other features are counted separately.
      for (const other of ["tutor", "explain", "grade"] as const) if (other !== f) expect((q[other] as { used: number }).used).toBe(0);
      setAiDailyLimits({ [f]: AI_DAILY_DEFAULTS[f] });
    });

    test(`${f}: a model failure gives the use back`, async () => {
      setAiDailyLimits({ [f]: 2 });
      const cookie = await login(`dl-fail-${f}@student.windesheim.nl`);
      aiStubControl.fail = true;
      const r = await send[f](cookie);
      await r.text(); // the tutor streams its error; the graders answer 500
      aiStubControl.fail = false;
      expect((await quotas(cookie))[f]).toEqual({ limit: 2, used: 0, remaining: 2 });
      expect((await send[f](cookie)).status).toBe(200);
      expect((await quotas(cookie))[f]).toEqual({ limit: 2, used: 1, remaining: 1 });
      setAiDailyLimits({ [f]: AI_DAILY_DEFAULTS[f] });
    });
  }

  test("a request refused by validation costs nothing", async () => {
    const cookie = await login("dl-invalid@student.windesheim.nl");
    const r = await fetch(`${base}/api/lessons/tq-lesson/explain`, { method: "POST", headers: { ...H, cookie }, body: JSON.stringify({ concept: "x", explanation: "short" }) });
    expect(r.status).toBe(400);
    const g = await fetch(`${base}/api/questions/tq-open/grade`, { method: "POST", headers: { ...H, cookie }, body: JSON.stringify({ answer: "z".repeat(2001) }) });
    expect(g.status).toBe(400);
    const q = await quotas(cookie);
    expect([(q.explain as { used: number }).used, (q.grade as { used: number }).used]).toEqual([0, 0]);
  });

  test("the settings endpoint validates all three limits (integer 0-1000, admins only)", async () => {
    const student = await login("tq-student@student.windesheim.nl");
    const adminCookie = await login("tq-admin@windesheim.nl");
    db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.email, "tq-admin@windesheim.nl")).run();
    const put = (cookie: string, body: Record<string, unknown>) =>
      fetch(`${base}/api/admin/settings/ai`, { method: "PUT", headers: { ...H, cookie }, body: JSON.stringify(body) });
    for (const name of ["tutorDailyLimit", "explainDailyLimit", "gradeDailyLimit"]) {
      for (const bad of [-1, 1001, 2.5, "5", null]) {
        const r = await put(adminCookie, { [name]: bad });
        expect(r.status).toBe(400);
        expect(((await r.json()) as { error: string }).error).toBe("VALIDATION");
      }
    }
    expect((await put(student, { explainDailyLimit: 5 })).status).toBe(403);
    const r = await put(adminCookie, { tutorDailyLimit: 1000, explainDailyLimit: 0, gradeDailyLimit: 7 });
    expect(r.status).toBe(200);
    const saved = { tutorDailyLimit: 1000, explainDailyLimit: 0, gradeDailyLimit: 7 };
    expect(await r.json()).toMatchObject(saved);
    expect(await (await fetch(`${base}/api/admin/settings/ai`, { headers: { cookie: adminCookie } })).json()).toMatchObject(saved);
    // Defaults when nothing is stored.
    setAiDailyLimits(AI_DAILY_DEFAULTS);
    expect(await (await fetch(`${base}/api/admin/settings/ai`, { headers: { cookie: adminCookie } })).json()).toMatchObject({
      tutorDailyLimit: 30,
      explainDailyLimit: 20,
      gradeDailyLimit: 30,
    });
    // Admins are exempt from the daily limits themselves.
    setAiDailyLimits({ tutor: 1, explain: 1, grade: 1 });
    for (const f of ["tutor", "explain", "grade"] as const) for (let i = 0; i < 3; i++) expect((await send[f](adminCookie)).status).toBe(200);
    expect(await quotas(adminCookie)).toEqual({ tutor: null, explain: null, grade: null });
    // The old tutor-only route still answers.
    expect(await (await fetch(`${base}/api/me/tutor-quota`, { headers: { cookie: student } })).json()).toEqual({ tutor: { limit: 1, used: 0, remaining: 1 } });
  });
});
