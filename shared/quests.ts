export type QuestId = "review_cards" | "quiz_80" | "explain_60" | "earn_xp" | "open_answer" | "two_lessons";

export const QUESTS: Record<QuestId, { target: number; reward: number }> = {
  review_cards: { target: 20, reward: 15 },
  quiz_80: { target: 1, reward: 15 },
  explain_60: { target: 1, reward: 15 },
  earn_xp: { target: 60, reward: 10 },
  open_answer: { target: 1, reward: 10 },
  two_lessons: { target: 2, reward: 10 },
};

const IDS = Object.keys(QUESTS) as QuestId[];

export type QuestEvent =
  | { kind: "card_review" }
  | { kind: "quiz_submit"; pct: number; lessonId: string }
  | { kind: "explain"; score: number; lessonId: string }
  | { kind: "open"; lessonId: string }
  | { kind: "card_lesson"; lessonId: string }
  | { kind: "xp"; amount: number; reason: string };

function fnv1a(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three distinct quests for this user on this day, deterministic. */
export function questsForDay(userId: string, dayKey: string): QuestId[] {
  const rand = mulberry32(fnv1a(`${userId}:${dayKey}`));
  const ids = [...IDS];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return ids.slice(0, 3);
}

/** Pure progress reducer for a single quest. */
export function applyEvent(
  q: QuestId,
  progress: number,
  seenLessons: string[],
  e: QuestEvent,
): { progress: number; seenLessons: string[] } {
  let p = progress;
  let seen = seenLessons;
  switch (q) {
    case "review_cards":
      if (e.kind === "card_review") p += 1;
      break;
    case "quiz_80":
      if (e.kind === "quiz_submit" && e.pct >= 0.8) p += 1;
      break;
    case "explain_60":
      if (e.kind === "explain" && e.score >= 60) p += 1;
      break;
    case "open_answer":
      if (e.kind === "open") p += 1;
      break;
    case "earn_xp":
      if (e.kind === "xp" && e.reason !== "quest") p += e.amount;
      break;
    case "two_lessons":
      if (e.kind !== "card_review" && e.kind !== "xp" && !seen.includes(e.lessonId)) {
        seen = [...seen, e.lessonId];
        p = seen.length;
      }
      break;
  }
  return { progress: p, seenLessons: seen };
}
