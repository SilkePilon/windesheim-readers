import {
  C,
  anim,
  bikeRack,
  block as box,
  bunting,
  crane,
  definePiece,
  facing,
  fairyLights,
  fit,
  flag,
  glow,
  lamp,
  person,
  place,
  plot,
  r1,
  scaffold,
  sh,
  star,
  tree,
  win,
  type WorldBiome,
} from "../kit";

const FRONT = "#E9E2FF";
const SIDE = "#B9AEE6";
const ROOF = "#6B3CF6";
const TOP = "#F4F1FF";

/** Main building block in 3/4 view: front, shaded side, roof slab; windows always lit (night). */
function block(x: number, y: number, w: number, h: number, floors: number, d = 10) {
  let wins = "";
  for (let f = 0; f < floors; f++)
    for (let i = 0; i < Math.floor((w - 6) / 11); i++) wins += win(x + 5 + i * 11, y - h + 6 + f * 13, 6, 8, true, 1);
  return (
    `<path d="M${x + w} ${y} L${x + w + d} ${y - d * 0.5} L${x + w + d} ${y - h - d * 0.5} L${x + w} ${y - h}Z" fill="${SIDE}"/>` +
    `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${FRONT}"/>` +
    `<path d="M${x - 2} ${y - h} L${x + d - 2} ${y - h - d * 0.5} L${x + w + d + 1} ${y - h - d * 0.5} L${x + w + 1} ${y - h}Z" fill="${ROOF}"/><rect x="${x - 2}" y="${y - h}" width="${w + 3}" height="3" fill="${C.grapeD}"/>` +
    wins +
    // Lit windows: one wide halo per floor (campus is night in both themes).
    Array.from({ length: floors }, (_, f) => glow(x + w / 2, y - h + 10 + f * 13, w * 0.42, true)).join("")
  );
}

/** Main building with a clock tower: the finale. */
const mainBuilding = definePiece({
  id: "campus-main",
  biome: "campus",
  w: 108,
  h: 100,
  render: (c, X) => {
    const bx = c.x - 38;
    const base = c.y;
    const lamps = lamp(fit(c, X(-48), 5, 10), c.y + 4, 0.8, true) + lamp(fit(c, X(48), 5, 10), c.y + 4, 0.8, true);
    if (c.stage === 0) return plot(X(-4), c.y, 1.05) + lamps;
    if (c.stage === 1)
      return sh(c.x - 6, base, 44, 7) + block(bx, base, 70, 16, 1) + `<g>${scaffold(bx, base - 16, 70, 22)}</g>` + crane(c.side === 1 ? bx + 78 : bx - 4, base, 74, c.side === 1 ? -30 : 30) + lamps;
    const tx = bx + 26;
    const tower =
      `<rect x="${tx}" y="${base - 66}" width="18" height="30" fill="${FRONT}"/><rect x="${tx + 12}" y="${base - 66}" width="6" height="30" fill="${SIDE}"/>` +
      `<path d="M${tx - 2} ${base - 66} L${tx + 9} ${base - 80} L${tx + 20} ${base - 66}Z" fill="${ROOF}"/><path d="M${tx + 9} ${base - 80} L${tx + 20} ${base - 66} L${tx + 11} ${base - 66}Z" fill="${C.grapeD}"/>` +
      `<circle cx="${tx + 8}" cy="${base - 54}" r="6" fill="#fff"/><circle cx="${tx + 8}" cy="${base - 54}" r="6" fill="none" stroke="${C.grapeD}" stroke-width="1.4"/><path d="M${tx + 8} ${base - 54} v-4 M${tx + 8} ${base - 54} h3" stroke="${C.ink}" stroke-width="1.3" stroke-linecap="round"/>`;
    const door = `<rect x="${bx + 30}" y="${base - 11}" width="10" height="11" rx="4" fill="${C.ink}"/><path d="M${bx + 26} ${base} h18 l-2 3 h-14Z" fill="${SIDE}"/>`;
    return (
      sh(c.x - 6, base, 44, 7) +
      tower +
      block(bx, base, 70, 36, 2) +
      door +
      flag(tx + 9, base - 80, C.yellow, 16) +
      lamps +
      star(X(-30), c.y - 70, 1, 0.3) +
      star(X(36), c.y - 80, 0.8, 1.1)
    );
  },
});

// ---------------------------------------------------------------- shared campus bits

const GOWN = "#2E2560";
const PALETTE = [C.pink, C.yellow, C.greenM, C.orange, "#8C66FF", "#3F8FE0"];

/** Sky stars around a piece, twinkling at staggered delays. */
const stars = (pts: [number, number, number][]) => pts.map(([x, y, d]) => star(x, y, 0.8, d)).join("");

/** Stack of folding chairs (unmirrored). */
const chairs = (x: number, y: number, n = 3) =>
  place(
    x,
    y,
    1,
    `${sh(1, 0, 8, 2)}` +
      Array.from({ length: n }, (_, i) => `<path d="M${-5 + i * 1.4} ${-i * 2.4} L${5 + i * 1.4} ${-i * 2.4} M${-4 + i * 1.4} ${-i * 2.4} L${-4 + i * 1.4} ${-6 - i * 2.4} L${4 + i * 1.4} ${-6 - i * 2.4}" stroke="${C.lilac}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`).join(""),
  );

