// Shared between client and server.

export const DAILY_XP_GOAL = 50;

export const XP = {
  summaryRead: 5,
  card: { 1: 1, 2: 2, 3: 3, 4: 3 } as Record<number, number>, // by FSRS rating
  quizCorrect: 10,
  quizPerfectBonus: 20,
  explainPerPoint: 0.3, // score 0-100 -> up to 30 xp
  openPerPoint: 0.2,
  battlePlace: [50, 30, 20], // 1st, 2nd, 3rd; others get battleParticipation
  battleParticipation: 10,
};

/** XP needed to go from level n to n+1 grows linearly: 100, 150, 200 ... */
export function levelFromXp(xp: number) {
  let level = 1;
  let need = 100;
  let rest = xp;
  while (rest >= need) {
    rest -= need;
    level++;
    need += 50;
  }
  return { level, intoLevel: rest, levelSize: need, progress: rest / need };
}

export const LEVEL_TITLES = [
  "Nieuwkomer",
  "Stagiair",
  "Junior",
  "Medior",
  "Senior",
  "Procesexpert",
  "Architect",
  "Bedrijfskundige",
  "Meester",
  "Legende",
];

export function levelTitle(level: number) {
  return LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 2))]!;
}

export const BADGES = {
  first_steps: { icon: "🌱" },
  streak_3: { icon: "🔥" },
  streak_7: { icon: "⚡" },
  streak_30: { icon: "🏆" },
  perfect_quiz: { icon: "💯" },
  cards_100: { icon: "🃏" },
  cards_500: { icon: "🧠" },
  explain_master: { icon: "🎓" },
  lesson_master: { icon: "⭐" },
  battle_winner: { icon: "⚔️" },
  night_owl: { icon: "🦉" },
  early_bird: { icon: "🐦" },
} as const;

export type BadgeId = keyof typeof BADGES;

/** mastery 0..1 for a lesson */
export const MASTERY_WEIGHTS = { quiz: 0.4, cards: 0.3, explain: 0.2, read: 0.1 } as const;

export function computeMastery(p: { bestQuiz: number; bestExplain: number; summaryRead: boolean; cardMastery: number }) {
  return (
    MASTERY_WEIGHTS.quiz * p.bestQuiz +
    MASTERY_WEIGHTS.cards * p.cardMastery +
    MASTERY_WEIGHTS.explain * p.bestExplain +
    MASTERY_WEIGHTS.read * (p.summaryRead ? 1 : 0)
  );
}
