import { describe, expect, test } from "bun:test";
import { composeWorld, type WorldInput, type WorldLayout } from "../src/lib/world/compose";
import { biomeForWeek } from "../src/lib/world/biome-order";
import { poisson } from "../src/lib/world/poisson";
import { hashSeed, mulberry32 } from "../src/lib/world/rng";
import type { Biome, BiomeId, SetPiece } from "../src/lib/world/types";
import type { Rect } from "../src/lib/world/geometry";
import type { PathNodeState } from "../shared/path";
import { REGISTRY } from "../src/components/world/registry";

const BIOMES: BiomeId[] = ["bos", "dorp", "stad", "haven", "jungle", "woestijn", "bergen", "campus"];

const piece = (biome: BiomeId, n: number): SetPiece => ({
  id: `${biome}-${n}`,
  biome,
  // 40x40, sitting on the anchor baseline, extending away from the road
  footprint: (side) => [{ x: side === 1 ? 0 : -40, y: -40, w: 40, h: 40 }],
  render: (c) => `<g data-p="${biome}-${n}" data-s="${c.stage}" transform="translate(${c.x} ${c.y})"/>`,
});

const makeRegistry = (piecesPerBiome: number): Record<BiomeId, Biome> =>
  Object.fromEntries(
    BIOMES.map((id) => [
      id,
      {
        id,
        ground: ["#000", "#111"],
        flora: [{ weight: 1, radius: 8, render: () => `<g data-f/>` }],
        pieces: Array.from({ length: piecesPerBiome }, (_, i) => piece(id, i)),
        banner: `world.biome.${id}`,
      } satisfies Biome,
    ]),
  ) as unknown as Record<BiomeId, Biome>;

const reg = makeRegistry(1);

/** 110×100 pieces, slightly off-centre and mirrored by side (the size guidance's upper end). */
const bigPiece = (biome: BiomeId, n: number): SetPiece => ({
  id: `${biome}-big-${n}`,
  biome,
  footprint: (side) => [{ x: side === 1 ? -60 : -50, y: -90, w: 110, h: 100 }],
  render: (c) => `<g data-p="${biome}-big-${n}" data-side="${c.side}"/>`,
});
const regBig = Object.fromEntries(
  Object.entries(makeRegistry(0)).map(([id, b]) => [id, { ...b, pieces: [0, 1, 2].map((i) => bigPiece(id as BiomeId, i)) }]),
) as unknown as Record<BiomeId, Biome>;
const reg3 = makeRegistry(3);

function randomReader(t: number): WorldInput {
  const r = mulberry32(hashSeed(`reader-${t}`));
  const n = 1 + Math.floor(r() * 40);
  const weeks = 1 + Math.floor(r() * 12);
  const cur = Math.floor(r() * (n + 1)); // n => all done
  const lessons = Array.from({ length: n }, (_, i) => {
    const state: PathNodeState = i < cur ? "done" : i === cur ? "current" : r() < 0.3 ? "started" : "new";
    return { id: `L${t}-${i}`, code: `${i}`, week: 1 + Math.floor(r() * weeks), state, level: 0, mastery: 0 };
  });
  return { seed: `seed-${t}`, lessons };
}

const sample: WorldInput = {
  seed: "reader-abc",
  lessons: [
    { id: "a", code: "1.1", week: 1, state: "done", level: 5, mastery: 1 },
    { id: "b", code: "1.2", week: 1, state: "done", level: 5, mastery: 0.9 },
    { id: "c", code: "1.3", week: 1, state: "current", level: 2, mastery: 0.3 },
    { id: "d", code: "2.1", week: 2, state: "new", level: 0, mastery: 0 },
    { id: "e", code: "2.2", week: 2, state: "new", level: 0, mastery: 0 },
    { id: "f", code: "3.1", week: 3, state: "new", level: 0, mastery: 0 },
  ],
};

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const rectPointDist = (r: Rect, x: number, y: number) =>
  Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));

