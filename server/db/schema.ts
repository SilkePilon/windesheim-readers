import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = sql`(unixepoch() * 1000)`;
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

// ---------- better-auth tables ----------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().default(now),
  updatedAt: ts("updated_at").notNull().default(now),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  nickname: text("nickname"),
  showOnLeaderboard: integer("show_on_leaderboard", { mode: "boolean" }).notNull().default(true),
  locale: text("locale").notNull().default("nl"),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: ts("created_at").notNull().default(now),
  updatedAt: ts("updated_at").notNull().default(now),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("created_at").notNull().default(now),
  updatedAt: ts("updated_at").notNull().default(now),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().default(now),
  updatedAt: ts("updated_at").notNull().default(now),
});

// ---------- app settings ----------

export const setting = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: ts("updated_at").notNull().default(now),
});

// ---------- readers & content ----------

export type ReaderStatus = "extracting" | "structuring" | "review" | "generating" | "ready" | "error";

export const reader = sqliteTable("reader", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  course: text("course"),
  fileName: text("file_name").notNull(),
  pageCount: integer("page_count").notNull().default(0),
  language: text("language").notNull().default("nl"),
  status: text("status").$type<ReaderStatus>().notNull().default("extracting"),
  error: text("error"),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().default(now),
});

export const readerPage = sqliteTable(
  "reader_page",
  {
    readerId: text("reader_id").notNull().references(() => reader.id, { onDelete: "cascade" }),
    page: integer("page").notNull(),
    text: text("text").notNull(),
  },
  (t) => [primaryKey({ columns: [t.readerId, t.page] })],
);

export type LessonStatus = "pending" | "generating" | "ready" | "error";

export const lesson = sqliteTable(
  "lesson",
  {
    id: text("id").primaryKey(),
    readerId: text("reader_id").notNull().references(() => reader.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // e.g. 1.2A
    title: text("title").notNull(),
    week: integer("week").notNull().default(1),
    position: integer("position").notNull().default(0),
    startPage: integer("start_page").notNull(),
    endPage: integer("end_page").notNull(),
    status: text("status").$type<LessonStatus>().notNull().default("pending"),
    error: text("error"),
    summary: text("summary"), // markdown
    keyPoints: text("key_points", { mode: "json" }).$type<string[]>(),
    generatedAt: ts("generated_at"),
  },
  (t) => [index("lesson_reader_idx").on(t.readerId)],
);

export const term = sqliteTable(
  "term",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id").notNull().references(() => lesson.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    definition: text("definition").notNull(),
  },
  (t) => [index("term_lesson_idx").on(t.lessonId)],
);

export const flashcard = sqliteTable(
  "flashcard",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id").notNull().references(() => lesson.id, { onDelete: "cascade" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
  },
  (t) => [index("flashcard_lesson_idx").on(t.lessonId)],
);

export type QuestionType = "mc" | "tf" | "fill" | "order" | "open";
export type QuestionData =
  | { type: "mc"; options: string[]; answer: number; explanation: string }
  | { type: "tf"; answer: boolean; explanation: string }
  | { type: "fill"; answers: string[]; explanation: string }
  | { type: "order"; items: string[]; explanation: string } // items in correct order
  | { type: "open"; modelAnswer: string; rubric: string[] };

export const question = sqliteTable(
  "question",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id").notNull().references(() => lesson.id, { onDelete: "cascade" }),
    type: text("type").$type<QuestionType>().notNull(),
    prompt: text("prompt").notNull(),
    data: text("data", { mode: "json" }).$type<QuestionData>().notNull(),
    difficulty: integer("difficulty").notNull().default(2), // 1..3
  },
  (t) => [index("question_lesson_idx").on(t.lessonId)],
);

// ---------- learning state ----------

export const cardReview = sqliteTable(
  "card_review",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    flashcardId: text("flashcard_id").notNull().references(() => flashcard.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull().references(() => lesson.id, { onDelete: "cascade" }),
    due: ts("due").notNull(),
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull(),
    lapses: integer("lapses").notNull(),
    state: integer("state").notNull(),
    lastReview: ts("last_review"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.flashcardId] }), index("card_review_due_idx").on(t.userId, t.due)],
);

export type AttemptKind = "quiz" | "explain" | "battle" | "review";

export const attempt = sqliteTable(
  "attempt",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").references(() => lesson.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AttemptKind>().notNull(),
    score: integer("score").notNull(),
    maxScore: integer("max_score").notNull(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("attempt_user_idx").on(t.userId, t.lessonId)],
);

export const xpEvent = sqliteTable(
  "xp_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("xp_event_user_idx").on(t.userId, t.createdAt)],
);

export const userStats = sqliteTable("user_stats", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  xp: integer("xp").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveDay: text("last_active_day"), // YYYY-MM-DD (Europe/Amsterdam)
});

export const lessonProgress = sqliteTable(
  "lesson_progress",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull().references(() => lesson.id, { onDelete: "cascade" }),
    summaryRead: integer("summary_read", { mode: "boolean" }).notNull().default(false),
    bestQuiz: real("best_quiz").notNull().default(0), // 0..1
    bestExplain: real("best_explain").notNull().default(0), // 0..1
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

export const userBadge = sqliteTable(
  "user_badge",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    badge: text("badge").notNull(),
    earnedAt: ts("earned_at").notNull().default(now),
  },
  (t) => [uniqueIndex("user_badge_uq").on(t.userId, t.badge)],
);

export const questProgress = sqliteTable(
  "quest_progress",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    dayKey: text("day_key").notNull(), // YYYY-MM-DD (Europe/Amsterdam)
    questId: text("quest_id").notNull(),
    progress: integer("progress").notNull().default(0),
    seenLessons: text("seen_lessons", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    completedAt: ts("completed_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.dayKey, t.questId] })],
);
