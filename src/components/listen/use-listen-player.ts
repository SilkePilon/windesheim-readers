import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LessonAudio, ListenProgress, XpResult } from "@/lib/types";
import { storageGet, storageSet } from "@/lib/storage";
import { HeardTracker, MAX_TICK_MS, REPORT_EVERY_MS, SKIP_MS, SPEEDS, chapterStarts, locate, resumeAt, type Speed } from "@/lib/listen";

const RATE_KEY = "listen:rate";
const localKey = (lessonId: string) => `listen:${lessonId}`;
/** Local copy of what was heard, tied to this exact audio (`?v=` changes on regeneration). */
type LocalState = { v: string; pos: number; heard: unknown };

function readRate(): Speed {
  const r = Number(storageGet(RATE_KEY));
  return (SPEEDS as readonly number[]).includes(r) ? (r as Speed) : 1;
}

export interface ListenMeta {
  title: string;
  artist: string;
  album: string;
}

/**
 * Plays a luisterles: its chapters back-to-back on two alternating <audio> elements (the
 * next chapter is always loading in the idle one, so a chapter change has no gap), with
 * one timeline across chapters for the scrubber and skips.
 *
 * - Resume: starts at the server's `listenMs` (or the local copy), unless that was the end.
 * - Progress: `POST /lessons/:id/audio/progress` every ~12 s while playing, on pause,
 *   chapter end and when leaving, with `heardMs` = distinct seconds actually played.
 *   The response's `award` (≥ 90% heard, once) goes to `onAward`.
 * - Media Session: lock-screen / headphone play, pause, seek and prev/next chapter.
 */
