import {
  C,
  anim,
  birdV,
  block,
  boulder,
  building,
  cow,
  definePiece,
  edelweiss,
  facing,
  fence,
  fir,
  fit,
  glow,
  house,
  logPile,
  mp,
  person,
  place,
  plot,
  r1,
  scaffold,
  sh,
  smokePuffs,
  snowPatch,
  sparkle,
  tent,
  tuft,
  win,
  type WorldBiome,
} from "../kit";

const CHALET = { wall: "#B07A45", side: "#8a5a3a", roof: "#F4F1FF", roofD: "#C9C3E3" };

/** Swiss chalet with flower boxes, a snowy roof, a fir and a Swiss flag. */
const chalet = definePiece({
  id: "bergen-chalet",
  biome: "bergen",
  w: 108,
  h: 98,
  render: (c, X) => {
    const back = fir(fit(c, X(-38), 22, 28), c.y - 12, 1, true);
    if (c.stage === 0) return back + snowPatch(X(30), c.y + 6, 0.8) + plot(X(6), c.y - 2, 1.05);
    if (c.stage === 1) return back + building(X(4), c.y, 1, { wall: CHALET.wall, side: CHALET.side, craneSide: c.side });
    const hx = X(4);
    const s = 1.1;
    // Flower boxes under the windows (house-local coords × scale).
    const boxes =
      `<g transform="translate(${hx} ${c.y}) scale(${s})"><rect x="-4" y="-11" width="9" height="2.6" rx="1" fill="#6E4428"/><circle cx="-2.5" cy="-11.5" r="1.4" fill="#F0506E"/><circle cx="0.5" cy="-11.8" r="1.4" fill="#fff"/><circle cx="3.5" cy="-11.5" r="1.4" fill="#F0506E"/>` +
      `<g transform="skewY(-12)"><rect x="10" y="-14" width="9" height="2.6" rx="1" fill="#5E3B26"/><circle cx="11.5" cy="-14.5" r="1.4" fill="#F0506E"/><circle cx="14.5" cy="-14.8" r="1.4" fill="#fff"/><circle cx="17.5" cy="-14.5" r="1.4" fill="#F0506E"/></g></g>`;
    const swiss = `<g transform="translate(${X(40)} ${c.y + 4})"><rect x="-1.2" y="-36" width="2.4" height="36" fill="#7a4f33"/><g class="flag"><rect x="1" y="-36" width="16" height="12" rx="1" fill="#E63946"/><path d="M9 -33 v6 M6 -30 h6" stroke="#fff" stroke-width="2.2"/></g></g>`;
    return back + house(hx, c.y, s, { ...CHALET, alive: true, logs: "#6E4428" }) + boxes + swiss + edelweiss(X(-14), c.y + 8, 1);
  },
});

// ---------------------------------------------------------------- shared alpine bits

const ROCK = { lit: "#A9A3CF", shade: "#7F79AA", hi: "#CFCAEA" };
const FAR = { lit: "#C3BFE3", shade: "#A29DCB", hi: "#DEDAF3" };
const SNOW = { lit: "#fff", shade: "#D3DDF0" };
const RED = "#E63946";
const REDD = "#B82838";
const STONE = { front: "#C7C1E0", side: "#9C96C2", top: "#E2DEF3", joint: "#A9A3CF" };
const MEADOW = { lit: "#B9E6A4", shade: "#93CF86", hi: "#D6F3C2" };

type Pt = [number, number];
const lerp = (a: Pt, b: Pt, t: number): Pt => [r1(a[0] + (b[0] - a[0]) * t), r1(a[1] + (b[1] - a[1]) * t)];
const poly = (pts: Pt[], fill: string, extra = "") => `<path d="M${pts.map((p) => p.join(" ")).join(" L")}Z" fill="${fill}"${extra}/>`;

/**
 * A mountain peak (unmirrored) on base centre (x, y), half-width `hw`, height `h`: lit left face,
 * shaded right face, a lit rim, and a jagged snow cap reaching `snow` (0–1) down the faces.
 */
function peak(x: number, y: number, hw: number, h: number, snow = 0.4, col = ROCK) {
  const A: Pt = [r1(x - hw * 0.1), r1(y - h)];
  const L: Pt = [r1(x - hw), y];
  const R: Pt = [r1(x + hw), y];
  const F: Pt = [r1(x + hw * 0.18), y];
  const ML: Pt = lerp(L, F, 0.5);
  const MR: Pt = lerp(F, R, 0.5);
  let out = poly([L, A, F], col.lit) + poly([A, R, F], col.shade);
  // A secondary ridge on the lit face, and a gully on the shaded one.
  out += `<path d="M${lerp(A, L, 0.35).join(" ")} L${lerp(ML, A, 0.15).join(" ")}" stroke="${col.shade}" stroke-width="1.4" opacity=".55" stroke-linecap="round"/>`;
  out += `<path d="M${lerp(A, MR, 0.3).join(" ")} L${lerp(A, MR, 0.75).join(" ")}" stroke="#000" stroke-width="1.6" opacity=".08" stroke-linecap="round"/>`;
  out += `<path d="M${lerp(A, L, 0.05).join(" ")} L${lerp(A, L, 0.9).join(" ")}" stroke="${col.hi}" stroke-width="1.8" stroke-linecap="round"/>`;
  if (snow > 0) {
    const s = snow;
    out += poly([A, lerp(A, L, s), lerp(A, ML, s * 0.62), lerp(A, ML, s * 0.92), lerp(A, F, s * 0.7)], SNOW.lit);
    out += poly([A, lerp(A, F, s * 0.7), lerp(A, MR, s * 0.95), lerp(A, MR, s * 0.62), lerp(A, R, s * 0.86)], SNOW.shade);
  }
  return out;
}

/** Swiss flag on a pole (unmirrored); `alive` waves it. */
const swissFlag = (x: number, y: number, h = 22, alive = false) =>
  place(
    x,
    y,
    1,
    `<rect x="-.8" y="${-h}" width="1.6" height="${h}" fill="${C.woodD}"/><g${alive ? ` class="flag"` : ""}><rect x=".6" y="${-h}" width="11" height="8" rx=".8" fill="${RED}"/><path d="M6.1 ${-h + 1.8} v4.4 M3.9 ${-h + 4} h4.4" stroke="#fff" stroke-width="1.6"/></g>`,
  );

