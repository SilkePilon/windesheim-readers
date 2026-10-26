import type { PathNodeState } from "../../../shared/path";
import { biomeForWeek } from "./biome-order";
import { ZoneIndex, type Point, type Rect, type Zone } from "./geometry";
import { poisson } from "./poisson";
import { range, rngFor, shuffle, type Rng } from "./rng";
import type { Biome, BiomeId, Flora, Stage } from "./types";

export const WORLD_WIDTH = 390;
const GAP = 250;
const MID = WORLD_WIDTH / 2;
const NODE_MARGIN = 46;
/** Road stroke 40 → half width 20, plus 18 each side, plus 1px for the polyline approximation. */
const ROAD_HALF = 20 + 18 + 1;
const ROAD_STEPS = 24;
/** Centre x of the outer column (left side; mirrored about MID for right-hand nodes). */
const OUTER_CX = 35;
/** Centre x of the far inner column, across the road at mid-gap (left-node case). */
const INNER_FAR_CX = 335;
/** Vertical distance from a node to the centre of a mid-gap slot. */
const MID_GAP_DY = 100;
const X_MIN = -20;
const X_MAX = 410;
/** Set pieces stay fully on screen, with a small inset: a clipped piece reads as a mistake, clipped filler doesn't. */
const PIECE_INSET = 4;
const PIECE_X_MIN = PIECE_INSET;
const PIECE_X_MAX = WORLD_WIDTH - PIECE_INSET;
/** Piece sizes to try, largest first (the smaller one is drawn scaled about its anchor). */
const PIECE_SCALES = [1, 0.86];
const BAND = 160;
const FLORA_MIN_DIST = 26;
/** Finale (the gate at the end of the road): its base sits this far above the last lesson. */
const FINALE_DY = 200;
/** The gate's exclusion zone, relative to its base point (pillars, arch, flags, confetti). */
export const FINALE_ZONE = { x: -84, y: -124, w: 168, h: 136 } as const;
/** Space above the top of the finale zone. */
const FINALE_TOP_PAD = 20;
/** The last lesson's y: room for the finale above it, nothing more. */
const LAST_NODE_Y = FINALE_DY - FINALE_ZONE.y + FINALE_TOP_PAD;

export type WorldLesson = { id: string; code: string; week: number; state: PathNodeState; level: number; mastery: number };
export type WorldInput = { seed: string; lessons: WorldLesson[] };

export type WorldNode = WorldLesson & { x: number; y: number; r: number };
export type WorldSegment = { biome: BiomeId; salt: string; week: number; top: number; bottom: number };
export type WorldOp = {
  y: number;
  kind: "piece" | "flora" | "ground";
  svg: string;
  anchor: Point;
  bbox: Rect;
  /** Index into `segments`. */
  segment: number;
  /** Set pieces only: the direction the piece faces (towards the road); mirror the art by it. */
  side?: 1 | -1;
  pieceId?: string;
  stage?: Stage;
  lessonId?: string;
  /** Set pieces drawn smaller than designed (scaled about the anchor); absent = 1. */
  scale?: number;
};
/** The gate at the end of the road; `done` once every lesson is done (stage 2: open, celebrating). */
export type WorldFinale = { x: number; y: number; done: boolean };
export type WorldLayout = {
  width: typeof WORLD_WIDTH;
  height: number;
  nodes: WorldNode[];
  road: { d: string; splitY: number };
  finale: WorldFinale | null;
  zones: Zone[];
  segments: WorldSegment[];
  /** One per week border (the week above it); `y` is the border. */
  banners: { y: number; biome: BiomeId; week: number }[];
  ops: WorldOp[];
};

export const stageFor = (state: PathNodeState): Stage => (state === "done" ? 2 : state === "new" ? 0 : 1);

const round1 = (v: number) => Math.round(v * 10) / 10;

