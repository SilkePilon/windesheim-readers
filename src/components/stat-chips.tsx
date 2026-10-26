import { Link } from "react-router";
import { Flame, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function StatChips({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  if (!me) return null;
  const s = me.stats;
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums",
              s.activeToday ? "bg-orange-500/15 text-orange-600 dark:text-orange-400" : "bg-muted text-muted-foreground",
            )}
          >
            <Flame className={cn("size-4", s.activeToday && "fill-orange-500/30")} />
            {s.streak}
          </span>
        </TooltipTrigger>
        <TooltipContent>{s.activeToday ? t("home.streak") : t("home.streakKeep")}</TooltipContent>
      </Tooltip>
      <Link
        to="/profile"
        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-semibold text-primary tabular-nums"
      >
        <Zap className="size-4 fill-primary/30" />
        {t("common.level", { n: s.level })}
      </Link>
    </div>
  );
}