/** A cable drum (spool) lying on its side. */
const spool = (x: number, y: number) =>
  place(x, y, 1, `${sh(1, 0, 9, 2.4)}<rect x="-6" y="-11" width="12" height="11" rx="1" fill="#6E6A8F"/><ellipse cx="-6" cy="-5.5" rx="2.6" ry="5.5" fill="${C.woodL}"/><ellipse cx="-6" cy="-5.5" rx="1" ry="2" fill="${C.wood}"/><path d="M-3 -10 V-1 M0 -10 V-1 M3 -10 V-1" stroke="#9A96B8" stroke-width=".8"/>`);

/** Survey stake with a red-white tip. */
const stake = (x: number, y: number) => `<rect x="${r1(x - 0.8)}" y="${r1(y - 10)}" width="1.6" height="10" fill="${C.woodL}"/><rect x="${r1(x - 0.8)}" y="${r1(y - 10)}" width="1.6" height="3" fill="${RED}"/>`;

// ---------------------------------------------------------------- cable car between peaks

/** Valley/summit station (unmirrored), baseline (x, y). */
function station(x: number, y: number, done: boolean) {
  if (!done) return place(x, y, 1, `${block(-7, 0, 13, 4, 4, STONE.front, STONE.side, STONE.top)}${scaffold(-8, 0, 16, 12)}`);
  return (
    place(
      x,
      y,
      1,
      `${sh(1, 0, 10, 2)}${block(-7, 0, 13, 9, 5, "#F4F1FF", "#C9C3E3")}<path d="M-8.5 -9 L6 -9 L11.5 -10.1 L-3 -10.1Z" fill="${RED}"/><rect x="-8.5" y="-10.4" width="15" height="2.2" fill="${REDD}"/>` +
        win(-5, -6.6, 4, 3.6) +
        `<rect x="1" y="-6.6" width="4" height="6.6" fill="${C.ink}" opacity=".75"/>`,
    ) + glow(x - 3, y - 5, 8)
  );
}

/** Red gondola cabin hanging from (0, 0). */
const cabin = (col = RED) =>
  `<path d="M0 0 V5" stroke="#3A3266" stroke-width="1.1"/><rect x="-2" y="4" width="4" height="2" rx=".6" fill="#3A3266"/>` +
  `<rect x="-6" y="6" width="12" height="10" rx="2.4" fill="${col}"/><rect x="2" y="6" width="4" height="10" rx="1.6" fill="#000" opacity=".16"/>` +
  `<rect x="-4.6" y="7.6" width="9" height="3.6" rx="1" fill="${C.glass}"/><rect class="wl-on" x="-4.6" y="7.6" width="9" height="3.6" rx="1" fill="${C.yellowL}"/><path d="M-4.6 7.6 h4" stroke="#fff" stroke-width=".8" opacity=".7"/>`;

const cablecar = definePiece({
  id: "bergen-cablecar",
  biome: "bergen",
  w: 108,
  h: 102,
  render: (c, X) => {
    const bx = X(-22);
    const by = c.y - 4;
    const fx = X(28);
    const fy = c.y + 2;
    const peaks = peak(bx, by, 32, 80, c.stage === 0 ? 0.3 : 0.38) + peak(fx, fy, 25, 50, 0.3);
    // Station anchors: on the summits (apex = base − 0.1·hw).
    const t: Pt = [r1(bx - 3.2), r1(by - 79)];
    const v: Pt = [r1(fx - 2.5), r1(fy - 49)];
    const firs = fir(fit(c, X(-44), 22, 26), c.y + 4, 0.55, true) + fir(fit(c, X(46), 22, 26), c.y + 6, 0.5);
    if (c.stage === 0) return peaks + stake(t[0] + 4, t[1] + 4) + stake(v[0] - 3, v[1] + 4) + spool(X(-2), c.y + 2) + plot(X(-26), c.y + 2, 0.6) + firs;
    const p1: Pt = [t[0] + c.side * 6, t[1] - 6];
    const p2: Pt = [v[0] - c.side * 6, v[1] - 6];
    const wire = (dy: number, sag: number) => `<path d="M${p1[0]} ${p1[1] + dy} Q${r1((p1[0] + p2[0]) / 2)} ${r1((p1[1] + p2[1]) / 2 + dy + sag)} ${p2[0]} ${p2[1] + dy}" stroke="#3A3266" stroke-width=".9" fill="none"/>`;
    if (c.stage === 1)
      return peaks + station(t[0], t[1], false) + station(v[0], v[1], false) + wire(0, 9) + spool(X(-2), c.y + 2) + person(X(8), c.y + 6, C.orange, 1) + firs;
    // The gondola slides along the cable: rotate to the cable, slide on x, counter-rotate the cabin.
    const ang = r1((Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180) / Math.PI);
    const mid: Pt = [r1((p1[0] + p2[0]) / 2), r1((p1[1] + p2[1]) / 2 + 1)];
    const gondola = `<g transform="translate(${mid[0]} ${mid[1]}) rotate(${ang})"><g class="slide"><g transform="rotate(${-ang})">${cabin()}</g></g></g>`;
    return (
      peaks +
      station(t[0], t[1], true) +
      swissFlag(t[0] - c.side * 4, t[1] - 9, 12, true) +
      station(v[0], v[1], true) +
      wire(0, 1) +
      wire(-2.4, 1) +
      gondola +
      firs +
      birdV(X(10), c.y - 84, 1, true, 0.3) +
      edelweiss(X(8), c.y + 6, 0.9)
    );
  },
});

// ---------------------------------------------------------------- alpine pasture

/** Rolling meadow hill (absolute): lit left flank, shaded right, a soft crest highlight. */
const hill = (x: number, y: number, w: number, h: number) =>
  `<path d="M${r1(x - w)} ${y} Q${r1(x - w * 0.55)} ${r1(y - h)} ${r1(x)} ${r1(y - h)} Q${r1(x + w * 0.6)} ${r1(y - h)} ${r1(x + w)} ${y}Z" fill="${MEADOW.lit}"/>` +
  `<path d="M${r1(x + w * 0.1)} ${r1(y - h)} Q${r1(x + w * 0.6)} ${r1(y - h)} ${r1(x + w)} ${y} L${r1(x + w * 0.3)} ${y} Q${r1(x + w * 0.32)} ${r1(y - h * 0.5)} ${r1(x + w * 0.1)} ${r1(y - h)}Z" fill="${MEADOW.shade}"/>` +
  `<path d="M${r1(x - w * 0.75)} ${r1(y - h * 0.45)} Q${r1(x - w * 0.5)} ${r1(y - h * 0.95)} ${r1(x - w * 0.1)} ${r1(y - h * 0.98)}" stroke="${MEADOW.hi}" stroke-width="2" fill="none" stroke-linecap="round"/>`;

