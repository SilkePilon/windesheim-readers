/**
 * The lesson-world art kit, ported from the approved mockup (world-v2.html) and extended.
 *
 * Style rules (keep them when adding primitives):
 * - one light source, top-left: lit faces/lobes on the left, shade on the right, a rim highlight;
 * - every standing thing casts `sh()`: a flat ellipse offset to the bottom-right, opacity .16;
 * - rounded shapes, Speelveld palette (`C`), no strokes as outlines;
 * - `(x, y)` is the baseline point (where the thing touches the ground), `s` the scale.
 *
 * Animation classes (CSS in world.css): sails, smoke, bob, flag, spark, fog, water, sway,
 * flicker, beam. Night variants: `wl-on` shows only in dark mode (lit lamps/windows), `wl-off`
 * hides in dark mode. Shared defs referenced here (`wk-glow`) live in render.ts.
 */
import type { Rng } from "@/lib/world/rng";
import type { Biome, BiomeId, PieceCtx, SetPiece } from "@/lib/world/types";

export const C = {
  shadow: "#1b3a2e",
  wood: "#7a4f33",
  woodL: "#B07A45",
  woodD: "#5E3B26",
  cream: "#FFF6E5",
  creamD: "#EFDDBF",
  sand: "#E9D6AE",
  sandD: "#C9A97A",
  pink: "#FF5C8A",
  pinkD: "#D63A68",
  grape: "#6B3CF6",
  grapeD: "#4A22C4",
  orange: "#FF8A1F",
  orangeD: "#D68300",
  yellow: "#FFC83D",
  yellowL: "#FFE08A",
  glass: "#B9AEE6",
  ink: "#241A4A",
  lilac: "#D9CEFF",
  rock: "#A79CD6",
  rockL: "#D9CEFF",
  water: "#8EC5FF",
  waterL: "#B9DBFF",
  green: "#0E9474",
  greenM: "#19C59B",
  greenL: "#5FE0B4",
  white: "#fff",
} as const;

/** Round to 0.1 so output stays short and stable. */
export const r1 = (v: number) => Math.round(v * 10) / 10;
const T = (x: number, y: number, s = 1) => `translate(${r1(x)} ${r1(y)})${s === 1 ? "" : ` scale(${r1(s * 100) / 100})`}`;
/** Positioned group. Never put an animation class on it: CSS transforms replace the attribute. */
const g = (x: number, y: number, s: number, body: string) => `<g transform="${T(x, y, s)}">${body}</g>`;
const between = (rng: Rng, a: number, b: number) => r1(a + rng() * (b - a));

// ---------------------------------------------------------------- basics

/** Cast shadow: light from the top-left, so it falls to the bottom-right. */
export const sh = (x: number, y: number, rx: number, ry = rx * 0.32) =>
  `<ellipse cx="${r1(x + rx * 0.28)}" cy="${r1(y + 2)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${C.shadow}" opacity=".16"/>`;

/** A window: lit (always on), or glass that lights up at night. */
export function win(x: number, y: number, w: number, h: number, lit = false, rx = 1) {
  const base = `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rx}" fill="${lit ? C.yellowL : C.glass}"/>`;
  if (lit) return base;
  return `${base}<rect class="wl-on" x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rx}" fill="${C.yellowL}"/>`;
}

/** Soft halo for lamps/windows. `always`: also in light mode (campus is night in both). */
export const glow = (x: number, y: number, r: number, always = false) =>
  `<circle${always ? "" : ` class="wl-on"`} cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="url(#wk-glow)"/>`;

// ---------------------------------------------------------------- trees & plants

const TREE: Record<string, [string, string, string]> = {
  g: ["#0E9474", "#19C59B", "#5FE0B4"],
  y: ["#C98A12", "#FFC83D", "#FFE08A"],
  p: ["#C2386A", "#FF5C8A", "#FFA3BF"],
  /** blossom: pale pink */
  b: ["#E77FA6", "#FFB3CC", "#FFE1EC"],
  /** plane tree: fresh yellow-green */
  l: ["#4E9F45", "#7CC96A", "#B5E89F"],
  /** jungle: deep green */
  d: ["#0A6B4F", "#0E9474", "#3CCB98"],
};

/** Round deciduous tree: dark base canopy, lit lobes, rim highlight. */
export function tree(x: number, y: number, s = 1, hue: keyof typeof TREE = "g") {
  const P = TREE[hue];
  return g(
    x,
    y,
    s,
    `${sh(0, 0, 22)}<path d="M-3 0 L-2 -16 L2 -16 L3 0Z" fill="${C.wood}"/><path d="M0 -10 L7 -17" stroke="${C.wood}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<circle cx="0" cy="-30" r="19" fill="${P[0]}"/><circle cx="-12" cy="-22" r="12" fill="${P[0]}"/><circle cx="13" cy="-21" r="12" fill="${P[0]}"/>` +
      `<circle cx="-4" cy="-34" r="15" fill="${P[1]}"/><circle cx="-13" cy="-25" r="9" fill="${P[1]}"/><circle cx="9" cy="-27" r="10" fill="${P[1]}"/>` +
      `<circle cx="-8" cy="-40" r="6" fill="${P[2]}"/><circle cx="-15" cy="-29" r="3.5" fill="${P[2]}"/>`,
  );
}

