import { describe, expect, test } from "bun:test";
import { composeWorld, type WorldInput } from "../src/lib/world/compose";
import { hashSeed, mulberry32 } from "../src/lib/world/rng";
import type { BiomeId, Stage } from "../src/lib/world/types";
import type { PathNodeState } from "../shared/path";
import { REGISTRY } from "../src/components/world/registry";
import { renderPieceTile, renderWorldSvg } from "../src/components/world/render";

const BIOMES: BiomeId[] = ["bos", "dorp", "stad", "haven", "jungle", "woestijn", "bergen", "campus"];

/** A reader with `weeks` weeks of `perWeek` lessons, the first `done` done and the next current. */
function reader(seed: string, weeks: number, perWeek: number, done: number): WorldInput {
  const lessons = Array.from({ length: weeks * perWeek }, (_, i) => {
    const state: PathNodeState = i < done ? "done" : i === done ? "current" : i % 3 === 0 ? "started" : "new";
    return { id: `${seed}-${i}`, code: `${1 + Math.floor(i / perWeek)}.${1 + (i % perWeek)}`, week: 1 + Math.floor(i / perWeek), state, level: 0, mastery: 0 };
  });
  return { seed, lessons };
}

const clean = (svg: string) => {
  expect(svg).not.toContain("NaN");
  expect(svg).not.toContain("undefined");
  expect(svg).not.toContain("Infinity");
  expect(svg).not.toContain("[object");
};

describe("renderWorldSvg", () => {
  test("renders every biome without NaN/undefined", () => {
    const w = composeWorld(reader("all-biomes", 8, 3, 10), REGISTRY);
    expect(w.segments.map((s) => s.biome)).toEqual(BIOMES);
    for (const dark of [false, true]) {
      const svg = renderWorldSvg(w, { dark });
      clean(svg);
      expect(svg.startsWith('<div class="world')).toBe(true);
      expect(svg).toContain('class="world-lights"');
      // One svg per week segment, so an animation repaints only its own segment.
      expect(svg.split('class="world-seg"').length - 1).toBe(w.segments.length);
      expect(svg.split('<g class="wseg"').length - 1).toBe(w.segments.length);
      for (const b of BIOMES) expect(svg).toContain(`data-biome="${b}"`);
    }
  });

  test("renders random readers cleanly", () => {
    for (let t = 0; t < 40; t++) {
      const r = mulberry32(hashSeed(`render-${t}`));
      const weeks = 1 + Math.floor(r() * 12);
      const per = 1 + Math.floor(r() * 4);
      const w = composeWorld(reader(`r${t}`, weeks, per, Math.floor(r() * (weeks * per + 1))), REGISTRY);
      clean(renderWorldSvg(w, { dark: t % 2 === 1 }));
    }
  });

  test("the same input gives the same output", () => {
    const a = renderWorldSvg(composeWorld(reader("det", 4, 3, 5), REGISTRY), { dark: false });
    const b = renderWorldSvg(composeWorld(reader("det", 4, 3, 5), REGISTRY), { dark: false });
    expect(a).toBe(b);
    expect(a).not.toBe(renderWorldSvg(composeWorld(reader("other", 4, 3, 5), REGISTRY), { dark: false }));
  });

  test("labels banners via the label callback", () => {
    const w = composeWorld(reader("lbl", 3, 2, 1), REGISTRY);
    const svg = renderWorldSvg(w, { label: (b) => `W${b.week}-${b.biome}` });
    expect(svg).toContain("W2-dorp");
    expect(svg).toContain("W3-campus");
  });

  test("draws the finale gate (closed, then open) with its sign in the text layer", () => {
    const open = composeWorld(reader("fin", 2, 2, 4), REGISTRY);
    const closed = composeWorld(reader("fin", 2, 2, 1), REGISTRY);
    expect(open.finale!.done).toBe(true);
    expect(closed.finale!.done).toBe(false);
    const label = (done: boolean) => (done ? "DONE-LABEL" : "CLOSED-LABEL");
    const o = renderWorldSvg(open, { finaleLabel: label });
    const c = renderWorldSvg(closed, { finaleLabel: label });
    expect(o).toContain('data-finale="open"');
    expect(o).toContain('class="confetti"');
    expect(c).toContain('data-finale="closed"');
    expect(c).not.toContain('class="confetti"');
    // The gate sits in the last (campus) segment, so it pauses off-screen with it.
    const lastSeg = c.slice(c.lastIndexOf('<g class="wseg"'));
    expect(lastSeg).toContain('data-finale="closed"');
    // The sign is in the text layer, after the art and lights.
    expect(o.indexOf("DONE-LABEL")).toBeGreaterThan(o.indexOf('class="world-top"'));
    expect(c).toContain("CLOSED-LABEL");
  });

  test("smaller edge pieces are drawn scaled about their anchor, halos included", () => {
    let seen = 0;
    for (let t = 0; t < 60 && !seen; t++) {
      const w = composeWorld(reader(`sc${t}`, 6, 4, 12), REGISTRY);
      const op = w.ops.find((o) => o.kind === "piece" && o.scale);
      if (!op) continue;
      seen++;
      const svg = renderWorldSvg(w, { dark: true });
      const tf = `matrix(${op.scale} 0 0 ${op.scale} `;
      expect(svg).toContain(`<g transform="${tf}`);
      expect(op.bbox.x).toBeGreaterThanOrEqual(4);
      expect(op.bbox.x + op.bbox.w).toBeLessThanOrEqual(386);
    }
    expect(seen).toBe(1);
  });

  test("composes and renders 40 lessons in under 30ms", () => {
    const input = reader("perf", 10, 4, 20);
    renderWorldSvg(composeWorld(input, REGISTRY), {}); // warm-up
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      renderWorldSvg(composeWorld(input, REGISTRY), {});
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(30);
  });
});

