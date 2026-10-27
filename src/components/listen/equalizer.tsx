import { cn } from "@/lib/utils";

/**
 * A gentle equaliser: rounded bars that bob while `playing` and rest as short stubs
 * when paused. Pure CSS (`eq-bar` in index.css); still under prefers-reduced-motion.
 * Decorative only.
 */
export function Equalizer({ playing, bars = 4, className, barClassName }: { playing: boolean; bars?: number; className?: string; barClassName?: string }) {
  return (
    <span aria-hidden data-playing={playing || undefined} className={cn("eq inline-flex h-5 items-end gap-[3px]", className)}>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className={cn("eq-bar w-[3px] rounded-full bg-current", barClassName)} style={{ animationDelay: `-${(i * 173) % 520}ms`, animationDuration: `${720 + ((i * 263) % 480)}ms` }} />
      ))}
    </span>
  );
}
