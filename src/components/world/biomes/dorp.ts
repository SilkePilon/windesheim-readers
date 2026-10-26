import {
  C,
  anim,
  bench,
  birdV,
  blossom,
  building,
  bunting,
  bushes,
  cow,
  crane,
  crate,
  definePiece,
  duck,
  facing,
  fence,
  fit,
  flag,
  flowers,
  fruitTree,
  glow,
  hayBale,
  hedge,
  house,
  ladder,
  lamp,
  mp,
  place,
  planks,
  plot,
  r1,
  scaffold,
  seedlings,
  sh,
  tree,
  tulipStrip,
  willow,
  win,
  windmill,
  type WorldBiome,
} from "../kit";

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
  below: 14,
  render: (c, X) => {
    // The sails sweep a circle (r ≈ 36): keep the whole sweep inside the footprint.
    const wx = fit(c, X(-26), 36, 36, 55);
    if (c.stage === 0) {
      const base = `<ellipse cx="${wx}" cy="${c.y - 4}" rx="16" ry="5.5" fill="#CFC3A8"/><ellipse cx="${wx}" cy="${c.y - 6}" rx="12" ry="3.6" fill="#E9D6AE"/>`;
      return base + plot(X(22), c.y, 1) + seedlings(X(-24), c.y + 10, 4, 8);
    }
    if (c.stage === 1)
      return (
        windmill(wx, c.y - 6, 0.78, false, false) +
        `<g transform="translate(${wx} ${c.y - 6}) scale(.78)">${scaffold(-16, 0, 32, 50)}</g>` +
        building(fit(c, X(26), 20, 34, 55), c.y + 4, 0.72, { craneSide: 0 }) +
        tulipStrip(X(-2), c.y + 14, 0.8, c.rng)
      );
    const [roof, roofD] = ROOFS[Math.floor(c.rng() * ROOFS.length)];
    return (
      windmill(wx, c.y - 6, 0.78, true) +
      house(fit(c, X(26), 20, 34, 55), c.y + 4, 0.8, { alive: true, roof, roofD }) +
      tulipStrip(X(-2), c.y + 14, 0.8, c.rng) +
      flowers(X(42), c.y + 10, c.rng, 4, 8)
    );
  },
});


const BARN = { wall: "#D9483B", side: "#A8322A" };

/** Red gambrel barn with a silo (unmirrored); `done` = finished with roof, doors and weathervane. */
function barn(x: number, y: number, done: boolean, s = 0.88) {
  const silo =
    `<path d="M-33 0 L-33 -44 Q-27 -52 -21 -44 L-21 0Z" fill="#E9E4F5"/><path d="M-27 0 L-27 -50 Q-23 -49 -21 -44 L-21 0Z" fill="#C9C3E3"/>` +
    `<path d="M-33 -44 Q-27 -54 -21 -44 Q-27 -46 -33 -44Z" fill="#8C82B5"/><path d="M-33 -14 H-21 M-33 -30 H-21" stroke="#B9AEE6" stroke-width="1.2"/>`;
  if (!done) return place(x, y, s, `${sh(2, 0, 30, 6)}<path d="M-33 0 L-33 -24 L-21 -24 L-21 0Z" fill="#E9E4F5"/>`) + building(x + 2 * s, y, 0.95 * s, { ...BARN, craneSide: 0 });
  return place(
    x,
    y,
    s,
    `${sh(2, 0, 32, 6)}${silo}<path d="M8 0 L34 -6 L34 -28 L8 -22Z" fill="${BARN.side}"/><path d="M-20 0 L8 0 L8 -22 L4 -34 L-6 -40 L-16 -34 L-20 -22Z" fill="${BARN.wall}"/>` +
      `<path d="M8 -22 L4 -34 L30 -40 L34 -28Z" fill="#6E6496"/><path d="M4 -34 L-6 -40 L20 -46 L30 -40Z" fill="#8C82B5"/><path d="M-6 -40 L20 -46" stroke="#fff" stroke-opacity=".4" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M-20 -22 L-16 -34 L-6 -40 L4 -34 L8 -22" stroke="#fff" stroke-width="1.6" fill="none" stroke-linejoin="round"/>` +
      `<rect x="-15" y="-17" width="16" height="17" fill="#B8392E"/><path d="M-15 -17 L1 0 M1 -17 L-15 0" stroke="#fff" stroke-width="1.3"/><rect x="-15" y="-17" width="16" height="17" fill="none" stroke="#fff" stroke-width="1.4"/>` +
      `<rect x="-9.5" y="-33" width="7" height="7" fill="#8E2A22"/>${win(-8.5, -32, 5, 5)}<path d="M-9.5 -26 Q-6 -29 -2.5 -26Z" fill="#F2C95C"/>` +
      `<path d="M14 -8 L28 -11 M14 -14 L28 -17" stroke="#8E2A22" stroke-width="1" opacity=".6"/>`,
  ) + glow(x - 6 * s, y - 29.5 * s, 9 * s);
}

/** Rooster weathervane on a rod; `alive` swings it in the wind. */
const vane = (x: number, y: number, alive: boolean) => {
  const rooster = `<path d="M-4.5 0 H4.5" stroke="${C.ink}" stroke-width=".8"/><path d="M-2.6 -.8 Q-2.6 -4.2 0 -4.2 L1.4 -6.4 L2.6 -5 L2.2 -3.6 Q3.6 -2.2 1.4 -.8Z" fill="${C.yellow}"/><path d="M-2.6 -.8 Q-4.8 -4 -3.4 -6.4 Q-2 -4.2 -2 -2.2Z" fill="${C.orange}"/>`;
  return `<path d="M${r1(x)} ${r1(y)} V${r1(y - 9)}" stroke="${C.ink}" stroke-width="1"/>` + (alive ? anim(x, y - 9, "sway", rooster) : place(x, y - 9, 1, rooster));
};