/** Densely sample the road path string independently of the engine's own road zones. */
function sampleRoad(d: string): { x: number; y: number }[] {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const cmds = d.match(/[MLC]/g) ?? [];
  const pts: { x: number; y: number }[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  for (const c of cmds) {
    if (c === "M") {
      cx = nums[i++]; cy = nums[i++]; pts.push({ x: cx, y: cy });
    } else if (c === "L") {
      const x = nums[i++], y = nums[i++];
      for (let s = 1; s <= 200; s++) pts.push({ x: cx + ((x - cx) * s) / 200, y: cy + ((y - cy) * s) / 200 });
      cx = x; cy = y;
    } else {
      const [x1, y1, x2, y2, x, y] = nums.slice(i, i + 6); i += 6;
      for (let s = 1; s <= 200; s++) {
        const u = s / 200, v = 1 - u;
        pts.push({
          x: v * v * v * cx + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x,
          y: v * v * v * cy + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y,
        });
      }
      cx = x; cy = y;
    }
  }
  return pts;
}

/** Returns violations (empty = ok). Checks against zones derived independently of `w.zones`. */
function exclusionViolations(w: WorldLayout): string[] {
  const bad: string[] = [];
  const roadBuckets = new Map<number, { x: number; y: number }[]>();
  for (const p of sampleRoad(w.road.d)) {
    const k = Math.floor(p.y / 50);
    roadBuckets.set(k, [...(roadBuckets.get(k) ?? []), p]);
  }
  const current = w.nodes.find((n) => n.state === "current");
  const hard: Rect[] = w.nodes.map((n) => ({ x: n.x - 30, y: n.y + n.r + 12, w: 60, h: 10 }));
  if (current) hard.push({ x: current.x > 195 ? current.x - 152 : current.x + 60, y: current.y - 17, w: 96, h: 34 });
  for (const b of w.banners) hard.push({ x: 195 - 95, y: b.y - 20, w: 190, h: 40 });
  const pieces = w.ops.filter((o) => o.kind === "piece");
  for (const op of w.ops.filter((o) => o.kind !== "ground")) {
    const id = `${op.kind}@${op.anchor.x},${op.anchor.y}`;
    for (const n of w.nodes) {
      if (!(Math.hypot(op.anchor.x - n.x, op.anchor.y - n.y) > n.r + 46)) bad.push(`${id} anchor in node ${n.id}`);
      if (!(rectPointDist(op.bbox, n.x, n.y) > n.r + 46)) bad.push(`${id} bbox in node ${n.id}`);
    }
    for (const z of hard) if (overlaps(op.bbox, z)) bad.push(`${id} overlaps ${JSON.stringify(z)}`);
    const near = [];
    for (let k = Math.floor((op.bbox.y - 40) / 50); k <= Math.floor((op.bbox.y + op.bbox.h + 40) / 50); k++)
      near.push(...(roadBuckets.get(k) ?? []));
    if (near.some((p) => !(rectPointDist(op.bbox, p.x, p.y) > 38))) bad.push(`${id} in road corridor`);
    for (const p of pieces) if (p !== op && overlaps(op.bbox, p.bbox)) bad.push(`${id} overlaps piece ${p.pieceId}`);
  }
  return bad;
}

describe("composeWorld", () => {
  test("is deterministic", () => {
    expect(JSON.stringify(composeWorld(sample, reg))).toBe(JSON.stringify(composeWorld(sample, reg)));
    const r = randomReader(7);
    expect(JSON.stringify(composeWorld(r, reg3))).toBe(JSON.stringify(composeWorld(r, reg3)));
  });

  test("different seeds give different worlds", () => {
    const a = composeWorld(sample, reg3);
    const b = composeWorld({ ...sample, seed: "someone-else" }, reg3);
    expect(JSON.stringify(a.ops)).not.toBe(JSON.stringify(b.ops));
  });

  test("layout mirrors the mockup geometry", () => {
    const w = composeWorld(sample, reg);
    const n = sample.lessons.length;
    expect(w.width).toBe(390);
    expect(w.height).toBe(360 + 250 * n);
    w.nodes.forEach((node, i) => {
      expect(node.y).toBe(w.height - 210 - i * 250);
      expect(node.x).toBe(i % 2 ? 262 : 128);
      expect(node.r).toBe(node.state === "current" ? 38 : 32);
    });
    expect(w.road.d.startsWith(`M 128 ${w.height + 30} L 128 ${w.nodes[0].y}`)).toBe(true);
    expect(w.road.d.endsWith(`L ${w.nodes.at(-1)!.x} -40`)).toBe(true);
    expect(w.road.splitY).toBe(w.nodes[2].y);
  });

  test("flattens lessons by week ascending, then input order", () => {
    const w = composeWorld(
      {
        seed: "s",
        lessons: [
          { id: "w2a", code: "", week: 2, state: "new", level: 0, mastery: 0 },
          { id: "w1a", code: "", week: 1, state: "current", level: 0, mastery: 0 },
          { id: "w2b", code: "", week: 2, state: "new", level: 0, mastery: 0 },
          { id: "w1b", code: "", week: 1, state: "new", level: 0, mastery: 0 },
        ],
      },
      reg,
    );
    expect(w.nodes.map((n) => n.id)).toEqual(["w1a", "w1b", "w2a", "w2b"]);
  });

  test("splitY is the top when no lesson is current", () => {
    const w = composeWorld({ ...sample, lessons: sample.lessons.map((l) => ({ ...l, state: "done" as const })) }, reg);
    expect(w.road.splitY).toBe(-40);
  });

  test("segments cover the world, one per week, borders halfway between weeks", () => {
    const w = composeWorld(sample, reg);
    expect(w.segments.map((s) => s.biome)).toEqual(["bos", "dorp", "campus"]);
    expect(w.segments[0].bottom).toBe(w.height);
    expect(w.segments.at(-1)!.top).toBe(0);
    const [n2, n3] = [w.nodes[2], w.nodes[3]];
    expect(w.segments[0].top).toBe((n2.y + n3.y) / 2);
    expect(w.segments[1].bottom).toBe(w.segments[0].top);
    expect(w.banners.map((b) => b.biome)).toEqual(["dorp", "campus"]);
    expect(w.banners[0].y).toBe(w.segments[0].top);
  });

  test("empty lessons: no ops, height >= 360", () => {
    const w = composeWorld({ seed: "x", lessons: [] }, reg);
    expect(w.ops).toEqual([]);
    expect(w.nodes).toEqual([]);
    expect(w.height).toBeGreaterThanOrEqual(360);
  });

  test("places set pieces and flora, every op has a baseline y", () => {
    const w = composeWorld(sample, reg);
    const pieces = w.ops.filter((o) => o.kind === "piece");
    expect(pieces.length).toBeGreaterThan(0);
    expect(w.ops.some((o) => o.kind === "flora" && o.svg === "<g data-f/>")).toBe(true);
    for (const p of pieces) expect(p.y).toBe(p.anchor.y);
    for (const p of pieces) expect(p.bbox.x >= -20 && p.bbox.x + p.bbox.w <= 410).toBe(true);
  });

  test("hard exclusion holds over 200 random readers", () => {
    for (let t = 0; t < 200; t++) expect(exclusionViolations(composeWorld(randomReader(t), t % 2 ? reg : reg3))).toEqual([]);
  }, 30000);

  test("hard exclusion holds over 200 random readers with the real registry", () => {
    for (let t = 0; t < 200; t++) expect(exclusionViolations(composeWorld(randomReader(t), REGISTRY))).toEqual([]);
  }, 30000);

  test("most lessons (and the current one) get a 110×100 piece", () => {
    let lessons = 0;
    let placed = 0;
    let currents = 0;
    let currentPlaced = 0;
    for (let t = 0; t < 200; t++) {
      const w = composeWorld(randomReader(t), regBig);
      expect(exclusionViolations(w)).toEqual([]);
      const withPiece = new Set(w.ops.filter((o) => o.kind === "piece").map((o) => o.lessonId));
      lessons += w.nodes.length;
      placed += withPiece.size;
      const cur = w.nodes.find((n) => n.state === "current");
      if (cur) {
        currents++;
        if (withPiece.has(cur.id)) currentPlaced++;
      }
    }
    console.log(`pieces: ${placed}/${lessons} lessons, current: ${currentPlaced}/${currents}`);
    expect(placed / lessons).toBeGreaterThanOrEqual(0.9);
    expect(currentPlaced / currents).toBeGreaterThanOrEqual(0.9);
  }, 30000);

  test("piece ops record the side they face, and render with it", () => {
    const w = composeWorld(sample, regBig);
    const pieces = w.ops.filter((o) => o.kind === "piece");
    expect(pieces.length).toBeGreaterThan(0);
    for (const p of pieces) {
      expect(p.side === 1 || p.side === -1).toBe(true);
      expect(p.svg).toContain(`data-side="${p.side}"`);
    }
  });

  test("no consecutive repeats when a biome has >= 2 pieces", () => {
    for (let t = 0; t < 50; t++) {
      const w = composeWorld(randomReader(t), reg3);
      const byLesson = new Map(w.ops.filter((o) => o.kind === "piece").map((o) => [o.lessonId, o.pieceId]));
      for (let i = 1; i < w.nodes.length; i++) {
        const prev = byLesson.get(w.nodes[i - 1].id);
        if (prev) expect(byLesson.get(w.nodes[i].id)).not.toBe(prev);
      }
      expect(byLesson.size).toBeGreaterThan(0);
    }
  });

  test("single-piece biomes still give every lesson a piece (repeat filter falls back)", () => {
    const w = composeWorld(sample, reg);
    const withPiece = new Set(w.ops.filter((o) => o.kind === "piece").map((o) => o.lessonId));
    expect(withPiece.size).toBe(sample.lessons.length);
  });

  test("composes 40 lessons in under 15ms", () => {
    const input: WorldInput = {
      seed: "perf",
      lessons: Array.from({ length: 40 }, (_, i) => ({
        id: `p${i}`, code: `${i}`, week: 1 + Math.floor(i / 4), state: i < 20 ? "done" : i === 20 ? "current" : "new",
        level: 0, mastery: 0,
      })),
    };
    composeWorld(input, reg3); // warm-up
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) composeWorld(input, reg3);
    expect((performance.now() - t0) / 5).toBeLessThan(15);
  });
});

