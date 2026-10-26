import { toast } from "sonner";
import i18n from "./i18n";
import { BADGES, levelFromXp } from "@shared/game";
import type { XpResult } from "./types";

/** Show toasts for XP gains, level-ups and new badges. */
export function celebrate(res: Partial<XpResult> | undefined, opts: { quietXp?: boolean } = {}) {
  if (!res) return;
  const t = i18n.t.bind(i18n);
  if (res.gained && res.xp !== undefined) {
    const before = levelFromXp(res.xp - res.gained).level;
    const after = levelFromXp(res.xp).level;
    if (after > before) toast.success(t("celebrate.levelUp", { n: after }), { icon: "🚀" });
    else if (!opts.quietXp) toast(`+${res.gained} XP`, { icon: "✨", duration: 1500 });
  }
  for (const b of res.newBadges ?? []) {
    toast.success(t("celebrate.badge", { name: t(`badges.${b}.name`) }), { icon: BADGES[b].icon, duration: 4000 });
  }
}
