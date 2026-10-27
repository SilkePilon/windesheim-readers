import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Headphones,
  Layers,
  Lightbulb,
  MessageSquareText,
  Search,
  SquareCheckBig,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageError, PageSpinner } from "@/components/page";
import { Markdown } from "@/components/markdown";
import { ExplainTab } from "@/components/explain-tab";
import { OpenTab } from "@/components/open-tab";
import { TutorTab } from "@/components/tutor-tab";
import { ListenView } from "@/components/listen/listen-view";
import { ActivityTile, type ActivityTone } from "@/components/game/activity-tile";
import { LevelBar } from "@/components/game/level-bar";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { useInvalidateProgress, useLesson, useLessonAudio } from "@/lib/queries";
import { formatClock, resumeAt } from "@/lib/listen";
import type { LessonDetail, XpResult } from "@/lib/types";
import { useEntrance } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { XP } from "@shared/game";
import { lessonLevel, nextStep, nextStepHint } from "@shared/levels";

const VIEWS = ["read", "listen", "explain", "open", "tutor"] as const;
type View = (typeof VIEWS)[number];
type ActivityId = "cards" | View | "quiz";

export default function LessonPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const { data: lesson, isLoading, isError, isFetching, refetch } = useLesson(id);
  const raw = params.get("view");
  const view = VIEWS.find((v) => v === raw) ?? null;

  // Switching between the tiles and a sub-view (or to another lesson) starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id, view]);

  if (isError && !lesson) return <PageError title={t("lesson.loadFailed")} onRetry={() => void refetch()} retrying={isFetching} />;
  if (isLoading || !lesson) return <PageSpinner />;
  return view ? <SubView lesson={lesson} view={view} /> : <Overview lesson={lesson} />;
}

/** Recommended next step and the hint line under the level bar ("listen" wording when a luisterles is ready). */
function useNextStep(lesson: LessonDetail, canListen = false) {
  const { t } = useTranslation();
  const p = lesson.progress;
  const level = lessonLevel(p.mastery);
  const cardsLeft = Math.ceil(lesson.flashcardCount * (1 - p.cardMastery) - 1e-9);
  // Activities without content can't add mastery, so they are never recommended.
  const step = nextStep({
    bestQuiz: lesson.quizCount ? p.bestQuiz : 1,
    bestExplain: lesson.terms.length + lesson.keyPoints.length ? p.bestExplain : 1,
    summaryRead: lesson.summary ? p.summaryRead : true,
    cardMastery: lesson.flashcardCount ? p.cardMastery : 1,
    cardsLeft,
  });

  const h = nextStepHint({ mastery: p.mastery, flashcardCount: lesson.flashcardCount, cardsLeft, step });
  const key = h && canListen && (h.key === "read" || h.key === "readNoLevel") ? h.key.replace("read", "listen") : h?.key;
  const hint = h ? t(`lesson.next.${key}`, { n: "n" in h ? h.n : undefined, level: "level" in h ? h.level : undefined }) : undefined;

  return { level, step, cardsLeft, hint };
}

