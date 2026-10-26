import { C, building, bushes, definePiece, flowers, house, mushrooms, pine, plot, rock, seedlings, tree, type WorldBiome } from "../kit";

const LOG = { wall: "#D9A46A", side: "#B07A45" };

/** Log cabin with a smoking chimney, a woodpile and a pine behind it. */
const cabin = definePiece({
  id: "bos-cabin",
  biome: "bos",
  w: 110,
  h: 96,
  render: (c, X) => {
    const back = pine(X(-36), c.y - 14, 1.05);
    if (c.stage === 0) return back + plot(X(4), c.y - 2, 1.1) + seedlings(X(-12), c.y + 6, 3);
    if (c.stage === 1) return back + building(X(2), c.y, 1, { ...LOG, craneSide: c.side });
    const pile =
      `<g transform="translate(${X(36)} ${c.y + 2})"><ellipse cx="3" cy="1" rx="11" ry="3" fill="${C.shadow}" opacity=".16"/>` +
      [[-5, -4], [3, -4], [-1, -10]].map(([lx, ly]) => `<circle cx="${lx}" cy="${ly}" r="4" fill="#C99A6B"/><circle cx="${lx}" cy="${ly}" r="1.6" fill="#8a5a3a"/>`).join("") +
      `</g>`;
    return (
      back +
      house(X(2), c.y, 1.1, { ...LOG, roof: "#4F8A5B", roofD: "#3B6E47", alive: true, logs: "#7a4f33" }) +
      pile +
      flowers(X(-18), c.y + 8, c.rng, 6, 12)
    );
  },
});

export const bos: WorldBiome = {
  id: "bos",
  ground: ["#BFEBD6", "#CBEFD9"],
  patch: "#E6FBF0",
  bannerBg: ["#12A884", "#0E7F62"],
  banner: "world.biome.bos",
  density: 0.6,
  flora: [
    { weight: 4, radius: 19, render: (x, y, _r, s) => pine(x, y, 0.7 * s) },
    { weight: 2.5, radius: 18, render: (x, y, _r, s) => tree(x, y, 0.72 * s) },
    { weight: 2, radius: 13, render: (x, y, _r, s) => bushes(x, y, 0.8 * s) },
    { weight: 0.6, radius: 10, render: (x, y, _r, s) => mushrooms(x, y, 0.9 * s) },
    { weight: 0.8, radius: 9, render: (x, y, _r, s) => rock(x, y, 0.9 * s) },
  ],
  pieces: [cabin],
};
