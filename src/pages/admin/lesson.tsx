import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, ChevronLeft, ExternalLink, Eye, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageSpinner } from "@/components/page";
import { Pill } from "@/components/admin/status-pill";
import { Markdown } from "@/components/markdown";
import { api } from "@/lib/api";

interface QuestionRow {
  id: string;
  type: string;
  prompt: string;
  difficulty: number;
  data: Record<string, unknown> & { options?: string[]; answer?: unknown; answers?: string[]; items?: string[]; explanation?: string; modelAnswer?: string };
}
interface LessonFull {
  id: string;
  readerId: string;
  code: string;
  title: string;
  summary: string | null;
  terms: { id: string; term: string; definition: string }[];
  flashcards: { id: string; front: string; back: string }[];
  questions: QuestionRow[];
}

function answerText(q: QuestionRow) {
  const d = q.data;
  if (q.type === "mc") return d.options?.[d.answer as number];
  if (q.type === "tf") return String(d.answer);
  if (q.type === "fill") return d.answers?.join(" / ");
  if (q.type === "order") return d.items?.join(" → ");
  return d.modelAnswer;
}

function FlashcardRow({ card, onChange }: { card: { id: string; front: string; back: string }; onChange: () => void }) {
  const { t } = useTranslation();
  const [edit, setEdit] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  if (edit)
    return (
      <div className="space-y-2 py-3">
        <Textarea value={front} onChange={(e) => setFront(e.target.value)} className="min-h-12" />
        <Textarea value={back} onChange={(e) => setBack(e.target.value)} className="min-h-12" />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="flat" onClick={() => setEdit(false)} aria-label={t("common.cancel")}>
            <X />
          </Button>
          <Button
            size="sm"
            variant="chunky"
            aria-label={t("common.save")}
            onClick={async () => {
              await api.patch(`/admin/flashcards/${card.id}`, { front, back });
              setEdit(false);
              onChange();
            }}
          >
            <Check />
          </Button>
        </div>
      </div>
    );
  return (
    <div className="flex items-start gap-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-bold">{card.front}</div>
        <div className="text-muted-foreground">{card.back}</div>
      </div>
      <Button size="icon" variant="ghost" onClick={() => setEdit(true)} aria-label={t("common.edit")}>
        <Pencil />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={t("common.delete")}
        onClick={async () => {
          await api.del(`/admin/flashcards/${card.id}`);
          onChange();
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

export default function AdminLessonPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["admin", "lesson", id], queryFn: () => api.get<LessonFull>(`/admin/lessons/${id}`) });
  const [summary, setSummary] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (data) setSummary(data.summary ?? "");
  }, [data]);

  if (isLoading || !data) return <PageSpinner />;
  const del = async (path: string) => {
    await api.del(path);
    await refetch();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-2">
          <Button variant="ghost" size="icon" asChild className="-ml-2 shrink-0">
            <Link to={`/admin/readers/${data.readerId}`} aria-label={t("common.back")}>
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-0 truncate font-heading text-xl font-semibold">
            <span className="text-primary">{data.code}</span> {data.title}
          </h2>
        </div>
        <Button variant="flat" asChild>
          <Link to={`/lesson/${data.id}`}>
            <ExternalLink /> {t("admin.viewAsStudent")}
          </Link>
        </Button>
      </div>
      <Tabs defaultValue="summary">
        <TabsList className="mb-2 max-w-full justify-start overflow-x-auto [&>*]:flex-none">
          <TabsTrigger value="summary">{t("lesson.tabs.summary")}</TabsTrigger>
          <TabsTrigger value="cards">
            {t("admin.flashcards")} ({data.flashcards.length})
          </TabsTrigger>
          <TabsTrigger value="questions">
            {t("admin.questions")} ({data.questions.length})
          </TabsTrigger>
          <TabsTrigger value="terms">
            {t("admin.terms")} ({data.terms.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card variant="flat">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-end gap-2">
                <Button variant="flat" size="sm" onClick={() => setPreview(!preview)}>
                  {preview ? <Pencil /> : <Eye />} {preview ? t("common.edit") : t("admin.preview")}
                </Button>
                <Button
                  size="sm"
                  variant="chunky"
                  disabled={summary === (data.summary ?? "")}
                  onClick={async () => {
                    await api.patch(`/admin/lessons/${id}`, { summary });
                    await refetch();
                    toast.success(t("common.saved"));
                  }}
                >
                  {t("common.save")}
                </Button>
              </div>
              {preview ? (
                <Markdown>{summary}</Markdown>
              ) : (
                <Textarea
                  aria-label={t("admin.summary")}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="min-h-[60dvh] font-mono text-sm"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cards">
          <Card variant="flat" className="py-1">
            <CardContent className="divide-y">
              {data.flashcards.map((c) => (
                <FlashcardRow key={c.id} card={c} onChange={() => refetch()} />
              ))}
              {!data.flashcards.length && <Empty />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions">
          <Card variant="flat" className="py-1">
            <CardContent className="divide-y">
              {data.questions.map((q) => (
                <div key={q.id} className="flex items-start gap-2 py-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex gap-1.5">
                      <Pill tone="track" dot={false}>
                        {q.type}
                      </Pill>
                      <Pill tone={q.difficulty >= 3 ? "warning" : "track"} dot={false}>
                        {(t("quiz.difficulty", { returnObjects: true }) as string[])[q.difficulty]}
                      </Pill>
                    </div>
                    <div className="font-bold">{q.prompt}</div>
                    {q.type === "mc" && (
                      <ol className="list-[upper-alpha] pl-6 text-muted-foreground">
                        {q.data.options?.map((o, i) => (
                          <li key={i} className={i === q.data.answer ? "font-bold text-success-shade dark:text-success" : ""}>
                            {o}
                          </li>
                        ))}
                      </ol>
                    )}
                    {q.type !== "mc" && <div className="text-success-shade dark:text-success">{answerText(q)}</div>}
                  </div>
                  <Button size="icon" variant="ghost" aria-label={t("common.delete")} onClick={() => del(`/admin/questions/${q.id}`)}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {!data.questions.length && <Empty />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="terms">
          <Card variant="flat" className="py-1">
            <CardContent className="divide-y">
              {data.terms.map((x) => (
                <div key={x.id} className="flex items-start gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{x.term}</div>
                    <div className="text-muted-foreground">{x.definition}</div>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={t("common.delete")} onClick={() => del(`/admin/terms/${x.id}`)}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {!data.terms.length && <Empty />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Empty() {
  const { t } = useTranslation();
  return <p className="py-6 text-center text-muted-foreground">{t("admin.nothingYet")}</p>;
}
