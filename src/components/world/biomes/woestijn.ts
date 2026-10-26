import { C, cactus, definePiece, dryShrub, palm, plot, pond, ripple, rock, seedlings, type WorldBiome } from "../kit";

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
      palm(X(-28), py - 14, 0.9, true) +
      palm(X(28), py - 8, 0.78, true) +
      pond(c.x, py, 36, 11, true, "#9ACD7A") +
      reeds(X(-30), py + 8) +
      reeds(X(34), py + 6) +
      `<circle cx="${X(-38)}" cy="${py + 10}" r="2.4" fill="${C.pink}"/><circle cx="${X(40)}" cy="${py + 9}" r="2.2" fill="${C.yellow}"/>`
    );
  },
});

export const woestijn: WorldBiome = {
  id: "woestijn",
  ground: ["#F8DFAE", "#F5CD98"],
  patch: "#FFF1D6",
  bannerBg: ["#E0701A", "#B35410"],
  banner: "world.biome.woestijn",
  density: 0.35,
  flora: [
    { weight: 1.5, radius: 15, render: (x, y, _r, s) => cactus(x, y, 0.8 * s) },
    { weight: 1.5, radius: 11, render: (x, y, _r, s) => dryShrub(x, y, 0.9 * s) },
    { weight: 1, radius: 9, render: (x, y, _r, s) => rock(x, y, 0.9 * s, SANDSTONE) },
    { weight: 2, radius: 18, render: (x, y, _r, s) => ripple(x, y, 0.9 * s) },
  ],
  pieces: [oasis],
};
