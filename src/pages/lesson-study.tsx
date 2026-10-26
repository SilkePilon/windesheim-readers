import { useNavigate, useParams } from "react-router";
import { PageSpinner } from "@/components/page";
import { StudyShell } from "@/components/shell/study-shell";
import { FlashcardSession } from "@/components/flashcard-session";
import { Quiz } from "@/components/quiz";
import { useLesson } from "@/lib/queries";

/**
 * Full-screen cards / quiz for one lesson (`/lesson/:id/cards`, `/lesson/:id/quiz`).
 * Temporary: wraps the existing session components in StudyShell until the full-screen
 * study task replaces their internals (and drives the progress bar).
 */
export default function LessonStudyPage({ mode }: { mode: "cards" | "quiz" }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: lesson } = useLesson(id);
  if (!lesson) return <PageSpinner />;

  return (
    <StudyShell onClose={() => navigate(`/lesson/${id}`)} progress={0} counter={lesson.code} className="pt-4">
      {mode === "cards" ? (
        <FlashcardSession lessonId={lesson.id} />
      ) : (
        <Quiz lessonId={lesson.id} available={lesson.quizCount} />
      )}
    </StudyShell>
  );
}
