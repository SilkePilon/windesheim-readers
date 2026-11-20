import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EpisodeList } from "@/components/reader-learn/episode-list";
import { ExamTile } from "@/components/reader-learn/exam-tile";
import { ProgressTile } from "@/components/reader-learn/progress-tile";
import { TodayCard } from "@/components/reader-learn/today-card";
import type { ReaderLearn } from "@/lib/types";

/**
 * The body of `/reader/:id`, pure props (no fetching): header, today, exam, progress,
 * the concept map slot (when the map is ready) and the episodes.
 */
export function ReaderLearnView({ data, map }: { data: ReaderLearn; map?: ReactNode }) {
  const { t } = useTranslation();
  const exam = data.daysToExam !== null && data.reader.examDate !== null;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 md:px-8 md:py-8">
      <header className="flex items-center gap-3">
        <Button asChild variant="chunky-surface" size="icon-xl" className="[--press:3px]">
          <Link to="/" aria-label={t("readerLearn.back")}>
            <ChevronLeft strokeWidth={2.5} />
          </Link>
        </Button>
        <div className="min-w-0">
          <div className="text-sm leading-tight text-muted-foreground">{t("readerLearn.title")}</div>
          <h1 className="font-heading text-2xl leading-tight font-semibold text-pretty break-words hyphens-auto">{data.reader.title}</h1>
        </div>
      </header>

      <div className="mt-5 flex flex-col gap-5">
        <TodayCard data={data} />
        <div className="grid gap-5 md:grid-cols-2 md:items-start">
          {exam && <ExamTile days={data.daysToExam!} examDate={data.reader.examDate!} />}
          <ProgressTile data={data} className={exam ? undefined : "md:col-span-2"} />
        </div>
        {data.conceptMap && map}
        {data.episodes.length > 0 && <EpisodeList readerId={data.reader.id} episodes={data.episodes} />}
      </div>
    </div>
  );
}
