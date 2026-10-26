import {
  C,
  anim,
  birdV,
  block,
  cactus,
  campfire,
  definePiece,
  dryShrub,
  facing,
  fairyLights,
  fit,
  glow,
  palm,
  person,
  place,
  plot,
  pond,
  r1,
  ripple,
  rock,
  scaffold,
  seedlings,
  sh,
  win,
  type WorldBiome,
} from "../kit";

const SANDSTONE: [string, string] = ["#D9A066", "#F2C894"];

const reeds = (x: number, y: number) =>
  `<path d="M${x - 4} ${y} q-2 -7 -5 -10 M${x - 1} ${y} q0 -9 -1 -13 M${x + 2} ${y} q2 -7 5 -9" stroke="#3FAE6A" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;

/** Oasis: a pool with swaying palms and reeds. */
const oasis = definePiece({
  id: "woestijn-oasis",
  biome: "woestijn",
  w: 108,
  h: 86,
  below: 10,
  render: (c, X) => {
    const py = c.y - 4;
    if (c.stage === 0)
      return (
        `<ellipse cx="${c.x}" cy="${py}" rx="38" ry="12" fill="#E9B877"/><ellipse cx="${c.x - 3}" cy="${py - 2}" rx="28" ry="7.5" fill="#D9A066" opacity=".55"/>` +
        rock(X(-36), c.y + 4, 1, SANDSTONE) +
        seedlings(X(-20), c.y - 14, 2, 10) +
        plot(X(26), c.y - 6, 0.75)
      );
    if (c.stage === 1)
      return (
        palm(X(-28), py - 12, 0.55) +
        `<ellipse cx="${c.x}" cy="${py}" rx="38" ry="12" fill="#C9D98A"/>` +
        pond(c.x - 4, py, 22, 7, false, "#B9C978") +
        reeds(X(24), py + 4) +
        `<g transform="translate(${X(30)} ${c.y + 6})"><rect x="-5" y="-9" width="10" height="9" rx="2" fill="${C.woodL}"/><path d="M-5 -9 q5 -8 10 0" stroke="${C.ink}" stroke-width="1.2" fill="none"/></g>`
      );
    return (
      palm(fit(c, X(-28), 20, 34), py - 14, 0.9, true) +
      palm(fit(c, X(28), 17, 30), py - 8, 0.78, true) +
      pond(c.x, py, 36, 11, true, "#9ACD7A") +
      reeds(X(-30), py + 8) +
      reeds(X(34), py + 6) +
      `<circle cx="${X(-38)}" cy="${py + 10}" r="2.4" fill="${C.pink}"/><circle cx="${X(40)}" cy="${py + 9}" r="2.2" fill="${C.yellow}"/>`
    );
  },
});

// ---------------------------------------------------------------- shared desert bits

const DUNE = { lit: "#F7E2B0", shade: "#E3C88C", hi: "#FFF6DD" };
const STONE = { front: "#E8B57A", side: "#C98D52", top: "#F6D3A0", dark: "#9C6A3A" };
const ADOBE = { wall: "#EBC48E", side: "#C99A62", top: "#F7DDB0", beam: "#8a5a3a" };
const MUD = { front: ADOBE.wall, side: ADOBE.side, top: ADOBE.top };
const CAMEL = { body: "#D9A066", shade: "#B9773F", lit: "#F2C894" };
const RUG = ["#C8385A", "#3F6FD0", C.orange, "#2B8A52"];

/** A sand dune (absolute): lit left flank, shaded right flank, a bright crest. */
const dune = (x: number, y: number, w: number, h: number) =>
  `<path d="M${r1(x - w)} ${r1(y)} Q${r1(x - w * 0.5)} ${r1(y - h * 1.05)} ${r1(x)} ${r1(y - h)} Q${r1(x + w * 0.55)} ${r1(y - h * 0.95)} ${r1(x + w)} ${r1(y)}Z" fill="${DUNE.lit}"/>` +
  `<path d="M${r1(x)} ${r1(y - h)} Q${r1(x + w * 0.55)} ${r1(y - h * 0.95)} ${r1(x + w)} ${r1(y)} L${r1(x + w * 0.2)} ${r1(y)} Q${r1(x + w * 0.16)} ${r1(y - h * 0.5)} ${r1(x)} ${r1(y - h)}Z" fill="${DUNE.shade}"/>` +
  `<path d="M${r1(x - w * 0.7)} ${r1(y - h * 0.45)} Q${r1(x - w * 0.4)} ${r1(y - h * 0.95)} ${r1(x - w * 0.05)} ${r1(y - h * 0.98)}" stroke="${DUNE.hi}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;

/** Heat haze: wavy lines drifting over the sand (absolute, `w` wide). */
const haze = (x: number, y: number, w: number) =>
  [0, 7].map((dy, i) => `<path class="water" style="animation-delay:-${i * 1.1}s" d="M${r1(x)} ${r1(y + dy)} q${r1(w / 8)} -3 ${r1(w / 4)} 0 t${r1(w / 4)} 0 t${r1(w / 4)} 0 t${r1(w / 4)} 0" stroke="#fff" stroke-width="1.2" fill="none" stroke-dasharray="10 14" stroke-linecap="round" opacity=".55"/>`).join("");

