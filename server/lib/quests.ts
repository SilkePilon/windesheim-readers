import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db";
import { awardXp, dayKey } from "./game";
import { QUESTS, applyEvent, questsForDay, type QuestEvent, type QuestId } from "../../shared/quests";

const P = schema.questProgress;

async function rowsForDay(userId: string, day: string) {
  return db.select().from(P).where(and(eq(P.userId, userId), eq(P.dayKey, day)));
}

/** Apply an event to today's quests. Awards XP for newly completed quests. */
export async function recordQuestEvent(userId: string, e: QuestEvent): Promise<{ completed: QuestId[] }> {
  const day = dayKey();
  const existing = new Map((await rowsForDay(userId, day)).map((r) => [r.questId, r]));
  const completed: QuestId[] = [];

  for (const q of questsForDay(userId, day)) {
    const row = existing.get(q);
    if (row?.completedAt) continue;
    const next = applyEvent(q, row?.progress ?? 0, row?.seenLessons ?? [], e);
    if (next.progress === (row?.progress ?? 0) && next.seenLessons.length === (row?.seenLessons.length ?? 0)) continue;

    const done = next.progress >= QUESTS[q].target;
    await db
      .insert(P)
      .values({ userId, dayKey: day, questId: q, progress: next.progress, seenLessons: next.seenLessons })
      .onConflictDoUpdate({ target: [P.userId, P.dayKey, P.questId], set: { progress: next.progress, seenLessons: next.seenLessons } });
    if (!done) continue;

    // Claim completion atomically so concurrent events cannot award twice.
    const claimed = await db
      .update(P)
      .set({ completedAt: new Date() })
      .where(and(eq(P.userId, userId), eq(P.dayKey, day), eq(P.questId, q), isNull(P.completedAt)))
      .returning();
    if (!claimed.length) continue;
    completed.push(q);
    const { reward } = QUESTS[q];
    await awardXp(userId, reward, "quest");
    await recordQuestEvent(userId, { kind: "xp", amount: reward, reason: "quest" });
  }
  return { completed };
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
