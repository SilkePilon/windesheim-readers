import {
  C,
  anim,
  block,
  bollard,
  building,
  crane,
  crate,
  definePiece,
  duneGrass,
  facing,
  fit,
  glow,
  gull,
  house,
  ladder,
  mp,
  person,
  place,
  planks,
  plot,
  r1,
  rock,
  scaffold,
  sh,
  tree,
  tuft,
  win,
  type WorldBiome,
} from "../kit";

const STONE: [string, string] = ["#9C98B8", "#CFCBE3"];

/** Striped tower, tapering from 24 to 15 wide over `h`; `bands` red bands. Lit left, shade right. */
function tower(x: number, y: number, h: number, full: boolean) {
  const at = (t: number) => ({ l: x - 12 + 4.5 * t, r: x + 12 - 4.5 * t, y: y - h * t });
  const quad = (t0: number, t1: number, fill: string, shade: string) => {
    const a = at(t0);
    const b = at(t1);
    const ma = r1((a.l + a.r) / 2 + 3);
    const mb = r1((b.l + b.r) / 2 + 3);
    return (
      `<path d="M${r1(a.l)} ${r1(a.y)} L${r1(a.r)} ${r1(a.y)} L${r1(b.r)} ${r1(b.y)} L${r1(b.l)} ${r1(b.y)}Z" fill="${fill}"/>` +
      `<path d="M${ma} ${r1(a.y)} L${r1(a.r)} ${r1(a.y)} L${r1(b.r)} ${r1(b.y)} L${mb} ${r1(b.y)}Z" fill="${shade}"/>`
    );
  };
  const bands = full ? 4 : 2;
  let out = "";
  for (let i = 0; i < bands; i++) {
    const t0 = i / 4;
    const t1 = (i + 1) / 4;
    out += i % 2 ? quad(t0, t1, "#fff", "#E2DDF0") : quad(t0, t1, "#F0506E", "#C8385A");
  }
  return out;
}

/** Lighthouse on the rocks, with the keeper's cottage and a gull. */
const lighthouse = definePiece({
  id: "haven-lighthouse",
  biome: "haven",
  w: 100,
  h: 96,
  render: (c, X) => {
    const tx = X(-14);
    const rocks = `${rock(X(-30), c.y + 2, 1.3, STONE)}${rock(tx + 10, c.y + 4, 1.1, STONE)}${duneGrass(X(30), c.y + 6, 0.8)}`;
    const H = 62;
    if (c.stage === 0) return `${sh(tx, c.y, 22, 5)}<ellipse cx="${tx}" cy="${c.y - 2}" rx="16" ry="5" fill="#CFCBE3"/>` + rocks + plot(X(22), c.y, 0.8);
    if (c.stage === 1)
      return (
        sh(tx, c.y, 22, 5) +
        tower(tx, c.y, H, false) +
        `<g>${scaffold(tx - 14, c.y, 28, 44)}</g>` +
        crane(c.side === 1 ? tx + 22 : tx - 22, c.y, 70, c.side === 1 ? -26 : 26) +
        rocks +
        crate(X(26), c.y + 4, 0.9)
      );
    const top = c.y - H;
    const lantern =
      `<rect x="${tx - 10}" y="${top - 3}" width="20" height="3" rx="1" fill="${C.ink}"/>` +
      `<rect x="${tx - 6}" y="${top - 13}" width="12" height="10" rx="1.5" fill="${C.yellowL}"/><rect x="${tx + 1}" y="${top - 13}" width="5" height="10" fill="${C.yellow}"/>` +
      `<path d="M${tx - 8} ${top - 13} Q${tx} ${top - 23} ${tx + 8} ${top - 13}Z" fill="#F0506E"/><path d="M${tx} ${top - 21} Q${tx + 6} ${top - 18} ${tx + 8} ${top - 13} L${tx + 1} ${top - 13}Z" fill="#C8385A"/>` +
      glow(tx, top - 8, 22) +
      `<g transform="translate(${tx} ${top - 8})"><g class="beam"><path d="M0 0 L34 -8 L34 8Z" fill="${C.yellowL}" opacity=".55"/></g></g>`;
    return (
      house(X(26), c.y + 2, 0.62, { roof: "#3F8FE0", roofD: "#2A6DB5", alive: true }) +
      sh(tx, c.y, 22, 5) +
      tower(tx, c.y, H, true) +
      `<rect x="${tx - 3}" y="${c.y - 11}" width="6" height="11" rx="2.5" fill="${C.wood}"/>` +
      lantern +
      rocks +
      gull(X(30), c.y - 46, 0.8, true)
    );
  },
});


const NAVY = "#3A3266";
const BLUE: [string, string] = ["#3F8FE0", "#2A6DB5"];
const RED: [string, string] = ["#F0506E", "#C8385A"];

/** Harbour water from `l` to `l + w`, `t` to `t + h` (absolute), with the far quay wall and coping. */
function basin(l: number, t: number, w: number, h: number, alive: boolean, round = 4) {
  const shimmer = alive
    ? `<path class="water" d="M${r1(l + 8)} ${r1(t + h * 0.45)} H${r1(l + w - 8)} M${r1(l + 16)} ${r1(t + h * 0.78)} H${r1(l + w - 14)}" stroke="#fff" stroke-width="1.6" stroke-dasharray="9 15" stroke-linecap="round" opacity=".8"/>`
    : `<path d="M${r1(l + 14)} ${r1(t + h * 0.5)} h14 M${r1(l + w * 0.6)} ${r1(t + h * 0.7)} h12" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>`;
  return (
    `<rect x="${r1(l)}" y="${r1(t - 5)}" width="${w}" height="${h + 5}" rx="${round + 2}" fill="#CFCBE3"/><rect x="${r1(l)}" y="${r1(t - 5)}" width="${w}" height="2" rx="1" fill="#ECE8F7"/>` +
    `<rect x="${r1(l + 2)}" y="${r1(t - 3)}" width="${w - 4}" height="4" fill="#8C82B5"/>` +
    `<rect x="${r1(l + 2)}" y="${r1(t + 1)}" width="${w - 4}" height="${h - 3}" rx="${round}" fill="${C.water}"/><rect x="${r1(l + 2)}" y="${r1(t + 1)}" width="${w - 4}" height="3" fill="#5F93D6" opacity=".45"/>` +
    `<rect x="${r1(l + 8)}" y="${r1(t + h * 0.3)}" width="${w - 30}" height="${r1(h * 0.28)}" rx="${r1(h * 0.14)}" fill="${C.waterL}" opacity=".7"/>` +
    shimmer
  );
}

/** Wooden mooring pile standing in the water. */
const pile = (x: number, y: number, h = 12) =>
  `<rect x="${r1(x - 1.6)}" y="${r1(y - h)}" width="3.2" height="${h}" rx="1" fill="${C.wood}"/><rect x="${r1(x + 0.2)}" y="${r1(y - h)}" width="1.4" height="${h}" fill="${C.woodD}"/><ellipse cx="${r1(x)}" cy="${r1(y)}" rx="3.4" ry="1" fill="#fff" opacity=".5"/>`;