/** Camel in profile facing +x (mirror with `facing`): `kneel` folds the legs; `load` adds a blanket and bags. */
function camel(kneel: boolean, load: string | null, rider = false) {
  const dy = kneel ? 10.5 : 0;
  const legs = kneel
    ? `<path d="M-11 -2 Q-4 1 4 -1 Q10 -2 11 -4 L9 -6 L-11 -5Z" fill="${CAMEL.shade}"/><ellipse cx="6" cy="-1.6" rx="5" ry="1.8" fill="${CAMEL.body}"/>`
    : `<path d="M-6.6 -14 L-7 -7 L-6.4 0 M8 -14 L8.6 -7 L8 0" stroke="${CAMEL.shade}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
      `<path d="M-9.4 -14 L-10.2 -7 L-9.4 0 M5.4 -14 L5 -7 L5.6 0" stroke="${CAMEL.body}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
      `<path d="M-10.4 0 h2.4 M4.6 0 h2.4" stroke="${CAMEL.shade}" stroke-width="1.6" stroke-linecap="round"/>`;
  const body =
    `<path d="M-13 -15 Q-14 -21 -8 -22 Q-4 -31 1 -24 Q6 -22 9 -18 Q11 -14 8 -12.5 H-10 Q-13 -12.5 -13 -15Z" fill="${CAMEL.body}"/>` +
    `<path d="M-12.4 -13.6 Q0 -11.4 9.4 -14.2 Q9 -12.5 7.4 -12.5 H-10 Q-12 -12.6 -12.4 -13.6Z" fill="${CAMEL.shade}"/>` +
    `<path d="M-8 -22.4 Q-4.6 -29 -.6 -25.4" stroke="${CAMEL.lit}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
    `<path d="M7 -20 Q12 -19 13 -26 Q14 -30.4 17 -30.4 L18 -27 Q15.4 -26 15.2 -21 Q13.6 -15 8 -14Z" fill="${CAMEL.body}"/><path d="M8 -14 Q13.6 -15 15.2 -21 Q14.6 -16 9.4 -13.4Z" fill="${CAMEL.shade}"/>` +
    `<ellipse cx="19.4" cy="-28.4" rx="4.4" ry="2.5" fill="${CAMEL.body}"/><ellipse cx="22.4" cy="-27.6" rx="1.8" ry="1.6" fill="${CAMEL.lit}"/><circle cx="18.6" cy="-29.4" r=".6" fill="${C.ink}"/><path d="M16.2 -30 L15.4 -32.2 L17.4 -30.8Z" fill="${CAMEL.shade}"/>` +
    `<path d="M-13 -17 Q-15 -14 -14.4 -11" stroke="${CAMEL.shade}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  const pack = load
    ? `<path d="M-9 -22 Q-4.6 -30 1.6 -23.4 L.6 -17.6 Q-4 -19.6 -8.4 -17.6Z" fill="${load}"/><path d="M-8.8 -19.6 Q-4 -21.6 1 -19.6" stroke="${C.yellow}" stroke-width="1" fill="none"/><path d="M-8.4 -17.6 l.6 2 M-5 -18.6 l0 2 M-1.6 -18.6 l0 2" stroke="${C.yellow}" stroke-width=".8"/>` +
      `<rect x="-11" y="-19" width="5" height="6.4" rx="1.8" fill="${C.woodL}"/><rect x="-11" y="-19" width="5" height="2" rx="1" fill="${C.wood}"/>`
    : "";
  const man = rider
    ? `<path d="M-6 -27 L-6 -33 Q-3.6 -34.6 -1.2 -33 L-1.2 -27Z" fill="#fff"/><path d="M-3.6 -27 L-2 -22" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="-3.6" cy="-36" r="2.4" fill="#9C6644"/><path d="M-6.2 -36.4 Q-3.6 -40 -1 -36.4 L-.6 -33.6 Q-1.4 -35 -2 -35.6 Q-3.6 -37 -6.2 -35.2Z" fill="#3F6FD0"/>`
    : "";
  return `<ellipse cx="2" cy="1" rx="14" ry="2.6" fill="${C.shadow}" opacity=".16"/><g transform="translate(0 ${dy})">${legs}${body}${pack}${man}</g>`;
}

/** A rolled rug. */
const rolledRug = (x: number, y: number, col: string) =>
  place(x, y, 1, `${sh(1, 0, 9, 2)}<rect x="-9" y="-5" width="18" height="5" rx="2.5" fill="${col}"/><ellipse cx="-9" cy="-2.5" rx="1.6" ry="2.5" fill="${C.cream}"/><path d="M-6 -5 V0 M0 -5 V0 M6 -5 V0" stroke="${C.yellow}" stroke-width=".8"/>`);

/** Clay amphora (unmirrored). */
const jar = (x: number, y: number, s = 1, col = "#C9773F") =>
  place(
    x,
    y,
    s,
    `<ellipse cx="2" cy=".6" rx="6" ry="1.6" fill="${C.shadow}" opacity=".16"/><path d="M-2 -14 L2 -14 L2.6 -12 Q6 -10 6 -5 Q6 0 0 0 Q-6 0 -6 -5 Q-6 -10 -2.6 -12Z" fill="${col}"/><path d="M1 -12 Q6 -10 6 -5 Q6 0 0 0 Q4 -2 4 -6 Q4 -10 1 -12Z" fill="#000" opacity=".15"/>` +
      `<path d="M-4 -8 Q-4 -10 -2 -11" stroke="#fff" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".55"/><rect x="-2.6" y="-15.4" width="5.2" height="1.6" rx=".6" fill="${col}"/>`,
  );

/** Sandstone / mud bricks stacked (unmirrored). */
const bricks = (x: number, y: number, col: { front: string; side: string; top: string } = STONE) =>
  place(
    x,
    y,
    1,
    `${sh(2, 0, 11, 2.6)}` +
      [[-8, 0], [0, 0], [-4, -4.4]].map(([bx, by]) => block(bx, by, 7.4, 4, 3, col.front, col.side, col.top)).join(""),
  );

// ---------------------------------------------------------------- camel caravan

