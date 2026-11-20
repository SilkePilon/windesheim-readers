import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ChevronRight, CircleCheck, Flame, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isWeakLesson } from "@/lib/session-runner";
import type { ReaderSessionResult } from "@/lib/types";
import { cn } from "@/lib/utils";

/** An open question graded during the session: shown on its own, outside correct/total. */
export interface GradedOpen {
  id: string;
  prompt: string;
  code: string;
  score: number;
}

/** The end of a daily session: XP, quiz score, per-lesson rows (weak ones flagged), open answers and "Vandaag gedaan". */
export function SessionResultView({ readerId, result, open }: { readerId: string; result: ReaderSessionResult; open: GradedOpen[] }) {
  const { t } = useTranslation();
  const k = "readerLearn.session";
  const pct = result.total ? result.correct / result.total : 0;
  const tone = pct >= 0.8 ? "success" : pct >= 0.5 ? "hard" : "danger";

  return (
    <div className="flex flex-1 flex-col gap-5 pt-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-20 items-center justify-center rounded-[24px] bg-success text-success-foreground shadow-[0_6px_0_var(--success-shade)] [&_svg]:size-10">
          <CircleCheck strokeWidth={2.4} />
        </div>
        <h1 className="font-heading text-[26px] leading-tight font-bold text-balance">{t(`${k}.done`)}</h1>
        <p className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
          <Flame className="size-4 fill-current text-warning-shade dark:text-warning" aria-hidden />
          {t(`${k}.doneHint`, { count: result.dayStreak })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label={t(`${k}.xpLabel`)} value={`+${result.award?.gained ?? result.xp}`} className="text-primary" />
        <StatTile
          label={t(`${k}.scoreLabel`)}
          value={result.total ? `${result.correct}/${result.total}` : "–"}
          className={cn(
            result.total > 0 && tone === "success" && "text-success-shade dark:text-success",
            result.total > 0 && tone === "hard" && "text-hard-shade dark:text-hard",
            result.total > 0 && tone === "danger" && "text-danger-shade dark:text-danger",
          )}
        />
      </div>
      <p className="-mt-2 text-center text-sm font-bold text-muted-foreground">
        {result.total ? t(`${k}.score`, { correct: result.correct, total: result.total }) : t(`${k}.noQuestions`)}
      </p>

      {result.perLesson.length > 0 && (
        <Card className="gap-3 px-4">
          <h2 className="font-heading text-base font-semibold">{t(`${k}.perLesson`)}</h2>
          <ul className="flex flex-col gap-2">
            {result.perLesson.map((l) => {
              const weak = isWeakLesson(l);
              return (
                <li key={l.lessonId}>
                  <Link
                    to={`/lesson/${l.lessonId}`}
                    data-weak={weak}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-[14px] px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      weak ? "bg-[color-mix(in_oklab,var(--danger)_14%,var(--card))]" : "bg-accent/60",
                    )}
                  >
                    <span className="min-w-0 flex-1 font-heading text-[15px] font-semibold">{t(`${k}.lesson`, { code: l.code })}</span>
                    {weak && <span className="text-xs font-extrabold text-danger-shade dark:text-danger">{t(`${k}.practise`)}</span>}
                    <span
                      className={cn(
                        "font-heading text-sm font-semibold tabular-nums",
                        weak ? "text-danger-shade dark:text-danger" : "text-success-shade dark:text-success",
                      )}
                    >
                      {l.correct}/{l.total}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {open.length > 0 && (
        <Card className="gap-3 px-4">
          <div>
            <h2 className="flex items-center gap-1.5 font-heading text-base font-semibold">
              <Sparkles className="size-4 text-primary" aria-hidden /> {t(`${k}.openHeading`)}
            </h2>
            <p className="text-xs font-bold text-muted-foreground">{t(`${k}.openHint`)}</p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {open.map((o) => (
              <li key={o.id} className="flex items-start gap-3 text-sm">
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-[11px] font-heading text-sm font-bold tabular-nums",
                    o.score >= 70
                      ? "bg-success text-success-foreground"
                      : o.score >= 40
                        ? "bg-hard text-gold-foreground"
                        : "bg-danger text-danger-foreground",
                  )}
                >
                  {o.score}
                </span>
                <span className="min-w-0 flex-1 leading-snug break-words text-muted-foreground">
                  <span className="font-bold text-foreground">{t(`${k}.lesson`, { code: o.code })}</span> · {o.prompt}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-auto pt-2">
        <Button asChild variant="chunky" size="xl" className="w-full">
          <Link to={`/reader/${readerId}`}>{t(`${k}.backToReader`)}</Link>
        </Button>
      </div>
    </div>
  );
}

function StatTile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-[20px] bg-card px-3 py-3.5 text-center shadow-[0_5px_0_var(--chunky)]">
      <span className={cn("font-heading text-3xl leading-none font-bold tabular-nums", className)}>{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
