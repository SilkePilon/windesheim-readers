import { beforeAll, describe, expect, test } from "bun:test";
import { desc, eq, gte, sql } from "drizzle-orm";
import { db, runMigrations, schema, sqlite } from "../server/db";

beforeAll(() => runMigrations());

const pragma = (name: string) => sqlite.query(`PRAGMA ${name}`).get() as Record<string, number>;
const plan = (q: { toSQL(): { sql: string; params: unknown[] } }) => {
  const { sql: text, params } = q.toSQL();
  return (sqlite.query(`EXPLAIN QUERY PLAN ${text}`).all(...(params as never[])) as { detail: string }[]).map((r) => r.detail);
};

// Same expressions as the /leaderboard route in server/routes/learn.ts.
const allTime = () =>
  db
    .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email, nickname: schema.user.nickname, show: schema.user.showOnLeaderboard, xp: schema.userStats.xp, streak: schema.userStats.streak })
    .from(schema.userStats)
    .innerJoin(schema.user, eq(schema.user.id, schema.userStats.userId))
    .where(sql`${schema.userStats.xp} > 0`)
    .orderBy(desc(schema.userStats.xp));

const weekly = () =>
  db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      nickname: schema.user.nickname,
      show: schema.user.showOnLeaderboard,
      xp: sql<number>`sum(${schema.xpEvent.amount})`.as("week_xp"),
      streak: schema.userStats.streak,
    })
    .from(schema.xpEvent)
    .innerJoin(schema.user, eq(schema.user.id, schema.xpEvent.userId))
    .leftJoin(schema.userStats, eq(schema.userStats.userId, schema.user.id))
    .where(gte(schema.xpEvent.createdAt, new Date(Date.now() - 7 * 864e5)))
    .groupBy(schema.user.id)
    .orderBy(desc(sql`week_xp`));

describe("sqlite pragmas", () => {
  test("tuned settings", () => {
    expect(pragma("synchronous")).toEqual({ synchronous: 1 });
    expect(pragma("busy_timeout")).toEqual({ timeout: 5000 });
    expect(pragma("cache_size")).toEqual({ cache_size: -20000 });
    expect(pragma("temp_store")).toEqual({ temp_store: 2 });
  });
});

describe("leaderboard query plans", () => {
  test("all-time uses user_stats_xp_idx without a sort", () => {
    const p = plan(allTime());
    expect(p.some((d) => d.includes("user_stats_xp_idx"))).toBe(true);
    expect(p.some((d) => d.includes("USE TEMP B-TREE FOR ORDER BY"))).toBe(false);
  });
  test("weekly uses xp_event_created_user_idx", () => {
    const p = plan(weekly());
    expect(p.some((d) => d.includes("xp_event_created_user_idx"))).toBe(true);
  });
});
