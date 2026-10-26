import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ListChecks, RotateCcw, Trophy, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { QuestionInput, isAnswered, type Reveal } from "@/components/question-input";
import { MasteryRing } from "@/components/mastery-ring";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { useInvalidateProgress } from "@/lib/queries";
import type { CheckResult, PublicQuestion, XpResult } from "@/lib/types";
import { cn } from "@/lib/utils";

export function QuestionPrompt({ text, className }: { text: string; className?: string }) {
  const parts = text.split("___");
  return (
    <h2 className={cn("text-lg leading-snug font-semibold md:text-xl", className)}>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="mx-1 inline-block w-16 border-b-2 border-primary align-baseline" />}
        </span>
      ))}
    </h2>
  );
}

type Phase = "intro" | "playing" | "result";

export function Quiz({ lessonId, available }: { lessonId: string; available: number }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateProgress();
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState<unknown>(undefined);
  const [reveal, setReveal] = useState<(Reveal & { explanation: string }) | null>(null);
  const [answers, setAnswers] = useState<{ questionId: string; correct: boolean }[]>([]);
  const [result, setResult] = useState<(XpResult & { correct: number; max: number }) | null>(null);
  const [loading, setLoading] = useState(false);
  const n = Math.min(10, available);

  const start = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ sessionId: string; questions: PublicQuestion[] }>(`/lessons/${lessonId}/quiz?n=${n}`);
      setSessionId(res.sessionId);
      setQuestions(res.questions);
      setIndex(0);
      setAnswers([]);
      setValue(undefined);
      setReveal(null);
      setPhase("playing");
    } finally {
      setLoading(false);
    }
  };

  const q = questions[index];

  const check = async () => {
    if (!q || !isAnswered(q, value) || loading) return;
    setLoading(true);
    try {
      const res = await api.post<CheckResult>(`/questions/${q.id}/check`, { sessionId, answer: value });
      setReveal(res);
      setAnswers((a) => [...a, { questionId: q.id, correct: res.correct }]);
    } finally {
      setLoading(false);
    }
  };

  const next = async () => {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setValue(undefined);
      setReveal(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<XpResult & { correct: number; max: number }>(`/lessons/${lessonId}/quiz/submit`, { sessionId });
      setResult(res);
      celebrate(res);
      invalidate();
      setPhase("result");
    } finally {
      setLoading(false);
    }
  };

  if (available === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListChecks />
          </EmptyMedia>
          <EmptyTitle>{t("quiz.noQuestions")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  if (phase === "intro") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="rounded-2xl bg-primary/10 p-4 text-primary">
            <ListChecks className="size-8" />
          </div>
          <p className="text-muted-foreground">{t("quiz.intro", { n })}</p>
          <Button size="lg" onClick={start} disabled={loading} className="min-w-40">
            {loading && <Spinner />} {t("quiz.start")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === "result" && result) {
    const pct = result.max ? result.correct / result.max : 0;
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <MasteryRing value={pct} size={110} stroke={10}>
            <span className="text-2xl font-bold">{Math.round(pct * 100)}%</span>
          </MasteryRing>
          <div>
            <div className="text-xl font-semibold">
              {pct === 1 ? (
                <span className="inline-flex items-center gap-2">
                  <Trophy className="size-5 text-amber-500" /> {t("quiz.perfect")}
                </span>
              ) : (
                t("quiz.score", { correct: result.correct, max: result.max })
              )}
            </div>
            <div className="mt-1 font-semibold text-primary">+{result.gained} XP</div>
          </div>
          <div className="flex w-full max-w-sm flex-col gap-1.5">
            {questions.map((qq, i) => (
              <div key={qq.id} className="flex items-start gap-2 text-left text-sm">
                {answers[i]?.correct ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
                )}
                <span className="line-clamp-2 text-muted-foreground">{qq.prompt}</span>
              </div>
            ))}
          </div>
          <Button size="lg" onClick={start} disabled={loading}>
            <RotateCcw /> {t("quiz.again")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!q) return null;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Progress value={((index + (reveal ? 1 : 0)) / questions.length) * 100} className="h-2 flex-1" />
        <span className="tabular-nums">{t("quiz.question", { i: index + 1, n: questions.length })}</span>
      </div>
      <div className="space-y-2">
        <Badge variant="outline">{(t("quiz.difficulty", { returnObjects: true }) as string[])[q.difficulty]}</Badge>
        <QuestionPrompt text={q.prompt} />
      </div>
      <QuestionInput key={q.id} question={q} value={value} onChange={setValue} reveal={reveal} onSubmit={check} />

      {reveal && (
        <Alert className={cn("animate-pop", reveal.correct ? "border-emerald-500/50 bg-emerald-500/5" : "border-red-500/50 bg-red-500/5")}>
          <AlertDescription>
            <div className={cn("mb-1 font-semibold", reveal.correct ? "text-emerald-600" : "text-red-600")}>
              {reveal.correct ? t("quiz.correct") : t("quiz.incorrect")}
            </div>
            <p className="text-foreground/80">{reveal.explanation}</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="sticky bottom-20 md:bottom-4">
        {reveal ? (
          <Button size="lg" className="h-12 w-full" onClick={next} disabled={loading}>
            {loading && <Spinner />} {index + 1 < questions.length ? t("common.next") : t("quiz.result")}
          </Button>
        ) : (
          <Button size="lg" className="h-12 w-full" onClick={check} disabled={!isAnswered(q, value) || loading}>
            {loading && <Spinner />} {t("quiz.check")}
          </Button>
        )}
      </div>
    </div>
  );
}
