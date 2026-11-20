import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Check, Headphones, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatClock } from "@/lib/listen";
import { durationMinutes, episodeDone, episodeResume } from "@/lib/reader-learn";
import type { ReaderLearn } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "Afleveringen": one row per ready week, with a play tile and the resume progress. Render only with episodes. */
export function EpisodeList({ readerId, episodes, className }: { readerId: string; episodes: ReaderLearn["episodes"]; className?: string }) {
  const { t } = useTranslation();
  return (
    <Card className={cn("gap-2 px-3 py-4 sm:px-4", className)}>
      <h2 className="flex items-center gap-2 px-2 font-heading text-lg font-semibold">
        <Headphones className="size-5 text-[#c43fe0]" aria-hidden /> {t("readerLearn.episodes.heading")}
      </h2>
      <ul className="flex flex-col">
        {episodes.map((ep) => {
          const done = episodeDone(ep);
          const resume = episodeResume(ep);
          const meta = [t("readerLearn.episodes.minutes", { n: durationMinutes(ep.durationSec) })];
          if (resume > 0) meta.push(t("readerLearn.episodes.resume", { time: formatClock(ep.positionMs) }));
          if (done) meta.push(t("readerLearn.episodes.done"));
          return (
            <li key={ep.week}>
              <Link
                to={`/reader/${readerId}/episode/${ep.week}`}
                className="flex items-center gap-3 rounded-[16px] px-2 py-2.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-full text-white",
                    done ? "bg-success text-success-foreground" : "bg-[#c43fe0] shadow-[0_3px_0_#9a2bb3]",
                  )}
                >
                  {done ? <Check className="size-5" strokeWidth={3} aria-hidden /> : <Play className="ml-0.5 size-5 fill-current" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-tight font-bold break-words">
                    <span className="font-heading text-muted-foreground">{t("readerLearn.episodes.week", { week: ep.week })}</span> · {ep.title}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-muted-foreground tabular-nums">{meta.join(" · ")}</span>
                  {resume > 0 && (
                    <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-track">
                      <span className="block h-full rounded-full bg-[#c43fe0]" style={{ width: `${Math.round(resume * 100)}%` }} />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