/** A fluttering pennant on a thin pole (absolute pole foot). */
const pennant = (x: number, y: number, h: number, col: string, delay = 0) =>
  `<path d="M${r1(x)} ${r1(y)} V${r1(y - h)}" stroke="${C.ink}" stroke-width=".9"/><path class="flag"${delay ? ` style="animation-delay:${delay}s"` : ""} d="M${r1(x + 0.5)} ${r1(y - h)} L${r1(x + 8.5)} ${r1(y - h + 2.4)} L${r1(x + 0.5)} ${r1(y - h + 4.8)}Z" fill="${col}"/>`;

/** Blue plastic fish box with a few fish heads peeking out. */
const fishBox = (x: number, y: number, s = 1) =>
  place(
    x,
    y,
    s,
    `${sh(1, 0, 9, 2.6)}${block(-7, 0, 13, 5, 6, BLUE[0], BLUE[1], "#8EC5FF")}<ellipse cx="-3" cy="-6.2" rx="3" ry="1.2" fill="#C9D3E8"/><ellipse cx="2" cy="-6.6" rx="3" ry="1.2" fill="#E3E8F4"/><circle cx="-4.6" cy="-6.4" r=".5" fill="${C.ink}"/>`,
  );

/** Fishing cutter in profile, bow towards +x (mirror with `facing`); `done` false = bare hull. */
function cutter(hull: [string, string], done: boolean) {
  const body =
    `<path d="M-22 -7 L19 -7 Q24 -7 23 -4 L19 3 Q18 4 16 4 H-17 Q-20 4 -21 2Z" fill="${hull[0]}"/><path d="M-20.8 -1 H21.4 L19 3 Q18 4 16 4 H-17 Q-20 4 -21 2Z" fill="${hull[1]}"/>` +
    `<path d="M-20.4 1.6 H20.2 L19 3 Q18 4 16 4 H-17 Q-20 4 -20.6 2.6Z" fill="${RED[0]}"/><rect x="-22" y="-8.6" width="45" height="2" rx=".8" fill="#fff"/><path d="M9 -4.4 h7" stroke="#fff" stroke-width="1.4"/>`;
  if (!done) return body + `<path d="M5 -7 V-20 M-12 -7 V-16 M-12 -16 H5" stroke="${C.woodL}" stroke-width="1.4"/>`;
  return (
    `<path d="M5 -31 L-15 -12 M5 -31 L21 -14 M5 -31 L-21 -8" stroke="${C.ink}" stroke-width=".7" opacity=".8"/><path d="M-15 -12 Q-17 -7 -13 -6.6 M21 -14 Q23 -9 19.6 -8" stroke="${C.greenM}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
    `<rect x="4.2" y="-34" width="1.6" height="27" fill="${C.woodD}"/>` +
    `<path class="flag" d="M5.8 -34 L13 -32 L5.8 -30Z" fill="${RED[0]}"/>` +
    block(-13, -7, 11, 10, 4, "#fff", "#DCD6F0") +
    win(-11.4, -14.6, 3, 3.4, false, 0.6) +
    win(-6.8, -14.6, 3, 3.4, false, 0.6) +
    `<rect x="-14" y="-18.6" width="13.4" height="2" rx=".8" fill="${NAVY}"/>` +
    body
  );
}

/** Black tarred net shed with white trim and a red pantile roof (unmirrored). */
function netShed(x: number, y: number, done: boolean) {
  const walls = block(-14, 0, 20, 14, 14, "#4A4070", "#2E2850") + `<path d="M-14 -14 L-4 -24 L6 -14Z" fill="#4A4070"/>`;
  if (!done) return place(x, y, 1, `${sh(6, 0, 22, 5)}${block(-14, 0, 20, 7, 14, "#4A4070", "#2E2850")}${scaffold(-16, 0, 38, 26)}`);
  return (
    place(
      x,
      y,
      1,
      `${sh(6, 0, 24, 5)}${walls}<path d="M-14 -10 H6 M-14 -6 H6 M-14 -2 H6" stroke="#5A4E80" stroke-width=".6"/>` +
        `<path d="M-4 -24 L10 -27 L21 -17 L6 -14Z" fill="#E8546E"/><path d="M-4 -24 L-15.4 -13.2 L-13 -13.2 L-4 -21.6Z" fill="#C8385A"/><path d="M-4 -24 L10 -27" stroke="#fff" stroke-opacity=".4" stroke-width="1.4" stroke-linecap="round"/>` +
        `<path d="M-14 -14 L-4 -24 L6 -14" stroke="#fff" stroke-width="1.2" fill="none"/>` +
        `<rect x="-11" y="-11" width="7" height="11" fill="#fff"/><rect x="-10" y="-10" width="5" height="10" fill="#5A4E80"/>` +
        win(-1, -11, 5, 5, false, 0.6) +
        `<rect x="-1" y="-11" width="5" height="5" fill="none" stroke="#fff" stroke-width="1"/>` +
        `<path d="M10 -8.6 L12.6 -9.2 L12.6 -12.6 L10 -12" fill="#fff" opacity=".8"/>`,
    ) + glow(x + 1.5, y - 8.5, 10)
  );
}

/** Coiled mooring rope. */
const rope = (x: number, y: number) =>
  `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="5" ry="2" fill="none" stroke="${C.sandD}" stroke-width="1.6"/><ellipse cx="${r1(x)}" cy="${r1(y - 0.6)}" rx="3" ry="1.2" fill="none" stroke="#E2BC85" stroke-width="1.4"/>`;

/** Fishing boats at the quay: a net shed, bollards, fish boxes, two cutters rocking, gulls. */
const fishingQuay = definePiece({
  id: "haven-fishing",
  biome: "haven",
  w: 108,
  h: 72,
  below: 12,
  render: (c, X) => {
    const L = Math.min(X(-54), X(54));
    const water = (alive: boolean) => basin(L, c.y - 20, 108, 30, alive);
    const sx = fit(c, X(-28) - 4, 18, 37);
    const sy = c.y - 30;
    if (c.stage === 0) return water(false) + [X(-30), X(-6), X(18), X(40)].map((px, i) => pile(px, c.y - 4 + (i % 2) * 6)).join("") + plot(sx + 2, sy, 0.7) + fishBox(X(24), c.y - 30);
    if (c.stage === 1)
      return netShed(sx, sy, false) + water(false) + crate(X(14), c.y - 28, 0.8) + rope(X(30), c.y - 28) + facing(X(-6), c.y - 2, c.side, 0.9, cutter(BLUE, false)) + pile(X(36), c.y + 4);
    return (
      netShed(sx, sy, true) +
      fishBox(X(10), c.y - 27) +
      fishBox(X(18), c.y - 31, 0.9) +
      rope(X(-2), c.y - 26) +
      bollard(X(30), c.y - 23, 0.7) +
      bollard(X(-46), c.y - 23, 0.7) +
      water(true) +
      anim(X(-12), c.y - 4, "float", facing(0, 0, c.side, 0.9, cutter(BLUE, true))) +
      anim(X(28), c.y + 5, "float", facing(0, 0, -c.side as 1 | -1, 0.76, cutter(RED, true)), 1.1) +
      gull(X(36), c.y - 36, 0.8, true)
    );
  },
});

const BOX: [string, string, string][] = [
  ["#F0506E", "#C8385A", "#FF8FA6"],
  ["#3F8FE0", "#2A6DB5", "#8EC5FF"],
  ["#19C59B", "#0E9474", "#7BE8C2"],
  ["#FFC83D", "#D9A12A", "#FFE08A"],
  ["#8C66FF", "#6340D8", "#B9A6FF"],
];
/** Shipping container in 3/4 (local baseline at (x, y), 20×9). */
const container = (x: number, y: number, k: number) => {
  const b = BOX[k % BOX.length];
  return place(
    x,
    y,
    1,
    block(-10, 0, 20, 9, 8, b[0], b[1], b[2]) +
      `<path d="M-6.6 -8.4 V-.6 M-3.3 -8.4 V-.6 M0 -8.4 V-.6 M3.3 -8.4 V-.6 M6.6 -8.4 V-.6" stroke="${b[1]}" stroke-width=".7" opacity=".55"/><path d="M-10 -8.6 H10" stroke="#fff" stroke-opacity=".35" stroke-width=".8"/>`,
  );
};

/** Harbour crane (unmirrored portal; the jib reaches `dir`): orange legs, white machine house, lattice jib. */
function harbourCrane(x: number, y: number, dir: 1 | -1, stage: 1 | 2, load: number) {
  const legs =
    `<rect x="-17" y="-2.4" width="9" height="3.4" rx="1.2" fill="${NAVY}"/><rect x="8" y="-2.4" width="9" height="3.4" rx="1.2" fill="${NAVY}"/>` +
    `<path d="M-14 -1 L-8.4 -27 L-4.6 -27 L-9.6 -1Z" fill="${C.orange}"/><path d="M9.6 -1 L4.6 -27 L8.4 -27 L14 -1Z" fill="${C.orangeD}"/>` +
    `<path d="M-11.6 -4 L6 -22 M11.6 -4 L-6 -22" stroke="${C.orangeD}" stroke-width="1.2"/><rect x="-10" y="-29.6" width="20" height="3.4" fill="${C.orange}"/><rect x="2" y="-29.6" width="8" height="3.4" fill="${C.orangeD}"/>`;
  if (stage === 1) return place(x, y, 1, `${sh(2, 0, 20, 4)}${legs}${scaffold(-14, 0, 28, 40)}`);
  const px = dir * 3;
  const py = -40;
  const tx = dir * 44;
  const ty = -74;
  const n = 7;
  let lattice = "";
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const b = (i + 1) / n;
    lattice += `M${r1(px + (tx - px) * a)} ${r1(py + (ty - py) * a)} L${r1(px + (tx - px) * b + 2.4)} ${r1(py + (ty - py) * b + 2.6)} `;
  }
  const jib =
    `<path d="M${px} ${py} L${tx} ${ty} M${px + 2.4} ${py + 2.6} L${tx + 1.4} ${ty + 1.6}" stroke="${C.orange}" stroke-width="2" stroke-linecap="round"/><path d="${lattice.trim()}" stroke="${C.orangeD}" stroke-width=".9"/>` +
    `<path d="M${-dir * 2} -52 L${tx} ${ty} M${-dir * 2} -52 L${-dir * 2} -40" stroke="${C.ink}" stroke-width=".8"/>`;
  const hook = `<path d="M0 0 V22" stroke="${C.ink}" stroke-width=".8"/><rect x="-7" y="22" width="14" height="1.6" fill="${C.ink}"/><path d="M-6 23.6 L-8 26 M6 23.6 L8 26" stroke="${C.ink}" stroke-width=".7"/>${container(-4, 35, load)}`;
  return (
    place(
      x,
      y,
      1,
      `${sh(2, 0, 22, 4.5)}${legs}` +
        block(-dir * 15 - (dir === 1 ? 0 : 7), -29.6, 7, 6, 4, "#5A4E80", "#3A3266") +
        block(-8, -29.6, 14, 11, 7, "#fff", "#DCD6F0", "#F4F1FF") +
        win(-6, -38, 5, 4, false, 0.8) +
        `<rect x="-8" y="-33" width="14" height="1.6" fill="${C.orange}"/>` +
        jib,
    ) +
    glow(x - 3.5, y - 36, 10) +
    anim(x + tx, y + ty, "sway", hook)
  );
}

/** Harbour crane and containers: stacked boxes on the quay, the crane lifting one, a tug in the water. */
const craneQuay = definePiece({
  id: "haven-crane",
  biome: "haven",
  w: 108,
  h: 90,
  below: 12,
  render: (c, X) => {
    const L = Math.min(X(-54), X(54));
    const apron = `<rect x="${L}" y="${c.y - 50}" width="108" height="46" rx="6" fill="#E4E1EE"/><path d="M${L + 4} ${c.y - 46} H${L + 104}" stroke="#F4F1FF" stroke-width="1.4"/>`;
    const rails = `<path d="M${L + 2} ${c.y - 15} H${L + 106} M${L + 2} ${c.y - 10} H${L + 106}" stroke="#8C82B5" stroke-width="1.4"/>`;
    const water = basin(L, c.y - 2, 108, 12, c.stage === 2) + `<path d="M${L + 4} ${c.y - 7.6} H${L + 104}" stroke="${C.yellow}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
    const k = Math.floor(c.rng() * BOX.length);
    // Containers are unmirrored and reach 18px right of their anchor: shift them left when mirrored.
    const B = (d: number) => X(d) - (c.side === 1 ? 0 : 8);
    const back = container(B(10), c.y - 36, k + 1) + container(B(10), c.y - 45, k + 2);
    const stack = container(B(-40), c.y - 18, k) + container(B(-40), c.y - 27, k + 3) + container(B(-40), c.y - 36, k + 1);
    if (c.stage === 0) return apron + rails + water + plot(X(-4), c.y - 22, 0.7) + container(B(-40), c.y - 18, k);
    if (c.stage === 1) return apron + container(B(10), c.y - 36, k + 1) + rails + water + harbourCrane(X(-4), c.y - 12, c.side, 1, k) + container(B(-40), c.y - 18, k) + container(B(-40), c.y - 27, k + 3);
    const tug =
      `<path d="M-12 -3 H10 Q14 -3 13 -.6 Q11 2.4 7 2.4 H-9 Q-12 2 -12 -3Z" fill="${RED[0]}"/><path d="M-12 -.4 H12.6 Q11 2.4 7 2.4 H-9 Q-12 2 -12 -.4Z" fill="${NAVY}"/><rect x="-12" y="-4.2" width="25" height="1.6" rx=".8" fill="#fff"/>` +
      `<rect x="-6" y="-10" width="9" height="6" rx="1" fill="#fff"/><rect x="-4.6" y="-8.6" width="2.4" height="2" fill="${C.glass}"/><rect x="-1" y="-8.6" width="2.4" height="2" fill="${C.glass}"/><rect x="4" y="-13" width="3" height="9" fill="${NAVY}"/><rect x="4" y="-11" width="3" height="1.6" fill="${RED[0]}"/>`;
    return (
      apron +
      back +
      rails +
      water +
      harbourCrane(X(-4), c.y - 12, c.side, 2, k + 4) +
      stack +
      anim(X(30), c.y + 6, "float", facing(0, 0, -c.side as 1 | -1, 0.9, tug)) +
      [0, 1.3].map((d) => `<circle class="smoke" style="animation-delay:${d}s" cx="${r1(X(30) - c.side * 5)}" cy="${c.y - 7}" r="2.4" fill="#fff"/>`).join("") +
      gull(X(-30), c.y - 54, 0.8, true)
    );
  },
});

