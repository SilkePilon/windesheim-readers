import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/app-layout";
import { PageSpinner } from "@/components/page";
import { useMe } from "@/lib/queries";
import { AboutContent } from "./about-content";

export { AboutContent };

/** Public: inside the app shell when logged in, standalone with a way back to login when not. */
export default function AboutPage() {
  const { t } = useTranslation();
  const { data: me, isLoading } = useMe();
  if (isLoading) return <PageSpinner />;
  if (me) {
    return (
      <AppLayout>
        <AboutContent />
      </AppLayout>
    );
  }
  return (
    <div className="min-h-dvh pb-8">
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 md:px-8 md:pt-8">
        <Button asChild variant="ghost" className="-ml-2">
          <Link to="/login">
            <ChevronLeft />
            {t("about.back")}
          </Link>
        </Button>
      </div>
      <AboutContent />
    </div>
  );
}
