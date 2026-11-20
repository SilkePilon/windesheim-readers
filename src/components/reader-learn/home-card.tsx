import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { CalendarClock, Check, ChevronRight, Play } from "lucide-react";
import { MasteryBar } from "@/components/reader-learn/progress-tile";
import { examLabel } from "@/lib/reader-learn";
import type { ReaderLearn } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Home: "De hele reader leren" for the selected reader, opening `/reader/:id`. Pure props. */
export function ReaderHomeCard({ data, className }: { data: ReaderLearn; className?: string }) {
  const { t } = useTranslation();
  const exam = examLabel(data.daysToExam);
  const today = data.needsStart
    ? t("readerLearn.today.needsStart")
    : data.today.done
      ? t("readerLearn.today.done")
      : t("readerLearn.today.homeLine", { n: data.estimate.minutes });
  return (
    <Link
      to={`/reader/${data.reader.id}`}
      className={cn(
        "flex flex-col gap-2.5 rounded-[24px] bg-card px-4 py-3.5 text-card-foreground shadow-[0_4px_0_var(--chunky)] outline-none",
        "transition-[translate,box-shadow] duration-100 focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-[4px] active:shadow-none",
        "motion-reduce:transition-none motion-reduce:active:translate-y-0 motion-reduce:active:shadow-[0_4px_0_var(--chunky)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-base font-semibold">{t("readerLearn.title")}</h2>
        <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground">
          <CalendarClock className="size-3.5" aria-hidden /> {t(exam.key, { n: exam.n })}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-[10px]",
            data.today.done && !data.needsStart
              ? "bg-success text-success-foreground"
              : "bg-primary text-primary-foreground shadow-[0_2px_0_var(--primary-shade)]",
          )}
        >
          {data.today.done && !data.needsStart ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Play className="ml-px size-4 fill-current" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1 truncate font-heading text-[15px] font-semibold">{today}</span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" strokeWidth={2.5} aria-hidden />
      </div>
      <MasteryBar value={data.progress.mastery} label={t("readerLearn.progress.mastery")} className="h-2" />
    </Link>
  );
}

/** Same footprint while the overview loads, so the map below doesn't jump. */
export function ReaderHomeCardSkeleton() {
  return <div aria-hidden className="h-[112px] animate-pulse rounded-[24px] bg-muted" />;
}
