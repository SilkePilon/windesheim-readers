import { DAY, HOUR, MINUTE, SECOND, ipKey, rateLimit } from "./lib/rate-limit";

/**
 * Every in-memory request limit in one place (the hard, persisted sign-in email limits live
 * in lib/email-gate.ts). Generous for real students, strict for abuse. Unless `key` says
 * otherwise a limit counts per signed-in user, falling back to the client IP.
 * A middleware used on several routes is one shared bucket.
 */
export const limits = {
  /** Flood guard: every /api request per IP (except /api/health). */
  api: rateLimit({
    name: "api",
    rules: [{ limit: 600, windowMs: MINUTE }],
    key: (c) => (c.req.path === "/api/health" ? null : ipKey(c)),
  }),
  /** Every /api/auth request per IP except session reads (magic-link verify, sign-out, ...). */
  auth: rateLimit({ name: "auth", rules: [{ limit: 30, windowMs: 10 * MINUTE }], key: ipKey }),
  /** GET /api/auth/get-session per IP. */
  authSession: rateLimit({ name: "auth-session", rules: [{ limit: 300, windowMs: MINUTE }], key: ipKey }),
  /** Sign-in POSTs per IP, on top of `auth`. */
  signIn: rateLimit({ name: "sign-in", rules: [{ limit: 10, windowMs: 10 * MINUTE }], key: ipKey }),

  /** AI-cost student endpoints (tutor chat, open-answer grading, explain grading), per user. */
  ai: rateLimit({
    name: "ai",
    rules: [
      { limit: 20, windowMs: 5 * MINUTE },
      { limit: 150, windowMs: DAY },
    ],
  }),
  /** Writes that award XP or save progress, per user. */
  writes: rateLimit({ name: "writes", rules: [{ limit: 120, windowMs: MINUTE }] }),

  /** Admin calls that hit an AI provider (key checks, model lists, test prompts, voice samples). */
  adminAi: rateLimit({ name: "admin-ai", rules: [{ limit: 30, windowMs: 10 * MINUTE }] }),
  /** Admin uploads and background jobs (extraction, generation, audio, badge backfill). */
  adminJobs: rateLimit({ name: "admin-jobs", rules: [{ limit: 30, windowMs: HOUR }] }),

  /** Battle websocket upgrades per IP. */
  battleUpgrade: rateLimit({ name: "battle-ws", rules: [{ limit: 30, windowMs: MINUTE }], key: ipKey }),

  /** Link-preview images (/og/battle/*) per IP: crawlers fetch a few, and it slows code guessing. */
  og: rateLimit({ name: "og", rules: [{ limit: 60, windowMs: MINUTE }], key: ipKey }),
};

/** Battle websocket limits (applied in live/battle.ts). */
export const BATTLE_LIMITS = {
  /** Messages per connection; extra messages are dropped. */
  messages: { limit: 20, windowMs: 2 * SECOND },
  /** A connection that overflows this many windows within `strikeWindowMs` is closed (4429). */
  strikes: 3,
  strikeWindowMs: MINUTE,
  create: [{ limit: 10, windowMs: 10 * MINUTE }],
  /** Generous for reconnects, far too slow to guess a 6-digit code. */
  join: [{ limit: 20, windowMs: MINUTE }],
};
