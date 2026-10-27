import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Headphones, Pause, Play, RotateCcw, RotateCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Notice } from "@/components/notice";
import { Segmented } from "@/components/game/segmented";
import { Equalizer } from "@/components/listen/equalizer";
import { useListenPlayer, type ListenPlayer } from "@/components/listen/use-listen-player";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { notify } from "@/lib/notify";
import { useInvalidateProgress, useLessonAudio, useMe } from "@/lib/queries";
import { SKIP_MS, SLIDER_STEP_MS, SPEEDS, formatClock, type Speed } from "@/lib/listen";
import type { LessonAudio, LessonDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { XP } from "@shared/game";

/**
 * "Luisteren" (`?view=listen`): the luisterles player. Audio controls only, never the
 * script. Not ready yet → a friendly notice (admins can start it from here).
 */
export function ListenView({ lesson }: { lesson: LessonDetail }) {
  const { t } = useTranslation();
  const { data: audio, isError, isFetching, refetch } = useLessonAudio(lesson.id, { poll: true });

  if (isError && !audio)
    return (
      <Notice
        title={t("listen.loadFailed")}
        description={t("common.errorHint")}
        action={
          <Button variant="chunky" size="lg" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching && <Spinner />} {t("common.retry")}
          </Button>
        }
      />
    );
  if (!audio)
    return (
      <div className="flex min-h-[40dvh] items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  if (audio.status !== "ready" || !audio.chapters.length) return <NotReady lessonId={lesson.id} audio={audio} onQueued={() => void refetch()} />;
  // A regenerated luisterles (new ?v= urls) starts a fresh player.
  return <Player key={audio.chapters.map((c) => c.url).join("|")} lesson={lesson} audio={audio} />;
}

function NotReady({ lessonId, audio, onQueued }: { lessonId: string; audio: LessonAudio; onQueued: () => void }) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const [queueing, setQueueing] = useState(false);
  const making = audio.status === "generating";
  const generate = async () => {
    setQueueing(true);
    try {
      await api.post(`/admin/lessons/${lessonId}/audio`);
      notify.success(t("admin.audio.queued", { count: 1 }));
      onQueued();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setQueueing(false);
    }
  };
  return (
    <Notice
      tone="info"
      title={t("listen.notReady")}
      description={making ? t("listen.notReadyMaking") : t("listen.notReadyHint")}
      action={
        making ? (
          <Spinner className="size-5 text-muted-foreground" aria-label={t("admin.audio.busy")} />
        ) : me?.user.role === "admin" ? (
          <Button variant="chunky" size="lg" onClick={generate} disabled={queueing}>
            {queueing ? <Spinner /> : <Sparkles />} {t("listen.adminGenerate")}
          </Button>
        ) : undefined
      }
    />
  );
}

/** Ignore global player keys while the user types or operates a control that owns them. */
function ownsKey(target: EventTarget | null, key: string) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return true;
  if ((key === " " || key === "Enter") && target.closest("button, a, [role=slider], [role=radio]")) return true;
  if (key.startsWith("Arrow") && target.closest("[role=slider], [role=radiogroup], [role=menu], [role=listbox]")) return true;
  return false;
}