function bboxOf(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

function pickFlora(rng: Rng, flora: Flora[]): Flora | undefined {
  const total = flora.reduce((s, f) => s + f.weight, 0);
  if (total <= 0) return undefined;
  let t = rng() * total;
  for (const f of flora) if ((t -= f.weight) < 0) return f;
  return flora[flora.length - 1];
}

/** Road path (the mockup's cubic chain, ending at the finale gate) plus its corridor as capsule zones. */
function buildRoad(nodes: WorldNode[], H: number, end: Point): { d: string; zones: Zone[] } {
  if (!nodes.length) return { d: "", zones: [] };
  const first = nodes[0];
  const pts: Point[] = [{ x: first.x, y: H + 30 }, { x: first.x, y: first.y }];
  let d = `M ${first.x} ${H + 30} L ${first.x} ${first.y}`;
  // The last leg swings from the final lesson to the gate.
  const stops = [...nodes, end];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const m = (a.y + b.y) / 2;
    d += ` C ${a.x} ${m}, ${b.x} ${m}, ${b.x} ${b.y}`;
    for (let s = 1; s <= ROAD_STEPS; s++) {
      const u = s / ROAD_STEPS;
      const v = 1 - u;
      // P0=(a.x,a.y) P1=(a.x,m) P2=(b.x,m) P3=(b.x,b.y)
      pts.push({
        x: (v * v * v + 3 * v * v * u) * a.x + (3 * v * u * u + u * u * u) * b.x,
        y: v * v * v * a.y + 3 * v * u * (v + u) * m + u * u * u * b.y,
      });
    }
  }
  const zones: Zone[] = [];
  for (let i = 0; i < pts.length - 1; i++)
    zones.push({ kind: "road", tag: "road", x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y, r: ROAD_HALF });
  return { d, zones };
}

type Slot = { side: 1 | -1; place: (fb: Rect) => Point };

/**
 * Candidate anchors for a lesson's set piece, in preference order. `fb` is the footprint's
 * bounding box relative to the anchor; each slot returns the anchor that puts it in place.
 * Nodes alternate sides and the road leaves/arrives on the inner side (towards MID), so:
 *  1. outer side, level with the node (narrow pieces only);
 *  2. above the node, outer side (away from where the road leaves);
 *  3. below the node, outer side (away from where the road arrives);
 *  4. across the road at mid-gap (far inner column), above then below.
 * The "Ga verder" bubble stays on the inner side, level with the node, so 1–3 never meet it.
 */
function pieceSlots(nd: WorldNode): Slot[] {
  const inner: 1 | -1 = nd.x < MID ? 1 : -1;
  const outer = -inner as 1 | -1;
  const R = nd.r + NODE_MARGIN;
  const mirror = (x: number) => (inner === 1 ? x : WORLD_WIDTH - x);
  /** Anchor x so the bbox is centred on `cx`, clamped into the horizontal bounds. */
  const centreX = (fb: Rect, cx: number) => {
    let ax = cx - (fb.x + fb.w / 2);
    if (ax + fb.x < PIECE_X_MIN) ax = PIECE_X_MIN - fb.x;
    if (ax + fb.x + fb.w > PIECE_X_MAX) ax = PIECE_X_MAX - fb.x - fb.w;
    return ax;
  };
  /** Vertical clearance needed so a bbox whose nearest edge is `gap` px from the node misses its circle. */
  const clearance = (ax: number, fb: Rect) => {
    const gap = inner === 1 ? nd.x - (ax + fb.x + fb.w) : ax + fb.x - nd.x;
    return gap >= R ? 0 : Math.ceil(Math.sqrt(R * R - gap * gap)) + 1;
  };
  return [
    {
      side: inner,
      place: (fb) => {
        const edge = nd.x + outer * (R + 1);
        const ax = inner === 1 ? edge - (fb.x + fb.w) : edge - fb.x;
        return { x: ax, y: nd.y - (fb.y + fb.h / 2) };
      },
    },
    {
      side: inner,
      place: (fb) => {
        const ax = centreX(fb, mirror(OUTER_CX));
        return { x: ax, y: nd.y - clearance(ax, fb) - (fb.y + fb.h) };
      },
    },
    {
      side: inner,
      place: (fb) => {
        const ax = centreX(fb, mirror(OUTER_CX));
        return { x: ax, y: nd.y + clearance(ax, fb) - fb.y };
      },
    },
    { side: outer, place: (fb) => ({ x: centreX(fb, mirror(INNER_FAR_CX)), y: nd.y - MID_GAP_DY - (fb.y + fb.h / 2) }) },
    { side: outer, place: (fb) => ({ x: centreX(fb, mirror(INNER_FAR_CX)), y: nd.y + MID_GAP_DY - (fb.y + fb.h / 2) }) },
  ];
}

