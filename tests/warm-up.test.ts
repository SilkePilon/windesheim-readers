import { describe, expect, test } from "bun:test";
import { PAGE_LOADERS, reloadOnceForStaleChunk, scheduleWarmUp, shouldWarmUp } from "../src/lib/warm-up";

describe("shouldWarmUp", () => {
  test("skips on save-data", () => {
    expect(shouldWarmUp({ connection: { saveData: true } })).toBe(false);
  });
  test("runs otherwise", () => {
    expect(shouldWarmUp({})).toBe(true);
  });
});

describe("scheduleWarmUp", () => {
  test("uses requestIdleCallback with a 4000 ms timeout and cancels it", () => {
    const calls: unknown[] = [];
    const cancelled: unknown[] = [];
    const win = {
      setTimeout: (() => 0) as never,
      clearTimeout: (() => {}) as never,
      requestIdleCallback: ((_cb: unknown, opts: unknown) => {
        calls.push(opts);
        return 7;
      }) as never,
      cancelIdleCallback: ((id: unknown) => void cancelled.push(id)) as never,
    };
    const cancel = scheduleWarmUp(win, () => {});
    expect(calls).toEqual([{ timeout: 4000 }]);
    cancel();
    expect(cancelled).toEqual([7]);
  });
  test("falls back to setTimeout at 2000 ms and cancels it", () => {
    const delays: unknown[] = [];
    const cleared: unknown[] = [];
    const win = {
      setTimeout: ((_cb: unknown, ms: unknown) => {
        delays.push(ms);
        return 9;
      }) as never,
      clearTimeout: ((id: unknown) => void cleared.push(id)) as never,
    };
    const cancel = scheduleWarmUp(win, () => {});
    expect(delays).toEqual([2000]);
    cancel();
    expect(cleared).toEqual([9]);
  });
});

describe("reloadOnceForStaleChunk", () => {
  test("reloads once, then not again", () => {
    const m = new Map<string, string>();
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    let reloads = 0;
    expect(reloadOnceForStaleChunk(storage, () => reloads++)).toBe(true);
    expect(reloads).toBe(1);
    expect(reloadOnceForStaleChunk(storage, () => reloads++)).toBe(false);
    expect(reloads).toBe(1);
  });
});

describe("PAGE_LOADERS", () => {
  test("has every page key", () => {
    expect(Object.keys(PAGE_LOADERS).sort()).toEqual(
      ["battle", "leaderboard", "lesson", "profile", "review", "study", "world"],
    );
  });
});
