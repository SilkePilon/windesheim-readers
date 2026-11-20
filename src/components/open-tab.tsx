import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Notice } from "@/components/notice";
import { api } from "@/lib/api";
import type { PublicQuestion } from "@/lib/types";
import { useAiQuota } from "@/lib/ai-quota";
import { AiLimitNotice } from "@/components/ai-quota";
import { OpenQuestion } from "@/components/study/open-question";

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
      {data.map((q, i) => <OpenQuestion key={q.id} question={q} n={i + 1} />)}
    </div>
  );
}
