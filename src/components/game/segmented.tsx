import { cn } from "@/lib/utils";

/**
 * Chunky segmented toggle: a track-coloured trough with the active option as a raised
 * card. Arrow keys move between options (radio group semantics).
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length]!;
    onChange(next.value);
    return next.value;
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid auto-cols-fr grid-flow-col rounded-[14px] bg-track p-1", className)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const v = move(e.key === "ArrowRight" ? 1 : -1);
        e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${v}"]`)?.focus();
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-9 truncate rounded-[11px] px-3 font-heading text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              on ? "bg-card text-foreground shadow-[0_3px_0_var(--chunky)]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
