import { describe, expect, test } from "bun:test";
import {
  HeardTracker,
  Slots,
  chapterStarts,
  countableEnd,
  episodeAudioSource,
  formatClock,
  lessonAudioSource,
  listenStorageKeys,
  locate,
  pickResume,
  readStoredListen,
  resumeAt,
  sourceTotalMs,
  sourceVersion,
} from "../src/lib/listen";
import type { EpisodeMeta, LessonAudio, LessonDetail } from "../src/lib/types";

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

  test("countableEnd counts throttled steps up to wall time × rate", () => {
    expect(countableEnd(0, 250, 250, 1)).toBe(250); // normal tick
    expect(countableEnd(0, 30_000, 30_000, 1)).toBe(30_000); // lock screen: one late tick, all heard
    expect(countableEnd(0, 30_000, 10_000, 1)).toBe(11_100); // more media time than wall time allows
    expect(countableEnd(0, 4_000, 2_000, 2)).toBe(4_000); // 2× speed
    expect(countableEnd(1_000, 500, 100, 1)).toBe(1_000); // backwards: nothing
    expect(countableEnd(0, 300, -5, 1)).toBe(100); // clock skew: only the slack
  });

  test("pickResume prefers an unacknowledged local position", () => {
    expect(pickResume(20_000, null, 60_000)).toBe(20_000);
    expect(pickResume(20_000, { pos: 30_000, synced: false }, 60_000)).toBe(30_000);
    expect(pickResume(20_000, { pos: 10_000 }, 60_000)).toBe(10_000); // not synced = newer, even if earlier (rewound)
    expect(pickResume(20_000, { pos: 30_000, synced: true }, 60_000)).toBe(20_000); // server may be from another device
    expect(pickResume(0, { pos: 30_000, synced: true }, 60_000)).toBe(30_000);
    expect(pickResume(0, { pos: 59_000 }, 60_000)).toBe(0); // at the end: restart
  });

  test("Slots: preload, prime and swap", () => {
    const s = new Slots();
    expect(s.load(0, 2)).toBe(true);
    s.activate(0);
    expect(s.needsPrime()).toBe(false); // idle slot empty: nothing to prime yet
    expect(s.nextToPreload(2, 6)).toBe(3);
    expect(s.load(s.idle, 3)).toBe(true);
    expect(s.needsPrime()).toBe(true);
    s.primed[s.idle] = true;
    expect(s.needsPrime()).toBe(false);
    expect(s.nextToPreload(2, 6)).toBe(null); // already there
    // Chapter end: the preloaded slot takes over, no reload.
    expect(s.slotFor(3)).toEqual({ slot: 1, fresh: false });
    s.activate(1);
    expect(s.nextToPreload(3, 6)).toBe(4);
    expect(s.load(s.idle, 4)).toBe(true); // new source in slot 0 → needs priming again
    expect(s.needsPrime()).toBe(true);
    // A jump to a chapter nobody holds loads it into the idle slot.
    expect(s.slotFor(0)).toEqual({ slot: 0, fresh: true });
    expect(s.nextToPreload(5, 6)).toBe(null); // last chapter
  });
});

describe("audio sources", () => {
  const audio = {
    status: "ready",
    chapters: [
      { n: 1, durationMs: 1_000, url: "/api/lessons/L1/audio/1.mp3?v=7" },
      { n: 2, durationMs: 2_000, url: "/api/lessons/L1/audio/2.mp3?v=7" },
    ],
    totalMs: 3_000,
    listenMs: 1_500,
    summaryRead: false,
  } as LessonAudio;
  const lesson = { id: "L1", code: "1.2", title: "Titel" } as LessonDetail;

  test("lessonAudioSource keeps the lesson urls", () => {
    const s = lessonAudioSource(lesson, audio);
    expect(s.key).toBe("lesson:L1");
    expect(s.chapterUrl(2)).toBe("/api/lessons/L1/audio/2.mp3?v=7");
    expect(s.progressUrl).toBe("/api/lessons/L1/audio/progress");
    expect(s.resumeMs).toBe(1_500);
    expect(sourceTotalMs(s)).toBe(3_000);
    expect(sourceVersion(s)).toBe("/api/lessons/L1/audio/1.mp3?v=7|/api/lessons/L1/audio/2.mp3?v=7");
  });

  test("episodeAudioSource builds the episode urls (chapters are 1-based, like the server)", () => {
    const ep: EpisodeMeta = { week: 3, title: "Week 3", status: "ready", version: "123", chapters: [{ n: 1, title: "A", durationMs: 4_000 }], totalMs: 4_000, positionMs: 900, listenMs: 2_000 };
    const s = episodeAudioSource("R9", ep);
    expect(s.key).toBe("episode:R9:3");
    expect(s.title).toBe("Week 3");
    expect(s.chapterUrl(1)).toBe("/api/readers/R9/episodes/3/1.mp3?v=123");
    expect(s.progressUrl).toBe("/api/readers/R9/episodes/3/progress");
    expect(s.resumeMs).toBe(900);
    // A regenerated episode (same chapter layout) is another source version: a fresh player.
    expect(sourceVersion(episodeAudioSource("R9", { ...ep, version: "456" }))).not.toBe(sourceVersion(s));
  });

  test("storage keys fall back to the legacy lesson key", () => {
    expect(listenStorageKeys("lesson:L1")).toEqual(["listen:lesson:L1", "listen:L1"]);
    expect(listenStorageKeys("episode:R9:3")).toEqual(["listen:episode:R9:3"]);
    const store: Record<string, string> = { "listen:L1": "old" };
    const get = (k: string) => store[k] ?? null;
    expect(readStoredListen(get, "lesson:L1")).toBe("old");
    store["listen:lesson:L1"] = "new";
    expect(readStoredListen(get, "lesson:L1")).toBe("new");
    expect(readStoredListen(get, "episode:R9:3")).toBeNull();
  });
});
