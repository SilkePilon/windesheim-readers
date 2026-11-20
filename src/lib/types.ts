import type { BadgeId } from "@shared/game";
import type { FeedbackContext, FeedbackStatus, FeedbackType } from "@shared/feedback";

/** GET /me/badges: one entry per catalogue badge. */
export interface BadgeStatus {
  id: BadgeId;
  earnedAt: string | null;
  /** Locked badges with a counted target: value (capped) / target. */
  progress?: { value: number; target: number };
}
import type { QuestId } from "@shared/quests";

export interface Me {
  user: {
    id: string;
    email: string;
    name: string;
    nickname: string | null;
    displayName: string;
    role: "user" | "admin";
    showOnLeaderboard: boolean;
    locale: "nl" | "en" | null; // null = never chosen; the UI keeps the device/browser language
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
  quests: { id: QuestId; target: number; reward: number; progress: number; done: boolean }[];
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
  /** Most recently studied lesson of this reader (attempt, card review or progress), if any. */
  lastStudiedLessonId: string | null;
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
  /** Next-due interval in ms from now, per rating. */
  intervals: { again: number; hard: number; good: number; easy: number };
}

export type PublicQuestion =
  | { id: string; type: "mc"; prompt: string; difficulty: number; options: string[] }
  | { id: string; type: "tf"; prompt: string; difficulty: number }
  | { id: string; type: "fill"; prompt: string; difficulty: number }
  | { id: string; type: "order"; prompt: string; difficulty: number; items: string[] }
  | { id: string; type: "open"; prompt: string; difficulty: number };

/** A card in a reader session: the `/review/queue` item shape. */
export type ReviewCard = QueueCard;

/** A question in a reader session, with its lesson. */
export type SessionQuestion = PublicQuestion & { lessonId: string; code: string };

export type ReaderSessionItem =
  | { kind: "card"; card: ReviewCard }
  | { kind: "question"; question: SessionQuestion }
  | { kind: "open"; question: SessionQuestion };

/** `GET /readers/:id/session`. `sessionId` is null when nothing has been started yet. */
export interface ReaderSession {
  sessionId: string | null;
  needsStart: boolean;
  xpPerCorrect: number;
  items: ReaderSessionItem[];
}

/** `POST /readers/:id/session/submit`. */
export interface ReaderSessionResult {
  xp: number;
  correct: number;
  total: number;
  perLesson: { lessonId: string; code: string; correct: number; total: number }[];
  dayStreak: number;
  award: XpResult;
}

/** `GET /readers/:id/learn`: the whole-reader learning page overview. */
export interface ReaderLearn {
  reader: { id: string; title: string; examDate: number | null };
  daysToExam: number | null;
  progress: { mastery: number; masteredLessons: number; totalLessons: number };
  due: number;
  pullForward: number;
  today: { done: boolean; xp: number; sessions: number };
  sessionDayStreak: number;
  estimate: { cards: number; questions: number; open: number; minutes: number };
  needsStart: boolean;
  currentLessonId: string | null;
  weakLessons: { id: string; code: string; title: string; mastery: number }[];
  episodes: { week: number; title: string; durationSec: number; positionMs: number; listenMs: number }[];
  conceptMap: boolean;
}

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
  quests?: QuestId[];
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

export interface Leaderboard {
  period: "week" | "all";
  top: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  totalPlayers: number;
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
  failedCount: number;
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
  audio: AdminAudioSummary;
}

export type AudioStatus = "none" | "pending" | "generating" | "ready" | "error";
/** Per-lesson luisterles state in the admin structure table. */
export interface AdminAudioSummary {
  status: AudioStatus;
  stale: boolean;
  /** > 0 means a complete, playable set is on disk (also while regenerating or after a failed rerun). */
  chapters: number;
  totalMs: number;
  error: string | null;
  generatedAt: string | null;
}
export interface AudioChapter {
  n: number;
  durationMs: number;
  url: string;
}
/** GET /admin/lessons/:id/audio (quality control, incl. the internal script). */
export interface AdminLessonAudio extends AdminAudioSummary {
  running: boolean;
  provider: string | null;
  model: string | null;
  voice: string | null;
  chapterList: AudioChapter[];
  script: { chapters: { kind: "hook" | "roadmap" | "idea" | "recap" | "quiz"; title: string; text: string }[]; grounded: boolean; sources: string[] } | null;
}
/** GET /lessons/:id/audio (student; never any text). */
export interface LessonAudio {
  status: "ready" | "generating" | "none";
  chapters: AudioChapter[];
  totalMs: number;
  listenMs: number;
  summaryRead: boolean;
}
/** GET /readers/:id/episodes/:week (student; never the script). */
export interface EpisodeMeta {
  week: number;
  title: string;
  status: "ready";
  chapters: { n: number; title: string; durationMs: number }[];
  totalMs: number;
  positionMs: number;
  listenMs: number;
}
export interface ListenProgress {
  listenMs: number;
  summaryRead: boolean;
  award: XpResult | null;
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
  defaults: Record<ProviderId, string>;
  /** The "Stem" (TTS) role: stored choice or the default. */
  voice: VoiceChoice;
  voiceDefaults: Record<VoiceProviderId, VoiceChoice>;
  /** Daily uses per student; 0 = unlimited. */
  tutorDailyLimit: number;
  explainDailyLimit: number;
  gradeDailyLimit: number;
}
/** The student AI features with a daily limit. */
export type AiFeature = "tutor" | "explain" | "grade";
/** Today's uses of one AI feature for the signed-in student; null when unlimited (or an admin). */
export interface AiQuota {
  limit: number;
  used: number;
  remaining: number;
}
export type AiQuotas = Record<AiFeature, AiQuota | null>;
export type VoiceProviderId = "google" | "openai";
export interface VoiceChoice {
  provider: VoiceProviderId;
  model: string;
  voice: string;
  instructions?: string;
}
export interface VoiceInfo {
  id: string;
  /** Provider style label (English, e.g. "Warm"). */
  style: string;
  /** The voice only works with model ids starting with this. */
  modelPrefix?: string;
}
/** One entry of a provider's live model list (`POST /admin/settings/ai/models`). */
export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutput?: number;
  /** epoch ms */
  created?: number;
  deprecated?: boolean;
  structuredOutput?: boolean;
}
export type KeyValidation = { ok: true; modelCount: number } | { ok: false; invalid: boolean; error: string };
/** One report in the admin inbox (`GET /admin/feedback`). User-supplied text: render as plain text only. */
export interface FeedbackRow {
  id: string;
  type: FeedbackType;
  message: string;
  context: FeedbackContext;
  status: FeedbackStatus;
  githubUrl: string | null;
  hasScreenshot: boolean;
  /** The stored screenshot's extension ("webp", "jpeg" or "png"), null without one. */
  screenshotExt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Null once the account is gone. */
  reporter: { name: string; email: string } | null;
}
export interface FeedbackList {
  repo: string;
  items: FeedbackRow[];
}
