import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Runs tests/fixtures/badge-db-check.ts in its own process against a throwaway DB, so the
// app DB module never opens ./data from the test runner.
test("badge checks are cheap and weekly awards are atomic", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wr-badges-"));
  try {
    const proc = Bun.spawn(["bun", join(import.meta.dir, "fixtures/badge-db-check.ts")], {
      env: { ...process.env, DATABASE_PATH: join(dir, "app.db"), NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    expect(await proc.exited, await new Response(proc.stderr).text()).toBe(0);
    const r = JSON.parse(out.trim().split("\n").pop()!);

    // A card review of a user nowhere near mastery: earned set, card count, one-lesson mastery.
    expect(r.again).toEqual([]);
    expect(r.reviewQueries.length).toBeLessThanOrEqual(3);
    expect(r.reviewQueries.join("\n")).not.toMatch(/group by/i);
    expect(r.mastery).toBeCloseTo(0.0375);
    // Crossing into ≥ 0.9 recomputes once (lesson_master); the next review is cheap again.
    expect(r.crossed).toEqual(["lesson_master"]);
    expect(r.afterCrossQueries).toBeLessThanOrEqual(3);

    // Weekly: a failing grant leaves no claim; the retry ranks last week and the quiet week before.
    expect(r.failed).toBe(true);
    expect(r.claimsAfterFailure).toBe(0);
    expect(r.u2).toEqual(["weekly_top3", "weekly_first"]);
    expect(r.u3All).toEqual(["weekly_top3"]);
    expect(r.u4All).toEqual(["weekly_first", "weekly_top3"]);
    expect(r.secondRun).toEqual([]);
    expect(r.afterReset).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);
