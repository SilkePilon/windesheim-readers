import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActivityTone = "primary" | "info" | "success" | "hard" | "danger" | "gold";

const ICON_BG: Record<ActivityTone, string> = {
  primary: "bg-primary text-primary-foreground",
  info: "bg-info text-white",
  success: "bg-success text-white",
  hard: "bg-hard text-white",
  danger: "bg-danger text-white",
  gold: "bg-gold text-gold-foreground",
};

/**
 * One lesson activity (Kaarten, Lezen, Quiz, ...) as a chunky tile: a coloured icon
 * square, a title and a status line. The `highlighted` tile is the recommended next
 * step and is filled primary.
 */
export function ActivityTile({
  icon: Icon,
  tone,
  title,
  status,
  highlighted,
  onClick,
  className,
}: {
  icon: LucideIcon;
  tone: ActivityTone;
  title: string;
  status: string;
  highlighted?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col items-start rounded-[20px] p-3.5 text-left outline-none",
        "transition-[translate,box-shadow,filter] duration-100 hover:brightness-[1.03] focus-visible:ring-3 focus-visible:ring-ring/50",
        "active:translate-y-[5px] active:shadow-none motion-reduce:transition-none motion-reduce:active:translate-y-0",
        highlighted
          ? "bg-primary text-primary-foreground shadow-[0_5px_0_var(--primary-shade)] motion-reduce:active:shadow-[0_5px_0_var(--primary-shade)]"
          : "bg-card text-card-foreground shadow-[0_5px_0_var(--chunky)] motion-reduce:active:shadow-[0_5px_0_var(--chunky)]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mb-2.5 grid size-9 place-items-center rounded-[12px]",
          highlighted ? "bg-white/20 text-primary-foreground" : ICON_BG[tone],
        )}
      >
        <Icon className="size-5" strokeWidth={2.4} />
      </span>
      <span className="block max-w-full font-heading text-base leading-tight font-semibold">{title}</span>
      <span
        className={cn(
          "mt-0.5 block max-w-full text-xs leading-snug",
          highlighted ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        {status}
      </span>
    </button>
  );
}
