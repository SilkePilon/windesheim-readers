/**
 * Request schemas for every user input. Bounds come from shared/limits.ts (the client uses
 * the same numbers). Objects are strict: unknown keys are a VALIDATION error.
 */
import { z } from "zod";
import { LIMITS, charCount, nicknameProblem, normalizeNickname } from "../../shared/limits";
import { COUNT_MAX, COUNT_MIN, DEFAULT_BATTLE_SETTINGS, DIFFICULTIES, POINTS_MODES, QUESTION_SECONDS } from "../../shared/battle";
import { PROVIDERS, VOICE_PROVIDERS } from "../ai/providers";
import { AI_DAILY_LIMIT_MAX } from "./ai-quota";
import type { QuestionData } from "../db/schema";

/** No control or zero-width characters, except newlines and tabs in multi-line text. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤﻿]/;

/** Trimmed text of at most `max` characters (and at least `min`, default 1: blank is refused). */
export const text = (max: number, min = 1) =>
  z
    .string()
    .max(max * 4) // cheap cap before any work on a huge string
    .trim()
    .refine((s) => !CONTROL.test(s), "Contains control characters")
    .refine((s) => charCount(s) >= min, `At least ${min} characters`)
    .refine((s) => charCount(s) <= max, `At most ${max} characters`);

/** A single-line value: no newlines either. */
export const line = (max: number, min = 1) => text(max, min).refine((s) => !/[\r\n\t]/.test(s), "Must be a single line");

export const id = z.string().min(1).max(LIMITS.id.max);
const ids = (max = LIMITS.lessonIds.max) => z.array(id).max(max);

// ----- profile -----
export const nickname = z
  .string()
  .max(LIMITS.nickname.max * 8)
  .superRefine((s, ctx) => {
    const problem = nicknameProblem(s);
    if (problem) ctx.addIssue({ code: "custom", message: problem === "length" ? `Nickname must be ${LIMITS.nickname.min}-${LIMITS.nickname.max} characters` : "Nickname may only contain letters, numbers, spaces and basic punctuation" });
  })
  .transform((s) => normalizeNickname(s) || null);

export const patchMe = z
  .object({
    nickname: nickname.nullable().optional(),
    showOnLeaderboard: z.boolean().optional(),
    locale: z.enum(["nl", "en"]).optional(),
  })
  .strict();

// ----- quiz -----
const mcAnswer = z.number().int().min(0).max(LIMITS.mcOptions.max - 1);
const tfAnswer = z.boolean();
const fillAnswer = z.string().max(LIMITS.fillAnswer.max);
const orderAnswer = z.array(z.string().max(LIMITS.orderItem.max)).max(LIMITS.orderItems.max);

/** Any answer shape a question can take (size-capped); the question type picks the exact one. */
export const anyAnswer = z.union([mcAnswer, tfAnswer, fillAnswer, orderAnswer]);

/** The exact answer shape for a question type. */
export function answerFor(type: QuestionData["type"]) {
  switch (type) {
    case "mc":
      return mcAnswer;
    case "tf":
      return tfAnswer;
    case "fill":
      return fillAnswer;
    case "order":
      return orderAnswer;
    case "open":
      return z.never();
  }
}

export const quizCheck = z.object({ sessionId: id, answer: anyAnswer }).strict();
export const quizSubmit = z.object({ sessionId: id }).strict();
export const review = z.object({ flashcardId: id, rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }).strict();
export const audioProgress = z
  .object({ positionMs: z.number().int().min(0).max(6 * 3600_000), heardMs: z.number().int().min(0).max(6 * 3600_000).optional() })
  .strict();

// ----- AI-graded answers -----
export const openAnswer = z.object({ answer: text(LIMITS.openAnswer.max, LIMITS.openAnswer.min) }).strict();
export const explain = z
  .object({ concept: text(LIMITS.concept.max, LIMITS.concept.min), explanation: text(LIMITS.explain.max, LIMITS.explain.min) })
  .strict();

// ----- tutor chat -----
/**
 * The AI SDK chat request. The whole history is client-supplied, so all of it is capped;
 * only text parts reach the model (step-start, reasoning, ... are dropped).
 */
