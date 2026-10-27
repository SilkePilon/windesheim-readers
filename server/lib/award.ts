// Pure, dependency-injected XP + quest award flow (no DB imports, so it's unit-testable).
import type { QuestEvent, QuestId } from "../../shared/quests";
import type { XpBadgeContext, XpResult } from "./game";
import type { QuestEventResult } from "./quests";
import type { BadgeId } from "../../shared/badges";

export interface AwardDeps {
  /** May leave the XP badges to `checkBadges` by returning `badgeCtx` (see awardXpOnly). */
  awardXp: (userId: string, amount: number, reason: string) => Promise<XpResult & { badgeCtx?: XpBadgeContext }>;
  recordQuestEvent: (userId: string, e: QuestEvent) => Promise<QuestEventResult>;
  /** One badge check for the whole action (XP + cards, quiz, mastery, ...); see server/lib/badges.ts. */
  checkBadges?: (userId: string, reason: string, ctx: { xp?: XpBadgeContext; lessonId?: string }) => Promise<BadgeId[]>;
}

/**
 * Award XP, then feed the action's quest events (plus the xp itself) to the daily quests,
 * then check the badges the action can earn.
 * Quest reward XP is folded into `xp`/`gained` so the client sees level-ups it causes.
 * Quests are a bonus: if they fail, the (already written) action still succeeds without them.
 */
export async function awardWithQuests(
  deps: AwardDeps,
  userId: string,
  amount: number,
  reason: string,
  events: QuestEvent[] = [],
  /** The lesson the action was on, so mastery badges only look at it. */
  lessonId?: string,
): Promise<XpResult> {
  const { badgeCtx, ...res } = await deps.awardXp(userId, amount, reason);
  let out = res;
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
    if (quests.size) out = { ...res, xp, gained, newBadges, quests: [...quests] };
  } catch (err) {
    console.error("[quests] recording quest progress failed; returning the award without quests", err);
  }
  // Badges are a bonus too: a failing check never fails the (already written) action.
  if (deps.checkBadges) {
    try {
      const extra = (await deps.checkBadges(userId, reason, { xp: badgeCtx, lessonId })).filter((b) => !out.newBadges.includes(b));
      if (extra.length) out = { ...out, newBadges: [...out.newBadges, ...extra] };
    } catch (err) {
      console.error("[badges] checking badges failed; returning the award without them", err);
    }
  }
  return out;
}
