/**
 * Link previews: the dynamic battle invite image (`GET /og/battle/:code.png`) and the SPA
 * shell with per-route meta (see meta.ts). Only what the card shows ever leaves here: host
 * display name, lesson, player count, status and settings. Never player names.
 */
import { Hono, type Context } from "hono";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { limits } from "../limits";
import { displayName } from "../middleware";
import { battlePreview } from "../live/battle";
import { pickLang, type OgLang } from "./copy";
import { BattleCard, GenericBattleCard, type BattleCardData } from "./cards";
import { renderPng } from "./render";
import { injectMeta, metaForPath, renderMetaBlock, type BattleMetaInfo } from "./meta";

const NAME_MAX = 28;
const clip = (s: string, n: number) => {
  const chars = [...s.trim()];
  return chars.length > n ? `${chars.slice(0, n - 1).join("").trimEnd()}…` : chars.join("");
};

export type BattleOgData = BattleCardData & { sig: string };

/** The card data for a live room, or null when the code isn't one. */
export function battleOgData(code: string): BattleOgData | null {
  const p = battlePreview(code);
  if (!p) return null;
  const host = db
    .select({ nickname: schema.user.nickname, name: schema.user.name, email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, p.hostId))
    .get();
  const lessons = p.lessonIds.length
    ? db.select({ id: schema.lesson.id, code: schema.lesson.code, title: schema.lesson.title }).from(schema.lesson).where(inArray(schema.lesson.id, p.lessonIds)).all()
    : [];
  // Keep the room's lesson order.
  const first = p.lessonIds.map((id) => lessons.find((l) => l.id === id)).find(Boolean);
  const data: BattleCardData = {
    code: p.code,
    status: p.status,
    hostName: clip(host ? displayName(host) : "Host", NAME_MAX),
    lessonCode: first?.code ?? "",
    lessonTitle: first ? clip(first.title, 60) : "",
    moreLessons: Math.max(0, p.lessonIds.length - 1),
    playerCount: p.playerCount,
    settings: p.settings,
  };
  return { ...data, sig: Bun.hash(JSON.stringify(data)).toString(36) };
}

function battleMeta(code: string): BattleMetaInfo | null {
  const d = battleOgData(code);
  if (!d) return null;
  return {
    code: d.code,
    status: d.status,
    hostName: d.hostName,
    lesson: d.lessonTitle ? `${d.lessonCode} ${d.lessonTitle}` : d.lessonCode || "Quiz Battle",
    playerCount: d.playerCount,
    sig: d.sig,
  };
}

// ----- rendered PNGs: small LRU keyed by code + state signature + language -----

const CACHE_MAX = 50;
const pngCache = new Map<string, Buffer>();

async function cached(key: string, render: () => Promise<Buffer>): Promise<Buffer> {
  const hit = pngCache.get(key);
  if (hit) {
    pngCache.delete(key);
    pngCache.set(key, hit);
    return hit;
  }
  const png = await render();
  pngCache.set(key, png);
  while (pngCache.size > CACHE_MAX) pngCache.delete(pngCache.keys().next().value!);
  return png;
}

/** For tests. */
export const ogCacheSize = () => pngCache.size;

const langOf = (c: Context): OgLang => pickLang(c.req.query("lang"), c.req.header("accept-language"));

export const og = new Hono();

og.get("/battle/:file", limits.og, async (c) => {
  const m = /^(\d{6}|invite)\.png$/.exec(c.req.param("file"));
  if (!m) return c.json({ error: "NOT_FOUND" }, 404);
  const lang = langOf(c);
  const data = m[1] === "invite" ? null : battleOgData(m[1]!);
  const png = data
    ? await cached(`${data.code}:${data.sig}:${lang}`, () => renderPng(<BattleCard data={data} lang={lang} />))
    : await cached(`invite:${lang}`, () => renderPng(<GenericBattleCard lang={lang} />));
  return c.body(new Uint8Array(png), 200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=60",
    Vary: "Accept-Language",
  });
});

/** The SPA shell for any path, with that path's link-preview meta. The template is read once. */
export function spaShell(templatePath: string) {
  let template: Promise<string> | null = null;
  return async (c: Context) => {
    template ??= Bun.file(templatePath)
      .text()
      .catch((err) => {
        template = null; // retry on the next request
        throw err;
      });
    const lang = langOf(c);
    const meta = metaForPath(c.req.path, { appUrl: env.appUrl, lang, battle: battleMeta });
    c.header("Vary", "Accept-Language");
    return c.html(injectMeta(await template, renderMetaBlock(meta, lang)));
  };
}
