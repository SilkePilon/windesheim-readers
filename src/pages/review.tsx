import { useTranslation } from "react-i18next";
import { Page, PageHeader } from "@/components/page";
import { FlashcardSession } from "@/components/flashcard-session";

export default function ReviewPage() {
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader title={t("review.title")} description={t("review.subtitle")} />
      <FlashcardSession showLessonCode />
    </Page>
  );
}