describe("registry", () => {
  test("every biome has flora, a ground and at least one piece", () => {
    for (const id of BIOMES) {
      const b = REGISTRY[id];
      expect(b.id).toBe(id);
      expect(b.flora.length).toBeGreaterThan(0);
      expect(b.ground).toHaveLength(2);
      expect(b.pieces.length).toBeGreaterThan(0);
      expect(b.banner).toBe(`world.biome.${id}`);
    }
  });

  test("every biome has at least 8 set pieces, all of its own biome", () => {
    for (const id of BIOMES) {
      expect(REGISTRY[id].pieces.length).toBeGreaterThanOrEqual(8);
      for (const p of REGISTRY[id].pieces) {
        expect(p.biome).toBe(id);
        expect(p.id.startsWith(`${id}-`)).toBe(true);
      }
    }
  });

  test("every piece comes alive at stage 2 (an animation class) and keeps its footprint within 110×110", () => {
    const ANIM = /class="[^"]*\b(sails|smoke|flag|water|bob|spark|sway|flicker|beam|float|graze|blink|ring|drift|jet|slide|train)\b/;
    for (const id of BIOMES)
      for (const p of REGISTRY[id].pieces)
        for (const side of [1, -1] as const) {
          for (const r of p.footprint(side)) expect(r.w <= 110 && r.h <= 110).toBe(true);
          expect(p.render({ x: 100, y: 200, side, stage: 2, current: false, rng: mulberry32(1) })).toMatch(ANIM);
        }
  });

  test("piece ids are unique", () => {
    const ids = BIOMES.flatMap((b) => REGISTRY[b].pieces.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every piece × stage × side renders a non-empty string", () => {
    for (const id of BIOMES)
      for (const p of REGISTRY[id].pieces) {
        for (const side of [1, -1] as const) {
          const fp = p.footprint(side);
          expect(fp.length).toBeGreaterThan(0);
          for (const r of fp) expect(r.w <= 150 && r.h <= 150).toBe(true);
          for (const stage of [0, 1, 2] as Stage[]) {
            const svg = p.render({ x: 100, y: 200, side, stage, current: stage === 1, rng: mulberry32(7) });
            expect(svg.length).toBeGreaterThan(20);
            clean(svg);
            clean(renderPieceTile(p, stage, side, { dark: side === -1 }));
          }
        }
      }
  });

  test("flora renders cleanly", () => {
    for (const id of BIOMES)
      for (const f of REGISTRY[id].flora) {
        const svg = f.render(50, 60, mulberry32(3), 1);
        expect(svg.length).toBeGreaterThan(10);
        clean(svg);
      }
  });
});