/** Blossom tree: the round tree with pink canopy and a few falling petals. */
export const blossom = (x: number, y: number, s = 1) =>
  tree(x, y, s, "b") +
  g(x, y, s, `<circle cx="16" cy="-6" r="1.6" fill="#FFB3CC"/><circle cx="-18" cy="-4" r="1.4" fill="#FFE1EC"/><circle cx="8" cy="-2" r="1.2" fill="#FFB3CC"/>`);

/** Plane tree: taller pale trunk with mottled bark, a lighter, broader canopy. */
export const planeTree = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `${sh(0, 0, 20)}<path d="M-3 0 L-2.2 -26 L2.2 -26 L3 0Z" fill="#C9B79A"/><path d="M0.6 0 L1 -26 L2.2 -26 L3 0Z" fill="#A8957A"/><circle cx="-1" cy="-9" r="1.4" fill="#E9DDC8"/><circle cx="1" cy="-17" r="1.2" fill="#E9DDC8"/>` +
      `<ellipse cx="0" cy="-38" rx="20" ry="15" fill="#4E9F45"/><ellipse cx="-12" cy="-31" rx="10" ry="8" fill="#4E9F45"/><ellipse cx="12" cy="-31" rx="10" ry="8" fill="#4E9F45"/>` +
      `<ellipse cx="-4" cy="-41" rx="14" ry="11" fill="#7CC96A"/><ellipse cx="-13" cy="-34" rx="7" ry="5.5" fill="#7CC96A"/>` +
      `<circle cx="-9" cy="-46" r="4.5" fill="#B5E89F"/><circle cx="-16" cy="-36" r="2.6" fill="#B5E89F"/>`,
  );

/** Pine: three tiers, each with a lit left half and a shaded right half. */
export function pine(x: number, y: number, s = 1, pal: [string, string, string] = ["#0E9474", "#19C59B", "#7BE8C2"], snow = false) {
  const tier = (yy: number, w: number, h: number) =>
    `<path d="M0 ${yy - h} L${w} ${yy} Q0 ${yy + 5} ${-w} ${yy}Z" fill="${pal[0]}"/><path d="M0 ${yy - h} L${-w} ${yy} Q${-w / 2} ${yy + 3.5} 0 ${yy + 4}Z" fill="${pal[1]}"/>` +
    (snow
      ? `<path d="M0 ${yy - h} L${r1(-w * 0.42)} ${r1(yy - h * 0.55)} Q0 ${r1(yy - h * 0.48)} ${r1(w * 0.36)} ${r1(yy - h * 0.58)}Z" fill="#fff"/>`
      : `<path d="M0 ${yy - h} L${r1(-w * 0.45)} ${r1(yy - h * 0.45)}" stroke="${pal[2]}" stroke-width="2" stroke-linecap="round"/>`);
  return g(x, y, s, `${sh(0, 0, 18)}<rect x="-2.5" y="-8" width="5" height="9" rx="1.5" fill="${C.wood}"/>${tier(-6, 20, 22)}${tier(-20, 16, 20)}${tier(-33, 11, 17)}`);
}

/** Alpine fir: darker, slimmer, optionally snow-capped. */
export const fir = (x: number, y: number, s = 1, snow = false) =>
  pine(x, y, s * 1.05, ["#0B6B5C", "#14907A", "#5CC9AE"], snow);

export const bushes = (x: number, y: number, s = 1, c: [string, string] = ["#12A884", "#2DD4A7"]) =>
  g(
    x,
    y,
    s,
    `${sh(0, 0, 14, 4)}<circle cx="-7" cy="-6" r="8" fill="${c[0]}"/><circle cx="5" cy="-7" r="9" fill="${c[0]}"/><circle cx="-6" cy="-8" r="5.5" fill="${c[1]}"/><circle cx="4" cy="-10" r="6" fill="${c[1]}"/>`,
  );

const FLOWER = ["#FF5C8A", "#FFC83D", "#fff", "#8C66FF"];
export function flowers(x: number, y: number, rng: Rng, n = 5, spread = 14) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const fx = between(rng, x - spread, x + spread);
    const fy = between(rng, y - 6, y + 6);
    out += `<path d="M${fx} ${fy} l0 -6" stroke="${C.green}" stroke-width="1.5"/><circle cx="${fx}" cy="${r1(fy - 7)}" r="2.6" fill="${FLOWER[i % 4]}"/>`;
  }
  return out;
}

export const rock = (x: number, y: number, s = 1, c: [string, string] = [C.rock, C.rockL]) =>
  g(
    x,
    y,
    s,
    `${sh(0, 0, 10, 3)}<path d="M-9 0 Q-10 -9 -2 -11 Q8 -12 9 -3 Q9 1 -9 0Z" fill="${c[0]}"/><path d="M-6 -6 Q-3 -10 2 -10" stroke="${c[1]}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  );

/** Grey alpine boulder with a moss cap. */
export const boulder = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `${sh(0, 0, 16, 4.5)}<path d="M-15 0 Q-17 -14 -6 -19 Q8 -23 14 -11 Q17 -2 15 0Z" fill="#8F8AAE"/><path d="M3 -20 Q12 -17 14 -9 Q16 -2 15 0 L4 0 Q8 -9 3 -20Z" fill="#76719A"/>` +
      `<path d="M-12 -12 Q-8 -18 -1 -19" stroke="#C3BEDD" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M-9 -17 Q-2 -22 6 -19 Q0 -16 -9 -17Z" fill="#7CC96A"/>`,
  );

