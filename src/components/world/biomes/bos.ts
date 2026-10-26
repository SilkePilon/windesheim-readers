import {
  C,
  anim,
  birch,
  birdV,
  building,
  bushes,
  campfire,
  crane,
  deer,
  definePiece,
  duck,
  fairyLights,
  flag,
  flowers,
  glow,
  hayBale,
  house,
  ladder,
  logPile,
  mp,
  mushrooms,
  pine,
  place,
  planks,
  plot,
  pond,
  r1,
  rock,
  seedlings,
  sh,
  star,
  tent,
  tree,
  tuft,
  win,
  type WorldBiome,
} from "../kit";

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


const TENT_A: [string, string] = [C.orange, C.orangeD];
const TENT_B: [string, string] = ["#8C66FF", "#6340D8"];

/** A rolled-up tent / sleeping mat (end facing the viewer). */
const roll = (x: number, y: number, col: [string, string]) =>
  place(x, y, 1, `${sh(2, 0, 9, 2.4)}<rect x="-4" y="-7" width="14" height="7" rx="3.5" fill="${col[1]}"/><circle cx="-4" cy="-3.5" r="3.6" fill="${col[0]}"/><circle cx="-4" cy="-3.5" r="1.4" fill="${col[1]}"/>`);

/** A log to sit on (side view). */
const logSeat = (x: number, y: number) =>
  place(x, y, 1, `${sh(1, 0, 11, 2.6)}<rect x="-9" y="-5.5" width="19" height="5.5" rx="2.6" fill="#8a5a3a"/><path d="M-6 -5 H9" stroke="#B07A45" stroke-width="1.2" stroke-linecap="round"/><ellipse cx="-9" cy="-2.75" rx="2.4" ry="2.75" fill="#C99A6B"/>`);

/** Campsite: two tents around a campfire, a log seat and a lantern. */
const camp = definePiece({
  id: "bos-camp",
  biome: "bos",
  w: 108,
  h: 80,
  render: (c, X) => {
    const back = pine(X(-42), c.y - 22, 0.9) + pine(X(-22), c.y - 40, 0.68);
    if (c.stage === 0)
      return back + plot(X(-8), c.y - 6, 0.9) + campfire(X(28), c.y + 2) + roll(X(26), c.y - 16, TENT_A) + roll(X(38), c.y - 10, TENT_B) + seedlings(X(-30), c.y + 6, 3);
    const tentB =
      c.stage === 2
        ? tent(X(4), c.y - 30, 0.86, TENT_B)
        : // Frame only: the A-poles and ridge, the fabric still rolled up beside it.
          place(X(4), c.y - 30, 0.86, `<path d="M-14 0 L0 -22 L14 0 M0 -22 L22 -27 M22 -27 L32 -6 M22 -27 L12 -5" stroke="${C.ink}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>`) +
          roll(X(12), c.y - 18, TENT_B);
    const pennant = place(X(-24), c.y - 28.6, 1, `<rect x="-.6" y="-9" width="1.2" height="9" fill="${C.wood}"/>${c.stage === 2 ? `<path class="flag" d="M.6 -9 L8 -7 L.6 -5Z" fill="${C.yellow}"/>` : ""}`);
    const lantern =
      place(X(-2), c.y + 4, 1, `<rect x="-.7" y="-20" width="1.4" height="20" fill="${C.woodD}"/><path d="M0 -20 h5 v2" stroke="${C.woodD}" stroke-width="1.2" fill="none"/><rect x="2.6" y="-17" width="5" height="6" rx="1.4" fill="${C.yellowL}"/><path d="M2.6 -17 h5 l-1 -1.6 h-3Z" fill="${C.ink}"/>`) +
      glow(X(-2) + 5, c.y - 10, 11);
    return (
      back +
      tentB +
      tent(X(-24), c.y - 4, 1.12, TENT_A) +
      pennant +
      logSeat(X(24), c.y - 12) +
      (c.stage === 2 ? campfire(X(28), c.y + 2, true) + lantern + logSeat(X(40), c.y + 4) : campfire(X(28), c.y + 2) + logPile(X(40), c.y + 4, 0.75))
    );
  },
});

