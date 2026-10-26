import { C, bench, crane, definePiece, glow, lamp, planeTree, planter, plot, r1, scaffold, sh, win, type WorldBiome } from "../kit";
import type { Rng } from "@/lib/world/rng";

const FACADES: [string, string][] = [
  ["#E58A6E", "#C46A50"],
  ["#F3E3C3", "#D8C49C"],
  ["#A98FE8", "#8466D6"],
  ["#7FC7B0", "#5EA790"],
];

/** One narrow canal house: front facade with a gable, windows lit at night. */
function facade(x: number, y: number, w: number, h: number, col: [string, string], lit: boolean, gable: "step" | "bell") {
  const top = y - h;
  const gab =
    gable === "step"
      ? `<path d="M${x} ${top} V${top - 4} H${x + 3} V${top - 8} H${x + 6} V${top - 12} H${x + w - 6} V${top - 8} H${x + w - 3} V${top - 4} H${x + w} V${top}Z" fill="${col[0]}"/>`
      : `<path d="M${x} ${top} Q${x + 2} ${top - 4} ${x + 4} ${top - 6} Q${x + w / 2} ${top - 16} ${x + w - 4} ${top - 6} Q${x + w - 2} ${top - 4} ${x + w} ${top}Z" fill="${col[0]}"/>`;
  let wins = "";
  for (let row = 0; row < Math.floor((h - 14) / 12); row++)
    for (const cx of [x + 3.5, x + w - 8.5]) wins += win(cx, top + 5 + row * 12, 5, 7, lit, 1);
  return (
    `<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${col[0]}"/>${gab}` +
    `<rect x="${x + w - 2}" y="${r1(top - 2)}" width="2" height="${h + 2}" fill="${col[1]}" opacity=".7"/>` +
    wins +
    `<rect x="${r1(x + w / 2 - 3)}" y="${y - 9}" width="6" height="9" rx="2.5" fill="${C.wood}"/><circle cx="${r1(x + w / 2)}" cy="${r1(top - 6)}" r="1.4" fill="#fff" opacity=".8"/>` +
    glow(x + w / 2, top + h * 0.4, w * 0.75, lit)
  );
}

function canal(x: number, y: number, w: number, alive: boolean) {
  return (
    `<rect x="${x - w / 2}" y="${y - 3}" width="${w}" height="4" rx="1" fill="#B9AEE6"/>` +
    `<rect x="${x - w / 2}" y="${y + 1}" width="${w}" height="11" rx="2" fill="${C.water}"/><rect x="${x - w / 2}" y="${y + 1}" width="${w}" height="3" fill="#6FA9E8" opacity=".6"/>` +
    (alive
      ? `<path class="water" d="M${x - w / 2 + 6} ${y + 8} H${x + w / 2 - 6}" stroke="#fff" stroke-width="1.8" stroke-dasharray="10 16" stroke-linecap="round" opacity=".8"/>`
      : `<path d="M${x - 20} ${y + 8} h14 M${x + 8} ${y + 9} h12" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`)
  );
}

const pickCols = (rng: Rng) => {
  const i = Math.floor(rng() * FACADES.length);
  return [FACADES[i], FACADES[(i + 1) % FACADES.length], FACADES[(i + 2) % FACADES.length]];
};

/** Canal houses on a gracht: three gabled facades, a quay and a little boat. */
const canalHouses = definePiece({
  id: "stad-canal",
  biome: "stad",
  w: 108,
  h: 84,
  below: 14,
  render: (c, X) => {
    const cols = pickCols(c.rng);
    const x0 = c.x - 33;
    const base = c.y - 4;
    const side = `<path d="M${x0 + 66} ${base} L${x0 + 74} ${base - 4} L${x0 + 74} ${base - 50} L${x0 + 66} ${base - 52}Z" fill="${cols[2][1]}"/>`;
    const water = canal(c.x, c.y, 108, c.stage === 2);
    if (c.stage === 0)
      return (
        water +
        [0, 22, 44].map((dx) => `<rect x="${x0 + dx}" y="${base - 6}" width="20" height="6" rx="1" fill="none" stroke="#B9AEE6" stroke-width="2"/>`).join("") +
        plot(X(20), base - 8, 0.8)
      );
    if (c.stage === 1)
      return (
        sh(c.x + 6, base, 40, 6) +
        facade(x0, base, 22, 52, cols[0], false, "step") +
        facade(x0 + 22, base, 22, 60, cols[1], false, "bell") +
        `<rect x="${x0 + 44}" y="${base - 22}" width="22" height="22" fill="${cols[2][0]}"/>` +
        `<g>${scaffold(x0 + 44, base, 22, 40)}</g>` +
        crane(c.side === 1 ? x0 + 70 : x0 - 2, base, 76, c.side === 1 ? -30 : 30) +
        water
      );
    const boat = `<g transform="translate(${X(26)} ${c.y + 8})"><g class="bob"><path d="M-11 -2 H11 Q9 3 0 3 Q-9 3 -11 -2Z" fill="${C.pink}"/><path d="M-11 -2 H11 L10 0 H-10Z" fill="${C.pinkD}"/><rect x="-4" y="-7" width="7" height="5" rx="1" fill="${C.cream}"/></g></g>`;
    return (
      sh(c.x + 6, base, 42, 6) +
      side +
      facade(x0, base, 22, 52, cols[0], false, "step") +
      facade(x0 + 22, base, 22, 60, cols[1], false, "bell") +
      facade(x0 + 44, base, 22, 48, cols[2], false, "step") +
      water +
      boat +
      lamp(X(-46), c.y - 3, 0.7)
    );
  },
});

export const stad: WorldBiome = {
  id: "stad",
  ground: ["#E2DDF0", "#D9D3EC"],
  patch: "#F4F1FF",
  bannerBg: ["#7A5AF0", "#5534D1"],
  banner: "world.biome.stad",
  density: 0.35,
  flora: [
    { weight: 2, radius: 19, render: (x, y, _r, s) => planeTree(x, y, 0.72 * s) },
    { weight: 1, radius: 19, render: (x, y, _r, s) => lamp(x, y, 0.8 * s) },
    { weight: 0.8, radius: 11, render: (x, y, _r, s) => bench(x, y, 0.8 * s) },
    { weight: 1, radius: 12, render: (x, y, _r, s) => planter(x, y, 0.8 * s) },
  ],
  pieces: [canalHouses],
};
