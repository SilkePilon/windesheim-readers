import { C, blossom, building, bushes, definePiece, flowers, hedge, house, plot, scaffold, seedlings, tree, tulipStrip, windmill, type WorldBiome } from "../kit";

const ROOFS: [string, string][] = [
  [C.pink, C.pinkD],
  [C.grape, C.grapeD],
  [C.orange, C.orangeD],
];

/** Windmill with the miller's house (the mockup's piece). */
const windmillPiece = definePiece({
  id: "dorp-windmill",
  biome: "dorp",
  w: 110,
  h: 96,
  render: (c, X) => {
    if (c.stage === 0) {
      const base = `<ellipse cx="${X(-26)}" cy="${c.y - 4}" rx="16" ry="5.5" fill="#CFC3A8"/><ellipse cx="${X(-26)}" cy="${c.y - 6}" rx="12" ry="3.6" fill="#E9D6AE"/>`;
      return base + plot(X(22), c.y, 1) + seedlings(X(-24), c.y + 10, 4, 8);
    }
    if (c.stage === 1)
      return (
        windmill(X(-26), c.y - 6, 0.78, false, false) +
        `<g transform="translate(${X(-26)} ${c.y - 6}) scale(.78)">${scaffold(-16, 0, 32, 50)}</g>` +
        building(X(26), c.y + 4, 0.72, { craneSide: 0 }) +
        tulipStrip(X(-2), c.y + 14, 0.8, c.rng)
      );
    const [roof, roofD] = ROOFS[Math.floor(c.rng() * ROOFS.length)];
    return (
      windmill(X(-26), c.y - 6, 0.78, true) +
      house(X(26), c.y + 4, 0.8, { alive: true, roof, roofD }) +
      tulipStrip(X(-2), c.y + 14, 0.8, c.rng) +
      flowers(X(42), c.y + 10, c.rng, 4, 8)
    );
  },
});

export const dorp: WorldBiome = {
  id: "dorp",
  ground: ["#E3F2C4", "#F1F0CC"],
  patch: "#FFFBEA",
  bannerBg: ["#FF8A1F", "#D68300"],
  banner: "world.biome.dorp",
  density: 0.45,
  flora: [
    { weight: 1.5, radius: 19, render: (x, y, _r, s) => blossom(x, y, 0.72 * s) },
    { weight: 1.5, radius: 18, render: (x, y, r, s) => tree(x, y, 0.72 * s, r() < 0.5 ? "y" : "g") },
    { weight: 1.2, radius: 16, render: (x, y, _r, s) => hedge(x, y, 0.8 * s) },
    { weight: 1.8, radius: 20, render: (x, y, r, s) => tulipStrip(x, y, 0.9 * s, r) },
    { weight: 1, radius: 13, render: (x, y, _r, s) => bushes(x, y, 0.8 * s, ["#7CC96A", "#A6E08F"]) },
  ],
  pieces: [windmillPiece],
};
