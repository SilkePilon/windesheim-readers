import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FeedbackSheet } from "@/components/game/feedback-sheet";
import { QuestionPrompt } from "@/components/quiz";
import { QuestionInput, correctAnswerText, isAnswered, type Reveal } from "@/components/question-input";
import { ApiError, api } from "@/lib/api";
import { autoAdvanceMs } from "@/lib/quiz-timing";
import type { CheckResult, SessionQuestion } from "@/lib/types";

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

/**
 * One quiz question inside a reader session, run like the lesson quiz: tap to answer (mc/tf),
 * check button otherwise, keys 1–n and Enter, then the feedback sheet with auto-advance.
 * Give it `key={question.id}` so each question starts fresh.
 */
export function SessionQuestionItem({
  question: q,
  sessionId,
  xpPerCorrect,
  isLast,
  onChecked,
  onNext,
  onExpired,
}: {
  question: SessionQuestion;
  sessionId: string;
  xpPerCorrect: number;
  isLast: boolean;
  onChecked: (correct: boolean) => void;
  onNext: () => void;
  onExpired: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<unknown>(undefined);
  const [reveal, setReveal] = useState<(Reveal & { explanation: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  // Synchronous guard: `busy` lags a render, so a double tap could check twice.
  const lock = useRef(false);

  const check = useCallback(
    async (answer: unknown = value) => {
      if (reveal || !isAnswered(q, answer) || lock.current) return;
      lock.current = true;
      setBusy(true);
      try {
        const res = await api.post<CheckResult>(`/questions/${q.id}/check`, { sessionId, answer });
        setReveal(res);
        onChecked(res.correct);
      } catch (e) {
        // The session is kept in server memory: a restart or timeout drops it.
        if (e instanceof ApiError && e.code === "NO_SESSION") onExpired();
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [q, reveal, value, sessionId, onChecked, onExpired],
  );

  const tapToAnswer = q.type === "mc" || q.type === "tf";
  const pick = useCallback(
    (v: unknown) => {
      setValue(v);
      if (tapToAnswer) void check(v);
    },
    [tapToAnswer, check],
  );

  // Keyboard: 1–n picks an option, Enter checks. After checking, the sheet's button has focus.
  useEffect(() => {
    if (reveal) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
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
  }, [q, reveal, check, pick]);

  const answerText = reveal && !reveal.correct ? correctAnswerText(q, reveal.correctAnswer, t) : null;
  return (
    <div className="flex flex-1 flex-col gap-5 pt-3">
      <div className="vt-quiz-question flex flex-col gap-5">
        <div className="space-y-2">
          <p className="flex items-center gap-2 font-heading text-sm font-semibold text-muted-foreground">
            <span className="rounded-[8px] bg-accent px-2 py-0.5 text-[13px] text-primary">{q.code}</span>
            {(t("quiz.difficulty", { returnObjects: true }) as string[])[q.difficulty]}
          </p>
          <QuestionPrompt text={q.prompt} />
        </div>
        <QuestionInput question={q} value={value} onChange={pick} reveal={reveal} disabled={busy} onSubmit={() => void check()} />
      </div>

      {reveal ? (
        <FeedbackSheet
          tone={reveal.correct ? "success" : "danger"}
          title={
            reveal.correct ? (xpPerCorrect > 0 ? t("quiz.goodJobXp", { n: xpPerCorrect }) : t("quiz.goodJob")) : t("quiz.incorrect")
          }
          body={
            <>
              {answerText && <p className="mb-1">{t("quiz.correctAnswerWas", { answer: answerText })}</p>}
              {reveal.explanation && <p>{reveal.explanation}</p>}
            </>
          }
          nextLabel={isLast ? t("readerLearn.session.finish") : t("common.next")}
          onNext={onNext}
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
