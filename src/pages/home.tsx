import { lazy, Suspense, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronRight, Flame, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageSpinner } from "@/components/page";
import { Chip } from "@/components/game/chip";
import { QuestCard } from "@/components/game/quest-card";
import { InstallNudge } from "@/components/install-drawer";
import { WORLD_WIDTH, worldHeight } from "@/lib/world/compose";
import { useLeaderboard, useMe, useReaders } from "@/lib/queries";
import type { LeaderboardEntry, Me, ReaderWithLessons } from "@/lib/types";
import { DAILY_XP_GOAL } from "@shared/game";
import { pathNodes } from "@shared/path";
import { storageGet, storageSet } from "@/lib/storage";
import { cn } from "@/lib/utils";

const loadWorldMap = () => import("@/components/world/world-map");
const WorldMap = lazy(loadWorldMap);

const READER_KEY = "wr.home.reader";

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: readers, isLoading } = useReaders();
  const [picked, setPicked] = useState(() => storageGet(READER_KEY));
  if (!me || isLoading) return <PageSpinner />;

  const withLessons = (readers ?? []).filter((r) => r.lessons.length > 0);
  const reader =
    withLessons.find((r) => r.id === picked) ?? withLessons.find((r) => r.lastStudiedLessonId) ?? withLessons[0];
  const pick = (id: string) => {
    storageSet(READER_KEY, id);
    setPicked(id);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 md:px-8 md:py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-10">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1">
        <HeaderChips me={me} />
        <DailyGoal todayXp={me.stats.todayXp} />
        <QuestCard quests={me.quests} />
        <WeekBoard className="hidden lg:flex" />
      </aside>

      <div className="mt-6 min-w-0 lg:col-start-1 lg:row-start-1 lg:mt-0">
        {!reader ? (
          <Card className="items-center gap-3 px-6 py-8 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
              {me.user.role === "admin" ? <Upload className="size-7" /> : <BookOpen className="size-7" />}
            </div>
            <h2 className="font-heading text-lg font-semibold text-balance">{t("home.noReaders")}</h2>
            {me.user.role === "admin" && (
              <Link to="/admin" className="text-sm font-bold text-primary underline-offset-4 hover:underline">
                {t("home.noReadersAdmin")}
              </Link>
            )}
          </Card>
        ) : (
          <>
            {withLessons.length > 1 ? (
              <ReaderSwitcher readers={withLessons} value={reader.id} onChange={pick} />
            ) : (
              <h1 className="hidden font-heading text-2xl font-semibold tracking-tight lg:block">{reader.title}</h1>
            )}
            <Suspense fallback={<WorldMapSkeleton lessons={reader.lessons.length} />}>
              <WorldMap
                seed={reader.id}
                groups={pathNodes(reader.lessons, reader.lastStudiedLessonId)}
                onOpen={(id) => navigate(`/lesson/${id}`)}
              />
            </Suspense>
          </>
        )}
      </div>
      <InstallNudge />
    </div>
  );
}

function HeaderChips({ me }: { me: Me }) {
  const { t } = useTranslation();
  const s = me.stats;
  return (
    <div className="flex items-center gap-2">
      <Chip tone="streak" aria-label={t("home.streakChip", { count: s.streak })}>
        <Flame className={cn(s.activeToday && "fill-current")} aria-hidden />
        {s.streak}
      </Chip>
      <Chip tone="level">{t("home.levelChip", { n: s.level })}</Chip>
      <Chip tone="xp" className="ml-auto" aria-label={t("home.totalXp", { n: s.xp })}>
        {t("common.xp", { n: s.xp })}
      </Chip>
    </div>
  );
}

function DailyGoal({ todayXp }: { todayXp: number }) {
  const { t } = useTranslation();
  const pct = Math.min(1, todayXp / DAILY_XP_GOAL);
  return (
    <Card className="gap-2 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3 text-sm font-bold">
        <h2 className="font-heading text-base font-semibold">{t("home.dailyGoal")}</h2>
        <span className="tabular-nums">
          {pct >= 1 ? t("home.dailyGoalDone") : `${Math.min(todayXp, DAILY_XP_GOAL)} / ${DAILY_XP_GOAL} XP`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t("home.dailyGoal")}
        aria-valuemin={0}
        aria-valuemax={DAILY_XP_GOAL}
        aria-valuenow={Math.min(todayXp, DAILY_XP_GOAL)}
        className="h-3.5 overflow-hidden rounded-[9px] bg-track"
      >
        <div
          className="h-full rounded-[9px] bg-success shadow-[inset_0_-4px_0_var(--success-shade)]"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </Card>
  );
}

function ReaderSwitcher({
  readers,
  value,
  onChange,
}: {
  readers: ReaderWithLessons[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t("home.readers")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-1 pb-2 md:mx-0 md:px-0">
      {readers.map((r) => {
        const on = r.id === value;
        return (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(r.id)}
            className={cn(
              "max-w-[16rem] shrink-0 truncate rounded-[14px] px-3.5 py-2 font-heading text-sm font-semibold transition-[translate,box-shadow] duration-100 active:translate-y-[3px] active:shadow-none motion-reduce:transition-none motion-reduce:active:translate-y-0",
              on
                ? "bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-shade)]"
                : "bg-card text-foreground shadow-[0_3px_0_var(--chunky)]",
            )}
          >
            {r.title}
          </button>
        );
      })}
    </div>
  );
}

function WeekBoard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data } = useLeaderboard("week");
  if (!data) return null;
  const top = data.top.slice(0, 3);
  // Your own row: from the board, or a 0 XP row when you haven't earned XP this week.
  const meRow: LeaderboardEntry | null = top.some((e) => e.me)
    ? null
    : (data.me ?? { rank: 0, name: "", xp: 0, streak: 0, level: 1, me: true });
  return (
    <Card className={cn("gap-1 px-4", className)}>
      <Link
        to="/leaderboard"
        aria-label={t("home.toLeaderboard")}
        className="mb-1 flex items-center justify-between font-heading text-base font-semibold hover:text-primary"
      >
        <h2>{t("home.weekBoard")}</h2>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
      {top.length === 0 && <p className="text-sm text-muted-foreground">{t("leaderboard.empty")}</p>}
      {top.map((e) => (
        <BoardRow key={e.rank} e={e} />
      ))}
      {meRow && (
        <>
          {(meRow.rank === 0 || meRow.rank > 4) && top.length > 0 && <div className="text-center text-xs leading-none text-muted-foreground" aria-hidden>⋮</div>}
          <BoardRow e={meRow} />
        </>
      )}
    </Card>
  );
}

function BoardRow({ e }: { e: LeaderboardEntry }) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "-mx-2 flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm font-bold",
        e.me && "bg-secondary ring-2 ring-primary ring-inset",
      )}
    >
      <span className="w-6 font-heading text-muted-foreground tabular-nums">{e.rank ? `${e.rank}.` : "–"}</span>
      <span className="min-w-0 flex-1 leading-tight break-words hyphens-auto">{e.me ? t("home.you") : e.name}</span>
      <span className="font-heading tabular-nums">{e.xp}</span>
    </div>
  );
}

/** Stand-in while the world chunk loads: the same box (the world's height depends only on the lesson count). */
function WorldMapSkeleton({ lessons }: { lessons: number }) {
  return (
    <div className="-mx-4 mt-2 md:mx-0" aria-hidden>
      <div
        className="mx-auto w-full max-w-[520px] animate-pulse rounded-t-[28px] bg-muted md:rounded-[28px]"
        style={{ aspectRatio: `${WORLD_WIDTH} / ${worldHeight(lessons)}` }}
      />
    </div>
  );
}
