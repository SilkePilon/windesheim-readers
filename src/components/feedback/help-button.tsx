import { useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { MessageCircleQuestion } from "lucide-react";
import { showHelpButton } from "@shared/help-button";
import { Button } from "@/components/ui/button";
import { openFeedback } from "@/lib/feedback";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Round floating "feedback / report a problem" button, bottom-right. On phones it sits
 * 12px above the floating dock (dock: 16px inset + 60px tall, plus the safe area); from
 * `md` (no dock) in the bottom-right corner. Hidden on lesson activity views (`?view=`)
 * and when logged out. Only rendered by `AppLayout`, so never in StudyShell.
 */
export function HelpButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const { data: me } = useMe();
  if (!me || !showHelpButton(pathname, search)) return null;
  return (
    <Button
      type="button"
      variant="chunky-surface"
      aria-label={t("feedback.help")}
      onClick={() => openFeedback()}
      className={cn(
        "fixed right-4 bottom-[calc(88px+env(safe-area-inset-bottom))] z-30 size-13 rounded-full p-0 text-primary dark:text-foreground",
        "md:right-6 md:bottom-6",
        className,
      )}
    >
      <MessageCircleQuestion className="size-6" strokeWidth={2.4} />
    </Button>
  );
}
