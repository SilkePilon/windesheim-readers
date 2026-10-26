import {
  C,
  anim,
  bigLeaf,
  campfire,
  crate,
  definePiece,
  facing,
  fern,
  fit,
  flag,
  glow,
  ladder,
  mp,
  palm,
  person,
  place,
  planks,
  plot,
  r1,
  rock,
  scaffold,
  seedlings,
  sh,
  tent,
  torch,
  tuft,
  vine,
  win,
  type WorldBiome,
} from "../kit";

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
    const backPalm = palm(fit(c, X(-42), 18, 31), c.y - 16, 0.82, c.stage === 2);
    if (c.stage === 0)
      return (
        backPalm +
        [[-20, 2], [-6, 4], [14, 0]].map(([dx, dy]) => `<rect x="${X(dx) - 6}" y="${c.y + dy - 7}" width="12" height="7" rx="1.5" fill="${STONE.front}"/><rect x="${X(dx) - 6}" y="${c.y + dy - 9}" width="12" height="2.4" rx="1" fill="${STONE.top}"/>`).join("") +
        plot(X(28), c.y - 2, 0.8) +
        fern(X(-30), c.y + 4, 0.8)
      );
    const t1 = tier(tx, base, 72, 16);
    const t2 = tier(tx + 11, base - 16, 50, 15);
    const stairs = (h: number) => `<rect x="${tx + 29}" y="${base - h}" width="14" height="${h}" fill="${STONE.side}"/>` + Array.from({ length: Math.floor(h / 4) }, (_, i) => `<path d="M${tx + 29} ${base - 2 - i * 4} h14" stroke="${STONE.top}" stroke-width="1.2"/>`).join("");
    if (c.stage === 1)
      return backPalm + sh(tx + 36, base, 38, 7) + t1 + t2 + stairs(31) + `<g>${scaffold(tx + 18, base - 31, 36, 24)}</g>` + moss(tx + 2, base - 16, 16) + fern(fit(c, X(40), 15, 15), c.y + 4, 0.8);
    const t3 = tier(tx + 21, base - 31, 30, 14);
    const shrine = tier(tx + 27, base - 45, 18, 12, 5) + `<path d="M${tx + 32} ${base - 45} v-7 q4 -4 8 0 v7Z" fill="${STONE.dark}"/>`;
    return (
      backPalm +
      sh(tx + 36, base, 38, 7) +
      t1 + t2 + t3 + stairs(45) + shrine +
      moss(tx + 2, base - 16, 18) + moss(tx + 48, base - 31, 12) + moss(tx + 22, base - 45, 10) +
      hangingVine(tx + 6, base - 16, 12) + hangingVine(tx + 58, base - 31, 16) + hangingVine(tx + 26, base - 45, 10) +
      flag(tx + 36, base - 57, C.orange, 20) +
      torch(tx - 4, base + 2, true) + torch(tx + 78, base + 2, true) +
      bigLeaf(fit(c, X(44), 18, 18), c.y + 4, 0.7)
    );
  },
});


// ---------------------------------------------------------------- shared jungle bits

const LEAF = { d: "#0A6B4F", m: "#0E9474", l: "#19C59B", h: "#5FE0B4" };
const THATCH = { lit: "#E8BE62", shade: "#BF8A35", hi: "#F7DC94" };
type Plumage = [string, string, string, string];
/** Scarlet macaw / blue-and-gold macaw: body, wing, wing tip, belly. */
const SCARLET: Plumage = ["#E8364F", C.yellow, "#3F8FE0", "#B8253C"];
const BLUEGOLD: Plumage = ["#3F8FE0", "#6FB4F5", "#2A6DB5", C.yellow];

/** A macaw in flight, facing +x (mirror with `f`); `alive` bobs it. */
function parrotFlying(x: number, y: number, f: 1 | -1, s: number, p: Plumage, alive: boolean, delay = 0) {
  const body =
    `<path d="M-3 .4 L-17 5 L-16 2.2 L-3 -1.2Z" fill="${p[0]}"/><path d="M-11 3.4 L-17 5 L-16.4 3.2Z" fill="${p[2]}"/>` +
    `<ellipse cx="0" cy="0" rx="6.5" ry="3.2" fill="${p[0]}"/><path d="M-5 1.4 Q0 3.8 5.4 1.2 Q2 3.6 -3 2.8Z" fill="${p[3]}"/>` +
    `<circle cx="5.4" cy="-1.6" r="2.8" fill="${p[0]}"/><circle cx="6.5" cy="-1.5" r="1.3" fill="#fff"/><circle cx="6.7" cy="-1.7" r=".55" fill="${C.ink}"/>` +
    `<path d="M7.8 -2.8 Q10.8 -2 9.4 .8 Q8.4 0 7.8 -.6Z" fill="#3A3266"/>` +
    `<path d="M-2.4 -1.4 Q-.4 -10 6 -13.4 Q5 -6 3 -.8Z" fill="${p[1]}"/><path d="M1.4 -7.6 Q3.4 -11.8 6 -13.4 Q5.4 -8.8 4 -5.6Z" fill="${p[2]}"/>`;
  return anim(x, y, alive ? "bob" : "", facing(0, 0, f, s, body), delay);
}

/** A macaw perched (feet at x, y), facing +x (mirror with `f`). */
function parrotPerched(x: number, y: number, f: 1 | -1, s: number, p: Plumage) {
  return facing(
    x,
    y,
    f,
    s,
    `<path d="M-1.2 -2 L-3.6 10 L-.6 10 L1 -2Z" fill="${p[0]}"/><path d="M-3.1 7.4 L-3.6 10 L-.6 10 L-.3 7.4Z" fill="${p[2]}"/>` +
      `<ellipse cx="0" cy="-5.6" rx="3.4" ry="5.4" fill="${p[0]}"/><path d="M1.4 -9 Q3.6 -5 1.6 -1 Q3.4 -5 1.4 -9Z" fill="${p[3]}"/>` +
      `<circle cx="1" cy="-11.6" r="2.9" fill="${p[0]}"/><circle cx="2.3" cy="-11.6" r="1.3" fill="#fff"/><circle cx="2.5" cy="-11.8" r=".55" fill="${C.ink}"/><path d="M3.6 -12.8 Q6.4 -12 5 -9.4 Q4 -10 3.6 -10.6Z" fill="#3A3266"/>` +
      `<path d="M-2.6 -8.6 Q-3.8 -3 -1.6 1.4 Q.6 -3 .2 -8Z" fill="${p[1]}"/><path d="M-2.8 -3 Q-3 -.4 -1.6 1.4 Q-.6 -.6 -.6 -2.6Z" fill="${p[2]}"/>` +
      `<path d="M-1.4 0 V1.2 M.8 0 V1.2" stroke="#3A3266" stroke-width=".9" stroke-linecap="round"/>`,
  );
}

