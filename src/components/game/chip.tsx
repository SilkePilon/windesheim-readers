import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  // Light mode uses the shade for text: the fill colours are too light on white.
  streak: "text-warning-shade dark:text-warning",
  level: "text-primary",
  xp: "text-success-shade dark:text-success",
} as const;

/** Small chunky stat chip (streak, level, XP) for the home top row. */
export function Chip({ tone, className, ...props }: ComponentProps<"span"> & { tone: keyof typeof TONES }) {
  return (
    <span
      data-slot="chip"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-xl bg-card px-2.5 font-heading text-[15px] font-semibold whitespace-nowrap tabular-nums shadow-[0_3px_0_var(--chunky)] [&_svg]:size-4 [&_svg]:shrink-0",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
