/**
 * Renders the default link-preview card (public/og/default.png, committed) with the same
 * satori pipeline the server uses for battle cards, plus a slice of the real lesson world.
 *
 *   bun scripts/og-images.tsx                  # writes public/og/default.png (+ default-en.png)
 *   bun scripts/og-images.tsx --preview /tmp/wr-og   # also every card variant, for a visual check
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { composeWorld, bubbleBox, WORLD_WIDTH, type WorldInput, type WorldLayout } from "../src/lib/world/compose";
import { REGISTRY } from "../src/components/world/registry";
import { renderWorldSvg } from "../src/components/world/render";
import type { PathNodeState } from "../shared/path";
import { renderPng } from "../server/og/render";
import { BattleCard, DefaultCard, DEFAULT_ART_SIZE, GenericBattleCard, P, type BattleCardData } from "../server/og/cards";
import type { OgLang } from "../server/og/copy";

const ART_W = DEFAULT_ART_SIZE.width;
const ART_H = DEFAULT_ART_SIZE.height;

/** A demo reader: 5 weeks of 3 lessons, the first 4 done, the 5th current. */
function demoWorld() {
  const weeks = 5;
  const perWeek = 3;
  const done = 4;
  const lessons = Array.from({ length: weeks * perWeek }, (_, i) => {
    const state: PathNodeState = i < done ? "done" : i === done ? "current" : "new";
    const week = 1 + Math.floor(i / perWeek);
    return { id: `l${i}`, code: `${week}.${1 + (i % perWeek)}`, week, state, level: i < done ? 3 : 0, mastery: i < done ? 1 : 0 };
  });
  const input: WorldInput = { seed: "og-default-card", lessons };
  return composeWorld(input, REGISTRY);
}

/**
 * The world's layered HTML (render.ts) flattened into one SVG and rendered to a PNG at
 * `scale`, cropped to the art panel from world row `y0`: the ground/road svg and each week
 * segment as a group. The grain (it doubles the PNG size), evening grade, light halos and
 * text banners are left out (day mode; satori draws the text). The whole world is rendered
 * first and then cropped as an image: resvg-js 2.6 panics on an opacity group completely
 * outside the canvas.
 */
function worldPng(layout: WorldLayout, scale: number, y0: number) {
  const html = renderWorldSvg(layout);
  const W = WORLD_WIDTH;
  const svgs = [...html.matchAll(/<svg [^>]*class="([^"]+)"([^>]*)>([\s\S]*?)<\/svg>/g)];
  let body = "";
  for (const [, cls, , inner] of svgs) {
    if (cls === "world-svg") body += inner;
    else if (cls === "world-seg") {
      // Its viewBox maps 1:1 onto its rows of the world, so a plain group is the same.
      body += `<g>${inner}</g>`;
    }
  }
  const H = layout.height;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  const full = new Resvg(svg, { fitTo: { mode: "width", value: ART_W } }).render().asPng();
  const fullH = (H * ART_W) / W;
  const crop =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ART_W}" height="${ART_H}" viewBox="0 ${y0 * scale} ${ART_W} ${ART_H}">` +
    `<image href="data:image/png;base64,${full.toString("base64")}" x="0" y="0" width="${ART_W}" height="${fullH}"/></svg>`;
  const png = new Resvg(crop).render().asPng();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** The art panel: the world slice with the lesson nodes, week banners and "Verder" bubble on top. */
