import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { PageError, PageSpinner } from "@/components/page";
import { FlashcardSession } from "@/components/flashcard-session";
import { Quiz } from "@/components/quiz";
import { useLesson } from "@/lib/queries";

/** Full-screen cards / quiz for one lesson (`/lesson/:id/cards`, `/lesson/:id/quiz`). */
export default function LessonStudyPage({ mode }: { mode: "cards" | "quiz" }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: lesson, isError, isFetching, refetch } = useLesson(id);
  if (isError && !lesson) return <PageError title={t("lesson.loadFailed")} onRetry={() => void refetch()} retrying={isFetching} />;
  if (!lesson) return <PageSpinner />;

  const close = () => navigate(`/lesson/${id}`);
  return mode === "cards" ? (
    <FlashcardSession key={lesson.id} lessonId={lesson.id} onClose={close} doneLabel={t("quiz.backToLesson")} />
  ) : (
    <Quiz key={lesson.id} lessonId={lesson.id} available={lesson.quizCount} onClose={close} />
  );
}
