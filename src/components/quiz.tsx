import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, CircleCheck, CircleX, ListChecks, RotateCcw, Target, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { StudyShell } from "@/components/shell/study-shell";
import { Notice } from "@/components/notice";
import { FeedbackSheet } from "@/components/game/feedback-sheet";
import { autoAdvanceMs } from "@/lib/quiz-timing";
import { Chip } from "@/components/game/chip";
import { QuestionInput, correctAnswerText, isAnswered, type Reveal } from "@/components/question-input";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { withViewTransition } from "@/lib/motion";
import { useInvalidateProgress } from "@/lib/queries";
import type { CheckResult, PublicQuestion, XpResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { XP } from "@shared/game";
import { QUESTS } from "@shared/quests";

export function QuestionPrompt({ text, className }: { text: string; className?: string }) {
  const parts = text.split("___");
  return (
    <h2 className={cn("font-heading text-[21px] leading-tight font-semibold break-words md:text-2xl", className)}>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="mx-1 inline-block w-16 border-b-[3px] border-primary align-baseline" />}
        </span>
      ))}
    </h2>
  );
}

type QuizResult = XpResult & { correct: number; max: number };
type Phase = "loading" | "playing" | "result" | "error";


const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

/**
 * Full-screen quiz: one question at a time, a feedback sheet after each check, a combo
 * chip for answers in a row, then a results screen. Server flow (anti-cheat): GET quiz
 * session → POST check per question (first check counts) → POST submit.
 */