export function useListenPlayer({
  lessonId,
  audio,
  meta,
  onAward,
}: {
  lessonId: string;
  audio: LessonAudio;
  meta: ListenMeta;
  onAward: (award: XpResult, progress: ListenProgress) => void;
}) {
  const chapters = audio.chapters;
  const durations = useMemo(() => chapters.map((c) => c.durationMs), [chapters]);
  const starts = useMemo(() => chapterStarts(durations), [durations]);
  const total = audio.totalMs;
  const version = chapters.map((c) => c.url).join("|");

  const local = useMemo<LocalState | null>(() => {
    try {
      const s = JSON.parse(storageGet(localKey(lessonId)) ?? "null") as LocalState | null;
      return s && s.v === version ? s : null;
    } catch {
      return null;
    }
  }, [lessonId, version]);
  const startAt = useMemo(() => resumeAt(audio.listenMs || local?.pos || 0, total), [audio.listenMs, local, total]);
  const first = useMemo(() => locate(durations, startAt), [durations, startAt]);

  const [index, setIndex] = useState(first.index);
  const [position, setPosition] = useState(startAt);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rate, setRateState] = useState<Speed>(readRate);

  // Mutable playback state that event handlers read without re-subscribing.
  const r = useRef({
    els: [] as HTMLAudioElement[],
    holds: [-1, -1] as number[],
    active: 0,
    index: first.index,
    lastMedia: first.offsetMs,
    primed: false,
    rate: readRate() as number,
    lastSent: { pos: -1, heard: -1 },
    tracker: new HeardTracker(durations, local?.heard),
    awardSeen: audio.summaryRead,
    /** Played or sought at least once: only then is a position worth reporting. */
    touched: false,
  });
  const s = r.current;
  const onAwardRef = useRef(onAward);
  onAwardRef.current = onAward;

  const absolute = useCallback(() => {
    const el = s.els[s.active];
    return (starts[s.index] ?? 0) + (el ? el.currentTime * 1000 : 0);
  }, [s, starts]);

  const saveLocal = useCallback(
    (pos: number) => storageSet(localKey(lessonId), JSON.stringify({ v: version, pos: Math.round(pos), heard: s.tracker.toJSON() } satisfies LocalState)),
    [lessonId, version, s],
  );

  /** Report the position and heard time (skipped when nothing changed). `leaving` uses keepalive. */
  const report = useCallback(
    (leaving = false) => {
      if (!s.touched) return;
      const pos = Math.round(Math.min(total, absolute()));
      const heard = Math.min(total, s.tracker.heardMs());
      saveLocal(pos);
      if (pos === s.lastSent.pos && heard === s.lastSent.heard) return;
      s.lastSent = { pos, heard };
      void fetch(`/api/lessons/${lessonId}/audio/progress`, {
        method: "POST",
        credentials: "include",
        keepalive: leaving,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ positionMs: pos, heardMs: heard }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const body = (await res.json()) as ListenProgress;
          if (body.award && !s.awardSeen) {
            s.awardSeen = true;
            onAwardRef.current(body.award, body);
          }
        })
        .catch(() => {
          // Offline or leaving: the next report (or the local copy) catches up.
          s.lastSent = { pos: -1, heard: -1 };
        });
    },
    [absolute, lessonId, s, saveLocal, total],
  );

  /** Advance the heard tracker and the shown position from the active element. */
  const tick = useCallback(() => {
    const el = s.els[s.active];
    if (!el) return;
    const now = el.currentTime * 1000;
    const step = now - s.lastMedia;
    if ((!el.paused || el.ended) && step > 0 && step <= MAX_TICK_MS * s.rate) s.tracker.add(s.index, s.lastMedia, now);
    s.lastMedia = now;
    setPosition((starts[s.index] ?? 0) + now);
  }, [s, starts]);

  const tickRef = useRef(tick);
  tickRef.current = tick;
  const reportRef = useRef(report);
  reportRef.current = report;

  /** The element holding chapter `i`, loading it into the idle element if needed. */
  const elementFor = useCallback(
    (i: number) => {
      const held = s.holds.indexOf(i);
      if (held >= 0) return held;
      const slot = 1 - s.active;
      const el = s.els[slot]!;
      el.src = chapters[i]!.url;
      el.preload = "auto";
      el.playbackRate = s.rate;
      s.holds[slot] = i;
      return slot;
    },
    [chapters, s],
  );

  const preloadNext = useCallback(() => {
    const next = s.index + 1;
    if (next >= chapters.length || s.holds.includes(next)) return;
    const idle = 1 - s.active;
    const el = s.els[idle]!;
    el.src = chapters[next]!.url;
    el.preload = "auto";
    el.playbackRate = s.rate;
    el.load();
    s.holds[idle] = next;
  }, [chapters, s]);

  /** Switch to chapter `i` at `offsetMs`; keeps playing if it was playing. */
  const jump = useCallback(
    (i: number, offsetMs: number, resume: boolean) => {
      const old = s.els[s.active]!;
      if (i !== s.index) {
        old.pause();
        const slot = elementFor(i);
        s.active = slot;
        s.index = i;
        setIndex(i);
      }
      const el = s.els[s.active]!;
      el.playbackRate = s.rate;
      el.currentTime = offsetMs / 1000;
      s.lastMedia = offsetMs;
      setPosition((starts[i] ?? 0) + offsetMs);
      if (resume) void el.play().catch(() => setPlaying(false));
      preloadNext();
    },
    [elementFor, preloadNext, s, starts],
  );

  const seekTo = useCallback(
    (ms: number) => {
      const el = s.els[s.active];
      if (!el) return;
      const wasPlaying = !el.paused;
      const { index: i, offsetMs } = locate(durations, Math.max(0, Math.min(total, ms)));
      s.touched = true;
      // While paused the position is reported on the next play/pause or when leaving.
      jump(i, offsetMs, wasPlaying);
    },
    [durations, jump, s, total],
  );

  /** iOS only lets an element play without a tap once it has played after one: warm up the idle one. */
  const prime = useCallback(() => {
    if (s.primed) return;
    s.primed = true;
    const idle = s.els[1 - s.active];
    if (!idle?.src) return;
    idle.muted = true;
    void idle
      .play()
      .then(() => {
        idle.pause();
        idle.currentTime = 0;
      })
      .catch(() => {})
      .finally(() => {
        idle.muted = false;
      });
  }, [s]);

  const play = useCallback(() => {
    const el = s.els[s.active];
    if (!el) return;
    setFailed(false);
    s.touched = true;
    // After a load error: reload the chapter where it was.
    if (el.error) {
      const src = el.src;
      el.src = src;
      el.load();
      el.currentTime = s.lastMedia / 1000;
    }
    // Finished: start over.
    if (s.index === chapters.length - 1 && el.ended) jump(0, 0, false);
    const cur = s.els[s.active]!;
    void cur.play().catch((e: unknown) => {
      setPlaying(false);
      if (!(e instanceof DOMException && e.name === "NotAllowedError")) setFailed(true);
    });
    prime();
  }, [chapters.length, jump, prime, s]);

  const pause = useCallback(() => s.els[s.active]?.pause(), [s]);
  const toggle = useCallback(() => (s.els[s.active]?.paused ? play() : pause()), [pause, play, s]);
  const skip = useCallback((delta: number) => seekTo(absolute() + delta), [absolute, seekTo]);
  const goChapter = useCallback((i: number) => seekTo(starts[Math.max(0, Math.min(chapters.length - 1, i))] ?? 0), [chapters.length, seekTo, starts]);
  const setRate = useCallback(
    (v: Speed) => {
      s.rate = v;
      for (const el of s.els) el.playbackRate = v;
      setRateState(v);
      storageSet(RATE_KEY, String(v));
    },
    [s],
  );

  const jumpRef = useRef(jump);
  jumpRef.current = jump;

  // Build the two elements once per audio version.
  useEffect(() => {
    const els = [new Audio(), new Audio()];
    s.els = els;
    s.holds = [-1, -1];
    s.active = 0;
    s.index = first.index;
    s.lastMedia = first.offsetMs;
    const el0 = els[0]!;
    el0.preload = "auto";
    el0.src = chapters[first.index]!.url;
    el0.playbackRate = s.rate;
    // Before metadata this is the "default playback start position", applied on load.
    el0.currentTime = first.offsetMs / 1000;
    s.holds[0] = first.index;

    const cleanups = els.map((el, slot) => {
      const isActive = () => s.active === slot;
      const on = <K extends keyof HTMLMediaElementEventMap>(type: K, fn: () => void) => {
        el.addEventListener(type, fn);
        return () => el.removeEventListener(type, fn);
      };
      const offs = [
        on("play", () => isActive() && !el.muted && setPlaying(true)),
        on("playing", () => isActive() && setBuffering(false)),
        on("waiting", () => isActive() && setBuffering(true)),
        on("timeupdate", () => isActive() && tickRef.current()),
        on("pause", () => {
          // A chapter that ends also fires "pause"; "ended" takes over from there.
          if (!isActive() || el.ended || el.muted) return;
          setPlaying(false);
          tickRef.current();
          reportRef.current();
        }),
        on("ended", () => {
          if (!isActive()) return;
          tickRef.current();
          const next = s.index + 1;
          if (next < chapters.length) {
            reportRef.current();
            jumpRef.current(next, 0, true);
          } else {
            setPlaying(false);
            setPosition(total);
            reportRef.current();
          }
        }),
        on("error", () => {
          if (!isActive()) return;
          setPlaying(false);
          setBuffering(false);
          setFailed(true);
        }),
      ];
      return () => offs.forEach((off) => off());
    });
    return () => {
      // Leaving the view: last report before the elements go.
      if (s.touched) {
        tickRef.current();
        reportRef.current(true);
      }
      cleanups.forEach((c) => c());
      for (const el of els) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    };
    // `first` is derived from the same version; rebuilding on it would restart playback.
  }, [version]);

  // Smooth scrubber while visible (timeupdate alone is ~4 Hz; it keeps going when hidden).
  useEffect(() => {
    if (!playing) return;
    let id = requestAnimationFrame(function loop() {
      tick();
      id = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, [playing, tick]);

  // Throttled progress while playing, and once more when leaving the page or the view.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => report(), REPORT_EVERY_MS);
    return () => clearInterval(id);
  }, [playing, report]);
  useEffect(() => {
    const leave = () => report(true);
    const onVis = () => document.visibilityState === "hidden" && report(true);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [report]);

  // Media Session: metadata once, handlers bound to the latest controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      artwork: [
        { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
    return () => {
      ms.metadata = null;
      ms.playbackState = "none";
    };
  }, [meta.title, meta.artist, meta.album]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => play()],
      ["pause", () => pause()],
      ["seekbackward", (d) => skip(-(d.seekOffset ? d.seekOffset * 1000 : SKIP_MS))],
      ["seekforward", (d) => skip(d.seekOffset ? d.seekOffset * 1000 : SKIP_MS)],
      ["seekto", (d) => d.seekTime !== undefined && seekTo(d.seekTime * 1000)],
      ["previoustrack", () => goChapter(absolute() - (starts[s.index] ?? 0) > 3000 ? s.index : s.index - 1)],
      ["nexttrack", () => s.index < chapters.length - 1 && goChapter(s.index + 1)],
    ];
    for (const [action, fn] of handlers) {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // Unsupported action in this browser.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, [absolute, chapters.length, goChapter, pause, play, s, seekTo, skip, starts]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);
  // Lock-screen position: on every state change and once a second at most while playing.
  const posSecond = Math.floor(position / 1000);
  useEffect(() => {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState || total <= 0) return;
    try {
      navigator.mediaSession.setPositionState({ duration: total / 1000, position: Math.min(total, absolute()) / 1000, playbackRate: rate });
    } catch {
      // Some browsers reject while metadata is loading.
    }
  }, [absolute, posSecond, rate, total, index, playing]);

  return {
    chapters,
    starts,
    total,
    index,
    position,
    playing,
    buffering,
    failed,
    rate,
    toggle,
    play,
    pause,
    skip,
    seekTo,
    goChapter,
    setRate,
    /** Distinct heard time so far (for tests and the hint line). */
    heardMs: () => s.tracker.heardMs(),
  };
}

export type ListenPlayer = ReturnType<typeof useListenPlayer>;
