import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Bot, BookOpenText, Check, ChevronLeft, ChevronRight, Layers, ListChecks, MessageSquareText, Lightbulb, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Page, PageSpinner } from "@/components/page";
import { MasteryRing } from "@/components/mastery-ring";
import { Markdown } from "@/components/markdown";
import { FlashcardSession } from "@/components/flashcard-session";
import { Quiz } from "@/components/quiz";
import { ExplainTab } from "@/components/explain-tab";
import { OpenTab } from "@/components/open-tab";
import { TutorTab } from "@/components/tutor-tab";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { useInvalidateProgress, useLesson } from "@/lib/queries";
import type { LessonDetail, XpResult } from "@/lib/types";
import { XP } from "@shared/game";

const TABS = [
  { id: "summary", icon: BookOpenText },
  { id: "cards", icon: Layers },
  { id: "quiz", icon: ListChecks },
  { id: "explain", icon: Lightbulb },
  { id: "open", icon: MessageSquareText },
  { id: "tutor", icon: Bot },
] as const;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <MasteryRing value={value} size={40} />
      <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

function SummaryTab({ lesson }: { lesson: LessonDetail }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateProgress();
  const [filter, setFilter] = useState("");
  const [marking, setMarking] = useState(false);
  const terms = lesson.terms.filter(
    (x) => !filter || x.term.toLowerCase().includes(filter.toLowerCase()) || x.definition.toLowerCase().includes(filter.toLowerCase()),
  );

  const markRead = async () => {
    setMarking(true);
    try {
      celebrate(await api.post<XpResult>(`/lessons/${lesson.id}/read`));
      invalidate();
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="space-y-4">
      {lesson.keyPoints.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">{t("lesson.keyPoints")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {lesson.keyPoints.map((p) => (
                <li key={p} className="flex gap-2 text-[15px]">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {p}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {lesson.summary && (
        <Card>
          <CardContent>
            <Markdown>{lesson.summary}</Markdown>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="size-3.5" /> {t("lesson.sourcePages", { from: lesson.startPage, to: lesson.endPage })}
              </span>
              {lesson.progress.summaryRead ? (
                <Badge variant="secondary">
                  <Check /> {t("lesson.markedRead")}
                </Badge>
              ) : (
                <Button onClick={markRead} disabled={marking}>
                  {t("lesson.markRead")} <span className="opacity-70">+{XP.summaryRead} XP</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {lesson.terms.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">
              {t("lesson.terms")} <span className="font-normal text-muted-foreground">({lesson.terms.length})</span>
            </CardTitle>
            {lesson.terms.length > 8 && (
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="🔍" className="h-8 max-w-40" />
            )}
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {terms.map((x) => (
                <div key={x.term} className="py-2.5 first:pt-0 last:pb-0">
                  <dt className="font-semibold">{x.term}</dt>
                  <dd className="text-[15px] text-muted-foreground">{x.definition}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function LessonPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data: lesson, isLoading } = useLesson(id);
  const tab = params.get("tab") ?? "summary";

  if (isLoading || !lesson) return <PageSpinner />;
  const p = lesson.progress;

  return (
    <Page>
      <div className="mb-4 flex items-start gap-2">
        <Button variant="ghost" size="icon" asChild className="-ml-2 shrink-0">
          <Link to="/learn">
            <ChevronLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono font-semibold text-primary">{lesson.code}</span>
            <span className="truncate text-muted-foreground">{lesson.reader.title}</span>
          </div>
          <h1 className="font-heading text-xl leading-tight font-semibold tracking-tight md:text-2xl">{lesson.title}</h1>
        </div>
        <MasteryRing value={p.mastery} size={52} stroke={5} />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border bg-card p-3">
        <Stat label={t("lesson.quizBest")} value={p.bestQuiz} />
        <Stat label={t("lesson.cardsLearned")} value={p.cardMastery} />
        <Stat label={t("lesson.explainBest")} value={p.bestExplain} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <div className="-mx-4 mb-4 overflow-x-auto px-4 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          <TabsList className="w-max md:w-full">
            {TABS.map(({ id: tid, icon: Icon }) => (
              <TabsTrigger key={tid} value={tid} className="gap-1.5 px-3">
                <Icon className="size-4" /> {t(`lesson.tabs.${tid}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="summary">
          <SummaryTab lesson={lesson} />
        </TabsContent>
        <TabsContent value="cards">
          <FlashcardSession lessonId={lesson.id} />
        </TabsContent>
        <TabsContent value="quiz">
          <Quiz lessonId={lesson.id} available={lesson.quizCount} />
        </TabsContent>
        <TabsContent value="explain">
          <ExplainTab lesson={lesson} />
        </TabsContent>
        <TabsContent value="open">
          <OpenTab lessonId={lesson.id} />
        </TabsContent>
        <TabsContent value="tutor">
          <TutorTab lessonId={lesson.id} code={lesson.code} />
        </TabsContent>
      </Tabs>

      {tab === "summary" && (lesson.prev || lesson.next) && (
        <div className="mt-8 grid grid-cols-2 gap-3">
          {lesson.prev ? (
            <Button variant="outline" asChild className="h-auto justify-start py-3">
              <Link to={`/lesson/${lesson.prev.id}`}>
                <ChevronLeft />
                <span className="min-w-0 text-left">
                  <span className="block text-xs text-muted-foreground">{t("common.previous")}</span>
                  <span className="block truncate">{lesson.prev.code}</span>
                </span>
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {lesson.next && (
            <Button variant="outline" asChild className="h-auto justify-end py-3">
              <Link to={`/lesson/${lesson.next.id}`}>
                <span className="min-w-0 text-right">
                  <span className="block text-xs text-muted-foreground">{t("common.next")}</span>
                  <span className="block truncate">{lesson.next.code}</span>
                </span>
                <ChevronRight />
              </Link>
            </Button>
          )}
        </div>
      )}
    </Page>
  );
}
