# Lesson world ("Bouw je wereld"): procedurally composed path background

Date: 2026-10-27
Status: approved and implemented (2026-10-27)

## Intent

The owner wants the home lesson path to feel like Clash Royale's arena road: you walk through
landscapes (forest → village → city → …) that change per week. The landscape must react to
lesson progress, which is why it's hand-drawn in code rather than AI images.

The approved concept mockup is `.superpowers/brainstorm/*/content/world-v2.html`
("Bouw je wereld"):
- a not-started lesson sits in fog, desaturated, with a building plot;
- an in-progress lesson has colour, construction and sparkles;
- a done lesson is fully alive: animated sails, smoke, flowers and a flag;
- walked road is paved, the road ahead is a dirt track.

Owner feedback on the mockup:
1. **No trees or props may spawn near a lesson circle.**
2. Build **many cool hand-designed sections**, and let the app **compose them procedurally**.

## Goals

- Replace the plain path background with a generated world. Nodes, interaction and the
  data stay as they are.
- A **library of hand-drawn set pieces** (vignettes) per biome. The app picks one per lesson,
  deterministically, so the same reader always looks the same for everyone.
- Every set piece has the **three progress states** from the mockup.
- **Hard exclusion zones**: nothing is drawn on top of or near a lesson node, its level bar,
  the "Ga verder" bubble, or the road.
- Biome per week, with blended transitions and a week banner.
- Light and dark mode. `prefers-reduced-motion` respected. Smooth on a mid-range phone.

## Non-goals

- No AI-generated images and no external art packs.
- No change to lesson data, progress maths, path order or the "all lessons open" rule.
- No new backend. Everything is derived client-side from the existing `/readers` data
  (mastery per lesson, current lesson).

## Design

### Biomes (one per week)

The worlds form a journey from home out into the wild, and the reader's **last week is always
Campus**, the finale. That way every reader ends on campus, whatever its length.

| Order | Biome | Ground / sky | Filler flora |
|---|---|---|---|
| 1 | **Bos** (Veluwe forest) | fresh mint | pines, round trees, bushes, mushrooms, rocks |
| 2 | **Polder/dorp** | soft yellow-green | round & blossom trees, hedges, tulip fields, ditches |
| 3 | **Stad** (Zwolle) | lilac-grey cobbles | plane trees, lamp posts, benches, planters |
| 4 | **Haven** (harbour/IJssel) | sand + water | dune grass, bollards, crates, gulls |
| 5 | **Jungle** (wild) | deep green, humid haze | palms, ferns, giant leaves, vines, parrots |
| 6 | **Woestijn** (desert dunes, wild) | warm sand, orange sky | cacti, dune ripples, dry shrubs, rocks |
| 7 | **Bergen** (Swiss Alps, wild) | alpine meadow, snowy peaks | firs, edelweiss, boulders, snow patches |
| last week | **Campus** (night, finale) | grape night, lit windows | lamp posts, bike racks, small trees, stars |

- **Mapping:** week *n* gets biome *n* from the order (1–7); the reader's final week gets Campus.
- **Short readers:** if the reader has fewer weeks than 8, the order is simply cut short, and
  the final week is still Campus. A 3-week reader goes Bos → Dorp → Campus.
- **Long readers** (more than 8 weeks) cycle biomes 1–7 for the middle weeks, with a different
  seed per cycle so repeats don't look identical.
- These are my calls.

### Set pieces: at least 8 per biome, 64+ in total

Each set piece is a hand-designed SVG composition built from the shared art kit. The kit has
one light direction (top-left), light and shadow sides, cast shadows and rounded shapes, as in
the mockup.

Each set piece declares:
- `footprint`: its bounding boxes, used for collision;
- `side`: which side of the road it sits on;
- `render(rng, stage)`.

Stages:
- **0 fog:** not started. A building plot or seedlings, desaturated, with drifting fog.
- **1 bouw:** level 1–3. Scaffolding, half-built, colour returns, sparkles on the current
  lesson.