/** Farm: red barn with silo and weathervane, a fenced meadow with grazing cows, hay bales. */
const farm = definePiece({
  id: "dorp-farm",
  biome: "dorp",
  w: 110,
  h: 92,
  render: (c, X) => {
    const bx = fit(c, X(-24), 30, 38, 55);
    const meadowFence = (rails: number) => fence(X(6), c.y - 24, X(52), c.y - 28, C.cream, "#C9C3E3", rails);
    if (c.stage === 0) return plot(bx + 4, c.y - 4, 1) + meadowFence(0) + seedlings(X(30), c.y - 4, 3) + seedlings(X(22), c.y + 6, 3);
    if (c.stage === 1) return meadowFence(2) + barn(bx, c.y, false) + hayBale(X(30), c.y - 6, 0.9) + hayBale(X(42), c.y + 4, 0.8);
    return (
      meadowFence(2) +
      barn(bx, c.y, true) +
      vane(bx - 5.3, c.y - 35.2, true) +
      cow(X(36), c.y - 12, 0.9, c.side, true) +
      cow(X(20), c.y + 4, 0.86, c.side === 1 ? -1 : 1, true, 2.6) +
      hayBale(X(46), c.y + 4, 0.75) +
      flowers(X(-40), c.y + 6, c.rng, 3, 6)
    );
  },
});

const TULIP_COLS = ["#FF5C8A", "#FFC83D", "#FF8A1F", "#8C66FF", "#fff", "#E8364F"];
/** One tulip cup. */
const cup = (col: string) => `<path d="M-2.1 0 Q-2.6 -3.4 -1.3 -4.2 L0 -2.8 L1.3 -4.2 Q2.6 -3.4 2.1 0 Q0 1 -2.1 0Z" fill="${col}"/>`;

/** Greenhouse (unmirrored, 3/4 view): plants inside, glass panes with white frames; `glass` off = bare frame. */
function greenhouse(x: number, y: number, glass: boolean) {
  const frame =
    `<path d="M-18 0 L4 0 L4 -20 L-7 -30 L-18 -20Z M4 0 L34 -6 L34 -26 L4 -20 M-7 -30 L23 -36 L34 -26 M-11 0 V-24.5 M-3 0 V-25 M14 -2 V-22 M24 -4 V-24 M3 -32 L14 -22 M13 -34 L24 -24" stroke="#fff" stroke-width="1.3" fill="none" stroke-linejoin="round"/>`;
  const plants =
    `<circle cx="-13" cy="-4" r="4" fill="#4E9F45"/><circle cx="-5" cy="-5" r="4.6" fill="#5FAF55"/><circle cx="1" cy="-4" r="3.6" fill="#4E9F45"/><circle cx="10" cy="-6" r="4" fill="#5FAF55"/><circle cx="19" cy="-8" r="4.4" fill="#4E9F45"/><circle cx="28" cy="-10" r="3.6" fill="#5FAF55"/>` +
    `<circle cx="-6" cy="-7" r="1.2" fill="#E8364F"/><circle cx="-13" cy="-6" r="1.1" fill="#FF8A1F"/><circle cx="18" cy="-10" r="1.2" fill="#E8364F"/><circle cx="9" cy="-8" r="1" fill="#FFC83D"/>`;
  return place(
    x,
    y,
    1,
    `${sh(4, 0, 28, 6)}<path d="M-19 0 L4 0 L34 -6 L34 -3 L4 2 L-19 2Z" fill="#B9AEE6"/>${plants}` +
      (glass
        ? `<path d="M-18 0 L4 0 L4 -20 L-7 -30 L-18 -20Z" fill="#E3F4FF" opacity=".55"/><path d="M4 0 L34 -6 L34 -26 L4 -20Z" fill="#9CCBF5" opacity=".5"/><path d="M-7 -30 L23 -36 L34 -26 L4 -20Z" fill="#EAF6FF" opacity=".75"/>` +
          `<path d="M-15 -6 L-9 -16 M-14 -2 L-12 -5 M8 -6 L12 -14" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".9"/>`
        : "") +
      frame,
  );
}

/** A Dutch bike (unmirrored is fine: it's flat). */
const bike = (x: number, y: number, col: string) =>
  place(
    x,
    y,
    1,
    `<ellipse cx="1" cy="0.5" rx="11" ry="1.6" fill="${C.shadow}" opacity=".16"/><circle cx="-6" cy="-4.6" r="4.6" fill="none" stroke="#3A3266" stroke-width="1.3"/><circle cx="7" cy="-4.6" r="4.6" fill="none" stroke="#3A3266" stroke-width="1.3"/>` +
      `<path d="M-6 -4.6 L-1 -10 L5 -10 L7 -4.6 M-1 -10 L0 -4.6 L5 -10 M-2 -12 h3.4 M5 -10 L4 -13 h2.6" stroke="${col}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="5.6" y="-12.6" width="4" height="2.6" rx=".6" fill="${C.woodL}"/>`,
  );

/** A butterfly fluttering over the flowers. */
const butterfly = (x: number, y: number, col: string, delay: number) =>
  anim(x, y, "bob", `<ellipse cx="-2" cy="-1" rx="2.2" ry="1.6" fill="${col}"/><ellipse cx="2" cy="-1" rx="2.2" ry="1.6" fill="${col}"/><ellipse cx="-1.6" cy="1.2" rx="1.4" ry="1.1" fill="${col}"/><ellipse cx="1.6" cy="1.2" rx="1.4" ry="1.1" fill="${col}"/><path d="M0 -2 V2" stroke="${C.ink}" stroke-width=".8"/>`, delay);

