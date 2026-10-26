import {
  C,
  anim,
  bench,
  birdV,
  block,
  bunting,
  crane,
  crate,
  definePiece,
  facing,
  fairyLights,
  fit,
  flowers,
  glow,
  lamp,
  mp,
  person,
  place,
  planeTree,
  planter,
  plot,
  r1,
  scaffold,
  seedlings,
  sh,
  star,
  tree,
  win,
  type WorldBiome,
} from "../kit";
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
        sh(c.x + 2, base, 40, 6) +
        facade(x0, base, 22, 52, cols[0], false, "step") +
        facade(x0 + 22, base, 22, 60, cols[1], false, "bell") +
        `<rect x="${x0 + 44}" y="${base - 22}" width="22" height="22" fill="${cols[2][0]}"/>` +
        `<g>${scaffold(x0 + 44, base, 22, 40)}</g>` +
        crane(c.side === 1 ? x0 + 70 : x0 - 2, base, 76, c.side === 1 ? -30 : 30) +
        water
      );
    const boat = `<g transform="translate(${X(26)} ${c.y + 8})"><g class="bob"><path d="M-11 -2 H11 Q9 3 0 3 Q-9 3 -11 -2Z" fill="${C.pink}"/><path d="M-11 -2 H11 L10 0 H-10Z" fill="${C.pinkD}"/><rect x="-4" y="-7" width="7" height="5" rx="1" fill="${C.cream}"/></g></g>`;
    return (
      sh(c.x + 2, base, 40, 6) +
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

const BRICK = "#D9785A";
const BRICK_D = "#A9503C";
const BRICK_L = "#E8977A";
const STONE = "#F3E3C3";
const STONE_D = "#D8C49C";
const SLATE = "#8C82B5";
const SLATE_D = "#5A4E80";

/** Cobbled square: a paved ellipse, lighter in the middle, with a few setts. */
function cobbles(x: number, y: number, rx: number, ry: number) {
  const setts = [[-0.7, -0.1], [-0.42, 0.42], [-0.15, -0.36], [0.18, 0.44], [0.46, -0.24], [0.72, 0.16], [0.02, 0.06], [-0.5, -0.52], [0.36, 0.7]]
    .map(([a, b]) => `<rect x="${r1(x + a * rx - 1.8)}" y="${r1(y + b * ry - 0.8)}" width="3.6" height="1.6" rx=".6" fill="#C4BCDF"/>`)
    .join("");
  return `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${rx}" ry="${ry}" fill="#D3CCE8"/><ellipse cx="${r1(x - rx * 0.06)}" cy="${r1(y - ry * 0.12)}" rx="${r1(rx * 0.8)}" ry="${r1(ry * 0.62)}" fill="#ECE8F7"/>${setts}`;
}

/** A pallet of bricks (stage 0/1 garnish). */
const brickPallet = (x: number, y: number) =>
  place(
    x,
    y,
    1,
    `${sh(2, 0, 11, 3)}${block(-8, 0, 15, 2.4, 6, C.woodL, C.wood)}${block(-7, -2.4, 13, 7, 5, BRICK, BRICK_D, BRICK_L)}<path d="M-7 -5.8 H6 M-3 -2.4 V-5.8 M2 -5.8 V-9.4" stroke="${BRICK_D}" stroke-width=".7"/>`,
  );

/** A small pennant on a pole, fluttering (local coords: pole foot at (x, y)). */
const pennant = (x: number, y: number, h: number, col: string) =>
  `<path d="M${x} ${y} V${y - h}" stroke="${C.ink}" stroke-width=".9"/><path class="flag" d="M${x + 0.5} ${y - h} L${x + 8.5} ${y - h + 2.4} L${x + 0.5} ${y - h + 4.8}Z" fill="${col}"/><circle cx="${x}" cy="${y - h - 0.8}" r="1.1" fill="${C.yellow}"/>`;

/** The Peperbus (Onze Lieve Vrouwetoren): brick tower, stone lantern, onion domes. Unmirrored. */
function peperbus(x: number, y: number, s: number, done: boolean) {
  const bands = (h: number) =>
    [16, 33]
      .filter((b) => b < h)
      .map((b) => `<rect x="-8" y="${-b - 0.8}" width="16" height="1.6" fill="${STONE}"/><path d="M8 ${-b} L15 ${r1(-b - 1.5)}" stroke="${STONE_D}" stroke-width="1.6"/>`)
      .join("");
  const door = `<path d="M-3 0 V-7 Q0 -10.4 3 -7 V0Z" fill="${C.wood}"/><path d="M-3 -7 Q0 -10.4 3 -7" stroke="${STONE}" stroke-width="1.2" fill="none"/>`;
  if (!done) return place(x, y, s, sh(5, 0, 20, 5) + block(-8, 0, 16, 26, 7, BRICK, BRICK_D) + bands(26) + door + scaffold(-11, 0, 29, 40));
  const lw = (wx: number) => {
    const d = `M${wx} -51 V-55.6 Q${r1(wx + 1.2)} -58 ${r1(wx + 2.4)} -55.6 V-51Z`;
    return `<path d="${d}" fill="${C.glass}"/><path class="wl-on" d="${d}" fill="${C.yellowL}"/>`;
  };
  return (
    place(
      x,
      y,
      s,
      sh(5, 0, 22, 5.5) +
        block(-8, 0, 16, 46, 7, BRICK, BRICK_D) +
        `<rect x="-8" y="-46" width="1.6" height="46" fill="#fff" opacity=".14"/>` +
        bands(46) +
        door +
        `<circle cx="0" cy="-24.6" r="4.2" fill="${STONE}"/><circle cx="0" cy="-24.6" r="4.2" fill="none" stroke="${STONE_D}" stroke-width="1"/><path d="M0 -24.6 V-27.4 M0 -24.6 L2 -23.8" stroke="${C.ink}" stroke-width=".9" stroke-linecap="round"/>` +
        `<path d="M-5 -37 V-41.6 Q-3.5 -44 -2 -41.6 V-37Z M2 -37 V-41.6 Q3.5 -44 5 -41.6 V-37Z" fill="#5A3A3A"/><path d="M10.4 -38.4 L12.6 -38.9 L12.6 -43 L10.4 -42.5Z" fill="#7E3828"/>` +
        block(-9.6, -46, 19.2, 2.6, 8.6, STONE, STONE_D, C.cream) +
        `<rect x="-6" y="-61" width="12" height="12.4" fill="${STONE}"/><rect x="2.2" y="-61" width="3.8" height="12.4" fill="${STONE_D}"/><path d="M6 -48.6 L8.6 -49.4 L8.6 -61.6 L6 -61Z" fill="#BFAE88"/>` +
        lw(-4.6) +
        lw(-1.2) +
        `<rect x="-7.4" y="-63" width="16.4" height="2.2" rx=".8" fill="${STONE_D}"/><rect x="-7.4" y="-63" width="10" height="1" fill="${C.cream}"/>` +
        `<path d="M-7 -63 Q-11 -68 -5.4 -72 Q-1.4 -74.4 0 -79 Q1.4 -74.4 5.4 -72 Q11 -68 7 -63Z" fill="${SLATE}"/><path d="M1.6 -63 L7 -63 Q11 -68 5.4 -72 Q1.4 -74.4 0 -79 Q2.4 -71 1.6 -63Z" fill="${SLATE_D}"/>` +
        `<path d="M-6.2 -65.6 Q-6.8 -69.4 -3 -71.6" stroke="#fff" stroke-opacity=".45" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
        `<rect x="-2.6" y="-85" width="5.2" height="6.4" fill="${STONE}"/><rect x=".6" y="-85" width="2" height="6.4" fill="${STONE_D}"/><rect x="-1.6" y="-83.6" width="1.4" height="3.2" rx=".7" fill="#5A3A3A"/>` +
        `<path d="M-3.4 -85 Q-4.4 -88.6 0 -92 Q4.4 -88.6 3.4 -85Z" fill="${SLATE}"/><path d="M.8 -85 L3.4 -85 Q4.4 -88.6 0 -92 Q1.6 -88 .8 -85Z" fill="${SLATE_D}"/>` +
        pennant(0, -92, 8, C.pink),
    ) + glow(x - 1.2 * s, y - 54 * s, 13 * s)
  );
}

/** The Peperbus on a cobbled square with a bench, a lamp and a plane tree. */
const peperbusPiece = definePiece({
  id: "stad-peperbus",
  biome: "stad",
  w: 108,
  h: 100,
  below: 10,
  render: (c, X) => {
    const tx = X(-26);
    const ty = c.y - 8;
    const s = 0.92;
    const sq = cobbles(X(4), c.y - 2, 50, 11);
    if (c.stage === 0)
      return sq + place(tx, ty, s, sh(5, 0, 20, 5) + block(-9.6, 0, 19.2, 3, 8.6, STONE, STONE_D, C.cream)) + brickPallet(X(4), c.y - 4) + plot(X(30), c.y + 2, 0.7);
    if (c.stage === 1) return sq + crane(X(-44), c.y - 6, 84, c.side * 30) + peperbus(tx, ty, s, false) + brickPallet(X(4), c.y - 2) + bench(X(28), c.y + 4, 0.75);
    return (
      sq +
      peperbus(tx, ty, s, true) +
      planeTree(X(38), c.y - 14, 0.62) +
      person(X(10), c.y - 8, C.grape, 1) +
      bench(X(22), c.y + 4, 0.75) +
      lamp(X(-4), c.y + 6, 0.7) +
      birdV(X(0), c.y - 78, 1, true) +
      birdV(X(12), c.y - 68, 0.8, true, 0.7)
    );
  },
});

/** The Sassenpoort: brick gatehouse with four slate-capped turrets and a hipped roof. Unmirrored. */
function sassenpoort(x: number, y: number, s: number, done: boolean) {
  const turret = (cx: number, by: number, h: number, roof: boolean) =>
    `<rect x="${cx - 5.5}" y="${r1(by - h)}" width="11" height="${h}" fill="${BRICK_L}"/><rect x="${cx + 1.5}" y="${r1(by - h)}" width="4" height="${h}" fill="${BRICK_D}"/><rect x="${cx - 5.5}" y="${r1(by - h)}" width="1.4" height="${h}" fill="#fff" opacity=".16"/>` +
    `<rect x="${cx - 5.5}" y="${r1(by - h * 0.55)}" width="11" height="1.6" fill="${STONE}"/><rect x="${cx - 1.6}" y="${r1(by - h * 0.82)}" width="2.2" height="4.6" rx="1.1" fill="#5A3A3A"/>` +
    (roof
      ? `<rect x="${cx - 7}" y="${r1(by - h - 2)}" width="14" height="2.4" rx=".8" fill="${STONE}"/><path d="M${cx - 6.6} ${r1(by - h - 2)} L${cx} ${r1(by - h - 22)} L${cx + 6.6} ${r1(by - h - 2)}Z" fill="${SLATE}"/><path d="M${cx} ${r1(by - h - 22)} L${cx + 6.6} ${r1(by - h - 2)} L${cx + 1.4} ${r1(by - h - 2)}Z" fill="${SLATE_D}"/><circle cx="${cx}" cy="${r1(by - h - 23)}" r="1.3" fill="${C.yellow}"/>`
      : "");
  const gate = `<path d="M-6 0 V-11 Q-6 -18.6 0 -20.4 Q6 -18.6 6 -11 V0Z" fill="${STONE}"/><path d="M-4.6 0 V-11 Q-4.6 -17 0 -18.6 Q4.6 -17 4.6 -11 V0Z" fill="#3A2A4A"/>`;
  if (!done)
    return place(x, y, s, sh(10, 0, 32, 6) + turret(32, -3.5, 20, false) + block(-16, 0, 32, 22, 16, BRICK, BRICK_D) + gate + turret(-16, 1, 24, false) + turret(16, 1, 24, false) + scaffold(-20, 1, 40, 32));
  return (
    place(
      x,
      y,
      s,
      sh(10, 0, 34, 6) +
        turret(32, -3.5, 40, true) +
        block(-16, 0, 32, 34, 16, BRICK, BRICK_D) +
        `<path d="M-16 -12 H16 M-16 -24 H16 M16 -12 L32 -15.5 M16 -24 L32 -27.5" stroke="${BRICK_D}" stroke-width=".8" opacity=".35"/>` +
        `<path d="M-16 -34 L0 -37.5 L8 -62Z" fill="#A79CD6"/><path d="M-16 -34 L16 -34 L8 -62Z" fill="${SLATE}"/><path d="M16 -34 L32 -37.5 L8 -62Z" fill="${SLATE_D}"/><path d="M-14.6 -34.6 L8 -62" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" stroke-linecap="round"/>` +
        `<rect x="6.4" y="-68" width="3.2" height="6.4" fill="${STONE}"/><rect x="8.4" y="-68" width="1.2" height="6.4" fill="${STONE_D}"/><path d="M5.6 -68 L8 -80 L10.4 -68Z" fill="${SLATE}"/><path d="M8 -80 L10.4 -68 L8.4 -68Z" fill="${SLATE_D}"/>` +
        pennant(8, -80, 8, C.yellow) +
        `<path d="M20.4 -20.9 L23 -21.5 L23 -27.5 L20.4 -26.9Z M26.4 -22.2 L29 -22.8 L29 -28.8 L26.4 -28.2Z" fill="#7E3828"/>` +
        win(-12, -31, 4.4, 7, false, 2) +
        win(7.6, -31, 4.4, 7, false, 2) +
        `<rect x="-2.6" y="-31" width="5.2" height="7" rx="1" fill="${STONE}"/><path d="M-1.4 -29.6 H1.4 V-26.6 Q0 -25.2 -1.4 -26.6Z" fill="#E8364F"/>` +
        gate +
        `<path d="M-2.4 -16 V-11 M0 -18 V-11 M2.4 -16 V-11 M-4.4 -12 H4.4" stroke="#8C82B5" stroke-width=".8"/>` +
        turret(-16, 1, 42, true) +
        turret(16, 1, 42, true),
    ) +
    glow(x - 9.8 * s, y - 27.5 * s, 9 * s) +
    glow(x + 9.8 * s, y - 27.5 * s, 9 * s)
  );
}

/** Sassenpoort city gate, a cobbled street running out of the arch, lamps and a plane tree. */
const gatePiece = definePiece({
  id: "stad-gate",
  biome: "stad",
  w: 106,
  h: 88,
  below: 12,
  render: (c, X) => {
    const s = 0.88;
    const gx = fit(c, X(-10), 30, 47, 53);
    const gy = c.y - 10;
    const street =
      `<path d="M${r1(gx - 7)} ${gy} L${r1(gx + 7)} ${gy} L${r1(gx + 15)} ${c.y + 10} L${r1(gx - 15)} ${c.y + 10}Z" fill="#D3CCE8"/><path d="M${r1(gx - 4)} ${gy} L${r1(gx + 4)} ${gy} L${r1(gx + 9)} ${c.y + 10} L${r1(gx - 9)} ${c.y + 10}Z" fill="#ECE8F7"/>` +
      [[-3, -4], [2, 0], [-5, 4], [4, 7], [0, 9]].map(([a, b]) => `<rect x="${r1(gx + a - 1.6)}" y="${c.y + b - 0.7}" width="3.2" height="1.4" rx=".6" fill="#C4BCDF"/>`).join("");
    if (c.stage === 0)
      return (
        street +
        place(gx, gy, s, `${block(-17, 0, 34, 3, 16, STONE, STONE_D, C.cream)}<ellipse cx="-16" cy="1.6" rx="6.4" ry="2.2" fill="${STONE_D}"/><ellipse cx="16" cy="1.6" rx="6.4" ry="2.2" fill="${STONE_D}"/>`) +
        plot(X(32), c.y - 2, 0.7) +
        brickPallet(X(-40), c.y + 4)
      );
    if (c.stage === 1) return street + crane(X(42), c.y - 4, 80, -c.side * 30) + sassenpoort(gx, gy, s, false) + brickPallet(X(-38), c.y + 4) + brickPallet(X(24), c.y + 6);
    return (
      street +
      sassenpoort(gx, gy, s, true) +
      planeTree(X(38), c.y - 6, 0.62) +
      lamp(gx - 22, c.y + 6, 0.66) +
      lamp(gx + 22, c.y + 6, 0.66) +
      person(X(4), c.y + 4, C.pink, 2) +
      birdV(X(30), c.y - 76, 1, true) +
      birdV(X(40), c.y - 68, 0.8, true, 0.6)
    );
  },
});

type Goods = "veg" | "flowers" | "cheese";
/** Market stall in 3/4 (unmirrored): counter, poles, striped pyramid canopy. `canopy` false = bare frame. */
function marketStall(x: number, y: number, a: [string, string], goods: Goods, open: boolean, canopy = open) {
  const wares =
    goods === "veg"
      ? `<ellipse cx="-8" cy="-10.6" rx="3" ry="2.2" fill="#5FAF55"/><ellipse cx="-8.6" cy="-11.4" rx="1.6" ry="1" fill="#8FD47A"/><circle cx="-2.6" cy="-10.6" r="1.8" fill="${C.orange}"/><circle cx="-.4" cy="-11" r="1.8" fill="${C.orange}"/><circle cx="-1.6" cy="-12.6" r="1.8" fill="#FFA24D"/>` +
        `<circle cx="4" cy="-10.8" r="1.7" fill="#E8364F"/><circle cx="6.4" cy="-11" r="1.7" fill="#E8364F"/><circle cx="5.2" cy="-12.6" r="1.7" fill="#FF5C6F"/><circle cx="10.6" cy="-12" r="1.6" fill="#9C4FD0"/><circle cx="12.6" cy="-12.4" r="1.6" fill="#7A3CB0"/>`
      : goods === "flowers"
        ? [[-8, "#FF5C8A"], [-2, "#FFC83D"], [4, "#fff"], [10, "#8C66FF"]]
            .map(([fx, col]) => `<rect x="${+fx - 2.2}" y="-12.6" width="4.4" height="3.6" rx=".6" fill="#8C82B5"/><circle cx="${fx}" cy="-14" r="2" fill="${col}"/><circle cx="${+fx - 1.6}" cy="-13" r="1.6" fill="${col}"/><circle cx="${+fx + 1.6}" cy="-13" r="1.6" fill="${col}"/><path d="M${+fx - 0.6} -15 l-.6 -1.6 M${+fx + 0.8} -15 l.6 -1.8" stroke="${C.green}" stroke-width=".9"/>`)
            .join("")
        : `<ellipse cx="-7" cy="-10.4" rx="4.6" ry="2.2" fill="#E8A92A"/><rect x="-11.6" y="-13.6" width="9.2" height="3.2" fill="#FFC83D"/><ellipse cx="-7" cy="-13.6" rx="4.6" ry="1.9" fill="#FFE08A"/>` +
          `<ellipse cx="3" cy="-10.4" rx="4.6" ry="2.2" fill="#E8A92A"/><rect x="-1.6" y="-14.4" width="9.2" height="4" fill="#FFC83D"/><ellipse cx="3" cy="-14.4" rx="4.6" ry="1.9" fill="#FFE08A"/><path d="M9 -10.4 L14 -10.6 L12.6 -13.4Z" fill="#FFC83D"/>`;
  let cv = "";
  if (canopy) {
    const L = -14.5;
    const R = 12.5;
    const ty = -23;
    cv += `<path d="M${R} ${ty} L${R + 9} ${ty - 2} L3.5 -34Z" fill="${a[1]}"/>`;
    for (let i = 0; i < 6; i++) {
      const x0 = r1(L + (i * (R - L)) / 6);
      const x1 = r1(L + ((i + 1) * (R - L)) / 6);
      const col = i % 2 ? "#fff" : a[0];
      cv += `<path d="M${x0} ${ty} L${x1} ${ty} L3.5 -34Z" fill="${col}"/><path d="M${x0} ${ty} Q${r1((x0 + x1) / 2)} ${ty + 3.4} ${x1} ${ty}Z" fill="${col}"/>`;
    }
    cv += `<path d="M${R} ${ty} L${R + 9} ${ty - 2} Q${R + 6.8} ${ty + 0.8} ${R + 4.5} ${ty - 1}Q${R + 2.2} ${ty + 1.8} ${R} ${ty}Z" fill="${a[1]}"/><circle cx="3.5" cy="-35" r="1.3" fill="${C.yellow}"/>`;
  }
  return place(
    x,
    y,
    1,
    `${sh(6, 0, 20, 4)}<rect x="18.6" y="-25" width="1.4" height="23.2" fill="${C.wood}"/>` +
      block(-12, 0, 22, 9, 8, C.woodL, C.wood, "#E2BC85") +
      `<path d="M-12 -4.6 H10" stroke="${C.wood}" stroke-width=".9" opacity=".6"/>` +
      `<rect x="-13" y="-23" width="1.6" height="23" fill="${C.woodD}"/><rect x="10.4" y="-23" width="1.6" height="23" fill="${C.woodD}"/>` +
      (open ? wares : "") +
      cv,
  );
}

/** Market square (Grote Markt): three stalls under bunting, shoppers, crates of apples. */
const market = definePiece({
  id: "stad-market",
  biome: "stad",
  w: 108,
  h: 82,
  below: 10,
  render: (c, X) => {
    const sq = cobbles(X(0), c.y - 16, 54, 22);
    const S: [number, number, [string, string], Goods][] = [
      [fit(c, X(-30), 20, 32), c.y - 30, [C.pink, C.pinkD], "veg"],
      [X(10), c.y - 34, ["#3F8FE0", "#2A6DB5"], "flowers"],
      [X(-8), c.y - 2, [C.greenM, C.green], "cheese"],
    ];
    if (c.stage === 0)
      return (
        sq +
        S.map(([sx, sy]) => `<path d="M${sx - 13} ${sy} H${sx + 11} L${sx + 19} ${sy - 2} H${sx - 5}Z" fill="none" stroke="#fff" stroke-width="1.4" stroke-dasharray="3 2"/>`).join("") +
        crate(X(36), c.y - 8, 0.85) +
        crate(X(40), c.y - 18, 0.75) +
        plot(X(34), c.y + 4, 0.6)
      );
    if (c.stage === 1)
      return sq + marketStall(S[0][0], S[0][1], S[0][2], "veg", false, true) + marketStall(S[1][0], S[1][1], S[1][2], "flowers", false) + crate(X(36), c.y - 8, 0.85) + crate(X(-8), c.y + 2, 0.8) + crate(X(4), c.y - 2, 0.7);
    return (
      sq +
      S.slice(0, 2).map(([sx, sy, a, gds]) => marketStall(sx, sy, a, gds, true)).join("") +
      bunting(S[0][0] + 3.5, S[0][1] - 35, S[1][0] + 3.5, S[1][1] - 35, true) +
      person(X(-22), c.y - 14, C.yellow, 0) +
      person(X(30), c.y - 22, C.grape, 1) +
      crate(X(42), c.y - 6, 0.75) +
      `<circle cx="${X(42) - 3}" cy="${c.y - 19}" r="1.8" fill="#E8364F"/><circle cx="${X(42) + 1}" cy="${c.y - 19.6}" r="1.8" fill="#E8364F"/><circle cx="${X(42) - 1}" cy="${c.y - 21}" r="1.8" fill="#FF5C6F"/>` +
      marketStall(S[2][0], S[2][1], S[2][2], "cheese", true) +
      person(X(26), c.y + 4, C.pink, 2) +
      birdV(X(-40), c.y - 70, 0.9, true, 0.3)
    );
  },
});

/** Brick arch bridge in elevation (unmirrored); `done` false = piers on wooden centering. */
function archBridge(x: number, y: number, done: boolean) {
  if (!done)
    return place(
      x,
      y,
      1,
      `<path d="M-40 3 V-10 H-15 V3Z M15 3 V-10 H40 V3Z" fill="${BRICK}"/><path d="M-40 -10 H-15 M15 -10 H40" stroke="${STONE}" stroke-width="1.6"/>` +
        `<path d="M-15 1 Q-15 -13 0 -13 Q15 -13 15 1" stroke="${C.woodL}" stroke-width="2.4" fill="none"/><path d="M-15 1 H15 M0 1 V-13 M0 1 L-10 -9.4 M0 1 L10 -9.4" stroke="${C.woodL}" stroke-width="1.2"/>` +
        scaffold(-40, 3, 24, 24),
    );
  return place(
    x,
    y,
    1,
    `<rect x="-35" y="-27" width="78" height="6" fill="${BRICK_D}"/><rect x="-35" y="-28.4" width="78" height="1.8" rx=".8" fill="${STONE_D}"/>` +
      `<path d="M-40 3 V-15 H40 V3 H15 V1 Q15 -13 0 -13 Q-15 -13 -15 1 V3Z" fill="${BRICK}"/>` +
      `<path d="M-15 1 Q-15 -13 0 -13 Q15 -13 15 1 L13 1 Q12.6 -9.6 0 -10.4 Q-12.6 -9.6 -13 1Z" fill="${C.ink}" opacity=".3"/>` +
      `<path d="M-17 1 Q-17 -15.4 0 -15.4 Q17 -15.4 17 1" stroke="${STONE}" stroke-width="2.4" fill="none"/><rect x="-1.8" y="-17.6" width="3.6" height="4.2" rx=".6" fill="${STONE}"/>` +
      `<path d="M-40 -5 H-18 M18 -5 H40 M-40 -10 H-17.6 M17.6 -10 H40" stroke="${BRICK_D}" stroke-width=".8" opacity=".4"/>` +
      `<rect x="-42" y="-21" width="84" height="6" fill="${BRICK_L}"/><rect x="-42" y="-17" width="84" height="2" fill="${BRICK_D}" opacity=".35"/><rect x="-43" y="-22.6" width="86" height="2.4" rx="1" fill="${STONE}"/>`,
  );
}

const tourBoat =
  `<path d="M-22 -3 H19 Q23 -3 22 0 Q20 3 16 3 H-19 Q-22 2 -22 -3Z" fill="${C.ink}"/><rect x="-22" y="-4" width="44" height="2" rx=".8" fill="#fff"/>` +
  `<rect x="-16" y="-10.5" width="30" height="7" rx="3" fill="${C.glass}"/><path d="M-15 -8.4 H13" stroke="#fff" stroke-opacity=".7" stroke-width="1"/><path d="M-10 -10.5 V-3.5 M-4 -10.5 V-3.5 M2 -10.5 V-3.5 M8 -10.5 V-3.5" stroke="#8C82B5" stroke-width=".8"/><rect x="-17" y="-11.8" width="32" height="1.8" rx=".9" fill="#fff"/>`;
/** Gracht with a brick arch bridge, lamps on the parapet and a tour boat gliding out from under it. */
const bridge = definePiece({
  id: "stad-bridge",
  biome: "stad",
  w: 108,
  h: 84,
  below: 14,
  render: (c, X) => {
    const course = mp("M-12 -62 L8 -6", X, c.y);
    const by = c.y - 38;
    const bx = X(-3);
    const canal = (water: boolean) =>
      `<path d="${course}" stroke="${water ? "#C4BCDF" : "#D9C49A"}" stroke-width="40" stroke-linecap="round"/><path d="${course}" stroke="${water ? "#9C93C8" : "#C9A36B"}" stroke-width="34" stroke-linecap="round"/>` +
      (water
        ? `<path d="${course}" stroke="${C.water}" stroke-width="31" stroke-linecap="round"/><path d="${mp("M-15 -60 L4 -8", X, c.y)}" stroke="${C.waterL}" stroke-width="7" stroke-linecap="round"/>`
        : "");
    const trees = planeTree(X(-38), c.y + 2, 0.6) + tree(X(34), c.y - 50, 0.5, "l");
    if (c.stage === 0) return canal(false) + place(bx, by, 1, `<path d="M-40 3 V-3 H-17 V3Z M17 3 V-3 H40 V3Z" fill="${STONE_D}"/>`) + plot(X(32), c.y - 4, 0.62) + seedlings(X(-38), c.y + 4, 3);
    if (c.stage === 1) return trees + canal(true) + archBridge(bx, by, false) + brickPallet(X(36), c.y + 2);
    return (
      trees +
      canal(true) +
      `<path class="water" d="${mp("M-8 -56 L8 -10", X, c.y)}" stroke="#fff" stroke-width="1.6" stroke-dasharray="6 12" stroke-linecap="round" opacity=".85"/>` +
      archBridge(bx, by, true) +
      lamp(bx - 36, by - 22, 0.5) +
      lamp(bx + 36, by - 22, 0.5) +
      anim(X(3), c.y - 16, "drift", anim(0, 0, "float", facing(0, 0, c.side, 0.7, tourBoat))) +
      birdV(X(30), c.y - 74, 0.9, true)
    );
  },
});

/** Parasol over a café table with chairs; `who` seats a guest with a steaming cup. */
function parasol(x: number, y: number, a: [string, string], open: boolean, who = -1) {
  const guest =
    who < 0
      ? ""
      : `<path d="M-7.6 -8 L-7.6 -12.6 Q-5.4 -14 -3.2 -12.6 L-3.2 -8Z" fill="${[C.yellow, C.greenM, C.pink][who % 3]}"/><circle cx="-5.4" cy="-16" r="2.4" fill="${["#F2C29B", "#9C6644", "#D9A06E"][who % 3]}"/><path d="M-7.8 -16.4 Q-7.4 -19 -5.4 -18.8 Q-3.2 -18.8 -3 -16.4 Q-4.8 -17.6 -7.8 -16.4Z" fill="${["#5E3B26", "#241A4A", "#E9B44C"][who % 3]}"/>`;
  const cup =
    who < 0
      ? ""
      : `<rect x="1" y="-10.4" width="2.4" height="2.4" rx=".6" fill="#fff"/>` + [0, 1.4].map((d) => `<circle class="smoke" style="animation-delay:${d}s" cx="2.2" cy="-12.4" r="1.3" fill="#fff"/>`).join("");
  const top = open
    ? `<path d="M-13 -19 Q-11 -26 0 -27.6 Q11 -26 13 -19Z" fill="${a[0]}"/><path d="M-4.4 -19 Q-4 -25 0 -27.6 Q4 -25 4.4 -19Z" fill="#fff"/><path d="M4.4 -19 Q4 -25 0 -27.6 Q11 -26 13 -19Z" fill="${a[1]}"/>` +
      `<path d="M-13 -19 Q-10.8 -16.8 -8.7 -19 Q-6.5 -16.8 -4.4 -19 Q-2.2 -16.8 0 -19 Q2.2 -16.8 4.4 -19 Q6.5 -16.8 8.7 -19 Q10.8 -16.8 13 -19Z" fill="${a[0]}"/><path d="M4.4 -19 Q6.5 -16.8 8.7 -19 Q10.8 -16.8 13 -19Z" fill="${a[1]}"/><circle cx="0" cy="-28.4" r="1.1" fill="${C.ink}"/>`
    : `<path d="M-1.8 -10 L0 -27 L1.8 -10Z" fill="${a[0]}"/><path d="M0 -27 L1.8 -10 L.6 -10Z" fill="${a[1]}"/>`;
  return place(
    x,
    y,
    1,
    `${sh(2, 0, 11, 2.6)}<path d="M-10.6 0 V-4.6 H-7 V0 M-10.6 -4.6 V-9.6 M10.6 0 V-4.6 H7 V0 M10.6 -4.6 V-9.6" stroke="${C.woodD}" stroke-width="1.2" fill="none"/>` +
      guest +
      `<rect x="-.6" y="-7.4" width="1.2" height="7.4" fill="#3A3266"/><path d="M-3 0 H3" stroke="#3A3266" stroke-width="1.2"/><ellipse cx="0" cy="-7.2" rx="6.4" ry="1.9" fill="#DCD6F0"/><ellipse cx="0" cy="-7.8" rx="6.4" ry="1.9" fill="#fff"/>` +
      cup +
      `<rect x="-.7" y="-27" width="1.4" height="19" fill="#3A3266"/>` +
      top,
  );
}

/** Corner café (unmirrored): coral walls, striped awning, flower boxes; lit windows at night. */
function cafeHouse(x: number, y: number, done: boolean) {
  const W = "#E58A6E";
  const WD = "#C46A50";
  if (!done)
    return place(x, y, 1, sh(6, 0, 26, 6) + block(-22, 0, 30, 24, 12, W, WD) + win(-19, -17, 14, 10, false, 1.5) + `<rect x="0" y="-14" width="6" height="14" rx="1" fill="${C.woodD}"/>` + scaffold(-24, 0, 46, 46));
  let awning = "";
  for (let i = 0; i < 7; i++) {
    const ax = -22.5 + i * 4.4;
    const col = i % 2 ? "#fff" : C.grape;
    awning += `<path d="M${r1(ax + 0.6)} -21 H${r1(ax + 5)} L${r1(ax + 4.4)} -15 H${r1(ax)}Z" fill="${col}"/><path d="M${r1(ax)} -15 Q${r1(ax + 2.2)} -12.8 ${r1(ax + 4.4)} -15Z" fill="${col}"/>`;
  }
  const box = (bx: number) => `<rect x="${bx - 0.6}" y="-27.6" width="6.2" height="2" rx=".6" fill="${C.woodL}"/><circle cx="${bx + 0.6}" cy="-28.2" r="1.3" fill="${C.pink}"/><circle cx="${bx + 3}" cy="-28.4" r="1.3" fill="#fff"/><circle cx="${bx + 4.8}" cy="-28" r="1.2" fill="${C.pink}"/>`;
  return (
    place(
      x,
      y,
      1,
      sh(6, 0, 26, 6) +
        block(-22, 0, 30, 44, 12, W, WD) +
        `<rect x="-22" y="-44" width="1.6" height="44" fill="#fff" opacity=".14"/>` +
        win(-19, -14.6, 14, 10.6, false, 1.5) +
        `<path d="M-12 -14.6 V-4" stroke="${WD}" stroke-width="1"/><rect x="-1" y="-14" width="7" height="14" rx="1" fill="${C.woodD}"/><rect x=".4" y="-12.4" width="4.2" height="5" rx=".6" fill="${C.glass}"/><rect class="wl-on" x=".4" y="-12.4" width="4.2" height="5" rx=".6" fill="${C.yellowL}"/>` +
        awning +
        [-18, -9.4, -0.8].map((wx) => win(wx, -36, 5, 8, false, 1) + box(wx)).join("") +
        `<path d="M11 -26.4 L14 -27.1 L14 -35.1 L11 -34.4Z M16.2 -27.5 L19 -28.1 L19 -36.1 L16.2 -35.5Z" fill="${C.glass}"/>` +
        block(-23.2, -44, 32.4, 2.6, 13.4, STONE, STONE_D, C.cream) +
        `<rect x="2" y="-53" width="5" height="7" fill="${WD}"/><rect x="1.4" y="-54" width="6.2" height="1.6" fill="${STONE_D}"/>`,
    ) +
    glow(x - 12, y - 9.3, 13) +
    glow(x - 6.5, y - 32, 14)
  );
}

/** Café terrace: corner café, parasols, guests with steaming cups, a menu board, fairy lights. */
const cafe = definePiece({
  id: "stad-cafe",
  biome: "stad",
  w: 108,
  h: 70,
  below: 12,
  render: (c, X) => {
    const hx = c.side === 1 ? X(-26) : X(-18);
    const terrace = `<ellipse cx="${X(22)}" cy="${c.y - 6}" rx="32" ry="13" fill="#D3CCE8"/><ellipse cx="${X(21)}" cy="${c.y - 7}" rx="26" ry="9" fill="#ECE8F7"/>`;
    if (c.stage === 0) return plot(hx + 2, c.y - 6, 0.95) + terrace + place(X(26), c.y, 1, `<path d="M-6 0 V-6 H-2 V0 M-6 -6 V-12 M-5 -2 V-8 H-1 V-2 M-5 -8 V-14" stroke="${C.woodD}" stroke-width="1.2" fill="none"/>`) + crate(X(40), c.y - 10, 0.8);
    if (c.stage === 1) return cafeHouse(hx, c.y - 2, false) + terrace + parasol(X(18), c.y - 14, [C.pink, C.pinkD], false) + parasol(X(38), c.y + 2, [C.yellow, "#D9A12A"], false);
    const corner = c.side === 1 ? hx + 8 : hx - 22;
    const poleX = X(50);
    const menu = place(X(2), c.y + 6, 1, `${sh(1, 0, 5, 1.6)}<path d="M-3.4 0 L-1.8 -10 H1.8 L3.4 0Z" fill="${C.ink}"/><path d="M-1.4 -8 H1.4 M-1.8 -6 H1.2 M-2 -4 H1.6" stroke="#fff" stroke-width=".7" opacity=".8"/>`);
    return (
      cafeHouse(hx, c.y - 2, true) +
      terrace +
      `<rect x="${poleX - 0.8}" y="${c.y - 36}" width="1.6" height="34" fill="#3A3266"/>` +
      planter(fit(c, X(46), 10, 13), c.y - 16, 0.66) +
      parasol(X(18), c.y - 14, [C.pink, C.pinkD], true, 0) +
      parasol(X(38), c.y + 2, [C.yellow, "#D9A12A"], true, 1) +
      fairyLights([[corner, c.y - 38], [poleX, c.y - 36]], true) +
      menu
    );
  },
});

/** City tram in profile, nose towards +x (mirror with `facing`); windows light up at night. */
const tram = (() => {
  let wins = "";
  for (let i = 0; i < 6; i++) {
    if (i === 3) continue;
    wins += win(-29 + i * 8.6, -21, 6.2, 7, false, 1);
  }
  return (
    `<ellipse cx="2" cy="1" rx="34" ry="2.6" fill="${C.shadow}" opacity=".16"/><rect x="-26" y="-4.6" width="15" height="4.6" rx="2" fill="#3A3266"/><rect x="11" y="-4.6" width="15" height="4.6" rx="2" fill="#3A3266"/>` +
    `<path d="M-32 -4 V-22 Q-32 -25.4 -28.6 -25.4 H24 Q30.6 -25.4 32.6 -18 L33.6 -8 Q33.6 -4 29.6 -4Z" fill="${C.yellow}"/><path d="M-32 -9.4 H33.8 L33.6 -8 Q33.6 -4 29.6 -4 H-32Z" fill="#E0A82A"/><rect x="-32" y="-11.6" width="65.8" height="2.2" fill="${C.grape}"/>` +
    wins +
    `<rect x="-3.4" y="-22" width="7" height="17.4" rx=".8" fill="#E0A82A"/><rect x="-2.6" y="-21" width="2.4" height="8" fill="${C.glass}"/><rect x=".8" y="-21" width="2.4" height="8" fill="${C.glass}"/>` +
    `<path d="M26 -22.4 H29.2 Q31.6 -21.4 32.4 -15 H26Z" fill="${C.glass}"/><path class="wl-on" d="M26 -22.4 H29.2 Q31.6 -21.4 32.4 -15 H26Z" fill="${C.yellowL}"/><circle cx="32.8" cy="-6.6" r="1.2" fill="${C.yellowL}"/>` +
    `<rect x="-28" y="-27.6" width="52" height="2.6" rx="1.2" fill="#E9E4F5"/><path d="M-30 -24 H22" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>` +
    `<path d="M-9 -27.6 L-3 -35.4 L-9 -42.4 M-3 -35.4 L3 -27.6" stroke="${C.ink}" stroke-width="1" fill="none"/><rect x="-14" y="-43.2" width="10" height="1.4" rx=".6" fill="${C.ink}"/>`
  );
})();

/** Glass tram shelter (unmirrored): grape roof, bench, a poster that lights up at night. `done` false = frame. */
function shelter(x: number, y: number, done: boolean) {
  const posts = `<rect x="-12" y="-20" width="1.6" height="20" fill="#3A3266"/><rect x="10.4" y="-20" width="1.6" height="20" fill="#3A3266"/><rect x="18" y="-21.8" width="1.4" height="20" fill="#3A3266"/>`;
  const roof = block(-14, -20, 28, 2.4, 10, C.grape, C.grapeD, "#8C66FF");
  if (!done) return place(x, y, 1, posts + roof);
  return (
    place(
      x,
      y,
      1,
      `${sh(6, 0, 18, 3.5)}<path d="M12 -1.8 L19.4 -3.4 L19.4 -20 L12 -19Z" fill="#9CCBF5" opacity=".5"/>` +
        `<rect x="-10" y="-17" width="8" height="12" rx="1" fill="${C.pink}"/><rect class="wl-on" x="-10" y="-17" width="8" height="12" rx="1" fill="#FFB3CC"/><circle cx="-6" cy="-12" r="2" fill="#fff" opacity=".8"/>` +
        `<rect x="0" y="-8" width="10" height="2" rx=".8" fill="${C.woodL}"/><path d="M1 -6 V-2 M9 -6 V-2" stroke="#3A3266" stroke-width="1"/>` +
        `<rect x="-12" y="-20" width="24" height="18" fill="#E3F4FF" opacity=".45"/><path d="M-9 -4 L-4 -16 M2 -10 L5 -16" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".9"/>` +
        posts +
        roof,
    ) + glow(x - 6, y - 11, 12)
  );
}

/** Tram stop: rails and overhead wire, a glass shelter, a stop sign, a tram sparking at the pantograph. */
const tramStop = definePiece({
  id: "stad-tram",
  biome: "stad",
  w: 108,
  h: 68,
  below: 10,
  render: (c, X) => {
    const L = Math.min(X(-54), X(54));
    const ry = c.y - 22;
    let sleepers = "";
    for (let i = 0; i < 15; i++) sleepers += `<rect x="${r1(L + 3 + i * 7.2)}" y="${ry - 5}" width="2.4" height="9" rx=".6" fill="#A79CD6"/>`;
    const bed = `<rect x="${L}" y="${ry - 6}" width="108" height="11" rx="5" fill="#CFCBE3"/>` + sleepers;
    const rails = `<path d="M${L + 1} ${ry - 3} H${L + 107} M${L + 1} ${ry + 2} H${L + 107}" stroke="#6E6496" stroke-width="1.6"/><path d="M${L + 1} ${ry - 3.6} H${L + 107} M${L + 1} ${ry + 1.4} H${L + 107}" stroke="#E9E4F5" stroke-width=".6"/>`;
    const platform = `<rect x="${L + 2}" y="${c.y - 13}" width="104" height="9" rx="2" fill="#ECE8F7"/><rect x="${L + 2}" y="${c.y - 6}" width="104" height="4" rx="1.4" fill="#C4BCDF"/><path d="M${L + 4} ${c.y - 11.6} H${L + 104}" stroke="${C.yellow}" stroke-width="1.2" stroke-dasharray="3 1.6"/>`;
    const wy = c.y - 60;
    const pole = (px: number) => `<rect x="${px - 1.2}" y="${wy - 4}" width="2.4" height="${ry - wy + 2}" fill="#6E6496"/><rect x="${px - 2.4}" y="${wy - 5}" width="4.8" height="2" rx=".8" fill="#6E6496"/>`;
    const wire = `<path d="M${L} ${wy} H${L + 108}" stroke="${C.ink}" stroke-width=".8" opacity=".75"/>`;
    const signX = X(14);
    const sign =
      place(signX, c.y - 8, 1, `${sh(0, 0, 4, 1.4)}<rect x="-.8" y="-26" width="1.6" height="26" fill="#6E6496"/><circle cx="0" cy="-28" r="4.4" fill="${C.grape}"/><circle cx="0" cy="-28" r="3" fill="#fff"/><path d="M-1.6 -29.4 H1.6 M0 -29.4 V-26" stroke="${C.grape}" stroke-width="1.2"/><rect x="-5" y="-21" width="10" height="5" rx="1" fill="${C.ink}"/>`) +
      `<circle class="blink" cx="${signX - 2}" cy="${c.y - 26.6}" r=".9" fill="#FFC83D"/><circle class="blink" style="animation-delay:.5s" cx="${signX + 1}" cy="${c.y - 26.6}" r=".9" fill="#FFC83D"/>`;
    if (c.stage === 0)
      return (
        `<rect x="${L}" y="${ry - 6}" width="108" height="11" rx="5" fill="#DCD8EA"/>` +
        sleepers.split("<rect").slice(0, 9).join("<rect") +
        place(X(30), c.y - 2, 1, `${sh(0, 0, 14, 3)}<path d="M-14 0 H12 M-13 -2.4 H13 M-12 -4.8 H14" stroke="#6E6496" stroke-width="1.8" stroke-linecap="round"/>`) +
        plot(X(-26), c.y - 2, 0.62)
      );
    if (c.stage === 1)
      return (
        pole(X(48)) +
        bed +
        rails +
        platform +
        shelter(X(-28), c.y - 9, false) +
        [X(6), X(22), X(38)].map((cx) => `<path d="M${cx - 3} ${c.y - 8} L${cx} ${c.y - 17} L${cx + 3} ${c.y - 8}Z" fill="${C.orange}"/><path d="M${cx - 1.4} ${c.y - 12} H${cx + 1.4}" stroke="#fff" stroke-width="1.4"/>`).join("")
      );
    const tx = X(4);
    const contact = tx + c.side * -9 * 0.92;
    return (
      planeTree(X(-42), c.y - 27, 0.5) +
      pole(X(48)) +
      wire +
      bed +
      rails +
      facing(tx, ry + 1, c.side, 0.92, tram) +
      star(contact, wy + 0.6 * 6, 0.6) +
      star(contact + 3, wy + 3 + 0.45 * 6, 0.45, 0.9) +
      platform +
      shelter(X(-28), c.y - 9, true) +
      person(X(-2), c.y - 8, C.pink, 1) +
      sign +
      person(X(32), c.y - 7, C.greenM, 2)
    );
  },
});

/** Fountain (unmirrored): stone basin, column with a bowl; `stage` 1 = dry, 2 = jets, spill and rings. */
function fountain(x: number, y: number, stage: 1 | 2) {
  const rim =
    `<path d="M-26 0 A26 8 0 0 0 26 0 V5 A26 8 0 0 1 -26 5Z" fill="#B9AEE6"/><path d="M14 6.6 A26 8 0 0 0 26 0 V5 A26 8 0 0 1 14 11.6Z" fill="#9C93C8"/>` +
    `<ellipse cx="0" cy="0" rx="26" ry="8" fill="#E9E4F5"/>`;
  const inside =
    stage === 2
      ? `<ellipse cx="0" cy=".7" rx="22.6" ry="6.2" fill="${C.water}"/><ellipse cx="-3" cy="-.2" rx="16" ry="3.8" fill="${C.waterL}"/>`
      : `<ellipse cx="0" cy=".7" rx="22.6" ry="6.2" fill="#D9C49A"/><ellipse cx="-3" cy="0" rx="16" ry="3.8" fill="#E9D6AE"/>`;
  const column = `<rect x="-2.6" y="-16" width="5.2" height="17" fill="${STONE}"/><rect x=".8" y="-16" width="1.8" height="17" fill="${STONE_D}"/>`;
  const bowl = `<path d="M-9.4 -16 Q0 -9.6 9.4 -16Z" fill="#B9AEE6"/><ellipse cx="0" cy="-16" rx="9.4" ry="2.6" fill="#E9E4F5"/><ellipse cx="0" cy="-15.8" rx="7.4" ry="1.7" fill="${stage === 2 ? C.water : "#D9C49A"}"/>`;
  if (stage === 1) return place(x, y, 1, `${sh(4, 4, 28, 6)}${rim}${inside}${column}${scaffold(-8, 1, 16, 22)}`);
  return place(
    x,
    y,
    1,
    `${sh(4, 4, 28, 6)}${rim}${inside}` +
      [[-15, 1.6, 0], [15, 1.6, 1.2], [0, 3.6, 0.6]].map(([rx, ry, d]) => `<ellipse class="ring" style="animation-delay:${d}s" cx="${rx}" cy="${ry}" rx="4.6" ry="1.4" fill="none" stroke="#fff" stroke-width=".9"/>`).join("") +
      column +
      `<path class="water" d="M-8.6 -16 Q-14.6 -15.6 -15.6 1 M8.6 -16 Q14.6 -15.6 15.6 1" stroke="#EAF6FF" stroke-width="1.8" stroke-dasharray="3 3" fill="none" stroke-linecap="round"/>` +
      bowl +
      anim(0, -16.4, "jet", `<path d="M-1.6 0 Q-1.2 -11 0 -15 Q1.2 -11 1.6 0Z" fill="#EAF6FF"/><circle cx="0" cy="-15.4" r="1.6" fill="#fff"/>`),
  );
}

/** Park: a lawn with a gravel ring around a fountain, plane trees, a bench, flower beds, a lamp. */
const park = definePiece({
  id: "stad-park",
  biome: "stad",
  w: 108,
  h: 82,
  below: 12,
  render: (c, X) => {
    const fx = X(-2);
    const fy = c.y - 14;
    const lawn = `<ellipse cx="${X(0)}" cy="${c.y - 18}" rx="54" ry="28" fill="#C9E6A2"/><ellipse cx="${X(-4)}" cy="${c.y - 21}" rx="44" ry="20" fill="#D8EFB5"/><ellipse cx="${fx}" cy="${fy + 2}" rx="35" ry="12.6" fill="#EFE6D2"/>`;
    const beds = flowers(X(-34), c.y + 4, c.rng, 5, 9) + flowers(X(30), c.y + 6, c.rng, 4, 8);
    if (c.stage === 0)
      return lawn + `<ellipse cx="${fx}" cy="${fy}" rx="26" ry="8" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="4 3"/>` + plot(fx, fy - 2, 0.62) + seedlings(X(-40), c.y - 34, 3) + seedlings(X(36), c.y - 38, 3);
    if (c.stage === 1)
      return lawn + tree(X(-40), c.y - 36, 0.4, "l") + tree(X(36), c.y - 40, 0.38, "l") + fountain(fx, fy, 1) + brickPallet(X(30), c.y + 4) + seedlings(X(-34), c.y + 4, 3);
    return (
      lawn +
      planeTree(X(-40), c.y - 36, 0.62) +
      planeTree(X(38), c.y - 40, 0.56) +
      bench(X(-36), c.y - 8, 0.72) +
      fountain(fx, fy, 2) +
      beds +
      lamp(X(44), c.y - 2, 0.66) +
      person(X(20), c.y - 2, C.yellow, 2) +
      anim(X(20) + 4.2, c.y - 30, "bob", `<path d="M0 0 V21" stroke="${C.ink}" stroke-width=".6" opacity=".7"/><ellipse cx="0" cy="-3.6" rx="3.4" ry="4" fill="${C.pink}"/><ellipse cx="-1.2" cy="-4.8" rx="1" ry="1.4" fill="#fff" opacity=".6"/>`, 0.4)
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
  pieces: [canalHouses, peperbusPiece, gatePiece, market, bridge, cafe, tramStop, park],
};