function WorldArt({ lang }: { lang: OgLang }) {
  const scale = ART_W / WORLD_WIDTH;
  const visibleH = ART_H / scale;
  const layout = demoWorld();
  const current = layout.nodes.find((n) => n.state === "current")!;
  // The current lesson near the top, the finished road (and the scenery it built) below it,
  // down to the banner that opens the current week.
  const banner = layout.banners.find((b) => b.y > current.y);
  const y0 = Math.round(banner ? banner.y + 40 - visibleH : current.y - visibleH * 0.2);
  const art = worldPng(layout, scale, y0);
  const X = (x: number) => x * scale;
  const Y = (y: number) => (y - y0) * scale;
  const inView = (y: number) => y > y0 - 60 && y < y0 + visibleH + 60;
  const NODE = {
    done: { bg: P.mint, fg: "#0D2A27", shade: P.mintShade, w: 70, h: 64 },
    current: { bg: P.primary, fg: P.white, shade: P.primaryShade, w: 80, h: 72 },
    started: { bg: P.white, fg: P.primary, shade: P.chunky, w: 70, h: 64 },
    new: { bg: P.white, fg: "#8C82B5", shade: P.chunky, w: 70, h: 64 },
  } as const;
  const bubble = bubbleBox(current.x);
  return (
    <div style={{ display: "flex", position: "relative", width: ART_W, height: ART_H }}>
      <img src={art} width={ART_W} height={ART_H} style={{ position: "absolute", left: 0, top: 0 }} />
      {layout.banners.filter((b) => inView(b.y)).map((b) => {
        const [bg, shade] = REGISTRY[b.biome].bannerBg;
        const w = 120 * scale;
        return (
          <div
            key={b.week}
            style={{
              position: "absolute",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              left: X(WORLD_WIDTH / 2) - w / 2,
              top: Y(b.y) - 19 * scale,
              width: w,
              height: 34 * scale,
              borderRadius: 999,
              background: bg,
              boxShadow: `0 4px 0 ${shade}`,
              color: P.white,
              fontFamily: "Fredoka",
              fontWeight: 700,
              fontSize: 17 * scale,
            }}
          >
            {`Week ${b.week}`}
          </div>
        );
      })}
      {layout.nodes.filter((n) => inView(n.y)).map((n) => {
        const s = NODE[n.state];
        const w = s.w * scale;
        const h = s.h * scale;
        return (
          <div
            key={n.id}
            style={{
              position: "absolute",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              left: X(n.x) - w / 2,
              top: Y(n.y) - h / 2,
              width: w,
              height: h,
              borderRadius: "50%",
              background: s.bg,
              boxShadow: `0 ${6 * scale}px 0 ${s.shade}`,
              color: s.fg,
              fontFamily: "Fredoka",
              fontWeight: 700,
              fontSize: (n.state === "current" ? 21 : 18) * scale,
            }}
          >
            {n.code}
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          left: X(current.x + bubble.dx),
          top: Y(current.y + bubble.dy),
          width: bubble.w * scale,
          height: bubble.h * scale,
          borderRadius: 10 * scale,
          background: P.ink,
          boxShadow: `0 ${3 * scale}px 0 rgba(0,0,0,0.2)`,
          color: P.white,
          fontFamily: "Nunito",
          fontWeight: 800,
          fontSize: 14 * scale,
        }}
      >
        {lang === "nl" ? "Verder" : "Continue"}
      </div>
    </div>
  );
}

const defaultCard = (lang: OgLang) => renderPng(<DefaultCard lang={lang} art={<WorldArt lang={lang} />} />);

const FAKE_BATTLE: BattleCardData = {
  code: "482916",
  status: "lobby",
  hostName: "Silke",
  lessonCode: "2.3",
  lessonTitle: "Procesmodellering met BPMN",
  moreLessons: 1,
  playerCount: 14,
  settings: { count: 10, questionSeconds: 20, points: "lastDouble", difficulty: "mixed" },
};

const args = process.argv.slice(2);
const out = "public/og";
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "default.png"), await defaultCard("nl"));
writeFileSync(join(out, "default-en.png"), await defaultCard("en"));
console.log(`wrote ${out}/default.png, ${out}/default-en.png`);

const pi = args.indexOf("--preview");
if (pi >= 0) {
  const dir = args[pi + 1] ?? "/tmp/wr-og";
  mkdirSync(dir, { recursive: true });
  const cards: [string, () => Promise<Buffer>][] = [
    ["default-nl", () => defaultCard("nl")],
    ["default-en", () => defaultCard("en")],
    ["battle-nl", () => renderPng(<BattleCard data={FAKE_BATTLE} lang="nl" />)],
    ["battle-en", () => renderPng(<BattleCard data={FAKE_BATTLE} lang="en" />)],
    [
      "battle-playing-nl",
      () =>
        renderPng(
          <BattleCard
            data={{ ...FAKE_BATTLE, status: "playing", hostName: "Maximiliaan-Alexander", lessonTitle: "Een hele lange lestitel die echt niet op één regel past", moreLessons: 0, playerCount: 3, settings: { count: 20, questionSeconds: 10, points: "allDouble", difficulty: "hard" } }}
            lang="nl"
          />,
        ),
    ],
    ["battle-ended-nl", () => renderPng(<BattleCard data={{ ...FAKE_BATTLE, status: "ended", playerCount: 1, moreLessons: 0 }} lang="nl" />)],
    ["unknown-nl", () => renderPng(<GenericBattleCard lang="nl" />)],
    ["unknown-en", () => renderPng(<GenericBattleCard lang="en" />)],
  ];
  for (const [name, make] of cards) {
    const t0 = performance.now();
    writeFileSync(join(dir, `${name}.png`), await make());
    console.log(`${dir}/${name}.png ${Math.round(performance.now() - t0)} ms`);
  }
}