const HUTS: [string, string, string][] = [
  [RED[0], RED[1], "#FFB3C2"],
  [BLUE[0], BLUE[1], "#B9DBFF"],
  [C.yellow, "#D9A12A", "#FFF1B8"],
  [C.greenM, C.green, "#C3F2E1"],
];
/** Beach hut on short stilts (unmirrored 3/4): striped front, white gable trim; `done` false = frame. */
function hut(x: number, y: number, col: [string, string, string], done: boolean, flagged = false) {
  const stilts = `<rect x="-8" y="-3" width="1.6" height="3" fill="${C.wood}"/><rect x="6.4" y="-3" width="1.6" height="3" fill="${C.wood}"/><rect x="16" y="-5" width="1.4" height="3" fill="${C.woodD}"/>`;
  if (!done)
    return place(
      x,
      y,
      1,
      `${sh(6, 0, 14, 3.4)}${stilts}<rect x="-9" y="-4.4" width="18" height="1.6" fill="${C.woodL}"/><path d="M-8 -3 V-18 M8 -3 V-18 M17 -5 V-20 M-9 -18 L0 -25 L9 -18 M0 -25 L10 -27.2" stroke="${C.woodL}" stroke-width="1.4" fill="none"/>`,
    );
  let stripes = "";
  for (let i = 0; i < 4; i++) stripes += `<rect x="${-6.4 + i * 4}" y="-17" width="1.6" height="14" fill="#fff" opacity=".45"/>`;
  return place(
    x,
    y,
    1,
    `${sh(6, 0, 15, 3.6)}${stilts}${block(-8, -3, 16, 15, 10, col[0], col[1])}${stripes}` +
      `<path d="M-8 -18 L0 -24.6 L8 -18Z" fill="${col[0]}"/><path d="M0 -25.6 L10.4 -27.8 L19.4 -20.2 L9.4 -18Z" fill="#F4F1FF"/><path d="M0 -25.6 L10.4 -27.8" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>` +
      `<path d="M-9.6 -17.6 L0 -25.6 L9.6 -17.6" stroke="#fff" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="0" cy="-20.6" r="1.4" fill="${col[2]}"/>` +
      `<rect x="-3.4" y="-14.6" width="6.8" height="11.6" rx="1" fill="${col[2]}"/><circle cx="1.6" cy="-8.6" r=".6" fill="${C.ink}"/><rect x="-10" y="-4.4" width="20" height="1.6" fill="${C.woodL}"/>` +
      (flagged ? pennant(10, -27, 8, col[0]) : ""),
  );
}