/** Bulb field (unmirrored, skewed like the kit's tulip strips): 4 rows; stage 0 furrows, 1 shoots, 2 bloom. */
function tulipField(x: number, y: number, stage: 0 | 1 | 2, k: number) {
  const rows = [-26, -18, -10, -2];
  let out = `<rect x="-26" y="-32" width="52" height="35" rx="5" fill="${stage ? "#C9A36B" : "#D9BC86"}"/><rect x="-26" y="-32" width="52" height="35" rx="5" fill="none" stroke="#B08A55" stroke-width="1.4"/>`;
  rows.forEach((dy, i) => {
    if (stage === 0) {
      out += `<path d="M-22 ${dy} H22" stroke="#A8844E" stroke-width="1.4" stroke-dasharray="2.4 2.6" stroke-linecap="round"/>`;
      return;
    }
    out += `<rect x="-23" y="${dy - 1.6}" width="46" height="3.6" rx="1.8" fill="#5FAF55"/>`;
    const col = TULIP_COLS[(k + i * 2) % TULIP_COLS.length];
    for (let t = 0; t < 10; t++) {
      const tx = r1(-20.7 + t * 4.6 + (i % 2) * 1.2);
      if (stage === 1) out += i < 2 ? `<path d="M${tx} ${dy} l-1.4 -3.6 M${tx} ${dy} l1.4 -3.8" stroke="#3E8E3A" stroke-width="1.3" stroke-linecap="round"/>` : `<ellipse cx="${tx}" cy="${dy - 2.6}" rx="1.4" ry="2.3" fill="#8FD47A"/>`;
      else if (i === 3) out += anim(tx, dy - 0.6, "sway", cup(col), (t % 4) * 0.5);
      else out += place(tx, dy - 0.6, 1, cup(col));
    }
  });
  return `<g transform="translate(${r1(x)} ${r1(y)}) skewX(-12)">${out}</g>`;
}

/** Tulip fields with a greenhouse, a bike and butterflies. */
const tulips = definePiece({
  id: "dorp-tulips",
  biome: "dorp",
  w: 110,
  h: 78,
  render: (c, X) => {
    const gx = X(-26) - 8;
    const k = Math.floor(c.rng() * TULIP_COLS.length);
    const fx = X(24);
    const back = tree(fit(c, X(-44), 14, 17, 55), c.y - 44, 0.6, "y");
    if (c.stage === 0)
      return back + tulipField(fx, c.y, 0, k) + place(gx, c.y - 6, 1, `<path d="M-18 0 L4 0 L34 -6 L12 -6Z" fill="none" stroke="#B9AEE6" stroke-width="2"/>`) + plot(gx + 6, c.y - 10, 0.62);
    if (c.stage === 1) return back + greenhouse(gx, c.y - 6, false) + tulipField(fx, c.y, 1, k) + `<rect x="${gx + 20}" y="${c.y - 4}" width="9" height="5" rx="1" fill="${C.creamD}"/>`;
    return back + greenhouse(gx, c.y - 6, true) + bike(X(-40), c.y + 6, C.pink) + tulipField(fx, c.y, 2, k) + butterfly(X(14), c.y - 42, "#FFC83D", 0) + butterfly(X(38), c.y - 38, "#fff", 0.8);
  },
});

/** Church with a spire (unmirrored), scale .85; `stage` 1 = half-built tower and nave, no spire. */
function church(x: number, y: number, done: boolean) {
  const s = 0.8;
  const archWin = (wx: number) => {
    // windows on the receding nave wall (bottom edge y = −2 − (x−2)·10/42)
    const yb = -2 - ((wx - 2) * 10) / 42;
    const yb2 = -2 - ((wx + 4 - 2) * 10) / 42;
    return `<path d="M${wx} ${r1(yb - 6)} L${wx} ${r1(yb - 14)} Q${wx + 2} ${r1(yb - 18)} ${wx + 4} ${r1(yb2 - 14)} L${wx + 4} ${r1(yb2 - 6)}Z" fill="${C.glass}"/><path class="wl-on" d="M${wx} ${r1(yb - 6)} L${wx} ${r1(yb - 14)} Q${wx + 2} ${r1(yb - 18)} ${wx + 4} ${r1(yb2 - 14)} L${wx + 4} ${r1(yb2 - 6)}Z" fill="${C.yellowL}"/>`;
  };
  if (!done)
    return place(
      x,
      y,
      s,
      `${sh(16, 0, 36, 7)}<path d="M2 -2 L44 -12 L44 -22 L2 -12Z" fill="#B85A42"/><rect x="-14" y="-30" width="16" height="30" fill="#D9785A"/><path d="M2 0 L8 -2 L8 -32 L2 -30Z" fill="#A9503C"/>` +
        `<path d="M-9 0 L-9 -7 Q-5.5 -11 -2 -7 L-2 0Z" fill="${C.wood}"/>` +
        scaffold(-16, 0, 26, 44),
    );
  return (
    place(
      x,
      y,
      s,
      `${sh(16, 0, 38, 7)}<path d="M2 -2 L44 -12 L44 -34 L2 -24Z" fill="#B85A42"/>${archWin(10)}${archWin(22)}${archWin(34)}` +
        `<path d="M2 -24 L44 -34 L40 -48 L-2 -38Z" fill="#7A6E9A"/><path d="M-2 -38 L40 -48" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>` +
        `<rect x="-14" y="-52" width="16" height="52" fill="#D9785A"/><path d="M2 0 L8 -2 L8 -54 L2 -52Z" fill="#A9503C"/>` +
        `<path d="M-14 -20 H2 M-14 -34 H2" stroke="#C4644A" stroke-width="1"/>` +
        `<path d="M-9.5 0 L-9.5 -8 Q-6 -12.5 -2.5 -8 L-2.5 0Z" fill="${C.wood}"/>` +
        `<circle cx="-6" cy="-27" r="4.6" fill="${C.cream}"/><path d="M-6 -27 V-30.4 M-6 -27 L-3.6 -26" stroke="${C.ink}" stroke-width="1" stroke-linecap="round"/>` +
        `<path d="M-10 -40 L-10 -45 Q-8.5 -47 -7 -45 L-7 -40Z M-5 -40 L-5 -45 Q-3.5 -47 -2 -45 L-2 -40Z" fill="#5A3A3A"/>` +
        `<rect x="-15.5" y="-55" width="25" height="3.4" fill="${C.creamD}"/><path d="M-15 -55 L-6 -92 L-2 -55Z" fill="#8C82B5"/><path d="M-2 -55 L-6 -92 L9 -56.6Z" fill="#5A4E80"/>`,
    ) + glow(x + 22 * s, y - 20 * s, 18 * s)
  );
}