/** Little cluster of red toadstools. */
export const mushrooms = (x: number, y: number, s = 1) => {
  const m = (dx: number, h: number, w: number) =>
    `<rect x="${dx - 1.6}" y="${-h}" width="3.2" height="${h}" rx="1.4" fill="#FFF6E5"/><path d="M${dx - w} ${-h + 1} Q${dx - w} ${-h - w * 0.9} ${dx} ${-h - w * 0.9} Q${dx + w} ${-h - w * 0.9} ${dx + w} ${-h + 1}Z" fill="#E8466F"/><path d="M${dx + 1} ${-h + 1} Q${dx + w * 0.7} ${-h - w * 0.75} ${dx + w} ${-h + 1}Z" fill="#C2305A"/><circle cx="${dx - w * 0.4}" cy="${r1(-h - w * 0.45)}" r="1.2" fill="#fff"/><circle cx="${dx + w * 0.15}" cy="${r1(-h - w * 0.65)}" r="1" fill="#fff"/>`;
  return g(x, y, s, `${sh(0, 0, 10, 3)}${m(-5, 6, 6)}${m(5, 4, 4.5)}`);
};

/** Trimmed hedge block in 3/4 view: lit top, front, shaded right side. */
export const hedge = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `${sh(2, 0, 20, 5)}<path d="M14 0 L20 -3 L20 -14 L14 -11Z" fill="#3E8E3A"/><rect x="-18" y="-12" width="32" height="12" rx="3" fill="#5FAF55"/><path d="M-18 -10 Q-18 -14 -14 -14 L16 -14 L20 -14 L14 -11 L-16 -11Z" fill="#8FD47A"/><circle cx="-11" cy="-6" r="1.5" fill="#8FD47A"/><circle cx="2" cy="-4" r="1.3" fill="#8FD47A"/>`,
  );

const TULIP = ["#FF5C8A", "#FFC83D", "#FF8A1F", "#8C66FF", "#fff"];
/** A small strip of tulip field: soil bed with rows of blooms. */
export function tulipStrip(x: number, y: number, s = 1, rng?: Rng) {
  const c = TULIP[rng ? Math.floor(rng() * TULIP.length) : 0];
  const c2 = TULIP[rng ? Math.floor(rng() * TULIP.length) : 1];
  let rows = "";
  for (let k = 0; k < 2; k++) {
    rows += `<rect x="-17" y="${-10 + k * 7}" width="34" height="4" rx="2" fill="#5FAF55"/>`;
    for (let t = -14; t <= 14; t += 5) rows += `<circle cx="${t + (k ? 2 : 0)}" cy="${-10.5 + k * 7}" r="2.3" fill="${k ? c2 : c}"/>`;
  }
  return g(x, y, s, `<g transform="skewX(-12)"><rect x="-20" y="-14" width="40" height="17" rx="6" fill="#C9A36B"/><rect x="-20" y="-14" width="40" height="17" rx="6" fill="none" stroke="#B08A55" stroke-width="1.5"/>${rows}</g>`);
}

/** Dune grass: a little sand mound with blades. */
export const duneGrass = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `<ellipse cx="0" cy="0" rx="15" ry="4.5" fill="#E9CF98"/><ellipse cx="-3" cy="-1" rx="9" ry="2.4" fill="#F7E6BC"/>` +
      `<path d="M-6 0 Q-9 -10 -13 -15 M-3 0 Q-3 -12 -5 -19 M0 0 Q2 -11 6 -17 M3 0 Q7 -8 12 -11" stroke="#8DBA5A" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M-1 0 Q-1 -9 1 -14" stroke="#B7D97A" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  );

/** Palm: curved segmented trunk, lit/shade fronds, coconuts. `alive` sways the crown. */
export function palm(x: number, y: number, s = 1, alive = false) {
  const frond = (d: string, fill: string) => `<path d="${d}" fill="${fill}"/>`;
  const crown =
    frond("M0 0 Q-14 -10 -30 -4 Q-16 -4 0 3Z", "#0E9474") +
    frond("M0 0 Q14 -12 30 -5 Q15 -3 0 3Z", "#0B7A60") +
    frond("M0 0 Q-6 -16 -22 -20 Q-10 -9 -1 2Z", "#19C59B") +
    frond("M0 0 Q8 -18 24 -19 Q12 -8 1 2Z", "#0E9474") +
    frond("M0 0 Q-20 2 -26 14 Q-14 4 0 3Z", "#12A884") +
    frond("M0 0 Q18 2 25 13 Q12 5 0 3Z", "#0B7A60") +
    `<path d="M-2 0 Q-12 -9 -26 -5" stroke="#5FE0B4" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
    `<circle cx="-3" cy="4" r="3" fill="#8a5a3a"/><circle cx="3" cy="5" r="3" fill="#6E4428"/>`;
  return g(
    x,
    y,
    s,
    `${sh(6, 0, 18)}<path d="M-3 0 Q-2 -24 6 -46 L10 -45 Q3 -24 3 0Z" fill="#B07A45"/><path d="M1 0 Q2 -24 8 -45.5 L10 -45 Q3 -24 3 0Z" fill="#8a5a3a"/>` +
      [-8, -16, -24, -32, -39].map((yy, i) => `<path d="M${-2.6 + i * 1.6} ${yy} l5 -1" stroke="#7a4f33" stroke-width="1" stroke-linecap="round"/>`).join("") +
      `<g transform="translate(8 -47)"><g${alive ? ` class="sway"` : ""}>${crown}</g></g>`,
  );
}