const caravan = definePiece({
  id: "woestijn-caravan",
  biome: "woestijn",
  w: 108,
  h: 76,
  render: (c, X) => {
    const f = c.side;
    const back = dune(X(-22), c.y - 34, 34, 22) + dune(X(26), c.y - 40, 26, 14);
    const prints = (n: number) =>
      Array.from({ length: n }, (_, i) => `<ellipse cx="${X(-44 + i * 9)}" cy="${r1(c.y + 4 - i * 1.6)}" rx="1.6" ry=".9" fill="#C9A36B" opacity=".6"/>`).join("");
    if (c.stage === 0)
      return (
        back +
        prints(9) +
        place(X(-18), c.y - 6, 1, `${sh(0, 0, 4, 1.4)}<rect x="-1.4" y="-16" width="2.8" height="16" rx="1" fill="${C.wood}"/><path d="M-1.4 -12 Q-6 -8 -4 -2" stroke="#C99A6B" stroke-width="1" fill="none"/>`) +
        rolledRug(X(-2), c.y + 2, RUG[0]) +
        jar(X(10), c.y - 4, 0.8) +
        plot(X(28), c.y - 6, 0.6)
      );
    if (c.stage === 1)
      return (
        back +
        prints(5) +
        facing(X(-14), c.y - 4, f, 1, camel(true, RUG[1])) +
        rolledRug(X(14), c.y + 2, RUG[0]) +
        place(X(6), c.y - 8, 1, `${sh(1, 0, 5, 1.6)}<rect x="-4" y="-7" width="8" height="7" rx="2" fill="${C.woodL}"/><rect x="-4" y="-7" width="8" height="2" rx="1" fill="${C.wood}"/>`) +
        person(X(26), c.y - 2, "#3F6FD0", 2) +
        jar(X(-38), c.y - 2, 0.8)
      );
    const rope = (x1: number, y1: number, x2: number, y2: number) =>
      `<path d="M${r1(x1)} ${r1(y1)} Q${r1((x1 + x2) / 2)} ${r1((y1 + y2) / 2 + 4)} ${r1(x2)} ${r1(y2)}" stroke="${C.woodD}" stroke-width=".7" fill="none"/>`;
    const train =
      rope(X(-34) + f * 15, c.y - 39, X(-12) - f * 11, c.y - 27) +
      rope(X(-12) + f * 18, c.y - 30, X(12) - f * 12, c.y - 16) +
      rope(X(12) + f * 21, c.y - 21, X(34), c.y - 10) +
      facing(X(-34), c.y - 16, f, 0.8, camel(false, RUG[3])) +
      facing(X(-12), c.y - 8, f, 0.9, camel(false, RUG[1])) +
      facing(X(12), c.y + 2, f, 1, camel(false, RUG[0], true)) +
      person(X(36), c.y + 4, "#fff", 2) +
      place(X(36), c.y + 4, 1, `<path d="M-3 -15.6 Q0 -19.6 3 -15.6 L3 -12 Q0 -13.6 -3 -12Z" fill="#3F6FD0"/>`);
    return (
      back +
      prints(4) +
      haze(X(-44) - (c.side === 1 ? 0 : 40), c.y - 46, 40) +
      anim(0, 0, "drift", train) +
      place(X(-40), c.y - 30, 1, `<rect x="-.6" y="-10" width="1.2" height="10" fill="${C.woodD}"/>`) +
      birdV(X(30), c.y - 64, 1, true)
    );
  },
});

// ---------------------------------------------------------------- pyramid

/** A pyramid (unmirrored) at base point (x, y): lit left face, shaded right face, courses; `t` = built height (0–1). */
function pyramid(x: number, y: number, t: number, cap: boolean) {
  const A = [0, -80];
  const Lc = [-46, -6];
  const F = [6, 4];
  const R = [44, -12];
  const B = [-8, -22];
  const at = (p: number[], k: number) => [r1(p[0] + (A[0] - p[0]) * k), r1(p[1] + (A[1] - p[1]) * k)];
  const poly = (pts: number[][], fill: string) => `<path d="M${pts.map((q) => q.join(" ")).join(" L")}Z" fill="${fill}"/>`;
  let out = sh(x + 6, y - 2, 38, 8);
  const k = Math.min(t, 1);
  out += `<g transform="translate(${r1(x)} ${r1(y)})">`;
  out += poly([Lc, F, at(F, k), at(Lc, k)], "#F2CC8E") + poly([F, R, at(R, k), at(F, k)], "#D19A5A");
  for (let i = 1; i < 10; i++) {
    const s = i / 10;
    if (s >= k) break;
    out += `<path d="M${at(Lc, s).join(" ")} L${at(F, s).join(" ")}" stroke="#DDB073" stroke-width="1"/><path d="M${at(F, s).join(" ")} L${at(R, s).join(" ")}" stroke="#B9824A" stroke-width="1"/>`;
  }
  if (k < 1) out += poly([at(Lc, k), at(F, k), at(R, k), at(B, k)], "#F7DCA6");
  else {
    out += `<path d="M${at(Lc, 0.02).join(" ")} L${A.join(" ")}" stroke="#FFF1D2" stroke-width="1.6" stroke-linecap="round"/>`;
    // Entrance on the lit face.
    out += `<path d="M-22 -2.4 L-15 -0.2 L-15.6 -9 Q-18.6 -12.6 -21.6 -11Z" fill="#7A5230"/>`;
    if (cap) out += poly([at(Lc, 0.86), at(F, 0.86), A], "#FFD45E") + poly([at(F, 0.86), at(R, 0.86), A], "#E0A82E");
  }
  return out + `</g>`;
}

const pyramidPiece = definePiece({
  id: "woestijn-pyramid",
  biome: "woestijn",
  w: 108,
  h: 100,
  render: (c, X) => {
    const px = c.x - 2;
    const ground = dune(X(40), c.y - 8, 14, 7);
    if (c.stage === 0)
      return (
        `<path d="M${px - 46} ${c.y - 6} L${px + 6} ${c.y + 4} L${px + 44} ${c.y - 12} L${px - 8} ${c.y - 22}Z" fill="#F6E2B6"/>` +
        `<path d="M${px - 46} ${c.y - 6} L${px + 6} ${c.y + 4} L${px + 44} ${c.y - 12}" stroke="${STONE.side}" stroke-width="3" fill="none" stroke-linejoin="round"/>` +
        `<path d="M${px - 46} ${c.y - 6} L${px - 8} ${c.y - 22} L${px + 44} ${c.y - 12}" stroke="${C.orange}" stroke-width="1.2" fill="none" stroke-dasharray="3 2"/>` +
        bricks(px - 18, c.y - 14) +
        bricks(px + 14, c.y - 12) +
        plot(px + 2, c.y - 2, 0.55)
      );
    if (c.stage === 1) {
      const ramp = `<path d="M${px - 52} ${c.y + 2} L${px - 26} ${c.y - 36} L${px - 18} ${c.y - 36} L${px - 40} ${c.y + 4}Z" fill="#D9B07A"/><path d="M${px - 46} ${c.y + 2} L${px - 22} ${c.y - 34}" stroke="#C49A62" stroke-width="1" stroke-dasharray="2 3"/>`;
      return (
        pyramid(px, c.y, 0.48, false) +
        ramp +
        place(px - 34, c.y - 14, 1, block(-4, 0, 7, 5, 3, STONE.front, STONE.side, STONE.top)) +
        person(px - 40, c.y - 2, C.cream, 1, 0.85) +
        person(px - 30, c.y - 18, "#3F6FD0", 2, 0.8) +
        bricks(px + 36, c.y + 6) +
        ground
      );
    }
    return (
      pyramid(px, c.y, 1, true) +
      `<g transform="translate(${px} ${c.y - 80})"><g class="spark"><path d="M0 -8 L1.6 -1.6 L8 0 L1.6 1.6 L0 8 L-1.6 1.6 L-8 0 L-1.6 -1.6Z" fill="#FFF3B0"/></g></g>` +
      glow(px, c.y - 76, 14) +
      haze(px - 44, c.y - 40, 32) +
      palm(fit(c, X(-42), 15, 26), c.y + 4, 0.7, true) +
      facing(X(36), c.y + 6, c.side === 1 ? -1 : 1, 0.75, camel(false, RUG[0])) +
      birdV(px + 22, c.y - 84, 1, true, 0.4)
    );
  },
});