const chatPart = z.looseObject({ type: z.string().max(50), text: z.string().optional() });
const chatMessage = z.looseObject({
  id: z.string().max(LIMITS.id.max),
  role: z.enum(["user", "assistant"]),
  parts: z.array(chatPart).max(LIMITS.tutorParts.max),
});
export const tutorChat = z
  .object({
    id: z.string().max(LIMITS.id.max).optional(),
    messages: z.array(chatMessage).min(1).max(LIMITS.tutorMessages.max),
    trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
    messageId: z.string().max(LIMITS.id.max).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    let total = 0;
    body.messages.forEach((m, i) => {
      const max = m.role === "user" ? LIMITS.tutorMessage.max : LIMITS.tutorReply.max;
      m.parts.forEach((p, j) => {
        if (p.type !== "text") return;
        const t = p.text ?? "";
        total += t.length;
        if (charCount(t) > max) ctx.addIssue({ code: "custom", path: ["messages", i, "parts", j, "text"], message: `At most ${max} characters` });
        if (CONTROL.test(t)) ctx.addIssue({ code: "custom", path: ["messages", i, "parts", j, "text"], message: "Contains control characters" });
      });
    });
    if (total > LIMITS.tutorTotal.max) ctx.addIssue({ code: "custom", path: ["messages"], message: "Conversation too long" });
    const last = body.messages.at(-1);
    if (!last) return;
    const lastText = last.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("").trim();
    if (last.role !== "user" || !lastText) ctx.addIssue({ code: "custom", path: ["messages"], message: "The last message must be a non-empty user message" });
  })
  .transform((body) =>
    body.messages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.parts.filter((p) => p.type === "text" && p.text).map((p) => ({ type: "text" as const, text: p.text! })),
    })),
  );

// ----- battle websocket -----
const settingsPatch = z
  .object({
    questionSeconds: z.literal(QUESTION_SECONDS),
    points: z.enum(POINTS_MODES),
    count: z.number().int().min(COUNT_MIN).max(COUNT_MAX),
    difficulty: z.enum(DIFFICULTIES),
    speedBonus: z.boolean(),
    streakBonus: z.boolean(),
    showScoreboard: z.boolean(),
  })
  .partial()
  .strict();

/** Battles only play mc and tf questions. */
export const battleAnswer = z.union([mcAnswer, tfAnswer]);

export const battleMessage = z.discriminatedUnion("t", [
  z
    .object({
      t: z.literal("create"),
      lessonIds: z.array(id).min(1).max(LIMITS.lessonIds.max),
      count: z.number().int().min(COUNT_MIN).max(COUNT_MAX).default(DEFAULT_BATTLE_SETTINGS.count),
      hostPlays: z.boolean().default(true),
    })
    .strict(),
  z.object({ t: z.literal("join"), code: z.string().regex(/^\d{6}$/) }).strict(),
  z.object({ t: z.literal("start") }).strict(),
  z.object({ t: z.literal("answer"), index: z.number().int().min(0).max(COUNT_MAX), answer: battleAnswer }).strict(),
  z.object({ t: z.literal("next") }).strict(),
  z.object({ t: z.literal("settings"), settings: settingsPatch }).strict(),
  z.object({ t: z.literal("kick"), playerId: id }).strict(),
  z.object({ t: z.literal("leave") }).strict(),
  z.object({ t: z.literal("end") }).strict(),
]);

// ----- admin -----
export const patchReader = z
  .object({
    title: line(LIMITS.readerTitle.max, LIMITS.readerTitle.min).optional(),
    course: line(LIMITS.course.max, 0)
      .nullable()
      .optional()
      .transform((v) => (v === "" ? null : v)),
    published: z.boolean().optional(),
  })
  .strict();

/** Upload form fields (multipart): title and course are optional. */
export const uploadFields = z.object({
  title: line(LIMITS.readerTitle.max, 0).optional(),
  course: line(LIMITS.course.max, 0).optional(),
});

const page = z.number().int().min(LIMITS.page.min).max(LIMITS.page.max);
export const lessonList = z
  .array(
    z
      .object({
        id: id.optional(),
        code: line(LIMITS.lessonCode.max, LIMITS.lessonCode.min),
        title: line(LIMITS.lessonTitle.max, LIMITS.lessonTitle.min),
        week: z.number().int().min(LIMITS.week.min).max(LIMITS.week.max),
        startPage: page,
        endPage: page,
      })
      .strict(),
  )
  .max(LIMITS.lessons.max);