function Overview({ lesson }: { lesson: LessonDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const p = lesson.progress;
  const { data: audio } = useLessonAudio(lesson.id);
  const audioReady = audio?.status === "ready";
  const { level, step, cardsLeft, hint } = useNextStep(lesson, audioReady);
  const pct = (v: number) => Math.round(v * 100);
  const resume = audioReady ? resumeAt(audio.listenMs, audio.totalMs) : 0;

  const activities: { id: ActivityId; icon: LucideIcon; tone: ActivityTone; status: string }[] = [
    {
      id: "cards",
      icon: Layers,
      tone: "primary",
      status: !lesson.flashcardCount
        ? t("lesson.status.noCards")
        : cardsLeft <= 0
          ? t("lesson.status.cardsDone")
          : p.cardMastery <= 0
            ? t("lesson.status.cardsNew", { n: lesson.flashcardCount })
            : t("lesson.status.cardsLeft", { n: cardsLeft }),
    },
    {
      id: "read",
      icon: BookOpen,
      tone: "info",
      status: p.summaryRead ? t("lesson.status.read") : t("lesson.status.summary"),
    },
    {
      id: "listen",
      icon: Headphones,
      tone: "listen",
      status: !audio
        ? "\u00a0"
        : !audioReady
          ? t("lesson.status.listenSoon")
          : resume > 0
            ? t("lesson.status.listenResume", { time: formatClock(resume) })
            : t("lesson.status.listenLength", { n: Math.max(1, Math.round(audio.totalMs / 60_000)) }),
    },
    {
      id: "quiz",
      icon: SquareCheckBig,
      tone: "success",
      status: !lesson.quizCount
        ? t("lesson.status.noQuestions")
        : p.bestQuiz > 0
          ? t("lesson.status.best", { pct: pct(p.bestQuiz) })
          : t("lesson.status.notDone"),
    },
    {
      id: "explain",
      icon: Lightbulb,
      tone: "hard",
      status: p.bestExplain > 0 ? t("lesson.status.best", { pct: pct(p.bestExplain) }) : t("lesson.status.notDone"),
    },
    {
      id: "open",
      icon: MessageSquareText,
      tone: "danger",
      status: lesson.openCount
        ? t("lesson.status.questions", { count: lesson.openCount })
        : t("lesson.status.noQuestions"),
    },
    { id: "tutor", icon: Bot, tone: "gold", status: t("lesson.status.tutor") },
  ];

  const open = (a: ActivityId) => {
    if (a === "cards" || a === "quiz") navigate(`/lesson/${lesson.id}/${a}`);
    else setParams({ view: a });
  };
  // Not read yet and there is a luisterles: listening is the recommended way in (it counts as read).
  const highlighted = step?.kind === "read" && audioReady ? "listen" : (step?.kind ?? null);
  const hot = activities.find((a) => a.id === highlighted);
  // On desktop the recommended tile becomes the "next step" button, so the grid shows
  // the rest; with an odd count the last tile spans both columns instead of sitting alone.
  const desktopTiles = activities.filter((a) => a.id !== highlighted);
  const wideOnDesktop = desktopTiles.length % 2 === 1 ? desktopTiles.at(-1)?.id : undefined;
  const wideOnMobile = activities.length % 2 === 1 ? activities.at(-1)?.id : undefined;
  const intro = useEntrance();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 md:px-8 md:py-8">
      <div className="flex items-center gap-3">
        <Button asChild variant="chunky-surface" size="icon-xl" className="[--press:3px]">
          <Link to="/" aria-label={t("lesson.back")}>
            <ChevronLeft strokeWidth={2.5} />
          </Link>
        </Button>
        <span className="min-w-0 text-sm leading-tight break-words text-muted-foreground">{lesson.reader.title}</span>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 md:grid-rows-[auto_1fr] md:gap-x-8 md:gap-y-6">
        <Card className="gap-0 px-5 py-5 md:col-start-1 md:row-start-1">
          <div className="font-heading text-[44px] leading-none font-bold text-primary">{lesson.code}</div>
          <h1 className="mt-1.5 font-heading text-xl leading-tight font-semibold text-pretty break-words hyphens-auto lg:text-2xl">
            {lesson.title}
          </h1>
          <LevelBar
            className="mt-4"
            level={level}
            size="lg"
            label={
              <span className="flex justify-between gap-2 font-sans text-[13px] font-bold">
                <span>{t("lesson.level", { n: level })}</span>
                <span className="text-muted-foreground">{t("lesson.ofMax")}</span>
              </span>
            }
            hint={hint && <span className="text-[13px]">{hint}</span>}
          />
        </Card>

        <section className="flex flex-col gap-5 md:col-start-2 md:row-span-2 md:row-start-1">
          {hot && (
            <Button variant="chunky" size="xl" className="hidden w-full md:flex" onClick={() => open(hot.id)}>
              <hot.icon strokeWidth={2.4} />
              {t("lesson.startNext", { name: t(`lesson.activities.${hot.id}`) })}
              <ChevronRight strokeWidth={2.5} className="ml-auto" />
            </Button>
          )}
          <div className={cn("grid grid-cols-2 gap-3", intro && "stagger-in")}>
            {activities.map((a) => (
              <ActivityTile
                key={a.id}
                icon={a.icon}
                tone={a.tone}
                title={t(`lesson.activities.${a.id}`)}
                status={a.status}
                highlighted={a.id === highlighted}
                onClick={() => open(a.id)}
                className={cn(
                  a.id === highlighted && "md:hidden",
                  a.id === wideOnMobile && "max-md:col-span-2",
                  a.id === wideOnDesktop && "md:col-span-2",
                )}
              />
            ))}
          </div>
        </section>

        {lesson.keyPoints.length > 0 && (
          <KeyPoints points={lesson.keyPoints} className="md:col-start-1 md:row-start-2 md:self-start" />
        )}
      </div>
    </div>
  );
}