/** Church on a cobbled square with a lime tree, a bench and a lamp. */
const churchSquare = definePiece({
  id: "dorp-church",
  biome: "dorp",
  w: 104,
  h: 100,
  render: (c, X) => {
    const ox = c.x - 15 - c.side * 6;
    const oy = c.y - 12;
    const square = `<ellipse cx="${X(4)}" cy="${c.y - 2}" rx="46" ry="9" fill="#E7DFCB"/><ellipse cx="${X(2)}" cy="${c.y - 3}" rx="34" ry="5.5" fill="#F1EBDB"/>` + [[-30, -2], [-16, 1], [0, -4], [14, 1], [28, -3], [38, 1]].map(([d, dy]) => `<rect x="${X(d) - 1.6}" y="${c.y + dy - 0.8}" width="3.2" height="1.6" rx=".6" fill="#D6CBB0"/>`).join("");
    if (c.stage === 0) {
      const outline = place(ox, oy, 0.8, `<path d="M-14 0 L2 0 L8 -2 L44 -12 L38 -16 L2 -8 L-8 -6 L-14 -6Z" fill="none" stroke="#B9AEE6" stroke-width="2.4" stroke-linejoin="round"/>`);
      return square + outline + plot(X(26), c.y - 6, 0.7) + seedlings(X(-36), c.y + 4, 3);
    }
    if (c.stage === 1) return square + church(ox, oy, false) + crane(X(40), c.y - 4, 84, -c.side * 30) + bench(X(14), c.y + 4, 0.75);
    const spireTop = { x: ox - 6 * 0.8, y: oy - 92 * 0.8 };
    return (
      square +
      church(ox, oy, true) +
      vane(spireTop.x, spireTop.y, true) +
      tree(fit(c, X(40), 14, 18, 52), c.y - 10, 0.62, "l") +
      bench(X(12), c.y + 4, 0.75) +
      lamp(X(-32), c.y + 4, 0.7) +
      birdV(X(28), c.y - 82, 1, true) +
      birdV(X(38), c.y - 74, 0.8, true, 0.7)
    );
  },
});

/** Market stall (unmirrored): striped awning, counter with goods. `open` false = bare frame. */
function stall(x: number, y: number, stripes: [string, string], goods: "cheese" | "bread" | "flowers", open: boolean) {
  let awning = "";
  if (open) {
    for (let i = 0; i < 6; i++) {
      const a = -15 + i * 5;
      awning += `<path d="M${a} -22 L${a + 5} -22 L${a + 5 + 2} -30 L${a + 2} -30Z" fill="${i % 2 ? stripes[1] : stripes[0]}"/><path d="M${a} -22 Q${a + 2.5} -18.6 ${a + 5} -22Z" fill="${i % 2 ? stripes[1] : stripes[0]}"/>`;
    }
    awning += `<path d="M-13 -30 L17 -30" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/>`;
  }
  const wares =
    goods === "cheese"
      ? `<ellipse cx="-7" cy="-14.5" rx="5" ry="2.6" fill="#E8A92A"/><rect x="-12" y="-17.6" width="10" height="3" fill="#FFC83D"/><ellipse cx="-7" cy="-17.6" rx="5" ry="2.2" fill="#FFE08A"/><ellipse cx="4" cy="-14.5" rx="5" ry="2.6" fill="#E8A92A"/><rect x="-1" y="-18" width="10" height="3.4" fill="#FFC83D"/><ellipse cx="4" cy="-18" rx="5" ry="2.2" fill="#FFE08A"/><path d="M8 -13 L13 -13 L12 -16Z" fill="#FFC83D"/>`
      : goods === "bread"
        ? `<ellipse cx="-7" cy="-15" rx="5" ry="2.6" fill="#C98A3A"/><path d="M-10 -15.6 l2 -1 M-7 -16 l2 -1 M-4 -15.6 l2 -1" stroke="#F2C27A" stroke-width=".9"/><ellipse cx="3" cy="-15" rx="4" ry="3" fill="#B0702E"/><ellipse cx="2" cy="-16" rx="2" ry="1.2" fill="#D9A05A"/><rect x="7" y="-17" width="7" height="3" rx="1.5" fill="#E2B060" transform="rotate(-12 10 -15)"/>`
        : `<rect x="-11" y="-17" width="6" height="4" fill="#8C82B5"/><rect x="-2" y="-17" width="6" height="4" fill="#8C82B5"/><rect x="7" y="-17" width="6" height="4" fill="#8C82B5"/>` +
          [[-8, "#FF5C8A"], [1, "#FFC83D"], [10, "#fff"]].map(([fx, col]) => `<circle cx="${fx}" cy="-19" r="2.2" fill="${col}"/><circle cx="${+fx - 1.8}" cy="-18" r="1.8" fill="${col}"/><circle cx="${+fx + 1.8}" cy="-18" r="1.8" fill="${col}"/>`).join("");
  return place(
    x,
    y,
    1,
    `${sh(3, 0, 18, 4)}<rect x="-13" y="-30" width="2" height="30" fill="${C.wood}"/><rect x="13" y="-30" width="2" height="27" fill="${C.woodD}"/>` +
      `<path d="M13 0 L16 -3 L16 -13 L13 -10Z" fill="${C.wood}"/><rect x="-13" y="-10" width="26" height="10" fill="${C.woodL}"/><path d="M-13 -10 L13 -10 L16 -13 L-10 -13Z" fill="#E2BC85"/><path d="M-13 -5 H13" stroke="${C.wood}" stroke-width=".9" opacity=".6"/>` +
      (open ? wares : "") +
      awning,
  );
}

