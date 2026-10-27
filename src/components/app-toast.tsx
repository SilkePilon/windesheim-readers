import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronsUp, CircleAlert, CircleCheck, Info, Sparkles, Target, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { BadgeId } from "@shared/badges";
import { BadgeIconTile } from "@/components/game/badge-tile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * Speelveld toasts, rendered through `toast.custom` (see `@/lib/notify`). The look follows
 * <Notice>: a chunky card, a 40px tone tile with dark text on the fill (contrast rules in
 * index.css), Fredoka title and Nunito description. Each card marks itself with
 * `data-app-toast` so index.css can fade the content of stacked (collapsed) toasts and
 * size the sonner <li> on wider screens.
 */

export type ToastTone = "success" | "error" | "warning" | "info";
export type ToastAction = { label: string; onClick: () => void };

const TONES: Record<ToastTone, { icon: LucideIcon; tile: string }> = {
  success: { icon: CircleCheck, tile: "bg-success text-success-foreground shadow-[0_3px_0_var(--success-shade)]" },
  error: { icon: CircleAlert, tile: "bg-danger text-danger-foreground shadow-[0_3px_0_var(--danger-shade)]" },
  warning: { icon: TriangleAlert, tile: "bg-warning text-warning-foreground shadow-[0_3px_0_var(--warning-shade)]" },
  info: { icon: Info, tile: "bg-info text-info-foreground shadow-[0_3px_0_var(--info-shade)]" },
};

function CloseButton({ id, className }: { id: string | number; className?: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-label={t("common.close")}
      onClick={() => toast.dismiss(id)}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <X className="size-4" strokeWidth={2.6} />
    </button>
  );
}

/** The shared card: chunky surface, leading tile, text block, close button. */
function ToastCard({
  id,
  role,
  tile,
  children,
  className,
  closeClassName,
}: {
  id: string | number;
  role: "status" | "alert";
  tile: ReactNode;
  children: ReactNode;
  className?: string;
  closeClassName?: string;
}) {
  return (
    <div
      data-app-toast
      role={role}
      className={cn(
        "flex w-full items-start gap-3 rounded-[20px] bg-card p-3.5 pr-2 text-left text-card-foreground shadow-[0_5px_0_var(--chunky)]",
        className,
      )}
    >
      {tile}
      <div className="min-w-0 flex-1 self-center">{children}</div>
      <CloseButton id={id} className={closeClassName} />
    </div>
  );
}

export function AppToast({
  id,
  tone,
  title,
  description,
  action,
}: {
  id: string | number;
  tone: ToastTone;
  title: ReactNode;
  description?: ReactNode;
  action?: ToastAction;
}) {
  const { icon: Icon, tile } = TONES[tone];
  return (
    <ToastCard
      id={id}
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      tile={
        <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-[12px]", tile)}>
          <Icon className="size-[22px]" strokeWidth={2.5} />
        </span>
      }
    >
      <p className="font-heading text-base leading-snug font-semibold break-words">{title}</p>
      {description && <div className="mt-0.5 font-sans text-sm leading-snug font-semibold break-words text-muted-foreground">{description}</div>}
      {action && (
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => {
            action.onClick();
            toast.dismiss(id);
          }}
        >
          {action.label}
        </Button>
      )}
    </ToastCard>
  );
}

/** XP gain: a compact gold pill, centred on phones and right-aligned on wider screens. */
export function XpToast({ gained }: { gained: number }) {
  return (
    <div data-app-toast className="flex w-full justify-center md:justify-end">
      <p
        role="status"
        className="inline-flex items-center gap-1.5 rounded-full bg-gold py-2 pr-4 pl-3 font-heading text-lg leading-none font-bold text-gold-foreground shadow-[0_4px_0_var(--gold-shade)]"
      >
        <Sparkles aria-hidden className="size-5" strokeWidth={2.5} />
        <span className="tabular-nums">+{gained} XP</span>
      </p>
    </div>
  );
}

/** Level up: the big primary card with a gold tile, "Level 5!" and the level title. */
export function LevelUpToast({ id, level, title }: { id: string | number; level: number; title: string }) {
  const { t } = useTranslation();
  return (
    <ToastCard
      id={id}
      role="status"
      className="items-center gap-4 bg-primary p-4 pr-2 text-primary-foreground shadow-[0_5px_0_var(--primary-shade)]"
      closeClassName="self-start text-primary-foreground/80 hover:bg-white/15 hover:text-primary-foreground"
      tile={
        <span
          aria-hidden
          className="grid size-14 shrink-0 place-items-center rounded-[16px] bg-gold text-gold-foreground shadow-[0_4px_0_var(--gold-shade)]"
        >
          <ChevronsUp className="size-8" strokeWidth={2.6} />
        </span>
      }
    >
      <p className="text-xs font-extrabold tracking-wide text-primary-foreground/80 uppercase">{t("celebrate.levelUpKicker")}</p>
      <p className="font-heading text-[28px] leading-tight font-bold">{t("celebrate.levelUpTitle", { n: level })}</p>
      <p className="font-sans text-base leading-snug font-bold">{title}</p>
    </ToastCard>
  );
}

/** Quest done: a mint card with a Target tile, the quest name and its reward. */
export function QuestToast({ id, name, xp }: { id: string | number; name: string; xp: number }) {
  const { t } = useTranslation();
  return (
    <ToastCard
      id={id}
      role="status"
      className="items-center bg-success text-success-foreground shadow-[0_5px_0_var(--success-shade)]"
      closeClassName="self-start text-success-foreground/75 hover:bg-black/10 hover:text-success-foreground"
      tile={
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-white text-success-shade shadow-[0_3px_0_var(--success-shade)]"
        >
          <Target className="size-[22px]" strokeWidth={2.5} />
        </span>
      }
    >
      <p className="text-xs font-extrabold tracking-wide uppercase opacity-80">{t("celebrate.questDone")}</p>
      <p className="font-heading text-base leading-snug font-semibold break-words">{name}</p>
      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-xs font-extrabold text-gold-foreground tabular-nums">
        <Sparkles aria-hidden className="size-3" strokeWidth={2.8} />
        {t("quests.reward", { n: xp })}
      </p>
    </ToastCard>
  );
}

/** New badge: the profile's medal tile, "Nieuwe badge: <naam>" and its description. */
export function BadgeToast({ id, badge }: { id: string | number; badge: BadgeId }) {
  const { t } = useTranslation();
  return (
    <ToastCard
      id={id}
      role="status"
      className="items-center"
      closeClassName="self-start"
      tile={<BadgeIconTile id={badge} earned className="size-12 shrink-0 rounded-[16px] p-[2.5px] [&>span]:rounded-[13.5px]" />}
    >
      <p className="font-heading text-base leading-snug font-semibold break-words">{t("celebrate.badge", { name: t(`badges.${badge}.name`) })}</p>
      <p className="mt-0.5 font-sans text-sm leading-snug font-semibold break-words text-muted-foreground">{t(`badges.${badge}.desc`)}</p>
    </ToastCard>
  );
}
