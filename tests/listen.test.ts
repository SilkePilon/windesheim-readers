import { describe, expect, test } from "bun:test";
import { HeardTracker, chapterStarts, formatClock, locate, resumeAt } from "../src/lib/listen";

describe("listen helpers", () => {
  test("formatClock", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-5)).toBe("0:00");
    expect(formatClock(65_400)).toBe("1:05");
    expect(formatClock(3_723_000)).toBe("1:02:03");
  });

  test("chapterStarts and locate", () => {
    const d = [10_000, 20_000, 5_000];
    expect(chapterStarts(d)).toEqual([0, 10_000, 30_000]);
    expect(locate(d, 0)).toEqual({ index: 0, offsetMs: 0 });
    expect(locate(d, 9_999)).toEqual({ index: 0, offsetMs: 9_999 });
    expect(locate(d, 10_000)).toEqual({ index: 1, offsetMs: 0 }); // boundary → next chapter
    expect(locate(d, 31_000)).toEqual({ index: 2, offsetMs: 1_000 });
    expect(locate(d, 99_000)).toEqual({ index: 2, offsetMs: 5_000 }); // clamps at the end
    expect(locate(d, -4)).toEqual({ index: 0, offsetMs: 0 });
    expect(locate([], 500)).toEqual({ index: 0, offsetMs: 0 });
  });

  test("resumeAt restarts when (nearly) finished", () => {
    expect(resumeAt(0, 60_000)).toBe(0);
    expect(resumeAt(20_000, 60_000)).toBe(20_000);
    expect(resumeAt(58_000, 60_000)).toBe(0);
    expect(resumeAt(2_264, 5_030)).toBe(2_264); // short audio: 5% slack, not 3 s
    expect(resumeAt(60_000, 60_000)).toBe(0);
  });

  test("HeardTracker counts each moment once and caps at the chapter length", () => {
    const h = new HeardTracker([2_500, 3_000]);
    h.add(0, 0, 1_000);
    h.add(0, 200, 800); // replay: no double count
    expect(h.heardMs()).toBe(1_000);
    h.add(0, 1_500, 2_000); // a gap stays a gap
    expect(h.heardMs()).toBe(1_500);
    h.add(0, 900, 1_600); // bridges both spans
    expect(h.heardMs()).toBe(2_000);
    expect(h.toJSON()[0]).toEqual([[0, 2_000]]);
    h.add(0, 2_000, 9_000); // past the end: capped
    expect(h.heardMs()).toBe(2_500);
    h.add(1, 2_000, 1_000); // backwards: ignored
    h.add(7, 0, 1_000); // unknown chapter: ignored
    expect(h.heardMs()).toBe(2_500);
    h.add(1, 0, 3_000);
    expect(h.heardMs()).toBe(5_500);
  });

  test("HeardTracker round-trips through JSON and ignores junk", () => {
    const h = new HeardTracker([5_000]);
    h.add(0, 1_000, 3_000);
    const again = new HeardTracker([5_000], JSON.parse(JSON.stringify(h)));
    expect(again.heardMs()).toBe(2_000);
    expect(new HeardTracker([5_000], [[["x", 2], [0, 99_999]]]).heardMs()).toBe(5_000);
    expect(new HeardTracker([5_000], "nope").heardMs()).toBe(0);
  });
});