/** Jungle fern: a fan of arching fronds. */
export const fern = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `${sh(0, 0, 14, 4)}<path d="M0 0 Q-10 -10 -18 -8 Q-9 -6 0 0Z" fill="#0A6B4F"/><path d="M0 0 Q10 -12 19 -9 Q9 -5 0 0Z" fill="#0A6B4F"/>` +
      `<path d="M0 0 Q-7 -16 -10 -22 Q-2 -12 1 0Z" fill="#12A884"/><path d="M0 0 Q6 -17 11 -21 Q4 -11 0 0Z" fill="#0E9474"/><path d="M0 0 Q0 -18 1 -25 Q3 -12 1 0Z" fill="#19C59B"/>` +
      `<path d="M-1 -2 Q-6 -12 -9 -19" stroke="#5FE0B4" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
  );

/** Big monstera-like leaves. */
export const bigLeaf = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `${sh(0, 0, 15, 4)}<path d="M2 0 Q8 -10 16 -20" stroke="#0A6B4F" stroke-width="2" fill="none"/><path d="M-1 0 Q-6 -8 -12 -14" stroke="#0A6B4F" stroke-width="2" fill="none"/>` +
      `<path d="M16 -20 Q26 -32 12 -38 Q2 -34 4 -24 Q8 -18 16 -20Z" fill="#0E9474"/><path d="M15 -21 Q12 -30 12 -37" stroke="#5FE0B4" stroke-width="1.2" fill="none"/>` +
      `<path d="M-12 -14 Q-26 -18 -24 -30 Q-12 -34 -8 -24 Q-8 -17 -12 -14Z" fill="#19C59B"/><path d="M-12 -15 Q-17 -22 -22 -29" stroke="#7BE8C2" stroke-width="1.2" fill="none"/>` +
      `<path d="M-20 -24 l4 -2 M-18 -29 l4 0" stroke="#0E9474" stroke-width="1.4" stroke-linecap="round"/>`,
  );

/** A mossy stump with a vine curling up it. */
export const vine = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `${sh(0, 0, 11, 3)}<path d="M-7 0 L-6 -16 Q0 -19 6 -16 L7 0Z" fill="#8a5a3a"/><path d="M2 0 L3 -17 Q5 -17 6 -16 L7 0Z" fill="#6E4428"/><ellipse cx="0" cy="-16.5" rx="6" ry="2.2" fill="#C99A6B"/>` +
      `<path d="M-7 -2 Q2 -5 6 -9 Q0 -12 -6 -14 Q-2 -20 2 -26" stroke="#0E9474" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      `<ellipse cx="6" cy="-9" rx="3" ry="1.8" fill="#19C59B"/><ellipse cx="-6" cy="-14" rx="3" ry="1.8" fill="#12A884"/><ellipse cx="2" cy="-26" rx="3" ry="1.8" fill="#19C59B"/><circle cx="-5" cy="-3" r="1.6" fill="#FF5C8A"/>`,
  );

/** Saguaro cactus: lit left, shaded right, ribs. */
export const cactus = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `${sh(0, 0, 13, 3.5)}<path d="M-5 0 L-5 -32 Q-5 -38 0 -38 Q5 -38 5 -32 L5 0Z" fill="#3FAE6A"/><path d="M1 0 L1 -38 Q5 -37 5 -32 L5 0Z" fill="#2B8A52"/>` +
      `<path d="M-5 -14 L-10 -14 Q-13 -14 -13 -18 L-13 -26 Q-13 -29 -10.5 -29 Q-8 -29 -8 -26 L-8 -19 L-5 -19Z" fill="#3FAE6A"/>` +
      `<path d="M5 -20 L10 -20 Q13 -20 13 -24 L13 -30 Q13 -33 10.5 -33 Q8 -33 8 -30 L8 -25 L5 -25Z" fill="#2B8A52"/>` +
      `<path d="M-2 -3 L-2 -34" stroke="#7FD49A" stroke-width="1.4" stroke-linecap="round"/><path d="M-11 -18 L-11 -26" stroke="#7FD49A" stroke-width="1.2" stroke-linecap="round"/>`,
  );

/** Dry desert shrub: twiggy, sun-bleached. */
export const dryShrub = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `${sh(0, 0, 11, 3)}<path d="M0 0 Q-2 -8 -9 -13 M0 0 Q1 -9 -2 -16 M0 0 Q3 -7 9 -12 M-1 -6 Q-6 -8 -11 -6 M1 -5 Q6 -6 11 -4 M-2 -11 Q2 -14 5 -17" stroke="#B58B55" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      `<circle cx="-9" cy="-13" r="1.8" fill="#C9A36B"/><circle cx="9" cy="-12" r="1.8" fill="#D9B77F"/><circle cx="-2" cy="-16" r="1.6" fill="#D9B77F"/>`,
  );

/** Wind ripples in the sand: a lit and a shaded crest line. */
export const ripple = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `<path d="M-20 -2 Q-10 -8 0 -3 Q10 2 20 -4" stroke="#E9B877" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M-20 -4 Q-10 -10 0 -5 Q10 0 20 -6" stroke="#FFF1D2" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      `<path d="M-14 6 Q-6 2 2 5 Q9 8 15 4" stroke="#E9B877" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  );