/** Milk can (unmirrored). */
const milkCan = (x: number, y: number) =>
  place(x, y, 1, `${sh(1, 0, 5, 1.6)}<path d="M-3.4 0 V-7 L-2 -9 V-11 H2 V-9 L3.4 -7 V0Z" fill="#D9D3EC"/><path d="M1 0 V-7 L1 -11 H2 V-9 L3.4 -7 V0Z" fill="#AFA8CF"/><rect x="-2.6" y="-12.4" width="5.2" height="1.6" rx=".6" fill="#8C82B5"/>`);

/** A herder blowing an alphorn that rests on the ground towards +x (mirror with `facing`). */
const alphorn = `<path d="M0 -14 Q6 -12 14 -6 Q20 -1 22 -1" stroke="${C.woodL}" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M19 -2.6 Q23 -4 25 -1 Q24 1 19 .4Z" fill="${C.wood}"/><path d="M4 -12 l1 1.4 M9 -9.4 l1 1.4" stroke="${C.woodD}" stroke-width="1"/>`;

const pasture = definePiece({
  id: "bergen-pasture",
  biome: "bergen",
  w: 108,
  h: 84,
  render: (c, X) => {
    const f = c.side;
    const back = peak(X(-26), c.y - 40, 26, 42, 0.42, FAR) + hill(X(4), c.y - 30, 52, 22);
    const fenceBack = (n: number) => fence(X(-48), c.y - 34, X(-48 + n), c.y - 38 - n * 0.06);
    if (c.stage === 0)
      return (
        back +
        stake(X(-40), c.y - 30) +
        stake(X(-20), c.y - 32) +
        logPile(X(-28), c.y - 6, 0.8) +
        place(X(16), c.y - 14, 1, `${sh(0, 0, 5, 1.6)}${block(-4, 0, 7, 5, 3, "#F4F1FF", "#D3DDF0", "#fff")}`) +
        plot(X(26), c.y + 2, 0.6) +
        tuft(X(-8), c.y + 4)
      );
    if (c.stage === 1)
      return back + fenceBack(36) + logPile(X(26), c.y - 18, 0.7) + cow(X(-8), c.y - 6, 0.9, -f as 1 | -1, false, 0, true) + person(X(22), c.y + 4, "#3F6FD0", 0) + place(X(26), c.y + 4, 1, `<path d="M-1 -16 L3 2" stroke="${C.woodL}" stroke-width="1.2"/><path d="M-2.4 -18 l2 2.6 M-.4 -18.4 l1.4 2.6" stroke="#8C82B5" stroke-width=".9"/>`) + tuft(X(-36), c.y + 4);
    return (
      back +
      fenceBack(92) +
      cow(X(-28), c.y - 16, 0.82, f, true, 0, true) +
      cow(X(14), c.y - 22, 0.75, -f as 1 | -1, true, 1.6, true) +
      cow(X(-12), c.y + 2, 1, f, true, 3.1, true) +
      facing(X(40), c.y + 6, -f as 1 | -1, 1, alphorn) +
      person(X(38), c.y + 6, RED, 0) +
      place(X(38), c.y + 6, 1, `<path d="M-3.4 -17.4 H3.4 L2 -19.6 H-2Z" fill="${C.wood}"/>`) +
      milkCan(X(-44), c.y + 4) +
      edelweiss(X(14), c.y - 4, 0.8) +
      birdV(X(28), c.y - 70, 1, true, 0.5)
    );
  },
});

// ---------------------------------------------------------------- mountain lake

const LAKE = { deep: "#4FB6C8", water: "#7FD3DC", hi: "#B8EBEE", rim: "#A6D99A" };

const lake = definePiece({
  id: "bergen-lake",
  biome: "bergen",
  w: 108,
  h: 92,
  render: (c, X) => {
    const lx = c.x;
    const ly = c.y - 12;
    const back = peak(X(-20), c.y - 30, 30, 58, 0.45, FAR) + peak(X(22), c.y - 28, 22, 40, 0.4);
    const basin = (rx: number, ry: number, fill: string) => `<ellipse cx="${lx}" cy="${ly}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
    const rocks = boulder(X(-44), c.y - 4, 0.55) + boulder(X(40), c.y - 20, 0.45);
    const firL = fir(fit(c, X(-42), 22, 26), c.y - 26, 0.6, true);
    if (c.stage === 0)
      return (
        back +
        basin(48, 17, LAKE.rim) +
        basin(42, 13, "#C9BFA0") +
        `<path d="M${X(-30)} ${ly - 4} Q${X(-10)} ${ly - 8} ${X(4)} ${ly - 2} Q${X(16)} ${ly + 3} ${X(30)} ${ly}" stroke="#B5A880" stroke-width="1.2" fill="none"/>` +
        `<path d="M${X(-20)} ${ly - 12} Q${X(-14)} ${ly - 6} ${X(-6)} ${ly - 4}" stroke="${LAKE.water}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
        rocks +
        plot(X(8), ly + 4, 0.6)
      );
    if (c.stage === 1)
      return (
        back +
        firL +
        basin(48, 17, LAKE.rim) +
        basin(42, 13, "#C9BFA0") +
        `<ellipse cx="${X(-8)}" cy="${ly - 1}" rx="26" ry="8" fill="${LAKE.water}"/><ellipse cx="${X(-10)}" cy="${ly - 2}" rx="18" ry="5" fill="${LAKE.hi}" opacity=".7"/>` +
        rocks +
        [24, 31, 38].map((d) => `<rect x="${X(d) - 1}" y="${ly - 2 + d * 0.15}" width="2.2" height="9" fill="${C.wood}"/>`).join("") +
        facing(X(22), c.y + 8, c.side, 1, `<path d="M-10 -6 Q0 -9 10 -6 L8 0 H-8Z" fill="${RED}"/><path d="M-10 -6 Q0 -9 10 -6" stroke="${REDD}" stroke-width="1.4" fill="none"/>`) +
        person(X(-30), c.y + 8, C.orange, 2)
      );
    // Reflection of the far peak (inverted, faint).
    const reflect = `<g opacity=".28"><path d="M${X(-20) - 22} ${ly - 8} L${X(-20) - 3} ${ly + 8} L${X(-20) + 20} ${ly - 8}Z" fill="#fff"/></g>`;
    const boat = facing(
      X(-4),
      ly + 3,
      c.side,
      1,
      `<g class="drift"><g class="float"><path d="M-11 -3 Q0 -1 11 -3 L8.6 2 Q0 3.6 -8.6 2Z" fill="${RED}"/><path d="M-11 -3 Q0 -1 11 -3" stroke="#fff" stroke-width="1"/>${person(-1, -2, C.yellow, 1, 0.8)}<path d="M-6 -6 L4 2" stroke="${C.woodL}" stroke-width="1.1"/></g></g>`,
    );
    return (
      back +
      firL +
      basin(50, 18, LAKE.rim) +
      basin(45, 15, LAKE.deep) +
      `<ellipse cx="${lx - 4}" cy="${ly - 2}" rx="38" ry="11" fill="${LAKE.water}"/>` +
      reflect +
      [0, 1].map((i) => `<path class="water" style="animation-delay:-${i * 1.2}s" d="M${lx - 30 + i * 18} ${ly - 4 + i * 7} q12 -3 24 0" stroke="#fff" stroke-width="1.4" fill="none" stroke-dasharray="6 10" stroke-linecap="round" opacity=".8"/>`).join("") +
      `<path d="M${X(24)} ${ly + 1} L${X(46)} ${ly + 4}" stroke="${C.woodL}" stroke-width="4" stroke-linecap="round"/><path d="M${X(24)} ${ly + 2.6} L${X(46)} ${ly + 5.6}" stroke="${C.wood}" stroke-width="1.2"/>` +
      [28, 36, 44].map((d) => `<rect x="${X(d) - 1}" y="${ly + 2 + (d - 24) * 0.14}" width="2" height="5" fill="${C.wood}"/>`).join("") +
      boat +
      rocks +
      edelweiss(X(-28), c.y + 6, 0.9) +
      birdV(X(10), c.y - 74, 1, true, 0.6)
    );
  },
});