/** Cattails at the water's edge; `alive` sways them. */
const reeds = (x: number, y: number, alive: boolean) => {
  const body =
    `<path d="M-4 0 Q-5 -12 -7 -20 M0 0 Q0 -14 1 -24 M4 0 Q5 -10 8 -17 M-2 0 Q-6 -6 -11 -9 M2 0 Q6 -7 11 -10" stroke="#4E9F45" stroke-width="1.5" fill="none" stroke-linecap="round"/>` +
    `<rect x="-8.6" y="-25" width="3" height="7" rx="1.5" fill="#8a5a3a"/><rect x="-.4" y="-29" width="3" height="7" rx="1.5" fill="#6E4428"/><rect x="6.6" y="-21" width="3" height="6.5" rx="1.5" fill="#8a5a3a"/>`;
  return alive ? anim(x, y, "sway", body, 0.8) : place(x, y, 1, body);
};

/** Wooden rowboat; `alive` rocks it. */
const rowboat = (x: number, y: number, alive: boolean) => {
  const body = `<path d="M-13 -4 Q-12 2 -6 2 L8 2 Q12 1 14 -4Z" fill="#B07A45"/><path d="M-13 -4 L14 -4 Q12 -1.5 8 -1 L-6 -1 Q-11 -1.5 -13 -4Z" fill="#5E3B26"/><path d="M-13 -4 L14 -4" stroke="#E2BC85" stroke-width="1.2" stroke-linecap="round"/><path d="M-3 -4 L-6 -9 M4 -4 L8 -8" stroke="#E2BC85" stroke-width="1.2" stroke-linecap="round"/>`;
  return alive ? anim(x, y, "float", body, 0.5) : place(x, y, 1, body);
};

/** Lake with a jetty, a moored rowboat, ducks and cattails. */
const lake = definePiece({
  id: "bos-lake",
  biome: "bos",
  w: 108,
  h: 76,
  below: 10,
  render: (c, X) => {
    const back = pine(X(-40), c.y - 34, 0.85) + tree(X(-12), c.y - 38, 0.62) + pine(X(16), c.y - 36, 0.66);
    const lx = X(-6);
    const ly = c.y - 14;
    const deckTop = (from: number) => mp(`M${from} -16 L52 -16 L52 -11 L${from} -11Z`, X, c.y);
    const deckFront = (from: number) => mp(`M${from} -11 L52 -11 L52 -9 L${from} -9Z`, X, c.y);
    const posts = (ds: number[]) => ds.map((d) => `<rect x="${r1(X(d) - 1.2)}" y="${c.y - 11}" width="2.4" height="${d > 44 ? 9 : 7}" fill="${C.woodD}"/>`).join("");
    const slats = (from: number) => {
      let d = "";
      for (let k = from + 5; k < 52; k += 5) d += mp(`M${k} -16 L${k} -11 `, X, c.y);
      return `<path d="${d}" stroke="${C.wood}" stroke-width=".8" opacity=".6"/>`;
    };
    if (c.stage === 0) {
      const hollow = `<ellipse cx="${lx}" cy="${ly}" rx="46" ry="16" fill="#D9C49A"/><ellipse cx="${r1(lx + 3)}" cy="${ly + 2}" rx="38" ry="11" fill="#CDB78C"/><ellipse cx="${r1(lx - 6)}" cy="${ly + 3}" rx="10" ry="3" fill="${C.water}" opacity=".7"/>`;
      return back + hollow + reeds(X(-46), c.y - 6, false) + planks(X(36), c.y + 4, 0.8) + plot(X(26), c.y - 14, 0.62);
    }
    if (c.stage === 1)
      return (
        back +
        `<ellipse cx="${lx}" cy="${ly}" rx="46" ry="16" fill="#D9C49A"/>` +
        pond(X(-10), ly + 1, 34, 11) +
        posts([16, 28, 40, 50]) +
        `<path d="${deckTop(40)}" fill="${C.woodL}"/><path d="${deckFront(40)}" fill="${C.wood}"/>` +
        reeds(X(-46), c.y - 6, false) +
        planks(X(36), c.y + 4, 0.8)
      );
    return (
      back +
      pond(lx, ly, 44, 15, true) +
      posts([16, 28, 40, 50]) +
      `<path d="${deckTop(12)}" fill="${C.woodL}"/>${slats(12)}<path d="${deckFront(12)}" fill="${C.wood}"/>` +
      rowboat(X(0), c.y - 4, true) +
      `<path d="M${X(16)} ${c.y - 10} Q${X(14)} ${c.y - 5} ${X(10)} ${c.y - 6}" stroke="${C.creamD}" stroke-width=".8" fill="none"/>` +
      duck(X(-30), c.y - 20, 0.85, c.side, true) +
      duck(X(-16), c.y - 14, 0.72, c.side === 1 ? -1 : 1, true, 1.1) +
      reeds(X(-46), c.y - 6, true)
    );
  },
});