- **2 af:** done, level ≥ 4 (mastery ≥ 0.8, same as the path's "done"). Finished and alive
  with CSS animation.

Example set pieces:

| Biome | Set pieces |
|---|---|
| Bos | log cabin with smoking chimney; campsite (tents + campfire); lake with jetty and ducks; waterfall and stream; treehouse; mushroom ring with fairy lights; deer clearing; ranger tower |
| Dorp | windmill + miller's house; farm with barn and cows; tulip fields with greenhouse; church and square; bakery with market stalls; canal with drawbridge; orchard; football pitch |
| Stad | Peperbus tower; canal houses on a gracht; Sassenpoort city gate; market square with stalls; bridge with boats; café terrace; tram stop; park with fountain |
| Haven | lighthouse; fishing boats at the quay; harbour crane and containers; beach huts; sailing boats; fish market; dunes with windsurfer; ferry |
| Jungle | temple ruins (overgrown); rope bridge over a gorge; waterfall with parrots; treetop huts; river with canoe; giant flower clearing; explorer camp; stone idol with vines |
| Woestijn | oasis with palms and pool; camel caravan; pyramid; desert tent camp; sandstone arch; well with bucket; market of a desert town; windblown ruins |
| Bergen | wooden chalet with flower boxes; cable car between peaks; alpine pasture with cows and bells; mountain lake; snowy summit with a flag; stone bridge over a creek; mountain hut with a sledge; tunnel with a red train |
| Campus | main building with clock; library; lecture hall with glowing windows; bike shed; sports hall; student housing; observatory dome; graduation stage with flags |

### Composition algorithm (deterministic)

1. **Layout:** keep the current zig-zag node positions and road curve.
2. **Choosing set pieces:** for each lesson, pick a set piece from its week's biome with a
   seeded RNG, seeded by `readerId + lessonId`. Never pick the same piece as the previous
   lesson.
   - The piece is placed on the open side of the road, beside the node.
   - Its footprint must pass the exclusion test. If it doesn't, try the next candidate.
   - If no candidate fits, draw no set piece for that lesson; filler flora only.
3. **Exclusion zones** (hard constraints, never drawn inside):
   - a node circle of radius `r + 46px`, covering the ring, shadow and margin;
   - the level-bar rectangle;
   - the "Ga verder" bubble rectangle;
   - the road, its stroke width plus 18px on each side;
   - every placed set-piece footprint;
   - week banners;
   - the finale gate.
4. **Filler flora:** Poisson-disc sampling (Bridson) at a minimum distance of about 26px,
   using the biome's flora weights, and rejecting every point inside an exclusion zone. The
   density is higher at the screen edges and lower near the road.
5. **Transitions:** a blend band of 160px at each week border.
   - The ground gradient crossfades between the two biomes.
   - Filler is drawn from both biomes, with the probability shifting across the band.
   - A week banner sits in the middle of the band, kept clear by its own exclusion zone.
6. **Draw order:** sort everything by its baseline y (2.5D depth): ground, then water and
   fields, then road, then props and set pieces, then nodes on top.

### State mapping

| Lesson state | Stage | Extras |
|---|---|---|
| new (mastery 0, not current) | 0 fog | desaturate filter + mist + drifting clouds |
| started / current (level 1–3, or current) | 1 bouw | current: sparkles + bobbing node |
| done (mastery ≥ 0.8) | 2 af | animations: sails, smoke, flags, water shimmer, birds |

Road: paved below the current lesson, dirt track above it, as in the mockup.

**Finale:** the road ends 200px above the last lesson at a campus gate (the world is sized to
fit it, with no empty road above). Closed and padlocked, lanterns lit, until every lesson is
done; then open, with flags and falling confetti. Its sign ("Finish", then "Diploma!" /
"Graduated!") is drawn in the text layer. The gate has its own exclusion zone.

**Screen edge:** set pieces stay within x 4…386. Where a full-size piece no longer fits, it is
tried at 0.86 scale (drawn scaled about its anchor) before the next candidate.

### Performance

- The world SVG is generated once per (reader, lesson-state signature) and memoised.
- Long readers (around 40 lessons) give an SVG roughly 10,000px tall. Generation must stay
  under 30ms on a mid-range phone.
- **Animations only run while visible:** an IntersectionObserver per world segment toggles a
  `paused` class. Reduced motion: no animation at all.
- No `<filter>` per prop. Shared filter definitions only, applied per group: fog, mute, grain.
- **One SVG per week segment** (stacked over a ground-and-road SVG, under the grain and dusk
  layers): an animating piece then repaints only its own segment, not the whole 10,000px
  world. On a 4×-throttled phone this cut main-thread time while scrolling a 40-lesson world
  by about 37% (paint about 4×). The evening grade itself costs nothing measurable.
- `world:build` (compose + render) and `world:painted` User Timing entries show up in the
  DevTools Performance panel.

### Dark mode

The same art with an evening grade, chosen after comparing options side by side (a flat 35%
`#1B1536` multiply read grey and murky; a brightness/saturate filter alone stayed grey):
- one multiply wash over the art: a vertical gradient from `#5246D0` at 42% at the bottom to
  `#2E2496` at 56% at the top, so the night deepens as you climb;
- `saturate(1.3)` on the art layer (one CSS filter on the whole layer), so colours stay vivid;
- a soft inset vignette;
- lit windows and lamps: warm halos are lifted into a separate light layer above the wash,
  blended with `screen`, so they glow instead of being dimmed. Fogged (unexplored) lights stay off.

Nodes, the bubble and the level bars are HTML, and the banners sit in their own text layer, so
both stay crisp. The campus biome is night in both modes: its halos are on in light mode too.

### Accessibility

The art is `aria-hidden`. The nodes stay the existing accessible buttons with their
labels and state.

## Testing

Unit tests (`bun test`) on the pure composition module:
- **Determinism:** the same input gives byte-identical SVG.
- **Exclusion:** there is no filler or set-piece footprint inside any node, bubble, level-bar,
  road or banner zone. Check this over 200 random readers with 1–40 lessons and 1–8 weeks.
- **Variety:** no identical consecutive set pieces.
- **Coverage:** every set piece renders all 3 stages without throwing.

Visual checks:
- a screenshot gallery page rendering every set piece in all 3 stages, light and dark;
- home screenshots at 360/390/1280.

## Left to the builder

- Exact art of each set piece, within the kit style.
- Poisson parameters per biome.
- Which animations each set piece gets.