function Player({ lesson, audio }: { lesson: LessonDetail; audio: LessonAudio }) {
  const { t, i18n } = useTranslation();
  const invalidate = useInvalidateProgress();
  const [listened, setListened] = useState(audio.summaryRead || lesson.progress.summaryRead);
  const meta = useMemo(
    () => ({ title: `${lesson.code} · ${lesson.title}`, artist: lesson.reader.title, album: "Windesheim Readers" }),
    [lesson.code, lesson.title, lesson.reader.title],
  );
  const p = useListenPlayer({
    lessonId: lesson.id,
    audio,
    meta,
    onAward: (award) => {
      setListened(true);
      celebrate(award);
      invalidate();
    },
  });

  // Space toggles, ←/→ skip 15 s, anywhere on the page unless a control owns the key.
  const ctl = useRef(p);
  ctl.current = p;
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || ownsKey(e.target, e.key)) return;
      if (e.key === " ") ctl.current.toggle();
      else if (e.key === "ArrowLeft") ctl.current.skip(-SKIP_MS);
      else if (e.key === "ArrowRight") ctl.current.skip(SKIP_MS);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fmtRate = (v: number) => `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(v)}×`;

  return (
    <Card className="gap-0 overflow-hidden px-0 py-0">
      <Cover code={lesson.code} title={lesson.title} playing={p.playing} />
      <div className="flex flex-col gap-5 px-5 pt-5 pb-6 md:px-8">
        <ChapterDots player={p} />
        <Scrubber player={p} />
        <div className="flex items-center justify-center gap-6 sm:gap-8">
          <SkipButton dir={-1} onClick={() => p.skip(-SKIP_MS)} label={t("listen.back15")} />
          <Button
            variant="chunky"
            onClick={p.toggle}
            aria-label={p.playing ? t("listen.pause") : t("listen.play")}
            className="relative size-20 rounded-full [--press:6px] [&_svg:not([class*='size-'])]:size-9"
          >
            {p.playing ? <Pause className="fill-current" strokeWidth={2.2} /> : <Play className="ml-1 fill-current" strokeWidth={2.2} />}
            {p.playing && p.buffering && <Spinner aria-hidden className="absolute -inset-1.5 size-[calc(100%+12px)] text-primary opacity-60" />}
          </Button>
          <SkipButton dir={1} onClick={() => p.skip(SKIP_MS)} label={t("listen.forward15")} />
        </div>
        {p.failed && (
          <Notice
            variant="inset"
            title={t("listen.playFailed")}
            description={t("listen.playFailedHint")}
            action={
              <Button variant="chunky" size="lg" onClick={p.play}>
                {t("common.retry")}
              </Button>
            }
          />
        )}
        <div className="flex flex-col gap-2">
          <span aria-hidden className="text-center font-sans text-xs font-bold text-muted-foreground">
            {t("listen.speed")}
          </span>
          <Segmented<string>
            label={t("listen.speed")}
            value={String(p.rate)}
            onChange={(v) => p.setRate(Number(v) as Speed)}
            options={SPEEDS.map((v) => ({ value: String(v), label: fmtRate(v) }))}
            className="mx-auto w-full max-w-sm"
          />
        </div>
        <div className="flex justify-center">
          {listened ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 font-heading text-sm font-semibold text-success-foreground">
              <Check className="size-4" strokeWidth={3} /> {t("listen.done")}
            </span>
          ) : (
            <span className="text-center text-xs font-semibold text-muted-foreground">{t("listen.xpHint", { xp: XP.summaryRead })}</span>
          )}
        </div>
      </div>
    </Card>
  );
}

/** The "album art": the lesson code on a primary tile with a soft equaliser. */
function Cover({ code, title, playing }: { code: string; title: string; playing: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="relative isolate overflow-hidden bg-primary px-5 pt-5 pb-5 text-primary-foreground md:px-8 md:pb-6">
      <span aria-hidden className="absolute -top-16 -right-10 -z-10 size-48 rounded-full bg-white/10" />
      <span aria-hidden className="absolute -bottom-20 -left-12 -z-10 size-44 rounded-full bg-primary-shade/50" />
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 font-heading text-xs font-semibold">
        <Headphones className="size-3.5" strokeWidth={2.5} /> {t("listen.badge")}
      </span>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="font-heading text-[56px] leading-none font-bold tracking-tight md:text-[64px]">{code}</div>
          <div className="mt-1.5 line-clamp-2 font-heading text-base leading-tight font-semibold text-pretty break-words text-primary-foreground/85 hyphens-auto">
            {title}
          </div>
        </div>
        <Equalizer playing={playing} bars={12} className="mb-1 h-14 shrink-0 gap-[5px] text-white/70" barClassName="w-[5px]" />
      </div>
    </div>
  );
}