/**
 * Rocky cliff (unmirrored, light from the top-left): a lit left crag and a shaded right crag with
 * a dark cleft between them where the water falls (x = 0). `top` = cleft lip height.
 */
function cliff(x: number, y: number) {
  return place(
    x,
    y,
    1,
    `${sh(4, 0, 36, 7)}<path d="M-9 0 L-8 -66 Q0 -78 9 -74 L8 0Z" fill="#5E5980"/>` +
      `<path d="M-36 0 Q-40 -26 -30 -44 Q-24 -60 -10 -66 L-6 -66 Q-9 -36 -7 0Z" fill="#A39FC4"/><path d="M-30 -30 Q-28 -46 -18 -56" stroke="#D3CFE8" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
      `<path d="M-32 -16 Q-22 -20 -12 -16 M-26 -40 Q-18 -43 -11 -40" stroke="#7E79A3" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      `<path d="M7 0 Q10 -40 7 -74 Q22 -80 30 -60 Q38 -36 35 0Z" fill="#8F8AAE"/><path d="M20 -74 Q28 -70 30 -60 Q38 -36 35 0 L22 0 Q28 -36 20 -74Z" fill="#76719A"/>` +
      `<path d="M10 -50 Q18 -54 26 -50 M11 -24 Q20 -27 30 -23" stroke="#6E6992" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      `<path d="M-32 -42 Q-26 -62 -8 -68 Q-14 -60 -22 -52 Q-28 -46 -32 -42Z" fill="#7CC96A"/><path d="M-28 -46 Q-22 -58 -12 -64" stroke="#B5E89F" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      `<path d="M7 -72 Q20 -82 30 -62 Q22 -70 8 -68Z" fill="#5FAF55"/>` +
      // Mossy boulders at the foot of each crag.
      `<path d="M-38 0 Q-40 -9 -32 -11 Q-24 -12 -22 -4 Q-22 0 -38 0Z" fill="#8F8AAE"/><path d="M-36 -6 Q-33 -10 -28 -10" stroke="#C3BEDD" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      `<path d="M26 0 Q24 -8 32 -10 Q40 -10 40 -3 Q40 0 26 0Z" fill="#76719A"/>`,
  );
}

/** Waterfall tumbling through a cleft in the rocks into a pool; a stream with stepping stones. */
const waterfall = definePiece({
  id: "bos-waterfall",
  biome: "bos",
  w: 106,
  h: 100,
  render: (c, X) => {
    const cx = X(-16);
    const fy = c.y - 10; // pool level
    const stones = (n: number) =>
      [[22, -3], [31, 0], [40, -2]].slice(0, n).map(([d, dy]) => `<ellipse cx="${X(d)}" cy="${c.y + dy}" rx="3.8" ry="2.3" fill="#A79CD6"/><ellipse cx="${r1(X(d) - 0.8)}" cy="${c.y + dy - 0.8}" rx="2.2" ry="1.1" fill="#D9CEFF"/>`).join("");
    // The stream: from the pool (local d of the cleft = −16) out towards the road, rounded at the end.
    const course = "M-12 -8 C4 -8 14 0 30 -1 C38 -1.5 44 -3 48 -2";
    const stream = (water: boolean, w: number) =>
      water
        ? `<path d="${mp(course, X, c.y)}" stroke="${C.water}" stroke-width="${w}" fill="none" stroke-linecap="round"/><path d="${mp(course, X, c.y)}" stroke="${C.waterL}" stroke-width="${r1(w * 0.45)}" fill="none" stroke-linecap="round"/>`
        : `<path d="${mp(course, X, c.y)}" stroke="#D9C49A" stroke-width="${w}" fill="none" stroke-linecap="round"/><path d="${mp(course, X, c.y)}" stroke="#B9A47C" stroke-width="1.6" stroke-dasharray="1.5 5" fill="none" stroke-linecap="round"/>`;
    const tops = pine(cx + 18, c.y - 72, 0.5) + pine(cx - 20, c.y - 54, 0.55);
    if (c.stage === 0) return tops + cliff(cx, c.y - 2) + stream(false, 8) + plot(X(26), c.y - 16, 0.6) + seedlings(X(-38), c.y + 6, 2);
    const pool = (rx: number) => `<ellipse cx="${cx}" cy="${fy}" rx="${rx}" ry="${r1(rx * 0.3)}" fill="${C.water}"/><ellipse cx="${cx - 2}" cy="${fy - 1}" rx="${r1(rx * 0.66)}" ry="${r1(rx * 0.16)}" fill="${C.waterL}"/>`;
    if (c.stage === 1)
      return (
        tops +
        cliff(cx, c.y - 2) +
        `<path d="M${cx} ${c.y - 74} Q${cx + 1.5} ${c.y - 40} ${cx} ${fy}" stroke="${C.waterL}" stroke-width="2.4" fill="none"/>` +
        stream(true, 4) +
        pool(12) +
        stones(1) +
        rock(X(40), c.y + 4, 0.8) +
        rock(X(46), c.y - 8, 0.7)
      );
    const fall =
      `<path d="M${cx - 8} ${c.y - 74} Q${cx} ${c.y - 79} ${cx + 8} ${c.y - 74} L${cx + 8} ${fy} L${cx - 8} ${fy}Z" fill="${C.waterL}"/>` +
      `<path d="M${cx + 3} ${c.y - 76} Q${cx + 6} ${c.y - 76} ${cx + 8} ${c.y - 74} L${cx + 8} ${fy} L${cx + 3} ${fy}Z" fill="${C.water}"/>` +
      [cx - 4.5, cx, cx + 4.5].map((fx, i) => `<path class="water" style="animation-delay:-${i * 0.7}s" d="M${r1(fx)} ${c.y - 74} V${fy - 2}" stroke="#fff" stroke-width="1.5" stroke-dasharray="7 9" stroke-linecap="round" opacity=".9"/>`).join("") +
      `<path d="M${cx - 9} ${c.y - 74} Q${cx} ${c.y - 80} ${cx + 9} ${c.y - 74}" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    const foam = [[-9, 0, 4, 0], [-2, 1.5, 5, 0.6], [6, 0, 4.2, 1.2], [12, 1, 3, 0.3]]
      .map(([dx, dy, r, d]) => anim(cx + dx, fy + dy, "float", `<circle r="${r}" fill="#fff" opacity=".92"/>`, d))
      .join("");
    return (
      tops +
      cliff(cx, c.y - 2) +
      stream(true, 9) +
      `<path class="water" d="${mp(course, X, c.y)}" stroke="#fff" stroke-width="1.4" stroke-dasharray="6 12" fill="none" stroke-linecap="round" opacity=".85"/>` +
      pool(22) +
      fall +
      foam +
      stones(3) +
      rock(X(46), c.y - 12, 0.7) +
      flowers(X(-40), c.y + 4, c.rng, 3, 5)
    );
  },
});

