import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, BookOpen, Flame, Repeat, Swords, Target, Trophy, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Page, PageSpinner } from "@/components/page";
import { MasteryRing } from "@/components/mastery-ring";
import { useMe, useReaders } from "@/lib/queries";
import { BADGES, DAILY_XP_GOAL, levelTitle } from "@shared/game";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const { data: readers, isLoading } = useReaders();
  if (!me || isLoading) return <PageSpinner />;

  const s = me.stats;
  const lessons = (readers ?? []).flatMap((r) => r.lessons);
  // Next lesson: first one (in reader order) that isn't mastered yet, preferring ones already started.
  const started = lessons.filter((l) => l.mastery > 0 && l.mastery < 0.9);
  const suggestions = [...started, ...lessons.filter((l) => l.mastery === 0)].slice(0, 3);
  const goalPct = Math.min(1, s.todayXp / DAILY_XP_GOAL);

  return (
    <Page>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">
          {t("home.greeting", { name: me.user.displayName })}
        </h1>
        <p className="text-muted-foreground">
          {t("common.level", { n: s.level })} · {levelTitle(s.level)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="flex items-center gap-4">
            <MasteryRing value={goalPct} size={64} stroke={6}>
              <Target className="size-5 text-primary" />
            </MasteryRing>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-muted-foreground">{t("home.dailyGoal")}</div>
              <div className="text-xl font-semibold tabular-nums">
                {s.todayXp} / {DAILY_XP_GOAL} XP
              </div>
              {goalPct >= 1 && <div className="text-sm font-medium text-emerald-600">{t("home.dailyGoalDone")}</div>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Flame className={cn("size-4", s.activeToday ? "text-orange-500" : "")} /> {t("home.streak")}
            </div>
            <div className="mt-1 text-xl font-semibold">{t("home.streakDays", { count: s.streak })}</div>
            {!s.activeToday && <div className="mt-1 text-xs text-muted-foreground">{t("home.streakKeep")}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Trophy className="size-4 text-amber-500" /> {t("home.weekXp")}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{t("common.xp", { n: s.weekXp })}</div>
            <Link to="/leaderboard" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
              {t("nav.leaderboard")} <ArrowRight className="size-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Review CTA */}
      <Card className={cn("mt-4", s.due > 0 && "border-primary/40 bg-primary/5")}>
        <CardContent className="flex items-center gap-4">
          <div className="rounded-xl bg-primary/15 p-3 text-primary">
            <Repeat className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{s.due > 0 ? t("home.dueCards", { count: s.due }) : t("home.noDue")}</div>
            <div className="text-sm text-muted-foreground">{t("review.subtitle")}</div>
          </div>
          {s.due > 0 && (
            <Button asChild>
              <Link to="/review">{t("home.startReview")}</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Continue learning */}
      <h2 className="mt-8 mb-3 font-heading text-lg font-semibold">{t("home.suggested")}</h2>
      {lessons.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">{me.user.role === "admin" ? <Upload /> : <BookOpen />}</EmptyMedia>
            <EmptyTitle>{t("home.noReaders")}</EmptyTitle>
            {me.user.role === "admin" && (
              <EmptyDescription>
                <Link to="/admin">{t("home.noReadersAdmin")}</Link>
              </EmptyDescription>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {suggestions.map((l) => (
            <Link key={l.id} to={`/lesson/${l.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="flex items-center gap-3">
                  <MasteryRing value={l.mastery} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-primary">{l.code}</div>
                    <div className="line-clamp-2 text-sm font-medium">{l.title}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" asChild className="h-14">
          <Link to="/learn">
            <BookOpen /> {t("nav.learn")}
          </Link>
        </Button>
        <Button variant="outline" size="lg" asChild className="h-14">
          <Link to="/battle">
            <Swords /> {t("battle.title")}
          </Link>
        </Button>
      </div>

      {/* Level + badges */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{t("common.level", { n: s.level })}</span>
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              {s.intoLevel} / {s.levelSize} XP
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={s.progress * 100} className="h-3" />
          {me.badges.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {me.badges.slice(0, 8).map((b) => (
                <span key={b.id} title={t(`badges.${b.id}.desc`)} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
                  {BADGES[b.id]?.icon} {t(`badges.${b.id}.name`)}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
