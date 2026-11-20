import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { GradeCard } from "@/components/grade-card";
import { Notice } from "@/components/notice";
import { ApiError, api } from "@/lib/api";
import { requestErrorText } from "@/lib/error-text";
import { CharCounter } from "@/components/char-counter";
import { LIMITS } from "@shared/limits";
import { celebrate } from "@/lib/celebrate";
import { useInvalidateProgress } from "@/lib/queries";
import type { GradeResult, PublicQuestion } from "@/lib/types";
import { dailyLimitFeature, useAiQuota } from "@/lib/ai-quota";
import { AiQuotaHint } from "@/components/ai-quota";

/** The remaining counter only shows once it gets this low. */
const SHOW_REMAINING_AT = 5;

/**
 * One open question: answer box, AI grading, result and model answer. `n` shows a numbered
 * badge (the lesson tab); `sessionId` ties the grade to a reader session.
 */
export function OpenQuestion({
  question: q,
  n,
  sessionId,
  onGraded,
  onError,
}: {
  question: PublicQuestion;
  n?: number;
  sessionId?: string;
  onGraded?: (g: GradeResult) => void;
  /** Called with the API error code when grading fails (e.g. `NO_SESSION` for an expired session). */
  onError?: (code: string) => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidateProgress();
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { quota, countUse, refresh } = useAiQuota("grade");
  const limitReached = quota?.remaining === 0;

  const submit = async () => {
    if (limitReached) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<GradeResult>(`/questions/${q.id}/grade`, { answer: answer.trim(), ...(sessionId ? { sessionId } : {}) });
      setGrade(res);
      countUse();
      celebrate(res, { quietXp: true });
      invalidate();
      onGraded?.(res);
    } catch (e) {
      // A used-up daily limit shows once for the whole tab (the reloaded quota says 0).
      if (!dailyLimitFeature(e)) setError(requestErrorText(e, t, t("common.errorHint")));
      if (e instanceof ApiError) onError?.(e.code);
    } finally {
      setLoading(false);
      refresh();
    }
  };

  return (
    <div className="space-y-3">
      <Card className="gap-3 px-5 py-5">
        <div className="flex gap-3">
          {n !== undefined && (
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-danger font-heading text-base font-bold text-danger-foreground tabular-nums">
              {n}
            </span>
          )}
          <p className="min-w-0 pt-1 font-bold break-words">{q.prompt}</p>
        </div>
        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          maxLength={LIMITS.openAnswer.max}
          placeholder={t("open.placeholder")}
          className="min-h-28 rounded-[16px] text-base"
          disabled={loading}
        />
        <div className="flex items-center justify-end gap-3">
          <AiQuotaHint feature="grade" quota={quota} showAt={SHOW_REMAINING_AT} className="mr-auto" />
          <CharCounter value={answer} max={LIMITS.openAnswer.max} />
          <Button variant="chunky" size="xl" onClick={submit} disabled={loading || limitReached || answer.trim().length < LIMITS.openAnswer.min}>
            {loading ? <Spinner /> : <Sparkles />} {t("open.submit")}
          </Button>
        </div>
        {error && <Notice variant="inset" title={t("open.gradeFailed")} description={error} />}
      </Card>
      {grade && <GradeCard grade={grade} />}
    </div>
  );
}
