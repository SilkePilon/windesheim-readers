// Pure, dependency-injected XP + quest award flow (no DB imports, so it's unit-testable).
import type { QuestEvent, QuestId } from "../../shared/quests";
import type { XpResult } from "./game";
import type { QuestEventResult } from "./quests";

export interface AwardDeps {
  awardXp: (userId: string, amount: number, reason: string) => Promise<XpResult>;
  recordQuestEvent: (userId: string, e: QuestEvent) => Promise<QuestEventResult>;
}

/**
 * Award XP, then feed the action's quest events (plus the xp itself) to the daily quests.
 * Quest reward XP is folded into `xp`/`gained` so the client sees level-ups it causes.
 * Quests are a bonus: if they fail, the (already written) action still succeeds without them.
 */
export async function awardWithQuests(
  deps: AwardDeps,
  userId: string,
  amount: number,
  reason: string,
  events: QuestEvent[] = [],
): Promise<XpResult> {
  const res = await deps.awardXp(userId, amount, reason);
  try {
    const quests = new Set<QuestId>();
    let { xp, gained } = res;
    const newBadges = [...res.newBadges];
    for (const e of [...events, { kind: "xp", amount: res.gained, reason } as const]) {
      const r = await deps.recordQuestEvent(userId, e);
      for (const q of r.completed) quests.add(q);
      gained += r.reward;
      if (r.xp !== undefined) xp = r.xp;
      for (const b of r.newBadges) if (!newBadges.includes(b)) newBadges.push(b);
    }
    if (!quests.size) return res;
    return { ...res, xp, gained, newBadges, quests: [...quests] };
  } catch (err) {
    console.error("[quests] recording quest progress failed; returning the award without quests", err);
    return res;
  }
}