/** Beach umbrella planted in the sand, striped. */
const umbrella = (x: number, y: number, a: [string, string]) =>
  place(
    x,
    y,
    1,
    `<ellipse cx="4" cy="1" rx="12" ry="3" fill="${C.shadow}" opacity=".12"/><rect x="-.7" y="-24" width="1.4" height="24" fill="${C.cream}" transform="rotate(8)"/>` +
      `<g transform="translate(-3.4 -23) rotate(8)"><path d="M-14 4 Q-12 -4 0 -6 Q12 -4 14 4Z" fill="${a[0]}"/><path d="M-4.6 4 Q-4 -3 0 -6 Q4 -3 4.6 4Z" fill="#fff"/><path d="M4.6 4 Q4 -3 0 -6 Q12 -4 14 4Z" fill="${a[1]}"/><circle cx="0" cy="-6.6" r="1" fill="${C.ink}"/></g>`,
  );

/** Striped windbreak on stakes with a towel in front. */
const windbreak = (x: number, y: number) =>
  place(
    x,
    y,
    1,
    `${sh(2, 0, 14, 2.6)}<path d="M-14 0 L-13 -10 L-4 -11 L-5 -1Z" fill="${C.pink}"/><path d="M-5 -1 L-4 -11 L5 -11.4 L4 -1.2Z" fill="#fff"/><path d="M4 -1.2 L5 -11.4 L14 -10 L13 0Z" fill="${C.pinkD}"/>` +
      `<path d="M-14 1 V-11 M-4.6 0 V-12 M4.6 0 V-12.4 M13.6 1 V-11" stroke="${C.woodL}" stroke-width="1.2"/><path d="M-10 6 L2 6 L4 2 L-8 2Z" fill="${C.greenM}"/><path d="M-8 4 H2" stroke="#fff" stroke-width=".8"/>`,
  );

/** Beach ball, bouncing when alive. */
const ball = (x: number, y: number, alive: boolean) =>
  anim(x, y, alive ? "bob" : "", `<circle r="3.6" fill="#fff"/><path d="M0 -3.6 A3.6 3.6 0 0 1 3.6 0 L0 0Z" fill="${RED[0]}"/><path d="M0 3.6 A3.6 3.6 0 0 1 -3.6 0 L0 0Z" fill="${BLUE[0]}"/><path d="M-3.6 0 A3.6 3.6 0 0 1 0 -3.6 L0 0Z" fill="${C.yellow}"/><circle cx="-1.2" cy="-1.4" r=".9" fill="#fff" opacity=".8"/>`, 0.3);

/** Beach huts: four striped huts in a row, an umbrella, a windbreak and a beach ball. */
const beachHuts = definePiece({
  id: "haven-huts",
  biome: "haven",
  w: 108,
  h: 80,
  below: 12,
  render: (c, X) => {
    const spots: [number, number][] = [[-44, -48], [-24, -38], [-4, -28], [16, -18]];
    const pos = spots.map(([d, dy]) => [X(d) - (c.side === 1 ? 0 : 14), c.y + dy] as const);
    if (c.stage === 0)
      return (
        pos.map(([hx, hy]) => `<path d="M${hx - 8} ${hy} V${hy - 6} M${hx + 8} ${hy} V${hy - 6}" stroke="${C.woodL}" stroke-width="1.6" stroke-linecap="round"/><path d="M${hx - 9} ${hy - 4} H${hx + 9}" stroke="${C.orange}" stroke-width=".9" stroke-dasharray="2 1.6"/>`).join("") +
        plot(X(34), c.y - 4, 0.7)
      );
    if (c.stage === 1) return pos.map(([hx, hy], i) => hut(hx, hy, HUTS[i], i < 2)).join("") + ladder(X(30), c.y + 2, X(18), c.y - 18) + planks(X(38), c.y + 4, 0.8);
    return (
      pos.map(([hx, hy], i) => hut(hx, hy, HUTS[i], true, i % 2 === 0)).join("") +
      umbrella(X(38), c.y - 32, [C.yellow, "#D9A12A"]) +
      windbreak(X(30), c.y + 4) +
      ball(X(46), c.y - 2, true) +
      duneGrass(X(-44), c.y + 4, 0.8) +
      gull(X(-6), c.y - 50, 0.8, true)
    );
  },
});

