import { useTranslation } from "react-i18next";
import { ThumbsUp, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { GradeResult } from "@/lib/types";
import { cn } from "@/lib/utils";

/** AI grade for an explanation or open answer: a chunky score square, feedback and lists. */
export function GradeCard({ grade, className }: { grade: GradeResult; className?: string }) {
  const { t } = useTranslation();
  const tone =
    grade.score >= 70
      ? "bg-success text-success-foreground shadow-[0_4px_0_var(--success-shade)]"
      : grade.score >= 40
        ? "bg-hard text-gold-foreground shadow-[0_4px_0_var(--hard-shade)]"
        : "bg-danger text-danger-foreground shadow-[0_4px_0_var(--danger-shade)]";
  return (
    <Card className={cn("animate-pop gap-4 px-5 py-5 motion-reduce:animate-none", className)}>
      <div className="flex items-start gap-4">
        <div className={cn("grid size-16 shrink-0 place-items-center rounded-[18px] font-heading", tone)}>
          <span className="text-2xl leading-none font-bold tabular-nums">{grade.score}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-relaxed">{grade.feedback}</p>
          {grade.gained > 0 && (
            <div className="mt-1 font-heading text-sm font-semibold text-primary">+{grade.gained} XP</div>
          )}
        </div>
      </div>
      {grade.strengths.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 font-heading text-sm font-semibold text-success-shade dark:text-success">
            <ThumbsUp className="size-4" /> {t("explain.strengths")}
          </div>
          <ul className="list-disc space-y-0.5 pl-6 text-sm">{grade.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
      {grade.missing.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 font-heading text-sm font-semibold text-hard-shade dark:text-hard">
            <Lightbulb className="size-4" /> {t("explain.missing")}
          </div>
          <ul className="list-disc space-y-0.5 pl-6 text-sm">{grade.missing.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
      {grade.modelAnswer && (
        <details className="rounded-[16px] bg-accent p-3.5 text-sm dark:bg-secondary">
          <summary className="cursor-pointer font-heading font-semibold">{t("open.modelAnswer")}</summary>
          <p className="mt-2 leading-relaxed">{grade.modelAnswer}</p>
        </details>
      )}
    </Card>
  );
}
