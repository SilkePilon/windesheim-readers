import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MessageSquareText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { GradeCard } from "@/components/grade-card";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { useInvalidateProgress } from "@/lib/queries";
import type { GradeResult, PublicQuestion } from "@/lib/types";

function OpenQuestion({ q, n }: { q: PublicQuestion; n: number }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateProgress();
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const res = await api.post<GradeResult>(`/questions/${q.id}/grade`, { answer });
      setGrade(res);
      celebrate(res, { quietXp: true });
      invalidate();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <span className="font-semibold text-primary">{n}.</span>
          <p className="font-medium">{q.prompt}</p>
        </div>
        <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t("open.placeholder")} className="min-h-28 text-base" disabled={loading} />
        <div className="flex justify-end">
          <Button onClick={submit} disabled={loading || answer.trim().length < 3}>
            {loading ? <Spinner /> : <Sparkles />} {t("open.submit")}
          </Button>
        </div>
        {grade && <GradeCard grade={grade} />}
      </CardContent>
    </Card>
  );
}

export function OpenTab({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({ queryKey: ["open", lessonId], queryFn: () => api.get<PublicQuestion[]>(`/lessons/${lessonId}/open`) });
  if (isLoading) return <div className="flex justify-center py-12"><Spinner className="size-6" /></div>;
  if (!data?.length)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><MessageSquareText /></EmptyMedia>
          <EmptyTitle>{t("open.none")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("open.intro")}</p>
      {data.map((q, i) => <OpenQuestion key={q.id} q={q} n={i + 1} />)}
    </div>
  );
}
