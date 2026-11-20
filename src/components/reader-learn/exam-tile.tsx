import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { examLabel } from "@/lib/reader-learn";
import { SESSION } from "@shared/reader-session";
import { cn } from "@/lib/utils";

/** The exam countdown: days, the date, and the pull-forward line in the last three weeks. Render only with a date. */
export function ExamTile({ days, examDate, className }: { days: number; examDate: number; className?: string }) {
  const { t, i18n } = useTranslation();
  const label = examLabel(days);
  const date = new Date(examDate).toLocaleDateString(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Amsterdam",
  });
  const soon = days >= 0 && days <= SESSION.pullForwardDays;
  return (
    <Card className={cn("gap-3 px-5 py-5", className)}>
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold text-gold-foreground shadow-[0_3px_0_var(--gold-shade)]">
          {days > 1 ? (
            <span className="font-heading text-xl font-bold tabular-nums">{days}</span>
          ) : (
            <CalendarClock className="size-6" strokeWidth={2.4} aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-lg leading-tight font-semibold">{t(label.key, { n: label.n })}</h2>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{date}</p>
        </div>
      </div>
      {soon && <p className="text-sm leading-snug">{t("readerLearn.exam.pullForward")}</p>}
    </Card>
  );
}
