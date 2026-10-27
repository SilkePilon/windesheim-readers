/**
 * Every input bound in one place, shared by the server schemas (authoritative, see
 * server/lib/input.ts) and the client inputs (`maxLength`, counters, inline checks).
 * Only writes are validated: values already in the database are read as they are.
 */

export const LIMITS = {
  // ----- profile -----
  nickname: { min: 2, max: 24 },
  /** better-auth `name` (sign-in for a new account, update-user). */
  name: { min: 1, max: 60 },
  email: { max: 254 },
  /** better-auth callback URLs on the magic-link request. */
  url: { max: 2048 },

  // ----- learning -----
  /** One tutor chat message the student types. */
  tutorMessage: { max: 1_000 },
  /** One assistant message in the client-supplied history (≈ maxOutputTokens 1200). */
  tutorReply: { max: 8_000 },
  /** Messages in one tutor request (the server only uses the last 20). */
  tutorMessages: { max: 40 },
  /** Parts per tutor message. */
  tutorParts: { max: 20 },
  /** All text in one tutor request together. */
  tutorTotal: { max: 120_000 },
  /** Explain-it-back: the student's explanation. */
  explain: { min: 20, max: 2_000 },
  /** Explain-it-back: the concept (a term or key point of the lesson). */
  concept: { min: 1, max: 500 },
  /** Open question answer. */
  openAnswer: { min: 3, max: 2_000 },
  /** Fill-in answer. */
  fillAnswer: { max: 200 },
  /** One ordering item, and the number of items. */
  orderItem: { max: 500 },
  orderItems: { max: 20 },
  /** Multiple-choice option index (0-based, below this). */
  mcOptions: { max: 20 },
  /** Client-only filter boxes (never sent). */
  search: { max: 100 },
  /** Ids (nanoid, quiz session ids, chat message ids). */
  id: { max: 100 },
  /** Lesson ids in one request (battle create, generate, audio). */
  lessonIds: { max: 200 },

  // ----- admin -----
  readerTitle: { min: 1, max: 120 },
  course: { max: 120 },
  lessonTitle: { min: 1, max: 120 },
  lessonCode: { min: 1, max: 12 },
  /** Lessons in one reader (PUT /admin/readers/:id/lessons). */
  lessons: { max: 300 },
  week: { min: 1, max: 60 },
  page: { min: 1, max: 5_000 },
  summary: { max: 40_000 },
  flashcardSide: { min: 1, max: 1_000 },
  modelId: { max: 200 },
  apiKey: { max: 500 },
  voiceId: { max: 100 },
  voiceInstructions: { max: 1_000 },

  // ----- transport -----
  /** Request body caps (bytes). */
  body: { default: 64 * 1024, tutor: 256 * 1024, admin: 256 * 1024, upload: 51 * 1024 * 1024 },
  /** One battle websocket message (bytes). */
  battleMessage: { max: 4 * 1024 },
} as const;

/** Show a character counter once this share of the limit is used. */
export const COUNTER_FROM = 0.8;

/** Letters (any script, with their accents), digits, spaces and basic punctuation. */
const NICKNAME_CHARS = /^[\p{L}\p{M}\p{N} .,'’_!?&()-]+$/u;
/** Control, format (zero-width, bidi) and other invisible characters. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u;

/** Trimmed, NFC, runs of spaces collapsed to one. Rejection is `nicknameProblem`'s job. */
export function normalizeNickname(raw: string): string {
  return raw.normalize("NFC").replace(/[\p{Zs}]+/gu, " ").trim();
}

/** Characters as a person counts them (code points, not UTF-16 units). */
export const charCount = (s: string) => [...s].length;

/**
 * Why a (raw) nickname is refused, or null when it's fine. An empty nickname is fine:
 * it clears the nickname (the first name shows instead).
 */
export function nicknameProblem(raw: string): "chars" | "length" | null {
  if (INVISIBLE.test(raw)) return "chars";
  const v = normalizeNickname(raw);
  if (!v) return null;
  if (!NICKNAME_CHARS.test(v) || !/[\p{L}\p{N}]/u.test(v)) return "chars";
  const n = charCount(v);
  if (n < LIMITS.nickname.min || n > LIMITS.nickname.max) return "length";
  return null;
}

/** True when `value` uses at least COUNTER_FROM of `max` (time to show a counter). */
export const nearLimit = (value: string, max: number) => value.length >= max * COUNTER_FROM;