/** Sailing yacht in profile, bow towards +x; `rig` false = bare mast; `sail` tints the stripe. */
function yacht(sail: string, rig: boolean) {
  const hull =
    `<path d="M-16 -3 H14 Q19 -3 17.4 0 Q14.6 4 10 4 H-13 Q-16 3 -16 -3Z" fill="#fff"/><path d="M-15.6 0 H17.4 Q14.6 4 10 4 H-13 Q-16 3 -15.6 0Z" fill="#DCD6F0"/><path d="M-16 -1.4 H17.6" stroke="${BLUE[0]}" stroke-width="1.2"/>` +
    `<rect x="-9" y="-6.4" width="11" height="3.6" rx="1.6" fill="#fff"/><rect x="-7" y="-5.6" width="2" height="1.4" fill="${C.glass}"/><rect x="-3.6" y="-5.6" width="2" height="1.4" fill="${C.glass}"/>`;
  const mast = `<rect x=".6" y="-40" width="1.2" height="37" fill="#6E6496"/>`;
  if (!rig) return mast + hull;
  return (
    `<path d="M.4 -38.6 Q-5 -22 -14 -5.4 L.4 -5.4Z" fill="#fff"/><path d="M.4 -24 Q-4 -15 -7.6 -11.6 L.4 -11.6Z" fill="${sail}"/><path d="M.4 -38.6 Q-3.6 -26 -9 -14" stroke="#DCD6F0" stroke-width=".8" fill="none"/>` +
    `<path d="M2.2 -36.6 L15.4 -4.4 L2.2 -5Z" fill="#EDE8FA"/><path d="M2.2 -36.6 L8 -20 L2.2 -20Z" fill="#fff" opacity=".7"/>` +
    mast +
    `<path d="M-14 -5.4 H1" stroke="${NAVY}" stroke-width="1"/><path class="flag" d="M1.8 -40 L8 -38.6 L1.8 -37.2Z" fill="${sail}"/>` +
    hull
  );
}

/** Sailing marina: a jetty out from the clubhouse, moored yachts and one gliding out. */
const marina = definePiece({
  id: "haven-sailing",
  biome: "haven",
  w: 108,
  h: 78,
  below: 12,
  render: (c, X) => {
    const L = Math.min(X(-54), X(54));
    const water = (alive: boolean) => basin(L, c.y - 34, 108, 44, alive, 14);
    const jx = X(-4);
    const jetty = (n: number) => {
      let deck = `<rect x="${jx - 4.6}" y="${c.y - 38}" width="9.2" height="${n * 6}" fill="${C.woodL}"/><rect x="${jx + 2.6}" y="${c.y - 38}" width="2" height="${n * 6}" fill="${C.wood}"/>`;
      for (let i = 1; i < n; i++) deck += `<path d="M${jx - 4.6} ${c.y - 38 + i * 6} H${jx + 4.6}" stroke="${C.wood}" stroke-width=".7"/>`;
      return deck + pile(jx - 5, c.y - 38 + n * 6 + 2, 6) + pile(jx + 5, c.y - 38 + n * 6 + 2, 6);
    };
    const club = X(-32) - (c.side === 1 ? 0 : 6);
    if (c.stage === 0)
      return water(false) + [0, 1, 2, 3, 4].map((i) => pile(jx + (i % 2 ? 5 : -5), c.y - 30 + i * 7, 10)).join("") + plot(club, c.y - 42, 0.6) + `<circle cx="${X(30)}" cy="${c.y - 6}" r="2.6" fill="${RED[0]}"/><circle cx="${X(30)}" cy="${c.y - 7}" r="1" fill="#fff"/>`;
    if (c.stage === 1)
      return (
        place(club, c.y - 40, 0.62, block(-18, 0, 26, 12, 12, "#F4F1FF", "#D9D3EC") + scaffold(-20, 0, 40, 26)) +
        water(false) +
        jetty(4) +
        anim(X(-26), c.y - 10, "float", facing(0, 0, c.side, 0.8, yacht(C.pink, false)))
      );
    return (
      house(club, c.y - 38, 0.56, { wall: "#F4F1FF", side: "#D9D3EC", roof: BLUE[0], roofD: BLUE[1], alive: true }) +
      pennant(X(-10), c.y - 38, 26, BLUE[0]) +
      water(true) +
      jetty(6) +
      anim(X(14), c.y - 20, "float", facing(0, 0, c.side, 0.8, yacht(C.yellow, true)), 0.7) +
      anim(X(-24), c.y - 8, "float", facing(0, 0, c.side, 0.85, yacht(C.pink, true))) +
      anim(X(36), c.y + 4, "drift", anim(0, 0, "float", facing(0, 0, c.side, 0.8, yacht(BLUE[0], true)), 1.4)) +
      gull(X(30), c.y - 50, 0.75, true)
    );
  },
});

/** A silver fish lying on ice (facing right). */
const fish = (x: number, y: number, col = "#A9B6D6") =>
  `<path d="M${r1(x - 4)} ${r1(y)} Q${r1(x)} ${r1(y - 2.4)} ${r1(x + 4)} ${r1(y)} Q${r1(x)} ${r1(y + 2)} ${r1(x - 4)} ${r1(y)}Z M${r1(x - 4)} ${r1(y)} L${r1(x - 6.4)} ${r1(y - 1.8)} L${r1(x - 6.4)} ${r1(y + 1.8)}Z" fill="${col}"/><circle cx="${r1(x + 2.4)}" cy="${r1(y - 0.4)}" r=".5" fill="${C.ink}"/>`;

/** Fish counter on ice (unmirrored), `stocked` adds fish, salmon, shrimp and lemons. */
const fishCounter = (x: number, y: number, stocked: boolean) =>
  place(
    x,
    y,
    1,
    `${sh(4, 0, 18, 3.6)}${block(-14, 0, 28, 8, 8, "#fff", "#DCD6F0", stocked ? "#DFF1FF" : "#F4F1FF")}<path d="M-14 -4 H14" stroke="${BLUE[0]}" stroke-width="1.6"/>` +
      (stocked
        ? fish(-9, -9.4) + fish(-2, -9) + fish(5, -9.6, "#C9D3E8") + `<path d="M8.6 -10.4 h5 l1 1.6 h-5Z" fill="#FF8A6E"/><circle cx="12" cy="-8.4" r="1" fill="#FF7A8A"/><circle cx="13.6" cy="-8.8" r="1" fill="#FF7A8A"/><ellipse cx="-12" cy="-9.4" rx="1.4" ry="1" fill="${C.yellow}"/>`
        : ""),
  );

