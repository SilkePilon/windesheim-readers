import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Today's three quests with progress and their XP reward. */
export function QuestCard({ quests, className }: { quests: Me["quests"]; className?: string }) {
  const { t } = useTranslation();
  if (!quests.length) return null;
  return (
    <Card className={cn("gap-3 px-4", className)}>
      <h2 className="font-heading text-base font-semibold">{t("quests.title")}</h2>
      <ul className="flex flex-col gap-3">
        {quests.map((q) => {
          const shown = Math.min(q.progress, q.target);
          return (
            <li key={q.id} className="flex flex-col gap-1.5">
              <div className="flex items-start gap-2">
                <span className={cn("min-w-0 flex-1 text-sm leading-snug font-bold", q.done && "text-muted-foreground")}>
                  {t(`quests.names.${q.id}`, { n: q.target })}
                </span>
                {q.done ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-extrabold text-success-shade dark:text-success">
                    <Check className="size-4" strokeWidth={3} aria-hidden /> {t("quests.completed")}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "shrink-0 font-heading text-sm font-semibold tabular-nums",
                      shown > 0 ? "text-success-shade dark:text-success" : "text-muted-foreground",
                    )}
                  >
                    {shown}/{q.target}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-track">
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${(shown / q.target) * 100}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs font-extrabold text-muted-foreground tabular-nums">
                  {t("quests.reward", { n: q.reward })}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
