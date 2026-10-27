import type { MiddlewareHandler } from "hono";
import { and, asc, eq, gt, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { env, isAllowedEmail } from "../env";
import { clientIp, ipBucket } from "./client-ip";
import { DAY, HOUR, MINUTE, SECOND, tooManyRequests, type Rule } from "./rate-limit";

/**
 * Hard limits on sign-in emails, persisted in SQLite (`email_send_log`) so a restart
 * doesn't reset them. Check-and-reserve is one synchronous transaction: a row is only
 * written when every limit passes, so concurrent requests can never overshoot.
 */
export const EMAIL_LIMITS = {
  perEmail: [
    { limit: 1, windowMs: 60 * SECOND },
    { limit: 3, windowMs: 15 * MINUTE },
    { limit: 6, windowMs: DAY },
  ],
  perIp: [
    { limit: 5, windowMs: 15 * MINUTE },
    { limit: 20, windowMs: DAY },
  ],
  /** Read on every call so `EMAIL_LIMIT_*` (and tests) can change them. */
  global: (): Rule[] => [
    { limit: env.emailLimitHourly, windowMs: HOUR },
    { limit: env.emailLimitDaily, windowMs: DAY },
  ],
};

/** Rows older than this are deleted (they're past every window). */
const KEEP_MS = 2 * DAY;
const PRUNE_EVERY_MS = 10 * MINUTE;
let lastPrune = 0;

export type Scope = "email" | "ip" | "global";
export type GateResult = { ok: true } | { ok: false; scope: Scope; retryAfter: number };

const t = schema.emailSendLog;

/**
 * Checks one scope's rules against the log. Returns the wait (ms) until enough counted rows
 * leave the tightest violated window, or 0 when every rule passes.
 */
function waitFor(tx: Pick<typeof db, "select">, where: SQL | undefined, rules: Rule[], now: number): number {
  if (!rules.length) return 0;
  const longest = Math.max(...rules.map((r) => r.windowMs));
  const row = tx
    .select(Object.fromEntries(rules.map((r, i) => [`n${i}`, sql<number>`coalesce(sum(${t.createdAt} > ${now - r.windowMs}), 0)`])))
    .from(t)
    .where(and(where, gt(t.createdAt, new Date(now - longest))))
    .get() as Record<string, number> | undefined;
  let wait = 0;
  rules.forEach((r, i) => {
    const n = Number(row?.[`n${i}`] ?? 0);
    if (n < r.limit) return;
    // The window frees up once the (n - limit + 1) oldest rows in it have expired.
    const oldest = tx
      .select({ at: t.createdAt })
      .from(t)
      .where(and(where, gt(t.createdAt, new Date(now - r.windowMs))))
      .orderBy(asc(t.createdAt))
      .limit(1)
      .offset(n - r.limit)
      .get();
    const freesAt = oldest ? oldest.at.getTime() + r.windowMs : now + r.windowMs;
    wait = Math.max(wait, freesAt - now, 1);
  });
  return wait;
}

/**
 * Reserves one sign-in email for `email` from `ip` (an IP bucket), or says how long to wait.
 * Synchronous on purpose: with bun:sqlite no other request can run in between, and
 * `BEGIN IMMEDIATE` also keeps other connections out.
 */
export function reserveEmailSend(email: string, ip: string, now = Date.now()): GateResult {
  return db.transaction(
    (tx) => {
      if (now - lastPrune > PRUNE_EVERY_MS) {
        lastPrune = now;
        tx.delete(t).where(lt(t.createdAt, new Date(now - KEEP_MS))).run();
      }
      const checks: [Scope, SQL | undefined, Rule[]][] = [
        ["email", eq(t.email, email), EMAIL_LIMITS.perEmail],
        ["ip", eq(t.ip, ip), EMAIL_LIMITS.perIp],
        ["global", undefined, EMAIL_LIMITS.global()],
      ];
      for (const [scope, where, rules] of checks) {
        const wait = waitFor(tx, where, rules, now);
        if (wait > 0) return { ok: false, scope, retryAfter: Math.ceil(wait / 1000) } as const;
      }
      tx.insert(t).values({ email, ip, createdAt: new Date(now) }).run();
      return { ok: true } as const;
    },
    { behavior: "immediate" },
  );
}

/** For tests. */
export function resetEmailGate() {
  db.delete(t).run();
  lastPrune = 0;
}

const emailSchema = z.email();

/** The email a magic-link request asks for, as sent (read from a clone), or null. */
export async function requestedEmail(req: Request): Promise<string | null> {
  const body: unknown = await req
    .clone()
    .json()
    .catch(() => null);
  const raw = body && typeof body === "object" ? (body as { email?: unknown }).email : null;
  return typeof raw === "string" ? raw : null;
}

/**
 * Middleware for POST /api/auth/sign-in/magic-link, before better-auth. Addresses outside
 * the allowed domains (or not addresses at all) pass through untouched so better-auth gives
 * its usual error; they can't send mail anyway. The answer never depends on whether an
 * account exists.
 */
export const magicLinkGate: MiddlewareHandler = async (c, next) => {
  if (env.rateLimitDisabled) return next();
  const raw = await requestedEmail(c.req.raw);
  // Same domain check as better-auth applies to the raw value: what it rejects isn't counted.
  if (!raw || !isAllowedEmail(raw)) return next();
  const email = raw.trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) return next();
  const r = reserveEmailSend(email, ipBucket(clientIp(c)));
  if (!r.ok) {
    console.warn(`[email-gate] ${r.scope} limit hit, retry in ${r.retryAfter}s`);
    return tooManyRequests(c, r.retryAfter);
  }
  return next();
};