/** Herring cart (unmirrored): blue kiosk on wheels, white canopy, a red-white-blue pennant. */
function herringCart(x: number, y: number, done: boolean) {
  const base = `${sh(3, 0, 13, 3)}${block(-9, -3, 18, 11, 7, BLUE[0], BLUE[1], "#8EC5FF")}<circle cx="-5" cy="-1.6" r="2.6" fill="${NAVY}"/><circle cx="5" cy="-1.6" r="2.6" fill="${NAVY}"/><circle cx="-5" cy="-1.6" r="1" fill="#CFCBE3"/><circle cx="5" cy="-1.6" r="1" fill="#CFCBE3"/>`;
  if (!done) return place(x, y, 1, base);
  return place(
    x,
    y,
    1,
    `${base}<rect x="-8.6" y="-24" width="1.2" height="10" fill="#fff"/><rect x="7.4" y="-24" width="1.2" height="10" fill="#fff"/>` +
      `${block(-10.4, -24, 20.8, 2.4, 8, "#fff", "#DCD6F0", "#F4F1FF")}${fish(0, -9.4, "#fff")}` +
      `<path d="M15 -15 V-34" stroke="${C.ink}" stroke-width=".9"/><g class="flag"><path d="M15.4 -34 H24 V-31.6 H15.4Z" fill="#E8364F"/><path d="M15.4 -31.6 H24 V-29.2 H15.4Z" fill="#fff"/><path d="M15.4 -29.2 H24 V-26.8 H15.4Z" fill="#3F6FD0"/></g>`,
  );
}

/** A gull sitting on a roof ridge or post. */
const perchedGull = (x: number, y: number) =>
  place(x, y, 1, `<path d="M-5 0 Q-6 -5 -1 -5.6 Q1.4 -9 4 -7 L6 -6.4 L4 -5.6 Q4 -1 0 .4Z" fill="#fff"/><path d="M-5 0 Q-3 -4 1.6 -3.6 Q0 0 -5 0Z" fill="#C9C3E3"/><circle cx="2.4" cy="-6.8" r=".5" fill="${C.ink}"/><path d="M-1 .4 V2 M1 .2 V1.8" stroke="${C.orange}" stroke-width=".8"/>`);

/** Fish market: a white fishmonger's with a blue roof and awning, a counter on ice, a herring cart, gulls. */
const fishMarket = definePiece({
  id: "haven-fishmarket",
  biome: "haven",
  w: 108,
  h: 76,
  below: 12,
  render: (c, X) => {
    const hx = fit(c, X(-23), 26, 41);
    const hy = c.y - 12;
    const s = 0.95;
    const paving = `<ellipse cx="${X(2)}" cy="${c.y - 4}" rx="50" ry="12" fill="#E4E1EE"/><ellipse cx="${X(0)}" cy="${c.y - 5}" rx="40" ry="8" fill="#F1EFF7"/>`;
    if (c.stage === 0) return paving + plot(hx + 2, hy, 0.95) + fishBox(X(26), c.y - 6) + fishBox(X(36), c.y + 2) + crate(X(24), c.y + 6, 0.8);
    if (c.stage === 1) return paving + building(hx, hy, s, { wall: "#F4F1FF", side: "#D9D3EC", craneSide: 0 }) + fishCounter(X(-14), c.y + 4, false) + herringCart(X(30), c.y - 6, false) + fishBox(X(42), c.y + 6);
    let awning = "";
    for (let i = 0; i < 5; i++) awning += `<path d="M${-22 + i * 5} -24 L${-17 + i * 5} -24 L${-16 + i * 5} -19 L${-21 + i * 5} -19Z" fill="${i % 2 ? "#fff" : BLUE[0]}"/><path d="M${-21 + i * 5} -19 Q${-18.5 + i * 5} -17 ${-16 + i * 5} -19Z" fill="${i % 2 ? "#fff" : BLUE[0]}"/>`;
    const sign = `<path d="M-22 -30 H-28" stroke="${C.ink}" stroke-width="1.2"/><path d="M-26 -30 V-28" stroke="${C.ink}" stroke-width=".8"/>` + fish(-25, -25.6, BLUE[0]);
    return (
      paving +
      house(hx, hy, s, { wall: "#F4F1FF", side: "#D9D3EC", roof: BLUE[0], roofD: BLUE[1], alive: true }) +
      place(hx, hy, s, awning + sign) +
      perchedGull(hx + 4 * s, hy - 41 * s) +
      fishCounter(X(-14), c.y + 4, true) +
      fishBox(X(10), c.y + 2, 0.9) +
      herringCart(X(30), c.y - 8, true) +
      fishBox(X(44), c.y + 6) +
      gull(X(14), c.y - 44, 0.8, true)
    );
  },
});

