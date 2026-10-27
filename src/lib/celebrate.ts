import i18n from "./i18n";
import { levelFromXp, levelTitleIndex } from "@shared/game";
import { BADGES } from "@shared/badges";
import { QUESTS } from "@shared/quests";
import { notify } from "./notify";
import type { XpResult } from "./types";

/** Show toasts for XP gains, level-ups, completed quests and new badges. */
export function celebrate(res: Partial<XpResult> | undefined, opts: { quietXp?: boolean } = {}) {
  if (!res) return;
  const t = i18n.t.bind(i18n);
  if (res.gained && res.xp !== undefined) {
    const before = levelFromXp(res.xp - res.gained).level;
    const after = levelFromXp(res.xp).level;
    if (after > before) {
      const titles = t("profile.levelTitles", { returnObjects: true }) as string[];
      notify.levelUp(after, titles[levelTitleIndex(after)] ?? "");
    } else if (!opts.quietXp) notify.xp(res.gained);
  }
  // One moment per completed quest.
  for (const q of res.quests ?? []) {
    const { target, reward } = QUESTS[q];
    notify.quest(t(`quests.names.${q}`, { n: target }), reward);
  }
  for (const b of res.newBadges ?? []) {
    if (BADGES[b]) notify.badge(b);
  }
}