export function composeWorld(input: WorldInput, registry: Record<BiomeId, Biome>): WorldLayout {
  const { seed } = input;
  const weeks = [...new Set(input.lessons.map((l) => l.week))].sort((a, b) => a - b);
  const ordered = weeks.flatMap((w) => input.lessons.filter((l) => l.week === w));
  const n = ordered.length;
  const H = n ? LAST_NODE_Y + 210 + GAP * (n - 1) : 360;

  const nodes: WorldNode[] = ordered.map((l, i) => ({
    id: l.id,
    code: l.code,
    week: l.week,
    state: l.state,
    level: l.level,
    mastery: l.mastery,
    x: i % 2 ? 262 : 128,
    y: H - 210 - i * GAP,
    r: l.state === "current" ? 38 : 32,
  }));
  const current = nodes.find((nd) => nd.state === "current");
  const last = nodes.at(-1);
  const finale: WorldFinale | null = last ? { x: MID, y: last.y - FINALE_DY, done: nodes.every((nd) => nd.state === "done") } : null;
  const road = buildRoad(nodes, H, finale ?? { x: MID, y: 0 });

  // Segments: one per week, borders halfway between neighbouring weeks' nodes.
  const segments: WorldSegment[] = weeks.map((week, k) => {
    const fi = nodes.findIndex((nd) => nd.week === week);
    const li = fi + ordered.filter((l) => l.week === week).length - 1;
    const { biome, salt } = biomeForWeek(k, weeks.length);
    return {
      biome,
      salt,
      week,
      bottom: k === 0 ? H : (nodes[fi].y + nodes[fi - 1].y) / 2,
      top: k === weeks.length - 1 ? 0 : (nodes[li].y + nodes[li + 1].y) / 2,
    };
  });
  const banners = segments.slice(1).map((s) => ({ y: s.bottom, biome: s.biome, week: s.week }));
  const segIndexOfWeek = new Map(weeks.map((w, k) => [w, k]));

  // Hard exclusion zones.
  const index = new ZoneIndex();
  for (const nd of nodes) {
    index.add({ kind: "circle", tag: "node", cx: nd.x, cy: nd.y, r: nd.r + NODE_MARGIN });
    index.add({ kind: "rect", tag: "levelbar", x: nd.x - 30, y: nd.y + nd.r + 12, w: 60, h: 10 });
  }
  if (current)
    index.add({
      kind: "rect",
      tag: "bubble",
      x: current.x > MID ? current.x - 152 : current.x + 60,
      y: current.y - 17,
      w: 96,
      h: 34,
    });
  for (const z of road.zones) index.add(z);
  if (finale) index.add({ kind: "rect", tag: "finale", x: finale.x + FINALE_ZONE.x, y: finale.y + FINALE_ZONE.y, w: FINALE_ZONE.w, h: FINALE_ZONE.h });
  for (const b of banners) index.add({ kind: "rect", tag: "banner", x: MID - 95, y: b.y - 20, w: 190, h: 40 });

  const ops: WorldOp[] = [];

  // Set pieces: one per lesson. Try the candidate slots in order; take the first that fits.
  let prevPiece: string | null = null;
  for (const nd of nodes) {
    const segment = segIndexOfWeek.get(nd.week)!;
    const seg = segments[segment];
    const rng = rngFor(`${seed}:${seg.salt}:${nd.id}`);
    const shuffled = shuffle(rng, registry[seg.biome].pieces);
    const fresh = shuffled.filter((p) => p.id !== prevPiece);
    // Single-piece biomes: repeating beats an empty lesson.
    const candidates = fresh.length ? fresh : shuffled;
    const slots = pieceSlots(nd);
    prevPiece = null;
    // Full size first; if nothing fits (the screen edge is tight), a slightly smaller piece.
    search: for (const scale of PIECE_SCALES)
      for (const p of candidates) {
        for (const slot of slots) {
          const rel = p.footprint(slot.side).map((r) => ({ x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale }));
          if (!rel.length) continue;
          const { x: ax, y: ay } = slot.place(bboxOf(rel));
          const rects = rel.map((r) => ({ x: r.x + ax, y: r.y + ay, w: r.w, h: r.h }));
          if (rects.some((r) => r.x < PIECE_X_MIN || r.x + r.w > PIECE_X_MAX || index.hits(r))) continue;
          for (const r of rects) index.add({ kind: "rect", tag: "piece", ...r });
          const stage = stageFor(nd.state);
          ops.push({
            y: ay,
            kind: "piece",
            svg: p.render({ x: ax, y: ay, side: slot.side, stage, current: nd.state === "current", rng }),
            anchor: { x: ax, y: ay },
            bbox: bboxOf(rects),
            segment,
            side: slot.side,
            pieceId: p.id,
            stage,
            lessonId: nd.id,
            ...(scale !== 1 && { scale }),
          });
          prevPiece = p.id;
          break search;
        }
      }
  }

  // Filler flora: Poisson disc per segment, blended across 160px transition bands.
  segments.forEach((seg, k) => {
    const rng = rngFor(`${seed}:${seg.salt}:flora:${k}`);
    const bounds = { x: X_MIN, y: seg.top, w: X_MAX - X_MIN, h: seg.bottom - seg.top };
    // Denser at the screen edges, sparser in the middle where the road runs.
    const density = registry[seg.biome].density ?? 1;
    const pts = poisson(
      rng,
      bounds,
      FLORA_MIN_DIST,
      (x) => rng() < (0.55 + 0.45 * Math.min(1, Math.abs(x - MID) / 160)) * density,
    );
    for (const pt of pts) {
      let biome = seg.biome;
      if (k < segments.length - 1 && pt.y < seg.top + BAND / 2) {
        if (rng() < (seg.top + BAND / 2 - pt.y) / BAND) biome = segments[k + 1].biome;
      } else if (k > 0 && pt.y > seg.bottom - BAND / 2) {
        if (rng() < (pt.y - (seg.bottom - BAND / 2)) / BAND) biome = segments[k - 1].biome;
      }
      const flora = pickFlora(rng, registry[biome].flora);
      if (!flora) continue;
      const scale = round1(range(rng, 0.8, 1.1));
      const x = round1(pt.x);
      const y = round1(pt.y);
      const rad = flora.radius * scale;
      const bbox = { x: x - rad, y: y - 2 * rad, w: 2 * rad, h: 2 * rad };
      if (index.hits(bbox)) continue;
      ops.push({ y, kind: "flora", svg: flora.render(x, y, rng, scale), anchor: { x, y }, bbox, segment: k });
    }
  });

  ops.sort((a, b) => a.y - b.y);

  return {
    width: WORLD_WIDTH,
    height: H,
    nodes,
    road: { d: road.d, splitY: current ? current.y : -40 },
    finale,
    zones: index.zones,
    segments,
    banners,
    ops,
  };
}