export const edelweiss = (x: number, y: number, s = 1) => {
  const star = (cx: number, cy: number, r: number) =>
    `<g transform="translate(${cx} ${cy})">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="${r * 0.42}" ry="${r}" cy="${-r}" fill="#fff" transform="rotate(${a})"/>`).join("")}<circle r="${r * 0.55}" fill="#FFE08A"/></g>`;
  return g(
    x,
    y,
    s,
    `<path d="M-5 0 L-5 -8 M4 0 L4 -11 M0 0 L0 -5" stroke="#7FA86A" stroke-width="1.4"/>${star(-5, -9, 2.6)}${star(4, -12, 3)}${star(0, -6, 2)}`,
  );
};

export const snowPatch = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `<path d="M-22 0 Q-24 -6 -14 -8 Q-6 -12 4 -9 Q16 -10 21 -4 Q24 2 12 3 Q-4 5 -22 0Z" fill="#DDE8F5"/><path d="M-18 -2 Q-18 -7 -10 -8 Q-2 -11 6 -8 Q14 -9 17 -5 Q4 -4 -18 -2Z" fill="#fff"/>`,
  );

// ---------------------------------------------------------------- street furniture

/** Lamp post. Off by day (lit in dark mode), or `lit` always (campus). */
export function lamp(x: number, y: number, s = 1, lit = false) {
  const head = lit ? C.yellowL : C.cream;
  return (
    g(
      x,
      y,
      s,
      `${sh(0, 0, 8, 2.5)}<rect x="-1.6" y="-36" width="3.2" height="36" rx="1.2" fill="#3A3266"/><rect x="-4" y="-3" width="8" height="3" rx="1" fill="#3A3266"/>` +
        `<path d="M-5 -36 L5 -36 L3.5 -44 L-3.5 -44Z" fill="${head}"/>${lit ? "" : `<path class="wl-on" d="M-5 -36 L5 -36 L3.5 -44 L-3.5 -44Z" fill="${C.yellowL}"/>`}<path d="M-5.5 -44 L5.5 -44 L0 -48Z" fill="#3A3266"/>`,
    ) + glow(x, y - 40 * s, 16 * s, lit)
  );
}

export const bench = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `${sh(0, 0, 13, 3)}<rect x="-11" y="-6" width="2" height="6" fill="#3A3266"/><rect x="9" y="-6" width="2" height="6" fill="#3A3266"/>` +
      `<rect x="-13" y="-8" width="26" height="3.4" rx="1.2" fill="${C.woodL}"/><rect x="-13" y="-15" width="26" height="3" rx="1.2" fill="${C.woodL}"/><rect x="-13" y="-11.5" width="26" height="2.6" rx="1" fill="${C.wood}"/>` +
      `<rect x="-11" y="-16" width="1.8" height="9" fill="#3A3266"/><rect x="9.2" y="-16" width="1.8" height="9" fill="#3A3266"/>`,
  );

/** Planter box (3/4) with a bush and flowers. */
export const planter = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `${sh(1, 0, 14, 3.5)}<path d="M10 0 L14 -2 L14 -9 L10 -7Z" fill="#8C82B5"/><rect x="-12" y="-9" width="22" height="9" rx="1.5" fill="#B9AEE6"/><path d="M-12 -9 L10 -9 L14 -11 L-8 -11Z" fill="#D9CEFF"/>` +
      `<circle cx="-6" cy="-13" r="5" fill="#12A884"/><circle cx="3" cy="-14" r="5.5" fill="#12A884"/><circle cx="-5" cy="-15" r="3" fill="#2DD4A7"/><circle cx="2" cy="-16.5" r="3.2" fill="#2DD4A7"/><circle cx="-9" cy="-17" r="1.8" fill="#FF5C8A"/><circle cx="7" cy="-19" r="1.8" fill="#FFC83D"/><circle cx="-1" cy="-20" r="1.6" fill="#fff"/>`,
  );

export const bollard = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `${sh(0, 0, 7, 2.4)}<path d="M-5 0 L-5 -12 Q-5 -15 -7 -16 Q-7 -19 0 -19 Q7 -19 7 -16 Q5 -15 5 -12 L5 0Z" fill="#3A3266"/><path d="M1 0 L1 -15 Q5 -15 5 -12 L5 0Z" fill="#241A4A"/><ellipse cx="0" cy="-18" rx="6" ry="1.6" fill="#5A4E92"/>` +
      `<path d="M-5 -8 Q-12 -4 -14 2" stroke="${C.sandD}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  );

/** Wooden crate in 3/4 view. */
export const crate = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `${sh(2, 0, 12, 3.5)}<path d="M5 0 L11 -3 L11 -15 L5 -12Z" fill="#9A6A3C"/><rect x="-9" y="-12" width="14" height="12" fill="#C99A5E"/><path d="M-9 -12 L5 -12 L11 -15 L-3 -15Z" fill="#E2BC85"/>` +
      `<path d="M-9 -12 L5 0 M5 -12 L-9 0" stroke="#9A6A3C" stroke-width="1.4"/><rect x="-9" y="-12" width="14" height="12" fill="none" stroke="#9A6A3C" stroke-width="1.6"/>`,
  );

