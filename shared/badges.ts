// Badge catalogue: the single source of truth for the profile, the toasts and the server.
// Names and descriptions live in the locales (`badges.<id>.name|desc`). The 12 original
// ids (first_steps … early_bird) must stay: users already have them in `user_badge`.

export type BadgeCategory = "streak" | "cards" | "quiz" | "explain" | "mastery" | "worlds" | "battle" | "quests" | "fun";
export type BadgeTier = "bronze" | "silver" | "gold";
/** Speelveld fill colour of an earned badge tile. */
export type BadgeTone = "primary" | "info" | "success" | "warning" | "danger" | "gold" | "hard";

/** Countable things a locked badge can show progress for. */
export type BadgeMetric =
  | "streak"
  | "cards"
  | "quizzes"
  | "perfectQuizzes"
  | "quiz80Lessons"
  | "explanations"
  | "openAnswers"
  | "masteredLessons"
  | "battles"
  | "battleWins"
  | "quests";

/** Lucide icon names (PascalCase, as exported by lucide-react). The client maps them in badge-icons.ts. */
export const BADGE_ICONS = [
  "Flame", "Zap", "CalendarCheck", "Trophy", "Rocket", "FlameKindling",
  "GalleryVerticalEnd", "Layers", "Brain", "BrainCircuit", "Library",
  "CircleHelp", "Target", "Crosshair", "Award", "ListChecks",
  "MessageCircle", "GraduationCap", "Presentation", "PenLine",
  "Star", "Sparkles", "Gem", "CalendarRange", "BookOpenCheck",
  "TreePine", "House", "Building2", "Anchor", "TreePalm", "Sun", "Mountain", "School",
  "Gamepad2", "Swords", "ShieldCheck", "Castle", "ChevronsUp", "Megaphone", "BadgeCheck",
  "Flag", "CircleCheckBig", "Map", "Compass",
  "Sprout", "Moon", "Bird", "PartyPopper", "RefreshCcw", "Medal", "Crown",
] as const;
export type BadgeIcon = (typeof BADGE_ICONS)[number];

export interface BadgeDef {
  id: string;
  category: BadgeCategory;
  tier: BadgeTier;
  icon: BadgeIcon;
  tone: BadgeTone;
  /** Earned when `metric` reaches `target`; locked tiles show "value / target". */
  progress?: { metric: BadgeMetric; target: number };
}

const b = <const Id extends string>(
  id: Id,
  category: BadgeCategory,
  tier: BadgeTier,
  icon: BadgeIcon,
  tone: BadgeTone,
  progress?: { metric: BadgeMetric; target: number },
) => ({ id, category, tier, icon, tone, ...(progress && { progress }) });

