import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Crown, Flame, Users, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { QuestionPrompt } from "@/components/quiz";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { Podium } from "@/components/game/podium";
import type { PublicQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { EndMsg, QuestionMsg, RankEntry, RevealMsg, RoomMsg } from "./use-battle-socket";

/** Gold chunky button: the primary action on the dark stage (use with variant="chunky"). */
export const GOLD_BUTTON =
  "bg-gold text-gold-foreground [--shade:var(--gold-shade)] disabled:bg-white/15 disabled:text-white/55 disabled:opacity-100";

/** Owner brand mark for the dark stage. Decorative: a title always sits next to it. */
export function StageLogo({ className }: { className?: string }) {
  return <img src="/brand/logo-mono-white.svg" alt="" width={36} height={36} className={cn("size-9 shrink-0", className)} />;
}

const reducedQuery = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(reducedQuery);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(reducedQuery).matches,
  );
}

const usePoints = () => {
  const { t, i18n } = useTranslation();
  return (n: number) => t("battle.points", { n: n.toLocaleString(i18n.language) });
};

/** Sticky bottom action bar (host controls), clear of the safe area. */
function BottomAction({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 mt-auto bg-gradient-to-t from-background from-70% to-transparent pt-5 pb-[calc(4px+env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}

// ---------- lobby ----------

export function Lobby({
  room,
  meId,
  isHost,
  onStart,
  onKick,
}: {
  room: RoomMsg;
  meId?: string;
  isHost: boolean;
  onStart: () => void;
  onKick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/battle/${room.code}`;

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col pt-2">
      <div className="flex items-center gap-3">
        <StageLogo />
        <div className="min-w-0">
          <p className="font-heading text-lg leading-tight font-semibold">{t("battle.title")}</p>
          <p className="font-heading text-sm font-semibold break-words text-primary">{room.title}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-2 rounded-[26px] bg-white px-4 py-6 text-center text-[#241a4a] shadow-[0_6px_0_var(--chunky)] md:py-8">
        <p className="text-sm font-bold text-balance text-[#6b5fa0]">{t("battle.joinWith")}</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(() => setCopied(true));
          }}
          title={t("battle.copyLink")}
          className="group inline-flex items-center gap-2 rounded-2xl px-2 font-heading text-[52px] leading-none font-bold tracking-[0.12em] tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-7xl md:text-8xl"
        >
          {room.code}
          <span className="sr-only">{t("battle.copyLink")}</span>
          {copied ? (
            <Check className="size-6 shrink-0 text-success-shade" strokeWidth={3} />
          ) : (
            <Copy className="size-6 shrink-0 opacity-30 transition-opacity group-hover:opacity-70 motion-reduce:transition-none" />
          )}
        </button>
        <p className="text-xs font-bold break-all text-[#8c82b5]">{link}</p>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Users className="size-5 shrink-0 text-gold" />
        <h2 className="font-heading text-lg font-semibold">{t("battle.players", { count: room.players.length })}</h2>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {room.players.map((p) => (
          <li
            key={p.id}
            className="inline-flex max-w-full animate-pop items-center gap-2 rounded-full bg-card py-1 pr-3 pl-1 text-sm font-bold motion-reduce:animate-none"
          >
            <PlayerAvatar name={p.name} className="size-7 text-xs" />
            <span className="min-w-0 break-words">{p.name}</span>
            {p.id === room.hostId && <Crown className="size-4 shrink-0 text-gold" aria-label={t("battle.hostLabel")} />}
            {isHost && p.id !== meId && (
              <button
                type="button"
                aria-label={t("battle.kick", { name: p.name })}
                onClick={() => onKick(p.id)}
                className="-mr-1.5 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white/15 hover:text-white"
              >
                <X className="size-4" strokeWidth={3} />
              </button>
            )}
          </li>
        ))}
        {room.players.length === 0 && <li className="text-sm font-bold text-muted-foreground">{t("battle.lobby")}</li>}
      </ul>

      {isHost ? (
        <BottomAction>
          <Button variant="chunky" size="xl" className={cn("w-full", GOLD_BUTTON)} onClick={onStart} disabled={room.players.length === 0}>
            {t("battle.startGame")}
          </Button>
        </BottomAction>
      ) : (
        <p className="mt-auto flex items-center justify-center gap-2 pt-10 pb-4 font-bold text-muted-foreground">
          <Spinner /> {t("battle.waitingHost")}
        </p>
      )}
    </div>
  );
}

// ---------- play ----------

function Countdown({ endsAt, durationMs, stopped }: { endsAt: number; durationMs: number; stopped: boolean }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (stopped) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [stopped]);
  const left = stopped ? 0 : Math.max(0, endsAt - now);
  const secs = Math.ceil(left / 1000);
  // Reduced motion: the ring steps once per second instead of sweeping.
  const frac = Math.min(1, (reduce ? secs * 1000 : left) / durationMs);
  const urgent = !stopped && secs <= 5;
  return (
    <div
      role="timer"
      aria-label={t("battle.secondsLeft", { count: secs })}
      className="grid size-14 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${urgent ? "var(--danger)" : "var(--gold)"} ${frac * 360}deg, rgb(255 255 255 / 0.15) 0)`,
      }}
    >
      <span
        aria-hidden
        className={cn("grid size-[46px] place-items-center rounded-full bg-background font-heading text-xl font-semibold tabular-nums", urgent && "text-danger")}
      >
        {secs}
      </span>
    </div>
  );
}

const SHAPES = {
  triangle: <path d="M12 3.5 22 20.5H2Z" strokeLinejoin="round" />,
  diamond: <path d="M12 2 22 12 12 22 2 12Z" strokeLinejoin="round" />,
  circle: <circle cx="12" cy="12" r="10" />,
  square: <rect x="2.5" y="2.5" width="19" height="19" rx="3" />,
};
type Shape = keyof typeof SHAPES;

// Kahoot order: triangle/pink, diamond/blue, circle/gold, square/mint. Dark text on gold.
const BLOCKS: { shape: Shape; cls: string }[] = [
  { shape: "triangle", cls: "bg-danger text-white [--shade:var(--danger-shade)]" },
  { shape: "diamond", cls: "bg-info text-white [--shade:var(--info-shade)]" },
  { shape: "circle", cls: "bg-gold text-[#5a3b00] [--shade:var(--gold-shade)]" },
  { shape: "square", cls: "bg-success text-white [--shade:var(--success-shade)]" },
];

const MD_COLS: Record<number, string> = { 2: "md:grid-cols-2", 3: "md:grid-cols-3" };

interface Choice {
  value: unknown;
  label: string;
  block: (typeof BLOCKS)[number];
}

function choicesFor(q: PublicQuestion, t: (k: string) => string): Choice[] {
  if (q.type === "mc") return q.options.map((label, i) => ({ value: i, label, block: BLOCKS[i % BLOCKS.length]! }));
  // True/false: two blocks, Waar blue/diamond and Onwaar pink/triangle.
  if (q.type === "tf")
    return [
      { value: true, label: t("quiz.true"), block: BLOCKS[1]! },
      { value: false, label: t("quiz.false"), block: BLOCKS[0]! },
    ];
  return [];
}

function AnswerBlocks({
  question,
  picked,
  locked,
  reveal,
  onPick,
  className,
}: {
  question: PublicQuestion;
  picked: unknown;
  locked: boolean;
  reveal: RevealMsg | null;
  onPick: (v: unknown) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const choices = choicesFor(question, t);
  const tall = choices.length <= 2;
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:gap-4", MD_COLS[choices.length] ?? "md:grid-cols-4", className)}>
      {choices.map((c, i) => {
        const isPicked = picked === c.value;
        const isCorrect = !!reveal && reveal.correctAnswer === c.value;
        const count = reveal?.counts[JSON.stringify(c.value)] ?? 0;
        // Waiting: the other blocks fade once you've answered. Reveal: the right one stays,
        // your wrong pick half-fades (so its ✕ still reads), the rest fade out.
        const fade = reveal
          ? isCorrect
            ? null
            : isPicked
              ? "disabled:opacity-60"
              : "disabled:opacity-35"
          : picked !== undefined && !isPicked
            ? "disabled:opacity-35"
            : null;
        return (
          <Button
            key={i}
            variant="chunky"
            disabled={locked || !!reveal || picked !== undefined}
            onClick={() => onPick(c.value)}
            aria-pressed={isPicked}
            className={cn(
              "relative h-auto flex-col items-stretch justify-between gap-3 rounded-[20px] p-3 text-left font-sans text-[15px] leading-snug font-bold whitespace-normal [--press:6px] md:p-4 md:text-lg",
              tall ? "min-h-32 md:min-h-44" : "min-h-28 md:min-h-40",
              "disabled:shadow-[0_6px_0_var(--shade)]",
              c.block.cls,
              fade ?? "disabled:opacity-100",
              isPicked && "ring-4 ring-white",
            )}
          >
            <span className="flex items-start justify-between gap-2">
              <svg viewBox="0 0 24 24" aria-hidden className="size-7 fill-current stroke-current stroke-1 md:size-8">
                {SHAPES[c.block.shape]}
              </svg>
              {reveal && (
                <span className="flex items-center gap-1.5">
                  <span className="font-heading text-lg leading-none tabular-nums" aria-label={t("battle.votes", { count })}>
                    {count}
                  </span>
                  {(isCorrect || isPicked) && (
                    <span
                      className={cn(
                        "grid size-7 place-items-center rounded-full bg-white",
                        isCorrect ? "text-success-shade" : "text-danger-shade",
                      )}
                    >
                      {isCorrect ? <Check className="size-4" strokeWidth={3.5} /> : <X className="size-4" strokeWidth={3.5} />}
                      <span className="sr-only">{isCorrect ? t("battle.correctAnswer") : t("quiz.incorrect")}</span>
                    </span>
                  )}
                </span>
              )}
            </span>
            <span className="break-words hyphens-auto [text-shadow:0_1px_0_rgb(0_0_0/0.12)]">{c.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

export function Play({
  room,
  question: q,
  reveal,
  progress,
  meId,
  isHost,
  isPlayer,
  answer,
  answered,
  onAnswer,
  onNext,
}: {
  room: RoomMsg;
  question: QuestionMsg;
  reveal: RevealMsg | null;
  progress: { answered: number; total: number } | null;
  meId?: string;
  isHost: boolean;
  isPlayer: boolean;
  answer: unknown;
  answered: boolean;
  onAnswer: (v: unknown) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const points = usePoints();
  const me = room.players.find((p) => p.id === meId);
  const myResult = reveal && meId ? reveal.results[meId] : null;
  const isLast = q.index + 1 >= q.total;
  const answeredCount = progress?.answered ?? 0;
  const playerCount = progress?.total ?? room.players.length;

  return (
    <div className="flex flex-1 flex-col pt-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="text-[13px] font-bold text-muted-foreground md:text-base">{t("quiz.question", { i: q.index + 1, n: q.total })}</span>
        <Countdown endsAt={q.endsAt} durationMs={q.durationMs} stopped={!!reveal} />
        <span className="justify-self-end text-right font-heading text-[15px] font-semibold text-gold tabular-nums md:text-xl">
          {me ? points(me.score) : null}
        </span>
      </div>

      <QuestionPrompt text={q.question.prompt} className="mt-5 text-[22px] leading-tight md:mt-8 md:text-[32px]" />
      {!reveal && (
        <p className="mt-2.5 text-[13px] font-bold text-muted-foreground md:text-[15px]" aria-live="polite">
          {t("battle.answered", { a: answeredCount, n: playerCount })}
        </p>
      )}

      <AnswerBlocks
        key={q.index}
        question={q.question}
        picked={answer}
        locked={!isPlayer || answered}
        reveal={reveal}
        onPick={onAnswer}
        className={reveal ? "mt-6" : "mt-auto pt-6"}
      />

      {answered && !reveal && (
        <p className="mt-5 animate-pop text-center font-heading text-lg font-semibold motion-reduce:animate-none" role="status">
          {t("battle.youAnswered")}
        </p>
      )}

      {reveal && (
        <div className="mt-6 space-y-4">
          {isPlayer && (
            <div
              role="status"
              className={cn(
                "animate-pop rounded-[20px] p-4 text-center font-heading text-xl font-semibold motion-reduce:animate-none",
                myResult?.correct
                  ? "bg-success text-success-foreground shadow-[0_5px_0_var(--success-shade)]"
                  : myResult
                    ? "bg-danger text-danger-foreground shadow-[0_5px_0_var(--danger-shade)]"
                    : "bg-card shadow-[0_5px_0_var(--chunky)]",
              )}
            >
              {myResult ? (myResult.correct ? t("battle.correctLabel", { n: myResult.points }) : t("battle.wrongLabel")) : t("battle.noAnswer")}
            </div>
          )}
          {reveal.explanation && <p className="text-sm leading-relaxed font-semibold text-muted-foreground">{reveal.explanation}</p>}
          <Ranking ranking={reveal.ranking} meId={meId} limit={5} />
        </div>
      )}

      {isHost ? (
        <BottomAction>
          <Button variant="chunky" size="xl" className={cn("w-full", GOLD_BUTTON)} onClick={onNext}>
            {!reveal ? t("battle.showAnswer") : isLast ? t("battle.finish") : t("battle.nextQuestion")}
          </Button>
        </BottomAction>
      ) : (
        <div className="pb-2" />
      )}
    </div>
  );
}

// ---------- ranking + results ----------

function Ranking({ ranking, meId, limit, xp }: { ranking: RankEntry[]; meId?: string; limit: number; xp?: Record<string, number> }) {
  const { t } = useTranslation();
  const points = usePoints();
  const shown = ranking.slice(0, limit);
  const me = ranking.find((r) => r.id === meId);
  const rows = [...shown, ...(me && !shown.includes(me) ? [me] : [])];
  return (
    <ol className="rounded-[20px] bg-card p-1 shadow-[0_5px_0_var(--chunky)]">
      {rows.map((p) => (
        <li
          key={p.id}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold [&+&]:border-t-2 [&+&]:border-background/40",
            p.id === meId && "rounded-[14px] bg-primary/25 ring-2 ring-primary ring-inset [&+&]:border-transparent",
          )}
        >
          <span className="w-6 shrink-0 text-center font-heading font-semibold text-muted-foreground tabular-nums">
            {p.rank === 1 ? (
              <>
                <Crown className="mx-auto size-4 text-gold" aria-hidden />
                <span className="sr-only">1</span>
              </>
            ) : (
              p.rank
            )}
          </span>
          <PlayerAvatar name={p.name} className="size-[30px] text-[13px]" />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          {p.streak >= 2 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 font-heading text-warning" aria-label={t("battle.streak", { n: p.streak })}>
              <Flame className="size-4 fill-current" aria-hidden /> {p.streak}
            </span>
          )}
          {xp?.[p.id] ? <span className="shrink-0 font-heading text-xs text-success">+{xp[p.id]} XP</span> : null}
          <span className="shrink-0 font-heading font-semibold text-gold tabular-nums">{points(p.score)}</span>
        </li>
      ))}
    </ol>
  );
}

export function Results({ end, meId, onPlayAgain }: { end: EndMsg; meId?: string; onPlayAgain: () => void }) {
  const { t } = useTranslation();
  const points = usePoints();
  const myXp = meId ? end.xp[meId] : 0;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col pt-2">
      <div className="flex flex-col items-center gap-2 text-center">
        <StageLogo className="size-11" />
        <h1 className="font-heading text-3xl font-semibold">{t("battle.podium")}</h1>
      </div>
      <Podium
        className="mt-6"
        entries={end.ranking.slice(0, 3).map((p) => ({ name: p.name, value: points(p.score), me: p.id === meId }))}
      />
      {!!myXp && (
        <p className="mx-auto mt-6 inline-flex animate-pop items-center gap-2 rounded-full bg-gold px-4 py-2 font-heading text-lg font-semibold text-gold-foreground shadow-[0_4px_0_var(--gold-shade)] motion-reduce:animate-none">
          <Zap className="size-5 fill-current" aria-hidden /> {t("battle.youEarned", { n: myXp })}
        </p>
      )}
      <div className="mt-6">
        <Ranking ranking={end.ranking} meId={meId} limit={10} xp={end.xp} />
      </div>
      <BottomAction>
        <Button variant="chunky" size="xl" className={cn("w-full", GOLD_BUTTON)} onClick={onPlayAgain}>
          {t("battle.playAgain")}
        </Button>
      </BottomAction>
    </div>
  );
}