// ---------------------------------------------------------------- snowy summit with a flag

const summit = definePiece({
  id: "bergen-summit",
  biome: "bergen",
  w: 108,
  h: 102,
  render: (c, X) => {
    const px = X(-4);
    const py = c.y - 2;
    const A: Pt = [r1(px - 4.6), r1(py - 84)];
    const mountain = peak(X(-34), c.y - 14, 22, 50, 0.4, FAR) + peak(px, py, 46, 84, c.stage === 0 ? 0.32 : 0.42);
    // Zig-zag trail up the lit face.
    const trail = (n: number) => {
      const pts: Pt[] = [[px - 30, py - 4], [px - 14, py - 18], [px - 28, py - 30], [px - 16, py - 44], [px - 22, py - 56], [px - 12, py - 68], [A[0] - 1, A[1] + 4]].slice(0, n) as Pt[];
      return `<path d="M${pts.map((p) => p.join(" ")).join(" L")}" stroke="#E9E4F8" stroke-width="1.2" fill="none" stroke-dasharray="2.4 2" stroke-linecap="round"/>`;
    };
    const camp = tent(X(30), c.y + 4, 0.6, [C.orange, C.orangeD]);
    if (c.stage === 0) return mountain + stake(px - 30, py - 2) + place(X(30), c.y + 4, 1, `${sh(0, 0, 8, 2)}<rect x="-6" y="-5" width="12" height="5" rx="2.4" fill="${C.orange}"/><ellipse cx="-6" cy="-2.5" rx="1.4" ry="2.5" fill="${C.orangeD}"/>`) + plot(X(14), c.y + 6, 0.55);
    if (c.stage === 1) return mountain + trail(4) + camp + person(px - 30, py - 34, RED, 0, 0.7) + person(px - 22, py - 30, "#3F6FD0", 1, 0.7) + `<path d="M${px - 30} ${py - 42} Q${px - 26} ${py - 36} ${px - 22} ${py - 38}" stroke="${C.yellow}" stroke-width=".7" fill="none"/>`;
    const glints = [[-12, 66, 0], [6, 60, 0.7], [-18, 52, 1.3]].map(([dx, dy, d]) => sparkle(px + dx, py - dy, d)).join("");
    return (
      mountain +
      trail(7) +
      swissFlag(A[0], A[1] + 1, 16, true) +
      person(A[0] - 3, A[1] + 13, RED, 0, 0.7) +
      `<path d="M${A[0] - 5} ${A[1] + 6} l-2 -3.4 M${A[0] - 1} ${A[1] + 6} l2 -3.4" stroke="${RED}" stroke-width="1.1" stroke-linecap="round"/>` +
      glints +
      camp +
      place(X(30) - 12, c.y + 4, 1, `<rect x="-.5" y="-9" width="1" height="9" fill="${C.woodD}"/><rect x="-2" y="-12" width="4" height="4.6" rx="1" fill="${C.yellowL}"/>`) +
      glow(X(30) - 12, c.y - 6, 9) +
      edelweiss(X(44), c.y + 6, 0.8) +
      anim(X(36), c.y - 70, "bob", `<path d="M-9 0 Q-4 -4 0 -1 Q4 -4 9 0 Q4 -2 0 1 Q-4 -2 -9 0Z" fill="#5E3B26"/><circle cx="0" cy="-.6" r="1.2" fill="#E9D6AE"/>`)
    );
  },
});

// ---------------------------------------------------------------- stone bridge over a creek

const CREEK = { water: "#7FC6EE", hi: "#BEE3FA", bank: "#9ACD8A" };