/** In display order: by category, then roughly by difficulty. */
export const BADGE_LIST = [
  // Streak
  b("streak_3", "streak", "bronze", "Flame", "warning", { metric: "streak", target: 3 }),
  b("streak_7", "streak", "bronze", "Zap", "gold", { metric: "streak", target: 7 }),
  b("streak_14", "streak", "silver", "CalendarCheck", "warning", { metric: "streak", target: 14 }),
  b("streak_30", "streak", "silver", "Trophy", "danger", { metric: "streak", target: 30 }),
  b("streak_60", "streak", "gold", "Rocket", "primary", { metric: "streak", target: 60 }),
  b("streak_100", "streak", "gold", "FlameKindling", "danger", { metric: "streak", target: 100 }),
  // Cards
  b("cards_50", "cards", "bronze", "GalleryVerticalEnd", "success", { metric: "cards", target: 50 }),
  b("cards_100", "cards", "bronze", "Layers", "success", { metric: "cards", target: 100 }),
  b("cards_500", "cards", "silver", "Brain", "primary", { metric: "cards", target: 500 }),
  b("cards_1000", "cards", "gold", "BrainCircuit", "info", { metric: "cards", target: 1000 }),
  b("cards_2500", "cards", "gold", "Library", "primary", { metric: "cards", target: 2500 }),
  // Quiz
  b("first_quiz", "quiz", "bronze", "CircleHelp", "info", { metric: "quizzes", target: 1 }),
  b("perfect_quiz", "quiz", "bronze", "Target", "info", { metric: "perfectQuizzes", target: 1 }),
  b("perfect_quiz_5", "quiz", "silver", "Crosshair", "danger", { metric: "perfectQuizzes", target: 5 }),
  b("perfect_quiz_25", "quiz", "gold", "Award", "gold", { metric: "perfectQuizzes", target: 25 }),
  b("quiz_80_10", "quiz", "silver", "ListChecks", "success", { metric: "quiz80Lessons", target: 10 }),
  // Explaining & open questions
  b("first_explain", "explain", "bronze", "MessageCircle", "info", { metric: "explanations", target: 1 }),
  b("explain_master", "explain", "silver", "GraduationCap", "info"),
  b("explain_10", "explain", "silver", "Presentation", "primary", { metric: "explanations", target: 10 }),
  b("open_10", "explain", "bronze", "PenLine", "hard", { metric: "openAnswers", target: 10 }),
  // Mastery (a lesson counts at ≥ 90 % mastery)
  b("lesson_master", "mastery", "bronze", "Star", "gold", { metric: "masteredLessons", target: 1 }),
  b("lesson_master_5", "mastery", "silver", "Sparkles", "gold", { metric: "masteredLessons", target: 5 }),
  b("lesson_master_10", "mastery", "gold", "Gem", "primary", { metric: "masteredLessons", target: 10 }),
  b("week_master", "mastery", "silver", "CalendarRange", "success"),
  b("reader_master", "mastery", "gold", "BookOpenCheck", "gold"),
  // Worlds (a biome counts when all lessons of its week(s) are done, ≥ 80 %, in a reader)
  b("world_bos", "worlds", "silver", "TreePine", "success"),
  b("world_dorp", "worlds", "silver", "House", "hard"),
  b("world_stad", "worlds", "silver", "Building2", "info"),
  b("world_haven", "worlds", "silver", "Anchor", "info"),
  b("world_jungle", "worlds", "silver", "TreePalm", "success"),
  b("world_woestijn", "worlds", "silver", "Sun", "gold"),
  b("world_bergen", "worlds", "silver", "Mountain", "primary"),
  b("graduated", "worlds", "gold", "School", "primary"),
  // Battle
  b("first_battle", "battle", "bronze", "Gamepad2", "danger", { metric: "battles", target: 1 }),
  b("battle_winner", "battle", "bronze", "Swords", "danger", { metric: "battleWins", target: 1 }),
  b("battle_wins_5", "battle", "silver", "ShieldCheck", "danger", { metric: "battleWins", target: 5 }),
  b("battle_wins_25", "battle", "gold", "Castle", "gold", { metric: "battleWins", target: 25 }),
  b("battle_streak_3", "battle", "silver", "ChevronsUp", "warning"),
  b("battle_host", "battle", "bronze", "Megaphone", "primary"),
  b("battle_perfect", "battle", "silver", "BadgeCheck", "success"),
  // Quests
  b("first_quest", "quests", "bronze", "Flag", "success", { metric: "quests", target: 1 }),
  b("quests_daily_3", "quests", "silver", "CircleCheckBig", "success"),
  b("quests_10", "quests", "silver", "Map", "info", { metric: "quests", target: 10 }),
  b("quests_50", "quests", "gold", "Compass", "gold", { metric: "quests", target: 50 }),
  // Fun
  b("first_steps", "fun", "bronze", "Sprout", "success"),
  b("night_owl", "fun", "bronze", "Moon", "primary"),
  b("early_bird", "fun", "bronze", "Bird", "warning"),
  b("weekend_warrior", "fun", "bronze", "PartyPopper", "hard"),
  b("comeback", "fun", "bronze", "RefreshCcw", "info"),
  b("weekly_top3", "fun", "silver", "Medal", "info"),
  b("weekly_first", "fun", "gold", "Crown", "gold"),
] as const;

export type BadgeId = (typeof BADGE_LIST)[number]["id"];

export const BADGE_CATEGORIES: readonly BadgeCategory[] = ["streak", "cards", "quiz", "explain", "mastery", "worlds", "battle", "quests", "fun"];

export const BADGES: Record<BadgeId, BadgeDef> = Object.fromEntries(BADGE_LIST.map((d) => [d.id, d])) as Record<BadgeId, BadgeDef>;

export const BADGE_IDS: readonly BadgeId[] = BADGE_LIST.map((d) => d.id);

export function isBadgeId(id: string): id is BadgeId {
  return Object.hasOwn(BADGES, id);
}

/** Badges whose metric-based target is reached at `value` (ids in catalogue order). */
export function badgesReached(metric: BadgeMetric, value: number): BadgeId[] {
  return BADGE_IDS.filter((id) => {
    const p = BADGES[id].progress;
    return p?.metric === metric && value >= p.target;
  });
}

/** Progress `{ value, target }` for a badge with a metric, with `value` capped at the target. */
export function badgeProgress(id: BadgeId, metrics: Partial<Record<BadgeMetric, number>>) {
  const p = BADGES[id].progress;
  if (!p) return undefined;
  return { value: Math.min(p.target, Math.max(0, Math.floor(metrics[p.metric] ?? 0))), target: p.target };
}
