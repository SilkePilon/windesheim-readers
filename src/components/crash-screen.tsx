import { Component, useEffect, useState, type ReactNode } from "react";
import { useRouteError, isRouteErrorResponse } from "react-router";
import { useTranslation } from "react-i18next";
import { Bug, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackHost } from "@/components/feedback/feedback-host";
import { closeFeedback, openFeedback } from "@/lib/feedback";
import { useMe } from "@/lib/queries";

/** What to attach to a crash report: a message and, for a thrown Error, its stack. */
function crashDetails(error: unknown): { message: string; stack?: string } {
  if (isRouteErrorResponse(error)) return { message: `${error.status} ${error.statusText}`.trim() };
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack };
  return { message: typeof error === "string" && error ? error : "Unknown error" };
}

/** Renders nothing once its children throw: a crashing sheet (or a failed chunk load) must not take the crash screen down too. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The router's `errorElement`: a friendly stop screen instead of react-router's default one.
 * `App` isn't rendered here, so it mounts its own `FeedbackHost` (same lazy, logged-in-only
 * behaviour; never two at once, as the crashed `App` is gone). The providers in `main.tsx`
 * sit above the router, so `useMe` and the theme still work. Logged out: no report button.
 */
export function CrashScreen() {
  const { t } = useTranslation();
  const error = useRouteError();
  const { data: me } = useMe();
  // The open flag is module state and outlives the crash: if the sheet itself crashed, the
  // host would reopen it here and crash again. Close it once, then mount the host.
  const [hostReady, setHostReady] = useState(false);
  useEffect(() => {
    closeFeedback();
    setHostReady(true);
  }, []);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-sm items-center gap-0 p-6 text-center" role="alert">
        <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-danger text-danger-foreground shadow-[0_3px_0_var(--danger-shade)]">
          <TriangleAlert className="size-7" aria-hidden />
        </span>
        <h1 className="font-heading text-xl font-bold">{t("feedback.crash.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("feedback.crash.body")}</p>
        <div className="mt-6 flex w-full flex-col gap-2">
          <Button size="lg" variant="chunky" onClick={() => location.reload()}>
            <RotateCw aria-hidden /> {t("feedback.crash.reload")}
          </Button>
          {me && (
            <Button size="lg" variant="chunky-surface" onClick={() => openFeedback({ type: "bug", error: crashDetails(error) })}>
              <Bug aria-hidden /> {t("feedback.crash.report")}
            </Button>
          )}
        </div>
      </Card>
      {hostReady && (
        <Quiet>
          <FeedbackHost />
        </Quiet>
      )}
    </main>
  );
}
