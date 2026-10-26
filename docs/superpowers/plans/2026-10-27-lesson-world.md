# Lesson World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain home lesson path with a procedurally composed, hand-drawn SVG world. It has 8 biomes and 64+ set pieces, and each set piece has three progress stages, built under hard exclusion zones around nodes, the road and banners.

**Architecture:**
- **Pure composition engine:** `src/lib/world/*`. It turns lessons into a layout, zones, picked set pieces, filler and draw ops. It's deterministic and unit-tested.
- **SVG art kit and renderer:** `src/components/world/*`.
- **Biome modules:** `src/components/world/biomes/*.ts`. Each one exports flora and set pieces.
- **`WorldMap` component:** replaces `LessonPath` on home. The SVG is drawn in a 390-wide design space and scaled to the column width, and the lesson nodes are absolutely positioned HTML buttons on top.

**Tech Stack:** React 19, TypeScript, Tailwind v4, plain SVG strings plus CSS animations, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-27-lesson-world-design.md`. The approved visual reference is the mockup `world-v2.html` in `.superpowers/brainstorm/134690-1793038929/content/`; its art kit code is the style baseline to port.

## Global Constraints

- **Determinism:** the same `(readerId, lessons, states)` gives a byte-identical SVG. All randomness goes through the seeded RNG (`mulberry32` from an FNV-1a hash of the seed string).
- **Hard exclusion:** nothing may intersect these zones:
  - a node circle of radius `r + 46` (r = 32, or 38 for current);
  - the level bar rect (60×10, 12px below the node);
  - the "Ga verder" bubble rect (96×34, beside the current node);
  - the road corridor: road width 40 plus 18 on each side;
  - set-piece footprints;
  - banners (190×40).
- **Biome order:** Bos, Dorp, Stad, Haven, Jungle, Woestijn, Bergen; the **last week is always Campus**.
  - Fewer weeks: truncate the order (a 3-week reader is Bos, Dorp, Campus).
  - More than 8 weeks: cycle 1–7 for the middle weeks with seed salt `cycle-n`.
- **Stages:**
  - 0 = new (fog: `mute` filter + mist + drifting clouds);
  - 1 = started or current (construction, plus sparkles when current);
  - 2 = done (mastery ≥ 0.8, alive and animated).
- **Road:** paved below the current lesson, dirt track above it.
- **Motion:** CSS animations only, paused when off-screen (IntersectionObserver) and disabled under `prefers-reduced-motion`.
- **Style:** the art kit style is light from top-left, a lit side and a shade side, cast shadow ellipses (opacity about .16), rounded shapes, and the Speelveld palette (spec token table) plus biome palettes. The art is `aria-hidden`.
- **Performance:** composing plus rendering 40 lessons takes under 30ms (measured in a test). Use shared `<defs>` only, with no per-prop filters.
- **Text:** all new user-facing strings (biome names in banners) go in nl + en.
- **Dev env:** `.superpowers/sdd/<plan>/dev-env.md` (copied in by the controller). Never use :3000, ./data or the demo worktree.

## Review Focus

1. **Overlap:** any prop or set-piece pixel under a node, the level bar or the "Ga verder" bubble. Test with zone checks over 200 random readers. Also check visually on the gallery page and home at 360px.
2. **Very short and very long readers** (1 lesson, 1 week, 40 lessons, 12 weeks): no crash, the last week is campus, the cycle seeds differ.
3. **Lesson state changes** (finish a lesson): the world re-renders and the piece moves to the next stage; the memo key includes the states.
4. **Off-screen animation cost:** with 40 lessons, only visible segments animate.
5. **Dark mode:** the evening grade keeps nodes and text readable, since nodes stay HTML above the SVG.

---

## File Structure

- `src/lib/world/rng.ts`: `hashSeed(s: string): number`, `mulberry32(seed: number): () => number`, `pick<T>(rng, arr: T[]): T`, `range(rng, a, b): number`
- `src/lib/world/geometry.ts`: `Rect`, `Circle`, `Zone = Rect | Circle | RoadZone`, `intersects(zone, rect): boolean`, `pointInZones(x, y, zones): boolean`
- `src/lib/world/poisson.ts`: `poisson(rng, bounds: Rect, minDist: number, accept: (x, y) => boolean, k = 20): {x, y}[]` (Bridson)
- `src/lib/world/biome-order.ts`: `biomeForWeek(weekIndex: number, totalWeeks: number): { biome: BiomeId; salt: string }`
- `src/lib/world/types.ts`:
  - `BiomeId = "bos" | "dorp" | "stad" | "haven" | "jungle" | "woestijn" | "bergen" | "campus"`
  - `Stage = 0 | 1 | 2`
  - `SetPiece = { id: string; biome: BiomeId; footprint: (side: 1 | -1) => Rect[]; render: (ctx: PieceCtx) => string }`, where footprint is relative to the anchor
  - `PieceCtx = { x, y, side, stage, current: boolean, rng }`
  - `Flora = { weight: number; render: (x, y, rng, scale) => string; radius: number }`
  - `Biome = { id; ground: [string, string]; flora: Flora[]; pieces: SetPiece[]; banner: string /* i18n key */ }`
- `src/lib/world/compose.ts`:
  - `composeWorld(input: WorldInput, registry: Record<BiomeId, Biome>): WorldLayout`
  - `WorldInput = { seed: string; lessons: { id, code, week, state: PathNodeState, level, mastery }[] }`
  - `WorldLayout = { width: 390; height; nodes: { id, x, y, r }[]; road: { d: string; splitY: number }; zones: Zone[]; segments: { biome, top, bottom }[]; banners: { y, biome }[]; ops: { y: number; kind: "piece" | "flora" | "ground"; svg: string }[] }`
- `src/components/world/kit.ts`: the art kit ported from the mockup and extended. It includes shadow, tree, pine, bushes, flowers, rock, house, windmill, plot, building, flag, sparkle, cloudPuff, palm, cactus, fir, lamp, water and more, all `(x, y, scale, opts) => string`.
- `src/components/world/render.ts`: `renderWorldSvg(layout, opts: { dark: boolean }): string`, covering defs (gradients, `mute`, `mist`, `grain`), ground, transitions, road, ops in y order and banners.
- `src/components/world/biomes/{bos,dorp,stad,haven,jungle,woestijn,bergen,campus}.ts`: one `Biome` each.
- `src/components/world/registry.ts`: `REGISTRY: Record<BiomeId, Biome>`
- `src/components/world/world-map.tsx`: `<WorldMap seed groups onOpen />`, which replaces `LessonPath` (same props plus `seed`), with nodes as buttons.
- `src/pages/dev-world.tsx`: a gallery, dev-only route `/dev/world`, gated by `import.meta.env.DEV`, that shows every set piece × stage plus sample worlds.
- Tests: `tests/world-*.test.ts`

---

### Task 1: Composition engine (pure)

**Files:** create `src/lib/world/{rng,geometry,poisson,biome-order,types,compose}.ts` and `tests/world-engine.test.ts`.

**Interfaces:** as in File Structure.

Layout rules:
- Lessons are flattened in path order (week ascending, then input order).
- `y = H - 210 - i*250`, with `H = 360 + 250*n`.
- `x = i%2 ? 262 : 128`.
- The road is the same cubic chain as the mockup's `road()`.
- `splitY` = the current node's y, or the top if none.
- Segments: one per week, from halfway between that week's first node and the previous week's last node to the corresponding point above. The first and last segments extend to the edges.
- Set piece per lesson:
  - candidates are the biome's pieces, shuffled by `rng(seed + lessonId)`, excluding the previous lesson's piece id;
  - the anchor is `(x + side*92, y)` with `side = x < 195 ? 1 : -1`;
  - accept the first candidate whose footprint rects (translated) intersect no zone and stay within `[−20, 410]`;
  - add the accepted footprints to the zones.
- Flora: per segment, `poisson(rng(seed + segment), bounds, minDist 26)`, accepting points outside all zones (inflated by the flora radius). Pick weighted flora; inside the 160px transition bands, mix the two biomes linearly.
- Every op gets `y` = its baseline.

- [ ] **Step 1: Failing tests** (`tests/world-engine.test.ts`). Use a stub registry with one 40×40-footprint piece per biome and one flora entry that renders `<g data-f/>`.

```ts
// determinism
expect(JSON.stringify(composeWorld(inp, reg))).toBe(JSON.stringify(composeWorld(inp, reg)));
// biome order
expect(biomeForWeek(0, 3).biome).toBe("bos"); expect(biomeForWeek(1, 3).biome).toBe("dorp"); expect(biomeForWeek(2, 3).biome).toBe("campus");
expect(biomeForWeek(7, 8).biome).toBe("campus"); expect(biomeForWeek(6, 8).biome).toBe("bergen");
expect(biomeForWeek(7, 12).biome).toBe("bos"); expect(biomeForWeek(7, 12).salt).not.toBe(biomeForWeek(0, 12).salt);
expect(biomeForWeek(0, 1).biome).toBe("campus");
// exclusion over random readers
for (let t = 0; t < 200; t++) { const L = randomReader(t /* 1..40 lessons, 1..12 weeks */); const w = composeWorld(L, reg);
  for (const op of w.ops.filter(o => o.kind !== "ground")) for (const n of w.nodes) expect(dist(op.anchor, n) > n.r + 46).toBe(true); }
