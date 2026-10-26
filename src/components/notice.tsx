import type { ComponentProps, ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type NoticeTone = "danger" | "warning" | "info" | "success";

// Icon tiles use the tone fill with its `-foreground` (dark text in light mode, per index.css).
const TONES: Record<NoticeTone, { icon: LucideIcon; tile: string }> = {
  danger: { icon: CircleAlert, tile: "bg-danger text-danger-foreground shadow-[0_3px_0_var(--danger-shade)]" },
  warning: { icon: TriangleAlert, tile: "bg-warning text-warning-foreground shadow-[0_3px_0_var(--warning-shade)]" },
  info: { icon: Info, tile: "bg-info text-info-foreground shadow-[0_3px_0_var(--info-shade)]" },
  success: { icon: CircleCheck, tile: "bg-success text-success-foreground shadow-[0_3px_0_var(--success-shade)]" },
};

/**
 * Speelveld notice: a chunky card with a coloured icon tile, a title, an optional line of
 * explanation and an optional action (e.g. a retry button). Errors and warnings are
 * announced (`role="alert"`), info and success politely (`role="status"`). `inset` sits
 * inside another card (page-tinted, no shadow); `flat` is the admin look (1px ring).
 */
export function Notice({
  tone = "danger",
  variant = "chunky",
  title,
  description,
  action,
  className,
  ...props
}: Omit<ComponentProps<"div">, "title"> & {
  tone?: NoticeTone;
  variant?: "chunky" | "inset" | "flat";
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  const { icon: Icon, tile } = TONES[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      data-slot="notice"
      data-tone={tone}
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-3 bg-card p-3.5 text-left text-card-foreground",
        variant === "flat"
          ? "rounded-lg ring-1 ring-border"
          : variant === "inset"
            ? "rounded-[16px] bg-background"
            : "rounded-[20px] shadow-[0_5px_0_var(--chunky)]",
        className,
      )}
      {...props}
    >
      <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-[12px]", tile, variant === "flat" && "shadow-none")}>
        <Icon className="size-[22px]" strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1 basis-40 self-center">
        <p className="font-heading text-base leading-snug font-semibold break-words">{title}</p>
        {description && <div className="mt-0.5 font-sans text-sm leading-snug font-semibold break-words text-muted-foreground">{description}</div>}
      </div>
      {action && <div className="ml-auto shrink-0 self-center">{action}</div>}
    </div>
  );
}