/** Treehouse in a big oak: rope ladder, a swing on the road side, a lantern and a pennant. */
const treehouse = definePiece({
  id: "bos-treehouse",
  biome: "bos",
  w: 98,
  h: 102,
  render: (c, X) => {
    const cx = X(-10);
    if (c.stage === 0) return tree(cx, c.y - 4, 0.42) + planks(X(26), c.y + 2, 0.9) + plot(X(10), c.y - 10, 0.7) + seedlings(X(-30), c.y + 6, 3);
    const trunk = place(
      cx,
      c.y,
      1,
      `${sh(0, 0, 26, 6)}<path d="M-12 0 Q-7 -3 -7 -10 L-6 -52 L6 -52 L7 -10 Q7 -3 12 0Z" fill="${C.wood}"/><path d="M1 0 L2 -52 L6 -52 L7 -10 Q7 -3 12 0Z" fill="${C.woodD}"/><path d="M-3 -8 Q-4 -24 -3 -40" stroke="#9A6A3C" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
        `<circle cx="0" cy="-74" r="26" fill="#0E9474"/><circle cx="-22" cy="-62" r="14" fill="#0E9474"/><circle cx="22" cy="-62" r="14" fill="#0E9474"/><circle cx="-14" cy="-86" r="14" fill="#0E9474"/><circle cx="14" cy="-86" r="14" fill="#0E9474"/>` +
        `<circle cx="-6" cy="-80" r="20" fill="#19C59B"/><circle cx="-22" cy="-66" r="9" fill="#19C59B"/><circle cx="10" cy="-90" r="9" fill="#19C59B"/><circle cx="-12" cy="-92" r="5" fill="#5FE0B4"/><circle cx="-26" cy="-70" r="3.5" fill="#5FE0B4"/>`,
    );
    const deck = place(
      cx,
      c.y,
      1,
      `<path d="M-18 -46 L-5 -32 M16 -46 L5 -32" stroke="${C.wood}" stroke-width="2.4" stroke-linecap="round"/><path d="M-24 -50 L22 -50 L28 -54 L-18 -54Z" fill="${C.woodL}"/><path d="M-24 -50 L22 -50 L22 -46 L-24 -46Z" fill="${C.wood}"/><path d="M22 -50 L28 -54 L28 -50 L22 -46Z" fill="${C.woodD}"/>` +
        `<path d="M-24 -50 V-58 M-10 -50 V-58 M22 -50 V-58 M-24 -57 H-10" stroke="${C.woodL}" stroke-width="1.4" stroke-linecap="round"/>`,
    );
    // Rope ladder and swing hang on the road side (the platform spans −24…28 around the trunk).
    const lx = cx + (c.side === 1 ? 18 : -20);
    const ropeLadder = ladder(lx, c.y - 1, lx, c.y - 46, "#C99A6B");
    const bx = cx + c.side * 38;
    const branch = `<path d="M${cx + c.side * 5} ${c.y - 40} Q${cx + c.side * 22} ${c.y - 46} ${bx} ${c.y - 46}" stroke="${C.wood}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
    if (c.stage === 1) {
      const pulley = `<path d="M${bx - c.side * 3} ${c.y - 45} V${c.y - 22}" stroke="#C99A6B" stroke-width="1"/>` + place(bx - c.side * 3, c.y - 22, 1, `<path d="M-8 0 L8 0 L9 -2.6 L-7 -2.6Z" fill="${C.woodL}"/><path d="M-8 0 L8 0" stroke="${C.wood}" stroke-width="1"/><path d="M-8 -2 L0 -6 L8 -2" stroke="#C99A6B" stroke-width=".8" fill="none"/>`);
      return trunk + deck + building(cx - 2, c.y - 54, 0.55, { ...LOG, craneSide: 0 }) + branch + pulley + ropeLadder + planks(X(30), c.y + 4, 0.8);
    }
    const swing = anim(bx - c.side * 3, c.y - 45, "sway", `<path d="M-4 0 V30 M4 0 V30" stroke="#C99A6B" stroke-width="1"/><rect x="-6" y="29" width="12" height="3" rx="1.2" fill="${C.pink}"/>`);
    const lantern = place(cx - 22, c.y - 46, 1, `<path d="M0 0 V3" stroke="${C.ink}" stroke-width=".8"/><rect x="-2.4" y="3" width="4.8" height="5.4" rx="1.4" fill="${C.yellowL}"/><path d="M-2.6 3 h5.2 l-1 -1.4 h-3.2Z" fill="${C.ink}"/>`) + glow(cx - 22, c.y - 40, 10);
    return (
      trunk +
      deck +
      house(cx - 2, c.y - 54, 0.6, { ...LOG, roof: C.pink, roofD: C.pinkD, logs: C.wood }) +
      place(cx - 8, c.y - 77, 1, `<rect x="-.7" y="-11" width="1.4" height="11" fill="${C.woodD}"/><path class="flag" d="M.7 -11 L10 -8.4 L.7 -5.8Z" fill="${C.yellow}"/>`) +
      lantern +
      branch +
      swing +
      ropeLadder +
      flowers(X(30), c.y + 2, c.rng, 4, 8)
    );
  },
});

/** Toadstool cottage (unmirrored): cream stem with a door and round window, spotted red cap. */
function toadstoolHouse(x: number, y: number, s: number, done: boolean) {
  return (
    place(
      x,
      y,
      s,
      `${sh(4, 0, 20, 5)}<path d="M-11 0 Q-12 -16 -9 -32 L9 -32 Q12 -16 11 0Z" fill="${C.cream}"/><path d="M3 0 Q5 -16 4 -32 L9 -32 Q12 -16 11 0Z" fill="${C.creamD}"/>` +
        (done
          ? `<path d="M-3 0 L-3 -9 Q0.5 -14 4 -9 L4 0Z" fill="${C.wood}"/><circle cx="2.4" cy="-5" r=".8" fill="${C.yellow}"/>${win(-9, -21, 5, 5, false, 2.5)}<path d="M-6 0 Q-7 -2 -9 -2 M8 0 Q9 -2 11 -2" stroke="${C.greenM}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
          : "") +
        `<path d="M-26 -28 Q-26 -56 0 -58 Q26 -56 26 -28 Q0 -22 -26 -28Z" fill="#E8466F"/><path d="M6 -57.5 Q26 -54 26 -28 Q17 -25.5 9 -25 Q17 -42 6 -57.5Z" fill="#C2305A"/>` +
        `<path d="M-26 -28 Q0 -22 26 -28 Q0 -19 -26 -28Z" fill="#F7C9B8"/><path d="M-20 -42 Q-16 -52 -6 -55" stroke="#FF8FB0" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
        `<circle cx="-13" cy="-44" r="3.6" fill="#fff"/><circle cx="-1" cy="-51" r="3" fill="#fff"/><circle cx="11" cy="-45" r="3" fill="#F3E6F0"/><circle cx="-20" cy="-33" r="2" fill="#fff"/><circle cx="17" cy="-35" r="2.2" fill="#F3E6F0"/><circle cx="2" cy="-38" r="2" fill="#fff"/>`,
    ) + (done ? glow(x - 6.5 * s, y - 18.5 * s, 9 * s) : "")
  );
}

/** One toadstool (unmirrored). */
const toad = (x: number, y: number, s: number) =>
  place(
    x,
    y,
    s,
    `<ellipse cx="2" cy="0.5" rx="6" ry="1.6" fill="${C.shadow}" opacity=".16"/><path d="M-1.8 0 L-1.4 -7 L1.4 -7 L1.8 0Z" fill="${C.cream}"/><path d="M-7 -6 Q-7 -13 0 -13.4 Q7 -13 7 -6 Q0 -4.4 -7 -6Z" fill="#E8466F"/><path d="M2 -13.2 Q7 -12 7 -6 Q5 -5.2 3 -5 Q5 -9 2 -13.2Z" fill="#C2305A"/><circle cx="-3" cy="-9.6" r="1.2" fill="#fff"/><circle cx="1.4" cy="-11.4" r=".9" fill="#fff"/><circle cx="4" cy="-8" r=".8" fill="#F3E6F0"/>`,
  );

/** Mushroom ring: a toadstool cottage, a ring of toadstools, fairy lights and fireflies. */
const fairyRing = definePiece({
  id: "bos-fairy",
  biome: "bos",
  w: 106,
  h: 86,
  render: (c, X) => {
    const back = pine(X(-42), c.y - 34, 0.78) + birch(X(30), c.y - 36, 0.72);
    const moss = `<ellipse cx="${X(10)}" cy="${c.y - 10}" rx="38" ry="13" fill="#A8E6B8" opacity=".8"/><ellipse cx="${X(8)}" cy="${c.y - 12}" rx="24" ry="7" fill="#C6F2D0" opacity=".8"/>`;
    // A ring around the moss: back ones first (smaller), front ones last.
    const ring = (s: number) =>
      [[0, -21, 0.75], [16, -24, 0.7], [32, -20, 0.75], [44, -11, 0.9], [-8, -10, 0.9], [40, 1, 1], [-2, 2, 1], [20, 5, 1.1]]
        .map(([d, dy, k]) => toad(X(d), c.y + dy, k * s))
        .join("");
    if (c.stage === 0) {
      const buttons = [[-18, -6], [-8, 2], [10, -2], [24, -14], [34, 2]].map(([d, dy]) => `<path d="M${X(d) - 2.4} ${c.y + dy} Q${X(d)} ${c.y + dy - 4} ${X(d) + 2.4} ${c.y + dy}Z" fill="#E8466F"/><circle cx="${X(d) - 0.6}" cy="${c.y + dy - 1.8}" r=".6" fill="#fff"/>`).join("");
      return back + moss + buttons + plot(X(-20), c.y - 14, 0.62) + seedlings(X(26), c.y + 6, 3);
    }
    const hx = X(-26);
    if (c.stage === 1) {
      const spool = place(X(30), c.y - 2, 1, `${sh(1, 0, 7, 2)}<ellipse cx="0" cy="-5" rx="5" ry="5" fill="${C.woodL}"/><circle cx="0" cy="-5" r="3.4" fill="#3A3266"/><circle cx="-1.6" cy="-6.4" r="1" fill="${C.yellowL}"/><circle cx="1.4" cy="-4" r="1" fill="#FF8FB0"/><circle cx="0" cy="-5" r="1" fill="${C.woodL}"/>`);
      return back + moss + toadstoolHouse(hx, c.y - 4, 0.6, false) + ladder(hx + 12, c.y - 2, hx + 6, c.y - 30) + ring(0.6) + spool;
    }
    const capEdge = hx + c.side * 25;
    const poleA = X(14);
    const poleB = X(46);
    const poles = [[poleA, -26, -42], [poleB, -16, -34]].map(([px, b, t]) => `<path d="M${px} ${c.y + b} L${px} ${c.y + t}" stroke="${C.woodD}" stroke-width="1.6" stroke-linecap="round"/>`).join("");
    return (
      back +
      moss +
      poles +
      toadstoolHouse(hx, c.y - 4, 1, true) +
      ring(1) +
      fairyLights([[capEdge, c.y - 36], [poleA, c.y - 42], [poleB, c.y - 34]], true) +
      star(X(0), c.y - 60, 0.7, 0) +
      star(X(36), c.y - 56, 0.6, 0.7) +
      star(X(-50), c.y - 46, 0.6, 1.3)
    );
  },
});

/** Hay rack for the deer (unmirrored); `done` adds the roof and hay. */
function hayRack(x: number, y: number, done: boolean) {
  return place(
    x,
    y,
    1,
    `${sh(2, 0, 18, 4)}<path d="M-7 -4 L-5 -28 M17 -4 L15 -28" stroke="${C.woodD}" stroke-width="2.4" stroke-linecap="round"/>` +
      (done ? `<path d="M-12 -24 Q-6 -31 0 -27 Q6 -32 12 -24Z" fill="#F2C95C"/><path d="M-9 -26 Q-4 -29 0 -27" stroke="#FFE08A" stroke-width="1.2" fill="none"/>` : "") +
      `<path d="M-12 -24 L12 -24 L7 -10 L-7 -10Z" fill="none" stroke="${C.woodL}" stroke-width="1.6"/><path d="M-8 -24 L-4.5 -10 M-4 -24 L-2 -10 M0 -24 V-10 M4 -24 L2 -10 M8 -24 L4.5 -10" stroke="${C.woodL}" stroke-width="1.1"/>` +
      `<path d="M-14 0 L-11 -30 M12 0 L9 -30" stroke="${C.wood}" stroke-width="2.6" stroke-linecap="round"/>` +
      (done
        ? `<path d="M-18 -29 L0 -41 L0 -37 L-15 -26.5Z" fill="#5FA05F"/><path d="M0 -41 L18 -29 L15 -26.5 L0 -37Z" fill="#3B6E47"/><path d="M-18 -29 L0 -41" stroke="#B5E89F" stroke-width="1.2" stroke-linecap="round"/>`
        : ""),
  );
}

/** Deer clearing: birches, a hay rack, a grazing stag, doe and fawn. */
const deerClearing = definePiece({
  id: "bos-deer",
  biome: "bos",
  w: 110,
  h: 84,
  render: (c, X) => {
    const back = birch(X(-38), c.y - 34, 0.9) + pine(X(-8), c.y - 42, 0.75) + birch(X(24), c.y - 40, 0.7);
    const grass = tuft(X(-46), c.y + 4) + tuft(X(2), c.y + 6, 0.9, C.greenM) + tuft(X(48), c.y - 4);
    if (c.stage === 0) return back + plot(X(4), c.y - 6, 0.9) + seedlings(X(-30), c.y + 4, 3) + grass;
    if (c.stage === 1) {
      const prints = [[2, 2], [10, -1], [18, 3], [26, 0], [34, 4]].map(([d, dy]) => `<ellipse cx="${X(d)}" cy="${c.y + dy}" rx="1.1" ry="1.6" fill="#8a6a4a" opacity=".55"/><ellipse cx="${X(d) + 2}" cy="${c.y + dy}" rx="1.1" ry="1.6" fill="#8a6a4a" opacity=".55"/>`).join("");
      return back + hayRack(X(-30), c.y - 6, false) + hayBale(X(-6), c.y + 2, 0.9) + hayBale(X(12), c.y - 10, 0.8) + prints + grass;
    }
    return (
      back +
      hayRack(X(-30), c.y - 6, true) +
      deer(X(32), c.y - 16, 0.85, c.side === 1 ? -1 : 1, "doe", true, 1.6) +
      deer(X(8), c.y - 2, 1.15, c.side, "stag", true) +
      deer(X(38), c.y + 4, 0.7, c.side === 1 ? -1 : 1, "fawn", true, 3) +
      grass +
      flowers(X(-14), c.y + 6, c.rng, 3, 6)
    );
  },
});

/** Forest-trail map board on two posts. */
const mapBoard = (x: number, y: number) =>
  place(
    x,
    y,
    1,
    `${sh(0, 0, 10, 2.6)}<rect x="-8" y="-16" width="2" height="16" fill="${C.wood}"/><rect x="6" y="-16" width="2" height="16" fill="${C.wood}"/><rect x="-10" y="-22" width="20" height="13" rx="1.6" fill="${C.woodL}"/>` +
      `<rect x="-8.4" y="-20.4" width="16.8" height="9.8" rx="1" fill="#D7F0C8"/><path d="M-6 -12.6 Q-2 -18 1 -14.4 Q4 -11 6.4 -18.6" stroke="${C.pink}" stroke-width="1" fill="none" stroke-dasharray="1.6 1.2"/><circle cx="6.4" cy="-18.6" r="1.2" fill="${C.orange}"/><path d="M-11 -22 L0 -26 L11 -22Z" fill="#4F8A5B"/>`,
  );

/** Ranger lookout tower: four braced legs, a cabin with a window strip, a pennant; map board. */
function towerFrame(x: number, y: number, top: number) {
  const L = (h: number) => -18 + (8 * h) / 54;
  const R = (h: number) => 14 - (6 * h) / 54;
  const legs = (dx: number, dy: number, c: string) =>
    `<path d="M${-18 + dx} ${dy} L${r1(L(top) + dx)} ${-top + dy} M${14 + dx} ${dy} L${r1(R(top) + dx)} ${-top + dy}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
  let braces = "";
  for (let a = 0; a + 27 <= top; a += 27) {
    const b = a + 27;
    braces += `M${r1(L(a))} ${-a} L${r1(R(b))} ${-b} M${r1(R(a))} ${-a} L${r1(L(b))} ${-b} M${r1(L(b))} ${-b} L${r1(R(b))} ${-b} `;
  }
  return place(
    x,
    y,
    1,
    `${legs(10, -5, C.woodD)}<path d="${braces.trim()}" stroke="${C.wood}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M-4 -2 L8 -16 L-6 -30 L6 -44" stroke="${C.woodL}" stroke-width="1.8" fill="none" stroke-linejoin="round" opacity="${top >= 54 ? 1 : 0}"/>${legs(0, 0, C.wood)}`,
  );
}

const rangerTower = definePiece({
  id: "bos-tower",
  biome: "bos",
  w: 96,
  h: 100,
  render: (c, X) => {
    const tx = X(-4) - 3;
    const back = pine(X(-38), c.y - 12, 0.7);
    if (c.stage === 0) {
      const footings = [[-18, 0], [14, 0], [-8, -5], [24, -5]].map(([dx, dy]) => `<path d="M${tx + dx - 3} ${c.y + dy} h6 v-3 h-6Z" fill="#B9AEE6"/><path d="M${tx + dx - 3} ${c.y + dy - 3} h6 l1 -1 h-6Z" fill="#D9CEFF"/>`).join("");
      return back + plot(tx + 2, c.y - 4, 1) + footings + logPile(X(34), c.y + 4, 0.8);
    }
    if (c.stage === 1) return back + towerFrame(tx, c.y, 27) + crane(X(30), c.y, 80, -c.side * 26) + logPile(X(38), c.y + 4, 0.7);
    const cabin = place(
      tx,
      c.y,
      1,
      `<path d="M-20 -54 L16 -54 L24 -59 L-12 -59Z" fill="${C.woodL}"/><path d="M-20 -54 L16 -54 L16 -51 L-20 -51Z" fill="${C.wood}"/><path d="M16 -54 L24 -59 L24 -56 L16 -51Z" fill="${C.woodD}"/>` +
        `<path d="M10 -56 L20 -59 L20 -74 L10 -71Z" fill="#B07A45"/><rect x="-16" y="-71" width="26" height="15" fill="#D9A46A"/><path d="M-16 -62 H10" stroke="${C.wood}" stroke-width="1" opacity=".5"/>` +
        win(-13, -69, 20, 5.4, false, 1) +
        `<path d="M-20 -70 L-2 -83 L14 -70Z" fill="#5FA05F"/><path d="M-2 -83 L24 -74 L14 -70Z" fill="#3B6E47"/><path d="M-20 -70 L-2 -83" stroke="#B5E89F" stroke-width="1.4" stroke-linecap="round"/>` +
        `<path d="M-20 -54 V-60 M-8 -54 V-60 M4 -54 V-60 M16 -54 V-60 M-20 -59.5 H16" stroke="${C.woodD}" stroke-width="1" opacity=".8"/>`,
    );
    return (
      back +
      towerFrame(tx, c.y, 54) +
      cabin +
      glow(tx - 3, c.y - 66, 16) +
      flag(tx - 2, c.y - 83, C.orange, 12) +
      mapBoard(X(32), c.y + 4) +
      birdV(X(30), c.y - 82, 1, true) +
      birdV(X(42), c.y - 74, 0.8, true, 0.9) +
      tuft(X(-26), c.y + 4)
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
  pieces: [cabin, camp, lake, waterfall, treehouse, fairyRing, deerClearing, rangerTower],
};