/** Stone arch bridge (unmirrored), centre baseline (x, y): front face with an arch, parapet, side. */
function stoneBridge(x: number, y: number, done: boolean) {
  const w = 44;
  const top = -26;
  const arch = `M-15 0 L-15 -8 Q-15 -20 0 -20 Q15 -20 15 -8 L15 0Z`;
  if (!done)
    return place(
      x,
      y,
      1,
      `${block(-w, 0, 18, 18, 6, STONE.front, STONE.side, STONE.top)}${block(w - 18, 0, 18, 18, 6, STONE.front, STONE.side, STONE.top)}` +
        `<path d="M-26 -8 Q-26 -24 0 -24 Q26 -24 26 -8" stroke="${C.woodL}" stroke-width="2.4" fill="none"/><path d="M-20 -8 V-20 M-10 -8 V-23 M0 -8 V-24 M10 -8 V-23 M20 -8 V-20 M-26 -8 H26" stroke="${C.woodL}" stroke-width="1.4"/>` +
        `<path d="M-26 -8 Q-26 -24 -12 -24 L-12 -20 Q-22 -20 -22 -8Z" fill="${STONE.front}"/>`,
    );
  const joints =
    `<path d="M${-w} -8 H-18 M18 -8 H${w} M${-w} -16 H-14 M14 -16 H${w} M-34 0 V-8 M-26 -8 V-16 M28 0 V-8 M34 -8 V-16 M-30 -16 V${top + 2} M-6 ${top + 2} V-20 M10 ${top + 2} V-20 M30 -16 V${top + 2}" stroke="${STONE.joint}" stroke-width=".8" opacity=".9"/>` +
    // Voussoirs around the arch.
    [-60, -30, 0, 30, 60].map((a) => `<path d="M0 -8 m${r1(Math.sin((a * Math.PI) / 180) * 15)} ${r1(-Math.cos((a * Math.PI) / 180) * 12)} l${r1(Math.sin((a * Math.PI) / 180) * 4)} ${r1(-Math.cos((a * Math.PI) / 180) * 4)}" stroke="${STONE.joint}" stroke-width=".9"/>`).join("");
  return place(
    x,
    y,
    1,
    `<path d="M${w} 0 L${w + 7} -2 L${w + 7} ${top - 2} L${w} ${top}Z" fill="${STONE.side}"/>` +
      `<path d="M${-w} 0 L${-w} ${top} L${w} ${top} L${w} 0Z ${arch}" fill="${STONE.front}" fill-rule="evenodd"/>` +
      // Intrados (underside of the arch), shaded.
      `<path d="M8 -19 Q15 -18 15 -8 L15 0 L11 0 L11 -8 Q11 -15 6 -17Z" fill="${STONE.side}"/>` +
      joints +
      `<path d="M${-w - 2} ${top} L${w + 2} ${top} L${w + 9} ${top - 3} L${-w + 5} ${top - 3}Z" fill="${STONE.top}"/><rect x="${-w - 2}" y="${top - 0.6}" width="${2 * w + 4}" height="2.4" fill="${STONE.side}"/>` +
      `<path d="M${-w} ${top + 3} H${w}" stroke="#fff" stroke-width="1" opacity=".5"/>` +
      `<path d="M${-w} 0 Q${-w + 6} -3 ${-w + 12} 0Z M${w - 14} 0 Q${w - 8} -4 ${w} 0Z" fill="${C.greenM}"/>`,
  );
}

