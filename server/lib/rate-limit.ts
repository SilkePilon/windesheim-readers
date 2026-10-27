import type { Context, MiddlewareHandler } from "hono";
import { env } from "../env";
import { clientIp, ipBucket } from "./client-ip";

export interface Rule {
  limit: number;
  windowMs: number;
}

export type HitResult = { ok: true } | { ok: false; retryAfterMs: number };

interface Entry {
  /** Per rule: when its current window started and how many hits it has seen. */
  starts: number[];
  counts: number[];
}

const DEFAULT_MAX_KEYS = 50_000;

/**
 * Fixed-window counters keyed by string, several rules per key (e.g. 20 per 5 min and 150
 * per day). A window starts at a key's first hit after the previous one expired. A hit
 * counts only when every rule allows it, so a blocked client doesn't extend its own ban.
 * Memory is bounded: expired keys are swept periodically, and past `maxKeys` the oldest
 * key is evicted.
 */
export class RateLimiter {
  readonly rules: Rule[];
  readonly maxKeys: number;
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(rules: Rule[], opts: { maxKeys?: number; now?: () => number } = {}) {
    if (!rules.length) throw new Error("RateLimiter needs at least one rule");
    this.rules = rules;
    this.maxKeys = Math.max(1, opts.maxKeys ?? DEFAULT_MAX_KEYS);
    this.now = opts.now ?? Date.now;
    registry.add(new WeakRef(this));
  }

  get size() {
    return this.entries.size;
  }

  hit(key: string): HitResult {
    const now = this.now();
    let e = this.entries.get(key);
    if (!e) {
      if (this.entries.size >= this.maxKeys) {
        this.cleanup(now);
        // Still full: drop the oldest key (Map iterates in insertion order).
        while (this.entries.size >= this.maxKeys) this.entries.delete(this.entries.keys().next().value!);
      }
      e = { starts: this.rules.map(() => now), counts: this.rules.map(() => 0) };
      this.entries.set(key, e);
    }
    let retryAfterMs = 0;
    this.rules.forEach((r, i) => {
      if (now - e.starts[i]! >= r.windowMs) {
        e.starts[i] = now;
        e.counts[i] = 0;
      }
      if (e.counts[i]! >= r.limit) retryAfterMs = Math.max(retryAfterMs, e.starts[i]! + r.windowMs - now);
    });
    if (retryAfterMs > 0) return { ok: false, retryAfterMs };
    for (let i = 0; i < e.counts.length; i++) e.counts[i]!++;
    return { ok: true };
  }

  /** Removes keys whose every window has expired. */
  cleanup(now = this.now()) {
    for (const [key, e] of this.entries) {
      if (this.rules.every((r, i) => now - e.starts[i]! >= r.windowMs)) this.entries.delete(key);
    }
  }

  reset(key?: string) {
    if (key === undefined) this.entries.clear();
    else this.entries.delete(key);
  }
}

// One shared, unref'd sweep for every limiter (WeakRef so a dropped limiter can be collected).
const registry = new Set<WeakRef<RateLimiter>>();
setInterval(() => {
  for (const ref of registry) {
    const l = ref.deref();
    if (l) l.cleanup();
    else registry.delete(ref);
  }
}, 60_000).unref?.();

/** The 429 every limit answers with. */
export function tooManyRequests(c: Context, retryAfterSeconds: number) {
  const retryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
  c.header("Retry-After", String(retryAfter));
  return c.json({ error: "RATE_LIMITED", retryAfter }, 429);
}

/** Rate-limit key for the request: the signed-in user if a previous middleware set one, else the IP. */
export function userOrIpKey(c: Context): string {
  const user = c.get("user") as { id?: string } | undefined;
  return user?.id ? `u:${user.id}` : ipKey(c);
}

export const ipKey = (c: Context) => `ip:${ipBucket(clientIp(c))}`;

export interface RateLimitOptions {
  /** For logs; also tells limits apart in tests. */
  name: string;
  rules: Rule[];
  /** Defaults to the user id when signed in, else the IP. `null` skips the limit. */
  key?: (c: Context) => string | null;
  maxKeys?: number;
}

export type RateLimitMiddleware = MiddlewareHandler & { limiter: RateLimiter; limitName: string };

/**
 * Hono middleware: answers 429 `{error: "RATE_LIMITED", retryAfter}` with a `Retry-After`
 * header once a rule is exceeded. Reuse one instance on several routes for a shared bucket.
 */
export function rateLimit(opts: RateLimitOptions): RateLimitMiddleware {
  const limiter = new RateLimiter(opts.rules, { maxKeys: opts.maxKeys });
  const key = opts.key ?? userOrIpKey;
  const mw: MiddlewareHandler = async (c, next) => {
    if (env.rateLimitDisabled) return next();
    const k = key(c);
    if (k === null) return next();
    const r = limiter.hit(k);
    if (!r.ok) {
      if (!env.isProd) console.warn(`[rate-limit] ${opts.name} blocked ${k}`);
      return tooManyRequests(c, r.retryAfterMs / 1000);
    }
    return next();
  };
  return Object.assign(mw, { limiter, limitName: opts.name });
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
