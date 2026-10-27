// Link previews: per-route meta injection, the battle preview accessor and the OG image endpoint.
import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import type { WSContext } from "hono/ws";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { limits } from "../server/limits";
import { battleConnection, battlePreview } from "../server/live/battle";
import type { SessionUser } from "../server/auth";
import { pickLang } from "../server/og/copy";
import { escapeHtml, injectMeta, metaForPath, renderMetaBlock, META_END, META_START, type BattleMetaInfo } from "../server/og/meta";

runMigrations();
const { app } = await import("../server/app");
const { battleOgData, ogCacheSize, spaShell } = await import("../server/og");

const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
afterAll(() => warnSpy.mockRestore());

const TEMPLATE = `<!doctype html><html lang="nl"><head><meta charset="UTF-8" />
    ${META_START}
    <title>Windesheim Readers</title>
    <meta property="og:title" content="Windesheim Readers" />
    ${META_END}
  </head><body><div id="root"></div></body></html>`;

const APP = "https://learn.example.test";

// ---------------------------------------------------------------- meta

describe("meta", () => {
  const room: BattleMetaInfo = { code: "123456", status: "lobby", hostName: "Silke", lesson: "2.3 Procesmodellering", playerCount: 4, sig: "abc" };
  const lookup = (code: string) => (code === "123456" ? room : null);

  test("default, login and lesson pages", () => {
    const home = metaForPath("/", { appUrl: `${APP}/`, lang: "nl" });
    expect(home.title).toBe("Windesheim Readers");
    expect(home.image).toBe(`${APP}/og/default.png`);
    expect(home.url).toBe(`${APP}/`);
    expect(metaForPath("/", { appUrl: APP, lang: "en" }).image).toBe(`${APP}/og/default-en.png`);
    expect(metaForPath("/login", { appUrl: APP, lang: "nl" }).title).toBe("Inloggen · Windesheim Readers");
    const lesson = metaForPath("/lesson/secret-id/quiz", { appUrl: APP, lang: "nl" });
    expect(lesson.title).toBe("Les in Windesheim Readers");
    // No private data: not even the lesson id.
    expect(JSON.stringify(lesson)).not.toContain("secret-id");
  });

  test("a live battle: code in the title, host and lesson in the description, versioned image", () => {
    const m = metaForPath("/battle/123456", { appUrl: APP, lang: "nl", battle: lookup });
    expect(m.title).toBe("Quiz Battle 123456 · Windesheim Readers");
    expect(m.description).toContain("Silke");
    expect(m.description).toContain("2.3 Procesmodellering");
    expect(m.description).toContain("4 spelers");
    expect(m.image).toBe(`${APP}/og/battle/123456.png?v=abc`);
    expect(m.url).toBe(`${APP}/battle/123456`);
    expect(metaForPath("/battle/123456", { appUrl: APP, lang: "en", battle: lookup }).image).toBe(`${APP}/og/battle/123456.png?v=abc&lang=en`);
  });

  test("an unknown or expired code gets the generic invite", () => {
    const m = metaForPath("/battle/654321", { appUrl: APP, lang: "nl", battle: lookup });
    expect(m.title).toBe("Quiz Battle 654321 · Windesheim Readers");
    expect(m.description).not.toContain("Silke");
    expect(m.image).toBe(`${APP}/og/battle/invite.png`);
    // Not a 6-digit code: the plain default card.
    expect(metaForPath("/battle/12345x", { appUrl: APP, lang: "nl", battle: lookup }).image).toBe(`${APP}/og/default.png`);
  });

  test("every injected value is escaped", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    const evil: BattleMetaInfo = { ...room, hostName: `"><script>alert(1)</script>`, lesson: `Tom & Jerry's <b>` };
    const m = metaForPath("/battle/123456", { appUrl: APP, lang: "nl", battle: () => evil });
    const html = injectMeta(TEMPLATE, renderMetaBlock(m, "nl"));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Tom &amp; Jerry&#39;s &lt;b&gt;");
  });

  test("injection replaces the marked block exactly once", () => {
    const m = metaForPath("/login", { appUrl: APP, lang: "nl" });
    const html = injectMeta(TEMPLATE, renderMetaBlock(m, "nl"));
    expect(html.match(/<title>/g)?.length).toBe(1);
    expect(html.match(/property="og:title"/g)?.length).toBe(1);
    expect(html).toContain("<title>Inloggen · Windesheim Readers</title>");
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<meta property="og:locale" content="nl_NL" />');
    expect(html).toContain('<meta property="og:locale:alternate" content="en_GB" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    // Without markers: inserted before </head>, the old title dropped.
    const bare = injectMeta("<html><head><title>x</title></head></html>", renderMetaBlock(m, "nl"));
    expect(bare.match(/<title>/g)?.length).toBe(1);
    expect(bare).toContain("og:title");
  });

  test("language: ?lang= wins, then Accept-Language, nl by default", () => {
    expect(pickLang(null, null)).toBe("nl");
    expect(pickLang("en", "nl-NL")).toBe("en");
    expect(pickLang("xx", "en-GB,en;q=0.9")).toBe("en");
    expect(pickLang(null, "de-DE,en;q=0.5,nl;q=0.8")).toBe("nl");
    expect(pickLang(null, "fr")).toBe("nl");
  });
});

