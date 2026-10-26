import { useTranslation } from "react-i18next";
import { ThumbsUp, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MasteryRing } from "@/components/mastery-ring";
import type { GradeResult } from "@/lib/types";

export function GradeCard({ grade }: { grade: GradeResult }) {
  const { t } = useTranslation();
  return (
    <Card className="animate-pop">
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <MasteryRing value={grade.score / 100} size={64} stroke={6}>
            <span className="text-base font-bold">{grade.score}</span>
          </MasteryRing>
          <div className="flex-1">
            <p className="text-[15px] leading-relaxed">{grade.feedback}</p>
            {grade.gained > 0 && <div className="mt-1 text-sm font-semibold text-primary">+{grade.gained} XP</div>}
          </div>
        </div>
        {grade.strengths.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
              <ThumbsUp className="size-4" /> {t("explain.strengths")}
            </div>
            <ul className="list-disc space-y-0.5 pl-6 text-sm">{grade.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
        {grade.missing.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-amber-600">
              <Lightbulb className="size-4" /> {t("explain.missing")}
            </div>
            <ul className="list-disc space-y-0.5 pl-6 text-sm">{grade.missing.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
        {grade.modelAnswer && (
          <details className="rounded-lg bg-muted p-3 text-sm">
            <summary className="cursor-pointer font-semibold">{t("open.modelAnswer")}</summary>
            <p className="mt-2 leading-relaxed">{grade.modelAnswer}</p>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
