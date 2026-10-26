import type { Rect } from "@/lib/world/geometry";
import type { WorldLayout, WorldOp } from "@/lib/world/compose";
import { hashSeed, mulberry32 } from "@/lib/world/rng";
import type { BiomeId, SetPiece, Stage } from "@/lib/world/types";
import { cloudPuff, r1, sparkle } from "./kit";
import { REGISTRY } from "./registry";

export type RenderOpts = {
  /** Force the evening grade (otherwise it follows a `.dark` ancestor via CSS). */
  dark?: boolean;
  /** Banner text, e.g. "Week 3 · Zwolle". Defaults to "Week n". */
  label?: (b: { biome: BiomeId; week: number }) => string;
};

const BIOME_IDS = Object.keys(REGISTRY) as BiomeId[];
const BAND = 160;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Light halo: warm core fading to amber. */
const LIGHT_DEFS = `<radialGradient id="wk-glow"><stop offset="0" stop-color="#FFE7A3" stop-opacity=".95"/><stop offset=".3" stop-color="#FFC861" stop-opacity=".55"/><stop offset="1" stop-color="#FF9A3D" stop-opacity="0"/></radialGradient>`;
/** Shared defs: identical in every world SVG, so duplicate ids across instances are harmless. */
const SHARED_DEFS =
  `<radialGradient id="wk-mist"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".6" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
  `<filter id="wk-mute"><feColorMatrix type="saturate" values=".3"/><feComponentTransfer><feFuncR type="linear" slope=".7" intercept=".3"/><feFuncG type="linear" slope=".7" intercept=".3"/><feFuncB type="linear" slope=".7" intercept=".33"/></feComponentTransfer></filter>` +
  `<filter id="wk-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .1  0 0 0 0 .2  0 0 0 0 .15  0 0 0 .05 0"/></filter>` +
  `<pattern id="wk-grainp" width="160" height="160" patternUnits="userSpaceOnUse"><rect width="160" height="160" filter="url(#wk-grain)"/></pattern>` +
  BIOME_IDS.map(
    (id) =>
      `<radialGradient id="wk-patch-${id}"><stop offset="0" stop-color="${REGISTRY[id].patch}" stop-opacity=".9"/><stop offset="1" stop-color="${REGISTRY[id].patch}" stop-opacity="0"/></radialGradient>`,
  ).join("");

/** Soft lighter island under a set piece (the mockup's patch). */
const patch = (bbox: Rect, biome: BiomeId) =>
  `<ellipse cx="${r1(bbox.x + bbox.w / 2)}" cy="${r1(bbox.y + bbox.h * 0.7)}" rx="${r1(bbox.w * 0.85)}" ry="${r1(bbox.h * 0.62)}" fill="url(#wk-patch-${biome})"/>`;

/** Fog over a not-started piece: mist plus two drifting cloud puffs. */
function fogOver(bbox: Rect, side: 1 | -1, k: number) {
  const cx = bbox.x + bbox.w / 2;
  const away = cx - side * bbox.w * 0.28;
  const toward = cx + side * bbox.w * 0.22;
  return (
    `<ellipse cx="${r1(cx)}" cy="${r1(bbox.y + bbox.h * 0.6)}" rx="${r1(bbox.w * 0.95)}" ry="${r1(bbox.h * 0.75)}" fill="url(#wk-mist)"/>` +
    `<g class="fog" style="animation-delay:-${r1((k * 1.7) % 7)}s">${cloudPuff(away, bbox.y + bbox.h * 0.3, 0.95, 0.9)}${cloudPuff(toward, bbox.y + bbox.h + 4, 0.75, 0.85)}</g>`
  );
}

/** Three sparkles around the current lesson's piece. */
const sparkles = (bbox: Rect) =>
  sparkle(bbox.x + bbox.w * 0.82, bbox.y + 8, 0) +
  sparkle(bbox.x + bbox.w * 0.15, bbox.y + bbox.h * 0.42, 0.6) +
  sparkle(bbox.x + bbox.w * 0.6, bbox.y + bbox.h * 0.9, 1.2);

const MUTE_OPEN = `<g filter="url(#wk-mute)">`;

const LIGHT_RE = /<circle class="wl-light[^>]*\/>/g;

/**
 * Ops of one segment, in y order; muted runs (fog) share one filter group. Light halos are
 * lifted out into `lights` (drawn above the evening grade); fogged lights are dropped.
 */
function segmentBody(ops: WorldOp[], muted: (op: WorldOp) => boolean, lights: string[]) {
  let out = "";
  let open = false;
  for (const op of ops) {
    const m = muted(op);
    if (m !== open) {
      out += m ? MUTE_OPEN : "</g>";
      open = m;
    }
    out += liftLights(op.svg, m ? null : lights);
  }
  return open ? out + "</g>" : out;
}

function liftLights(svg: string, lights: string[] | null) {
  if (!svg.includes("wl-light")) return svg;
  return svg.replace(LIGHT_RE, (m) => {
    lights?.push(m);
    return "";
  });
}

/** Evening grade: a multiply wash, deep blue-violet, darker towards the top (the night ahead). */
const dusk = (id: string, x: number, w: number, h: number) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${h}" x2="0" y2="0"><stop offset="0" stop-color="${DUSK[0]}" stop-opacity="${DUSK[2]}"/><stop offset="1" stop-color="${DUSK[1]}" stop-opacity="${DUSK[3]}"/></linearGradient>` +
  `<rect class="wl-dusk" x="${x}" width="${w}" height="${h}" fill="url(#${id})" style="mix-blend-mode:multiply"/>`;