// ---------------------------------------------------------------- a fake live room

type Sent = { t: string; code?: string; error?: string };
function fakeSocket() {
  const sent: Sent[] = [];
  const ws = { send: (m: string) => sent.push(JSON.parse(m)), close: () => {} } as unknown as WSContext;
  return { ws, sent };
}
const user = (id: string, name: string, nickname: string | null = null) =>
  ({ id, name, email: `${id}@student.windesheim.nl`, nickname, role: "user" }) as unknown as SessionUser;

const HOST = user("og-host", "Silke Pilon", null);
const P1 = user("og-p1", "Alice Geheim", "Ali");
const P2 = user("og-p2", "Bobby Verborgen", null);
let code = "";

beforeAll(async () => {
  for (const u of [HOST, P1, P2]) db.insert(schema.user).values({ id: u.id, name: u.name, email: u.email, nickname: u.nickname }).onConflictDoNothing().run();
  db.insert(schema.reader).values({ id: "og-reader", title: "R", fileName: "r.pdf", status: "ready", published: true }).onConflictDoNothing().run();
  db.insert(schema.lesson)
    .values({ id: "og-lesson", readerId: "og-reader", code: "2.3", title: "Procesmodellering met BPMN", week: 2, position: 0, startPage: 1, endPage: 2, status: "ready" })
    .onConflictDoNothing()
    .run();
  for (let i = 0; i < 4; i++)
    db.insert(schema.question)
      .values({ id: `og-q${i}`, lessonId: "og-lesson", type: "tf", prompt: `Q${i}`, data: { type: "tf", answer: true, explanation: "" } })
      .onConflictDoNothing()
      .run();

  const host = fakeSocket();
  await battleConnection(HOST).onMessage(JSON.stringify({ t: "create", lessonIds: ["og-lesson"], count: 5, hostPlays: false }), host.ws);
  code = host.sent.find((m) => m.t === "room")!.code!;
  for (const p of [P1, P2]) await battleConnection(p).onMessage(JSON.stringify({ t: "join", code }), fakeSocket().ws);
});

describe("battlePreview", () => {
  test("counts and settings only, never player names", () => {
    const p = battlePreview(code)!;
    expect(p).toMatchObject({ code, status: "lobby", hostId: HOST.id, lessonIds: ["og-lesson"], playerCount: 2 });
    expect(p.settings).toEqual({ count: 4, questionSeconds: 20, points: "normal", difficulty: "mixed" });
    const json = JSON.stringify(p);
    for (const leak of ["Alice", "Ali", "Bobby", P1.id, P2.id, "student.windesheim.nl", "score", "players\""]) expect(json).not.toContain(leak);
    expect(battlePreview("000000")).toBeNull();
  });

  test("card data: the host's display name (never an email) and the lesson", () => {
    const d = battleOgData(code)!;
    expect(d).toMatchObject({ hostName: "Silke", lessonCode: "2.3", lessonTitle: "Procesmodellering met BPMN", playerCount: 2, status: "lobby" });
    expect(JSON.stringify(d)).not.toContain("@");
    expect(d.sig).toMatch(/^[0-9a-z]+$/);
  });
});