/** A gull gliding over its own shadow. `alive` bobs it. */
export const gull = (x: number, y: number, s = 1, alive = false) =>
  g(
    x,
    y,
    s,
    `<ellipse cx="6" cy="1" rx="6" ry="1.6" fill="${C.shadow}" opacity=".12"/><g transform="translate(0 -26)"><g${alive ? ` class="bob"` : ""}><path d="M-11 -2 Q-6 -8 0 -1 Q6 -8 11 -2 Q6 -5 0 1.5 Q-6 -5 -11 -2Z" fill="#fff"/><path d="M0 1.5 Q6 -5 11 -2 Q7 -4 3 -1Z" fill="#C9C3E3"/><circle cx="0" cy="0" r="1.6" fill="#fff"/><path d="M0.5 1 l2.5 0.8" stroke="${C.orange}" stroke-width="1.2" stroke-linecap="round"/></g></g>`,
  );

/** Bike rack with two bikes. */
export const bikeRack = (x: number, y: number, s = 1) => {
  const bike = (dx: number, c: string) =>
    `<circle cx="${dx - 5}" cy="-4" r="4" fill="none" stroke="#3A3266" stroke-width="1.4"/><circle cx="${dx + 5}" cy="-4" r="4" fill="none" stroke="#3A3266" stroke-width="1.4"/><path d="M${dx - 5} -4 L${dx - 1} -10 L${dx + 4} -10 L${dx + 5} -4 M${dx - 1} -10 L${dx} -4 L${dx + 4} -10 M${dx - 2} -12 l3 0" stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return g(x, y, s, `${sh(0, 0, 16, 3.5)}<path d="M-16 0 L-16 -8 Q-16 -11 -13 -11 L13 -11 Q16 -11 16 -8 L16 0" stroke="#8C82B5" stroke-width="2" fill="none"/>${bike(-6, C.pink)}${bike(7, C.yellow)}`);
};

/** A twinkling star/firefly hanging in the night air. */
export const star = (x: number, y: number, s = 1, delay = 0) =>
  `<g transform="${T(x, y - 6 * s, s)}"><g class="spark" style="animation-delay:${r1(delay)}s"><path d="M0 -5 L1.2 -1.2 L5 0 L1.2 1.2 L0 5 L-1.2 1.2 L-5 0 L-1.2 -1.2Z" fill="#FFF3B0"/></g></g>`;

// ---------------------------------------------------------------- buildings & set-piece parts

export type HouseOpts = { wall?: string; side?: string; roof?: string; roofD?: string; alive?: boolean; door?: string; logs?: string };

/** 3/4-view house: front gable wall, darker side wall, two-plane roof, chimney (+ smoke when alive). */
export function house(x: number, y: number, s = 1, o: HouseOpts = {}) {
  const wall = o.wall || C.cream;
  const side = o.side || C.creamD;
  const roof = o.roof || C.pink;
  const roofD = o.roofD || C.pinkD;
  const smoke = o.alive ? smokePuffs(17, -52) : "";
  return g(
    x,
    y,
    s,
    `${sh(4, 0, 30, 7)}<path d="M2 0 L30 -6 L30 -30 L2 -24Z" fill="${side}"/><path d="M-22 0 L2 0 L2 -24 L-10 -38 L-22 -24Z" fill="${wall}"/>` +
      `<path d="M-10 -38 L18 -44 L33 -30 L2 -24Z" fill="${roof}"/><path d="M-10 -38 L2 -24 L-25 -24Z" fill="${roofD}"/><path d="M-10 -38 L18 -44" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>` +
      (o.logs
        ? `<path d="M-22 -6 H2 M-22 -12 H2 M-22 -18 H-3" stroke="${o.logs}" stroke-width="1.2" opacity=".5"/><path d="M2 -6 L30 -12 M2 -12 L30 -18 M2 -18 L30 -24" stroke="${o.logs}" stroke-width="1.2" opacity=".45"/>`
        : "") +
      `<rect x="14" y="-52" width="7" height="12" fill="${C.woodL}"/>${smoke}<rect x="-13" y="-13" width="7" height="13" rx="1.5" fill="${o.door || C.wood}"/>` +
      win(-3, -18, 7, 7, o.alive) +
      `<g transform="skewY(-12)">${win(11, -21, 7, 7, o.alive)}</g>`,
  );
}

/** Three rising smoke puffs. */
export const smokePuffs = (x: number, y: number, r = 4) =>
  [0, 1.1, 2.2].map((d) => `<circle class="smoke" style="animation-delay:${d}s" cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join("");

/** Windmill: tapered tower with a shaded side, cap and turning lattice sails (tapered). */
export function windmill(x: number, y: number, s = 1, alive = true, sails = true) {
  const sail = (a: number) =>
    `<g transform="rotate(${a})"><path d="M1.5 -9 L12 -14 L14 -44 L1.5 -46Z" fill="${C.cream}"/><path d="M1.5 -9 L12 -14 L14 -44 L8 -45Z" fill="#EADBB8"/><path d="M1.5 -20 L13 -24 M1.5 -33 L13.6 -35" stroke="${C.sandD}" stroke-width=".9"/><rect x="-1.6" y="-47" width="3.2" height="47" rx="1.2" fill="#8a5a3a"/></g>`;
  return g(
    x,
    y,
    s,
    `${sh(2, 0, 22, 6)}<path d="M-15 0 L-10 -54 L10 -54 L15 0Z" fill="${C.cream}"/><path d="M2 0 L3 -54 L10 -54 L15 0Z" fill="#E9D6AE"/>` +
      `<path d="M-12 -30 h24" stroke="${C.woodL}" stroke-width="3"/><rect x="-5" y="-13" width="9" height="13" rx="4.5" fill="${C.wood}"/>${win(-3, -42, 5, 6, false, 2.5)}` +
      `<path d="M-13 -54 Q0 -72 13 -54Z" fill="${C.grape}"/><path d="M0 -70 Q8 -64 13 -54 L2 -54Z" fill="${C.grapeD}"/>` +
      (sails
        ? `<g transform="translate(0 -58)"><g class="${alive ? "sails" : ""}">${[0, 90, 180, 270].map(sail).join("")}</g><circle r="4" fill="${C.grapeD}"/></g>`
        : `<circle cy="-58" r="4" fill="${C.grapeD}"/>`),
  );
}

/** Building plot (not started): pegs, rope, and a sign. */
export const plot = (x: number, y: number, s = 1) =>
  g(
    x,
    y,
    s,
    `<path d="M-24 -4 L22 -10 L28 2 L-18 8Z" fill="#E9D6AE" opacity=".7"/>` +
      [
        [-24, -4],
        [22, -10],
        [28, 2],
        [-18, 8],
      ]
        .map(([a, b]) => `<rect x="${a - 1.5}" y="${b - 10}" width="3" height="11" fill="${C.woodL}"/>`)
        .join("") +
      `<path d="M-24 -11 L22 -17 L28 -5 L-18 1Z" fill="none" stroke="${C.orange}" stroke-width="1.4" stroke-dasharray="3 2"/><rect x="-2" y="-26" width="3" height="20" fill="${C.wood}"/><rect x="-11" y="-34" width="21" height="13" rx="3" fill="${C.yellow}"/><path d="M-6 -27.5 h11" stroke="#7A4B00" stroke-width="1.6" stroke-linecap="round"/>`,
  );

/** Little seedlings in a row (stage 0 garnish). */
export const seedlings = (x: number, y: number, n = 3, gap = 9) => {
  let out = "";
  for (let i = 0; i < n; i++) {
    const sx = r1(x + (i - (n - 1) / 2) * gap);
    out += `<ellipse cx="${sx}" cy="${y}" rx="3.4" ry="1.3" fill="#B08A55" opacity=".6"/><path d="M${sx} ${y} l0 -5" stroke="${C.green}" stroke-width="1.4"/><ellipse cx="${r1(sx - 2.2)}" cy="${y - 5.5}" rx="2.4" ry="1.3" fill="${C.greenM}"/><ellipse cx="${r1(sx + 2.2)}" cy="${y - 6}" rx="2.4" ry="1.3" fill="${C.green}"/>`;
  }
  return out;
};

/**
 * Under construction: half house + scaffolding, and a crane on side `craneSide`
 * (1 = right, -1 = left, 0 = none). Put the crane on the side away from the road.
 */
export const building = (x: number, y: number, s = 1, o: { wall?: string; side?: string; craneSide?: 1 | -1 | 0 } = {}) =>
  g(
    x,
    y,
    s,
    `${sh(4, 0, 30, 7)}<path d="M2 0 L30 -6 L30 -18 L2 -12Z" fill="${o.side || C.creamD}"/><path d="M-22 0 L2 0 L2 -14 L-22 -14Z" fill="${o.wall || C.cream}"/>` +
      scaffold(-22, 0, 50, 36) +
      (o.craneSide === 0 ? "" : o.craneSide === -1 ? crane(-30, 0, 62, 34) : crane(35, 0, 62, -22)),
  );

/** Scaffolding: poles every ~16px, two decks, diagonal braces. (x, y) = bottom-left. */
export function scaffold(x: number, y: number, w: number, h: number) {
  const n = Math.max(2, Math.round(w / 16) + 1);
  let out = "";
  for (let i = 0; i < n; i++) out += `<rect x="${r1(x + (i * w) / (n - 1) - 1)}" y="${r1(y - h)}" width="2" height="${h}" fill="${C.woodL}"/>`;
  const d1 = r1(y - h * 0.66);
  const d2 = r1(y - h * 0.94);
  out += `<path d="M${r1(x)} ${d1} H${r1(x + w)} M${r1(x)} ${d2} H${r1(x + w)}" stroke="${C.woodL}" stroke-width="2"/>`;
  // Diagonal braces in (up to) the first two bays.
  const bay = w / (n - 1);
  let braces = "";
  for (let i = 0; i < Math.min(2, n - 1); i++) braces += `M${r1(x + i * bay)} ${r1(y - h * 0.38)} L${r1(x + (i + 1) * bay)} ${d1} `;
  out += `<path d="${braces.trim()}" stroke="${C.woodL}" stroke-width="1.2"/>`;
  return out;
}

/** Tower crane: mast at (x, y), jib reaching `reach` (negative = to the left), hook with a load. */
export const crane = (x: number, y: number, h: number, reach = 22) => {
  const tip = x + reach;
  const back = x - Math.sign(reach) * 8;
  return `<rect x="${r1(x - 1.5)}" y="${r1(y - h)}" width="3" height="${h}" fill="${C.orange}"/><path d="M${r1(back)} ${r1(y - h + 2)} H${r1(tip)}" stroke="${C.orange}" stroke-width="3"/><rect x="${r1(back - 2)}" y="${r1(y - h + 2)}" width="5" height="4" fill="${C.ink}"/><path d="M${r1(tip - Math.sign(reach) * 4)} ${r1(y - h + 2)} v14" stroke="${C.wood}" stroke-width="1.2"/><rect x="${r1(tip - Math.sign(reach) * 4 - 4)}" y="${r1(y - h + 16)}" width="8" height="6" fill="${C.grape}"/>`;
};

export const flag = (x: number, y: number, c: string = C.pink, h = 34) =>
  `<g transform="${T(x, y)}"><rect x="-1.2" y="${-h}" width="2.4" height="${h}" fill="${C.wood}"/><path class="flag" d="M1 ${-h} L19 ${-h + 5} L1 ${-h + 11}Z" fill="${c}"/><circle cy="${-h - 1}" r="2.2" fill="${C.yellow}"/></g>`;

export const sparkle = (x: number, y: number, d = 0) =>
  `<g transform="${T(x, y)}"><g class="spark" style="animation-delay:${r1(d)}s"><path d="M0 -7 L1.6 -1.6 L7 0 L1.6 1.6 L0 7 L-1.6 1.6 L-7 0 L-1.6 -1.6Z" fill="#FFF3B0"/></g></g>`;

export const cloudPuff = (x: number, y: number, s = 1, o = 0.95) =>
  `<g transform="${T(x, y, s)}" opacity="${o}"><ellipse cx="0" cy="4" rx="38" ry="12" fill="#fff"/><circle cx="-16" cy="-2" r="14" fill="#fff"/><circle cx="4" cy="-8" r="19" fill="#fff"/><circle cx="22" cy="0" r="12" fill="#fff"/></g>`;

/** A pond/pool: rim, water, a lit highlight and a moving shimmer when alive. */
export function pond(x: number, y: number, rx: number, ry: number, alive = false, rim = "#8FD3A0") {
  return (
    `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx + 4)}" ry="${r1(ry + 3)}" fill="${rim}"/>` +
    `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${C.water}"/><ellipse cx="${r1(x - rx * 0.12)}" cy="${r1(y - ry * 0.18)}" rx="${r1(rx * 0.78)}" ry="${r1(ry * 0.62)}" fill="${C.waterL}"/>` +
    (alive
      ? `<path class="water" d="M${r1(x - rx * 0.6)} ${r1(y - ry * 0.1)} Q${r1(x)} ${r1(y - ry * 0.45)} ${r1(x + rx * 0.6)} ${r1(y - ry * 0.1)}" stroke="#fff" stroke-width="2" fill="none" stroke-dasharray="8 14" stroke-linecap="round" opacity=".85"/>`
      : `<path d="M${r1(x - rx * 0.5)} ${r1(y - ry * 0.25)} Q${r1(x - rx * 0.1)} ${r1(y - ry * 0.45)} ${r1(x + rx * 0.3)} ${r1(y - ry * 0.3)}" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>`)
  );
}

/** Torch flame that flickers when alive. */
export const torch = (x: number, y: number, alive = false) =>
  `<g transform="${T(x, y)}"><rect x="-1.2" y="-14" width="2.4" height="14" fill="${C.wood}"/><g${alive ? ` class="flicker"` : ""}><path d="M0 -24 Q4 -18 2.5 -15 Q0 -13 -2.5 -15 Q-4 -18 0 -24Z" fill="${C.orange}"/><path d="M0 -20 Q2 -17 1 -15.5 Q0 -15 -1 -15.5 Q-2 -17 0 -20Z" fill="${C.yellowL}"/></g></g>`;

// ---------------------------------------------------------------- set-piece helpers

/**
 * Defines a set piece with one footprint rect of `w`×`h` above the baseline (plus `below`
 * px under it for shadows/quays), centred on the anchor and shifted `dx` towards the road.
 * In `render`, use `X(d)` for x offsets: positive `d` points towards the road. Primitives are
 * never mirrored themselves, so the light stays top-left whichever way the piece faces.
 */
export function definePiece(p: {
  id: string;
  biome: BiomeId;
  w: number;
  h: number;
  below?: number;
  dx?: number;
  render: (c: PieceCtx, X: (d: number) => number) => string;
}): SetPiece {
  const below = p.below ?? 8;
  return {
    id: p.id,
    biome: p.biome,
    footprint: (side) => [{ x: -p.w / 2 + side * (p.dx ?? 0), y: -p.h, w: p.w, h: p.h + below }],
    render: (c) => `<g data-piece="${p.id}">${p.render(c, (d) => r1(c.x + c.side * d))}</g>`,
  };
}

/** Kit-level extras a biome needs for rendering (ground patch, banner colours). */
export type WorldBiome = Biome & {
  /** Soft lighter "island" under set pieces. */
  patch: string;
  /** Banner pill colour and its darker lip. */
  bannerBg: [string, string];
  /** Night biome (campus): lamps and windows are lit in both themes. */
  night?: boolean;
};
