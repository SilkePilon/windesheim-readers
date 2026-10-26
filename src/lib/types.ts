import type { BadgeId } from "@shared/game";

export interface Me {
  user: {
    id: string;
    email: string;
    name: string;
    nickname: string | null;
    displayName: string;
    role: "user" | "admin";
    showOnLeaderboard: boolean;
    locale: "nl" | "en";
  };
  stats: {
    xp: number;
    level: number;
    intoLevel: number;
    levelSize: number;
    progress: number;
    streak: number;
    longestStreak: number;
    activeToday: boolean;
    todayXp: number;
    weekXp: number;
    due: number;
  };
  badges: { id: BadgeId; earnedAt: string }[];
}

export interface LessonSummary {
  id: string;
  readerId: string;
  code: string;
  title: string;
  week: number;
  mastery: number;
}

export interface ReaderWithLessons {
  id: string;
  title: string;
  course: string | null;
  published: boolean;
  lessons: LessonSummary[];
}

export interface LessonDetail {
  id: string;
  code: string;
  title: string;
  week: number;
  startPage: number;
  endPage: number;
  summary: string | null;
  keyPoints: string[];
  reader: { id: string; title: string };
  terms: { term: string; definition: string }[];
  flashcardCount: number;
  quizCount: number;
  openCount: number;
  progress: { summaryRead: boolean; bestQuiz: number; bestExplain: number; cardMastery: number; mastery: number };
  prev: { id: string; code: string; title: string } | null;
  next: { id: string; code: string; title: string } | null;
}

export interface QueueCard {
  id: string;
  lessonId: string;
  lessonCode: string;
  front: string;
  back: string;
  isNew: boolean;
}

export type PublicQuestion =
  | { id: string; type: "mc"; prompt: string; difficulty: number; options: string[] }
  | { id: string; type: "tf"; prompt: string; difficulty: number }
  | { id: string; type: "fill"; prompt: string; difficulty: number }
  | { id: string; type: "order"; prompt: string; difficulty: number; items: string[] }
  | { id: string; type: "open"; prompt: string; difficulty: number };

export interface CheckResult {
  correct: boolean;
  correctAnswer: unknown;
  explanation: string;
}

export interface XpResult {
  xp: number;
  gained: number;
  streak: number;
  newBadges: BadgeId[];
}

export interface GradeResult extends XpResult {
  score: number;
  feedback: string;
  strengths: string[];
  missing: string[];
  modelAnswer?: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  xp: number;
  streak: number;
  level: number;
  me: boolean;
}

// ----- admin -----

export type ReaderStatus = "extracting" | "structuring" | "review" | "generating" | "ready" | "error";
export type LessonStatus = "pending" | "generating" | "ready" | "error";

export interface AdminReader {
  id: string;
  title: string;
  course: string | null;
  fileName: string;
  pageCount: number;
  status: ReaderStatus;
  error: string | null;
  published: boolean;
  createdAt: string;
  lessonCount: number;
  readyCount: number;
}

export interface AdminLessonRow {
  id: string;
  code: string;
  title: string;
  week: number;
  position: number;
  startPage: number;
  endPage: number;
  status: LessonStatus;
  error: string | null;
  generatedAt: string | null;
  flashcards: number;
  questions: number;
}

export type ProviderId = "google" | "anthropic" | "openai" | "openrouter";
export interface ModelChoice {
  provider: ProviderId;
  model: string;
}
export interface AiSettings {
  generation: ModelChoice;
  fast: ModelChoice;
  keys: Record<ProviderId, { stored: boolean; env: boolean }>;
  suggestions: Record<ProviderId, string[]>;
}