// ---------------------------------------------------------------- the endpoint

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buf: Uint8Array) {
  const v = new DataView(buf.buffer, buf.byteOffset);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("GET /og/battle/:code.png", () => {
  beforeEach(() => limits.og.limiter.reset());

  test("a live room: a 1200×630 PNG, cached for a minute", async () => {
    const t0 = performance.now();
    const res = await app.request(`/og/battle/${code}.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect([...buf.slice(0, 8)]).toEqual(PNG_SIG);
    expect(pngSize(buf)).toEqual({ width: 1200, height: 630 });
    const first = performance.now() - t0;
    // A second request is served from the LRU.
    const before = ogCacheSize();
    const t1 = performance.now();
    const again = new Uint8Array(await (await app.request(`/og/battle/${code}.png`)).arrayBuffer());
    expect(performance.now() - t1).toBeLessThan(first);
    expect(ogCacheSize()).toBe(before);
    expect(again).toEqual(buf);
    // English is its own entry.
    expect((await app.request(`/og/battle/${code}.png?lang=en`)).status).toBe(200);
    expect(ogCacheSize()).toBe(before + 1);
  });

  test("an unknown code and the invite get the generic card; other names are 404", async () => {
    for (const path of ["/og/battle/000000.png", "/og/battle/invite.png"]) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      const buf = new Uint8Array(await res.arrayBuffer());
      expect([...buf.slice(0, 8)]).toEqual(PNG_SIG);
      expect(pngSize(buf)).toEqual({ width: 1200, height: 630 });
    }
    for (const path of ["/og/battle/12345.png", "/og/battle/1234567.png", "/og/battle/123456.jpg", "/og/battle/..%2Fx.png"]) expect((await app.request(path)).status).toBe(404);
  });

  test("rate limited per IP: 60 per minute", async () => {
    // Pre-fill the bucket (app.request has no socket, so every request is "ip:unknown").
    for (let i = 0; i < 59; i++) limits.og.limiter.hit("ip:unknown");
    expect((await app.request("/og/battle/000000.png")).status).toBe(200);
    const res = await app.request("/og/battle/000000.png");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- the SPA shell

describe("spaShell", () => {
  const dir = mkdtempSync(join(tmpdir(), "wr-og-"));
  const file = join(dir, "index.html");
  writeFileSync(file, TEMPLATE);
  const shell = new Hono().get("*", spaShell(file));
  const appUrl = env.appUrl.replace(/\/+$/, "");

  test("/ and /login", async () => {
    const home = await (await shell.request("/")).text();
    expect(home).toContain(`<meta property="og:image" content="${appUrl}/og/default.png" />`);
    const login = await shell.request("/login", { headers: { "accept-language": "en-GB,en;q=0.9" } });
    expect(login.headers.get("content-type")).toContain("text/html");
    const html = await login.text();
    expect(html).toContain("<title>Sign in · Windesheim Readers</title>");
    expect(html).toContain(`${appUrl}/og/default-en.png`);
  });

  test("/battle/:code with the live room, no player names", async () => {
    const html = await (await shell.request(`/battle/${code}`)).text();
    const sig = battleOgData(code)!.sig;
    expect(html).toContain(`<title>Quiz Battle ${code} · Windesheim Readers</title>`);
    expect(html).toContain("Silke host een Quiz Battle over 2.3 Procesmodellering met BPMN. 2 spelers in de lobby.");
    expect(html).toContain(`content="${appUrl}/og/battle/${code}.png?v=${sig}"`);
    for (const leak of ["Alice", "Bobby", "@student"]) expect(html).not.toContain(leak);
  });

  test("/battle/:code for an unknown code", async () => {
    const html = await (await shell.request("/battle/000000")).text();
    expect(html).toContain("<title>Quiz Battle 000000 · Windesheim Readers</title>");
    expect(html).toContain(`${appUrl}/og/battle/invite.png`);
  });
});