// no consecutive repeats when a biome has ≥2 pieces
// poisson min distance holds; empty lessons → no ops, height ≥ 360
```

  `ops` also carries an `anchor: {x, y}` and `bbox: Rect` for the tests. Assert that the op bbox doesn't intersect node/bubble/levelbar/banner zones, and that road distance > corridor.
- [ ] **Step 2:** Run `bun test tests/world-engine.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test && bun run typecheck`. Expected: PASS. Also add a perf test: composing 40 lessons with the stub takes under 15ms (`performance.now`), averaged over 5 runs.
- [ ] **Step 5:** Commit `feat(world): deterministic composition engine with exclusion zones`.

### Task 2: Art kit, renderer, WorldMap on home, gallery route

**Files:**
- Create `src/components/world/{kit,render,registry}.ts`, `src/components/world/world-map.tsx`, the 8 biome files (each with its flora plus **one** starter set piece), `src/pages/dev-world.tsx` and `tests/world-render.test.ts`.
- Modify `src/pages/home.tsx` (use `WorldMap` with `seed = readerId`), `src/App.tsx` (the dev route), locales (`world.biome.<id>`, nl+en, e.g. "Het bos" / "The forest").
- Delete `src/components/game/lesson-path.tsx` once unused.

**Details:**
- Port the mockup kit: the tree, pine, bushes, flowers, rock, house (3/4 view), windmill (tapered sails), plot, building (scaffold + crane), flag, sparkle and cloudPuff. Use the same constants and style.
- **Biome flora:**
  - bos: pine, tree, bushes, mushrooms, rocks;
  - dorp: blossom tree, hedge, tulip field strips;
  - stad: plane tree, lamp, bench, planter;
  - haven: dune grass, bollard, crate, gull;
  - jungle: palm, fern, big leaf, vine;
  - woestijn: cactus, dry shrub, rock, ripple;
  - bergen: fir, boulder, edelweiss, snow patch;
  - campus: lamp, bike rack, small tree, star.
- **Grounds:** per-biome two-stop gradients. The transitions are 160px crossfades.
- **Banners:** a pill with the i18n biome name, e.g. "Week 3 · Zwolle". Uses Fredoka; the colour comes from the biome.
- **Renderer:** defs, ground, then a `<g>` per segment holding its ops (so the IntersectionObserver can pause per segment), then the road, then banners and grain. Stage 0 pieces are wrapped in `filter=url(#mute)` with mist and fog.
- **WorldMap:**
  - The SVG is injected with `dangerouslySetInnerHTML`. The content is internal and contains no user strings: lesson codes are rendered as HTML buttons, not inside the SVG.
  - It sits in a `relative` wrapper with `aspect-ratio: 390/H` and is scaled to the column width, capped at 520px wide and centred.
  - Nodes are HTML buttons positioned at `left: x/390*100%` and `top: y/H*100%`, reusing the existing node styles, the level bar and the "Ga verder" bubble from `lesson-path.tsx`, including aria labels and scroll-to-current.
  - Memoise the SVG by `seed + states signature`.
  - IntersectionObserver per segment `<g>`: add the `paused` class when it's not intersecting.
  - Dark mode: the `dark` class adds a dusk overlay rect (multiply, `#1B1536` at 35%) and switches the lamps/windows "on" variants.
- **Gallery `/dev/world`:** a grid of every set piece in stages 0/1/2, plus sample worlds (3, 8 and 12 weeks), with light/dark toggles.

- [ ] **Step 1: Failing tests** (`tests/world-render.test.ts`):
  - `renderWorldSvg` output contains no `NaN`, and no `undefined` substrings;
  - every biome renders;
  - every registered piece × stage renders a non-empty string without throwing;
  - the same input gives the same output.
- [ ] **Step 2:** Run `bun test tests/world-render.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test && bun run typecheck && bun run build && bun run test:e2e`. Expected: PASS. Then take screenshots (dev env) of home at 360/390/1280, light and dark: fresh student, mixed progress, and a long reader (seed 12 weeks via the dev DB). Also screenshot the gallery. **Look at them**: no prop under a node, the transitions blend, and the last week is campus.
- [ ] **Step 5:** Commit `feat(world): art kit, renderer and WorldMap on home`.

### Tasks 3–6: Set-piece libraries (two biomes per task, 8 pieces each, so 16 per task)

| Task | Biomes |
|---|---|
| 3 | bos + dorp |
| 4 | stad + haven |
| 5 | jungle + woestijn |
| 6 | bergen + campus |

The piece lists are the spec's table for each biome; the starter piece from Task 2 counts as one of the 8.

**Each piece:**
- a footprint (1–3 rects) that tightly covers the drawing;
- `render` for stages 0/1/2:
  - **0:** a plot or foundations or seedlings;
  - **1:** half-built, with scaffolding or a crane, or partial;
  - **2:** finished, with at least one CSS animation class from the kit: `sails`, `smoke`, `flag`, `water`, `bob`, `spark`, or a new kit animation (e.g. `sway` for palms, `cable` for the cable car).
- footprint width at most 150 and height at most 150;
- must look good with `side` = 1 and −1 (mirror via `scale(-1,1)` around the anchor where asymmetric).

- [ ] **Step 1:** Extend `tests/world-render.test.ts` coverage. The piece count per biome must be ≥ 8 and the ids unique, and the exclusion test from Task 1 runs again with the real registry over 200 random readers.
- [ ] **Step 2:** Run it. Expected: FAIL, because counts are below 8.
- [ ] **Step 3:** Implement the 16 pieces, adding new kit primitives as needed.
- [ ] **Step 4:** Run `bun test && bun run typecheck && bun run build`. Expected: PASS. Then screenshot the gallery (both stages and themes, at 2× DPR) and **look** at every piece: consistent light direction, no clipping, readable at phone size, and stage 2 visibly alive.
- [ ] **Step 5:** Commit `feat(world): <biome> + <biome> set pieces`.

### Task 7: Verification, performance and deploy

- [ ] **Step 1:** Run `bun test && bun run typecheck && bun run build && bun run test:e2e`. Expected: all PASS.
- [ ] **Step 2:** In Playwright on a 4×-CPU-throttled page, use the dev env with a 40-lesson, 12-week reader. Measure the time from home load to the world painted (under 150ms of scripting for the world), and check that off-screen segments have the `paused` class.
- [ ] **Step 3:** Screenshot matrix: home at 360/390/1280 × light/dark; a fresh, a mixed and a finished reader; the gallery. **Look** at every image. Check Review Focus 1–5.
- [ ] **Step 4:** Commit any fixes (`chore(world): verification fixes`). The controller deploys to the demo afterwards.
