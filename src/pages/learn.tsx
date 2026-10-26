import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Page, PageHeader, PageSpinner } from "@/components/page";
import { MasteryRing } from "@/components/mastery-ring";
import { useReaders } from "@/lib/queries";
import type { LessonSummary } from "@/lib/types";

function groupByWeek(lessons: LessonSummary[]) {
  const map = new Map<number, LessonSummary[]>();
  for (const l of lessons) map.set(l.week, [...(map.get(l.week) ?? []), l]);
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

export default function LearnPage() {
  const { t } = useTranslation();
  const { data: readers, isLoading } = useReaders();
  if (isLoading) return <PageSpinner />;

  return (
    <Page>
      <PageHeader title={t("learn.title")} />
      {!readers?.length && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen />
            </EmptyMedia>
            <EmptyTitle>{t("home.noReaders")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      <div className="flex flex-col gap-10">
        {readers?.map((r) => {
          const avg = r.lessons.length ? r.lessons.reduce((a, l) => a + l.mastery, 0) / r.lessons.length : 0;
          return (
            <section key={r.id}>
              <div className="mb-4 flex items-center gap-3">
                <MasteryRing value={avg} size={52} stroke={5} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-heading text-lg font-semibold leading-tight">{r.title}</h2>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {r.course && <span>{r.course}</span>}
                    <span>{t("learn.lessonCount", { count: r.lessons.length })}</span>
                    {!r.published && <Badge variant="outline">{t("learn.notPublished")}</Badge>}
                  </div>
                </div>
              </div>
              {groupByWeek(r.lessons).map(([week, lessons]) => (
                <div key={week} className="mb-5">
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("common.week", { n: week })}</h3>
                  <div className="overflow-hidden rounded-xl border bg-card">
                    {lessons.map((l, i) => (
                      <Link
                        key={l.id}
                        to={`/lesson/${l.id}`}
                        className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 active:bg-muted ${i ? "border-t" : ""}`}
                      >
                        <MasteryRing value={l.mastery} size={40} />
                        <div className="min-w-0 flex-1">
                          <span className="mr-2 font-mono text-sm font-semibold text-primary">{l.code}</span>
                          <span className="text-sm font-medium">{l.title}</span>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </Page>
  );
}
