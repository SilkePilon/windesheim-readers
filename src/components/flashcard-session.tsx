import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PartyPopper, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StudyShell } from "@/components/shell/study-shell";
import { Notice } from "@/components/notice";
import { ReviewCard } from "@/components/study/review-card";
import { api } from "@/lib/api";
import { useInvalidateProgress } from "@/lib/queries";
import type { QueueCard, ReviewResult } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Full-screen flashcard session (lesson cards or the cross-lesson review). Tap or Space
 * flips the card; then rate with the 2×2 tiles, keys 1–4, or a swipe (right = good,
 * left = again). Cards rated "again" come back later in the same session.
 */
export function FlashcardSession({
  lessonId,
  onClose,
  doneLabel,
}: {
  lessonId?: string;
  onClose: () => void;
  /** Label of the button that leaves a finished or empty session. */
  doneLabel: string;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidateProgress();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["queue", lessonId ?? "all"],
    queryFn: () => api.get<QueueCard[]>(`/review/queue${lessonId ? `?lessonId=${lessonId}` : ""}`),
    staleTime: 0,
    gcTime: 0,
  });

  const [queue, setQueue] = useState<QueueCard[]>([]);
  const [done, setDone] = useState(0);
  const [initial, setInitial] = useState(0);

  const reset = useCallback((cards: QueueCard[]) => {
    setQueue(cards);
    setInitial(cards.length);
    setDone(0);
  }, []);

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  const card = queue[0];

  const onRated = useCallback(
    ({ result }: { rating: 1 | 2 | 3 | 4; result: ReviewResult }) => {
      if (!card) return;
      // "Again" (or anything due within 10 min) comes back later in this session.
      const soon = new Date(result.due).getTime() - Date.now() < 10 * 60_000;
      setQueue((q) => {
        const [, ...rest] = q;
        return soon ? [...rest, { ...card, isNew: false, intervals: result.intervals ?? card.intervals }] : rest;
      });
      if (!soon) setDone((d) => d + 1);
    },
    [card],
  );

  // When a session finishes, refresh XP/due counters.
  useEffect(() => {
    if (initial > 0 && queue.length === 0) invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, initial]);

  const progress = initial ? done / initial : 0;
  const counter = card && initial ? `${Math.min(done + 1, initial)} / ${initial}` : undefined;

  let body: ReactNode;
  if (isLoading) {
    body = (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-7 text-primary" />
      </div>
    );
  } else if (isError) {
    body = (
      <div className="flex flex-1 items-center justify-center py-10">
        <Notice
          className="w-full max-w-md"
          title={t("common.error")}
          description={t("common.errorHint")}
          action={
            <Button variant="chunky" size="lg" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching && <Spinner />} {t("common.retry")}
            </Button>
          }
        />
      </div>
    );
  } else if (!card) {
    const finished = initial > 0;
    body = (
      <EndMessage
        icon={finished ? <PartyPopper /> : <Sparkles />}
        title={finished ? t("cards.sessionDone") : t("cards.noneDue")}
        text={finished ? t("cards.sessionDoneText", { n: done }) : t("cards.noneDueText")}
        tone={finished ? "success" : "primary"}
      >
        <Button variant="chunky" size="xl" className="w-full" onClick={onClose}>
          {doneLabel}
        </Button>
        {lessonId && (
          <Button
            variant="chunky-surface"
            size="xl"
            className="w-full"
            disabled={isFetching}
            onClick={async () => {
              const r = await refetch();
              if (r.data) reset(r.data);
            }}
          >
            {isFetching ? <Spinner /> : <RotateCcw />} {t("cards.moreCards")}
          </Button>
        )}
      </EndMessage>
    );
  } else {
    body = (
      <ReviewCard key={card.id} card={card} onRated={onRated} />
    );
  }

  return (
    <StudyShell onClose={onClose} progress={progress} counter={counter}>
      {body}
    </StudyShell>
  );
}

function EndMessage({
  icon,
  title,
  text,
  tone = "primary",
  children,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  tone?: "primary" | "success";
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
      <div
        className={cn(
          "flex size-20 items-center justify-center rounded-[24px] [&_svg]:size-10",
          tone === "success"
            ? "bg-success text-success-foreground shadow-[0_6px_0_var(--success-shade)]"
            : "bg-primary text-primary-foreground shadow-[0_6px_0_var(--primary-shade)]",
        )}
      >
        {icon}
      </div>
      <h1 className="font-heading text-[26px] leading-tight font-bold text-balance">{title}</h1>
      {text && <p className="text-muted-foreground">{text}</p>}
      <div className="mt-2 flex w-full flex-col gap-3">{children}</div>
    </div>
  );
}