// ---------------------------------------------------------------- desert tent camp

/** Bedouin tent (unmirrored), front opening facing the viewer (lamp-lit at night); `done` false = poles and half a roof. */
function bedouinTent(x: number, y: number, col: [string, string, string], done: boolean) {
  const front = "M-24 -12 Q-19 -20 -14 -20 Q-9 -20 -4 -14 Q1 -20 6 -20 Q11 -20 16 -12";
  const roof = `${front} L24 -18 Q19 -26 14 -26 Q9 -26 4 -20 Q-1 -26 -6 -26 Q-11 -26 -16 -18Z`;
  const poles = `<path d="M-14 0 V-20 M6 0 V-20 M-22 0 V-12 M14 0 V-12" stroke="${C.woodL}" stroke-width="1.6" stroke-linecap="round"/>`;
  if (!done)
    return place(
      x,
      y,
      1,
      `${sh(2, 0, 22, 4)}${poles}<path d="M-24 -12 Q-19 -20 -14 -20 Q-9 -20 -4 -14 L4 -20 Q-1 -26 -6 -26 Q-11 -26 -16 -18Z" fill="${col[0]}"/><path d="M-22 -12 L-30 2 M14 -12 L22 2" stroke="#C99A6B" stroke-width=".7"/>`,
    );
  return place(
    x,
    y,
    1,
    `${sh(4, 0, 26, 5)}<path d="M16 -12 L24 -18 L24 -5 L16 0Z" fill="${col[1]}"/>` +
      `<path d="M-22 0 L-22 -12 L14 -12 L14 0Z" fill="#3A2A2A"/><path d="M-12 -2 h14" stroke="${RUG[0]}" stroke-width="3"/>` +
      `<path d="M-24 0 L-24 -12 L-19 -14 L-17 0Z" fill="${col[0]}"/><path d="M16 0 L16 -12 L12 -13 L10 0Z" fill="${col[1]}"/>` +
      `<path d="M-14 0 V-17 M6 0 V-17" stroke="${C.woodL}" stroke-width="1.4"/>` +
      `<path d="${roof}" fill="${col[0]}"/><path d="M-20 -16 Q-15 -23 -10 -21 M-2 -17 Q3 -23 8 -21 M-22 -14 L18 -15" stroke="${col[2]}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      `<path d="${front}" stroke="${col[2]}" stroke-width="1.2" fill="none"/>` +
      `<path d="M-24 -12 L-30 2 M16 -12 L24 2" stroke="#C99A6B" stroke-width=".7"/>`,
  ) + glow(x - 4, y - 6, 12);
}

/** A patterned rug lying flat (absolute). */
const rug = (x: number, y: number, col: string) =>
  `<path d="M${x - 12} ${y} L${x + 10} ${y} L${x + 14} ${y - 6} L${x - 8} ${y - 6}Z" fill="${col}"/><path d="M${x - 8} ${y - 1.6} L${x + 8} ${y - 1.6} L${x + 10} ${y - 4.4} L${x - 6} ${y - 4.4}Z" fill="none" stroke="${C.yellow}" stroke-width=".9"/><path d="M${x + 1} ${y - 3} l1.6 -.8" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>`;

/** A brass teapot (unmirrored). */
const teapot = (x: number, y: number) =>
  place(x, y, 1, `<path d="M-3.4 0 Q-4 -4 0 -5 Q4 -4 3.4 0Z" fill="${C.yellow}"/><path d="M3 -2.6 L6 -5" stroke="${C.yellow}" stroke-width="1.2" stroke-linecap="round"/><circle cx="0" cy="-5.6" r="1" fill="${C.orangeD}"/><path d="M-2 -3.4 Q-1 -4.4 0 -4.4" stroke="#fff" stroke-width=".8" fill="none"/>`);

const BROWN: [string, string, string] = ["#6E5444", "#4E3A2E", "#E9D6AE"];
const RED: [string, string, string] = ["#D9485E", "#A8324A", "#FFE1EC"];

const tents = definePiece({
  id: "woestijn-tents",
  biome: "woestijn",
  w: 108,
  h: 80,
  render: (c, X) => {
    const ta = X(-24) - 4;
    const tb = X(22) - 4;
    const back = dune(X(18), c.y - 50, 26, 12) + palm(fit(c, X(-40), 14, 25), c.y - 40, 0.62, c.stage === 2);
    if (c.stage === 0)
      return back + rolledRug(X(-26), c.y - 26, RUG[0]) + rolledRug(X(-20), c.y - 20, RUG[1]) + place(X(10), c.y - 18, 1, `<path d="M-14 0 L14 -4 M-14 2 L14 -2 M-14 4 L14 0" stroke="${C.woodL}" stroke-width="1.6" stroke-linecap="round"/>`) + plot(X(14), c.y + 2, 0.6) + jar(X(-36), c.y + 2, 0.8);
    if (c.stage === 1)
      return back + bedouinTent(ta, c.y - 28, BROWN, false) + place(tb, c.y - 16, 1, `<path d="M-14 0 V-18 M6 0 V-18" stroke="${C.woodL}" stroke-width="1.6" stroke-linecap="round"/>`) + rolledRug(X(10), c.y + 2, RUG[1]) + person(X(30), c.y + 2, "#fff", 2) + campfire(X(-30), c.y + 2, false);
    return (
      back +
      facing(X(24), c.y - 38, c.side === 1 ? -1 : 1, 0.7, camel(true, RUG[3])) +
      bedouinTent(ta, c.y - 28, BROWN, true) +
      place(ta - 14, c.y - 48, 1, `<rect x="-.6" y="-10" width="1.2" height="10" fill="${C.woodD}"/><path class="flag" d="M.6 -10 L9 -7.6 L.6 -5.2Z" fill="#3F6FD0"/>`) +
      bedouinTent(tb, c.y - 6, RED, true) +
      rug(X(-18), c.y + 2, RUG[1]) +
      teapot(X(-16), c.y - 1) +
      campfire(X(-38), c.y + 4, true) +
      person(X(44), c.y + 6, "#3F6FD0", 1)
    );
  },
});

// ---------------------------------------------------------------- sandstone arch

/** A natural sandstone arch (unmirrored), legs on the baseline. */
function arch(x: number, y: number) {
  const outer = "M-44 0 Q-46 -22 -40 -40 Q-34 -62 -12 -68 Q14 -72 30 -58 Q42 -44 42 -22 L44 0";
  const inner = "H26 Q26 -30 14 -40 Q2 -48 -12 -42 Q-24 -34 -26 -14 L-26 0Z";
  return place(
    x,
    y,
    1,
    `${sh(4, 0, 40, 7)}<g transform="translate(7 -4)"><path d="${outer} ${inner}" fill="#B86E3C"/></g>` +
      `<path d="${outer} ${inner}" fill="#E39A5E"/>` +
      `<path d="M-43 -14 H-27 M-40 -36 Q-30 -40 -22 -36 M-28 -56 Q-12 -62 4 -60 M12 -52 Q24 -50 32 -44 M28 -24 H41 M27 -10 H43" stroke="#F2B77E" stroke-width="2" fill="none" stroke-linecap="round"/>` +
      `<path d="M-42 -24 H-27 M-34 -48 Q-24 -54 -14 -52 M16 -60 Q26 -56 34 -50 M30 -36 H40" stroke="#C47A44" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
      `<path d="M-42 -30 Q-38 -52 -24 -62 Q-12 -68 2 -69" stroke="#FFD2A0" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  );
}

const archPiece = definePiece({
  id: "woestijn-arch",
  biome: "woestijn",
  w: 108,
  h: 92,
  render: (c, X) => {
    const ax = c.x - 4;
    const ay = c.y - 6;
    if (c.stage === 0) return arch(ax, ay) + dune(ax, c.y + 2, 50, 54) + plot(X(26), c.y - 2, 0.55) + dryShrub(X(-40), c.y + 2, 0.8);
    if (c.stage === 1)
      return (
        arch(ax, ay) +
        dune(ax - 20, c.y + 2, 34, 26) +
        dune(ax + 30, c.y + 4, 22, 14) +
        person(X(-2), c.y + 4, C.orange, 1) +
        place(X(4), c.y + 4, 1, `<path d="M-2 -14 L4 0" stroke="${C.woodL}" stroke-width="1.4" stroke-linecap="round"/><path d="M2.6 -1 L6 1.4 L4.6 3Z" fill="#8C82B5"/>`) +
        place(X(36), c.y + 2, 1, `${sh(0, 0, 4, 1.4)}<rect x="-.8" y="-16" width="1.6" height="16" fill="${C.wood}"/><rect x="-7" y="-22" width="14" height="8" rx="1.4" fill="${C.woodL}"/><path d="M-4 -18 h8" stroke="${C.wood}" stroke-width="1.2"/>`)
      );
    const lizard = facing(X(30), c.y + 4, c.side, 1, `<path d="M-8 0 Q-4 -2 0 -1.4 Q4 -2 6 -1 Q4 .4 0 .2 Q-4 1 -8 0Z" fill="#3FAE6A"/><path d="M-3 -1 l-1.4 2 M2 -1 l1.4 2" stroke="#2B8A52" stroke-width=".8"/><circle cx="4.4" cy="-1.2" r=".4" fill="${C.ink}"/>`);
    return (
      arch(ax, ay) +
      ripple(X(16), c.y + 2, 0.7) +
      person(ax - 12, ay - 69, C.pink, 2, 0.8) +
      place(ax - 4, ay - 70, 1, `<rect x="-.6" y="-12" width="1.2" height="12" fill="${C.woodD}"/><path class="flag" d="M.6 -12 L9 -9.6 L.6 -7.2Z" fill="${C.orange}"/>`) +
      cactus(fit(c, X(-40), 13, 17), c.y + 4, 0.8) +
      `<circle cx="${fit(c, X(-40), 13, 17) - 1}" cy="${c.y - 27}" r="2" fill="${C.pink}"/>` +
      lizard +
      birdV(X(30), c.y - 76, 1.2, true) +
      birdV(X(42), c.y - 66, 0.9, true, 0.8)
    );
  },
});

// ---------------------------------------------------------------- well with bucket

/** Round stone well (unmirrored), rim at y−14; `h` = built wall height (0–14). */
function wellRing(x: number, y: number, h: number) {
  const top = -h;
  return place(
    x,
    y,
    1,
    `${sh(2, 0, 18, 5)}<path d="M-14 0 Q0 6 14 0 L14 ${top} L-14 ${top}Z" fill="${ADOBE.wall}"/><path d="M3 4.6 Q10 3.6 14 0 L14 ${top} L3 ${top}Z" fill="${ADOBE.side}"/>` +
      (h > 6 ? `<path d="M-14 ${top + 5} Q0 ${top + 11} 14 ${top + 5} M-8 ${top} V${top + 5.6} M6 ${top + 5.6} V${top + 11} M-2 ${top + 7.6} V${top + 13}" stroke="#C99A62" stroke-width=".9" fill="none" opacity=".8"/>` : "") +
      `<ellipse cx="0" cy="${top}" rx="14" ry="5" fill="${ADOBE.top}"/><ellipse cx="0" cy="${top + 0.4}" rx="10.6" ry="3.4" fill="#3A2A2A"/>` +
      (h >= 14 ? `<ellipse cx="-1.6" cy="${top + 1.4}" rx="5" ry="1.2" fill="${C.water}"/>` : ""),
  );
}

const well = definePiece({
  id: "woestijn-well",
  biome: "woestijn",
  w: 104,
  h: 88,
  render: (c, X) => {
    const wx = X(-6);
    const wy = c.y - 8;
    const palmX = fit(c, X(-38), 15, 27);
    if (c.stage === 0)
      return (
        palm(palmX, c.y - 22, 0.7) +
        `<ellipse cx="${wx}" cy="${wy - 2}" rx="15" ry="5.4" fill="#D9B07A"/><ellipse cx="${wx}" cy="${wy - 2}" rx="10" ry="3.4" fill="#5E4A3A"/>` +
        dune(wx + 22, wy, 10, 8) +
        bricks(X(-30), c.y + 2, MUD) +
        plot(X(28), c.y - 4, 0.55)
      );
    const posts = (h: number) => `<rect x="${wx - 13}" y="${wy - 14 - h}" width="2.6" height="${h + 6}" fill="${C.wood}"/><rect x="${wx + 10.4}" y="${wy - 14 - h}" width="2.6" height="${h + 6}" fill="${C.woodD}"/>`;
    if (c.stage === 1)
      return palm(palmX, c.y - 22, 0.7) + wellRing(wx, wy, 8) + posts(20) + bricks(X(22), c.y, MUD) + person(X(30), c.y + 6, C.orange, 0) + place(X(-28), c.y + 4, 1, `${sh(0, 0, 5, 1.6)}<path d="M-4 0 L-5 -7 H5 L4 0Z" fill="${C.woodL}"/><path d="M-5 -7 Q0 -12 5 -7" stroke="${C.ink}" stroke-width=".8" fill="none"/>`);
    const roofY = wy - 40;
    const frame =
      posts(26) +
      `<rect x="${wx - 13}" y="${wy - 33}" width="26" height="2.4" rx="1" fill="${C.woodL}"/><circle cx="${wx + 15}" cy="${wy - 31.8}" r="2" fill="${C.wood}"/><path d="M${wx + 15} ${wy - 31.8} l3 4" stroke="${C.wood}" stroke-width="1.4" stroke-linecap="round"/>` +
      `<path d="M${wx - 18} ${roofY + 1} L${wx} ${roofY - 9} L${wx + 18} ${roofY + 1}Z" fill="#D9663A"/><path d="M${wx} ${roofY - 9} L${wx + 18} ${roofY + 1} L${wx + 4} ${roofY + 1}Z" fill="#B04A2A"/><path d="M${wx - 16} ${roofY} L${wx} ${roofY - 8.4}" stroke="#F59A6A" stroke-width="1.4" stroke-linecap="round"/>`;
    const bucket = anim(
      wx + 1,
      wy - 31,
      "bob",
      `<path d="M0 0 V9" stroke="#C99A6B" stroke-width=".8"/><path d="M-3.4 9 L3.4 9 L2.6 15 L-2.6 15Z" fill="${C.woodL}"/><path d="M-3.4 9 L3.4 9" stroke="${C.wood}" stroke-width="1"/><path d="M-3.4 9 Q0 5 3.4 9" stroke="${C.ink}" stroke-width=".7" fill="none"/>`,
    );
    return (
      palm(palmX, c.y - 22, 0.7, true) +
      wellRing(wx, wy, 14) +
      frame +
      bucket +
      place(X(18), c.y + 2, 1, `${sh(2, 0, 12, 2.6)}<path d="M-10 0 L8 0 L10 -5 L-8 -5Z" fill="${ADOBE.side}"/><path d="M-9 -4.6 L9 -4.6 L10 -6 L-8 -6Z" fill="${C.water}"/>`) +
      person(X(32), c.y + 4, C.pink, 1) +
      place(X(32), c.y + 4, 1, `<path d="M-3 -18 Q0 -21 3 -18 L3 -13 Q0 -14.4 -3 -13Z" fill="#3F6FD0"/>`) +
      jar(X(44), c.y - 8, 0.7) +
      jar(X(-26), c.y + 6, 0.8, "#B8653A") +
      birdV(X(28), c.y - 64, 1, true, 0.5)
    );
  },
});

// ---------------------------------------------------------------- market of a desert town

/** Flat-roofed adobe house (unmirrored): parapet, poking roof beams, arched door; optional dome. */
function adobeHouse(x: number, y: number, w: number, h: number, door: string, dome: boolean, built = 1) {
  const hh = r1(h * built);
  if (built < 1) return place(x, y, 1, `${sh(4, 0, w * 0.6, 5)}${block(0, 0, w, hh, 10, ADOBE.wall, ADOBE.side)}${scaffold(-2, 0, w + 4, h)}`);
  const k = 2.2;
  return (
    place(
      x,
      y,
      1,
      `${sh(6, 0, w * 0.62, 5)}${block(0, 0, w, h, 10, ADOBE.wall, ADOBE.side, ADOBE.top)}` +
        `<path d="M0 ${-h} v-3 h${w} v3 M${w} ${-h - 3} L${w + 10} ${-h - 3 - k} v3" stroke="${ADOBE.top}" stroke-width="1.6" fill="none"/>` +
        [0.2, 0.5, 0.8].map((t) => `<rect x="${r1(w * t - 1)}" y="${-h + 3}" width="2" height="2.6" rx=".6" fill="${ADOBE.beam}"/>`).join("") +
        `<path d="M${r1(w * 0.3)} 0 V-8 Q${r1(w * 0.3 + 3.5)} -12.6 ${r1(w * 0.3 + 7)} -8 V0Z" fill="${door}"/>` +
        win(w * 0.7 - 2.4, -h + 9, 4.8, 5.4, false, 2.4) +
        (dome
          ? `<ellipse cx="${r1(w / 2 + 5)}" cy="${r1(-h - k - 2)}" rx="${r1(w * 0.34)}" ry="3" fill="${ADOBE.side}"/><path d="M${r1(w / 2 + 5 - w * 0.3)} ${r1(-h - k - 2)} Q${r1(w / 2 + 5 - w * 0.3)} ${r1(-h - k - 2 - w * 0.4)} ${r1(w / 2 + 5)} ${r1(-h - k - 2 - w * 0.42)} Q${r1(w / 2 + 5 + w * 0.3)} ${r1(-h - k - 2 - w * 0.4)} ${r1(w / 2 + 5 + w * 0.3)} ${r1(-h - k - 2)}Z" fill="#F2F0FA"/>` +
            `<path d="M${r1(w / 2 + 8)} ${r1(-h - k - 2 - w * 0.4)} Q${r1(w / 2 + 5 + w * 0.3)} ${r1(-h - k - 2 - w * 0.36)} ${r1(w / 2 + 5 + w * 0.3)} ${r1(-h - k - 2)} L${r1(w / 2 + 9)} ${r1(-h - k - 2)}Z" fill="#C9C3E3"/>` +
            `<circle cx="${r1(w / 2 + 5)}" cy="${r1(-h - k - 4 - w * 0.42)}" r="1.6" fill="${C.yellow}"/>`
          : ""),
    ) + glow(x + w * 0.7, y - h + 11.7, 9)
  );
}

/** Souk stall (unmirrored): a striped awning on poles over a counter with spice cones. */
function souk(x: number, y: number, stripes: [string, string], open: boolean) {
  const awn = Array.from({ length: 6 }, (_, i) => `<path d="M${-16 + i * 5.4} -22 L${-10.6 + i * 5.4} -22 L${-9.6 + i * 6} -16 L${-15.6 + i * 6} -16Z" fill="${i % 2 ? stripes[1] : stripes[0]}"/>`).join("");
  const poles = `<path d="M-14 0 V-22 M16 0 V-22" stroke="${C.woodL}" stroke-width="1.6"/>`;
  if (!open) return place(x, y, 1, `${sh(2, 0, 16, 3)}${poles}<path d="M-16 -22 H18" stroke="${C.woodL}" stroke-width="1.6"/>`);
  const cones = [[-10, C.orange], [-4, "#C8385A"], [2, C.yellow], [8, "#5FA05F"]].map(([cx, col]) => `<path d="M${+cx - 3} -9 Q${cx} -15 ${+cx + 3} -9Z" fill="${col}"/>`).join("");
  return place(
    x,
    y,
    1,
    `${sh(2, 0, 18, 3.6)}${poles}${block(-14, 0, 28, 9, 6, C.woodL, C.wood, "#E2BC85")}${cones}` +
      `${awn}<path d="M-16 -22 L18 -22 L22 -26 L-12 -26Z" fill="${stripes[0]}" opacity=".85"/>` +
      `<path d="M-16 -16 Q-13 -13 -10 -16 Q-7 -13 -4 -16 Q-1 -13 2 -16 Q5 -13 8 -16 Q11 -13 14 -16 Q17 -13 20 -16" stroke="${stripes[1]}" stroke-width="1.4" fill="none"/>`,
  );
}

const market = definePiece({
  id: "woestijn-market",
  biome: "woestijn",
  w: 108,
  h: 98,
  render: (c, X) => {
    const hx = X(-30) - 16;
    const hy = c.y - 34;
    const h2x = X(16) - 10;
    const h2y = c.y - 48;
    if (c.stage === 0)
      return bricks(X(-24), c.y - 30, MUD) + bricks(X(-10), c.y - 22, MUD) + bricks(X(14), c.y - 36, MUD) + plot(X(4), c.y - 4, 0.75) + jar(X(-36), c.y + 2, 0.8) + jar(X(30), c.y + 4, 0.7, "#B8653A");
    if (c.stage === 1)
      return adobeHouse(h2x, h2y, 26, 26, "#3F6FD0", false, 0.5) + adobeHouse(hx, hy, 32, 30, C.orange, false, 0.6) + souk(X(-12), c.y + 2, ["#FF5C8A", "#fff"], false) + bricks(X(26), c.y - 10, MUD) + person(X(28), c.y + 6, C.orange, 1);
    const carpets = [[-6, RUG[0]], [0, RUG[1]], [6, RUG[2]]]
      .map(([dx, col], i) => anim(X(30) + +dx, c.y - 34, "sway", `<rect x="-2.4" y="0" width="4.8" height="12" fill="${col}"/><path d="M-1.4 2 h2.8 M-1.4 6 h2.8 M-1.4 10 h2.8" stroke="${C.yellow}" stroke-width=".7"/>`, i * 0.5))
      .join("");
    return (
      adobeHouse(h2x, h2y, 26, 26, "#3F6FD0", false) +
      adobeHouse(hx, hy, 32, 30, C.orange, true) +
      `<path d="M${X(30) - 10} ${c.y - 34} H${X(30) + 10}" stroke="${C.woodD}" stroke-width=".8"/>` +
      carpets +
      fairyLights([[hx + 32, hy - 24], [h2x + 2, h2y - 18]], true) +
      souk(X(-14), c.y + 2, ["#FF5C8A", "#fff"], true) +
      souk(X(24), c.y + 4, ["#3F8FE0", "#fff"], true) +
      person(X(4), c.y + 6, "#fff", 2) +
      person(X(-36), c.y + 4, C.yellow, 0, 0.9) +
      jar(X(42), c.y + 6, 0.7, "#B8653A") +
      jar(X(-44), c.y - 4, 0.8)
    );
  },
});

// ---------------------------------------------------------------- windblown ruins

/** A column (unmirrored): base, fluted shaft (lit left, shade right), capital or broken top. */
function column(x: number, y: number, h: number, broken: boolean) {
  const top = broken
    ? `<path d="M-4.6 ${-h} L-2 ${-h - 3} L0 ${-h - 1} L2.6 ${-h - 4} L4.6 ${-h - 1.4} L4.6 ${-h} Z" fill="${STONE.top}"/>`
    : `<rect x="-7" y="${-h - 4}" width="14" height="4" rx="1" fill="${STONE.top}"/><rect x="2" y="${-h - 4}" width="5" height="4" fill="${STONE.side}"/>`;
  return place(
    x,
    y,
    1,
    `${sh(1, 0, 8, 2.4)}<rect x="-6.4" y="-3" width="12.8" height="3" fill="${STONE.side}"/><rect x="-6.4" y="-3" width="8" height="3" fill="${STONE.front}"/>` +
      `<rect x="-4.6" y="${-h}" width="9.2" height="${h - 3}" fill="${STONE.front}"/><rect x="1" y="${-h}" width="3.6" height="${h - 3}" fill="${STONE.side}"/>` +
      `<path d="M-2.6 -4 V${-h + 1} M-.4 -4 V${-h + 1}" stroke="#F6D3A0" stroke-width=".8"/>` +
      top,
  );
}

const ruins = definePiece({
  id: "woestijn-ruins",
  biome: "woestijn",
  w: 108,
  h: 86,
  render: (c, X) => {
    // The colonnade sits on the back side (unmirrored: lintel and shade run to the right).
    const cA = c.side === 1 ? c.x - 42 : c.x + 12;
    const cB = X(-2);
    const wallX = X(18) - 14;
    const wall = (h: number) =>
      place(wallX, c.y - 18, 1, `${sh(4, 0, 18, 4)}${block(0, 0, 26, h, 6, STONE.front, STONE.side, STONE.top)}` + (h > 24 ? `<path d="M9 ${-h + 6} V${-h + 14} H17 V${-h + 6} Q13 ${-h + 1} 9 ${-h + 6}Z" fill="#7A5230"/><path d="M0 ${-h} L4 ${-h - 4} L8 ${-h} L14 ${-h - 2} L20 ${-h}" fill="${STONE.top}"/>` : ""));
    if (c.stage === 0)
      return (
        column(cA, c.y - 20, 40, false) +
        column(cB, c.y - 14, 30, true) +
        dune(X(-18), c.y + 2, 40, 34) +
        dune(X(24), c.y - 4, 28, 24) +
        plot(X(28), c.y + 2, 0.55)
      );
    if (c.stage === 1)
      return (
        column(cA, c.y - 20, 40, false) +
        column(cB, c.y - 14, 30, true) +
        wall(16) +
        dune(X(-38), c.y + 2, 18, 14) +
        dune(X(30), c.y + 2, 20, 12) +
        person(X(4), c.y + 4, C.orange, 2) +
        place(X(-12), c.y + 4, 1, `${sh(0, 0, 6, 2)}<ellipse cx="0" cy="-2" rx="6" ry="2" fill="none" stroke="${C.woodL}" stroke-width="1.4"/><path d="M-5 -2 h10 M-3 -3.4 l6 2.8" stroke="#C99A6B" stroke-width=".6"/>`) +
        place(X(42), c.y + 2, 1, `${sh(0, 0, 4, 1.4)}<rect x="-.8" y="-14" width="1.6" height="14" fill="${C.wood}"/><path d="M-.8 -14 L-3 -18 M.8 -14 L3 -18" stroke="${C.woodL}" stroke-width="1"/>`)
      );
    const lintel = place(cA, c.y - 64, 1, block(-8, 0, 34, 5, 5, STONE.front, STONE.side, STONE.top));
    const drum = place(X(30), c.y + 2, 1, `${sh(2, 0, 12, 2.6)}<rect x="-8" y="-9" width="16" height="9" rx="1" fill="${STONE.side}"/><ellipse cx="-8" cy="-4.5" rx="2.6" ry="4.5" fill="${STONE.top}"/>`);
    const sandStreaks = [[-50, -54, 46], [-20, -30, 50], [4, -70, 40]]
      // Wind-blown sand: long soft wisps gliding along (the dash period matches wk-flow's 40px), not dashes.
      .map(([d, dy, w], i) => {
        const wisp = (oy: number, dash: string, sw: number, op: number, delay: number) =>
          `<path class="water" style="animation-delay:-${r1(delay)}s" d="M${X(d)} ${c.y + dy + oy} q${r1((c.side * w) / 2)} -4 ${c.side * w} 0" stroke="${DUNE.hi}" stroke-width="${sw}" fill="none" stroke-dasharray="${dash}" stroke-linecap="round" opacity="${op}"/>`;
        return wisp(0, "18 22", 1.3, 0.7, i * 0.8) + wisp(3.5, "9 31", 1, 0.5, i * 0.8 + 0.9);
      })
      .join("");
    return (
      column(cA, c.y - 20, 40, false) +
      column(cA + 26, c.y - 20, 40, false) +
      lintel +
      column(cB, c.y - 6, 30, true) +
      wall(30) +
      dune(X(-34), c.y + 4, 16, 8) +
      dune(X(4), c.y + 6, 14, 6) +
      drum +
      dryShrub(X(44), c.y - 14, 0.8) +
      sandStreaks +
      place(cA + 2, c.y - 70, 0.9, `<path d="M-4 0 Q-6 -6 -2 -9 Q2 -11 4 -7 L7 -8 L4 -5 Q4 0 -4 0Z" fill="#5E4A3A"/><circle cx="1.6" cy="-8" r="1.6" fill="#E9B4A0"/><path d="M-5 -1 l-2 3 M-1 0 l0 3" stroke="#3A2A2A" stroke-width=".8"/>`) +
      birdV(X(36), c.y - 74, 1.1, true)
    );
  },
});

export const woestijn: WorldBiome = {
  id: "woestijn",
  ground: ["#F8DFAE", "#F5CD98"],
  patch: "#FFF1D6",
  bannerBg: ["#E0701A", "#B35410"],
  density: 0.35,
  flora: [
    { weight: 1.5, radius: 15, render: (x, y, _r, s) => cactus(x, y, 0.8 * s) },
    { weight: 1.5, radius: 11, render: (x, y, _r, s) => dryShrub(x, y, 0.9 * s) },
    { weight: 1, radius: 9, render: (x, y, _r, s) => rock(x, y, 0.9 * s, SANDSTONE) },
    { weight: 2, radius: 18, render: (x, y, _r, s) => ripple(x, y, 0.9 * s) },
  ],
  pieces: [oasis, caravan, pyramidPiece, tents, archPiece, well, market, ruins],
};