/** Folding chair (unmirrored), seat facing -x. */
const chair = (x: number, y: number) =>
  `<path d="M${r1(x - 3)} ${r1(y)} V${r1(y - 4)} H${r1(x + 2)} V${r1(y)} M${r1(x + 2)} ${r1(y - 4)} V${r1(y - 9)}" stroke="${C.lilac}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;

/** A graduate in a gown and mortarboard; `cap` false = the cap is in the air. */
const graduate = (x: number, y: number, k: number, cap = true, s = 1) =>
  person(x, y, GOWN, k, s) +
  place(x, y, s, `<path d="M-3.4 -6 L-3.6 -1 H3.6 L3.4 -6Z" fill="${GOWN}"/><path d="M-1 -12 L0 -9 L1 -12" stroke="${C.yellow}" stroke-width=".9" fill="none"/>${cap ? `<path d="M-4.6 -18.4 L0 -20.4 L4.6 -18.4 L0 -16.6Z" fill="${C.ink}"/><path d="M3 -18.6 V-15.4" stroke="${C.yellow}" stroke-width=".8"/>` : ""}`);

/** A mortarboard flying (unmirrored, absolute origin). */
const cap = `<path d="M-4.6 0 L0 -2 L4.6 0 L0 1.8Z" fill="${C.ink}"/><path d="M-2.6 .6 V2.6 H2.6 V.6" fill="${C.ink}"/><path d="M3 -.2 V3.6" stroke="${C.yellow}" stroke-width=".8"/>`;

// ---------------------------------------------------------------- library

const libraryPiece = definePiece({
  id: "campus-library",
  biome: "campus",
  w: 108,
  h: 92,
  render: (c, X) => {
    const w = 62;
    const lx = c.x - 38;
    const ly = c.y - 6; // on the steps
    const steps = [0, 1, 2].map((i) => box(lx - 6 + i * 2, c.y - i * 2, w + 8 - i * 4, 2, 6, i === 2 ? FRONT : TOP, SIDE, "#fff")).join("");
    const lampR = lamp(fit(c, X(50), 5, 9), c.y + 6, 0.75, true);
    if (c.stage === 0) return plot(X(-6), c.y, 0.95) + chairs(X(34), c.y + 4) + place(X(40), c.y - 18, 1, `${sh(0, 0, 6, 2)}${box(-5, 0, 9, 4, 3, C.pink, C.pinkD)}${box(-4, -4, 8, 3, 3, C.yellow, C.orangeD)}${box(-5, -7, 9, 3, 3, "#3F8FE0", "#2B6CB8")}`) + lampR;
    const col = (x: number, h: number) => `<rect x="${r1(x - 2.6)}" y="${r1(ly - h)}" width="5.2" height="${h}" fill="${TOP}"/><rect x="${r1(x + 0.8)}" y="${r1(ly - h)}" width="1.8" height="${h}" fill="${SIDE}"/><rect x="${r1(x - 3.6)}" y="${r1(ly - 2)}" width="7.2" height="2" fill="${SIDE}"/>`;
    const cols = [0, 1, 2, 3, 4].map((i) => lx + 5 + i * 13);
    if (c.stage === 1)
      return (
        sh(c.x - 6, c.y, 44, 6) +
        steps +
        box(lx, ly, w, 14, 10, FRONT, SIDE) +
        cols.map((x, i) => col(x, i % 2 ? 26 : 18)).join("") +
        scaffold(lx - 2, ly, w + 4, 34) +
        crane(c.side === 1 ? lx - 4 : lx + w + 10, c.y, 70, c.side === 1 ? 26 : -26) +
        lampR
      );
    const top = ly - 30;
    const archWin = (x: number) => `<path d="M${r1(x - 3.4)} ${ly - 4} V${top + 11} Q${r1(x - 3.4)} ${top + 6} ${x} ${top + 6} Q${r1(x + 3.4)} ${top + 6} ${r1(x + 3.4)} ${top + 11} V${ly - 4}Z" fill="${C.yellowL}"/><path d="M${x} ${top + 7} V${ly - 4} M${r1(x - 3.4)} ${top + 16} H${r1(x + 3.4)}" stroke="#E8C66A" stroke-width=".8"/>`;
    const pediment =
      `<path d="M${lx + w + 3} ${top - 4} L${lx + w + 13} ${top - 9} L${lx + w / 2 + 10} ${top - 25} L${lx + w / 2} ${top - 20}Z" fill="${ROOF}"/>` +
      `<path d="M${lx - 3} ${top - 4} L${lx + w / 2} ${top - 20} L${lx + w + 3} ${top - 4}Z" fill="${TOP}"/><path d="M${lx + 5} ${top - 6} L${lx + w / 2} ${top - 16.6} L${lx + w - 5} ${top - 6}Z" fill="${C.lilac}"/>` +
      `<circle cx="${lx + w / 2}" cy="${top - 10}" r="3" fill="${C.yellow}"/><path d="M${lx - 3} ${top - 4} L${lx + w / 2} ${top - 20}" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`;
    // An owl on the pediment, blinking.
    const owl = place(
      lx + w / 2,
      top - 20,
      1,
      `<ellipse cx="0" cy="-5" rx="4.4" ry="5.4" fill="#8A6A55"/><ellipse cx="1.4" cy="-4.4" rx="2.6" ry="4.4" fill="#6E5444"/><path d="M-3.6 -9.4 L-2.6 -12 L-1 -9.8 M3.6 -9.4 L2.6 -12 L1 -9.8" fill="#8A6A55"/><ellipse cx="0" cy="-3" rx="2.4" ry="2.4" fill="#C9A88A"/>` +
        `<g class="blink"><circle cx="-1.7" cy="-7" r="1.5" fill="${C.yellow}"/><circle cx="1.7" cy="-7" r="1.5" fill="${C.yellow}"/></g><circle cx="-1.7" cy="-7" r=".6" fill="${C.ink}"/><circle cx="1.7" cy="-7" r=".6" fill="${C.ink}"/><path d="M-.6 -5.6 L0 -4.4 L.6 -5.6Z" fill="${C.orange}"/>`,
    );
    return (
      sh(c.x - 6, c.y, 44, 6) +
      steps +
      box(lx, ly, w, 30, 10, FRONT, SIDE) +
      [0, 1, 2, 3].map((i) => archWin(lx + 11.5 + i * 13)).join("") +
      `<rect x="${lx - 3}" y="${top - 4}" width="${w + 6}" height="4" fill="${TOP}"/><path d="M${lx + w + 3} ${top} L${lx + w + 13} ${top - 5} V${top - 9} L${lx + w + 3} ${top - 4}Z" fill="${SIDE}"/>` +
      cols.map((x) => col(x, 26)).join("") +
      pediment +
      owl +
      glow(lx + w / 2, ly - 14, 30, true) +
      person(X(-30) + (c.side === 1 ? 6 : 0), c.y + 6, C.pink, 1, 0.9) +
      place(X(-30) + (c.side === 1 ? 6 : 0), c.y + 6, 0.9, `<rect x="-4.6" y="-10" width="4" height="5" rx=".6" fill="#3F8FE0"/>`) +
      person(X(14), c.y + 8, C.greenM, 2, 0.9) +
      lampR +
      stars([[X(-40), c.y - 78, 0.2], [X(36), c.y - 74, 1.1]])
    );
  },
});

// ---------------------------------------------------------------- lecture hall with glowing windows

const lecture = definePiece({
  id: "campus-lecture",
  biome: "campus",
  w: 108,
  h: 88,
  render: (c, X) => {
    const w = 54;
    const hx = c.side === 1 ? c.x - 48 : c.x - 30;
    const hy = c.y - 4;
    const dx = 20;
    const fh = 30;
    const bh = 50;
    const lampR = lamp(fit(c, X(48), 5, 9), c.y + 6, 0.75, true);
    const sideWall = (h1: number, h2: number) => `<path d="M${hx + w} ${hy} L${hx + w + dx} ${hy - 6} L${hx + w + dx} ${hy - 6 - h2} L${hx + w} ${hy - h1}Z" fill="${SIDE}"/>`;
    if (c.stage === 0) return plot(X(-4), c.y, 0.95) + chairs(X(30), c.y + 4, 4) + lampR;
    if (c.stage === 1)
      return (
        sh(hx + w / 2 + 8, hy, 40, 6) +
        sideWall(16, 24) +
        `<rect x="${hx}" y="${hy - 16}" width="${w}" height="16" fill="${FRONT}"/>` +
        [0, 1, 2, 3, 4].map((i) => `<rect x="${hx + i * 13.5 - 1}" y="${hy - fh}" width="2.4" height="${fh - 16}" fill="#8C82B5"/>`).join("") +
        `<path d="M${hx} ${hy - fh} H${hx + w}" stroke="#8C82B5" stroke-width="2"/>` +
        crane(c.side === 1 ? hx + w + dx + 4 : hx - 6, c.y, 72, c.side === 1 ? -30 : 30) +
        lampR
      );
    // Glass front: panes light on one after another (slow blink), the screen glows inside.
    const panes: string[] = [];
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 5; i++) {
        const px = hx + 3 + i * 10.2;
        const py = hy - fh + 4 + r * 12;
        panes.push(`<rect class="blink" style="animation-delay:${r1(((i * 3 + r * 5) % 7) * 0.6)}s;animation-duration:4.2s" x="${r1(px)}" y="${py}" width="8.6" height="10" rx=".6" fill="${C.yellowL}"/>`);
      }
    const inside =
      `<rect x="${hx + 2}" y="${hy - fh + 3}" width="${w - 4}" height="25" fill="#FFD27A"/>` +
      panes.join("") +
      `<rect x="${hx + 14}" y="${hy - fh + 5}" width="22" height="9" rx="1" fill="#fff" opacity=".9"/><path d="M${hx + 17} ${hy - fh + 8} h12 M${hx + 17} ${hy - fh + 11} h8" stroke="${C.grape}" stroke-width="1.2" stroke-linecap="round"/>` +
      // Heads of the audience in the tiers.
      Array.from({ length: 8 }, (_, i) => `<circle cx="${r1(hx + 6 + i * 6)}" cy="${r1(hy - 8 - (i % 2) * 2)}" r="2" fill="${C.ink}" opacity=".55"/>`).join("") +
      [1, 2, 3, 4].map((i) => `<rect x="${r1(hx + i * 10.2 + 1.8)}" y="${hy - fh + 3}" width="1.6" height="25" fill="${C.grapeD}"/>`).join("") +
      `<rect x="${hx + 2}" y="${hy - fh + 15}" width="${w - 4}" height="1.4" fill="${C.grapeD}"/>`;
    const roof = `<path d="M${hx - 2} ${hy - fh} L${hx + w + 2} ${hy - fh} L${hx + w + dx + 2} ${hy - 6 - bh} L${hx + dx - 2} ${hy - 6 - bh}Z" fill="${ROOF}"/><path d="M${hx - 2} ${hy - fh} L${hx + w + 2} ${hy - fh}" stroke="${C.grapeD}" stroke-width="2.6"/><path d="M${hx + 2} ${hy - fh - 3} L${hx + dx} ${hy - bh - 4}" stroke="#8C66FF" stroke-width="1.4" stroke-linecap="round"/>`;
    const entrance = `<path d="M${hx + 18} ${hy} V${hy - 8} H${hx + 30} V${hy}Z" fill="${C.ink}" opacity=".7"/><path d="M${hx + 14} ${hy - 9} H${hx + 34} L${hx + 36} ${hy - 11} H${hx + 16}Z" fill="${C.grapeD}"/>`;
    const walkers = anim(X(24), c.y + 6, "drift", person(0, 0, C.orange, 0, 0.85) + person(c.side * 8, 1, "#3F8FE0", 2, 0.85));
    return (
      sh(hx + w / 2 + 6, hy, 36, 6) +
      sideWall(fh, bh) +
      `<path d="M${hx + w + 3} ${hy - fh + 4} L${hx + w + dx - 3} ${hy - bh + 2} L${hx + w + dx - 3} ${hy - bh + 8} L${hx + w + 3} ${hy - fh + 9}Z" fill="${C.yellowL}"/><path d="M${hx + w + 8} ${hy - fh + 1} v7 M${hx + w + 13} ${hy - fh - 3} v8" stroke="#E8C66A" stroke-width=".8"/>` +
      glow(hx + w + dx / 2, hy - (fh + bh) / 2 + 4, 12, true) +
      `<rect x="${hx}" y="${hy - fh}" width="${w}" height="${fh}" fill="${FRONT}"/>` +
      inside +
      roof +
      entrance +
      glow(hx + w / 2, hy - 16, 34, true) +
      walkers +
      lampR +
      stars([[X(-42), c.y - 78, 0.6], [X(30), c.y - 80, 1.4]])
    );
  },
});

// ---------------------------------------------------------------- bike shed

/** A bike in profile facing +x; `spin` turns the spokes. */
const bike = (frame: string, spin = false) => {
  const wheel = (cx: number) =>
    `<circle cx="${cx}" cy="-4.4" r="4.4" fill="none" stroke="#2B2442" stroke-width="1.4"/>` +
    (spin ? anim(cx, -4.4, "sails", `<path d="M-4 0 H4 M0 -4 V4" stroke="#8C82B5" stroke-width=".6"/>`) : `<path d="M${cx - 3} -4.4 H${cx + 3}" stroke="#8C82B5" stroke-width=".6"/>`);
  return (
    wheel(-6) +
    wheel(6) +
    `<path d="M-6 -4.4 L-2 -10 L4.4 -10 L6 -4.4 M-2 -10 L-.6 -4.4 L4.4 -10 M-3.4 -12 H-.4 M4.4 -10 L4 -12.6 L6.4 -13" stroke="${frame}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
  );
};