/** A sand dune: lit left flank, shaded right flank. */
const dune = (x: number, y: number, w: number, h: number, pale = false) =>
  `<path d="M${r1(x - w)} ${r1(y)} Q${r1(x - w * 0.5)} ${r1(y - h * 1.05)} ${r1(x)} ${r1(y - h)} Q${r1(x + w * 0.55)} ${r1(y - h * 0.95)} ${r1(x + w)} ${r1(y)}Z" fill="${pale ? "#F6EBCD" : "#F7E2B0"}"/>` +
  `<path d="M${r1(x)} ${r1(y - h)} Q${r1(x + w * 0.55)} ${r1(y - h * 0.95)} ${r1(x + w)} ${r1(y)} L${r1(x + w * 0.2)} ${r1(y)} Q${r1(x + w * 0.16)} ${r1(y - h * 0.5)} ${r1(x)} ${r1(y - h)}Z" fill="${pale ? "#EAD9AE" : "#E3C88C"}"/>` +
  `<path d="M${r1(x - w * 0.7)} ${r1(y - h * 0.45)} Q${r1(x - w * 0.4)} ${r1(y - h * 0.95)} ${r1(x - w * 0.05)} ${r1(y - h * 0.98)}" stroke="#FFF6DD" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;

/** Windsurfer on a board (facing +x). */
const surfer =
  `<ellipse cx="0" cy="0" rx="10" ry="1.8" fill="#fff"/><path d="M-10 0 Q0 2.4 10 0" stroke="${BLUE[0]}" stroke-width="1" fill="none"/>` +
  `<path d="M2 -1 L3 -28 Q-6 -20 -8 -2Z" fill="${C.pink}"/><path d="M3 -28 Q-2 -22 -3 -14 L3 -14Z" fill="${C.yellow}"/><path d="M2 -1 L3 -28" stroke="${NAVY}" stroke-width=".9"/>` +
  `<path d="M5 -1 L6 -6 M8 -1 L7 -6" stroke="${NAVY}" stroke-width="1.4" stroke-linecap="round"/><path d="M5.2 -6 L5.6 -11.4 L8.4 -11.4 L8 -6Z" fill="${C.greenM}"/><path d="M6 -10 L2.6 -12 M8 -10 L3 -15" stroke="#F2C29B" stroke-width="1.1" stroke-linecap="round"/><circle cx="7" cy="-13.4" r="1.9" fill="#F2C29B"/><path d="M5 -13.6 Q5.4 -15.8 7 -15.6 Q8.8 -15.6 9 -13.8Z" fill="${C.woodD}"/>`;

/** Sand fence: a row of stakes (stuifschutting). */
const sandFence = (x1: number, y1: number, x2: number, y2: number) => {
  let out = "";
  for (let i = 0; i <= 6; i++) {
    const px = r1(x1 + ((x2 - x1) * i) / 6);
    const py = r1(y1 + ((y2 - y1) * i) / 6);
    out += `<rect x="${r1(px - 0.8)}" y="${r1(py - 7)}" width="1.6" height="7" rx=".6" fill="${C.woodL}"/>`;
  }
  return out;
};

/** Dunes with a windsurfer: marram dunes, a boardwalk, a kite, the sea with a surfer gliding. */
const dunes = definePiece({
  id: "haven-dunes",
  biome: "haven",
  w: 108,
  h: 80,
  below: 12,
  render: (c, X) => {
    const L = Math.min(X(-54), X(54));
    const sea = (alive: boolean) =>
      `<rect x="${L}" y="${c.y - 4}" width="108" height="14" rx="6" fill="${C.water}"/><rect x="${L + 4}" y="${c.y + 1}" width="100" height="4" rx="2" fill="${C.waterL}" opacity=".7"/>` +
      `<path${alive ? ` class="water"` : ""} d="M${L + 2} ${c.y - 3} Q${L + 15} ${c.y - 6} ${L + 28} ${c.y - 3} T${L + 54} ${c.y - 3} T${L + 80} ${c.y - 3} T${L + 106} ${c.y - 3}" stroke="#fff" stroke-width="2" fill="none" stroke-dasharray="14 6" stroke-linecap="round"/>`;
    const hills = (pale: boolean) => dune(X(-26), c.y - 26, 30, 30, pale) + dune(X(22), c.y - 30, 24, 22, pale) + dune(X(-2), c.y - 14, 20, 12, pale);
    if (c.stage === 0) return hills(true) + sea(false) + sandFence(X(-46), c.y - 20, X(-14), c.y - 24) + sandFence(X(10), c.y - 22, X(40), c.y - 26) + plot(X(-2), c.y - 14, 0.6);
    if (c.stage === 1)
      return (
        hills(false) +
        [[-34, -34], [-18, -40], [-24, -26], [16, -36], [28, -32], [-6, -18]].map(([d, dy]) => tuft(X(d), c.y + dy, 0.8, "#8DBA5A")).join("") +
        sandFence(X(-46), c.y - 18, X(-14), c.y - 22) +
        sea(false) +
        place(X(30), c.y - 14, 1, `<ellipse cx="0" cy="0" rx="10" ry="2" fill="#fff"/><path d="M-10 0 Q0 2.4 10 0" stroke="${BLUE[0]}" stroke-width="1" fill="none"/>`)
      );
    const kx = X(-10);
    const ky = c.y - 66;
    const kid = person(X(34), c.y - 14, C.yellow, 1);
    return (
      hills(false) +
      duneGrass(X(-36), c.y - 34, 0.9) +
      duneGrass(X(-18), c.y - 44, 0.8) +
      duneGrass(X(20), c.y - 40, 0.8) +
      duneGrass(X(-2), c.y - 18, 0.7) +
      pennant(X(44), c.y - 8, 22, RED[0]) +
      kid +
      `<path d="M${r1(X(34) + 4.2)} ${c.y - 21} Q${r1((X(34) + kx) / 2)} ${c.y - 36} ${kx} ${ky + 6}" stroke="${C.ink}" stroke-width=".6" fill="none" opacity=".6"/>` +
      anim(kx, ky + 6, "sway", `<path d="M0 0 L-5 -6 L0 -14 L5 -6Z" fill="${C.pink}"/><path d="M0 0 L0 -14 L5 -6Z" fill="${C.pinkD}"/><path d="M-5 -6 H5" stroke="#fff" stroke-width=".6"/><path d="M0 0 Q2 4 -1 7 Q-3 10 0 13" stroke="${C.ink}" stroke-width=".6" fill="none"/><path d="M0 4 l-1.6 -1 v2Z M-.6 9 l1.6 -1 v2Z" fill="${C.yellow}"/>`) +
      sea(true) +
      anim(X(-16), c.y + 4, "drift", anim(0, 0, "float", facing(0, 0, c.side, 1, surfer))) +
      gull(X(-40), c.y - 52, 0.75, true)
    );
  },
});

/** IJssel ferry (pontje) in profile: a flat car deck, a small raised wheelhouse, a car and a cyclist. */
function ferryBoat(done: boolean) {
  const hull =
    `<path d="M-30 -4 H30 L36 -1 L27 3 H-27 L-36 -1Z" fill="${BLUE[0]}"/><path d="M-36 -1 L36 -1 L27 3 H-27Z" fill="${BLUE[1]}"/><rect x="-31" y="-5.4" width="62" height="2" fill="#fff"/>` +
    `<path d="M-36 -1 L-41 -3 M36 -1 L41 -3" stroke="#8C82B5" stroke-width="1.6" stroke-linecap="round"/>`;
  if (!done) return hull + scaffold(-6, -5, 12, 14);
  const rail = `<path d="M-28 -11 H28 M-28 -8 H28" stroke="#fff" stroke-width=".8"/><path d="M-28 -11 V-5 M-18 -11 V-5 M-8 -11 V-5 M8 -11 V-5 M18 -11 V-5 M28 -11 V-5" stroke="#fff" stroke-width=".9"/>`;
  const car = `<path d="M-26 -6 V-9.6 Q-26 -11 -24 -11 L-21 -11 L-18 -14.6 H-11 L-8 -11 H-6 Q-4.6 -11 -4.6 -9.6 V-6Z" fill="${C.pink}"/><path d="M-17.4 -13.8 H-14.8 V-11 H-19.6Z M-14 -13.8 H-11.4 L-9.2 -11 H-14Z" fill="${C.glass}"/><circle cx="-21.4" cy="-5.6" r="2" fill="${NAVY}"/><circle cx="-9.4" cy="-5.6" r="2" fill="${NAVY}"/>`;
  const bike = `<circle cx="13" cy="-7.6" r="2.4" fill="none" stroke="${NAVY}" stroke-width="1"/><circle cx="20" cy="-7.6" r="2.4" fill="none" stroke="${NAVY}" stroke-width="1"/><path d="M13 -7.6 L16 -11 L19.6 -11 L20 -7.6 M16 -11 L16.6 -7.6" stroke="${C.yellow}" stroke-width="1.1" fill="none"/>`;
  return (
    rail +
    `<rect x="-4" y="-22" width="1.4" height="17" fill="#fff"/><rect x="2.6" y="-22" width="1.4" height="17" fill="#fff"/>` +
    block(-6.4, -16, 11, 8, 4, "#fff", "#DCD6F0") +
    win(-5, -14.6, 3.4, 3.4, false, 0.6) +
    win(-0.6, -14.6, 3.4, 3.4, false, 0.6) +
    `<rect x="-7.6" y="-18" width="14" height="2.2" rx=".8" fill="${RED[0]}"/><rect x="2" y="-23" width="2.2" height="5" fill="${NAVY}"/>` +
    car +
    bike +
    `<circle cx="24" cy="-15.6" r="1.8" fill="#D9A06E"/><path d="M22.6 -13.8 h2.8 v6 h-2.8Z" fill="${C.greenM}"/>` +
    hull
  );
}

/** Ferry crossing: the river with a slipway, the pontje gliding across, a ferry sign and a waiting cyclist. */
const ferry = definePiece({
  id: "haven-ferry",
  biome: "haven",
  w: 108,
  h: 76,
  below: 12,
  render: (c, X) => {
    const L = Math.min(X(-54), X(54));
    const river = (alive: boolean) => basin(L, c.y - 40, 108, 36, alive);
    const farBank = duneGrass(X(-38), c.y - 46, 0.7) + tree(X(30), c.y - 46, 0.48);
    const ramp = (dashed: boolean) =>
      dashed
        ? `<path d="${mp("M-24 6 L-4 6 L-8 -10 L-20 -10Z", X, c.y)}" fill="none" stroke="#B9AEE6" stroke-width="1.6" stroke-dasharray="3 2"/>`
        : `<path d="${mp("M-26 6 L-2 6 L-6 -12 L-22 -12Z", X, c.y)}" fill="#CFCBE3"/><path d="${mp("M-24 2 L-4 2 M-23 -3 L-5 -3 M-22 -8 L-6 -8", X, c.y)}" stroke="#B9AEE6" stroke-width="1"/>`;
    const sign = place(X(46), c.y + 4, 1, `${sh(0, 0, 4, 1.4)}<rect x="-.8" y="-22" width="1.6" height="22" fill="#6E6496"/><rect x="-6" y="-30" width="12" height="9" rx="1.6" fill="${BLUE[0]}"/><path d="M-3.6 -24 H3.6 L2.6 -22.6 H-2.6Z M-1 -27.6 H1.6 V-24 H-1Z" fill="#fff"/>`);
    if (c.stage === 0) return farBank + river(false) + ramp(true) + plot(X(28), c.y - 2, 0.62);
    if (c.stage === 1) return farBank + river(false) + ramp(false) + anim(X(10), c.y - 20, "float", facing(0, 0, c.side, 0.9, ferryBoat(false))) + sign;
    return (
      farBank +
      river(true) +
      ramp(false) +
      anim(X(8), c.y - 20, "drift", anim(0, 0, "float", facing(0, 0, c.side, 0.9, ferryBoat(true)))) +
      [0, 1.2].map((d) => `<circle class="smoke" style="animation-delay:${d}s" cx="${r1(X(8) + c.side * 2.8)}" cy="${c.y - 43}" r="2.2" fill="#fff"/>`).join("") +
      sign +
      person(X(36), c.y + 6, C.pink, 2) +
      gull(X(-30), c.y - 46, 0.75, true)
    );
  },
});

/** Filler: an upturned wooden rowboat on the sand. */
const beachedBoat = (x: number, y: number, s: number) =>
  place(
    x,
    y,
    s,
    `${sh(0, 0, 15, 3)}<path d="M-14 0 Q-13 -8 -4 -9 L8 -9 Q14 -8 15 0Z" fill="${BLUE[0]}"/><path d="M2 -9 L8 -9 Q14 -8 15 0 L5 0 Q6 -5 2 -9Z" fill="${BLUE[1]}"/><path d="M-14 0 H15" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><path d="M-10 -6 Q-4 -8.4 2 -8" stroke="#8EC5FF" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
      `<path d="M-6 3 L12 1" stroke="${C.woodL}" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="13" cy="1" rx="2.4" ry="1" fill="${C.woodL}"/>`,
  );