/** Bakery with a pretzel sign and smoking oven chimney, cheese and flower stalls, bunting. */
const bakery = definePiece({
  id: "dorp-bakery",
  biome: "dorp",
  w: 110,
  h: 82,
  render: (c, X) => {
    const hx = fit(c, X(-21) - 1, 24, 45, 55);
    if (c.stage === 0) return plot(hx + 2, c.y - 4, 0.95) + crate(X(18), c.y + 2, 0.9) + crate(X(30), c.y - 8, 0.8) + planks(X(40), c.y + 4, 0.7);
    if (c.stage === 1) return building(hx, c.y, 1.05, { wall: "#FFE7C2", side: "#EBC994", craneSide: 0 }) + stall(X(28), c.y - 12, [C.pink, "#fff"], "cheese", false) + crate(X(40), c.y + 4, 0.9) + crate(X(22), c.y + 6, 0.75);
    const shop = place(
      hx,
      c.y,
      1.05,
      // Awning over the door and window, a pretzel sign on a bracket.
      [0, 1, 2, 3, 4].map((i) => `<path d="M${-22 + i * 5} -24 L${-17 + i * 5} -24 L${-16 + i * 5} -19 L${-21 + i * 5} -19Z" fill="${i % 2 ? "#fff" : C.orange}"/>`).join("") +
        `<path d="M-22 -24 H3" stroke="${C.orangeD}" stroke-width="1"/>` +
        `<path d="M-22 -28 H-30" stroke="${C.ink}" stroke-width="1.2"/><path d="M-28 -28 V-26" stroke="${C.ink}" stroke-width=".8"/><circle cx="-29.4" cy="-22.6" r="3.4" fill="none" stroke="#D9902A" stroke-width="1.8"/><circle cx="-26.6" cy="-22.6" r="3.4" fill="none" stroke="#E8A93A" stroke-width="1.8"/>`,
    );
    // The cheese stall stands behind the shop (draw it first, so the pretzel sign hangs in front).
    return (
      stall(X(26), c.y - 14, [C.pink, "#fff"], "cheese", true) +
      house(hx, c.y, 1.05, { wall: "#FFE7C2", side: "#EBC994", roof: C.orange, roofD: C.orangeD, alive: true }) +
      shop +
      bunting(hx + 20, c.y - 42, X(26) - 13, c.y - 40, true) +
      stall(fit(c, X(38), 16, 26, 55), c.y + 4, ["#3F8FE0", "#fff"], "flowers", true) +
      crate(X(4), c.y + 7, 0.7)
    );
  },
});

/** Drawbridge (unmirrored, side view): white deck and railings, a portal and a balance frame with chains. */
function drawbridge(x: number, y: number, done: boolean) {
  const W = "#FBFAFF";
  const S = "#C9C3E3";
  const deck = (l: number, r: number) => `<rect x="${l}" y="-4" width="${r - l}" height="4" fill="${W}"/><rect x="${l}" y="-1.4" width="${r - l}" height="1.4" fill="${S}"/><rect x="${l}" y="0" width="${r - l}" height="1.6" fill="#3A3266"/>`;
  const abut = `<path d="M-31 7 L-31 -1 L-22 -1 L-22 7Z M22 7 L22 -1 L31 -1 L31 7Z" fill="#B85A42"/><path d="M-27 -1 V7 M26 -1 V7" stroke="#8E3F2E" stroke-width="1"/><path d="M-31 -1 H-22 M22 -1 H31" stroke="#D9785A" stroke-width="1.4"/>`;
  const post = (px: number) => `<rect x="${px}" y="-32" width="4" height="32" fill="${W}"/><rect x="${px + 2.4}" y="-32" width="1.6" height="32" fill="${S}"/>`;
  if (!done) return place(x, y, 1, abut + deck(-29, -6) + post(-7) + scaffold(-11, 0, 22, 34));
  return place(
    x,
    y,
    1,
    abut +
      `<path d="M-27 -9 H27 M-21 -9 V-4 M-14 -9 V-4 M14 -9 V-4 M21 -9 V-4" stroke="${W}" stroke-width="1.4"/>` +
      deck(-29, 29) +
      post(-8) +
      post(4) +
      `<rect x="-10" y="-35" width="20" height="3.4" fill="${W}"/><rect x="-10" y="-32.6" width="20" height="1" fill="${S}"/>` +
      `<path d="M-27 -27 L0 -38 L27 -27" stroke="${S}" stroke-width="3.2" fill="none" stroke-linejoin="round" transform="translate(0 1.2)"/><path d="M-27 -27 L0 -38 L27 -27" stroke="${W}" stroke-width="3" fill="none" stroke-linejoin="round"/>` +
      `<path d="M-16 -33.5 L-8 -22 M16 -33.5 L8 -22" stroke="${W}" stroke-width="1.6"/>` +
      `<path d="M-27 -26 V-4 M27 -26 V-4" stroke="#3A3266" stroke-width="1" stroke-dasharray="1.6 1"/><circle cx="-27" cy="-27" r="1.6" fill="#3A3266"/><circle cx="27" cy="-27" r="1.6" fill="#3A3266"/>`,
  );
}

