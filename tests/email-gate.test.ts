import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { reserveEmailSend, resetEmailGate } from "../server/lib/email-gate";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 1, 12);

const saved = { hourly: env.emailLimitHourly, daily: env.emailLimitDaily };
beforeAll(() => runMigrations());
beforeEach(() => {
  resetEmailGate();
  env.emailLimitHourly = saved.hourly;
  env.emailLimitDaily = saved.daily;
});
afterAll(() => {
  resetEmailGate();
  Object.assign(env, { emailLimitHourly: saved.hourly, emailLimitDaily: saved.daily });
});

const rows = () => db.select().from(schema.emailSendLog).all();

describe("per email: 1 / 60 s, 3 / 15 min, 6 / 24 h", () => {
  test("one per minute, retryAfter until the oldest send leaves the window", () => {
    expect(reserveEmailSend("a@windesheim.nl", "1.1.1.1", T0)).toEqual({ ok: true });
    expect(reserveEmailSend("a@windesheim.nl", "2.2.2.2", T0 + 20_000)).toEqual({ ok: false, scope: "email", retryAfter: 40 });
    expect(reserveEmailSend("a@windesheim.nl", "2.2.2.2", T0 + 60_000).ok).toBe(true);
    expect(rows()).toHaveLength(2); // the refused attempt reserved nothing
  });

  test("three per 15 minutes", () => {
    for (const m of [0, 1, 2]) expect(reserveEmailSend("b@windesheim.nl", `9.9.9.${m}`, T0 + m * MIN).ok).toBe(true);
    // 3 sends at 0, 1, 2 min: the 15-minute window frees up when the first one (t=0) expires.
    expect(reserveEmailSend("b@windesheim.nl", "9.9.9.9", T0 + 5 * MIN)).toEqual({ ok: false, scope: "email", retryAfter: 10 * 60 });
    expect(reserveEmailSend("b@windesheim.nl", "9.9.9.9", T0 + 15 * MIN).ok).toBe(true);
  });

  test("six per day", () => {
    for (let i = 0; i < 6; i++) expect(reserveEmailSend("c@windesheim.nl", `8.8.8.${i}`, T0 + i * 20 * MIN).ok).toBe(true);
    const r = reserveEmailSend("c@windesheim.nl", "8.8.8.8", T0 + 3 * HOUR);
    expect(r).toEqual({ ok: false, scope: "email", retryAfter: (DAY - 3 * HOUR) / 1000 });
    expect(reserveEmailSend("c@windesheim.nl", "8.8.8.8", T0 + DAY).ok).toBe(true);
  });
});

describe("per IP: 5 / 15 min, 20 / 24 h", () => {
  test("five addresses per 15 minutes from one IP", () => {
    for (let i = 0; i < 5; i++) expect(reserveEmailSend(`u${i}@windesheim.nl`, "7.7.7.7", T0 + i * 1000).ok).toBe(true);
    expect(reserveEmailSend("u9@windesheim.nl", "7.7.7.7", T0 + 10_000)).toEqual({ ok: false, scope: "ip", retryAfter: 15 * 60 - 10 });
    expect(reserveEmailSend("u9@windesheim.nl", "7.7.7.8", T0 + 10_000).ok).toBe(true);
  });

  test("twenty per day from one IP", () => {
    for (let i = 0; i < 20; i++) expect(reserveEmailSend(`d${i}@windesheim.nl`, "6.6.6.6", T0 + i * 16 * MIN).ok).toBe(true);
    const r = reserveEmailSend("d99@windesheim.nl", "6.6.6.6", T0 + 20 * 16 * MIN);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.scope).toBe("ip");
  });
});

describe("global: EMAIL_LIMIT_HOURLY / EMAIL_LIMIT_DAILY", () => {
  test("hourly cap across all addresses and IPs", () => {
    env.emailLimitHourly = 4;
    for (let i = 0; i < 4; i++) expect(reserveEmailSend(`g${i}@windesheim.nl`, `5.5.5.${i}`, T0 + i * MIN).ok).toBe(true);
    expect(reserveEmailSend("g9@windesheim.nl", "5.5.5.9", T0 + 30 * MIN)).toEqual({ ok: false, scope: "global", retryAfter: 30 * 60 });
    expect(reserveEmailSend("g9@windesheim.nl", "5.5.5.9", T0 + HOUR).ok).toBe(true);
  });

  test("daily cap", () => {
    env.emailLimitDaily = 3;
    for (let i = 0; i < 3; i++) expect(reserveEmailSend(`h${i}@windesheim.nl`, `4.4.4.${i}`, T0 + i * HOUR).ok).toBe(true);
    const r = reserveEmailSend("h9@windesheim.nl", "4.4.4.9", T0 + 5 * HOUR);
    expect(r).toEqual({ ok: false, scope: "global", retryAfter: (DAY - 5 * HOUR) / 1000 });
  });

  test("defaults: 30 per hour, 100 per day", () => {
    expect([saved.hourly, saved.daily]).toEqual([30, 100]);
  });
});

test("old rows are pruned", () => {
  reserveEmailSend("old@windesheim.nl", "3.3.3.3", T0);
  resetEmailGateKeepRows();
  reserveEmailSend("new@windesheim.nl", "3.3.3.4", T0 + 3 * DAY);
  expect(rows().map((r) => r.email)).toEqual(["new@windesheim.nl"]);
});

/** Forces the next reserve to prune, without deleting rows. */
function resetEmailGateKeepRows() {
  const keep = rows();
  resetEmailGate();
  if (keep.length) db.insert(schema.emailSendLog).values(keep).run();
}

test("limits survive a restart: a fresh process sees the same counts in the database", async () => {
  const now = Date.now();
  expect(reserveEmailSend("restart@windesheim.nl", "2.2.2.2", now).ok).toBe(true);
  const proc = Bun.spawn(["bun", join(import.meta.dir, "fixtures/email-gate-reserve.ts"), "restart@windesheim.nl", "2.2.2.3"], {
    env: { ...process.env, NODE_ENV: "test" }, // same DATABASE_PATH (set by tests/setup-env.ts)
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  expect(await proc.exited, await new Response(proc.stderr).text()).toBe(0);
  const r = JSON.parse(out.trim().split("\n").pop()!);
  expect(r.ok).toBe(false);
  expect(r.scope).toBe("email");
  expect(r.retryAfter).toBeGreaterThan(50);
});
