import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LessonAudio, ListenProgress, XpResult } from "@/lib/types";
import { qk } from "@/lib/queries";
import { storageGet, storageSet } from "@/lib/storage";
import { HeardTracker, REPORT_EVERY_MS, SKIP_MS, SPEEDS, Slots, chapterStarts, countableEnd, locate, pickResume, type Speed } from "@/lib/listen";

const RATE_KEY = "listen:rate";
const localKey = (lessonId: string) => `listen:${lessonId}`;
/** The shown position goes to React state at most this often (the scrubber needs no more). */
const RENDER_EVERY_MS = 100;

/**
 * Local copy of position and heard time, tied to this exact audio (`?v=` changes on
 * regeneration). `synced`: the server acknowledged this position.
 */
type LocalState = { v: string; pos: number; heard: unknown; synced?: boolean };

const versionOf = (audio: Pick<LessonAudio, "chapters">) => audio.chapters.map((c) => c.url).join("|");

export function readLocalListen(lessonId: string, audio: Pick<LessonAudio, "chapters">): LocalState | null {
  try {
    const s = JSON.parse(storageGet(localKey(lessonId)) ?? "null") as LocalState | null;
    return s && s.v === versionOf(audio) && typeof s.pos === "number" ? s : null;
  } catch {
    return null;
  }
}

