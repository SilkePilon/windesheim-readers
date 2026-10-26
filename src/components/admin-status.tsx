import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { LessonStatus, ReaderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const BUSY = new Set(["extracting", "structuring", "generating"]);

export function ReaderStatusBadge({ status }: { status: ReaderStatus | LessonStatus }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="secondary"
      className={cn(
        status === "ready" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        status === "error" && "bg-destructive/15 text-destructive",
        status === "review" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      )}
    >
      {BUSY.has(status) && <Spinner className="size-3" />}
      {t(`admin.status.${status}`)}
    </Badge>
  );
}
