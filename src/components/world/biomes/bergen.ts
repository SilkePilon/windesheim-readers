import { boulder, building, definePiece, edelweiss, fir, house, plot, snowPatch, type WorldBiome } from "../kit";

const CHALET = { wall: "#B07A45", side: "#8a5a3a", roof: "#F4F1FF", roofD: "#C9C3E3" };

/** Swiss chalet with flower boxes, a snowy roof, a fir and a Swiss flag. */
const chalet = definePiece({
  id: "bergen-chalet",
  biome: "bergen",
  w: 108,
  h: 98,
  render: (c, X) => {
    const back = fir(X(-38), c.y - 12, 1, true);
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

export const bergen: WorldBiome = {
  id: "bergen",
  ground: ["#CFEBC6", "#E6EEF5"],
  patch: "#F4FAFF",
  bannerBg: ["#4D7FE0", "#3560B8"],
  banner: "world.biome.bergen",
  density: 0.5,
  flora: [
    { weight: 3, radius: 20, render: (x, y, r, s) => fir(x, y, 0.7 * s, r() < 0.4) },
    { weight: 1.5, radius: 14, render: (x, y, _r, s) => boulder(x, y, 0.8 * s) },
    { weight: 1.2, radius: 8, render: (x, y, _r, s) => edelweiss(x, y, s) },
    { weight: 1.2, radius: 22, render: (x, y, _r, s) => snowPatch(x, y, 0.9 * s) },
  ],
  pieces: [chalet],
};
