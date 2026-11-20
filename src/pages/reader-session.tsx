import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, CircleCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StudyShell } from "@/components/shell/study-shell";
import { Notice } from "@/components/notice";
import { ReviewCard } from "@/components/study/review-card";
import { OpenQuestion } from "@/components/study/open-question";
import { SessionQuestionItem } from "@/components/reader-session/session-question";
import { SessionResultView, type GradedOpen } from "@/components/reader-session/session-result";
import { SessionCloseConfirm } from "@/components/reader-session/close-confirm";
import { ApiError, api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { withViewTransition } from "@/lib/motion";
import { useInvalidateProgress } from "@/lib/queries";
import { initSession, sessionProgress, sessionReducer } from "@/lib/session-runner";
import type { GradeResult, ReaderSession, ReaderSessionResult } from "@/lib/types";

/** Where the screen is, apart from the item steps the reducer keeps. */
type Phase = "loading" | "error" | "playing" | "submitting" | "submitFailed" | "expired";

/**
 * `/reader/:id/session`: today's mixed session over the whole reader. Cards, quiz questions
 * and open questions come in the server's order; the last one submits and shows the result.
 * Rated cards are saved as they go, quiz XP only on submit.
 */
export default function ReaderSessionPage() {
  const { id = "" } = useParams();
  // A new reader id is a new session: remount so the load-once guards start over.
  return <ReaderSession key={id} id={id} />;
}

function ReaderSession({ id }: { id: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const invalidate = useInvalidateProgress();
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<ReaderSession | null>(null);
  const [state, dispatch] = useReducer(sessionReducer, initSession(0));
  const [graded, setGraded] = useState<GradedOpen[]>([]);
  const [confirming, setConfirming] = useState(false);
  const back = useCallback(() => navigate(`/reader/${id}`), [navigate, id]);

  // Fetch once (the ref also covers StrictMode's double effect); a refresh resumes the open server session.
  const loading = useRef(false);
  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setPhase("loading");
    try {
      const res = await api.get<ReaderSession>(`/readers/${id}/session`);
      if (res.needsStart || !res.sessionId) {
        navigate(`/reader/${id}`, { replace: true });
        return;
      }
      setSession(res);
      // A resumed session whose items were all done before the refresh: straight to the submit.
      dispatch({ type: "reset", total: res.items.length, done: !!res.resumed && !res.items.length });
      setPhase("playing");
    } catch {
      setPhase("error");
    } finally {
      loading.current = false;
    }
  }, [id, navigate]);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
  }, [load]);

  const submitting = useRef(false);
  const submit = useCallback(async () => {
    if (!session?.sessionId || submitting.current) return;
    submitting.current = true;
    setPhase("submitting");
    try {
      const res = await api.post<ReaderSessionResult>(`/readers/${id}/session/submit`, { sessionId: session.sessionId });
      dispatch({ type: "submitted", result: res });
      celebrate(res.award ?? undefined);
      setPhase("playing");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setPhase(e instanceof ApiError && e.code === "NO_SESSION" ? "expired" : "submitFailed");
    } finally {
      submitting.current = false;
      // Cards and open answers were saved along the way, so refresh even when the submit failed.
      invalidate();
    }
  }, [id, session, invalidate]);

  // Past the last item: submit once.
  useEffect(() => {
    if (state.done && !state.result && phase === "playing") void submit();
  }, [state.done, state.result, phase, submit]);

  // Every step carries its item's index, so a stale one (the sheet's auto-advance and its
  // button both firing, a double tap) is dropped by the reducer.
  const at = state.index;
  const next = useCallback(() => {
    withViewTransition("quiz", () => {
      dispatch({ type: "next", from: at });
      window.scrollTo({ top: 0 });
    });
  }, [at]);
  const onCardRated = useCallback(() => {
    invalidate();
    dispatch({ type: "card-rated", at });
    window.scrollTo({ top: 0 });
  }, [invalidate, at]);
  const onChecked = useCallback((correct: boolean) => dispatch({ type: "checked", at, correct }), [at]);
  // Cards rated before the session expired are saved: refresh the reader page's numbers.
  const onExpired = useCallback(() => {
    setPhase("expired");
    invalidate();
  }, [invalidate]);

  const items = session?.items ?? [];
  const item = items[state.index];
  const finished = !!state.result || phase === "expired";
  // Nothing to lose before the first answer or once it's over: close straight away.
  const close = () => (finished || state.answered.size === 0 || phase === "error" ? back() : setConfirming(true));

  const progress = state.result ? 1 : sessionProgress(state);
  const counter = phase === "playing" && !state.result && items.length ? `${state.index + 1} / ${items.length}` : undefined;

  let body: ReactNode;
  if (phase === "error") {
    body = (
      <Centered>
        <Notice
          className="w-full max-w-md"
          title={t("readerLearn.session.loadFailed")}
          description={t("common.errorHint")}
          action={
            <Button variant="chunky" size="lg" onClick={() => void load()}>
              {t("common.retry")}
            </Button>
          }
        />
      </Centered>
    );
  } else if (phase === "expired") {
    body = (
      <Centered>
        <Notice className="w-full max-w-md" tone="info" title={t("readerLearn.session.expired")} description={t("readerLearn.session.expiredHint")} />
        <Button variant="chunky" size="xl" className="w-full max-w-md" onClick={back}>
          {t("readerLearn.session.backToReader")}
        </Button>
      </Centered>
    );
  } else if (phase === "submitFailed") {
    body = (
      <Centered>
        <Notice
          className="w-full max-w-md"
          title={t("readerLearn.session.submitFailed")}
          description={t("common.errorHint")}
          action={
            <Button variant="chunky" size="lg" onClick={() => void submit()}>
              {t("common.retry")}
            </Button>
          }
        />
      </Centered>
    );
  } else if (phase === "loading" || phase === "submitting") {
    body = (
      <Centered>
        <Spinner className="size-7 text-primary" />
        {phase === "submitting" && <p className="font-heading text-sm font-semibold text-muted-foreground">{t("readerLearn.session.submitting")}</p>}
      </Centered>
    );
  } else if (state.result) {
    body = <SessionResultView readerId={id} result={state.result} open={graded} />;
  } else if (!items.length) {
    body = (
      <Centered>
        <div className="flex size-16 items-center justify-center rounded-[20px] bg-card text-success-shade shadow-[0_5px_0_var(--chunky)] dark:text-success [&_svg]:size-8">
          <CircleCheck />
        </div>
        <h1 className="font-heading text-2xl font-semibold text-balance">{t("readerLearn.session.nothing")}</h1>
        <p className="text-[15px] text-muted-foreground">{t("readerLearn.session.nothingHint")}</p>
        <Button variant="chunky-surface" size="xl" onClick={back}>
          {t("readerLearn.session.backToReader")}
        </Button>
      </Centered>
    );
  } else if (item && session?.sessionId) {
    const isLast = state.index + 1 >= items.length;
    if (item.kind === "card") {
      body = <ReviewCard key={item.card.id} card={item.card} onRated={onCardRated} />;
    } else if (item.kind === "question") {
      body = (
        <SessionQuestionItem
          key={item.question.id}
          question={item.question}
          sessionId={session.sessionId}
          xpPerCorrect={session.xpPerCorrect}
          isLast={isLast}
          onChecked={onChecked}
          onNext={next}
          onExpired={onExpired}
        />
      );
    } else {
      const q = item.question;
      const isGraded = state.answered.has(state.index);
      body = (
        <div key={q.id} className="flex flex-1 flex-col gap-4 pt-3">
          <p className="flex items-center gap-2 font-heading text-sm font-semibold text-muted-foreground">
            <span className="rounded-[8px] bg-accent px-2 py-0.5 text-[13px] text-primary">{q.code}</span>
            <Sparkles className="size-4" aria-hidden />
            {t("readerLearn.session.openBadge")}
          </p>
          <OpenQuestion
            question={q}
            sessionId={session.sessionId}
            onGraded={(g: GradeResult) => {
              setGraded((list) => [...list.filter((o) => o.id !== q.id), { id: q.id, prompt: q.prompt, code: q.code, score: g.score }]);
              dispatch({ type: "graded", at });
            }}
            onError={(code) => code === "NO_SESSION" && onExpired()}
          />
          <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-background from-70% to-transparent pt-3 pb-[calc(4px+env(safe-area-inset-bottom))]">
            <Button variant={isGraded ? "chunky" : "chunky-surface"} size="xl" className="w-full" onClick={next}>
              {isGraded ? (isLast ? t("readerLearn.session.finish") : t("common.next")) : t("readerLearn.session.skip")}
              <ChevronRight strokeWidth={2.5} />
            </Button>
          </div>
        </div>
      );
    }
  }

  return (
    <>
      <StudyShell onClose={close} progress={progress} counter={counter}>
        {body}
      </StudyShell>
      <SessionCloseConfirm open={confirming} onOpenChange={setConfirming} onConfirm={back} />
    </>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">{children}</div>;
}
