import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { env } from "../server/env";
import { RateLimiter, rateLimit } from "../server/lib/rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("RateLimiter", () => {
  test("allows up to the limit per window, then blocks until the window ends", () => {
    const c = clock();
    const l = new RateLimiter([{ limit: 3, windowMs: 10_000 }], { now: c.now });
    expect([l.hit("a"), l.hit("a"), l.hit("a")].every((r) => r.ok)).toBe(true);
    c.advance(4_000);
    expect(l.hit("a")).toEqual({ ok: false, retryAfterMs: 6_000 });
    // Other keys have their own budget.
    expect(l.hit("b").ok).toBe(true);
    c.advance(5_999);
    expect(l.hit("a")).toEqual({ ok: false, retryAfterMs: 1 });
    c.advance(1);
    expect(l.hit("a").ok).toBe(true);
  });

  test("several rules: the strictest violated one decides retryAfter", () => {
    const c = clock();
    const l = new RateLimiter(
      [
        { limit: 2, windowMs: 1_000 },
        { limit: 3, windowMs: 60_000 },
      ],
      { now: c.now },
    );
    expect(l.hit("k").ok && l.hit("k").ok).toBe(true);
    expect(l.hit("k")).toEqual({ ok: false, retryAfterMs: 1_000 });
    c.advance(1_000);
    expect(l.hit("k").ok).toBe(true); // 3rd in the minute
    c.advance(1_000);
    // Short window is free again, but the minute is used up: wait for the long window.
    expect(l.hit("k")).toEqual({ ok: false, retryAfterMs: 58_000 });
  });

  test("blocked hits don't count (a blocked client doesn't extend its own ban)", () => {
    const c = clock();
    const l = new RateLimiter([{ limit: 1, windowMs: 1_000 }], { now: c.now });
    l.hit("a");
    for (let i = 0; i < 50; i++) l.hit("a");
    c.advance(1_000);
    expect(l.hit("a").ok).toBe(true);
  });

  test("cleanup removes keys whose windows have all expired", () => {
    const c = clock();
    const l = new RateLimiter(
      [
        { limit: 5, windowMs: 1_000 },
        { limit: 50, windowMs: 10_000 },
      ],
      { now: c.now },
    );
    l.hit("old");
    c.advance(5_000);
    l.hit("new");
    c.advance(5_000); // "old" is now past both windows, "new" isn't
    l.cleanup();
    expect(l.size).toBe(1);
    c.advance(5_000);
    l.cleanup();
    expect(l.size).toBe(0);
  });

  test("memory is bounded by maxKeys: expired keys go first, then the oldest", () => {
    const c = clock();
    const l = new RateLimiter([{ limit: 1, windowMs: 1_000 }], { now: c.now, maxKeys: 100 });
    for (let i = 0; i < 100; i++) l.hit(`a${i}`);
    c.advance(1_000);
    for (let i = 0; i < 10; i++) l.hit(`b${i}`); // the a* keys expired: swept, not evicted one by one
    expect(l.size).toBe(10);
    for (let i = 0; i < 1_000; i++) l.hit(`c${i}`);
    expect(l.size).toBe(100);
    // The newest keys are still limited; the oldest were evicted.
    expect(l.hit("c999").ok).toBe(false);
    expect(l.hit("b0").ok).toBe(true);
  });
});

describe("rateLimit middleware", () => {
  const disabled = env.rateLimitDisabled;
  afterEach(() => {
    env.rateLimitDisabled = disabled;
  });

  const appWith = (mw: ReturnType<typeof rateLimit>) => new Hono().get("/x", mw, (c) => c.text("ok"));

  test("answers 429 RATE_LIMITED with retryAfter and a Retry-After header", async () => {
    const mw = rateLimit({ name: "t", rules: [{ limit: 2, windowMs: 90_000 }], key: () => "same" });
    const app = appWith(mw);
    expect((await app.request("/x")).status).toBe(200);
    expect((await app.request("/x")).status).toBe(200);
    const r = await app.request("/x");
    expect(r.status).toBe(429);
    const body = (await r.json()) as { error: string; retryAfter: number };
    expect(body.error).toBe("RATE_LIMITED");
    expect(body.retryAfter).toBeGreaterThanOrEqual(89);
    expect(body.retryAfter).toBeLessThanOrEqual(90);
    expect(r.headers.get("Retry-After")).toBe(String(body.retryAfter));
  });

  test("a null key skips the limit; RATE_LIMIT_DISABLED turns it off", async () => {
    const skip = appWith(rateLimit({ name: "t", rules: [{ limit: 1, windowMs: 60_000 }], key: () => null }));
    for (let i = 0; i < 3; i++) expect((await skip.request("/x")).status).toBe(200);

    const app = appWith(rateLimit({ name: "t", rules: [{ limit: 1, windowMs: 60_000 }], key: () => "k" }));
    env.rateLimitDisabled = true;
    for (let i = 0; i < 3; i++) expect((await app.request("/x")).status).toBe(200);
    env.rateLimitDisabled = false;
    expect((await app.request("/x")).status).toBe(200);
    expect((await app.request("/x")).status).toBe(429);
  });

  test("the default key is the signed-in user, so users behind one IP don't share a bucket", async () => {
    const mw = rateLimit({ name: "t", rules: [{ limit: 1, windowMs: 60_000 }] });
    const app = new Hono<{ Variables: { user: { id: string } } }>()
      .use(async (c, next) => {
        c.set("user", { id: c.req.header("x-user")! });
        await next();
      })
      .get("/x", mw, (c) => c.text("ok"));
    expect((await app.request("/x", { headers: { "x-user": "a" } })).status).toBe(200);
    expect((await app.request("/x", { headers: { "x-user": "b" } })).status).toBe(200);
    expect((await app.request("/x", { headers: { "x-user": "a" } })).status).toBe(429);
  });
});