const DUSK = ["#5246D0", "#2E2496", 0.42, 0.56] as const;

/**
 * Layers: the art, then the light halos (`screen`, so lamps and windows glow over the
 * evening grade), then text (banners) so it stays crisp whatever grade the art gets.
 */
const layers = (W: number, H: number, cls: string, art: string, lights: string, top: string) => {
  const open = (c: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" class="${c}" aria-hidden="true" focusable="false">`;
  return (
    `<div class="world${cls}" style="aspect-ratio:${W}/${H}">` +
    `${open("world-svg")}${art}</svg>` +
    `${open("world-lights")}<defs>${LIGHT_DEFS}</defs>${lights}</svg>` +
    (top ? `${open("world-top")}${top}</svg>` : "") +
    `</div>`
  );
};

function road(d: string, splitY: number, H: number, p: string) {
  if (!d) return "";
  return (
    `<clipPath id="${p}-done"><rect x="-50" y="${splitY}" width="490" height="${H + 100}"/></clipPath><clipPath id="${p}-todo"><rect x="-50" y="-60" width="490" height="${splitY + 60}"/></clipPath>` +
    `<g clip-path="url(#${p}-todo)"><path d="${d}" fill="none" stroke="#D8C49C" stroke-width="30" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#EADBB8" stroke-width="22" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#D8C49C" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/></g>` +
    `<g clip-path="url(#${p}-done)"><path d="${d}" fill="none" stroke="#C9B8F2" stroke-width="38" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#F7F3FF" stroke-width="30" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#E4DAFF" stroke-width="7" stroke-dasharray="5 11" stroke-linecap="round" transform="translate(-6 0)"/><path d="${d}" fill="none" stroke="#E4DAFF" stroke-width="6" stroke-dasharray="4 13" stroke-dashoffset="7" stroke-linecap="round" transform="translate(7 0)"/></g>`
  );
}

function banner(y: number, biome: BiomeId, text: string, W: number) {
  const [bg, shade] = REGISTRY[biome].bannerBg;
  const w = Math.round(Math.min(186, Math.max(120, text.length * 8.6 + 36)));
  return (
    `<g transform="translate(${W / 2} ${r1(y)})"><path d="M-150 0 H150" stroke="#fff" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" opacity=".9"/>` +
    `<rect x="${-w / 2}" y="-13" width="${w}" height="34" rx="17" fill="${shade}"/><rect x="${-w / 2}" y="-17" width="${w}" height="34" rx="17" fill="${bg}"/>` +
    `<text y="6" text-anchor="middle" font-family="Fredoka, ui-rounded, system-ui, sans-serif" font-weight="700" font-size="15" fill="#fff">${esc(text)}</text></g>`
  );
}

/** Ground: one vertical gradient; each week's two stops, crossfading over 160px at borders. */
function groundGradient(layout: WorldLayout, id: string) {
  const H = layout.height;
  const off = (y: number) => r1(((H - y) / H) * 1000) / 1000;
  const n = layout.segments.length;
  let stops = "";
  layout.segments.forEach((s, k) => {
    const [lo, hi] = REGISTRY[s.biome].ground;
    stops += `<stop offset="${k === 0 ? 0 : off(s.bottom - BAND / 2)}" stop-color="${lo}"/>`;
    stops += `<stop offset="${k === n - 1 ? 1 : off(s.top + BAND / 2)}" stop-color="${hi}"/>`;
  });
  if (!n) stops = `<stop offset="0" stop-color="${REGISTRY.bos.ground[0]}"/><stop offset="1" stop-color="${REGISTRY.bos.ground[1]}"/>`;
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${H}" x2="0" y2="0">${stops}</linearGradient>`;
}

/**
 * The whole world as one SVG string: defs, ground, piece patches, road, one `<g>` per week
 * segment (ops in y order; fog runs muted), dusk overlay (dark mode), banners, grain.
 * Pure and deterministic. Lesson codes are not drawn here (the nodes are HTML buttons).
 */
export function renderWorldSvg(layout: WorldLayout, opts: RenderOpts = {}): string {
  const W = layout.width;
  const H = layout.height;
  const p = `w${hashSeed(`${H}|${layout.road.d}|${layout.segments.map((s) => s.biome).join()}`).toString(36)}`;
  const current = layout.nodes.find((n) => n.state === "current");
  // Fog line: half a gap above the current lesson; everything above it is still unexplored.
  const fogY = current ? current.y - 125 : -Infinity;
  const nodeState = new Map(layout.nodes.map((n) => [n.id, n.state]));
  const muted = (op: WorldOp) => (op.kind === "piece" ? op.stage === 0 : op.y < fogY);

  const bySeg: WorldOp[][] = layout.segments.map(() => []);
  for (const op of layout.ops) bySeg[op.segment]?.push(op);

  let patches = "";
  let segs = "";
  const lights: string[] = [];
  layout.segments.forEach((s, k) => {
    const ops = bySeg[k];
    let over = "";
    ops.forEach((op, i) => {
      if (op.kind !== "piece") return;
      patches += patch(op.bbox, s.biome);
      if (op.stage === 0) over += fogOver(op.bbox, op.side ?? 1, k * 7 + i);
      if (op.lessonId && nodeState.get(op.lessonId) === "current") over += sparkles(op.bbox);
    });
    segs += `<g class="wseg" data-seg="${k}" data-biome="${s.biome}">${segmentBody(ops, muted, lights)}${over}</g>`;
  });

  // Unexplored ground fades towards a pale haze above the fog line.
  const haze =
    fogY > 0
      ? `<linearGradient id="${p}-haze" gradientUnits="userSpaceOnUse" x1="0" y1="${fogY + 60}" x2="0" y2="${fogY - 140}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".24"/></linearGradient>` +
        `<rect x="-20" width="${W + 40}" height="${fogY + 60}" fill="url(#${p}-haze)"/>`
      : "";

  const label = opts.label ?? ((b) => `Week ${b.week}`);
  const banners = layout.banners.map((b) => banner(b.y, b.biome, label(b), W)).join("");

  const art =
    `<defs>${SHARED_DEFS}${groundGradient(layout, `${p}-ground`)}</defs>` +
    `<rect x="-20" width="${W + 40}" height="${H}" fill="url(#${p}-ground)"/>` +
    haze +
    patches +
    road(layout.road.d, layout.road.splitY, H, p) +
    segs +
    `<rect x="-20" width="${W + 40}" height="${H}" fill="url(#wk-grainp)" opacity=".9"/>` +
    dusk(`${p}-dusk`, -20, W + 40, H);
  return layers(W, H, opts.dark ? " wl-dark" : "", art, lights.join(""), banners);
}

/**
 * A single piece in one stage, for the dev gallery: the piece faces `side` (the road is drawn
 * as a strip on that side), with its footprint outlined.
 */
export function renderPieceTile(piece: SetPiece, stage: Stage, side: 1 | -1, opts: { dark?: boolean } = {}): string {
  const W = 220;
  const H = 180;
  const ax = W / 2 - side * 10;
  const ay = 138;
  const biome = REGISTRY[piece.biome];
  const raw = piece.render({ x: ax, y: ay, side, stage, current: stage === 1, rng: mulberry32(hashSeed(piece.id)) });
  const lights: string[] = [];
  const svg = liftLights(raw, stage === 0 ? null : lights);
  const fp = piece.footprint(side).map((r) => ({ x: r.x + ax, y: r.y + ay, w: r.w, h: r.h }));
  const bx = Math.min(...fp.map((r) => r.x));
  const by = Math.min(...fp.map((r) => r.y));
  const bbox = { x: bx, y: by, w: Math.max(...fp.map((r) => r.x + r.w)) - bx, h: Math.max(...fp.map((r) => r.y + r.h)) - by };
  const roadX = side === 1 ? W - 8 : 8;
  const art =
    `<defs>${SHARED_DEFS}</defs>` +
    `<rect width="${W}" height="${H}" fill="${biome.ground[0]}"/>` +
    patch(bbox, piece.biome) +
    `<path d="M${roadX} -10 V${H + 10}" stroke="#EADBB8" stroke-width="22" stroke-linecap="round"/>` +
    (stage === 0 ? `${MUTE_OPEN}${svg}</g>${fogOver(bbox, side, 0)}` : svg) +
    (stage === 1 ? sparkles(bbox) : "") +
    dusk(`wt-dusk`, 0, W, H);
  const outline =
    fp.map((r) => `<rect x="${r1(r.x)}" y="${r1(r.y)}" width="${r.w}" height="${r.h}" fill="none" stroke="#FF5C8A" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/>`).join("") +
    `<circle cx="${ax}" cy="${ay}" r="2.5" fill="#FF5C8A"/>`;
  return layers(W, H, opts.dark ? " wl-dark" : "", art, lights.join(""), outline);
}
