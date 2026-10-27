import { createElement } from "react";
import { toast } from "sonner";
import i18n from "./i18n";
import { levelFromXp } from "@shared/game";
import { BADGES } from "@shared/badges";
import { BADGE_ICON } from "@/components/game/badge-icons";
import { QUESTS } from "@shared/quests";
import type { XpResult } from "./types";

/** Show toasts for XP gains, level-ups, completed quests and new badges. */
export function celebrate(res: Partial<XpResult> | undefined, opts: { quietXp?: boolean } = {}) {
  if (!res) return;
  const t = i18n.t.bind(i18n);
  if (res.gained && res.xp !== undefined) {
    const before = levelFromXp(res.xp - res.gained).level;
    const after = levelFromXp(res.xp).level;
    if (after > before) toast.success(t("celebrate.levelUp", { n: after }), { icon: "🚀" });
    else if (!opts.quietXp) toast(`+${res.gained} XP`, { icon: "✨", duration: 1500 });
  }
  // Same celebratory toast as level-up: one moment per completed quest.
  for (const q of res.quests ?? []) {
    const { target, reward } = QUESTS[q];
    toast.success(t("quests.done", { name: t(`quests.names.${q}`, { n: target }), xp: reward }), { icon: "🎯", duration: 4000 });
  }
  for (const b of res.newBadges ?? []) {
    // The catalogue's lucide icon (part 2 of the polish batch swaps this for the badge tile).
    const def = BADGES[b];
    if (!def) continue;
    toast.success(t("celebrate.badge", { name: t(`badges.${b}.name`) }), {
      description: t(`badges.${b}.desc`),
      icon: createElement(BADGE_ICON[def.icon], { className: "size-4", strokeWidth: 2.4 }),
      duration: 4000,
    });
  }
}