/** A sagging rope bridge from (x1, y1) to (x2, y2): rails, hangers, planks (only the first `laid` share). */
function ropeBridge(x1: number, y1: number, x2: number, y2: number, sag: number, laid = 1, rails = true) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + sag * 2;
  const at = (t: number, lift = 0) => {
    const v = 1 - t;
    return { x: v * v * x1 + 2 * v * t * mx + t * t * x2, y: v * v * y1 + 2 * v * t * my + t * t * y2 - lift };
  };
  const n = Math.max(4, Math.round(Math.abs(x2 - x1) / 4));
  let planksD = "";
  let hang = "";
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = at(t);
    if (t <= laid) planksD += `<rect x="${r1(p.x - 1.7)}" y="${r1(p.y - 1.2)}" width="3.4" height="4" rx=".6" fill="${i % 3 ? C.woodL : "#C99A6B"}"/>`;
    if (rails && i % 2 === 0) {
      const q = at(t, 9 - Math.abs(t - 0.5) * 3);
      hang += `M${r1(p.x)} ${r1(p.y)} L${r1(q.x)} ${r1(q.y)} `;
    }
  }
  const rail = (lift: number) => {
    const a = at(0, lift);
    const b = at(1, lift);
    const m = at(0.5, lift - 1.5);
    return `M${r1(a.x)} ${r1(a.y)} Q${r1(2 * m.x - (a.x + b.x) / 2)} ${r1(2 * m.y - (a.y + b.y) / 2)} ${r1(b.x)} ${r1(b.y)}`;
  };
  const deckRope = `<path d="M${r1(x1)} ${r1(y1 + 1)} Q${r1(mx)} ${r1(my + 1)} ${r1(x2)} ${r1(y2 + 1)}" stroke="#8a6a4a" stroke-width="1" fill="none"/>`;
  return (
    deckRope +
    planksD +
    (rails
      ? `<path d="${hang.trim()}" stroke="#C99A6B" stroke-width=".7"/><path d="${rail(9)}" stroke="#C99A6B" stroke-width="1.2" fill="none" stroke-linecap="round"/>`
      : "")
  );
}

/** A bridge post (wood stake with a rope lashing). */
const post = (x: number, y: number, h = 14) =>
  `<rect x="${r1(x - 1.6)}" y="${r1(y - h)}" width="3.2" height="${h}" rx="1" fill="${C.wood}"/><rect x="${r1(x + 0.2)}" y="${r1(y - h)}" width="1.4" height="${h}" fill="${C.woodD}"/><path d="M${r1(x - 1.8)} ${r1(y - h + 3)} h3.6 M${r1(x - 1.8)} ${r1(y - h + 4.6)} h3.6" stroke="#C99A6B" stroke-width=".9"/>`;

/** A tropical flower burst (hibiscus-like): five petals and a stamen. */
const bloom = (x: number, y: number, r: number, col: string, shade: string) =>
  `<g transform="translate(${r1(x)} ${r1(y)})">` +
  [0, 72, 144, 216, 288].map((a, i) => `<ellipse cy="${r1(-r * 0.55)}" rx="${r1(r * 0.42)}" ry="${r1(r * 0.6)}" fill="${i === 1 || i === 2 ? shade : col}" transform="rotate(${a})"/>`).join("") +
  `<circle r="${r1(r * 0.24)}" fill="${C.yellowL}"/><path d="M0 0 L${r1(r * 0.5)} ${r1(-r * 0.62)}" stroke="${C.yellow}" stroke-width="1" stroke-linecap="round"/></g>`;

/** A butterfly that bobs (alive) over the flowers. */
const butterfly = (x: number, y: number, col: string, delay: number, alive = true) =>
  anim(x, y, alive ? "bob" : "", `<path d="M0 0 Q-5 -6 -5 -1 Q-4 2 0 0Z M0 0 Q5 -6 5 -1 Q4 2 0 0Z" fill="${col}"/><path d="M0 -1.6 V1.6" stroke="${C.ink}" stroke-width=".8"/>`, delay);

// ---------------------------------------------------------------- rope bridge over a gorge

/**
 * The gorge (unmirrored): two grassy rock plateaus facing each other across a river that flows
 * towards the viewer. Lit front faces, the left plateau's shaded east face, grass tops at y−36…−62.
 */
function gorge(x: number, y: number, water: boolean) {
  const river = water
    ? `<path d="M-12 -62 L24 -62 L16 2 L-20 2Z" fill="${C.water}"/><path d="M6 -62 Q8 -30 -2 2" stroke="${C.waterL}" stroke-width="4" fill="none"/>`
    : `<path d="M-12 -62 L24 -62 L16 2 L-20 2Z" fill="#B49A6E"/><path d="M6 -62 Q8 -30 -2 2" stroke="#9C8458" stroke-width="2" fill="none" stroke-dasharray="3 3"/>`;
  const strata = (x0: number, x1: number) =>
    `<path d="M${x0 + 3} -26 Q${(x0 + x1) / 2} -29 ${x1 - 3} -25 M${x0 + 4} -12 Q${(x0 + x1) / 2} -9 ${x1 - 4} -13" stroke="#8E7148" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  return place(
    x,
    y,
    1,
    `${sh(4, 0, 40, 5)}` +
      river +
      // Left plateau: east face (shade), front face, grass top.
      `<path d="M-20 2 L-20 -36 L-12 -62 L-12 -24Z" fill="#6A5A40"/>` +
      `<path d="M-54 -36 L-20 -36 L-20 2 Q-30 4 -38 1 Q-48 4 -54 0Z" fill="#B0905E"/>${strata(-54, -20)}` +
      `<path d="M-54 -36 L-20 -36 L-12 -62 L-46 -62Z" fill="#5FB86C"/><path d="M-54 -36 L-20 -36" stroke="#8FD98F" stroke-width="2.4" stroke-linecap="round"/><path d="M-50 -38 Q-46 -48 -40 -56" stroke="#8FD98F" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>` +
      // Right plateau: front face and grass top (its west face is hidden).
      `<path d="M16 -36 L46 -36 L46 0 Q38 3 30 1 Q22 3 16 2Z" fill="#A08052"/>${strata(16, 46)}` +
      `<path d="M16 -36 L46 -36 L54 -62 L24 -62Z" fill="#4FA85E"/><path d="M16 -36 L46 -36" stroke="#7FCB82" stroke-width="2.4" stroke-linecap="round"/>` +
      `<path d="M46 -36 L54 -62 L54 -26 L46 0Z" fill="#7A6444"/>` +
      // Leaves hanging over the lips.
      `<path d="M-50 -36 q2 8 -1 14 M-34 -36 q2 5 0 10 M24 -36 q2 7 0 12 M38 -36 q1 5 -1 9" stroke="${LEAF.m}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  );
}