/** Canal with a white drawbridge, a weeping willow, a little boat and ducks. */
const canal = definePiece({
  id: "dorp-canal",
  biome: "dorp",
  w: 110,
  h: 82,
  below: 10,
  render: (c, X) => {
    const course = mp("M-10 -60 L14 4", X, c.y);
    const ditch = (water: boolean) =>
      `<path d="${course}" stroke="${water ? "#8FD3A0" : "#D9C49A"}" stroke-width="26" stroke-linecap="round"/><path d="${course}" stroke="${water ? C.water : "#C9A36B"}" stroke-width="19" stroke-linecap="round"/>` +
      (water ? `<path d="${mp("M-12 -58 L11 0", X, c.y)}" stroke="${C.waterL}" stroke-width="6" stroke-linecap="round"/>` : "");
    const by = c.y - 24;
    const bx = X(2.6);
    const house2 = house(X(34) - 2, c.y - 34, 0.56, { roof: C.grape, roofD: C.grapeD });
    if (c.stage === 0) return house2 + ditch(false) + plot(X(32), c.y - 4, 0.62) + seedlings(X(-34), c.y - 6, 3);
    if (c.stage === 1) return house2 + willow(fit(c, X(-36), 24, 25, 55), c.y - 16, 0.5) + ditch(true) + drawbridge(bx, by, false);
    const boat = anim(X(10), c.y - 4, "float", `<path d="M-10 -3 H10 Q8 2 0 2 Q-8 2 -10 -3Z" fill="${C.orange}"/><path d="M-10 -3 H10 L9 -1 H-9Z" fill="${C.orangeD}"/><rect x="-4" y="-8" width="7" height="5" rx="1.2" fill="${C.cream}"/><rect x="-3" y="-7" width="2.4" height="2" fill="${C.glass}"/>`, 0.4);
    return (
      house(X(34) - 2, c.y - 34, 0.56, { roof: C.grape, roofD: C.grapeD, alive: true }) +
      willow(fit(c, X(-36), 24, 25, 55), c.y - 16, 0.78, true) +
      ditch(true) +
      `<path class="water" d="${mp("M-8 -54 L12 -2", X, c.y)}" stroke="#fff" stroke-width="1.6" stroke-dasharray="6 12" stroke-linecap="round" opacity=".85"/>` +
      duck(X(-6), c.y - 46, 0.6, c.side, true) +
      drawbridge(bx, by, true) +
      boat
    );
  },
});

/** A staked sapling (stage 0 orchard). */
const sapling = (x: number, y: number) =>
  place(x, y, 1, `<ellipse cx="0" cy="0" rx="4" ry="1.4" fill="#B08A55" opacity=".6"/><rect x="2" y="-14" width="1.4" height="14" fill="${C.woodL}"/><path d="M0 0 V-11" stroke="${C.wood}" stroke-width="1.3"/><ellipse cx="-2.4" cy="-11" rx="2.6" ry="1.4" fill="${C.greenM}"/><ellipse cx="2" cy="-12.4" rx="2.6" ry="1.4" fill="${C.green}"/>`);

/** Straw bee skep on a little stand; bees buzz around when alive. */
const beehive = (x: number, y: number, alive: boolean) =>
  place(
    x,
    y,
    1,
    `${sh(1, 0, 8, 2.2)}<rect x="-7" y="-6" width="2" height="6" fill="${C.wood}"/><rect x="5" y="-6" width="2" height="6" fill="${C.wood}"/><rect x="-8" y="-7" width="16" height="2" fill="${C.woodL}"/>` +
      `<path d="M-7 -7 Q-8 -20 0 -21 Q8 -20 7 -7Z" fill="#E8B04A"/><path d="M2 -20.6 Q8 -18 7 -7 L3 -7 Q5 -14 2 -20.6Z" fill="#C98F2A"/><path d="M-6.6 -11 H6.8 M-6 -15 H6 M-4 -18.6 H4" stroke="#C98F2A" stroke-width="1"/><path d="M-1.6 -7 Q0 -10 1.6 -7Z" fill="${C.ink}"/>`,
  ) +
  (alive
    ? [[-9, -22, 0], [8, -26, 0.5], [12, -16, 1]].map(([dx, dy, d]) => anim(x + dx, y + dy, "bob", `<ellipse cx="0" cy="0" rx="2" ry="1.4" fill="#FFC83D"/><path d="M-.6 -1.2 V1.2 M.8 -1.2 V1.2" stroke="${C.ink}" stroke-width=".7"/><ellipse cx="-.4" cy="-1.8" rx="1.3" ry=".9" fill="#fff" opacity=".85"/>`, d)).join("")
    : "");

