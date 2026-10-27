import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { env } from "../server/env";
import { clientIp, ipBucket, ipFromHeader, normalizeIp } from "../server/lib/client-ip";

const header = env.clientIpHeader;
afterEach(() => {
  env.clientIpHeader = header;
});

describe("parsing", () => {
  test("normalizeIp", () => {
    expect(normalizeIp(" 203.0.113.7 ")).toBe("203.0.113.7");
    expect(normalizeIp("203.0.113.7:51234")).toBe("203.0.113.7");
    expect(normalizeIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp("2001:DB8::1")).toBe("2001:db8::1");
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(normalizeIp("not-an-ip")).toBeNull();
    expect(normalizeIp("")).toBeNull();
    expect(normalizeIp(undefined)).toBeNull();
  });

  test("ipFromHeader takes the first x-forwarded-for entry", () => {
    expect(ipFromHeader("203.0.113.7")).toBe("203.0.113.7");
    expect(ipFromHeader("203.0.113.7, 10.0.0.2, 10.0.0.3")).toBe("203.0.113.7");
    expect(ipFromHeader("garbage, 10.0.0.2")).toBeNull();
    expect(ipFromHeader(null)).toBeNull();
  });

  test("ipBucket collapses IPv6 to its /64 and leaves IPv4 alone", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("2001:db8:1:2:bbbb:cccc:dddd:eeee")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipBucket("::1")).toBe("0:0:0:0::/64");
  });
});

describe("clientIp", () => {
  const app = new Hono().get("/ip", (c) => c.text(clientIp(c)));

  test("uses CLIENT_IP_HEADER when configured", async () => {
    env.clientIpHeader = "cf-connecting-ip";
    expect(await (await app.request("/ip", { headers: { "cf-connecting-ip": "198.51.100.4" } })).text()).toBe("198.51.100.4");
    env.clientIpHeader = "x-forwarded-for";
    const r = await app.request("/ip", { headers: { "x-forwarded-for": "198.51.100.4, 172.16.0.1" } });
    expect(await r.text()).toBe("198.51.100.4");
  });

  test("ignores forwarding headers when CLIENT_IP_HEADER is unset; 'unknown' without a socket", async () => {
    env.clientIpHeader = "";
    const r = await app.request("/ip", { headers: { "x-forwarded-for": "6.6.6.6", "cf-connecting-ip": "6.6.6.6" } });
    expect(await r.text()).toBe("unknown"); // app.request has no Bun server behind it
  });

  test("reads the socket address under Bun.serve, exported like server/index.ts", async () => {
    env.clientIpHeader = "";
    // Same shape as server/index.ts: Bun calls fetch(req, server) and Hono exposes it as c.env.
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
    try {
      const r = await fetch(`http://127.0.0.1:${server.port}/ip`, { headers: { "x-forwarded-for": "6.6.6.6" } });
      expect(await r.text()).toBe("127.0.0.1");
    } finally {
      server.stop(true);
    }
  });

  test("falls back to the socket when the configured header is missing", async () => {
    env.clientIpHeader = "cf-connecting-ip";
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
    try {
      expect(await (await fetch(`http://127.0.0.1:${server.port}/ip`)).text()).toBe("127.0.0.1");
      const r = await fetch(`http://127.0.0.1:${server.port}/ip`, { headers: { "cf-connecting-ip": "198.51.100.9" } });
      expect(await r.text()).toBe("198.51.100.9");
    } finally {
      server.stop(true);
    }
  });
});
