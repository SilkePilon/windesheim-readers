import { C, bikeRack, crane, definePiece, flag, glow, lamp, plot, r1, scaffold, sh, star, tree, win, type WorldBiome } from "../kit";

const FRONT = "#E9E2FF";
const SIDE = "#B9AEE6";
const ROOF = "#6B3CF6";

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
    const lamps = lamp(X(-48), c.y + 4, 0.8, true) + lamp(X(48), c.y + 4, 0.8, true);
    if (c.stage === 0) return plot(X(-4), c.y, 1.05) + lamps;
    if (c.stage === 1)
      return sh(c.x, base, 44, 7) + block(bx, base, 70, 16, 1) + `<g>${scaffold(bx, base - 16, 70, 22)}</g>` + crane(c.side === 1 ? bx + 78 : bx - 4, base, 74, c.side === 1 ? -30 : 30) + lamps;
    const tx = bx + 26;
    const tower =
      `<rect x="${tx}" y="${base - 66}" width="18" height="30" fill="${FRONT}"/><rect x="${tx + 12}" y="${base - 66}" width="6" height="30" fill="${SIDE}"/>` +
      `<path d="M${tx - 2} ${base - 66} L${tx + 9} ${base - 80} L${tx + 20} ${base - 66}Z" fill="${ROOF}"/><path d="M${tx + 9} ${base - 80} L${tx + 20} ${base - 66} L${tx + 11} ${base - 66}Z" fill="${C.grapeD}"/>` +
      `<circle cx="${tx + 8}" cy="${base - 54}" r="6" fill="#fff"/><circle cx="${tx + 8}" cy="${base - 54}" r="6" fill="none" stroke="${C.grapeD}" stroke-width="1.4"/><path d="M${tx + 8} ${base - 54} v-4 M${tx + 8} ${base - 54} h3" stroke="${C.ink}" stroke-width="1.3" stroke-linecap="round"/>`;
    const door = `<rect x="${bx + 30}" y="${base - 11}" width="10" height="11" rx="4" fill="${C.ink}"/><path d="M${bx + 26} ${base} h18 l-2 3 h-14Z" fill="${SIDE}"/>`;
    return (
      sh(c.x, base, 46, 7) +
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
  pieces: [mainBuilding],
};
