import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { db, runMigrations, schema } from "../server/db";
import {
  consumeTutorMessage,
  getTutorDailyLimit,
  nextMidnight,
  secondsUntilMidnight,
  setTutorDailyLimit,
  TUTOR_DAILY_LIMIT_DEFAULT,
  tutorQuota,
} from "../server/lib/tutor-quota";

const student = { id: "tq-student", role: "user" };
const admin = { id: "tq-admin", role: "admin" };
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
  setTutorDailyLimit(TUTOR_DAILY_LIMIT_DEFAULT);
});
afterAll(() => {
  db.delete(schema.aiUsage).run();
  setTutorDailyLimit(TUTOR_DAILY_LIMIT_DEFAULT);
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
    // Just after midnight, the next midnight is a full day away.
    expect(nextMidnight(new Date("2026-03-28T23:00:00Z")).toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });
});

describe("consumeTutorMessage", () => {
  test("default limit is 30", () => {
    expect(getTutorDailyLimit()).toBe(30);
  });

  test("counts up to the limit, then refuses until the next Amsterdam midnight", () => {
    setTutorDailyLimit(3);
    expect(consumeTutorMessage(student, NOON)).toEqual({ ok: true, quota: { limit: 3, used: 1, remaining: 2 } });
    consumeTutorMessage(student, NOON);
    expect(consumeTutorMessage(student, NOON)).toEqual({ ok: true, quota: { limit: 3, used: 3, remaining: 0 } });
    expect(consumeTutorMessage(student, NOON)).toEqual({ ok: false, limit: 3, retryAfter: 12 * 3600 });
    // Refusals don't count.
    expect(tutorQuota(student, NOON)).toEqual({ limit: 3, used: 3, remaining: 0 });
  });

  test("the day rolls over at Amsterdam midnight, not UTC midnight", () => {
    setTutorDailyLimit(1);
    const lateEvening = new Date("2026-10-27T22:59:59Z"); // 23:59:59 in Amsterdam
    expect(consumeTutorMessage(student, lateEvening).ok).toBe(true);
    expect(consumeTutorMessage(student, lateEvening)).toEqual({ ok: false, limit: 1, retryAfter: 1 });
    const midnight = new Date("2026-10-27T23:00:00Z"); // 00:00 on the 28th in Amsterdam, still the 27th in UTC
    expect(tutorQuota(student, midnight)).toEqual({ limit: 1, used: 0, remaining: 1 });
    expect(consumeTutorMessage(student, midnight).ok).toBe(true);
  });

  test("0 means unlimited", () => {
    setTutorDailyLimit(0);
    for (let i = 0; i < 100; i++) expect(consumeTutorMessage(student, NOON)).toEqual({ ok: true, quota: null });
    expect(tutorQuota(student, NOON)).toBeNull();
  });

  test("admins are exempt and not counted", () => {
    setTutorDailyLimit(1);
    for (let i = 0; i < 5; i++) expect(consumeTutorMessage(admin, NOON).ok).toBe(true);
    expect(tutorQuota(admin, NOON)).toBeNull();
    expect(db.select().from(schema.aiUsage).all()).toHaveLength(0);
  });

  test("lowering the limit below today's use blocks right away", () => {
    setTutorDailyLimit(10);
    for (let i = 0; i < 5; i++) consumeTutorMessage(student, NOON);
    setTutorDailyLimit(3);
    expect(consumeTutorMessage(student, NOON).ok).toBe(false);
    expect(tutorQuota(student, NOON)).toEqual({ limit: 3, used: 5, remaining: 0 });
  });

  test("survives a restart: the count is read from the database", () => {
    setTutorDailyLimit(2);
    consumeTutorMessage(student, NOON);
    const row = db.select().from(schema.aiUsage).get();
    expect(row).toEqual({ userId: student.id, day: "2026-10-27", kind: "tutor", count: 1 });
  });
});
