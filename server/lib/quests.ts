import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { awardXp, dayKey } from "./game";
import type { BadgeId } from "../../shared/game";
import { QUESTS, applyEvent, questsForDay, type QuestEvent, type QuestId } from "../../shared/quests";

const P = schema.questProgress;

async function rowsForDay(userId: string, day: string) {
  return db.select().from(P).where(and(eq(P.userId, userId), eq(P.dayKey, day)));
}

export interface QuestEventResult {
  completed: QuestId[];
  /** Reward XP awarded for the completed quests. */
  reward: number;
  /** The user's XP total after the last reward, if any was awarded. */
  xp?: number;
  newBadges: BadgeId[];
}

/**
 * Apply an event to today's quests. Awards XP for newly completed quests.
 * Writes are atomic SQL increments (and a JSON set-insert for two_lessons), so concurrent
 * events can't lose progress even though the "did anything change" check uses a snapshot.
 */
export async function recordQuestEvent(userId: string, e: QuestEvent): Promise<QuestEventResult> {
  const day = dayKey();
  const existing = new Map((await rowsForDay(userId, day)).map((r) => [r.questId, r]));
  const out: QuestEventResult = { completed: [], reward: 0, newBadges: [] };

  for (const q of questsForDay(userId, day)) {
    const row = existing.get(q);
    if (row?.completedAt) continue;
    const prev = { progress: row?.progress ?? 0, seen: row?.seenLessons ?? [] };
    const next = applyEvent(q, prev.progress, prev.seen, e);
    if (next.progress === prev.progress && next.seenLessons.length === prev.seen.length) continue;

    // Values for a brand-new row (the event applied to an empty quest).
    const fresh = applyEvent(q, 0, [], e);
    let set;
    if (q === "two_lessons" && "lessonId" in e) {
      const seen = sql`EXISTS (SELECT 1 FROM json_each(${P.seenLessons}) WHERE value = ${e.lessonId})`;
      set = {
        seenLessons: sql`CASE WHEN ${seen} THEN ${P.seenLessons} ELSE json_insert(${P.seenLessons}, '$[#]', ${e.lessonId}) END`,
        progress: sql`json_array_length(${P.seenLessons}) + CASE WHEN ${seen} THEN 0 ELSE 1 END`,
      };
    } else {
      set = { progress: sql`${P.progress} + ${next.progress - prev.progress}` };
    }
    const [saved] = await db
      .insert(P)
      .values({ userId, dayKey: day, questId: q, progress: fresh.progress, seenLessons: fresh.seenLessons })
      .onConflictDoUpdate({ target: [P.userId, P.dayKey, P.questId], set })
      .returning();
    if (!saved || saved.progress < QUESTS[q].target) continue;

    // Claim completion atomically so concurrent events cannot award twice.
    const claimed = await db
      .update(P)
      .set({ completedAt: new Date() })
      .where(and(eq(P.userId, userId), eq(P.dayKey, day), eq(P.questId, q), isNull(P.completedAt)))
      .returning();
    if (!claimed.length) continue;
    out.completed.push(q);
    const { reward } = QUESTS[q];
    const res = await awardXp(userId, reward, "quest");
    out.reward += res.gained;
    out.xp = res.xp;
    out.newBadges.push(...res.newBadges);
    // Quest XP never advances quests (earn_xp ignores reason "quest"), but keep the event stream complete.
    const nested = await recordQuestEvent(userId, { kind: "xp", amount: reward, reason: "quest" });
    out.completed.push(...nested.completed);
    out.reward += nested.reward;
    if (nested.xp !== undefined) out.xp = nested.xp;
    out.newBadges.push(...nested.newBadges);
  }
  return out;
}

export async function getQuests(userId: string) {
  const day = dayKey();
  const rows = new Map((await rowsForDay(userId, day)).map((r) => [r.questId, r]));
  return questsForDay(userId, day).map((id) => {
    const { target, reward } = QUESTS[id];
    const row = rows.get(id);
    const progress = Math.min(target, row?.progress ?? 0);
    return { id, target, reward, progress, done: !!row?.completedAt };
  });
}
