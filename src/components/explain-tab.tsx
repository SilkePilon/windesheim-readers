import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Shuffle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { GradeCard } from "@/components/grade-card";
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
  const [error, setError] = useState<string | null>(null);

  const pick = (c: string) => {
    setConcept(c);
    setGrade(null);
    setText("");
    setError(null);
  };

  const submit = async () => {
    if (!concept || text.trim().length < 20) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<GradeResult>(`/lessons/${lesson.id}/explain`, { concept, explanation: text });
      setGrade(res);
      celebrate(res, { quietXp: true });
      invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("explain.title")}</CardTitle>
          <CardDescription>{t("explain.intro")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{t("explain.pick")}</span>
            <Button variant="ghost" size="sm" onClick={() => pick(concepts[Math.floor(Math.random() * concepts.length)]!)}>
              <Shuffle /> {t("explain.random")}
            </Button>
          </div>
          <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
            {concepts.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => pick(c)}
                className={cn(
                  "max-w-full truncate rounded-full border px-3 py-1.5 text-left text-sm transition-colors",
                  concept === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {concept && (
        <Card>
          <CardContent className="space-y-3">
            <div className="font-semibold">{concept}</div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("explain.placeholder", { concept })}
              className="min-h-36 text-base"
              disabled={loading}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{text.trim().length < 20 ? t("explain.minChars") : `${text.trim().split(/\s+/).length} words`}</span>
              <Button onClick={submit} disabled={loading || text.trim().length < 20}>
                {loading ? <Spinner /> : <Sparkles />} {loading ? t("explain.grading") : t("explain.submit")}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}
      {grade && <GradeCard grade={grade} />}
    </div>
  );
}