/** Orchard: rows of apple and pear trees, a ladder, crates of apples and a beehive. */
const orchard = definePiece({
  id: "dorp-orchard",
  biome: "dorp",
  w: 110,
  h: 82,
  render: (c, X) => {
    const backRow = [-36, -8, 20];
    const frontRow = [-22, 8];
    const grass = `<ellipse cx="${c.x}" cy="${c.y - 18}" rx="52" ry="22" fill="#CFE9A6" opacity=".5"/>`;
    if (c.stage === 0)
      return grass + backRow.map((d) => sapling(X(d), c.y - 36)).join("") + frontRow.map((d) => sapling(X(d), c.y - 10)).join("") + plot(X(34), c.y - 4, 0.62);
    if (c.stage === 1)
      return (
        grass +
        backRow.map((d) => tree(X(d), c.y - 36, 0.4)).join("") +
        frontRow.map((d) => tree(X(d), c.y - 10, 0.46)).join("") +
        ladder(X(22), c.y + 4, X(44), c.y + 2) +
        crate(X(38), c.y - 12, 0.85)
      );
    const apples = `<circle cx="${X(30) - 3}" cy="${c.y - 3}" r="2.2" fill="#E8364F"/><circle cx="${X(30) + 1}" cy="${c.y - 3.6}" r="2.2" fill="#E8364F"/><circle cx="${X(30) - 1}" cy="${c.y - 5.6}" r="2.2" fill="#FF5C6F"/>`;
    return (
      grass +
      backRow.map((d, i) => fruitTree(X(d), c.y - 36, 0.62, i === 1 ? "#E9C93A" : "#E8364F")).join("") +
      beehive(X(44), c.y - 18, true) +
      frontRow.map((d) => fruitTree(X(d), c.y - 10, 0.7)).join("") +
      ladder(X(20), c.y - 6, X(13), c.y - 32) +
      crate(X(30), c.y + 2, 0.8) +
      apples +
      crate(X(44), c.y + 4, 0.7)
    );
  },
});

/** A kid in a football shirt (unmirrored, ~17px tall). */
const kid = (x: number, y: number, shirt: string, kick = false, f: 1 | -1 = 1) =>
  facing(
    x,
    y,
    f,
    1,
    `<ellipse cx="1" cy="0.4" rx="4" ry="1.2" fill="${C.shadow}" opacity=".18"/>` +
      (kick ? `<path d="M-1 -5 L-1.4 0 M1 -5 L4.4 -2" stroke="#F2C29B" stroke-width="1.5" stroke-linecap="round"/>` : `<path d="M-1 -5 V0 M1 -5 V0" stroke="#F2C29B" stroke-width="1.5" stroke-linecap="round"/>`) +
      `<rect x="-2.6" y="-7.6" width="5.2" height="3" rx=".8" fill="#3A3266"/><path d="M-2.8 -7 L-2.8 -12 Q0 -13.6 2.8 -12 L2.8 -7Z" fill="${shirt}"/><path d="M-2.8 -11.6 L-4.6 -8.6 M2.8 -11.6 L4.6 -9" stroke="${shirt}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<circle cx="0" cy="-15.4" r="2.9" fill="#F2C29B"/><path d="M-2.9 -15.6 Q-2.6 -18.8 0 -18.6 Q2.8 -18.6 2.9 -15.8 Q1 -17 -2.9 -15.6Z" fill="${C.woodD}"/>`,
  );

