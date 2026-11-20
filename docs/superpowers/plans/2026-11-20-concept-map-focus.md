# Concept Map Focus Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the student concept map's "all lines at once" canvas with a grouped focus map. Concepts sit grouped per week and lesson with full labels; tapping one shows only its links, in a non-modal panel.

**Architecture:**
- Pure helpers in `src/lib/concept-layout.ts` handle grouping, relations and the curve between rects; the old absolute-layout code is removed.
- `src/components/reader-learn/concept-map.tsx` renders flow-layout HTML.
- An SVG overlay draws only the focused concept's links, measured from the DOM.

**Tech Stack:** React 19, Tailwind v4 + shadcn/ui, react-i18next, bun test.

**Spec:** `docs/superpowers/specs/2026-11-20-concept-map-focus-design.md` (the parent spec is `2026-11-20-reader-learning-design.md`)

## Global Constraints
- No new dependencies and no API changes. Concept text is rendered as text nodes only.
- Mobile-first; light and dark themes; nl and en. The first-load budget (`bun run budget`, 800 000 raw) keeps passing, and the map stays lazy.
- Tests never import `src/lib/i18n.ts`.

## Review Focus
- **A focused concept whose neighbour is hidden by the week filter.** The panel still lists the relation. Tapping it clears the filter (sets "all weeks"), then focuses the neighbour. (Task 1 helper test, Task 2 behaviour.)
- **On a phone, the bottom panel must not hide the focused chip.** On focus, scroll the chip into view with enough bottom margin for the panel (`scroll-margin-bottom` ≈ panel height). (Task 2.)
- **A concept with no links.** The panel shows "Nog geen verbanden" and draws no curves. (Tasks 1 and 2.)

---

### Task 1: Pure helpers

**Files:** Modify `src/lib/concept-layout.ts` (remove `layoutConceptMap`, `LAYOUT`, `chipWidth` and the absolute layout; keep `masteryTone`, `MapLesson` and `ConceptTone`). Test: `tests/concept-layout.test.ts` (rewrite).

**Interfaces (Produces):**
```ts
export type GroupedWeek = { week: number; lessons: { lesson: MapLesson; concepts: Concept[] }[] };
export function groupConcepts(data: ConceptMapData, lessons: MapLesson[]): GroupedWeek[];
// weeks ascending; lessons in the order of the `lessons` array (server order = position); concepts in data order;
// lessons with no concepts omitted; concepts whose lesson is missing dropped
export type Relation = { dir: "out" | "in"; label: string; other: Concept };
export function relationsOf(id: string, data: ConceptMapData): Relation[];
// outgoing first then incoming, each in data order; links to missing concepts and self-links dropped; duplicate (dir, other) pairs kept once
export function linkCurve(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): string;
// "M… C…" cubic from a's centre-edge facing b to b's centre-edge facing a; vertical bias when the rects are in different rows
```

- [ ] **Step 1: Write the failing tests:**
  - `groupConcepts` orders by week and lesson, omits empty lessons and drops orphan concepts;
  - `relationsOf` lists out before in, drops self-links, missing targets and duplicates, and returns `[]` for an unlinked concept;
  - `linkCurve` starts with `M` and contains a `C`, and runs from the right edge to the left edge for side-by-side rects, and from bottom to top for stacked rects.
- [ ] **Step 2: Run** `bun test tests/concept-layout.test.ts` and expect FAIL.
- [ ] **Step 3: Implement** the helpers. Remove the old exports and make sure nothing else imports them (`grep`).
- [ ] **Step 4: Run** `bun test tests/concept-layout.test.ts && bun run typecheck`. Expect PASS; typecheck may fail in `concept-map.tsx` until Task 2. If so, do Task 2 in the same branch before committing, or temporarily keep the old exports. Implementer's choice, but no commit may leave typecheck red.
- [ ] **Step 5: Commit** `refactor(concept-map): helpers for grouping, relations and focus curves`

### Task 2: Focus map component

**Files:** Modify `src/components/reader-learn/concept-map.tsx` and `src/locales/nl.ts` / `en.ts` (`readerLearn.map.*`: `noLinks` = "Nog geen verbanden" / "No links yet", `close`, `openLesson`). Test: a `renderToString` smoke test in `tests/reader-learn-page.test.tsx` of an exported pure `ConceptMapBody({ data, focusId })`.

**Interfaces:** Consumes the Task 1 helpers. `ReaderConceptMap({ readerId })` keeps its signature (the page is unchanged).

- [ ] **Step 1: Write the failing smoke test** (nl and en):
  - **No focus:** week headings, lesson codes and titles, and every concept label in full (a long label such as "Verbindingsloze routering" appears without an ellipsis); no `<path` in the output.
  - **With `focusId`:** the panel text contains the relation sentences and "Open les"; the overlay holds one `<path` per relation. In SSR there are no rects, so the overlay may render empty paths or none; assert on the panel text only.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.**
  - **Layout:** week sections, then lesson cards (code, title, mastery dot), then a flex-wrap of chip buttons.
  - **Chips:** `whitespace-normal`, max two lines, `aria-pressed` for the focused one. Neighbours get a ring; other chips get `opacity-35` while something is focused.
  - **Overlay:** an absolutely positioned SVG over the map container. In a `useLayoutEffect` that depends on `[focusId, filter, width]`, measure the focused chip and its neighbours (refs in a `Map`), then compute `linkCurve` paths relative to the container. Recompute on ResizeObserver.
  - **Panel:**
    - phones: `fixed inset-x-3 bottom-[calc(96px+env(safe-area-inset-bottom))] max-h-[45dvh] overflow-auto` with Card styling, `role="region"` and `aria-label`;
    - md and up: a sticky side column (the map grid becomes `md:grid-cols-[1fr_18rem]`);
    - contents: label, lesson line, description, relation sentences (as buttons that move the focus, clear the week filter when needed, and `scrollIntoView({ block: "center" })`), "Open les <code>" (a Link to `/lesson/:id`) and a close button.
  - **Clearing focus:** Escape, tapping the focused chip, or tapping empty map space.
  - Remove the Drawer/Dialog.
  - Keep the week filter, the legend and the screen-reader list.
- [ ] **Step 4: Run** `bun test && bun run typecheck && bunx vite build && bun run budget` and expect PASS.
- [ ] **Step 5: Commit** `feat(concept-map): grouped focus map with link panel`