/** Where the player would resume (server position unless a newer local one exists). For the lesson tile too. */
export function resumePosition(lessonId: string, audio: LessonAudio) {
  return pickResume(audio.listenMs, readLocalListen(lessonId, audio), audio.totalMs);
}

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
 * - Resume: the server's `listenMs`, or the local copy when the server never got it.
 * - Progress: `POST /lessons/:id/audio/progress` every ~12 s while playing, on pause,
 *   chapter end and when leaving, with `heardMs` = media time actually played (replays
 *   count once). The response's `award` (≥ 90% heard, once) goes to `onAward`.
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
  const qc = useQueryClient();
  const chapters = audio.chapters;
  const count = chapters.length;
  const durations = useMemo(() => chapters.map((c) => c.durationMs), [chapters]);
  const starts = useMemo(() => chapterStarts(durations), [durations]);
  const total = audio.totalMs;
  const version = versionOf(audio);

  // Initial values only: the player is keyed by version, so these are read once.
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;
  const [init] = useState(() => {
    const local = readLocalListen(lessonId, audio);
    const at = pickResume(audio.listenMs, local, total);
    return { local, at, first: locate(durations, at) };
  });

  const [index, setIndex] = useState(init.first.index);
  const [position, setPosition] = useState(init.at);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rate, setRateState] = useState<Speed>(readRate);

  // Mutable playback state that event handlers read without re-subscribing.
  const r = useRef({
    els: [] as HTMLAudioElement[],
    slots: new Slots(),
    index: init.first.index,
    lastMedia: init.first.offsetMs,
    lastWall: 0,
    lastRender: 0,
    rate: readRate() as number,
    lastSent: { pos: -1, heard: -1 },
    tracker: new HeardTracker(durations, init.local?.heard),
    awardSeen: audio.summaryRead,
    /** Played or sought at least once: only then is a position worth reporting. */
    touched: false,
  });
  const s = r.current;
  const onAwardRef = useRef(onAward);
  onAwardRef.current = onAward;

  const absolute = useCallback(() => {
    const el = s.els[s.slots.active];
    return (starts[s.index] ?? 0) + (el ? el.currentTime * 1000 : 0);
  }, [s, starts]);

  const saveLocal = useCallback(
    (pos: number, synced = false) =>
      storageSet(localKey(lessonId), JSON.stringify({ v: version, pos: Math.round(pos), heard: s.tracker.toJSON(), synced } satisfies LocalState)),
    [lessonId, version, s],
  );

  /** Report the position and heard time (skipped when nothing changed). `leaving` uses keepalive. */
  const report = useCallback(
    (leaving = false) => {
      if (!s.touched) return;
      const pos = Math.round(Math.min(total, absolute()));
      const heard = Math.min(total, s.tracker.heardMs());
      if (pos === s.lastSent.pos && heard === s.lastSent.heard) return;
      saveLocal(pos);
      s.lastSent = { pos, heard };
      void fetch(`/api/lessons/${lessonId}/audio/progress`, {
        method: "POST",
        credentials: "include",
        keepalive: leaving,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ positionMs: pos, heardMs: heard }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const body = (await res.json()) as ListenProgress;
          // Acknowledged: the server position is current again (unless a newer report went out).
          if (s.lastSent.pos === pos) saveLocal(pos, true);
          qc.setQueryData<LessonAudio>(qk.lessonAudio(lessonId), (old) => (old ? { ...old, listenMs: body.listenMs, summaryRead: body.summaryRead } : old));
          if (body.award && !s.awardSeen) {
            s.awardSeen = true;
            onAwardRef.current(body.award, body);
          }
        })
        .catch(() => {
          // Offline or leaving: the next report (or the unsynced local copy) catches up.
          s.lastSent = { pos: -1, heard: -1 };
        });
    },
    [absolute, lessonId, qc, s, saveLocal, total],
  );

  /** Restart heard counting from the active element's current time (after any jump or seek). */
  const resetTick = useCallback(
    (mediaMs: number) => {
      s.lastMedia = mediaMs;
      s.lastWall = performance.now();
    },
    [s],
  );

  /** Advance the heard tracker and (throttled) the shown position from the active element. */
  const tick = useCallback(
    (force = false) => {
      const el = s.els[s.slots.active];
      if (!el) return;
      const now = el.currentTime * 1000;
      const wall = performance.now();
      if (el.seeking) {
        resetTick(now);
      } else {
        if (!el.paused || el.ended) s.tracker.add(s.index, s.lastMedia, countableEnd(s.lastMedia, now, wall - s.lastWall, s.rate));
        s.lastMedia = now;
        s.lastWall = wall;
      }
      if (force || wall - s.lastRender >= RENDER_EVERY_MS) {
        s.lastRender = wall;
        setPosition((starts[s.index] ?? 0) + now);
      }
    },
    [resetTick, s, starts],
  );

  /** Play the idle element muted for a moment so iOS lets it start later without a tap. */
  const primeIdle = useCallback(() => {
    if (!s.touched || !s.slots.needsPrime()) return;
    const slot = s.slots.idle;
    const el = s.els[slot];
    if (!el?.src) return;
    s.slots.primed[slot] = true;
    el.muted = true;
    void el
      .play()
      .then(() => {
        // It may have become the active slot meanwhile: then it should keep playing.
        if (s.slots.active !== slot) {
          el.pause();
          el.currentTime = 0;
        }
      })
      .catch(() => {
        s.slots.primed[slot] = false;
      })
      .finally(() => {
        el.muted = false;
      });
  }, [s]);

  const loadInto = useCallback(
    (slot: 0 | 1, chapter: number) => {
      const el = s.els[slot]!;
      el.preload = "auto";
      el.src = chapters[chapter]!.url;
      el.playbackRate = s.rate;
    },
    [chapters, s],
  );

  const preloadNext = useCallback(() => {
    const next = s.slots.nextToPreload(s.index, count);
    if (next !== null && s.slots.load(s.slots.idle, next)) loadInto(s.slots.idle, next);
    primeIdle();
  }, [count, loadInto, primeIdle, s]);

  /** Switch to chapter `i` at `offsetMs`; keeps playing if it was playing. */
  const jump = useCallback(
    (i: number, offsetMs: number, resume: boolean) => {
      if (i !== s.index) {
        s.els[s.slots.active]!.pause();
        const { slot, fresh } = s.slots.slotFor(i);
        if (fresh) loadInto(slot, i);
        s.slots.activate(slot);
        s.index = i;
        setIndex(i);
      }
      const el = s.els[s.slots.active]!;
      el.muted = false;
      el.playbackRate = s.rate;
      el.currentTime = offsetMs / 1000;
      resetTick(offsetMs);
      s.lastRender = performance.now();
      setPosition((starts[i] ?? 0) + offsetMs);
      if (resume) void el.play().catch(() => setPlaying(false));
      preloadNext();
    },
    [loadInto, preloadNext, resetTick, s, starts],
  );

  const seekTo = useCallback(
    (ms: number) => {
      const el = s.els[s.slots.active];
      if (!el) return;
      const { index: i, offsetMs } = locate(durations, Math.max(0, Math.min(total, ms)));
      s.touched = true;
      // While paused the position is reported on the next play/pause or when leaving.
      jump(i, offsetMs, !el.paused);
    },
    [durations, jump, s, total],
  );

  const play = useCallback(() => {
    const el = s.els[s.slots.active];
    if (!el) return;
    setFailed(false);
    s.touched = true;
    // After a load error: reload the chapter where it was.
    if (el.error) {
      const src = el.src;
      el.src = src;
      el.load();
      el.playbackRate = s.rate;
      el.currentTime = s.lastMedia / 1000;
    }
    // Finished: start over.
    if (s.index === count - 1 && el.ended) jump(0, 0, false);
    const cur = s.els[s.slots.active]!;
    resetTick(cur.currentTime * 1000);
    void cur.play().catch((e: unknown) => {
      setPlaying(false);
      if (!(e instanceof DOMException && e.name === "NotAllowedError")) setFailed(true);
    });
    // Inside the tap: warm up the preloaded next chapter.
    primeIdle();
  }, [count, jump, primeIdle, resetTick, s]);

  const pause = useCallback(() => s.els[s.slots.active]?.pause(), [s]);
  const toggle = useCallback(() => (s.els[s.slots.active]?.paused ? play() : pause()), [pause, play, s]);
  const skip = useCallback((delta: number) => seekTo(absolute() + delta), [absolute, seekTo]);
  const goChapter = useCallback((i: number) => seekTo(starts[Math.max(0, Math.min(count - 1, i))] ?? 0), [count, seekTo, starts]);
  const setRate = useCallback(
    (v: Speed) => {
      s.rate = v;
      for (const el of s.els) el.playbackRate = v;
      setRateState(v);
      storageSet(RATE_KEY, String(v));
    },
    [s],
  );

  const tickRef = useRef(tick);
  tickRef.current = tick;
  const reportRef = useRef(report);
  reportRef.current = report;
  const jumpRef = useRef(jump);
  jumpRef.current = jump;
  const preloadRef = useRef(preloadNext);
  preloadRef.current = preloadNext;
  const resetTickRef = useRef(resetTick);
  resetTickRef.current = resetTick;

  // Build the two elements once per audio version (the player is keyed by it).
  useEffect(() => {
    const chapters = chaptersRef.current;
    const els = [new Audio(), new Audio()];
    s.els = els;
    s.slots = new Slots();
    s.index = init.first.index;
    s.slots.load(0, init.first.index);
    s.slots.activate(0);
    const el0 = els[0]!;
    el0.preload = "auto";
    el0.src = chapters[init.first.index]!.url;
    el0.playbackRate = s.rate;
    // Before metadata this is the "default playback start position", applied on load.
    el0.currentTime = init.first.offsetMs / 1000;
    resetTickRef.current(init.first.offsetMs);

    const cleanups = els.map((el, slot) => {
      const isActive = () => s.slots.active === slot;
      const on = <K extends keyof HTMLMediaElementEventMap>(type: K, fn: () => void) => {
        el.addEventListener(type, fn);
        return () => el.removeEventListener(type, fn);
      };
      const offs = [
        on("play", () => isActive() && !el.muted && setPlaying(true)),
        on("playing", () => isActive() && setBuffering(false)),
        on("waiting", () => isActive() && setBuffering(true)),
        on("timeupdate", () => isActive() && tickRef.current()),
        // A native seek (e.g. a browser control) is not playback: restart counting after it.
        on("seeked", () => isActive() && resetTickRef.current(el.currentTime * 1000)),
        on("pause", () => {
          // A chapter that ends also fires "pause"; "ended" takes over from there.
          if (!isActive() || el.ended || el.muted) return;
          setPlaying(false);
          tickRef.current(true);
          reportRef.current();
        }),
        on("ended", () => {
          if (!isActive()) return;
          tickRef.current(true);
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
    // The next chapter starts loading right away, so the first chapter change has no gap.
    preloadRef.current();
    return () => {
      // Leaving the view: last report before the elements go.
      if (s.touched) {
        tickRef.current(true);
        reportRef.current(true);
      }
      cleanups.forEach((c) => c());
      for (const el of els) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    };
    // Rebuilt only for new audio (the player is keyed by version anyway); a refetch with the
    // same urls must not restart playback.
  }, [version, init, s, total]);

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
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ["play", () => play()],
      ["pause", () => pause()],
      ["seekbackward", (d) => skip(-(d.seekOffset ? d.seekOffset * 1000 : SKIP_MS))],
      ["seekforward", (d) => skip(d.seekOffset ? d.seekOffset * 1000 : SKIP_MS)],
      ["seekto", (d) => d.seekTime !== undefined && seekTo(d.seekTime * 1000)],
      // No previous on the first chapter and no next on the last: the OS hides those buttons.
      ["previoustrack", index > 0 ? () => goChapter(absolute() - (starts[s.index] ?? 0) > 3000 ? s.index : s.index - 1) : null],
      ["nexttrack", index < count - 1 ? () => goChapter(s.index + 1) : null],
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
  }, [absolute, count, goChapter, index, pause, play, s, seekTo, skip, starts]);
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

  const controls = useMemo(() => ({ toggle, play, pause, skip, seekTo, goChapter, setRate }), [toggle, play, pause, skip, seekTo, goChapter, setRate]);

  return { chapters, starts, total, index, position, playing, buffering, failed, rate, controls };
}

export type ListenPlayer = ReturnType<typeof useListenPlayer>;
export type ListenControls = ListenPlayer["controls"];
