import { lazy, Suspense, useEffect, useState } from "react";
import { closeFeedback, useFeedbackState } from "@/lib/feedback";
import { useMe } from "@/lib/queries";

// Its own chunk: most visits never open it. The store (`@/lib/feedback`) stays in the main bundle.
const FeedbackSheet = lazy(() => import("./feedback-sheet"));

/**
 * Mounts the feedback sheet once per app, for a logged-in user only, and only after it was
 * first opened; then it stays mounted so the draft and the close animation keep working.
 */
export function FeedbackHost() {
  const { data: me, isLoading } = useMe();
  const { open } = useFeedbackState();
  // Logged out: an open request has nowhere to go (and must not pop up after the next login).
  useEffect(() => {
    if (!me && !isLoading && open) closeFeedback();
  }, [me, isLoading, open]);
  const [opened, setOpened] = useState(false);
  if (open && !opened) setOpened(true);
  if (!me || !(opened || open)) return null;
  return (
    <Suspense fallback={null}>
      <FeedbackSheet key={me.user.id} userId={me.user.id} />
    </Suspense>
  );
}
