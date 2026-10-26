import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { FlashcardSession } from "@/components/flashcard-session";

/** Full-screen daily review: due cards across all lessons. */
export default function ReviewPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return <FlashcardSession onClose={() => navigate("/")} doneLabel={t("review.backHome")} />;
}