function SkipButton({ dir, onClick, label }: { dir: 1 | -1; onClick: () => void; label: string }) {
  const Icon = dir < 0 ? RotateCcw : RotateCw;
  return (
    <Button variant="chunky-surface" onClick={onClick} aria-label={label} title={label} className="relative size-14 rounded-full [--press:4px]">
      <Icon className="size-8" strokeWidth={2} />
      <span aria-hidden className="absolute inset-0 grid place-items-center pt-px font-heading text-[11px] font-bold">
        15
      </span>
    </Button>
  );
}

/** "Deel 2 van 6" with one tappable dot per chapter; the current one fills as it plays. */
function ChapterDots({ player: p }: { player: ListenPlayer }) {
  const { t } = useTranslation();
  const n = p.chapters.length;
  const cur = p.index;
  const into = Math.max(0, Math.min(1, (p.position - (p.starts[cur] ?? 0)) / (p.chapters[cur]?.durationMs || 1)));
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-heading text-base font-semibold" aria-live="polite">
        {t("listen.part", { n: cur + 1, total: n })}
      </span>
      <div role="group" aria-label={t("listen.parts")} className="flex flex-wrap items-center justify-center">
        {p.chapters.map((c, i) => (
          <button
            key={c.n}
            type="button"
            onClick={() => p.goChapter(i)}
            aria-label={t("listen.goPart", { n: i + 1, total: n })}
            aria-current={i === cur ? "step" : undefined}
            className="group grid h-7 place-items-center rounded-full px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span
              className={cn(
                "relative block h-2.5 overflow-hidden rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none",
                i === cur ? "w-9 bg-track" : "w-2.5 group-hover:scale-125",
                i < cur ? "bg-primary" : i > cur && "bg-track",
              )}
            >
              {i === cur && <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.max(28, into * 100)}%` }} />}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Whole-lesson timeline: drag or tap to seek; arrows ±5 s, PageUp/Down ±30 s, Home/End. */
function Scrubber({ player: p }: { player: ListenPlayer }) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const shown = drag ?? p.position;
  const pct = p.total ? Math.max(0, Math.min(100, (shown / p.total) * 100)) : 0;

  const at = (e: PointerEvent) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * p.total;
  };
  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowLeft: -SLIDER_STEP_MS, ArrowDown: -SLIDER_STEP_MS, ArrowRight: SLIDER_STEP_MS, ArrowUp: SLIDER_STEP_MS, PageDown: -30_000, PageUp: 30_000 }[e.key];
    if (step !== undefined) p.seekTo(p.position + step);
    else if (e.key === "Home") p.seekTo(0);
    else if (e.key === "End") p.seekTo(p.total - 500);
    else if (e.key === " ") p.toggle();
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={t("listen.position")}
        aria-valuemin={0}
        aria-valuemax={Math.floor(p.total / 1000)}
        aria-valuenow={Math.floor(shown / 1000)}
        aria-valuetext={t("listen.positionText", { at: formatClock(shown), total: formatClock(p.total) })}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(at(e));
        }}
        onPointerMove={(e) => drag !== null && setDrag(at(e))}
        onPointerUp={(e) => {
          if (drag === null) return;
          p.seekTo(at(e));
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
        className="group relative -my-2 cursor-pointer touch-none rounded-full py-2 outline-none select-none"
      >
        <div className="relative h-3 rounded-full bg-track">
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
          {/* Chapter boundaries as small notches. */}
          {p.starts.slice(1).map((s) => (
            <span key={s} aria-hidden className="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-card" style={{ left: `${(s / p.total) * 100}%` }} />
          ))}
        </div>
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-primary bg-card shadow-[0_3px_0_var(--primary-shade)] transition-transform duration-100 motion-reduce:transition-none",
            "group-focus-visible:ring-4 group-focus-visible:ring-ring/40",
            drag !== null && "scale-110",
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between font-sans text-xs font-bold text-muted-foreground tabular-nums">
        <span>{formatClock(shown)}</span>
        <span aria-label={t("listen.remaining", { time: formatClock(p.total - shown) })}>−{formatClock(p.total - shown)}</span>
      </div>
    </div>
  );
}