export function Quiz({ lessonId, available, onClose }: { lessonId: string; available: number; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateProgress();
  const [phase, setPhase] = useState<Phase>(available > 0 ? "loading" : "playing");
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState<unknown>(undefined);
  const [reveal, setReveal] = useState<(Reveal & { explanation: string }) | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [combo, setCombo] = useState(0);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [xpPerCorrect, setXpPerCorrect] = useState<number>(XP.quizCorrect);
  const n = Math.min(10, available);
  // Synchronous guard: `busy` state lags a render, so a double tap could check or submit twice.
  const lock = useRef(false);

  const start = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const res = await api.get<{ sessionId: string; questions: PublicQuestion[]; xpPerCorrect?: number }>(
        `/lessons/${lessonId}/quiz?n=${n}`,
      );
      setSessionId(res.sessionId);
      setXpPerCorrect(res.xpPerCorrect ?? XP.quizCorrect);
      setQuestions(res.questions);
      setIndex(0);
      setAnswers([]);
      setCombo(0);
      setValue(undefined);
      setReveal(null);
      setResult(null);
      setPhase("playing");
      window.scrollTo({ top: 0 });
    } catch {
      setPhase("error");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [lessonId, n]);

  // Start straight away; the ref keeps StrictMode's double effect from opening two sessions.
  const started = useRef(false);
  useEffect(() => {
    if (available > 0 && !started.current) {
      started.current = true;
      void start();
    }
  }, [available, start]);

  const q = questions[index];
  const isLast = index + 1 >= questions.length;

  // `answer` lets a single tap (multiple choice / true-false) check straight away, before the
  // `value` state has caught up.
  const check = useCallback(async (answer: unknown = value) => {
    if (!q || reveal || !isAnswered(q, answer) || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const res = await api.post<CheckResult>(`/questions/${q.id}/check`, { sessionId, answer });
      setReveal(res);
      setAnswers((a) => [...a, res.correct]);
      setCombo((c) => (res.correct ? c + 1 : 0));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [q, reveal, value, sessionId]);

  const next = async () => {
    if (!reveal || lock.current) return;
    if (!isLast) {
      // The answered question slides out to the left, the next one in from the right.
      withViewTransition("quiz", () => {
        setIndex(index + 1);
        setValue(undefined);
        setReveal(null);
        window.scrollTo({ top: 0 });
      });
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const res = await api.post<QuizResult>(`/lessons/${lessonId}/quiz/submit`, { sessionId });
      setResult(res);
      celebrate(res);
      invalidate();
      setPhase("result");
      window.scrollTo({ top: 0 });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  // One tap answers: multiple choice and true/false check on pick; typed and ordering
  // questions keep the check button.
  const tapToAnswer = q?.type === "mc" || q?.type === "tf";
  const pick = useCallback(
    (v: unknown) => {
      setValue(v);
      if (tapToAnswer) void check(v);
    },
    [tapToAnswer, check],
  );

  // Keyboard: 1–n picks an option, Enter checks. After checking, the sheet's button has focus.
  useEffect(() => {
    if (phase !== "playing" || !q || reveal) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      // Enter checks, also from a focused answer option (but not from other buttons).
      if (e.key === "Enter" && !(e.target instanceof HTMLElement && e.target.closest("button:not([aria-pressed]), a"))) {
        e.preventDefault();
        void check();
        return;
      }
      const k = Number(e.key);
      if (!Number.isInteger(k) || k < 1) return;
      if (q.type === "mc" && k <= q.options.length) pick(k - 1);
      else if (q.type === "tf" && k <= 2) pick(k === 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, q, reveal, check, pick]);

  const progress =
    phase === "result" ? 1 : questions.length ? (index + (reveal ? 1 : 0)) / questions.length : 0;
  const counter = phase === "playing" && questions.length ? `${index + 1} / ${questions.length}` : undefined;
  const right =
    phase === "playing" && combo >= 2 ? (
      <Chip key={combo} tone="streak" className="animate-pop motion-reduce:animate-none">
        <Zap className="fill-current" aria-hidden />
        <span aria-hidden>{t("quiz.combo", { n: combo })}</span>
        <span className="sr-only">{t("quiz.comboLabel", { n: combo })}</span>
      </Chip>
    ) : undefined;

  let body;
  if (available === 0) {
    body = (
      <CenterMessage icon={<ListChecks />} title={t("quiz.noQuestions")}>
        <Button variant="chunky-surface" size="xl" onClick={onClose}>
          {t("quiz.backToLesson")}
        </Button>
      </CenterMessage>
    );
  } else if (phase === "error") {
    body = (
      <div className="flex flex-1 items-center justify-center py-10">
        <Notice
          className="w-full max-w-md"
          title={t("common.error")}
          description={t("common.errorHint")}
          action={
            <Button variant="chunky" size="lg" onClick={() => void start()} disabled={busy}>
              {busy && <Spinner />} {t("common.retry")}
            </Button>
          }
        />
      </div>
    );
  } else if (phase === "loading" || (phase === "playing" && !q)) {
    body = (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-7 text-primary" />
      </div>
    );
  } else if (phase === "result" && result) {
    body = <QuizResults result={result} questions={questions} answers={answers} busy={busy} onAgain={start} onClose={onClose} />;
  } else if (q) {
    const answerText = reveal && !reveal.correct ? correctAnswerText(q, reveal.correctAnswer, t) : null;
    body = (
      <div className="flex flex-1 flex-col gap-5 pt-3">
        {/* Named during the "next question" view transition (see `next`). */}
        <div className="vt-quiz-question flex flex-col gap-5">
          <div className="space-y-2">
            <p className="font-heading text-sm font-semibold text-muted-foreground">
              {(t("quiz.difficulty", { returnObjects: true }) as string[])[q.difficulty]}
            </p>
            <QuestionPrompt text={q.prompt} />
          </div>
          <QuestionInput key={q.id} question={q} value={value} onChange={pick} reveal={reveal} disabled={busy} onSubmit={() => void check()} />
        </div>

        {reveal ? (
          <FeedbackSheet
            tone={reveal.correct ? "success" : "danger"}
            title={
              reveal.correct
                ? xpPerCorrect > 0
                  ? t("quiz.goodJobXp", { n: xpPerCorrect })
                  : t("quiz.goodJob")
                : t("quiz.incorrect")
            }
            body={
              <>
                {answerText && <p className="mb-1">{t("quiz.correctAnswerWas", { answer: answerText })}</p>}
                {reveal.explanation && <p>{reveal.explanation}</p>}
              </>
            }
            nextLabel={isLast ? t("quiz.result") : t("common.next")}
            onNext={() => void next()}
            busy={busy}
            autoAdvanceMs={autoAdvanceMs(reveal.correct, `${answerText ?? ""} ${reveal.explanation ?? ""}`)}
          />
        ) : tapToAnswer ? null : (
          <div className="sticky bottom-0 bg-gradient-to-t from-background from-70% to-transparent pt-1 pb-[calc(4px+env(safe-area-inset-bottom))]">
            <Button variant="chunky" size="xl" className="w-full" onClick={() => void check()} disabled={!isAnswered(q, value) || busy}>
              {busy && <Spinner />} {t("quiz.check")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <StudyShell onClose={onClose} progress={progress} counter={counter} right={right}>
      {body}
    </StudyShell>
  );
}

function CenterMessage({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-[20px] bg-card text-primary shadow-[0_5px_0_var(--chunky)] [&_svg]:size-8">
        {icon}
      </div>
      <h1 className="font-heading text-2xl font-semibold text-balance">{title}</h1>
      {children}
    </div>
  );
}

function QuizResults({
  result,
  questions,
  answers,
  busy,
  onAgain,
  onClose,
}: {
  result: QuizResult;
  questions: PublicQuestion[];
  answers: boolean[];
  busy: boolean;
  onAgain: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const pct = result.max ? result.correct / result.max : 0;
  const perfect = result.correct === result.max && result.max > 0;
  const reduced = result.gained < result.correct * XP.quizCorrect;
  const tone = pct >= 0.8 ? "success" : pct >= 0.5 ? "hard" : "danger";

  return (
    <div className="flex flex-1 flex-col gap-5 pt-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className={cn(
            "flex size-20 items-center justify-center rounded-[24px] [&_svg]:size-10",
            perfect
              ? "bg-gold text-gold-foreground shadow-[0_6px_0_var(--gold-shade)]"
              : "bg-primary text-primary-foreground shadow-[0_6px_0_var(--primary-shade)]",
          )}
        >
          {perfect ? <Trophy strokeWidth={2.4} /> : <Target strokeWidth={2.4} />}
        </div>
        <h1 className="font-heading text-[26px] leading-tight font-bold text-balance">
          {perfect ? t("quiz.perfect") : t("quiz.score", { correct: result.correct, max: result.max })}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label={t("quiz.scoreLabel")}
          value={`${Math.round(pct * 100)}%`}
          className={cn(
            tone === "success" && "text-success-shade dark:text-success",
            tone === "hard" && "text-hard-shade dark:text-hard",
            tone === "danger" && "text-danger-shade dark:text-danger",
          )}
        />
        <StatTile label={t("quiz.xpLabel")} value={`+${result.gained}`} className="text-primary" />
      </div>
      {reduced && <p className="text-center text-sm text-muted-foreground">{t("quiz.xpReduced")}</p>}

      {!!result.quests?.length && (
        <Card className="gap-3 px-4">
          <h2 className="font-heading text-base font-semibold">{t("quiz.questsDone")}</h2>
          <ul className="flex flex-col gap-2.5">
            {result.quests.map((id) => (
              <li key={id} className="flex items-start gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-[8px] bg-success text-success-foreground">
                  <Check className="size-4" strokeWidth={3} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm leading-snug font-bold">{t(`quests.names.${id}`, { n: QUESTS[id].target })}</span>
                <span className="shrink-0 font-heading text-sm font-semibold text-success-shade dark:text-success">
                  {t("quests.reward", { n: QUESTS[id].reward })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="gap-2.5 px-4">
        <ul className="flex flex-col gap-2.5">
          {questions.map((qq, i) => (
            <li key={qq.id} className="flex items-start gap-2.5 text-sm">
              {answers[i] ? (
                <CircleCheck className="mt-px size-5 shrink-0 text-success-shade dark:text-success" aria-label={t("quiz.correct")} />
              ) : (
                <CircleX className="mt-px size-5 shrink-0 text-danger-shade dark:text-danger" aria-label={t("quiz.incorrect")} />
              )}
              <span className="min-w-0 flex-1 leading-snug break-words text-muted-foreground">{qq.prompt.replaceAll("___", "…")}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-auto flex flex-col gap-3 pt-2 sm:flex-row-reverse">
        <Button variant="chunky" size="xl" className="w-full sm:flex-1" onClick={onAgain} disabled={busy}>
          {busy ? <Spinner /> : <RotateCcw />} {t("quiz.again")}
        </Button>
        <Button variant="chunky-surface" size="xl" className="w-full sm:flex-1" onClick={onClose}>
          {t("quiz.backToLesson")}
        </Button>
      </div>
    </div>
  );
}

function StatTile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-[20px] bg-card px-3 py-3.5 text-center shadow-[0_5px_0_var(--chunky)]">
      <span className={cn("font-heading text-3xl leading-none font-bold tabular-nums", className)}>{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
