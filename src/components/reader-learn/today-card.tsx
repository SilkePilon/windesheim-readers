import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { BookOpen, Check, ChevronRight, Play, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { estimateParts } from "@/lib/reader-learn";
import type { ReaderLearn } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "12 kaarten · 8 vragen · 1 uitleg · ~14 min"; empty when nothing is planned. */
export function useEstimateLine(e: ReaderLearn["estimate"]) {
  const { t } = useTranslation();
  const parts = estimateParts(e).map((p) => t(p.key, { count: p.n }));
  if (!parts.length) return "";
  return [...parts, t("readerLearn.estimate.minutes", { n: e.minutes })].join(" · ");
}

/** Today's session: start it, the calm "done" state with an extra round, or "start a lesson first". */
export function TodayCard({ data, className }: { data: ReaderLearn; className?: string }) {
  const { t } = useTranslation();
  const estimate = useEstimateLine(data.estimate);
  const session = `/reader/${data.reader.id}/session`;

  if (data.needsStart)
    return (
      <Card className={cn("items-start gap-3 px-5 py-5", className)}>
        <span className="grid size-12 place-items-center rounded-2xl bg-info text-white shadow-[0_3px_0_var(--info-shade)]">
          <BookOpen className="size-6" strokeWidth={2.4} aria-hidden />
        </span>
        <h2 className="font-heading text-xl leading-tight font-semibold">{t("readerLearn.today.needsStart")}</h2>
        <p className="text-[15px] leading-snug text-muted-foreground">{t("readerLearn.today.needsStartHint")}</p>
        <Button asChild variant="chunky" size="xl" className="mt-1 w-full sm:w-auto">
          <Link to={data.currentLessonId ? `/lesson/${data.currentLessonId}` : "/"}>
            {t("readerLearn.today.toLesson")}
            <ChevronRight strokeWidth={2.5} />
          </Link>
        </Button>
      </Card>
    );

  if (data.today.done)
    return (
      <Card className={cn("gap-3 px-5 py-5", className)}>
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-success text-success-foreground shadow-[0_3px_0_var(--success-shade)]">
            <Check className="size-7" strokeWidth={3} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-xl leading-tight font-semibold">{t("readerLearn.today.done")}</h2>
            <p className="text-sm text-muted-foreground">{t("readerLearn.today.doneHint", { xp: data.today.xp })}</p>
          </div>
        </div>
        <Button asChild variant="chunky-surface" size="xl" className="w-full">
          <Link to={session}>
            <RotateCw strokeWidth={2.5} />
            {t("readerLearn.today.extra")}
          </Link>
        </Button>
        <p className="text-center text-xs font-semibold text-muted-foreground">{t("readerLearn.today.extraHint")}</p>
      </Card>
    );

  return (
    <Card className={cn("gap-3 px-5 py-5", className)}>
      <h2 className="font-heading text-lg font-semibold">{t("readerLearn.today.heading")}</h2>
      <Button asChild variant="chunky" size="xl" className="h-16 w-full rounded-[20px] text-lg [--press:6px]">
        <Link to={session}>
          <Play className="fill-current" strokeWidth={2.4} />
          {t("readerLearn.today.start")}
          <ChevronRight strokeWidth={2.5} className="ml-auto" />
        </Link>
      </Button>
      <p className="text-center text-sm font-semibold text-muted-foreground tabular-nums">{estimate || t("readerLearn.today.nothing")}</p>
    </Card>
  );
}
