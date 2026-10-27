/**
 * Pure helpers for the luisterles player: chapter maths (absolute position ↔ chapter +
 * offset), clock formatting, and the "heard" tracker that decides the ≥ 90% rule.
 */

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export type Speed = (typeof SPEEDS)[number];
/** −15 s / +15 s buttons, Media Session seek and the global arrow keys. */
export const SKIP_MS = 15_000;
/** Arrow-key step on the scrubber itself. */
export const SLIDER_STEP_MS = 5_000;
/** Progress is reported at most this often while playing (plus on pause, chapter end, leave). */
export const REPORT_EVERY_MS = 12_000;
/** Within this much of the end a saved position counts as finished, so the next play restarts. */
export const RESUME_END_SLACK_MS = 3_000;

/** "4:05", "1:02:03"; negative values clamp to 0. */
export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Start of each chapter in the whole luisterles (ms). */
export function chapterStarts(durations: number[]) {
  const out: number[] = [];
  let acc = 0;
  for (const d of durations) {
    out.push(acc);
    acc += d;
  }
  return out;
}

/**
 * Chapter index and offset for an absolute position. Positions at or past the end land at
 * the end of the last chapter; a position exactly on a boundary belongs to the next chapter.
 */
export function locate(durations: number[], positionMs: number): { index: number; offsetMs: number } {
  if (!durations.length) return { index: 0, offsetMs: 0 };
  let p = Math.max(0, positionMs);
  for (let i = 0; i < durations.length; i++) {
    const d = durations[i]!;
    if (p < d || i === durations.length - 1) return { index: i, offsetMs: Math.min(p, d) };
    p -= d;
  }
  return { index: durations.length - 1, offsetMs: durations.at(-1)! };
}

/** Where to start: the saved position, or 0 when it is (nearly) at the end (last 3 s, or 5% when shorter). */
export function resumeAt(savedMs: number, totalMs: number) {
  if (savedMs <= 0 || savedMs >= totalMs - Math.min(RESUME_END_SLACK_MS, totalMs * 0.05)) return 0;
  return savedMs;
}

/**
 * Which parts of each chapter were actually played, as merged [from, to) ms intervals.
 * Replaying a part doesn't count twice and skipping ahead counts nothing, so `heardMs`
 * is a fair measure for "listened to ≥ 90%". Serialisable, so a reload keeps what was heard.
 */
export class HeardTracker {
  private spans: [number, number][][];
  constructor(
    private durations: number[],
    saved?: unknown,
  ) {
    const ok = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === "number" && Number.isFinite(n));
    this.spans = durations.map((_, i) => {
      const list = Array.isArray(saved) && Array.isArray(saved[i]) ? (saved[i] as unknown[]).filter(ok) : [];
      return list.reduce<[number, number][]>((acc, [a, b]) => HeardTracker.merge(acc, a, b, durations[i]!), []);
    });
  }

  private static merge(spans: [number, number][], from: number, to: number, duration: number) {
    const a = Math.max(0, Math.round(from));
    const b = Math.min(duration, Math.round(to));
    if (b <= a) return spans;
    const out: [number, number][] = [];
    let cur: [number, number] = [a, b];
    for (const s of spans) {
      if (s[1] < cur[0] || s[0] > cur[1]) out.push(s);
      else cur = [Math.min(s[0], cur[0]), Math.max(s[1], cur[1])];
    }
    out.push(cur);
    return out.sort((x, y) => x[0] - y[0]);
  }

  /**
   * Media time moved from `fromMs` to `toMs` in chapter `index` during normal playback.
   * Jumps (seeks) are the caller's job to leave out: only feed small forward steps.
   */
  add(index: number, fromMs: number, toMs: number) {
    const d = this.durations[index];
    if (d === undefined || !this.spans[index]) return;
    this.spans[index] = HeardTracker.merge(this.spans[index], fromMs, toMs, d);
  }

  /** Heard time, never more than the chapter lengths. */
  heardMs() {
    return this.spans.reduce((sum, list) => sum + list.reduce((s, [a, b]) => s + (b - a), 0), 0);
  }

  toJSON() {
    return this.spans;
  }
}

/** Largest forward step (ms of media time) between two playback ticks that still counts as listening, not a seek. */
export const MAX_TICK_MS = 2_500;
