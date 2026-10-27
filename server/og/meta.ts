/**
 * Per-route link-preview meta for the SPA shell. Crawlers (Discord, WhatsApp, Slack, Teams,
 * iMessage) don't run JS, so the server rewrites the block between the markers in
 * index.html's <head>. Pure: no env, no database (vite.config.ts uses it in dev too).
 */
import { OG_COPY, type OgLang } from "./copy";

export const META_START = "<!-- og:start -->";
export const META_END = "<!-- og:end -->";

/** What the battle meta needs from a live room. No player names: counts only. */
export interface BattleMetaInfo {
  code: string;
  status: "lobby" | "playing" | "ended";
  hostName: string;
  lesson: string;
  playerCount: number;
  /** Changes whenever the card would; busts crawler caches via `?v=`. */
  sig: string;
}

export interface PageMeta {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ESC[ch]!);

export const BATTLE_PATH = /^\/battle\/(\d{6})\/?$/;

/** The meta for a path. `battle` looks up a live room (null: unknown or expired code). */
export function metaForPath(
  path: string,
  opts: { appUrl: string; lang: OgLang; battle?: (code: string) => BattleMetaInfo | null },
): PageMeta {
  const base = opts.appUrl.replace(/\/+$/, "");
  const t = OG_COPY[opts.lang];
  const langQ = opts.lang === "en" ? "lang=en" : "";
  const defaults: PageMeta = {
    title: t.appName,
    description: t.description,
    url: `${base}/`,
    image: `${base}/og/${opts.lang === "en" ? "default-en" : "default"}.png`,
    imageAlt: t.imageAlt,
    imageWidth: 1200,
    imageHeight: 630,
  };
  const clean = path.replace(/\/+$/, "") || "/";

  if (clean === "/login") return { ...defaults, title: t.loginTitle, description: t.loginDescription, url: `${base}/login` };
  if (clean.startsWith("/lesson/")) return { ...defaults, title: t.lessonTitle, description: t.lessonDescription };

  const m = BATTLE_PATH.exec(path);
  if (m || clean === "/battle") {
    const code = m?.[1];
    const room = code ? (opts.battle?.(code) ?? null) : null;
    const b = t.battle;
    if (code && room) {
      const description =
        room.status === "lobby"
          ? b.description(room.hostName, room.lesson, room.playerCount)
          : room.status === "playing"
            ? b.descriptionPlaying(room.hostName, room.lesson)
            : b.descriptionEnded(room.hostName, room.lesson);
      const q = [`v=${encodeURIComponent(room.sig)}`, langQ].filter(Boolean).join("&");
      return {
        ...defaults,
        title: b.pageTitle(code),
        description,
        url: `${base}/battle/${code}`,
        image: `${base}/og/battle/${code}.png?${q}`,
        imageAlt: b.imageAlt(code),
      };
    }
    return {
      ...defaults,
      title: code ? b.pageTitle(code) : b.pageTitleGeneric,
      description: b.descriptionGeneric,
      url: code ? `${base}/battle/${code}` : `${base}/battle`,
      image: `${base}/og/battle/invite.png${langQ ? `?${langQ}` : ""}`,
      imageAlt: b.title,
    };
  }
  return defaults;
}

/** The <head> block: title, description, Open Graph and Twitter card. Every value escaped. */
export function renderMetaBlock(m: PageMeta, lang: OgLang): string {
  const e = escapeHtml;
  const [locale, alternate] = lang === "en" ? ["en_GB", "nl_NL"] : ["nl_NL", "en_GB"];
  const prop = (p: string, v: string | number) => `<meta property="${p}" content="${e(String(v))}" />`;
  const name = (n: string, v: string) => `<meta name="${n}" content="${e(v)}" />`;
  return [
    META_START,
    `<title>${e(m.title)}</title>`,
    name("description", m.description),
    `<link rel="canonical" href="${e(m.url)}" />`,
    prop("og:type", "website"),
    prop("og:site_name", OG_COPY[lang].appName),
    prop("og:locale", locale!),
    prop("og:locale:alternate", alternate!),
    prop("og:title", m.title),
    prop("og:description", m.description),
    prop("og:url", m.url),
    prop("og:image", m.image),
    prop("og:image:type", "image/png"),
    prop("og:image:width", m.imageWidth),
    prop("og:image:height", m.imageHeight),
    prop("og:image:alt", m.imageAlt),
    name("twitter:card", "summary_large_image"),
    name("twitter:title", m.title),
    name("twitter:description", m.description),
    name("twitter:image", m.image),
    name("twitter:image:alt", m.imageAlt),
    META_END,
  ].join("\n    ");
}

/** Replaces the marked block in index.html (or inserts it before </head> if the markers are gone). */
export function injectMeta(html: string, block: string): string {
  const a = html.indexOf(META_START);
  const b = html.indexOf(META_END);
  if (a >= 0 && b > a) return html.slice(0, a) + block + html.slice(b + META_END.length);
  return html.replace(/<title>[\s\S]*?<\/title>/, "").replace("</head>", `  ${block}\n  </head>`);
}