const bridge = definePiece({
  id: "bergen-bridge",
  biome: "bergen",
  w: 108,
  h: 90,
  render: (c, X) => {
    const bx = c.x - 2;
    const by = c.y - 18;
    const water = c.stage === 0 ? "#A5D3EE" : CREEK.water;
    // The creek runs from the back (top) towards the viewer, under the bridge.
    const creek =
      `<path d="M${bx - 6} ${c.y - 64} Q${bx + 6} ${c.y - 48} ${bx - 4} ${c.y - 30} Q${bx - 16} ${c.y - 12} ${bx - 8} ${c.y + 8} L${bx + 24} ${c.y + 8} Q${bx + 12} ${c.y - 12} ${bx + 14} ${c.y - 30} Q${bx + 20} ${c.y - 48} ${bx + 6} ${c.y - 64}Z" fill="${CREEK.bank}"/>` +
      `<path d="M${bx - 3} ${c.y - 62} Q${bx + 8} ${c.y - 48} ${bx} ${c.y - 30} Q${bx - 12} ${c.y - 12} ${bx - 4} ${c.y + 6} L${bx + 19} ${c.y + 6} Q${bx + 8} ${c.y - 12} ${bx + 10} ${c.y - 30} Q${bx + 16} ${c.y - 48} ${bx + 3} ${c.y - 62}Z" fill="${water}"/>` +
      `<path d="M${bx + 1} ${c.y - 56} Q${bx + 6} ${c.y - 46} ${bx + 2} ${c.y - 36} M${bx} ${c.y - 6} Q${bx - 2} ${c.y} ${bx + 2} ${c.y + 5}" stroke="${CREEK.hi}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    const back = peak(X(-30), c.y - 54, 22, 34, 0.45, FAR) + peak(X(26), c.y - 56, 18, 28, 0.4, FAR);
    const banks = boulder(X(-26), c.y + 4, 0.6) + boulder(X(30), c.y + 6, 0.5);
    const firB = fir(fit(c, X(-40), 22, 26), c.y - 26, 0.6, true);
    if (c.stage === 0)
      return (
        back +
        creek +
        [[-2, -20], [8, -14], [2, -8]].map(([dx, dy]) => `<ellipse cx="${bx + dx}" cy="${c.y + dy}" rx="3.4" ry="1.8" fill="${STONE.front}"/>`).join("") +
        place(X(-34), c.y - 4, 1, `${sh(1, 0, 10, 2)}${block(-8, 0, 6, 4, 3, STONE.front, STONE.side, STONE.top)}${block(-1, 0, 6, 4, 3, STONE.front, STONE.side, STONE.top)}${block(-5, -4, 6, 4, 3, STONE.front, STONE.side, STONE.top)}`) +
        plot(X(32), c.y - 4, 0.55) +
        banks
      );
    if (c.stage === 1)
      return back + firB + creek + stoneBridge(bx, by, false) + banks + person(X(36), c.y - 2, C.orange, 1) + place(X(36), c.y - 2, 1, `<rect x="2" y="-12" width="5" height="4" fill="${STONE.front}"/>`);
    const rapids = [0, 1, 2].map((i) => `<path class="water" style="animation-delay:-${r1(i * 0.7)}s" d="M${bx + 2 + i * 3} ${c.y - 14 + i * 7} q-4 6 -2 12" stroke="#fff" stroke-width="1.3" fill="none" stroke-dasharray="4 7" stroke-linecap="round" opacity=".9"/>`).join("") +
      `<path class="water" d="M${bx + 3} ${c.y - 58} q4 8 0 16" stroke="#fff" stroke-width="1.2" fill="none" stroke-dasharray="4 7" stroke-linecap="round" opacity=".8"/>`;
    const hiker = anim(bx - c.side * 6, by - 26, "drift", `${person(0, 0, RED, 2, 0.85)}<rect x="${c.side === 1 ? -5.6 : 2.6}" y="-11" width="3" height="5" rx="1" fill="${C.woodD}"/>`);
    return back + firB + creek + rapids + stoneBridge(bx, by, true) + hiker + banks + edelweiss(X(44), c.y + 6, 0.8) + birdV(X(30), c.y - 72, 1, true, 0.4);
  },
});

// ---------------------------------------------------------------- mountain hut with a sledge

const HUT = { stone: "#B8B2D6", stoneS: "#908AB8", wood: "#A8723F", woodS: "#7E5232", roof: "#F4F1FF", roofS: "#D3DDF0" };

/** Mountain hut (unmirrored), front-left corner at (x, y): stone ground floor, timber upper, snowy roof. */
function hut(x: number, y: number, stage: 1 | 2) {
  const w = 40;
  const d = 14;
  const k = d * 0.22;
  const base =
    block(0, 0, w, 14, d, HUT.stone, HUT.stoneS) +
    `<path d="M3 -4 h6 M14 -9 h7 M26 -4 h6 M5 -11 h5 M30 -10 h6 M${w + 3} -5 l5 -1 M${w + 6} -10 l5 -1" stroke="#9C96C2" stroke-width="1.2" stroke-linecap="round"/>`;
  if (stage === 1) return place(x, y, 1, `${sh(16, 0, 26, 5)}${base}${scaffold(-2, 0, w + 4, 30)}<path d="M2 -14 V-24 M14 -14 V-24 M${w + 2} -14 V-24" stroke="${C.woodL}" stroke-width="2"/>`);
  const shutter = (sx: number) => `<rect x="${sx - 3}" y="-24" width="2.4" height="7" fill="${RED}"/><rect x="${sx + 6.6}" y="-24" width="2.4" height="7" fill="${RED}"/><path d="M${sx - 3} -22 l2.4 2 M${sx + 6.6} -22 l2.4 2" stroke="#fff" stroke-width=".7"/>`;
  const roofY = -30;
  return (
    place(
      x,
      y,
      1,
      `${sh(18, 0, 28, 6)}${base}` +
        block(0, -14, w, 16, d, HUT.wood, HUT.woodS) +
        `<path d="M0 -18 H${w} M0 -22 H${w} M0 -26 H${w} M${w} -18 L${w + d} ${-18 - k} M${w} -22 L${w + d} ${-22 - k} M${w} -26 L${w + d} ${-26 - k}" stroke="${HUT.woodS}" stroke-width=".8" opacity=".6"/>` +
        // Gable on the side wall, then the front roof plane (snow) with its eave.
        `<path d="M${w} ${roofY} L${w + d} ${roofY - k} L${w + d / 2} ${roofY - k / 2 - 11}Z" fill="${HUT.woodS}"/>` +
        `<path d="M-4 ${roofY + 1} L${w + 3} ${roofY + 1} L${w + d / 2 + 2} ${roofY - k / 2 - 12} L${d / 2 - 5} ${roofY - k / 2 - 12}Z" fill="${HUT.roof}"/>` +
        `<path d="M${w + 3} ${roofY + 1} L${w + d / 2 + 2} ${roofY - k / 2 - 12} L${w + d + 3} ${roofY - k + 0.6}Z" fill="${HUT.roofS}"/>` +
        `<path d="M-4 ${roofY + 1} H${w + 3}" stroke="#C9C3E3" stroke-width="2"/><path d="M0 ${roofY + 2.4} q1 3 2 0 M8 ${roofY + 2.4} q1 4 2 0 M20 ${roofY + 2.4} q1 3 2 0 M32 ${roofY + 2.4} q1 3.6 2 0" stroke="#EAF6FF" stroke-width="1.2" fill="none"/>` +
        `<path d="M${d / 2 - 3} ${roofY - k / 2 - 11} L${w + d / 2} ${roofY - k / 2 - 11}" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>` +
        `<rect x="${w - 8}" y="${roofY - 20}" width="6" height="10" fill="${HUT.stoneS}"/><rect x="${w - 9}" y="${roofY - 21}" width="8" height="2" fill="${HUT.stone}"/>` +
        smokePuffs(w - 5, roofY - 24, 3.2) +
        shutter(8) +
        win(8, -24, 6, 7) +
        shutter(26) +
        win(26, -24, 6, 7) +
        `<g transform="skewY(-12.4)">${win(w + 4, -22 + 0, 5, 6)}</g>` +
        `<path d="M17 0 V-9 Q20 -12 23 -9 V0Z" fill="${C.woodD}"/><path d="M15 0 h10 l-1.4 2 h-7.2Z" fill="${HUT.stoneS}"/>`,
    ) +
    glow(x + 11, y - 20.5, 9) +
    glow(x + 29, y - 20.5, 9)
  );
}

/** Wooden Davos sledge (side view, unmirrored), `lean` = leaning upright against a wall. */
const sledge = (lean: boolean) =>
  lean
    ? `<g transform="rotate(-72)"><path d="M0 0 H16 Q20 0 20 -4" stroke="${C.woodD}" stroke-width="1.4" fill="none" stroke-linecap="round"/><rect x="2" y="-5" width="14" height="2" rx=".6" fill="${C.woodL}"/><path d="M4 -3 V0 M14 -3 V0" stroke="${C.woodD}" stroke-width="1.2"/></g>`
    : `<path d="M-9 0 H7 Q11 0 11 -4" stroke="${C.woodD}" stroke-width="1.4" fill="none" stroke-linecap="round"/><rect x="-8" y="-5" width="14" height="2" rx=".6" fill="${C.woodL}"/><path d="M-6 -3 V0 M4 -3 V0" stroke="${C.woodD}" stroke-width="1.2"/>`;

/** A child on a sledge, sledging towards +x. */
const sledger = (k: number, scarf: string) =>
  `${sledge(false)}<path d="M-4 -5 L-4 -11 Q-1 -13 2 -11 L2 -5Z" fill="#3F6FD0"/><path d="M2 -6 L6 -4" stroke="#3F6FD0" stroke-width="1.6" stroke-linecap="round"/><path d="M-1 -11.6 L-6 -10" stroke="${scarf}" stroke-width="1.6" stroke-linecap="round"/>` +
  `<circle cx="-1" cy="-14" r="2.6" fill="${["#F2C29B", "#D9A06E"][k % 2]}"/><path d="M-3.6 -14.4 Q-1 -18.6 1.6 -14.4Z" fill="${scarf}"/><circle cx="-1" cy="-17.6" r="1" fill="#fff"/>`;

const mountainHut = definePiece({
  id: "bergen-hut",
  biome: "bergen",
  w: 108,
  h: 90,
  render: (c, X) => {
    const hx = (c.side === 1 ? c.x - 52 : c.x - 6) + 2;
    const hy = c.y - 16;
    // Snow slope on the road side, falling towards the road.
    const sx0 = X(4);
    const sx1 = X(52);
    const slope = `<path d="M${sx0} ${c.y + 6} Q${X(10)} ${c.y - 26} ${X(22)} ${c.y - 22} Q${X(40)} ${c.y - 8} ${sx1} ${c.y + 6}Z" fill="${SNOW.lit}"/><path d="M${X(22)} ${c.y - 22} Q${X(40)} ${c.y - 8} ${sx1} ${c.y + 6} L${X(30)} ${c.y + 6} Q${X(30)} ${c.y - 8} ${X(22)} ${c.y - 22}Z" fill="${c.side === 1 ? SNOW.shade : "#EAF0FA"}"/>`;
    const back = fir(fit(c, X(-30), 22, 26), c.y - 54, 0.55, true) + fir(fit(c, X(-14), 22, 26), c.y - 60, 0.5, true);
    if (c.stage === 0)
      return back + snowPatch(X(-24), c.y - 10, 1) + place(hx + 26, hy - 2, 1, `${sh(1, 0, 10, 2)}${block(-8, 0, 7, 5, 3, HUT.stone, HUT.stoneS, "#D9D3EC")}${block(0, 0, 7, 5, 3, HUT.stone, HUT.stoneS, "#D9D3EC")}`) + logPile(X(30), c.y - 2, 0.8) + plot(X(-2), c.y + 2, 0.7);
    if (c.stage === 1) return back + hut(hx, hy, 1) + logPile(X(-36) + (c.side === 1 ? 6 : 0), c.y + 4, 0.7) + person(X(30), c.y + 4, C.orange, 0) + snowPatch(X(6), c.y + 2, 0.6);
    // Sledging down the slope: a group rotated along the slope, sliding on its x axis.
    const ang = c.side === 1 ? 28 : -28;
    const kid = `<g transform="translate(${X(22)} ${c.y - 12}) rotate(${ang})"><g class="slide"><g transform="scale(${c.side} 1)">${sledger(0, RED)}</g></g></g>`;
    return (
      back +
      slope +
      hut(hx, hy, 2) +
      place(hx + 6, hy + 1, 1, sledge(true)) +
      swissFlag(hx - 1, hy - 28, 14, true) +
      logPile(hx + 46, hy + 6, 0.6) +
      kid +
      edelweiss(X(-8), c.y + 8, 0.8)
    );
  },
});

// ---------------------------------------------------------------- tunnel with a red train

const RHB = { red: "#D7263D", redD: "#A81C30", roof: "#6E6A8F" };

/** Red Rhaetian railcar facing +x, rear at x = 0 (unmirrored, 20px long, 16px tall incl. pantograph). */
const redTrain = () => {
  const car = (x0: number, w: number, nose: boolean) =>
    `<path d="M${x0} 0 V-9 Q${x0} -11 ${x0 + 2} -11 H${x0 + w - (nose ? 4 : 2)} Q${x0 + w} -11 ${x0 + w} ${nose ? -7 : -9} V0Z" fill="${RHB.red}"/>` +
    `<rect x="${x0}" y="-2.4" width="${w}" height="2.4" fill="${RHB.redD}"/><rect x="${x0 + 1}" y="-12.2" width="${w - 2}" height="1.6" rx=".8" fill="${RHB.roof}"/>` +
    Array.from({ length: Math.floor((w - 3) / 4) }, (_, i) => win(x0 + 1.6 + i * 4, -9, 2.8, 3, false, 0.6)).join("") +
    `<path d="M${x0 + 0.6} -10 H${x0 + w - 2}" stroke="#fff" stroke-width=".6" opacity=".55"/>`;
  return (
    `<ellipse cx="10" cy="1" rx="10" ry="1.6" fill="${C.shadow}" opacity=".18"/>` +
    car(0, 20, true) +
    `<path d="M7 -12.2 L10 -15 L13 -12.2 M8.5 -15 H11.5" stroke="#3A3266" stroke-width=".7" fill="none"/>` +
    `<circle cx="19.6" cy="-3.6" r=".9" fill="${C.yellowL}"/>` +
    [3, 7.4, 12.6, 17].map((wx) => `<circle cx="${wx}" cy=".4" r="1.2" fill="#3A3266"/>`).join("")
  );
};

const tunnel = definePiece({
  id: "bergen-tunnel",
  biome: "bergen",
  w: 108,
  h: 98,
  render: (c, X) => {
    const ty = c.y - 28; // rail height
    const mL = (col = ROCK) => peak(c.x - 34, c.y + 2, 22, 82, 0.34, col);
    const mR = (col = ROCK) => peak(c.x + 34, c.y + 2, 22, 64, 0.3, col);
    const far = peak(c.x + 2, c.y - 30, 26, 64, 0.5, FAR);
    // Rock shoulders at the feet of the peaks: they hold the tunnel mouths and fully cover the rail band
    // (y = ty−19 … ground) from the mouths out to ±54, so the train is hidden at both ends of its run.
    const shoulders =
      `<path d="${mp("M-54 4 L-54 -36 Q-53 -47 -44 -47 L-38 -47 Q-31 -47 -31 -40 L-31 4Z", (d) => r1(c.x + d), c.y)}" fill="${ROCK.lit}"/>` +
      `<path d="${mp("M-38 -47 Q-31 -47 -31 -40 L-31 4 L-36 4 L-36 -36 Q-36 -44 -38 -47Z", (d) => r1(c.x + d), c.y)}" fill="${ROCK.shade}"/>` +
      `<path d="${mp("M31 4 L31 -40 Q31 -47 38 -47 L44 -47 Q53 -47 54 -36 L54 4Z", (d) => r1(c.x + d), c.y)}" fill="${ROCK.lit}"/>` +
      `<path d="${mp("M46 -47 Q53 -47 54 -36 L54 4 L46 4 L47 -20 L45 -36Z", (d) => r1(c.x + d), c.y)}" fill="${ROCK.shade}"/>` +
      `<path d="${mp("M-52 -36 Q-51 -45 -44 -45 M31 -40 Q32 -45 38 -45", (d) => r1(c.x + d), c.y)}" stroke="${ROCK.hi}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      `<path d="${mp("M-48 -10 L-44 -18 L-45 -26 M-40 -6 L-42 -14 M38 -8 L41 -16 L40 -24 M48 -12 L46 -20", (d) => r1(c.x + d), c.y)}" stroke="${ROCK.shade}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".7"/>`;
    // Portals: dark mouths on the facing flanks, with a stone ring.
    const mouth = (x: number) => `<path d="M${x - 7} ${ty + 1} V${ty - 11} Q${x - 7} ${ty - 18} ${x} ${ty - 18} Q${x + 7} ${ty - 18} ${x + 7} ${ty - 11} V${ty + 1}Z" fill="#2B2442"/>`;
    const ring = (x: number) =>
      `<path d="M${x - 9.6} ${ty + 1} V${ty - 11} Q${x - 9.6} ${ty - 20.6} ${x} ${ty - 20.6} Q${x + 9.6} ${ty - 20.6} ${x + 9.6} ${ty - 11} V${ty + 1} H${x + 7} V${ty - 11} Q${x + 7} ${ty - 18} ${x} ${ty - 18} Q${x - 7} ${ty - 18} ${x - 7} ${ty - 11} V${ty + 1}Z" fill="${STONE.front}"/>` +
      `<path d="M${x - 9.6} ${ty - 20.6} H${x + 9.6}" stroke="${STONE.top}" stroke-width="2"/><path d="M${x + 7} ${ty + 1} V${ty - 11} Q${x + 7} ${ty - 18} ${x} ${ty - 18}" stroke="${STONE.side}" stroke-width="1.6" fill="none"/>`;
    const pL = c.x - 18;
    const pR = c.x + 18;
    // Stone viaduct between the mouths.
    const viaduct =
      `<path d="M${pL - 4} ${ty + 1} H${pR + 4}" stroke="${STONE.side}" stroke-width="3"/>` +
      `<path d="M${pL} ${ty + 2} H${pR} V${c.y + 4} H${pR - 6} V${ty + 12} Q${pR - 6} ${ty + 6} ${c.x + 6} ${ty + 6} Q${c.x + 1} ${ty + 6} ${c.x + 1} ${ty + 12} V${c.y + 4} H${c.x - 3} V${ty + 12} Q${c.x - 3} ${ty + 6} ${c.x - 8} ${ty + 6} Q${pL + 6} ${ty + 6} ${pL + 6} ${ty + 12} V${c.y + 4} H${pL}Z" fill="${STONE.front}"/>` +
      `<path d="M${pL} ${ty + 2} H${pR}" stroke="${STONE.top}" stroke-width="1.4"/><path d="M${pL - 4} ${ty - 0.4} H${pR + 4}" stroke="#5A5478" stroke-width="1.2"/>` +
      Array.from({ length: 9 }, (_, i) => `<path d="M${pL - 2 + i * 5} ${ty + 1.2} v-1.6" stroke="${C.woodD}" stroke-width="1.6"/>`).join("");
    const valley = `<path d="M${pL - 4} ${c.y + 6} Q${c.x} ${c.y - 2} ${pR + 4} ${c.y + 6}Z" fill="${MEADOW.shade}"/><path d="M${c.x - 4} ${c.y + 6} Q${c.x} ${c.y + 1} ${c.x + 6} ${c.y + 6}" stroke="${CREEK.water}" stroke-width="2.6" fill="none"/>`;
    if (c.stage === 0)
      return far + mL() + mR() + shoulders + valley + stake(pL - 2, ty + 4) + stake(pR + 2, ty + 6) + place(c.x - 2, c.y + 4, 1, `${sh(1, 0, 12, 2)}<path d="M-12 -2 H12 M-12 -4.6 H12" stroke="#8C82B5" stroke-width="1.4"/><path d="M-9 -5.6 v4 M-3 -5.6 v4 M3 -5.6 v4 M9 -5.6 v4" stroke="${C.woodL}" stroke-width="1.6"/>`) + plot(X(26), c.y + 4, 0.5);
    if (c.stage === 1)
      return (
        far +
        mL() +
        mR() +
        shoulders +
        valley +
        mouth(pL - 6) +
        ring(pL - 6) +
        `<path d="M${pR + 2} ${ty + 1} V${ty - 14} M${pR + 12} ${ty + 1} V${ty - 14} M${pR} ${ty - 14} H${pR + 14}" stroke="${C.woodL}" stroke-width="2"/>` +
        `<rect x="${pL - 2}" y="${ty + 2}" width="7" height="${c.y - ty + 2}" fill="${STONE.front}"/><rect x="${c.x - 3}" y="${ty + 8}" width="4" height="${c.y - ty - 4}" fill="${STONE.front}"/>` +
        scaffold(c.x + 4, c.y + 4, 14, c.y - ty + 2) +
        person(X(36), c.y + 6, C.orange, 2) +
        place(X(36) + 8, c.y + 6, 1, `${sh(0, 0, 6, 1.6)}<path d="M-5 0 L-6 -6 H6 L5 0Z" fill="#6E6A8F"/><path d="M-6 -6 L6 -6" stroke="#9A96B8" stroke-width="1.2"/>`)
      );
    // The train runs left to right (rear from c.x−52 to c.x+32, `.train` = ±42px around c.x−10); the
    // mountains and shoulders are drawn again on top, so at both ends it is fully inside a tunnel.
    const train = `<g transform="translate(${c.x - 10} ${ty - 1})"><g class="train">${redTrain()}</g></g>`;
    // The train is in shadow inside the mouths.
    const dim = (x: number) => mouth(x).replace('fill="#2B2442"', 'fill="#2B2442" opacity=".45"');
    return (
      far +
      mL() +
      mR() +
      shoulders +
      valley +
      viaduct +
      mouth(pL - 6) +
      mouth(pR + 6) +
      train +
      mL() +
      mR() +
      shoulders +
      dim(pL - 6) +
      dim(pR + 6) +
      ring(pL - 6) +
      ring(pR + 6) +
      `<g transform="translate(${X(14)} ${c.y + 6})">${edelweiss(0, 0, 0.8)}</g>` +
      birdV(c.x - 4, c.y - 84, 1, true, 0.2)
    );
  },
});

export const bergen: WorldBiome = {
  id: "bergen",
  ground: ["#CFEBC6", "#E6EEF5"],
  patch: "#F4FAFF",
  bannerBg: ["#4D7FE0", "#3560B8"],
  density: 0.5,
  flora: [
    { weight: 3, radius: 20, render: (x, y, r, s) => fir(x, y, 0.7 * s, r() < 0.4) },
    { weight: 1.5, radius: 14, render: (x, y, _r, s) => boulder(x, y, 0.8 * s) },
    { weight: 1.2, radius: 8, render: (x, y, _r, s) => edelweiss(x, y, s) },
    { weight: 1.2, radius: 22, render: (x, y, _r, s) => snowPatch(x, y, 0.9 * s) },
  ],
  pieces: [chalet, cablecar, pasture, lake, summit, bridge, mountainHut, tunnel],
};
