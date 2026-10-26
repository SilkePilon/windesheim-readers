import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const SEGMENTS = 5;

/**
 * Lesson level as 5 chunky segments (level = floor(mastery × 5)).
 * `sm` is the mini bar under path nodes; `lg` is the lesson header bar with an optional
 * label above and hint below.
 */
export function LevelBar({
  level,
  size = "lg",
  tone = "success",
  label,
  hint,
  className,
}: {
  level: number;
  size?: "sm" | "lg";
  tone?: "success" | "primary";
  label?: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const filled = Math.max(0, Math.min(SEGMENTS, Math.round(level)));
  const fill =
    tone === "success"
      ? size === "lg"
        ? "bg-success shadow-[inset_0_-4px_0_var(--success-shade)]"
        : "bg-success"
      : size === "lg"
        ? "bg-primary shadow-[inset_0_-4px_0_var(--primary-shade)]"
        : "bg-primary";

  const bar = (
    <div
      role="img"
      aria-label={t("common.levelOf", { n: filled })}
      className={cn("flex", size === "sm" ? "w-14 gap-[3px]" : "w-full gap-1.5", !label && !hint && className)}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "flex-1",
            size === "sm" ? "h-1.5 rounded-full" : "h-3.5 rounded-[9px]",
            i < filled ? fill : "bg-track",
          )}
        />
      ))}
    </div>
  );

  if (!label && !hint) return bar;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && <div className="font-heading text-sm font-semibold">{label}</div>}
      {bar}
      {hint && <div className="text-sm text-muted-foreground">{hint}</div>}
    </div>
  );
}
