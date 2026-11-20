import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Flame, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ReaderLearn } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A thin chunky mastery bar (0..1), shared by the page and the home card. */
export function MasteryBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-3 overflow-hidden rounded-[8px] bg-track", className)}
    >
      <div className="h-full rounded-[8px] bg-success shadow-[inset_0_-3px_0_var(--success-shade)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Reader mastery, cards due, the session-day streak and up to three weak lessons. */
export function ProgressTile({ data, className }: { data: ReaderLearn; className?: string }) {
  const { t } = useTranslation();
  const p = data.progress;
  return (
    <Card className={cn("gap-3 px-5 py-5", className)}>
      <h2 className="font-heading text-lg font-semibold">{t("readerLearn.progress.heading")}</h2>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-bold">{t("readerLearn.progress.mastered", { n: p.masteredLessons, total: p.totalLessons })}</span>
        <span className="font-heading text-sm font-semibold text-muted-foreground tabular-nums">{Math.round(p.mastery * 100)}%</span>
      </div>
      <MasteryBar value={p.mastery} label={t("readerLearn.progress.mastery")} />
      <div className="mt-1 flex flex-wrap gap-2 text-sm font-bold">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-2.5 py-1.5">
          <Layers className="size-4 text-primary" aria-hidden /> {t("readerLearn.progress.due", { count: data.due })}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-2.5 py-1.5">
          <Flame className={cn("size-4 text-warning-shade dark:text-warning", data.today.done && "fill-current")} aria-hidden />
          {t("readerLearn.progress.streak", { count: data.sessionDayStreak })}
        </span>
      </div>
      {data.weakLessons.length > 0 && (
        <div className="mt-1">
          <h3 className="mb-2 font-heading text-sm font-semibold text-muted-foreground">{t("readerLearn.progress.weak")}</h3>
          <ul className="flex flex-wrap gap-2">
            {data.weakLessons.map((l) => (
              <li key={l.id} className="min-w-0 max-w-full">
                <Link
                  to={`/lesson/${l.id}`}
                  className="flex min-w-0 items-center gap-1.5 rounded-[12px] bg-card px-3 py-1.5 text-sm font-bold shadow-[0_3px_0_var(--chunky)] ring-1 ring-border transition-[translate,box-shadow] duration-100 hover:text-primary active:translate-y-[3px] active:shadow-none motion-reduce:transition-none motion-reduce:active:translate-y-0"
                >
                  <span className="font-heading text-primary">{l.code}</span>
                  <span className="truncate">{l.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
