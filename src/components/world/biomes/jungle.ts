import { C, bigLeaf, definePiece, fern, flag, palm, plot, r1, scaffold, sh, torch, vine, type WorldBiome } from "../kit";

const STONE = { front: "#C2B78C", side: "#988E66", top: "#DDD3AA", dark: "#6E664A" };

/** One temple tier in 3/4 view: front face, shaded right side, lit top. (x, y) = front bottom-left. */
function tier(x: number, y: number, w: number, h: number, d = 7) {
  return (
    `<path d="M${x + w} ${y} L${x + w + d} ${y - d * 0.6} L${x + w + d} ${r1(y - h - d * 0.6)} L${x + w} ${y - h}Z" fill="${STONE.side}"/>` +
    `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${STONE.front}"/>` +
    `<path d="M${x} ${y - h} L${x + d} ${r1(y - h - d * 0.6)} L${x + w + d} ${r1(y - h - d * 0.6)} L${x + w} ${y - h}Z" fill="${STONE.top}"/>` +
    `<path d="M${x + 4} ${y - h / 2} H${x + w * 0.3} M${x + w * 0.62} ${y - h / 2 + 2} H${x + w - 5}" stroke="${STONE.side}" stroke-width="1.2" stroke-linecap="round"/>`
  );
}

const moss = (x: number, y: number, w: number) =>
  `<path d="M${x} ${y} q${w / 4} -4 ${w / 2} 0 q${w / 4} 4 ${w / 2} 0 v3 q-${w / 2} 3 -${w} 0Z" fill="#3FAE6A"/>`;

const hangingVine = (x: number, y: number, len: number) =>
  `<path d="M${x} ${y} q3 ${len / 2} -1 ${len}" stroke="#0E9474" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="${x + 2}" cy="${r1(y + len * 0.4)}" rx="2.4" ry="1.4" fill="#19C59B"/><ellipse cx="${x - 1}" cy="${r1(y + len * 0.85)}" rx="2.4" ry="1.4" fill="#12A884"/>`;

/** Overgrown stepped temple with torches and a palm. */
const temple = definePiece({
  id: "jungle-temple",
  biome: "jungle",
  w: 108,
  h: 98,
  render: (c, X) => {
    const tx = X(-6) - 36; // front-left of the base tier
    const base = c.y;
    const backPalm = palm(X(-42), c.y - 16, 0.82, c.stage === 2);
    if (c.stage === 0)
      return (
        backPalm +
        [[-20, 2], [-6, 4], [14, 0]].map(([dx, dy]) => `<rect x="${X(dx) - 6}" y="${c.y + dy - 7}" width="12" height="7" rx="1.5" fill="${STONE.front}"/><rect x="${X(dx) - 6}" y="${c.y + dy - 9}" width="12" height="2.4" rx="1" fill="${STONE.top}"/>`).join("") +
        plot(X(28), c.y - 2, 0.8) +
        fern(X(-30), c.y + 8, 0.8)
      );
    const t1 = tier(tx, base, 72, 16);
    const t2 = tier(tx + 11, base - 16, 50, 15);
    const stairs = (h: number) => `<rect x="${tx + 29}" y="${base - h}" width="14" height="${h}" fill="${STONE.side}"/>` + Array.from({ length: Math.floor(h / 4) }, (_, i) => `<path d="M${tx + 29} ${base - 2 - i * 4} h14" stroke="${STONE.top}" stroke-width="1.2"/>`).join("");
    if (c.stage === 1)
      return backPalm + sh(tx + 40, base, 46, 7) + t1 + t2 + stairs(31) + `<g>${scaffold(tx + 18, base - 31, 36, 24)}</g>` + moss(tx + 2, base - 16, 16) + fern(X(40), c.y + 8, 0.8);
    const t3 = tier(tx + 21, base - 31, 30, 14);
    const shrine = tier(tx + 27, base - 45, 18, 12, 5) + `<path d="M${tx + 32} ${base - 45} v-7 q4 -4 8 0 v7Z" fill="${STONE.dark}"/>`;
    return (
      backPalm +
      sh(tx + 40, base, 46, 7) +
      t1 + t2 + t3 + stairs(45) + shrine +
      moss(tx + 2, base - 16, 18) + moss(tx + 48, base - 31, 12) + moss(tx + 22, base - 45, 10) +
      hangingVine(tx + 6, base - 16, 12) + hangingVine(tx + 58, base - 31, 16) + hangingVine(tx + 26, base - 45, 10) +
      flag(tx + 36, base - 57, C.orange, 20) +
      torch(tx - 4, base + 2, true) + torch(tx + 78, base + 2, true) +
      bigLeaf(X(44), c.y + 8, 0.7)
    );
  },
});

export const jungle: WorldBiome = {
  id: "jungle",
  ground: ["#A6DDB0", "#B9E6B5"],
  patch: "#D8F5D6",
  bannerBg: ["#0E8F5A", "#0A6B43"],
  banner: "world.biome.jungle",
  density: 0.7,
  flora: [
    { weight: 2, radius: 24, render: (x, y, _r, s) => palm(x, y, 0.7 * s) },
    { weight: 2.5, radius: 17, render: (x, y, _r, s) => fern(x, y, 0.9 * s) },
    { weight: 2, radius: 21, render: (x, y, _r, s) => bigLeaf(x, y, 0.8 * s) },
    { weight: 1, radius: 13, render: (x, y, _r, s) => vine(x, y, 0.9 * s) },
  ],
  pieces: [temple],
};
