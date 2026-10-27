import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MessageSquareText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { GradeCard } from "@/components/grade-card";
import { Notice } from "@/components/notice";
import { api } from "@/lib/api";
import { requestErrorText } from "@/lib/error-text";
import { CharCounter } from "@/components/char-counter";
import { LIMITS } from "@shared/limits";
import { celebrate } from "@/lib/celebrate";
import { useInvalidateProgress } from "@/lib/queries";
import type { GradeResult, PublicQuestion } from "@/lib/types";
import { dailyLimitFeature, useAiQuota } from "@/lib/ai-quota";
import { AiLimitNotice, AiQuotaHint } from "@/components/ai-quota";

/** The remaining counter only shows once it gets this low. */
const SHOW_REMAINING_AT = 5;

function OpenQuestion({ q, n }: { q: PublicQuestion; n: number }) {
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
      const res = await api.post<GradeResult>(`/questions/${q.id}/grade`, { answer: answer.trim() });
      setGrade(res);
      countUse();
      celebrate(res, { quietXp: true });
      invalidate();
    } catch (e) {
      // A used-up daily limit shows once for the whole tab (the reloaded quota says 0).
      if (!dailyLimitFeature(e)) setError(requestErrorText(e, t, t("common.errorHint")));
    } finally {
      setLoading(false);
      refresh();
    }
  };

  return (
    <div className="space-y-3">
      <Card className="gap-3 px-5 py-5">
        <div className="flex gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-danger font-heading text-base font-bold text-danger-foreground tabular-nums">
            {n}
          </span>
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

export function OpenTab({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const { quota } = useAiQuota("grade");
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["open", lessonId],
    queryFn: () => api.get<PublicQuestion[]>(`/lessons/${lessonId}/open`),
  });
  if (isLoading) return <div className="flex justify-center py-12"><Spinner className="size-6" /></div>;
  if (isError)
    return (
      <Notice
        title={t("common.error")}
        description={t("common.errorHint")}
        action={
          <Button variant="chunky" size="lg" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching && <Spinner />} {t("common.retry")}
          </Button>
        }
      />
    );
  if (!data?.length)
    return (
      <Card className="items-center gap-3 px-6 py-10 text-center">
        <div className="grid size-14 place-items-center rounded-[18px] bg-danger text-danger-foreground">
          <MessageSquareText className="size-7" />
        </div>
        <p className="font-heading text-lg font-semibold">{t("open.none")}</p>
      </Card>
    );
  return (
    <div className="space-y-5">
      {quota?.remaining === 0 && <AiLimitNotice feature="grade" />}
      <p className="text-sm text-muted-foreground">{t("open.intro")}</p>
      {data.map((q, i) => <OpenQuestion key={q.id} q={q} n={i + 1} />)}
    </div>
  );
}
