import { C, bollard, crane, crate, definePiece, duneGrass, gull, house, plot, r1, rock, scaffold, sh, type WorldBiome } from "../kit";

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
  h: 104,
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
      `<g transform="translate(${tx} ${top - 8})"><g class="beam"><path d="M0 0 L46 -10 L46 10Z" fill="${C.yellowL}" opacity=".55"/></g></g>`;
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

export const haven: WorldBiome = {
  id: "haven",
  ground: ["#F4E7C6", "#D9EEF3"],
  patch: "#FFF8E6",
  bannerBg: ["#2F8FE0", "#1F6BB0"],
  banner: "world.biome.haven",
  density: 0.4,
  flora: [
    { weight: 3, radius: 14, render: (x, y, _r, s) => duneGrass(x, y, 0.9 * s) },
    { weight: 0.4, radius: 9, render: (x, y, _r, s) => bollard(x, y, 0.9 * s) },
    { weight: 0.8, radius: 10, render: (x, y, _r, s) => crate(x, y, 0.9 * s) },
    { weight: 0.6, radius: 15, render: (x, y, _r, s) => gull(x, y, 0.9 * s) },
    { weight: 0.6, radius: 9, render: (x, y, _r, s) => rock(x, y, 0.9 * s, STONE) },
  ],
  pieces: [lighthouse],
};