/** Football pitch (symmetric, so it needs no mirroring), with goals, corner flags and a ball. */
const pitch = definePiece({
  id: "dorp-pitch",
  biome: "dorp",
  w: 110,
  h: 84,
  render: (c, X) => {
    const px = c.x;
    const py = c.y;
    // Trapezoid: front edge y=2 (±52), back edge y=−30 (±41).
    const edge = (t: number, side: -1 | 1) => ({ x: px + side * (52 - 11 * t), y: py + 2 - 32 * t });
    const quad = (a: number, b: number, fill: string) =>
      `<path d="M${r1(px - 52 + 104 * a)} ${py + 2} L${r1(px - 52 + 104 * b)} ${py + 2} L${r1(px - 41 + 82 * b)} ${py - 30} L${r1(px - 41 + 82 * a)} ${py - 30}Z" fill="${fill}"/>`;
    const sand = `<path d="M${px - 54} ${py + 4} L${px + 54} ${py + 4} L${px + 43} ${py - 32} L${px - 43} ${py - 32}Z" fill="#E9D6AE"/>`;
    if (c.stage === 0)
      return (
        sand +
        [edge(0, -1), edge(0, 1), edge(1, 1), edge(1, -1)].map((p) => `<rect x="${r1(p.x - 1.2)}" y="${r1(p.y - 8)}" width="2.4" height="8" fill="${C.woodL}"/>`).join("") +
        `<path d="M${px - 52} ${py - 4} L${px + 52} ${py - 4} L${px + 41} ${py - 36} L${px - 41} ${py - 36}Z" fill="none" stroke="${C.orange}" stroke-width="1.2" stroke-dasharray="3 2"/>` +
        plot(px, c.y - 8, 0.6)
      );
    let grass = "";
    const n = c.stage === 2 ? 6 : 3;
    for (let i = 0; i < n; i++) grass += quad(i / 6, (i + 1) / 6, i % 2 ? "#7FD37A" : "#6CC46A");
    const L = (t: number) => ({ x: px - 52 + 11 * t, y: py + 2 - 32 * t });
    const lines =
      `<path d="M${px - 49} ${py} L${px + 49} ${py} L${px + 39} ${py - 28} L${px - 39} ${py - 28}Z M${px} ${py} V${py - 28}" stroke="#fff" stroke-width="1.3" fill="none" opacity=".9"/>` +
      `<ellipse cx="${px}" cy="${py - 14}" rx="9" ry="4.4" stroke="#fff" stroke-width="1.3" fill="none" opacity=".9"/>` +
      ([-1, 1] as const)
        .map((sd) => {
          const a = L(0.3);
          const b = L(0.7);
          const fx = (x: number) => r1(sd === -1 ? x : 2 * px - x);
          return `<path d="M${fx(a.x + 3)} ${r1(a.y)} L${fx(a.x + 13)} ${r1(a.y)} L${fx(b.x + 13)} ${r1(b.y)} L${fx(b.x + 3)} ${r1(b.y)}" stroke="#fff" stroke-width="1.2" fill="none" opacity=".9"/>`;
        })
        .join("");
    const goal = (sd: -1 | 1, net: boolean) => {
      const a = L(0.38);
      const b = L(0.62);
      const fx = (x: number) => r1(sd === -1 ? x + 3 : 2 * px - x - 3);
      const back = -sd * 5;
      return (
        (net
          ? `<path d="M${fx(a.x)} ${r1(a.y)} L${fx(a.x)} ${r1(a.y - 12)} L${fx(b.x)} ${r1(b.y - 12)} L${r1(+fx(b.x) + back)} ${r1(b.y)} L${r1(+fx(a.x) + back)} ${r1(a.y)}Z" fill="#fff" opacity=".45"/>` +
            `<path d="M${r1(+fx(a.x) + back * 0.5)} ${r1(a.y - 6)} L${r1(+fx(b.x) + back * 0.5)} ${r1(b.y - 6)} M${r1(+fx(a.x) + back * 0.5)} ${r1(a.y)} L${r1(+fx(b.x) + back * 0.5)} ${r1(b.y - 6)}" stroke="#fff" stroke-width=".6" opacity=".8"/>`
          : "") +
        `<path d="M${fx(a.x)} ${r1(a.y)} L${fx(a.x)} ${r1(a.y - 12)} L${fx(b.x)} ${r1(b.y - 12)} L${fx(b.x)} ${r1(b.y)}" stroke="#fff" stroke-width="2" fill="none" stroke-linejoin="round"/>`
      );
    };
    const cornerFlag = (x: number, y: number, alive: boolean) =>
      `<rect x="${r1(x - 0.5)}" y="${r1(y - 9)}" width="1" height="9" fill="${C.ink}"/><path${alive ? ` class="flag"` : ""} d="M${r1(x + 0.5)} ${r1(y - 9)} L${r1(x + 5.5)} ${r1(y - 7.5)} L${r1(x + 0.5)} ${r1(y - 6)}Z" fill="${C.orange}"/>`;
    const floodlight = (x: number) =>
      place(
        x,
        py - 32,
        1,
        `${sh(0, 0, 5, 1.6)}<rect x="-1.2" y="-44" width="2.4" height="44" fill="#8C82B5"/><rect x="-.2" y="-44" width="1.4" height="44" fill="#6E6496"/><rect x="-6" y="-51" width="12" height="7" rx="1.2" fill="#3A3266"/>` +
          [-3, 3].map((lx) => `<circle cx="${lx}" cy="-47.5" r="2.2" fill="${C.cream}"/><circle class="wl-on" cx="${lx}" cy="-47.5" r="2.2" fill="${C.yellowL}"/>`).join(""),
      ) + glow(x, py - 79.5, 22);
    if (c.stage === 1) {
      const cart = place(X(14), c.y - 8, 1, `${sh(0, 0, 6, 1.6)}<rect x="-4" y="-6" width="8" height="5" rx="1" fill="${C.pink}"/><circle cx="-2.4" cy="-1" r="1.6" fill="#3A3266"/><circle cx="2.4" cy="-1" r="1.6" fill="#3A3266"/><path d="M4 -5 L8 -10" stroke="#3A3266" stroke-width="1.2"/>`);
      return sand + grass + `<path d="M${px - 49} ${py} L${px - 2} ${py} M${px - 39} ${py - 28} L${px - 2} ${py - 28}" stroke="#fff" stroke-width="1.3" opacity=".9"/>` + goal(-1, false) + cart;
    }
    return (
      house(X(-14) - 4, c.y - 34, 0.5, { roof: C.orange, roofD: C.orangeD }) +
      flag(X(8), c.y - 34, C.orange, 26) +
      floodlight(X(-44)) +
      floodlight(X(44)) +
      bench(X(22), c.y - 34, 0.6) +
      sand +
      grass +
      lines +
      goal(-1, true) +
      goal(1, true) +
      cornerFlag(px - 41, py - 30, true) +
      cornerFlag(px + 41, py - 30, true) +
      cornerFlag(px - 52, py + 2, true) +
      cornerFlag(px + 52, py + 2, true) +
      `<ellipse cx="${X(8)}" cy="${c.y - 9}" rx="3" ry="1" fill="${C.shadow}" opacity=".2"/>` +
      kid(px - 34, py - 12, C.yellow) +
      kid(X(-2), c.y - 6, C.pink, true, c.side) +
      kid(X(22), c.y - 20, C.grape) +
      anim(X(8), c.y - 12, "bob", `<circle r="2.6" fill="#fff"/><path d="M-1 -1 L1 -1.2 L1.4 .6 L0 1.4 L-1.4 .4Z" fill="${C.ink}"/>`)
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
  pieces: [windmillPiece, farm, tulips, churchSquare, bakery, canal, orchard, pitch],
};
