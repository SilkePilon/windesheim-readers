import type { Context } from "hono";
import { getConnInfo } from "@hono/bun";
import { isIP } from "node:net";
import { env } from "../env";

/**
 * Header the server sets (overwriting anything a client sent) with the resolved client IP
 * before handing a request to better-auth, so its rate limiter and session records see the
 * same address as ours.
 */
export const AUTH_IP_HEADER = "x-wr-client-ip";

/** Trims, drops brackets/ports and turns IPv4-mapped IPv6 (`::ffff:1.2.3.4`) into IPv4. */
export function normalizeIp(raw: string | null | undefined): string | null {
  let ip = (raw ?? "").trim();
  if (!ip) return null;
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1]!;
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  ip = ip.toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(\.\d{1,3}){3})$/.exec(ip);
  if (mapped) ip = mapped[1]!;
  return isIP(ip) ? ip : null;
}

/** The client IP from a proxy header value. `x-forwarded-for` style lists use the first entry. */
export function ipFromHeader(value: string | null | undefined): string | null {
  if (!value) return null;
  return normalizeIp(value.split(",")[0]);
}

/** Expands an IPv6 address to its 8 groups (no validation beyond what `isIP` already did). */
function ipv6Groups(ip: string): string[] {
  const [head = "", tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  // An embedded IPv4 tail (`::1.2.3.4`) counts as two groups.
  const fix = (parts: string[]) =>
    parts.flatMap((p) => {
      if (!p.includes(".")) return [p];
      const [a, b, c, d] = p.split(".").map(Number) as [number, number, number, number];
      return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
    });
  const l = fix(left);
  const r = fix(right);
  const zeros = tail === undefined ? [] : Array(Math.max(0, 8 - l.length - r.length)).fill("0");
  return [...l, ...zeros, ...r].map((g) => g.replace(/^0+(?=.)/, ""));
}

/**
 * The key an IP is rate limited under. IPv6 users usually get a whole /64, so per-address
 * limits would be trivial to dodge: collapse IPv6 to its /64 prefix.
 */
export function ipBucket(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  return `${ipv6Groups(ip).slice(0, 4).join(":")}::/64`;
}

function socketIp(c: Context): string | null {
  try {
    // Bun passes its server as the second `fetch` argument, which Hono exposes as `c.env`.
    return normalizeIp(getConnInfo(c).remote.address);
  } catch {
    return null; // not running under Bun.serve (e.g. `app.request` in tests)
  }
}

/**
 * The real client IP: from `CLIENT_IP_HEADER` when configured (the proxy sets it), otherwise
 * the socket address. `"unknown"` when neither is available.
 */
export function clientIp(c: Context): string {
  const header = env.clientIpHeader;
  return (header ? ipFromHeader(c.req.header(header)) : null) ?? socketIp(c) ?? "unknown";
}
