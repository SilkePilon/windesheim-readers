import type { ReactNode } from "react";
import { toast } from "sonner";
import type { BadgeId } from "@shared/badges";
import { AppToast, BadgeToast, LevelUpToast, QuestToast, XpToast, type ToastAction, type ToastTone } from "@/components/app-toast";

type NotifyOptions = { description?: ReactNode; action?: ToastAction; duration?: number };

function show(tone: ToastTone, title: ReactNode, { duration, ...rest }: NotifyOptions = {}) {
  return toast.custom((id) => <AppToast id={id} tone={tone} title={title} {...rest} />, { duration });
}

/**
 * The app's notifications. Use these instead of `toast.*` so every toast gets the
 * Speelveld look (see `@/components/app-toast`).
 */
export const notify = {
  success: (title: ReactNode, opts?: NotifyOptions) => show("success", title, opts),
  error: (title: ReactNode, opts?: NotifyOptions) => show("error", title, opts),
  warning: (title: ReactNode, opts?: NotifyOptions) => show("warning", title, opts),
  info: (title: ReactNode, opts?: NotifyOptions) => show("info", title, opts),

  // Celebrations (driven by `celebrate()`).
  xp: (gained: number) => toast.custom(() => <XpToast gained={gained} />, { duration: 1500 }),
  levelUp: (level: number, title: string) =>
    toast.custom((id) => <LevelUpToast id={id} level={level} title={title} />, { duration: 4000 }),
  quest: (name: string, xp: number) => toast.custom((id) => <QuestToast id={id} name={name} xp={xp} />, { duration: 4000 }),
  badge: (badge: BadgeId) => toast.custom((id) => <BadgeToast id={id} badge={badge} />, { duration: 4000 }),
};