function KeyPoints({ points, className }: { points: string[]; className?: string }) {
  const { t } = useTranslation();
  return (
    <Card className={cn("gap-3 px-5 py-5", className)}>
      <h2 className="font-heading text-lg font-semibold">{t("lesson.keyPoints")}</h2>
      <ul className="space-y-2.5">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5 text-[15px] leading-snug">
            <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-success text-success-foreground">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            {p}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SubView({ lesson, view }: { lesson: LessonDetail; view: View }) {
  const { t } = useTranslation();
  let body: ReactNode;
  if (view === "read") body = <ReadView lesson={lesson} />;
  else if (view === "listen") body = <ListenView lesson={lesson} />;
  else if (view === "explain") body = <ExplainTab lesson={lesson} />;
  else if (view === "open") body = <OpenTab lessonId={lesson.id} />;
  else body = <TutorTab lessonId={lesson.id} code={lesson.code} />;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 md:px-8 md:py-8">
      <header className="mb-5 flex items-center gap-3">
        <Button asChild variant="chunky-surface" size="icon-xl" className="[--press:3px]">
          <Link to={`/lesson/${lesson.id}`} aria-label={t("lesson.back")}>
            <ChevronLeft strokeWidth={2.5} />
          </Link>
        </Button>
        <div className="min-w-0">
          <div className="text-sm break-words text-muted-foreground">
            <span className="font-heading font-semibold text-primary">{lesson.code}</span> · {lesson.title}
          </div>
          <h1 className="font-heading text-2xl leading-tight font-semibold">{t(`lesson.activities.${view}`)}</h1>
        </div>
      </header>
      {body}
    </div>
  );
}

function ReadView({ lesson }: { lesson: LessonDetail }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateProgress();
  const [filter, setFilter] = useState("");
  const [marking, setMarking] = useState(false);
  const q = filter.toLowerCase();
  const terms = lesson.terms.filter(
    (x) => !q || x.term.toLowerCase().includes(q) || x.definition.toLowerCase().includes(q),
  );

  const markRead = async () => {
    setMarking(true);
    try {
      celebrate(await api.post<XpResult>(`/lessons/${lesson.id}/read`));
      invalidate();
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="space-y-5">
      {lesson.keyPoints.length > 0 && <KeyPoints points={lesson.keyPoints} />}

      {lesson.summary && (
        <Card className="gap-0 px-5 py-5 md:px-7 md:py-6">
          <Markdown>{lesson.summary}</Markdown>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t-2 border-accent pt-4 dark:border-secondary">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="size-3.5" /> {t("lesson.sourcePages", { from: lesson.startPage, to: lesson.endPage })}
            </span>
            {lesson.progress.summaryRead ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 font-heading text-sm font-semibold text-success-foreground">
                <Check className="size-4" strokeWidth={3} /> {t("lesson.markedRead")}
              </span>
            ) : (
              <Button variant="chunky" size="xl" onClick={markRead} disabled={marking}>
                {t("lesson.markRead")} <span className="opacity-75">+{XP.summaryRead} XP</span>
              </Button>
            )}
          </div>
        </Card>
      )}

      {lesson.terms.length > 0 && (
        <Card className="gap-3 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold">
              {t("lesson.terms")} <span className="font-sans text-base text-muted-foreground">({lesson.terms.length})</span>
            </h2>
            {lesson.terms.length > 8 && (
              <div className="relative max-w-44">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  aria-label={t("lesson.terms")}
                  className="h-9 rounded-[12px] pl-8"
                />
              </div>
            )}
          </div>
          <dl className="divide-y-2 divide-accent dark:divide-secondary">
            {terms.map((x) => (
              <div key={x.term} className="py-2.5 first:pt-0 last:pb-0">
                <dt className="font-heading text-base font-semibold">{x.term}</dt>
                <dd className="text-[15px] text-muted-foreground">{x.definition}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {(lesson.prev || lesson.next) && (
        <nav className="grid gap-3 pt-3 sm:grid-cols-2">
          {lesson.prev ? (
            <LessonLink to={lesson.prev} label={t("common.previous")} dir="prev" />
          ) : (
            <span className="hidden sm:block" />
          )}
          {lesson.next && <LessonLink to={lesson.next} label={t("common.next")} dir="next" />}
        </nav>
      )}
    </div>
  );
}

function LessonLink({
  to,
  label,
  dir,
}: {
  to: { id: string; code: string; title: string };
  label: string;
  dir: "prev" | "next";
}) {
  return (
    <Button
      asChild
      variant="chunky-surface"
      className={cn("h-full min-w-0 gap-2 rounded-[18px] px-3 py-3 whitespace-normal", dir === "next" ? "justify-end" : "justify-start")}
    >
      {/* The previous lesson slides in from the left (see navDirection). */}
      <Link to={`/lesson/${to.id}?view=read`} state={dir === "prev" ? { navDir: "back" } : undefined}>
        {dir === "prev" && <ChevronLeft className="size-5" strokeWidth={2.5} />}
        <span className={cn("min-w-0", dir === "next" ? "text-right" : "text-left")}>
          <span className="block font-sans text-xs font-bold text-muted-foreground">{label}</span>
          <span className="block text-base text-primary">{to.code}</span>
          <span className="block font-sans text-xs font-bold break-words hyphens-auto">{to.title}</span>
        </span>
        {dir === "next" && <ChevronRight className="size-5" strokeWidth={2.5} />}
      </Link>
    </Button>
  );
}
