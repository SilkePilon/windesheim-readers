import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PartyPopper, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { useInvalidateProgress } from "@/lib/queries";
import type { QueueCard, XpResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const RATINGS = [
  { value: 1, key: "cards.again", className: "bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400" },
  { value: 2, key: "cards.hard", className: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400" },
  { value: 3, key: "cards.good", className: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400" },
  { value: 4, key: "cards.easy", className: "bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-400" },
] as const;

export function FlashcardSession({ lessonId, showLessonCode }: { lessonId?: string; showLessonCode?: boolean }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateProgress();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["queue", lessonId ?? "all"],
    queryFn: () => api.get<QueueCard[]>(`/review/queue${lessonId ? `?lessonId=${lessonId}` : ""}`),
    staleTime: 0,
    gcTime: 0,
  });

  const [queue, setQueue] = useState<QueueCard[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [initial, setInitial] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setQueue(data);
      setInitial(data.length);
      setDone(0);
      setFlipped(false);
    }
  }, [data]);

  const card = queue[0];

  const rate = useCallback(
    async (rating: number) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        const res = await api.post<XpResult & { due: string }>("/review", { flashcardId: card.id, rating });
        celebrate(res, { quietXp: true });
        setFlipped(false);
        // "Again" (or anything due within 10 min) comes back later in this session.
        const soon = new Date(res.due).getTime() - Date.now() < 10 * 60_000;
        setQueue((q) => {
          const [, ...rest] = q;
          return soon ? [...rest, { ...card, isNew: false }] : rest;
        });
        if (!soon) setDone((d) => d + 1);
      } finally {
        setBusy(false);
      }
    },
    [card, busy],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) void rate(Number(e.key));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, rate]);

  // When a session finishes, refresh XP/due counters.
  useEffect(() => {
    if (initial > 0 && queue.length === 0) invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, initial]);

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );

  if (!card) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">{initial > 0 ? <PartyPopper /> : <Sparkles />}</EmptyMedia>
          <EmptyTitle>{initial > 0 ? t("cards.sessionDone") : t("cards.noneDue")}</EmptyTitle>
          <EmptyDescription>{initial > 0 ? t("cards.sessionDoneText", { n: done }) : t("cards.noneDueText")}</EmptyDescription>
        </EmptyHeader>
        {lessonId && (
          <EmptyContent>
            <Button variant="outline" onClick={() => refetch()}>
              <RotateCcw /> {t("common.retry")}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Progress value={initial ? (done / initial) * 100 : 0} className="h-2 flex-1" />
        <span className="tabular-nums">{t("cards.remaining", { n: queue.length })}</span>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="flip block h-[min(55dvh,360px)] w-full text-left outline-none"
        aria-label={t("cards.tapToFlip")}
      >
        <div className={cn("flip-inner relative size-full", flipped && "flipped")}>
          {[
            { face: "front", text: card.front },
            { face: "back", text: card.back },
          ].map(({ face, text }) => (
            <div
              key={face}
              className={cn(
                "flip-face absolute inset-0 flex flex-col rounded-2xl border p-6 shadow-sm",
                face === "back" ? "flip-back bg-primary/5 border-primary/30" : "bg-card",
              )}
            >
              <div className="flex items-center gap-2">
                {showLessonCode && <Badge variant="secondary">{card.lessonCode}</Badge>}
                {card.isNew && face === "front" && <Badge>{t("cards.newCard")}</Badge>}
              </div>
              <div className="flex flex-1 items-center justify-center overflow-y-auto py-4 text-center">
                <p className={cn("leading-relaxed", face === "front" ? "text-xl font-semibold md:text-2xl" : "text-base md:text-lg")}>{text}</p>
              </div>
              {face === "front" && <p className="text-center text-xs text-muted-foreground">{t("cards.tapToFlip")}</p>}
            </div>
          ))}
        </div>
      </button>

      <div className={cn("grid grid-cols-4 gap-2 transition-opacity", flipped ? "opacity-100" : "pointer-events-none opacity-0")}>
        {RATINGS.map((r) => (
          <Button
            key={r.value}
            variant="ghost"
            disabled={busy}
            onClick={() => rate(r.value)}
            className={cn("h-14 flex-col gap-0.5 rounded-xl text-sm font-semibold", r.className)}
          >
            {t(r.key)}
            <span className="hidden text-[10px] font-normal opacity-60 md:block">{r.value}</span>
          </Button>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">{t("cards.howItWorks")}</p>
    </div>
  );
}
