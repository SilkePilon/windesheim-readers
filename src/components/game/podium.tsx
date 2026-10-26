import type { ReactNode } from "react";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { cn } from "@/lib/utils";

export interface PodiumEntry {
  /** Shown under the avatar (e.g. the nickname, or "Jij" for yourself). */
  name: string;
  /** Used for the avatar initial and colour; defaults to `name`. */
  avatarName?: string;
  /** Score line under the name, e.g. "340 XP". */
  value: ReactNode;
  me?: boolean;
}

// Places 1–3: gold, silver, bronze. The 1st step is the tallest and sits in the centre.
const STEPS = [
  { order: "order-2", h: "h-[88px]", fill: "bg-gold shadow-[inset_0_-5px_0_var(--gold-shade)]", avatar: "size-14 text-xl" },
  { order: "order-1", h: "h-[62px]", fill: "bg-[#A9B6CF] shadow-[inset_0_-5px_0_rgb(0_0_0/0.12)]", avatar: "size-[46px] text-[17px]" },
  { order: "order-3", h: "h-[46px]", fill: "bg-[#E59B62] shadow-[inset_0_-5px_0_rgb(0_0_0/0.14)]", avatar: "size-[46px] text-[17px]" },
] as const;

/**
 * Podium for the top 3 (`entries` in rank order; fewer than 3 is fine). Shown as 2nd,
 * 1st, 3rd via CSS order, so the DOM (and screen readers) keep rank order. Reused by the
 * leaderboard and the battle result.
 */
export function Podium({ entries, className }: { entries: PodiumEntry[]; className?: string }) {
  return (
    <ol className={cn("grid grid-cols-3 items-end gap-2 text-center", className)}>
      {[0, 1, 2].map((place) => {
        const e = entries[place];
        const step = STEPS[place]!;
        return (
          <li key={place} className={cn("flex min-w-0 flex-col items-center", step.order, !e && "invisible")} aria-hidden={!e}>
            {e && (
              <>
                <PlayerAvatar name={e.avatarName ?? e.name} me={e.me} className={cn("mb-1.5", step.avatar)} />
                <span className={cn("w-full px-0.5 text-[13px] leading-tight font-bold break-words hyphens-auto", e.me && "text-primary")}>{e.name}</span>
                <span className="font-heading text-xs font-semibold text-muted-foreground tabular-nums">{e.value}</span>
              </>
            )}
            <div
              className={cn(
                "mt-1.5 w-full rounded-t-[14px] rounded-b-md pt-2 font-heading text-[22px] leading-none font-bold text-white [text-shadow:0_2px_0_rgb(0_0_0/0.12)]",
                step.h,
                step.fill,
              )}
            >
              {place + 1}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