export const lessonIdsBody = z.object({ lessonIds: ids().optional() }).strict();
export const readerAudio = z.object({ lessonIds: ids().optional(), force: z.boolean().optional() }).strict();

export const patchLesson = z
  .object({
    summary: text(LIMITS.summary.max, 0).optional(),
    title: line(LIMITS.lessonTitle.max, LIMITS.lessonTitle.min).optional(),
  })
  .strict();
export const patchFlashcard = z
  .object({ front: text(LIMITS.flashcardSide.max, LIMITS.flashcardSide.min), back: text(LIMITS.flashcardSide.max, LIMITS.flashcardSide.min) })
  .strict();

const providerEnum = z.enum(PROVIDERS);
const modelId = line(LIMITS.modelId.max);
const apiKey = line(LIMITS.apiKey.max, 0);
export const modelChoice = z.object({ provider: providerEnum, model: modelId }).strict();
export const voiceChoice = z
  .object({
    provider: z.enum(VOICE_PROVIDERS),
    model: modelId,
    voice: line(LIMITS.voiceId.max),
    instructions: text(LIMITS.voiceInstructions.max, 0).optional(),
  })
  .strict();

const dailyLimit = z.number().int().min(0).max(AI_DAILY_LIMIT_MAX);

export const aiSettings = z
  .object({
    generation: modelChoice.optional(),
    fast: modelChoice.optional(),
    voice: voiceChoice.optional(),
    keys: z.partialRecord(providerEnum, apiKey.nullable()).optional(),
    /** Daily AI uses per student (tutor messages, explain gradings, open-answer gradings); 0 = unlimited. */
    tutorDailyLimit: dailyLimit.optional(),
    explainDailyLimit: dailyLimit.optional(),
    gradeDailyLimit: dailyLimit.optional(),
  })
  .strict();
export const validateKey = z.object({ provider: providerEnum, apiKey: apiKey.optional() }).strict();
export const listModels = z.object({ provider: providerEnum, apiKey: apiKey.optional(), refresh: z.boolean().optional() }).strict();
export const listVoiceModels = z.object({ provider: z.enum(VOICE_PROVIDERS), apiKey: apiKey.optional(), refresh: z.boolean().optional() }).strict();
export const voiceSample = voiceChoice.extend({ apiKey: apiKey.optional(), language: z.enum(["nl", "en"]).optional() }).strict();
export const testModel = modelChoice.extend({ apiKey: apiKey.optional() }).strict();
export const patchUser = z.object({ role: z.enum(["user", "admin"]) }).strict();

// ----- better-auth bodies we check before better-auth sees them -----
export const magicLinkBody = z.looseObject({
  email: z.string().max(LIMITS.email.max),
  name: line(LIMITS.name.max, LIMITS.name.min).optional(),
  callbackURL: z.string().max(LIMITS.url.max).optional(),
  newUserCallbackURL: z.string().max(LIMITS.url.max).optional(),
  errorCallbackURL: z.string().max(LIMITS.url.max).optional(),
});
/** POST /api/auth/update-user: only the display name (nickname etc. go through PATCH /api/me). */
export const updateUserBody = z.object({ name: line(LIMITS.name.max, LIMITS.name.min).optional() }).strict();

// ----- validation error responses -----
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** ZodError issues for a 400 response: no input echoed back, and everything size-capped. */
export function publicIssues(issues: readonly z.core.$ZodIssue[]) {
  return issues.slice(0, 20).map((i) => ({
    code: i.code,
    path: i.path.slice(0, 8).map((p) => (typeof p === "number" ? p : clip(String(p), 64))),
    // unrecognized_keys messages quote the (client-chosen) key names: those go in `keys`, clipped.
    message: i.code === "unrecognized_keys" ? "Unrecognized key(s)" : clip(i.message, 200),
    ...("keys" in i && Array.isArray(i.keys) ? { keys: i.keys.slice(0, 10).map((k) => clip(String(k), 64)) } : {}),
  }));
}
