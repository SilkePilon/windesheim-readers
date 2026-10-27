import { useTranslation } from "react-i18next";
import { BADGES, type BadgeId, type BadgeTier, type BadgeTone } from "@shared/badges";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BADGE_ICON } from "@/components/game/badge-icons";
import { cn } from "@/lib/utils";
import type { BadgeStatus } from "@/lib/types";

// Tone fill with its dark `-foreground` (contrast rules in index.css; primary keeps white),
// plus an inner bottom shade so the tile reads as a chunky medal face.
const TONE: Record<BadgeTone, string> = {
  primary: "bg-primary text-primary-foreground shadow-[inset_0_-4px_0_var(--primary-shade)]",
  info: "bg-info text-info-foreground shadow-[inset_0_-4px_0_var(--info-shade)]",
  success: "bg-success text-success-foreground shadow-[inset_0_-4px_0_var(--success-shade)]",
  warning: "bg-warning text-warning-foreground shadow-[inset_0_-4px_0_var(--warning-shade)]",
  danger: "bg-danger text-danger-foreground shadow-[inset_0_-4px_0_var(--danger-shade)]",
  gold: "bg-gold text-gold-foreground shadow-[inset_0_-4px_0_var(--gold-shade)]",
  hard: "bg-hard text-gold-foreground shadow-[inset_0_-4px_0_var(--hard-shade)]",
};

// Tier = the medal rim around the face (same bronze/silver as the podium steps).
const TIER: Record<BadgeTier, string> = {
  bronze: "bg-[#E59B62] shadow-[0_4px_0_#B86F36]",
  silver: "bg-[#A9B6CF] shadow-[0_4px_0_#7D8AA6]",
  gold: "bg-gold shadow-[0_4px_0_var(--gold-shade)]",
};

/**
 * A badge as a chunky medal: the tier-coloured rim around a tone-coloured face with the
 * badge's lucide icon. Locked badges are a muted track tile. Size it with `className`
 * (e.g. `size-10` in a toast; the profile grid lets it fill the cell).
 */
export function BadgeIconTile({ id, earned, className, iconClassName }: { id: BadgeId; earned: boolean; className?: string; iconClassName?: string }) {
  const { icon, tone, tier } = BADGES[id];
  const Icon = BADGE_ICON[icon];
  return (
    <span
      aria-hidden
      data-tier={earned ? tier : "locked"}
      className={cn(
        "grid aspect-square place-items-center rounded-[20px] p-[3px]",
        earned ? TIER[tier] : "bg-track shadow-[0_4px_0_var(--chunky)]",
        className,
      )}
    >
      <span className={cn("grid size-full place-items-center rounded-[17px]", earned ? TONE[tone] : "text-muted-foreground/55")}>
        <Icon className={cn("size-[45%]", iconClassName)} strokeWidth={2.4} />
      </span>
    </span>
  );
}

function ProgressBar({ value, target, className }: { value: number; target: number; className?: string }) {
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-track", className)}>
      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((value / target) * 100)}%` }} />
    </span>
  );
}

/** Profile grid cell: the medal, its name, a progress bar when locked; tap → details. */
export function BadgeCell({ badge }: { badge: BadgeStatus }) {
  const { t, i18n } = useTranslation();
  const { id, earnedAt, progress } = badge;
  const { tier } = BADGES[id];
  const name = t(`badges.${id}.name`);
  const num = (n: number) => n.toLocaleString(i18n.language);
  const progressText = progress && t("profile.badgeProgress", { value: num(progress.value), target: num(progress.target) });
  return (
    <Popover>
      <PopoverTrigger
        aria-label={earnedAt ? name : `${name}, ${t("profile.lockedBadge")}${progressText ? ` (${progressText})` : ""}`}
        className="group flex min-w-0 flex-col items-center gap-1.5 rounded-[20px] text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <BadgeIconTile
          id={id}
          earned={!!earnedAt}
          className={cn(
            "w-full transition-[translate,box-shadow] duration-100 group-active:translate-y-1 group-active:shadow-none",
            "motion-reduce:transition-none motion-reduce:group-active:translate-y-0",
          )}
        />
        <span
          className={cn(
            // Names wrap between words only (no hyphenation, balanced lines); every name fits a
            // 360px-wide phone's cell (checked in the P1 fix round).
            "-mx-1 line-clamp-2 w-[calc(100%+0.5rem)] text-[10.5px] leading-tight font-bold text-balance hyphens-none",
            !earnedAt && "text-muted-foreground",
          )}
        >
          {name}
        </span>
        {!earnedAt && progress && (
          <span className="-mt-0.5 flex w-full flex-col items-center gap-0.5">
            <ProgressBar value={progress.value} target={progress.target} className="max-w-14" />
            <span className="text-[10px] leading-none font-bold text-muted-foreground tabular-nums">{progressText}</span>
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent collisionPadding={12} className="w-64 gap-0 rounded-[16px] p-3.5 shadow-[0_5px_0_var(--chunky)] ring-0">
        <div className="flex items-center gap-3">
          <BadgeIconTile id={id} earned={!!earnedAt} className="size-12 shrink-0 rounded-[16px] p-[2.5px] [&>span]:rounded-[13.5px]" />
          <div className="min-w-0">
            <p className="font-heading text-base leading-tight font-semibold break-words">{name}</p>
            <p className="text-xs font-bold text-muted-foreground">{t("profile.badgeTier", { tier: t(`badgeTiers.${tier}`) })}</p>
          </div>
        </div>
        <p className="mt-2 text-sm font-semibold">{t(`badges.${id}.desc`)}</p>
        {earnedAt ? (
          <p className="mt-1.5 text-xs font-bold text-success-shade dark:text-success">
            {t("profile.earnedOn", {
              date: new Date(earnedAt).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" }),
            })}
          </p>
        ) : progress ? (
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar value={progress.value} target={progress.target} />
            <span className="shrink-0 text-xs font-bold text-muted-foreground tabular-nums">{progressText}</span>
          </div>
        ) : (
          <p className="mt-1.5 text-xs font-bold text-muted-foreground">{t("profile.lockedBadge")}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