const bridge = definePiece({
  id: "jungle-bridge",
  biome: "jungle",
  w: 108,
  h: 98,
  render: (c, X) => {
    const gx = c.x;
    const by = c.y - 48;
    const L = gx - 17;
    const R = gx + 21;
    // Plateau tops: left = gx −54…−12, right = gx +16…+54 (unmirrored, so place props by world x).
    const back = palm(gx - 36, c.y - 54, 0.6, c.stage === 2) + fern(gx + 40, c.y - 52, 0.75) + bigLeaf(gx - 28, c.y - 40, 0.5);
    if (c.stage === 0)
      return gorge(gx, c.y, false) + back + post(L - 3, by + 6) + `<ellipse cx="${L - 12}" cy="${by + 8}" rx="4" ry="1.6" fill="none" stroke="#C99A6B" stroke-width="1.4"/>` + plot(gx + 30, c.y - 42, 0.45);
    const posts = post(L - 3, by + 7, 12) + post(L + 2, by + 1, 11) + post(R + 2, by + 7, 12) + post(R - 2, by + 1, 11);
    if (c.stage === 1) return gorge(gx, c.y, true) + back + ropeBridge(L, by + 3, R, by + 3, 3, 0.45) + posts + person(gx - 30, c.y - 38, C.orange, 1, 0.9) + planks(gx + 32, c.y - 38, 0.5);
    const flow = `<path class="water" d="M${gx + 6} ${c.y - 60} Q${gx + 8} ${c.y - 30} ${gx - 2} ${c.y + 1}" stroke="#fff" stroke-width="1.4" stroke-dasharray="6 10" fill="none" stroke-linecap="round" opacity=".85"/>`;
    return (
      gorge(gx, c.y, true) +
      flow +
      back +
      ropeBridge(L, by + 3, R, by + 3, 3) +
      posts +
      person(gx + 2, by + 8, C.yellow, 2, 0.8) +
      person(gx + 34, c.y - 40, C.pink, 0, 0.85) +
      parrotFlying(X(18), c.y - 84, c.side, 0.8, SCARLET, true) +
      rock(gx - 24, c.y + 6, 0.7, ["#B0905E", "#D4AE76"]) +
      rock(gx + 20, c.y + 5, 0.6, ["#A08052", "#C9A97A"]) +
      fern(gx - 42, c.y + 6, 0.6)
    );
  },
});

// ---------------------------------------------------------------- waterfall with parrots

/** A mossy jungle cliff (unmirrored): rounded rock lobes, lit left, shaded right, a leafy crown. Lip at y−70. */
function jungleCliff(x: number, y: number) {
  return place(
    x,
    y,
    1,
    `${sh(2, 0, 32, 7)}<path d="M-36 0 Q-42 -30 -32 -52 Q-24 -70 -8 -72 L14 -72 Q32 -68 36 -46 Q40 -22 35 0Z" fill="#8C7856"/>` +
      `<path d="M-36 0 Q-42 -30 -32 -52 Q-24 -70 -8 -72 Q-16 -54 -14 -34 Q-16 -14 -12 0Z" fill="#AE9870"/><path d="M-34 -24 Q-36 -40 -28 -54 Q-22 -64 -12 -68" stroke="#CDB98E" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
      `<path d="M14 -72 Q32 -68 36 -46 Q40 -22 35 0 L18 0 Q24 -24 20 -46 Q18 -62 14 -72Z" fill="#6A5A40"/>` +
      `<path d="M-30 -18 Q-22 -22 -14 -18 M-26 -42 Q-20 -45 -15 -42 M20 -30 Q28 -33 34 -28 M18 -54 Q26 -56 32 -52" stroke="#76643F" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      // Boulders at the foot.
      `<path d="M-42 2 Q-44 -8 -36 -10 Q-27 -11 -26 -3 Q-26 2 -42 2Z" fill="#AE9870"/><path d="M-39 -6 Q-36 -9 -31 -9" stroke="#CDB98E" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
      `<path d="M28 2 Q26 -8 34 -9 Q42 -9 42 -2 Q42 2 28 2Z" fill="#6A5A40"/>` +
      // Leafy crown spilling over the top, and ledge ferns.
      `<circle cx="-24" cy="-68" r="11" fill="${LEAF.d}"/><circle cx="-4" cy="-76" r="13" fill="${LEAF.d}"/><circle cx="18" cy="-74" r="12" fill="${LEAF.d}"/><circle cx="32" cy="-64" r="8" fill="${LEAF.d}"/>` +
      `<circle cx="-26" cy="-71" r="7" fill="${LEAF.m}"/><circle cx="-8" cy="-80" r="9" fill="${LEAF.m}"/><circle cx="12" cy="-78" r="6" fill="${LEAF.m}"/><circle cx="-12" cy="-84" r="4" fill="#3CCB98"/><circle cx="-29" cy="-74" r="3" fill="#3CCB98"/>` +
      `<path d="M-30 -62 q2 10 -1 18 M-20 -64 q2 6 0 12 M28 -60 q2 8 0 16 M36 -58 q1 6 -1 10" stroke="${LEAF.m}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
      `<path d="M-30 -30 q-5 -4 -9 -2 q4 3 9 2Z M-28 -32 q-2 -6 -6 -8 q0 5 6 8Z M30 -40 q5 -4 9 -2 q-4 3 -9 2Z" fill="${LEAF.l}"/>`,
  );
}