describe("biomeForWeek", () => {
  test("follows the fixed order with campus last", () => {
    expect(biomeForWeek(0, 3).biome).toBe("bos");
    expect(biomeForWeek(1, 3).biome).toBe("dorp");
    expect(biomeForWeek(2, 3).biome).toBe("campus");
    expect(biomeForWeek(7, 8).biome).toBe("campus");
    expect(biomeForWeek(6, 8).biome).toBe("bergen");
    expect(biomeForWeek(7, 12).biome).toBe("bos");
    expect(biomeForWeek(7, 12).salt).not.toBe(biomeForWeek(0, 12).salt);
    expect(biomeForWeek(0, 1).biome).toBe("campus");
  });
});

describe("poisson", () => {
  test("keeps the minimum distance and stays in bounds", () => {
    const bounds = { x: -20, y: 100, w: 430, h: 600 };
    const pts = poisson(mulberry32(hashSeed("p")), bounds, 26, () => true);
    expect(pts.length).toBeGreaterThan(100);
    for (const p of pts) {
      expect(p.x >= bounds.x && p.x < bounds.x + bounds.w && p.y >= bounds.y && p.y < bounds.y + bounds.h).toBe(true);
    }
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= 26).toBe(true);
  });

  test("respects the accept predicate", () => {
    const pts = poisson(mulberry32(1), { x: 0, y: 0, w: 300, h: 300 }, 26, (x) => x < 150);
    expect(pts.length).toBeGreaterThan(10);
    expect(pts.every((p) => p.x < 150)).toBe(true);
  });
});