/** A cyclist riding towards +x. */
const cyclist = (shirt: string, frame: string) =>
  bike(frame, true) +
  `<path d="M-1 -11 L1 -6 L-.6 -4.4 M-1 -11 L3 -7 L3.6 -4.4" stroke="#3A3266" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
  `<path d="M-3.4 -11.6 L-1.4 -19 Q.6 -20 2 -18.6 L.6 -11.6Z" fill="${shirt}"/><path d="M1 -18 L5 -13.6" stroke="${shirt}" stroke-width="1.5" stroke-linecap="round"/>` +
  `<circle cx="1" cy="-21.6" r="2.6" fill="#F2C29B"/><path d="M-1.6 -22 Q.6 -25.4 3.4 -22.4 Q1 -23.4 -1.6 -22Z" fill="#5E3B26"/>` +
  `<path d="M-3 -14 L-9 -16" stroke="${C.yellow}" stroke-width="1.6" stroke-linecap="round"/>`;

const bikeShed = definePiece({
  id: "campus-bikes",
  biome: "campus",
  w: 108,
  h: 76,
  render: (c, X) => {
    const w = 72;
    const sx = c.side === 1 ? c.x - 50 : c.x - 34;
    const sy = c.y - 14;
    const d = 12;
    const k = d * 0.5;
    const lampB = lamp(fit(c, X(-50), 5, 9), c.y - 6, 0.75, true);
    const posts = (front: boolean) =>
      [0, 0.5, 1].map((t) => `<rect x="${r1(sx + t * (w - 2) + (front ? 0 : d))}" y="${r1(sy - 22 - (front ? 0 : k))}" width="2" height="22" fill="#5A4E92"/>`).join("");
    const bikesRow = (n: number, y: number, dx0: number) =>
      Array.from({ length: n }, (_, i) => place(sx + dx0 + i * 11, y - (i % 2) * 1.6, 0.95, bike(PALETTE[(i * 5 + 1) % PALETTE.length]))).join("");
    if (c.stage === 0) return plot(X(-4), c.y - 2, 0.9) + place(X(30), c.y + 6, 1, bike(C.pink)) + lampB;
    if (c.stage === 1)
      return (
        posts(false) +
        posts(true) +
        `<path d="M${sx} ${sy - 22} Q${sx + w / 4} ${sy - 30} ${sx + w / 2} ${sy - 31}" stroke="#8C82B5" stroke-width="2.4" fill="none"/>` +
        bikeRack(sx + 16, sy, 0.9) +
        place(sx + 50, sy, 1, `${sh(2, 0, 12, 3)}${box(-8, 0, 16, 4, 6, "#8C82B5", "#6E6A8F", "#A79CD6")}`) +
        person(X(36), c.y + 6, C.orange, 1) +
        lampB
      );
    const roof =
      `<path d="M${sx - 3} ${sy - 22} Q${sx + w / 2} ${sy - 36} ${sx + w + 3} ${sy - 22} L${sx + w + 3 + d} ${sy - 22 - k} Q${sx + w / 2 + d} ${sy - 36 - k} ${sx - 3 + d} ${sy - 22 - k}Z" fill="${ROOF}"/>` +
      `<path d="M${sx - 3} ${sy - 22} Q${sx + w / 2} ${sy - 36} ${sx + w + 3} ${sy - 22} L${sx + w + 3} ${sy - 19.6} Q${sx + w / 2} ${sy - 33.6} ${sx - 3} ${sy - 19.6}Z" fill="${C.grapeD}"/>` +
      `<path d="M${sx + 4} ${sy - 25} Q${sx + w / 3} ${sy - 33} ${sx + w / 2} ${sy - 33.4}" stroke="#8C66FF" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
      // A strip light under the front edge.
      `<path d="M${sx + 6} ${sy - 20.4} Q${sx + w / 2} ${sy - 31} ${sx + w - 6} ${sy - 20.4}" stroke="${C.yellowL}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    const rider = facing(X(-6), c.y + 8, c.side, 1, `<g class="drift">${cyclist(C.pink, C.yellow)}</g>`);
    return (
      sh(sx + w / 2, sy, w / 2 + 4, 5) +
      `<path d="M${sx} ${sy} L${sx + w} ${sy} L${sx + w + d} ${sy - k} L${sx + d} ${sy - k}Z" fill="#4A3D85"/>` +
      posts(false) +
      bikesRow(6, sy - 1, 8) +
      posts(true) +
      roof +
      glow(sx + w / 2, sy - 18, 30, true) +
      rider +
      stars([[X(-20), c.y - 66, 0.4], [X(36), c.y - 62, 1.2]])
    );
  },
});

// ---------------------------------------------------------------- sports hall + court

const sports = definePiece({
  id: "campus-sports",
  biome: "campus",
  w: 108,
  h: 84,
  render: (c, X) => {
    const fw = 32;
    const dl = 34;
    const k = 8;
    const hx = c.side === 1 ? c.x - 54 : c.x - 14;
    const hy = c.y - 12;
    const eave = 22;
    const crown = 36;
    // Court on the road side.
    const cx0 = c.side === 1 ? c.x + 14 : c.x - 52;
    const court = `<path d="M${cx0} ${c.y + 6} L${cx0 + 34} ${c.y + 6} L${cx0 + 40} ${c.y - 12} L${cx0 + 6} ${c.y - 12}Z" fill="#E07A3A"/><path d="M${cx0 + 3} ${c.y + 4} L${cx0 + 31} ${c.y + 4} L${cx0 + 36} ${c.y - 10} L${cx0 + 8} ${c.y - 10}Z M${cx0 + 17} ${c.y + 4} L${cx0 + 22} ${c.y - 10}" stroke="#fff" stroke-width=".9" fill="none" opacity=".85"/><ellipse cx="${cx0 + 19.6}" cy="${c.y - 3}" rx="4" ry="2" fill="none" stroke="#fff" stroke-width=".9" opacity=".85"/>`;
    const hoop = place(cx0 + 34, c.y - 10, 1, `<rect x="-1" y="-24" width="2" height="24" fill="#5A4E92"/><rect x="-7" y="-28" width="10" height="7" rx="1" fill="#fff"/><rect x="-4" y="-25.6" width="4" height="3" fill="none" stroke="${C.orange}" stroke-width=".7"/><ellipse cx="-3" cy="-21" rx="3" ry="1" fill="none" stroke="${C.orange}" stroke-width="1"/><path d="M-5.6 -21 L-4.4 -18 M-.4 -21 L-1.6 -18 M-3 -20 V-17.6" stroke="#fff" stroke-width=".5"/>`);
    const flood = lamp(fit(c, X(48), 5, 9), c.y - 14, 0.9, true);
    if (c.stage === 0) return plot(c.side === 1 ? c.x - 24 : c.x + 22, c.y - 4, 0.9) + `<path d="M${cx0} ${c.y + 6} L${cx0 + 34} ${c.y + 6} L${cx0 + 40} ${c.y - 12} L${cx0 + 6} ${c.y - 12}Z" fill="none" stroke="${C.orange}" stroke-width="1.2" stroke-dasharray="3 2"/>` + flood;
    const front = (h: number) =>
      h > eave
        ? `<path d="M${hx} ${hy} V${hy - eave} ${Array.from({ length: 9 }, (_, i) => { const t = (i / 8) * Math.PI; return `L${r1(hx + fw / 2 - (fw / 2) * Math.cos(t))} ${r1(hy - eave - (crown - eave + 2) * Math.sin(t))}`; }).join(" ")} V${hy}Z" fill="${FRONT}"/>`
        : `<rect x="${hx}" y="${hy - h}" width="${fw}" height="${h}" fill="${FRONT}"/>`;
    const sideW = (h: number) => `<path d="M${hx + fw} ${hy} L${hx + fw + dl} ${hy - k} L${hx + fw + dl} ${hy - k - h} L${hx + fw} ${hy - h}Z" fill="${SIDE}"/>`;
    if (c.stage === 1) return sh(hx + 28, hy, 30, 5) + sideW(12) + front(12) + scaffold(hx - 2, hy, fw + 4, 30) + court + place(cx0 + 34, c.y - 10, 1, `<rect x="-1" y="-24" width="2" height="24" fill="#5A4E92"/>`) + person(cx0 + 16, c.y + 2, C.orange, 1) + flood;
    // Barrel vault: strips between the front arch and the back arch, lit on the left, shaded right.
    const arc = Array.from({ length: 9 }, (_, i) => {
      const t = (i / 8) * Math.PI;
      return [r1(hx + fw / 2 - (fw / 2 + 1) * Math.cos(t)), r1(hy - eave - (crown - eave + 2) * Math.sin(t))] as [number, number];
    });
    const VAULT = ["#9C7BFF", "#8C66FF", "#7A52F8", ROOF, ROOF, "#5A2FE0", C.grapeD, C.grapeD];
    const barrel =
      arc
        .slice(0, 8)
        .map(([ax, ay], i) => {
          const [bx2, by2] = arc[i + 1];
          return `<path d="M${ax} ${ay} L${bx2} ${by2} L${r1(bx2 + dl)} ${r1(by2 - k)} L${r1(ax + dl)} ${r1(ay - k)}Z" fill="${VAULT[i]}" stroke="${VAULT[i]}" stroke-width=".4"/>`;
        })
        .join("") +
      `<path d="M${arc.map((p) => p.join(" ")).join(" L")}" stroke="${C.grapeD}" stroke-width="2" fill="none" stroke-linejoin="round"/>`;
    const glaze = `<path d="M${hx + fw + 3} ${hy - 12} L${hx + fw + dl - 3} ${hy - k - 11} L${hx + fw + dl - 3} ${hy - k - 18} L${hx + fw + 3} ${hy - 19}Z" fill="${C.yellowL}"/>` + [1, 2, 3, 4].map((i) => `<path d="M${r1(hx + fw + 3 + i * 5.6)} ${r1(hy - 12 - i * 1.3)} v-7" stroke="#E8C66A" stroke-width=".8"/>`).join("");
    const fan = `<path d="M${hx + 6} ${hy - 22} Q${hx + fw / 2} ${hy - 34} ${hx + fw - 6} ${hy - 22}Z" fill="${C.yellowL}"/><path d="M${hx + 6} ${hy - 22} H${hx + fw - 6} M${hx + fw / 2} ${hy - 22} V${hy - 28.4}" stroke="#E8C66A" stroke-width=".8"/>`;
    const ball = anim(cx0 + 14, c.y - 8, "bob", `<circle cx="0" cy="-3" r="2.6" fill="${C.orange}"/><path d="M-2.6 -3 H2.6 M0 -5.6 V-.4" stroke="${C.orangeD}" stroke-width=".6"/>`);
    return (
      sh(hx + 28, hy, 30, 5) +
      sideW(eave) +
      front(40) +
      barrel +
      glaze +
      fan +
      `<path d="M${hx + 11} ${hy} V${hy - 10} H${hx + 21} V${hy}Z" fill="${C.ink}" opacity=".7"/><rect x="${hx + 9}" y="${hy - 12}" width="14" height="2" fill="${C.grapeD}"/>` +
      glow(hx + fw / 2, hy - 24, 16, true) +
      glow(hx + fw + dl / 2, hy - 19, 20, true) +
      court +
      hoop +
      person(cx0 + 10, c.y + 2, C.yellow, 1, 0.9) +
      ball +
      person(cx0 + 26, c.y - 2, "#3F8FE0", 2, 0.85) +
      flood +
      stars([[X(-14), c.y - 76, 0.5]])
    );
  },
});

// ---------------------------------------------------------------- student housing (stacked units)

const UNITS: [string, string, string][] = [
  [C.pink, C.pinkD, "#FFA3BF"],
  [C.yellow, "#C98A12", "#FFE08A"],
  [C.greenM, C.green, C.greenL],
  [C.orange, C.orangeD, "#FFB870"],
  ["#8C66FF", C.grapeD, "#B9A6FF"],
  ["#3F8FE0", "#2B6CB8", "#8EC5FF"],
];

/** One stacked housing unit (unmirrored), front-left at (x, y): coloured box, lit window, door/balcony rail. */
const unit = (x: number, y: number, col: [string, string, string], lit: string) =>
  box(x, y, 22, 13, 9, col[0], col[1], col[2]) +
  `<path d="M${x + 1} ${y - 11} H${x + 21} M${x + 1} ${y - 2} H${x + 21}" stroke="#000" stroke-width=".6" opacity=".12"/>` +
  `<rect x="${x + 3}" y="${y - 10}" width="9" height="7" rx=".8" fill="${lit}"/><path d="M${x + 7.5} ${y - 10} V${y - 3}" stroke="#E8C66A" stroke-width=".7"/>` +
  `<rect x="${x + 14}" y="${y - 11}" width="5" height="11" fill="${C.ink}" opacity=".55"/>`;

const housing = definePiece({
  id: "campus-housing",
  biome: "campus",
  w: 108,
  h: 96,
  render: (c, X) => {
    const hx = c.side === 1 ? c.x - 50 : c.x - 34;
    const hy = c.y - 6;
    const lampR = lamp(fit(c, X(50), 5, 9), c.y + 6, 0.75, true);
    const bikes = bikeRack(X(36), c.y + 6, 0.8);
    const row = (n: number, y: number, x0: number, o: number) => Array.from({ length: n }, (_, i) => unit(hx + x0 + i * 22, y, UNITS[(i + o) % UNITS.length], C.yellowL)).join("");
    if (c.stage === 0)
      return plot(X(-6), c.y, 0.9) + place(X(28), c.y - 4, 1, `${sh(4, 0, 16, 3)}${box(-10, 0, 22, 9, 6, C.pink, C.pinkD, "#FFA3BF")}`) + place(X(22), c.y + 4, 1, `${sh(4, 0, 16, 3)}${box(-10, 0, 22, 9, 6, C.greenM, C.green, C.greenL)}`) + lampR;
    const craneX = c.side === 1 ? hx + 76 : hx - 6;
    const reach = c.side === 1 ? -28 : 28;
    if (c.stage === 1)
      return (
        sh(hx + 36, hy, 38, 6) +
        row(3, hy, 0, 0) +
        crane(craneX, c.y, 76, reach) +
        // A unit hanging from the hook, over the crane's own load.
        box(craneX + reach - Math.sign(reach) * 4 - 8, c.y - 76 + 24, 16, 8, 5, C.yellow, "#C98A12", "#FFE08A") +
        person(X(-36) + (c.side === 1 ? 8 : 0), c.y + 6, C.orange, 1) +
        lampR
      );
    // A TV flickering blue in one window, fairy lights on a balcony.
    const tv = `<rect class="blink" style="animation-duration:2.6s" x="${hx + 22 + 3}" y="${hy - 13 - 10}" width="9" height="7" rx=".8" fill="#9FD3FF"/>`;
    const stairs = `<path d="M${hx - 1} ${hy} L${hx - 1} ${hy - 26} M${hx - 6} ${hy} L${hx - 6} ${hy - 26} M${hx - 6} ${hy - 26} H${hx}" stroke="#8C82B5" stroke-width="1.2"/>` + Array.from({ length: 6 }, (_, i) => `<path d="M${hx - 6} ${hy - 3 - i * 4} H${hx - 1}" stroke="#8C82B5" stroke-width="1"/>`).join("");
    const plants = [hx + 30, hx + 50].map((px) => `<circle cx="${px}" cy="${hy - 41}" r="2.6" fill="${C.green}"/><circle cx="${px - 1}" cy="${hy - 42}" r="1.6" fill="${C.greenL}"/>`).join("");
    return (
      sh(hx + 36, hy, 40, 6) +
      stairs +
      row(3, hy, 0, 0) +
      row(3, hy - 13, 0, 3) +
      tv +
      row(2, hy - 26, 11, 1) +
      `<path d="M${hx + 11} ${hy - 39} H${hx + 55}" stroke="#E9E4F5" stroke-width="1" opacity=".8"/>` +
      plants +
      fairyLights([[hx + 2, hy - 26], [hx + 34, hy - 28], [hx + 66, hy - 26]], true) +
      Array.from({ length: 3 }, (_, f) => glow(hx + 33, hy - 6 - f * 13, 24, true)).join("") +
      bikes +
      person(X(16), c.y + 8, C.pink, 1, 0.9) +
      lampR +
      stars([[X(-44), c.y - 80, 0.3], [X(34), c.y - 84, 1]])
    );
  },
});

// ---------------------------------------------------------------- observatory dome

const observatory = definePiece({
  id: "campus-observatory",
  biome: "campus",
  w: 108,
  h: 100,
  render: (c, X) => {
    const ox = c.x - 4;
    const oy = c.y - 4;
    const r = 26;
    const dh = 24; // drum height
    const tree2 = tree(fit(c, X(-42), 12, 18), c.y - 2, 0.5);
    // Drum (cylinder): lit left, shaded right, a rim band; door and a lit window.
    const drum = (h: number) =>
      `<path d="M${ox - r} ${oy - h} V${oy} Q${ox} ${oy + 8} ${ox + r} ${oy} V${oy - h}Z" fill="${FRONT}"/><path d="M${ox + 6} ${oy + 5.6} Q${ox + 18} ${oy + 4} ${ox + r} ${oy} V${oy - h} H${ox + 6}Z" fill="${SIDE}"/>` +
      `<path d="M${ox - r} ${oy - h} Q${ox} ${oy - h + 8} ${ox + r} ${oy - h}" stroke="${C.grapeD}" stroke-width="2.4" fill="none"/>`;
    const tripod = (x: number, y: number) => place(x, y, 1, `${sh(0, 0, 6, 1.6)}<path d="M0 -9 L-4 0 M0 -9 L0 0 M0 -9 L4 0" stroke="#8C82B5" stroke-width="1.1"/><rect x="-6" y="-14" width="12" height="3.4" rx="1.6" fill="${C.lilac}" transform="rotate(-24 0 -12)"/>`);
    if (c.stage === 0) return plot(ox, c.y, 0.9) + tripod(X(32), c.y + 6) + tree2 + stars([[X(20), c.y - 60, 0.2], [X(-24), c.y - 70, 0.9]]);
    if (c.stage === 1)
      return (
        sh(ox, oy, r + 6, 6) +
        drum(dh) +
        // Dome ribs (frame only).
        `<path d="M${ox - r} ${oy - dh} Q${ox - r} ${oy - dh - r - 4} ${ox} ${oy - dh - r - 2} Q${ox + r} ${oy - dh - r - 4} ${ox + r} ${oy - dh} M${ox - 12} ${oy - dh - 2} Q${ox - 12} ${oy - dh - r} ${ox} ${oy - dh - r - 2} M${ox + 12} ${oy - dh - 2} Q${ox + 12} ${oy - dh - r} ${ox} ${oy - dh - r - 2}" stroke="#8C82B5" stroke-width="1.6" fill="none"/>` +
        scaffold(ox - r - 4, oy, 2 * r + 8, dh + 6) +
        tripod(X(36), c.y + 6) +
        person(X(-36) + (c.side === 1 ? 6 : 0), c.y + 6, C.orange, 2) +
        tree2
      );
    const dy = oy - dh;
    const dome =
      `<path d="M${ox - r - 1} ${dy} Q${ox - r - 1} ${dy - r - 6} ${ox} ${dy - r - 4} Q${ox + r + 1} ${dy - r - 6} ${ox + r + 1} ${dy}Z" fill="#F4F1FF"/>` +
      `<path d="M${ox + 4} ${dy - r - 4} Q${ox + r + 1} ${dy - r - 6} ${ox + r + 1} ${dy} L${ox + 6} ${dy} Q${ox + 10} ${dy - r * 0.6} ${ox + 4} ${dy - r - 4}Z" fill="#C9C3E3"/>` +
      `<path d="M${ox - r + 3} ${dy - 6} Q${ox - r + 2} ${dy - r} ${ox - 6} ${dy - r - 2}" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>` +
      // Open slit (dark), with the warm glow of the room below.
      `<path d="M${ox - 4} ${dy} L${ox - 5} ${dy - r - 3} Q${ox} ${dy - r - 5} ${ox + 5} ${dy - r - 3} L${ox + 4} ${dy}Z" fill="${C.ink}"/>`;
    // The telescope pivots in the slit, slowly sweeping the sky.
    const scope = anim(
      ox,
      dy - 8,
      "sway",
      `<g transform="rotate(${c.side === 1 ? 30 : -30})"><rect x="-3.2" y="-30" width="6.4" height="24" rx="1.6" fill="#D9CEFF"/><rect x="1" y="-30" width="2.2" height="24" fill="${SIDE}"/><rect x="-4" y="-32" width="8" height="4" rx="1" fill="${C.grape}"/><rect x="-2" y="-6" width="4" height="6" fill="#8C82B5"/></g>`,
    );
    const door = `<path d="M${ox - 16} ${oy + 3} V${oy - 10} Q${ox - 11} ${oy - 15} ${ox - 6} ${oy - 10} V${oy + 4.4}Z" fill="${C.ink}" opacity=".8"/>` + win(ox + 2, oy - 16, 6, 7, true, 3);
    const shooting = anim(X(30), c.y - 84, "drift", `<path d="M0 0 L${-c.side * 14} -5" stroke="#FFF3B0" stroke-width="1.4" stroke-linecap="round" opacity=".8"/><circle r="1.6" fill="#fff"/>`);
    return (
      sh(ox, oy, r + 8, 6) +
      drum(dh) +
      door +
      scope +
      dome +
      glow(ox, dy - 8, 20, true) +
      glow(ox + 5, oy - 12, 10, true) +
      tree2 +
      lamp(fit(c, X(44), 5, 9), c.y + 6, 0.75, true) +
      shooting +
      stars([[X(-24), c.y - 88, 0], [X(38), c.y - 62, 0.7], [X(-44), c.y - 58, 1.3], [X(14), c.y - 92, 0.4]])
    );
  },
});

// ---------------------------------------------------------------- graduation stage (the finale)

/** A firework burst (absolute centre), expanding and fading via `ring`. */
const firework = (x: number, y: number, col: string, delay: number) =>
  `<g transform="translate(${r1(x)} ${r1(y)})"><g class="ring" style="animation-delay:${r1(delay)}s">` +
  Array.from({ length: 10 }, (_, i) => {
    const a = (i * Math.PI) / 5;
    return `<path d="M${r1(Math.cos(a) * 4)} ${r1(Math.sin(a) * 4)} L${r1(Math.cos(a) * 10)} ${r1(Math.sin(a) * 10)}" stroke="${col}" stroke-width="1.6" stroke-linecap="round"/><circle cx="${r1(Math.cos(a) * 12)}" cy="${r1(Math.sin(a) * 12)}" r="1.2" fill="${col}"/>`;
  }).join("") +
  `</g></g>`;

const gradStage = definePiece({
  id: "campus-stage",
  biome: "campus",
  w: 108,
  h: 102,
  render: (c, X) => {
    const w = 64;
    const sx = c.x - 36;
    const sy = c.y - 18; // stage deck front edge
    const deck = 8;
    const d = 10;
    const tl = sx + 4;
    const tr = sx + w - 4;
    const tt = sy - deck - 40;
    const lamps = lamp(fit(c, X(-50), 5, 9), c.y + 4, 0.75, true);
    const platform = sh(sx + w / 2, sy, w / 2 + 4, 5) + box(sx, sy, w, deck, d, "#4A3D85", "#3A2F6E", "#8C82B5") + `<path d="M${sx} ${sy - deck} H${sx + w}" stroke="#B9A6FF" stroke-width="1"/>`;
    const truss = (x: number, h: number) =>
      `<rect x="${x - 2}" y="${sy - deck - h}" width="4" height="${h}" fill="none" stroke="#9A96B8" stroke-width="1"/>` +
      Array.from({ length: Math.floor(h / 6) }, (_, i) => `<path d="M${x - 2} ${sy - deck - i * 6} L${x + 2} ${sy - deck - i * 6 - 6}" stroke="#9A96B8" stroke-width=".7"/>`).join("");
    if (c.stage === 0) return plot(X(-6), c.y - 4, 0.9) + chairs(X(30), c.y + 6, 4) + chairs(X(38), c.y - 6, 3) + lamps;
    if (c.stage === 1)
      return (
        platform +
        truss(tl, 40) +
        truss(tr, 24) +
        [0, 1, 2, 3].map((i) => chair(X(-30 + i * 9), c.y + 4)).join("") +
        chairs(X(36), c.y + 6, 3) +
        person(sx + w / 2, sy - deck, C.orange, 1) +
        lamps
      );
    const beam = `<rect x="${tl - 2}" y="${tt - 4}" width="${tr - tl + 4}" height="4" fill="none" stroke="#9A96B8" stroke-width="1"/>` + Array.from({ length: 9 }, (_, i) => `<path d="M${tl + i * 6.4} ${tt} L${tl + i * 6.4 + 3.2} ${tt - 4}" stroke="#9A96B8" stroke-width=".7"/>`).join("");
    // Backdrop banner with a mortarboard emblem.
    const banner =
      `<rect x="${tl + 4}" y="${tt + 2}" width="${tr - tl - 8}" height="26" fill="${C.grape}"/><rect x="${tr - 8}" y="${tt + 2}" width="4" height="26" fill="${C.grapeD}"/><path d="M${tl + 4} ${tt + 28} l4 4 l4 -4 l4 4 l4 -4 l4 4 l4 -4 l4 4 l4 -4 l4 4 l4 -4 l4 4 l${tr - tl - 56} -4 V${tt + 28}Z" fill="${C.grape}"/>` +
      place(sx + w / 2 - 2, tt + 16, 1.6, cap) +
      `<path d="M${tl + 10} ${tt + 24} H${tr - 14}" stroke="${C.yellow}" stroke-width="1.2" stroke-linecap="round"/>`;
    const podium = place(sx + w / 2 + 12, sy - deck, 1, `${box(-5, 0, 8, 10, 3, "#8C66FF", C.grapeD, "#B9A6FF")}<circle cx="-1" cy="-6" r="1.8" fill="${C.yellow}"/>`);
    const speaker = graduate(sx + w / 2 + 2, sy - deck, 2, true, 0.9);
    const spots = [tl + 8, tr - 8].map((x) => `<path d="M${x - 2.6} ${tt + 1} h5.2 l-1 3.4 h-3.2Z" fill="#3A3266"/>`).join("") + glow(sx + w / 2 + 6, sy - deck - 10, 26, true) + glow(tl + 8, tt + 6, 8, true) + glow(tr - 8, tt + 6, 8, true);
    const caps = [
      [X(-30), c.y - 54, 0],
      [X(-14), c.y - 64, 0.5],
      [X(6), c.y - 56, 1.1],
    ]
      .map(([x, y, dl]) => anim(x, y, "bob", `<g transform="rotate(${dl === 0.5 ? -14 : 12})">${cap}</g>`, dl))
      .join("");
    const confetti = Array.from({ length: 10 }, (_, i) => {
      const x = sx + 2 + ((i * 37) % (w - 4));
      const y = tt - 6 + ((i * 23) % 40);
      return anim(x, y, "bob", `<rect x="-1" y="-1.6" width="2" height="3.2" rx=".4" fill="${PALETTE[i % PALETTE.length]}" transform="rotate(${(i * 47) % 90})"/>`, r1((i * 0.29) % 1.8));
    }).join("");
    const crowd = [-40, -26, -10, 6, 22]
      .map((d0, i) => graduate(X(d0) + (i % 2 ? 2 : -2), c.y + 6 - (i % 2) * 3, i, i % 2 === 0 || i === 3, 0.95))
      .join("");
    return (
      firework(X(-30), c.y - 84, C.pink, 0) +
      firework(X(28), c.y - 90, C.yellow, 1.1) +
      firework(X(-2), c.y - 92, "#8EC5FF", 1.8) +
      truss(tl, 40) +
      truss(tr, 40) +
      beam +
      banner +
      bunting(tl, tt - 2, tr, tt - 2, true) +
      platform +
      podium +
      speaker +
      flag(sx - 2, sy + 2, C.yellow, 44) +
      flag(sx + w + 8, sy - 4, C.pink, 44) +
      spots +
      caps +
      confetti +
      crowd +
      lamps
    );
  },
});

export const campus: WorldBiome = {
  id: "campus",
  ground: ["#3B2F70", "#2A2158"],
  patch: "#4A3D85",
  bannerBg: ["#6B3CF6", "#4A22C4"],
  banner: "world.biome.campus",
  night: true,
  density: 0.4,
  flora: [
    { weight: 1, radius: 19, render: (x, y, _r, s) => lamp(x, y, 0.8 * s, true) },
    { weight: 0.8, radius: 14, render: (x, y, _r, s) => bikeRack(x, y, 0.8 * s) },
    { weight: 2, radius: 14, render: (x, y, _r, s) => tree(x, y, 0.55 * s) },
    { weight: 1.5, radius: 6, render: (x, y, r, s) => star(x, y, s, r1(r() * 1.8)) },
  ],
  pieces: [mainBuilding, libraryPiece, lecture, bikeShed, sports, housing, observatory, gradStage],
};