const waterfall = definePiece({
  id: "jungle-waterfall",
  biome: "jungle",
  w: 108,
  h: 98,
  render: (c, X) => {
    const cx = X(-8);
    const lipY = c.y - 72;
    const fy = c.y - 6;
    const fx = cx - 4;
    const pool = (rx: number, water: boolean) =>
      `<ellipse cx="${fx}" cy="${fy}" rx="${rx + 4}" ry="${r1(rx * 0.32 + 3)}" fill="#7C9A62"/>` +
      `<ellipse cx="${fx}" cy="${fy}" rx="${rx}" ry="${r1(rx * 0.32)}" fill="${water ? "#5CC8C0" : "#B49A6E"}"/>` +
      (water ? `<ellipse cx="${fx - 3}" cy="${fy - 1}" rx="${r1(rx * 0.62)}" ry="${r1(rx * 0.16)}" fill="#9BE6DE"/>` : "");
    const side = bigLeaf(fit(c, X(36), 21, 21), c.y + 4, 0.8) + fern(fit(c, X(-44), 15, 15), c.y + 4, 0.8);
    if (c.stage === 0) return jungleCliff(cx, c.y - 8) + `<path d="M${fx - 2} ${lipY + 2} q2 30 0 60" stroke="#6E6046" stroke-width="3" fill="none" opacity=".6"/>` + pool(20, false) + plot(X(32), c.y - 10, 0.6) + side;
    if (c.stage === 1)
      return (
        jungleCliff(cx, c.y - 8) +
        `<path d="M${fx} ${lipY + 1} Q${fx + 1.5} ${c.y - 40} ${fx} ${fy}" stroke="${C.waterL}" stroke-width="2.4" fill="none"/>` +
        pool(14, true) +
        `<g>${scaffold(X(30) - 12, c.y - 2, 24, 18)}</g>` +
        planks(X(34), c.y + 6, 0.7) +
        side
      );
    const fall =
      `<path d="M${fx - 9} ${lipY} Q${fx} ${lipY - 4} ${fx + 9} ${lipY} L${fx + 10} ${fy} L${fx - 10} ${fy}Z" fill="${C.waterL}"/>` +
      `<path d="M${fx + 3} ${lipY - 1.4} Q${fx + 7} ${lipY - 1.4} ${fx + 9} ${lipY} L${fx + 10} ${fy} L${fx + 3.5} ${fy}Z" fill="#7FC9F0"/>` +
      [fx - 5, fx, fx + 5].map((x, i) => `<path class="water" style="animation-delay:-${i * 0.7}s" d="M${r1(x)} ${lipY} V${fy - 3}" stroke="#fff" stroke-width="1.5" stroke-dasharray="7 9" stroke-linecap="round" opacity=".9"/>`).join("") +
      `<path d="M${fx - 10} ${lipY} Q${fx} ${lipY - 5} ${fx + 10} ${lipY}" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    const mist = [[-12, -1, 3, 0], [-5, 1, 3.8, 0.6], [4, -1.4, 3.4, 1.2], [11, 0.6, 2.6, 0.3]]
      .map(([dx, dy, r, d]) => anim(fx + dx, fy + dy, "float", `<circle r="${r}" fill="#fff" opacity=".85"/>`, d))
      .join("");
    // A faint rainbow over the spray, on the open (road) side.
    const rb = fx + c.side * 14;
    const rainbow = [["#FF5C8A", 0], [C.yellow, 2.4], ["#5FE0B4", 4.8], ["#8EC5FF", 7.2]]
      .map(([col, k]) => `<path d="M${r1(rb - 16 + +k)} ${fy} Q${rb} ${r1(fy - 40 + +k * 1.4)} ${r1(rb + 16 - +k)} ${fy}" stroke="${col}" stroke-width="2.2" fill="none" opacity=".45"/>`)
      .join("");
    return (
      jungleCliff(cx, c.y - 8) +
      fall +
      rainbow +
      pool(24, true) +
      mist +
      rock(X(30), c.y - 2, 0.8, ["#9C8762", "#C9B48A"]) +
      parrotPerched(cx - 22, c.y - 80, 1, 0.9, SCARLET) +
      parrotFlying(X(26), c.y - 62, -c.side as 1 | -1, 0.85, SCARLET, true) +
      parrotFlying(X(40), c.y - 44, -c.side as 1 | -1, 0.7, BLUEGOLD, true, 0.8) +
      side
    );
  },
});

// ---------------------------------------------------------------- treetop huts

/** A tall buttressed jungle trunk (unmirrored) up to `h`, with a canopy around the top. */
function bigTree(x: number, y: number, h: number, canopy = true) {
  return place(
    x,
    y,
    1,
    `${sh(2, 0, 18, 4.5)}<path d="M-12 0 Q-6 -2 -5 -10 L-3.6 ${-h} L3.6 ${-h} L5 -10 Q6 -2 12 0Z" fill="${C.wood}"/><path d="M1 0 L1.4 ${-h} L3.6 ${-h} L5 -10 Q6 -2 12 0Z" fill="${C.woodD}"/>` +
      `<path d="M-2 -6 Q-3 ${-h / 2} -1.6 ${-h + 4}" stroke="#9A6A3C" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
      (canopy
        ? `<circle cx="0" cy="${-h - 6}" r="20" fill="${LEAF.d}"/><circle cx="-18" cy="${-h + 2}" r="11" fill="${LEAF.d}"/><circle cx="17" cy="${-h + 2}" r="11" fill="${LEAF.d}"/>` +
          `<circle cx="-5" cy="${-h - 11}" r="15" fill="${LEAF.m}"/><circle cx="-18" cy="${-h - 1}" r="7" fill="${LEAF.m}"/><circle cx="-10" cy="${-h - 19}" r="5" fill="#3CCB98"/><circle cx="-21" cy="${-h - 3}" r="3" fill="#3CCB98"/>`
        : ""),
  );
}

/** A platform around a trunk at height `h` (unmirrored). */
const platform = (x: number, y: number, h: number) =>
  place(
    x,
    y - h,
    1,
    `<path d="M-12 0 L-4 10 M12 0 L4 10" stroke="${C.wood}" stroke-width="2" stroke-linecap="round"/><path d="M-17 0 L13 0 L18 -3.6 L-12 -3.6Z" fill="${C.woodL}"/><path d="M-17 0 H13 V3 H-17Z" fill="${C.wood}"/><path d="M13 0 L18 -3.6 V-.6 L13 3Z" fill="${C.woodD}"/>`,
  );

/** A thatched stilt hut sitting on a platform at (x, y) (unmirrored); `done` false = bare frame. */
function hut(x: number, y: number, done: boolean) {
  if (!done)
    return place(x, y, 1, `<path d="M-10 -3.6 V-14 M4 -3.6 V-14 M10 -6 V-17 M-10 -14 H4 L10 -17 M-12 -13 L-3 -26 L12 -15" stroke="${C.woodL}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  return (
    place(
      x,
      y,
      1,
      `<path d="M4 -3.6 L11 -6 L11 -16 L4 -14Z" fill="#9A6A3C"/><rect x="-10" y="-14" width="14" height="10.4" fill="#C99A6B"/><path d="M-10 -10 H4 M-10 -6.6 H4" stroke="#A87A4A" stroke-width=".7"/>` +
        `<rect x="-7.6" y="-11.6" width="4.6" height="8" rx="1" fill="${C.woodD}"/>${win(-1.4, -11.6, 3.6, 3.6, false, 0.6)}` +
        `<path d="M-14 -12 L-3 -28 L14 -14 L6 -11Z" fill="${THATCH.shade}"/><path d="M-14 -12 L-3 -28 L-1 -11Z" fill="${THATCH.lit}"/><path d="M-12 -14 L-4 -25" stroke="${THATCH.hi}" stroke-width="1.4" stroke-linecap="round"/>` +
        `<path d="M-14 -12 l1 2.4 l1.6 -2 l1.4 2.2 l1.6 -2 l1.4 2.2 l1.6 -2 l1.4 2.2 l1.6 -2 l1.6 2 l1.6 -2.4 l1.6 1.8 l1.6 -2.2 l1.4 1.4 l1.8 -2 l1.4 1 l2 -2.2" stroke="${THATCH.shade}" stroke-width=".9" fill="none" stroke-linejoin="round"/>`,
    ) + glow(x + 0.4, y - 9.8, 9)
  );
}

const treehuts = definePiece({
  id: "jungle-treehuts",
  biome: "jungle",
  w: 108,
  h: 100,
  render: (c, X) => {
    const ax = X(-24);
    const bx = X(22);
    const ha = 56;
    const hb = 40;
    const floor = fern(X(-6), c.y + 6, 0.7) + bigLeaf(fit(c, X(44), 16, 16), c.y + 4, 0.6);
    if (c.stage === 0) return bigTree(ax, c.y - 4, ha) + bigTree(bx, c.y, hb) + planks(X(0), c.y + 2, 0.8) + `<ellipse cx="${X(-6)}" cy="${c.y - 8}" rx="5" ry="2" fill="none" stroke="#C99A6B" stroke-width="1.6"/>` + plot(X(34), c.y - 10, 0.55);
    const trees = bigTree(ax, c.y - 4, ha) + bigTree(bx, c.y, hb);
    const pa = platform(ax, c.y - 4, ha) + platform(bx, c.y, hb);
    const ya = c.y - 4 - ha;
    const yb = c.y - hb;
    if (c.stage === 1)
      return trees + pa + hut(ax, ya - 0.4, false) + ropeBridge(ax + 13, ya - 2, bx - 15, yb - 2, 4, 0.5) + ladder(bx + 8, c.y + 2, bx + 8, yb + 2, "#C99A6B") + planks(X(-2), c.y + 4, 0.7) + floor;
    const lantern = place(bx + 16, yb - 3.6, 1, `<path d="M0 0 V3" stroke="${C.ink}" stroke-width=".8"/><rect x="-2.2" y="3" width="4.4" height="5" rx="1.4" fill="${C.yellowL}"/>`) + glow(bx + 16, yb + 2, 9);
    return (
      trees +
      pa +
      ropeBridge(ax + 13, ya - 2, bx - 15, yb - 2, 4) +
      hut(ax, ya - 0.4, true) +
      hut(bx, yb - 0.4, true) +
      place(ax - 3, ya - 28, 1, `<rect x="-.6" y="-10" width="1.2" height="10" fill="${C.woodD}"/><path class="flag" d="M.6 -10 L9 -7.6 L.6 -5.2Z" fill="${C.orange}"/>`) +
      lantern +
      ladder(bx + 8, c.y + 2, bx + 8, yb + 2, "#C99A6B") +
      parrotPerched(bx + 20, yb - 4, -1, 0.75, BLUEGOLD) +
      parrotFlying(X(4), c.y - 92, c.side, 0.75, SCARLET, true) +
      floor
    );
  },
});

// ---------------------------------------------------------------- river with canoe

/** Dugout canoe in profile (bow towards +x), optionally with two paddlers. */
function canoe(crew: boolean) {
  const hull =
    `<path d="M-17 -4 Q-15 2 -10 2.4 H10 Q16 2 19 -5 Q10 -2.4 0 -2.4 Q-10 -2.4 -17 -4Z" fill="${C.wood}"/><path d="M-15 -1 Q-9 2.4 0 2.4 H10 Q15 2 17 -1Z" fill="${C.woodD}"/>` +
    `<path d="M-17 -4 Q-10 -2.4 0 -2.4 Q10 -2.4 19 -5" stroke="#C99A6B" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  if (!crew) return hull;
  const rower = (dx: number, shirt: string, skin: string, paddle: boolean) =>
    `<path d="M${dx - 2.6} -2.4 L${dx - 2.6} -8 Q${dx} -9.6 ${dx + 2.6} -8 L${dx + 2.6} -2.4Z" fill="${shirt}"/><circle cx="${dx}" cy="-11.4" r="2.5" fill="${skin}"/>` +
    (paddle ? `<path d="M${dx + 6} -15 L${dx - 3} 2" stroke="${C.woodD}" stroke-width="1.1" stroke-linecap="round"/><ellipse cx="${dx - 3.4}" cy="2.6" rx="1.3" ry="2.6" fill="${C.woodL}" transform="rotate(25 ${dx - 3.4} 2.6)"/><path d="M${dx + 1.6} -7 L${dx + 3.6} -10" stroke="${skin}" stroke-width="1.2" stroke-linecap="round"/>` : "");
  return rower(-7, C.yellow, "#D9A06E", true) + rower(5, C.pink, "#9C6644", true) + `<path d="M-9.6 -13.2 Q-7 -15.6 -4.4 -13.2Z" fill="#E9D6AE"/>` + hull;
}

const river = definePiece({
  id: "jungle-river",
  biome: "jungle",
  w: 108,
  h: 84,
  below: 10,
  render: (c, X) => {
    // The river bends in from behind leaves on one end and out behind rocks on the other.
    const shape = "M-48 -34 Q-32 -42 -8 -36 Q18 -30 46 -38 Q52 -24 46 -10 Q26 -2 2 -8 Q-24 -14 -46 -8 Q-52 -20 -48 -34Z";
    const bank = "M-52 -37 Q-32 -46 -8 -40 Q18 -34 49 -42 Q57 -24 50 -6 Q26 2 2 -4 Q-24 -10 -49 -4 Q-57 -20 -52 -37Z";
    const water = (wet: boolean, alive: boolean) =>
      `<path d="${mp(bank, X, c.y)}" fill="#9C8A5A"/><path d="${mp(shape, X, c.y)}" fill="${wet ? "#4FB8B0" : "#B49A6E"}"/>` +
      (wet
        ? `<path d="${mp("M-44 -26 Q-24 -32 0 -26 Q24 -20 44 -28", X, c.y)}" stroke="#86D9CF" stroke-width="5" fill="none" stroke-linecap="round"/>` +
          `<path${alive ? ` class="water"` : ""} d="${mp("M-44 -22 Q-20 -28 4 -22 Q26 -16 46 -24 M-34 -13 Q-10 -18 14 -14", X, c.y)}" stroke="#fff" stroke-width="1.5" stroke-dasharray="8 12" fill="none" stroke-linecap="round" opacity=".8"/>`
        : `<path d="${mp("M-40 -24 L-30 -20 L-22 -26 M-6 -18 L4 -24 L12 -20 M26 -28 L34 -22", X, c.y)}" stroke="#8C7550" stroke-width="1" fill="none"/>`);
    const farBank = palm(X(-30), c.y - 42, 0.62, c.stage === 2) + fern(X(8), c.y - 42, 0.75) + bigLeaf(X(38), c.y - 44, 0.6);
    const ends =
      place(fit(c, X(-50), 10, 14), c.y - 14, 1, `<circle cx="-2" cy="-8" r="8" fill="${LEAF.d}"/><circle cx="6" cy="-4" r="7" fill="${LEAF.d}"/><circle cx="-3" cy="-10" r="5" fill="${LEAF.m}"/><circle cx="4" cy="-7" r="4" fill="${LEAF.l}"/>`) +
      rock(fit(c, X(48), 9, 12), c.y - 6, 0.9, ["#8C7856", "#AE9870"]) +
      rock(fit(c, X(44), 7, 10), c.y - 34, 0.7, ["#8C7856", "#AE9870"]);
    const near = ends + fern(X(-40), c.y + 4, 0.7) + tuft(X(30), c.y + 4, 0.9);
    if (c.stage === 0) return farBank + water(false, false) + `<path d="M${X(-12)} ${c.y - 24} l20 -2" stroke="${C.wood}" stroke-width="5" stroke-linecap="round"/>` + plot(X(28), c.y + 2, 0.55) + near;
    const jetty = (done: boolean) =>
      [[-32, -2], [-22, -2], [-32, -14], [-22, -14]].map(([d, dy]) => `<rect x="${X(d) - 1.4}" y="${c.y + dy - 8}" width="2.8" height="10" fill="${C.woodD}"/>`).join("") +
      (done ? `<path d="${mp("M-36 -12 L-18 -12 L-18 -2 L-36 -2Z", X, c.y)}" fill="${C.woodL}"/><path d="${mp("M-36 -9 L-18 -9 M-36 -6 L-18 -6", X, c.y)}" stroke="#9A6A3C" stroke-width=".8"/>` : "");
    if (c.stage === 1)
      return farBank + water(true, false) + jetty(false) + place(X(26), c.y + 6, 1, `<path d="M-14 0 L-12 -6 M12 0 L10 -6" stroke="${C.woodD}" stroke-width="2"/>`) + facing(X(26), c.y + 0, c.side, 0.8, canoe(false)) + near;
    const lilies = [[18, -12], [26, -10], [40, -14]].map(([d, dy], i) => `<ellipse cx="${X(d)}" cy="${c.y + dy}" rx="4" ry="1.6" fill="#3FAE6A"/>` + (i === 1 ? `<circle cx="${X(d)}" cy="${c.y + dy - 1.4}" r="1.6" fill="${C.pink}"/>` : "")).join("");
    const croc = anim(X(-6), c.y - 12, "float", `<ellipse cx="0" cy="0" rx="9" ry="1.8" fill="#3B7A4A"/><circle cx="-3" cy="-1.4" r="1.6" fill="#4F9A5E"/><circle cx="1" cy="-1.4" r="1.6" fill="#4F9A5E"/><circle cx="-3" cy="-1.8" r=".6" fill="${C.yellow}"/><circle cx="1" cy="-1.8" r=".6" fill="${C.yellow}"/>`, 0.7);
    return (
      farBank +
      water(true, true) +
      jetty(true) +
      lilies +
      croc +
      anim(X(14), c.y - 26, "drift", anim(0, 0, "float", facing(0, 0, c.side, 0.95, canoe(true)))) +
      parrotFlying(X(-20), c.y - 70, c.side, 0.7, SCARLET, true, 0.5) +
      near
    );
  },
});

// ---------------------------------------------------------------- giant flower clearing

/** Rafflesia: a huge five-petal ground flower, red with pale warts (centre at x, y). */
const rafflesia = (x: number, y: number, s: number) =>
  place(
    x,
    y,
    s,
    `<ellipse cx="2" cy="2" rx="20" ry="6" fill="${C.shadow}" opacity=".16"/>` +
      [[-14, -2, "#D9304A"], [-8, 4, "#C2263E"], [8, 4, "#B8233A"], [14, -2, "#C2263E"], [0, -8, "#E8465A"]]
        .map(([dx, dy, col]) => `<ellipse cx="${dx}" cy="${dy}" rx="10" ry="5.4" fill="${col}"/>`)
        .join("") +
      `<circle cx="-14" cy="-3" r="1.3" fill="#FFE1EC"/><circle cx="-10" cy="-1" r="1" fill="#FFE1EC"/><circle cx="-2" cy="-10" r="1.2" fill="#FFE1EC"/><circle cx="3" cy="-8" r="1" fill="#FFE1EC"/><circle cx="12" cy="-2" r="1" fill="#FFE1EC"/><circle cx="-8" cy="4" r="1.1" fill="#FFE1EC"/>` +
      `<ellipse cx="0" cy="-1.6" rx="7" ry="3.6" fill="#7A1A2C"/><ellipse cx="0" cy="-2.6" rx="5" ry="2.2" fill="#4A0E1C"/><path d="M-6 -2.6 Q0 -6 6 -2.6" stroke="#F06A7E" stroke-width="1" fill="none"/>`,
  );

/** A tall stem with big leaves and a giant bloom on top (unmirrored); `open` false = a bud. */
function giantFlower(x: number, y: number, h: number, col: [string, string], open: boolean, alive: boolean, delay = 0) {
  const leaves = `<path d="M0 ${-h * 0.3} Q-12 ${-h * 0.42} -14 ${-h * 0.58} Q-4 ${-h * 0.5} 0 ${-h * 0.36}Z" fill="${LEAF.l}"/><path d="M0 ${-h * 0.5} Q11 ${-h * 0.58} 13 ${-h * 0.74} Q4 ${-h * 0.66} 0 ${-h * 0.56}Z" fill="${LEAF.m}"/>`;
  const head = open
    ? bloom(0, 0, 13, col[0], col[1])
    : `<path d="M0 4 Q-5 -2 0 -10 Q5 -2 0 4Z" fill="${col[0]}"/><path d="M0 4 Q5 -2 0 -10 Q2 -2 0 4Z" fill="${col[1]}"/><path d="M-3 3 Q0 6 3 3" stroke="${LEAF.m}" stroke-width="2" fill="none"/>`;
  return (
    place(x, y, 1, `<ellipse cx="3" cy="1" rx="9" ry="2.4" fill="${C.shadow}" opacity=".16"/><path d="M-1.2 0 Q-2 ${-h / 2} 0 ${-h} L1.8 ${-h} Q0 ${-h / 2} 1.2 0Z" fill="${LEAF.m}"/>${leaves}`) +
    anim(x, y - h, alive ? "sway" : "", head, delay)
  );
}

const flowers = definePiece({
  id: "jungle-flowers",
  biome: "jungle",
  w: 108,
  h: 90,
  render: (c, X) => {
    const back = bigLeaf(fit(c, X(-42), 20, 20), c.y - 42, 0.75) + palm(fit(c, X(40), 13, 23), c.y - 46, 0.6, c.stage === 2);
    const clearing = `<ellipse cx="${X(0)}" cy="${c.y - 10}" rx="46" ry="16" fill="#C7EBB0"/><ellipse cx="${X(-4)}" cy="${c.y - 12}" rx="30" ry="9" fill="#DDF5C8"/>`;
    const PINK: [string, string] = ["#FF5C8A", "#D63A68"];
    const ORANGE: [string, string] = [C.orange, "#D9661A"];
    const PURPLE: [string, string] = ["#A07BFF", "#7A52E0"];
    if (c.stage === 0) return back + clearing + seedlings(X(-14), c.y - 14, 3, 10) + seedlings(X(10), c.y - 2, 2, 12) + plot(X(30), c.y - 10, 0.6) + fern(X(-40), c.y + 4, 0.6);
    if (c.stage === 1)
      return (
        back +
        clearing +
        giantFlower(X(-24), c.y - 10, 40, PINK, false, false) +
        giantFlower(X(4), c.y - 18, 30, ORANGE, false, false) +
        `<ellipse cx="${X(20)}" cy="${c.y - 4}" rx="9" ry="4" fill="#B8233A"/><ellipse cx="${X(20)}" cy="${c.y - 5}" rx="5" ry="2" fill="#D9304A"/>` +
        seedlings(X(36), c.y + 2, 2, 8) +
        place(X(-40), c.y + 4, 1, `<path d="M0 0 V-14" stroke="${C.woodL}" stroke-width="1.4"/><path d="M-3 -14 Q0 -18 3 -14" stroke="${C.ink}" stroke-width="1"/><path d="M-3.4 -14 L-2 -6 H2 L3.4 -14Z" fill="#8EC5FF" opacity=".8"/>`)
      );
    return (
      back +
      clearing +
      giantFlower(X(-26), c.y - 12, 50, PINK, true, true) +
      giantFlower(X(-4), c.y - 20, 38, PURPLE, true, true, 1.2) +
      giantFlower(X(32), c.y - 14, 30, ORANGE, true, true, 0.6) +
      rafflesia(X(12), c.y - 2, 0.9) +
      fern(fit(c, X(-44), 13, 13), c.y + 4, 0.65) +
      butterfly(X(-10), c.y - 74, "#8EC5FF", 0) +
      butterfly(X(20), c.y - 56, C.yellow, 0.7) +
      butterfly(X(42), c.y - 30, "#FF8FB0", 1.3) +
      parrotFlying(X(16), c.y - 81, -c.side as 1 | -1, 0.6, BLUEGOLD, true, 0.4)
    );
  },
});

// ---------------------------------------------------------------- explorer camp

const KHAKI: [string, string] = ["#C9B07A", "#9E8650"];

/** An explorer: a person in khaki with a pith helmet. */
const explorer = (x: number, y: number, k: number, s = 1) =>
  person(x, y, KHAKI[0], k, s) + place(x, y, s, `<path d="M-3.4 -16 Q-3.4 -20.8 0 -20.8 Q3.4 -20.8 3.4 -16Z" fill="#EFE2C2"/><ellipse cx="0" cy="-16" rx="4.8" ry="1.2" fill="#D9C49A"/>`);

/** Hammock slung between two points, hanging `sag` below them; `alive` sways it. */
function hammock(x1: number, x2: number, y: number, sag: number, alive: boolean) {
  const mx = (x1 + x2) / 2;
  const hw = (x2 - x1) / 2;
  const body = `<path d="M${-hw} 0 Q0 ${sag * 2} ${hw} 0" stroke="#C99A6B" stroke-width=".8" fill="none"/><path d="M${r1(-hw + 5)} ${r1(sag * 0.4)} Q0 ${sag * 2.4} ${r1(hw - 5)} ${r1(sag * 0.4)} Q0 ${sag * 1.1} ${r1(-hw + 5)} ${r1(sag * 0.4)}Z" fill="${C.pink}"/><path d="M${r1(-hw + 8)} ${r1(sag * 0.85)} Q0 ${sag * 2.1} ${r1(hw - 8)} ${r1(sag * 0.85)}" stroke="${C.yellow}" stroke-width="1.6" fill="none"/><path d="M${r1(-hw + 9)} ${r1(sag * 1.15)} Q0 ${sag * 2.3} ${r1(hw - 9)} ${r1(sag * 1.15)}" stroke="#fff" stroke-width="1" fill="none" opacity=".8"/>`;
  return anim(mx, y, alive ? "float" : "", body);
}

/** Folding map table with a map and compass. */
const mapTable = (x: number, y: number) =>
  place(
    x,
    y,
    1,
    `${sh(1, 0, 10, 2.6)}<path d="M-7 0 L7 -8 M7 0 L-7 -8" stroke="${C.woodD}" stroke-width="1.4"/><path d="M-10 -8 L8 -8 L11 -10.6 L-7 -10.6Z" fill="${C.woodL}"/>` +
      `<path d="M-7 -8.6 L5 -8.6 L7.4 -10.2 L-4.6 -10.2Z" fill="#F3E6C2"/><path d="M-5 -9 Q-1 -10.4 2 -9.2" stroke="${C.pink}" stroke-width=".7" fill="none" stroke-dasharray="1 .8"/><circle cx="3.6" cy="-9.4" r=".9" fill="${C.orange}"/>`,
  );

const camp = definePiece({
  id: "jungle-camp",
  biome: "jungle",
  w: 108,
  h: 84,
  render: (c, X) => {
    const pa = fit(c, X(-48), 16, 28);
    const pb = pa + c.side * 32;
    const palms = palm(pa, c.y - 26, 0.74, c.stage === 2) + palm(pb, c.y - 36, 0.68, c.stage === 2);
    const props = crate(X(34), c.y - 12, 0.8) + crate(X(40), c.y - 2, 0.9);
    if (c.stage === 0) return palms + props + place(X(8), c.y - 20, 1, `<rect x="-8" y="-4" width="16" height="5" rx="2.5" fill="${KHAKI[0]}"/><rect x="-8" y="-4" width="16" height="2" rx="1" fill="#E2CB98"/>`) + plot(X(4), c.y - 2, 0.7) + fern(X(-30), c.y + 6, 0.7);
    const tx = X(4) - 6;
    if (c.stage === 1)
      return (
        palms +
        place(tx, c.y - 18, 1, `<path d="M-14 0 L0 -22 L14 0 M0 -22 L22 -27 L32 -6" stroke="${C.woodL}" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M-14 0 L0 -22 L6 -12 L-4 0Z" fill="${KHAKI[0]}" opacity=".9"/>`) +
        campfire(X(-20), c.y + 2, false) +
        props +
        explorer(X(24), c.y + 4, 2) +
        fern(X(-40), c.y + 6, 0.6)
      );
    // Hammock between the two palm trunks (their trunks lean right by ~6px at mid-height).
    const hy = c.y - 50;
    const [h1, h2] = pa < pb ? [pa + 5, pb + 4] : [pb + 4, pa + 5];
    return (
      palms +
      hammock(h1, h2, hy, 7, true) +
      tent(tx, c.y - 18, 1, KHAKI, true) +
      place(tx + 20, c.y - 46, 1, `<rect x="-.6" y="-12" width="1.2" height="12" fill="${C.woodD}"/><path class="flag" d="M.6 -12 L10 -9.4 L.6 -6.8Z" fill="${C.greenM}"/>`) +
      campfire(X(-20), c.y + 2, true) +
      mapTable(X(34), c.y - 14) +
      crate(X(40), c.y + 2, 0.85) +
      explorer(X(16), c.y + 6, 2) +
      torch(X(-40), c.y + 6, true) +
      parrotPerched(X(40) - 3, c.y - 11, -c.side as 1 | -1, 0.7, SCARLET)
    );
  },
});

// ---------------------------------------------------------------- stone idol with vines

/** Carved stone head (unmirrored), chin at y; `eyes` glow at night. */
function idolHead(x: number, y: number) {
  return place(
    x,
    y,
    1,
    `<path d="M14 0 L22 -4 L22 -48 L14 -50Z" fill="${STONE.side}"/>` +
      `<path d="M-18 0 L-18 -44 Q-18 -50 -12 -50 L8 -50 Q14 -50 14 -44 L14 0Z" fill="${STONE.front}"/>` +
      // Headdress band with notches, ears.
      `<path d="M-20 -42 L16 -42 L16 -50 Q16 -56 10 -56 L-14 -56 Q-20 -56 -20 -50Z" fill="${STONE.top}"/><path d="M16 -42 L24 -46 L24 -52 Q22 -58 16 -56 Z" fill="${STONE.side}"/>` +
      `<path d="M-16 -46 h4 M-8 -46 h4 M0 -46 h4 M8 -46 h4" stroke="${STONE.side}" stroke-width="2"/>` +
      `<rect x="-22" y="-34" width="5" height="14" rx="2" fill="${STONE.front}"/><rect x="13" y="-34" width="5" height="14" rx="2" fill="${STONE.side}"/>` +
      // Brow, eyes (lit at night), nose, mouth.
      `<path d="M-14 -36 H-3 M1 -36 H11" stroke="${STONE.dark}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<ellipse cx="-8.4" cy="-31" rx="3.6" ry="2" fill="${STONE.dark}"/><ellipse cx="6" cy="-31" rx="3.6" ry="2" fill="${STONE.dark}"/>` +
      `<ellipse class="wl-on" cx="-8.4" cy="-31" rx="3" ry="1.6" fill="${C.yellowL}"/><ellipse class="wl-on" cx="6" cy="-31" rx="3" ry="1.6" fill="${C.yellowL}"/>` +
      `<path d="M-1 -30 L-5 -18 L4 -18Z" fill="${STONE.side}"/><path d="M-1 -30 L-5 -18 L-1 -18Z" fill="${STONE.top}"/>` +
      `<path d="M-9 -10 Q-1 -6 8 -10" stroke="${STONE.dark}" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M-6 -12 h11" stroke="${STONE.side}" stroke-width="1"/>` +
      `<path d="M-16 -6 Q-16 -2 -12 -2" stroke="${STONE.top}" stroke-width="1.4" fill="none"/>`,
  );
}

const idol = definePiece({
  id: "jungle-idol",
  biome: "jungle",
  w: 104,
  h: 96,
  render: (c, X) => {
    const ix = X(-6) - 2;
    const base = c.y - 2;
    const back = palm(fit(c, X(-40), 17, 29), c.y - 30, 0.75, c.stage === 2) + bigLeaf(fit(c, X(32), 17, 17), c.y - 40, 0.65);
    const mound = (top: number) =>
      `<path d="M${ix - 34} ${base + 4} Q${ix - 26} ${base - top} ${ix - 2} ${base - top - 2} Q${ix + 22} ${base - top} ${ix + 34} ${base + 4}Z" fill="#A3804F"/><path d="M${ix - 2} ${base - top - 2} Q${ix + 22} ${base - top} ${ix + 34} ${base + 4} L${ix + 18} ${base + 4} Q${ix + 14} ${base - top / 2} ${ix - 2} ${base - top - 2}Z" fill="#86663E"/>` +
      `<path d="M${ix - 26} ${base - top * 0.4} Q${ix - 18} ${base - top} ${ix - 6} ${base - top - 1}" stroke="#C49E68" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    if (c.stage === 0)
      return back + idolHead(ix, base - 4) + mound(36) + plot(X(32), c.y - 2, 0.6) + place(X(-36), c.y + 4, 1, `<path d="M0 0 L6 -16" stroke="${C.woodL}" stroke-width="1.6" stroke-linecap="round"/><path d="M-2 1 L2 -3 L4 2 Z" fill="#9C98B8"/>`);
    if (c.stage === 1)
      return (
        back +
        sh(ix, base, 30, 7) +
        idolHead(ix, base - 4) +
        mound(16) +
        ladder(ix + 26, base + 2, ix + 20, base - 30, C.woodL) +
        place(X(34), c.y + 4, 1, `${sh(0, 0, 6, 2)}<path d="M-4 0 L-5 -7 H5 L4 0Z" fill="#8C82B5"/><path d="M-5 -7 Q0 -12 5 -7" stroke="${C.ink}" stroke-width=".8" fill="none"/>`) +
        planks(X(34), c.y - 14, 0.6) +
        vine(X(-36), c.y + 6, 0.7)
      );
    const plinth = `${sh(ix + 2, base + 2, 34, 6)}<path d="M${ix + 22} ${base + 4} L${ix + 30} ${base} L${ix + 30} ${base - 6} L${ix + 22} ${base - 4}Z" fill="${STONE.side}"/><rect x="${ix - 26}" y="${base - 4}" width="48" height="8" fill="${STONE.front}"/><path d="M${ix - 26} ${base - 4} L${ix + 22} ${base - 4} L${ix + 30} ${base - 6} L${ix - 18} ${base - 6}Z" fill="${STONE.top}"/>`;
    return (
      back +
      plinth +
      idolHead(ix, base - 6) +
      glow(ix - 8.4, base - 37, 7) +
      glow(ix + 6, base - 37, 7) +
      moss(ix - 20, base - 62, 22) +
      moss(ix + 4, base - 62, 14) +
      hangingVine(ix - 16, base - 58, 18) +
      hangingVine(ix + 10, base - 58, 26) +
      hangingVine(ix + 20, base - 54, 12) +
      bloom(ix - 18, base - 60, 4, C.pink, C.pinkD) +
      parrotPerched(ix - 4, base - 62, 1, 0.8, SCARLET) +
      torch(ix - 34, base + 6, true) +
      torch(ix + 38, base + 6, true) +
      `<circle cx="${ix - 10}" cy="${base + 1}" r="2.6" fill="${C.orange}"/><circle cx="${ix - 6}" cy="${base + 2}" r="2.4" fill="${C.yellow}"/><circle cx="${ix + 6}" cy="${base + 1.6}" r="2.2" fill="${C.pink}"/>` +
      butterfly(ix + 30, base - 46, C.yellow, 0.4)
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
  pieces: [temple, bridge, waterfall, treehuts, river, flowers, camp, idol],
};
