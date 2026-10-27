import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { db, runMigrations, schema } from "../server/db";
import {
  AI_DAILY_DEFAULTS,
  AI_FEATURES,
  aiQuota,
  aiQuotas,
  consumeAi,
  getAiLimitSettings,
  nextMidnight,
  secondsUntilMidnight,
  setAiDailyLimits,
} from "../server/lib/ai-quota";

const student = { id: "aq-student", role: "user" };
const admin = { id: "aq-admin", role: "admin" };
// 2026-10-27 12:00 in Amsterdam (CET, UTC+1).
const NOON = new Date("2026-10-27T11:00:00Z");

beforeAll(() => {
  runMigrations();
  for (const u of [student, admin]) {
    db.insert(schema.user).values({ id: u.id, name: u.id, email: `${u.id}@windesheim.nl`, role: u.role as "user" | "admin" }).onConflictDoNothing().run();
  }
});
beforeEach(() => {
  db.delete(schema.aiUsage).run();
  setAiDailyLimits(AI_DAILY_DEFAULTS);
});
afterAll(() => {
  db.delete(schema.aiUsage).run();
  setAiDailyLimits(AI_DAILY_DEFAULTS);
});

describe("nextMidnight (Europe/Amsterdam)", () => {
  test("a normal day", () => {
    expect(nextMidnight(NOON).toISOString()).toBe("2026-10-27T23:00:00.000Z");
    expect(nextMidnight(new Date("2026-07-01T10:00:00Z")).toISOString()).toBe("2026-07-01T22:00:00.000Z");
    expect(secondsUntilMidnight(NOON)).toBe(12 * 3600);
  });
  test("DST days (23 and 25 hours long)", () => {
    expect(nextMidnight(new Date("2026-03-29T10:00:00Z")).toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(nextMidnight(new Date("2026-10-25T10:00:00Z")).toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(nextMidnight(new Date("2026-03-28T23:00:00Z")).toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });
});

test("defaults: tutor 30, explain 20, grade 30", () => {
  expect(getAiLimitSettings()).toEqual({ tutorDailyLimit: 30, explainDailyLimit: 20, gradeDailyLimit: 30 });
});

for (const f of AI_FEATURES) {
  describe(`consumeAi("${f}")`, () => {
    test("counts up to the limit, then refuses until the next Amsterdam midnight", () => {
      setAiDailyLimits({ [f]: 3 });
      expect(consumeAi(student, f, NOON)).toMatchObject({ ok: true, quota: { limit: 3, used: 1, remaining: 2 } });
      consumeAi(student, f, NOON);
      expect(consumeAi(student, f, NOON)).toMatchObject({ ok: true, quota: { limit: 3, used: 3, remaining: 0 } });
      expect(consumeAi(student, f, NOON)).toEqual({ ok: false, feature: f, limit: 3, retryAfter: 12 * 3600 });
      expect(aiQuota(student, f, NOON)).toEqual({ limit: 3, used: 3, remaining: 0 });
      // Each feature has its own counter.
      for (const other of AI_FEATURES) if (other !== f) expect(aiQuota(student, other, NOON)?.used).toBe(0);
    });

    test("the day rolls over at Amsterdam midnight, not UTC midnight", () => {
      setAiDailyLimits({ [f]: 1 });
      const lateEvening = new Date("2026-10-27T22:59:59Z"); // 23:59:59 in Amsterdam
      expect(consumeAi(student, f, lateEvening).ok).toBe(true);
      expect(consumeAi(student, f, lateEvening)).toEqual({ ok: false, feature: f, limit: 1, retryAfter: 1 });
      const midnight = new Date("2026-10-27T23:00:00Z"); // 00:00 on the 28th in Amsterdam
      expect(aiQuota(student, f, midnight)).toEqual({ limit: 1, used: 0, remaining: 1 });
      expect(consumeAi(student, f, midnight).ok).toBe(true);
    });

    test("0 means unlimited", () => {
      setAiDailyLimits({ [f]: 0 });
      for (let i = 0; i < 100; i++) expect(consumeAi(student, f, NOON)).toMatchObject({ ok: true, quota: null });
      expect(aiQuota(student, f, NOON)).toBeNull();
    });

    test("admins are exempt and not counted", () => {
      setAiDailyLimits({ [f]: 1 });
      for (let i = 0; i < 5; i++) expect(consumeAi(admin, f, NOON).ok).toBe(true);
      expect(aiQuotas(admin, NOON)).toEqual({ tutor: null, explain: null, grade: null });
      expect(db.select().from(schema.aiUsage).all()).toHaveLength(0);
    });

    test("refund gives the use back once, on the day it was counted", () => {
      setAiDailyLimits({ [f]: 2 });
      const late = new Date("2026-10-27T22:59:00Z");
      const r = consumeAi(student, f, late);
      if (!r.ok) throw new Error("expected ok");
      consumeAi(student, f, new Date("2026-10-27T23:30:00Z")); // the next Amsterdam day
      r.refund();
      r.refund();
      expect(aiQuota(student, f, late)?.used).toBe(0);
      expect(aiQuota(student, f, new Date("2026-10-27T23:30:00Z"))?.used).toBe(1);
    });

    test("concurrent uses never pass the limit", async () => {
      setAiDailyLimits({ [f]: 5 });
      const results = await Promise.all(Array.from({ length: 20 }, async () => consumeAi(student, f, NOON)));
      expect(results.filter((r) => r.ok)).toHaveLength(5);
      expect(aiQuota(student, f, NOON)).toEqual({ limit: 5, used: 5, remaining: 0 });
    });

    test("lowering the limit below today's use blocks right away", () => {
      setAiDailyLimits({ [f]: 10 });
      for (let i = 0; i < 5; i++) consumeAi(student, f, NOON);
      setAiDailyLimits({ [f]: 3 });
      expect(consumeAi(student, f, NOON).ok).toBe(false);
      expect(aiQuota(student, f, NOON)).toEqual({ limit: 3, used: 5, remaining: 0 });
    });
  });
}

test("survives a restart: the counts are rows in the database", () => {
  consumeAi(student, "explain", NOON);
  expect(db.select().from(schema.aiUsage).all()).toEqual([{ userId: student.id, day: "2026-10-27", kind: "explain", count: 1 }]);
});