/** Filler: a lifebuoy on a white post. */
const lifebuoy = (x: number, y: number, s: number) =>
  place(
    x,
    y,
    s,
    `${sh(0, 0, 6, 2)}<rect x="-1.6" y="-20" width="3.2" height="20" rx="1" fill="#fff"/><rect x=".4" y="-20" width="1.2" height="20" fill="#DCD6F0"/><circle cx="0" cy="-13" r="5.4" fill="none" stroke="#fff" stroke-width="3"/>` +
      `<path d="M-5.4 -13 A5.4 5.4 0 0 1 0 -18.4 M5.4 -13 A5.4 5.4 0 0 1 0 -7.6" stroke="${RED[0]}" stroke-width="3" fill="none"/>`,
  );

/** Filler: shells and a starfish in the sand. */
const shells = (x: number, y: number, s: number) =>
  place(
    x,
    y,
    s,
    `<path d="M0 -6 L1.4 -2.6 L5 -2.2 L2.2 .2 L3 3.6 L0 1.8 L-3 3.6 L-2.2 .2 L-5 -2.2 L-1.4 -2.6Z" fill="${C.orange}"/><circle cx="0" cy="-.6" r="1" fill="#FFB36B"/>` +
      `<path d="M7 2 Q9 -2 11 2Z" fill="#FFE1EC"/><path d="M9 -1 V2" stroke="#E7A3BB" stroke-width=".6"/><ellipse cx="-8" cy="2" rx="2.4" ry="1.4" fill="#F4F1FF"/>`,
  );

export const haven: WorldBiome = {
  id: "haven",
  ground: ["#F4E7C6", "#D9EEF3"],
  patch: "#FFF8E6",
  bannerBg: ["#2F8FE0", "#1F6BB0"],
  density: 0.4,
  flora: [
    { weight: 3, radius: 14, render: (x, y, _r, s) => duneGrass(x, y, 0.9 * s) },
    { weight: 0.45, radius: 15, render: (x, y, _r, s) => beachedBoat(x, y, 0.85 * s) },
    { weight: 0.5, radius: 9, render: (x, y, _r, s) => lifebuoy(x, y, 0.85 * s) },
    { weight: 0.8, radius: 9, render: (x, y, _r, s) => shells(x, y, 0.9 * s) },
    { weight: 0.25, radius: 9, render: (x, y, _r, s) => bollard(x, y, 0.9 * s) },
    { weight: 0.3, radius: 10, render: (x, y, _r, s) => crate(x, y, 0.9 * s) },
    { weight: 0.6, radius: 15, render: (x, y, _r, s) => gull(x, y, 0.9 * s) },
    { weight: 0.5, radius: 9, render: (x, y, _r, s) => rock(x, y, 0.9 * s, STONE) },
  ],
  pieces: [lighthouse, fishingQuay, craneQuay, beachHuts, marina, fishMarket, dunes, ferry],
};
