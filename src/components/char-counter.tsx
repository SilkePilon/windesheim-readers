import { useTranslation } from "react-i18next";
import { nearLimit } from "@shared/limits";
import { cn } from "@/lib/utils";

/**
 * "812 / 1000": a quiet counter that only shows once the text uses 80% of its limit,
 * and turns red at the limit (the input's maxLength stops typing there).
 */
export function CharCounter({ value, max, className }: { value: string; max: number; className?: string }) {
  const { t } = useTranslation();
  if (!nearLimit(value, max)) return null;
  const full = value.length >= max;
  return (
    <span
      aria-live="polite"
      aria-label={t("common.charsLeft", { count: Math.max(0, max - value.length) })}
      className={cn("shrink-0 text-[11px] font-bold tabular-nums", full ? "text-danger-shade dark:text-danger" : "text-muted-foreground", className)}
    >
      {value.length} / {max}
    </span>
  );
}
