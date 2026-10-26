import { cn } from "@/lib/utils";

/** Circular progress ring. value: 0..1 */
export function MasteryRing({
  value,
  size = 44,
  stroke = 4,
  className,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const color = v >= 0.9 ? "text-emerald-500" : v >= 0.5 ? "text-primary" : v > 0 ? "text-amber-500" : "text-muted-foreground/30";
  return (
    <div className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className={cn("transition-[stroke-dashoffset] duration-700", color)}
        />
      </svg>
      <span className="absolute text-[10px] font-semibold tabular-nums">{children ?? `${Math.round(v * 100)}%`}</span>
    </div>
  );
}
