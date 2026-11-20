import { describe, expect, test } from "bun:test";
import { createScrollPause } from "../src/lib/world/scroll-pause";

function setup() {
  const set = new Set<string>();
  const classList = { add: (c: string) => void set.add(c), remove: (c: string) => void set.delete(c), contains: (c: string) => set.has(c) } as unknown as DOMTokenList;
  const timers = new Map<number, () => void>();
  let next = 1;
  const sp = createScrollPause(
    { classList },
    (fn) => {
      timers.set(next, fn);
      return next++;
    },
    (id) => void timers.delete(id as number),
  );
  return { set, timers, sp };
}

describe("createScrollPause", () => {
  test("adds the class on scroll", () => {
    const { set, sp } = setup();
    sp.onScroll();
    expect(set.has("scrolling")).toBe(true);
  });
  test("a second scroll reschedules with one pending timer", () => {
    const { timers, sp } = setup();
    sp.onScroll();
    sp.onScroll();
    expect(timers.size).toBe(1);
  });
  test("idle removes the class", () => {
    const { set, timers, sp } = setup();
    sp.onScroll();
    [...timers.values()][0]();
    expect(set.has("scrolling")).toBe(false);
  });
  test("dispose cancels and removes", () => {
    const { set, timers, sp } = setup();
    sp.onScroll();
    sp.dispose();
    expect(timers.size).toBe(0);
    expect(set.has("scrolling")).toBe(false);
  });
});
