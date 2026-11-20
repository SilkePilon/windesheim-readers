import { lazy, Suspense, useEffect } from "react";
import { Navigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { PageError, PageSpinner } from "@/components/page";
import { ReaderLearnView } from "@/components/reader-learn/reader-learn-view";
import { ApiError } from "@/lib/api";
import { useReaderLearn } from "@/lib/queries";

const ReaderConceptMap = lazy(() => import("@/components/reader-learn/concept-map").then((m) => ({ default: m.ReaderConceptMap })));

/** `/reader/:id`: learn the whole reader (today's session, exam, progress, map, episodes). */
export default function ReaderLearnPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const { data, error, isError, isFetching, refetch } = useReaderLearn(id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  // Unpublished or unknown reader: back home rather than a dead end.
  if (error instanceof ApiError && error.status === 404) return <Navigate to="/" replace />;
  if (isError && !data) return <PageError title={t("readerLearn.loadFailed")} onRetry={() => void refetch()} retrying={isFetching} />;
  if (!data) return <PageSpinner />;
  return (
    <ReaderLearnView
      data={data}
      map={
        <Suspense fallback={null}>
          <ReaderConceptMap readerId={data.reader.id} />
        </Suspense>
      }
    />
  );
}
