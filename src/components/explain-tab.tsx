import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Shuffle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { GradeCard } from "@/components/grade-card";
import { Notice } from "@/components/notice";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { useInvalidateProgress } from "@/lib/queries";
import type { GradeResult, LessonDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ExplainTab({ lesson }: { lesson: LessonDetail }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateProgress();
  const concepts = useMemo(() => [...lesson.terms.map((x) => x.term), ...lesson.keyPoints].slice(0, 40), [lesson]);
  const [concept, setConcept] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const pick = (c: string) => {
    setConcept(c);
    setGrade(null);
    setText("");
    setError(false);
  };

  const submit = async () => {
    if (!concept || text.trim().length < 20) return;
    setLoading(true);
    setError(false);
    try {
      const res = await api.post<GradeResult>(`/lessons/${lesson.id}/explain`, { concept, explanation: text });
      setGrade(res);
      celebrate(res, { quietXp: true });
      invalidate();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="gap-4 px-5 py-5">
        <div>
          <h2 className="font-heading text-lg font-semibold">{t("explain.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("explain.intro")}</p>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-bold">{t("explain.pick")}</span>
            <Button
              variant="chunky-surface"
              size="sm"
              className="h-8 rounded-[12px] bg-accent px-3 [--press:3px] dark:bg-secondary"
              onClick={() => pick(concepts[Math.floor(Math.random() * concepts.length)]!)}
              disabled={!concepts.length}
            >
              <Shuffle /> {t("explain.random")}
            </Button>
          </div>
          <div className="-mx-1 flex max-h-72 flex-wrap gap-2 overflow-y-auto px-1 pt-0.5 pb-1.5">
            {concepts.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => pick(c)}
                aria-pressed={concept === c}
                className={cn(
                  "max-w-full rounded-[14px] px-3 py-1.5 text-left break-words text-sm font-bold transition-[translate,box-shadow] duration-100 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-[3px] active:shadow-none motion-reduce:transition-none motion-reduce:active:translate-y-0",
                  concept === c
                    ? "bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-shade)]"
                    : "bg-accent text-foreground shadow-[0_3px_0_var(--chunky)] dark:bg-secondary",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {concept && (
        <Card className="gap-3 px-5 py-5">
          <h3 className="font-heading text-lg leading-snug font-semibold break-words">{concept}</h3>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("explain.placeholder", { concept })}
            className="min-h-36 rounded-[16px] text-base"
            disabled={loading}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {text.trim().length < 20 ? t("explain.minChars") : t("explain.words", { count: text.trim().split(/\s+/).length })}
            </span>
            <Button variant="chunky" size="xl" onClick={submit} disabled={loading || text.trim().length < 20}>
              {loading ? <Spinner /> : <Sparkles />} {loading ? t("explain.grading") : t("explain.submit")}
            </Button>
          </div>
          {error && <Notice variant="inset" title={t("explain.gradeFailed")} description={t("common.errorHint")} />}
        </Card>
      )}
      {grade && <GradeCard grade={grade} />}
    </div>
  );
}
