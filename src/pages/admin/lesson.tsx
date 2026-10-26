import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, ExternalLink, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Page, PageHeader, PageSpinner } from "@/components/page";
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
  const [edit, setEdit] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  if (edit)
    return (
      <div className="space-y-2 py-3">
        <Textarea value={front} onChange={(e) => setFront(e.target.value)} className="min-h-12" />
        <Textarea value={back} onChange={(e) => setBack(e.target.value)} className="min-h-12" />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEdit(false)}><X /></Button>
          <Button
            size="sm"
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
        <div className="font-medium">{card.front}</div>
        <div className="text-sm text-muted-foreground">{card.back}</div>
      </div>
      <Button size="icon" variant="ghost" onClick={() => setEdit(true)}><Pencil /></Button>
      <Button
        size="icon"
        variant="ghost"
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
    <Page wide>
      <PageHeader
        back={`/admin/readers/${data.readerId}`}
        title={`${data.code} · ${data.title}`}
        actions={
          <Button variant="outline" asChild>
            <Link to={`/lesson/${data.id}`}>
              <ExternalLink /> {t("nav.learn")}
            </Link>
          </Button>
        }
      />
      <Tabs defaultValue="summary">
        <TabsList className="mb-4">
          <TabsTrigger value="summary">{t("lesson.tabs.summary")}</TabsTrigger>
          <TabsTrigger value="cards">{t("admin.flashcards")} ({data.flashcards.length})</TabsTrigger>
          <TabsTrigger value="questions">{t("admin.questions")} ({data.questions.length})</TabsTrigger>
          <TabsTrigger value="terms">{t("admin.terms")} ({data.terms.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPreview(!preview)}>
                  {preview ? <Pencil /> : "👁"} {preview ? t("common.edit") : "Preview"}
                </Button>
                <Button
                  size="sm"
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
              {preview ? <Markdown>{summary}</Markdown> : <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-[60dvh] font-mono text-sm" />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cards">
          <Card>
            <CardContent className="divide-y">
              {data.flashcards.map((c) => (
                <FlashcardRow key={c.id} card={c} onChange={() => refetch()} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions">
          <Card>
            <CardContent className="divide-y">
              {data.questions.map((q) => (
                <div key={q.id} className="flex items-start gap-2 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex gap-2">
                      <Badge variant="outline">{q.type}</Badge>
                      <Badge variant="secondary">{(t("quiz.difficulty", { returnObjects: true }) as string[])[q.difficulty]}</Badge>
                    </div>
                    <div className="font-medium">{q.prompt}</div>
                    {q.type === "mc" && (
                      <ol className="list-[upper-alpha] pl-6 text-sm text-muted-foreground">
                        {q.data.options?.map((o, i) => (
                          <li key={i} className={i === q.data.answer ? "font-semibold text-emerald-600" : ""}>{o}</li>
                        ))}
                      </ol>
                    )}
                    {q.type !== "mc" && <div className="text-sm text-emerald-600">{answerText(q)}</div>}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => del(`/admin/questions/${q.id}`)}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="terms">
          <Card>
            <CardContent className="divide-y">
              {data.terms.map((x) => (
                <div key={x.id} className="flex items-start gap-2 py-3">
                  <div className="flex-1">
                    <div className="font-medium">{x.term}</div>
                    <div className="text-sm text-muted-foreground">{x.definition}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => del(`/admin/terms/${x.id}`)}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
