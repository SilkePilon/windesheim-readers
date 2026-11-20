// The student concept map's pure helpers (spec: "Concept map: focus redesign"): no DOM, no i18n.
// Grouping week → lesson → concepts, a concept's relations, and the curve drawn for a focused link.
import type { Concept, ConceptMapData } from "@shared/concept-map";

export type MapLesson = { id: string; code: string; title: string; week: number; mastery: number };
export type ConceptTone = "new" | "learning" | "mastered";

/** A lesson's mastery as a chip tone: < 0.2 new, < 0.8 learning, otherwise mastered. */
export function masteryTone(mastery: number): ConceptTone {
  return mastery < 0.2 ? "new" : mastery < 0.8 ? "learning" : "mastered";
}

export type GroupedWeek = { week: number; lessons: { lesson: MapLesson; concepts: Concept[] }[] };

/**
 * Weeks ascending; within a week the lessons in the order of `lessons` (the server sends them by
 * position), each with its concepts in data order. Lessons without concepts are left out, and
 * concepts whose lesson is not in `lessons` are dropped.
 */
export function groupConcepts(data: ConceptMapData, lessons: MapLesson[]): GroupedWeek[] {
  const byLesson = new Map<string, Concept[]>();
  for (const c of data.concepts) {
    const list = byLesson.get(c.lessonId);
    if (list) list.push(c);
    else byLesson.set(c.lessonId, [c]);
  }
  const byWeek = new Map<number, GroupedWeek["lessons"]>();
  for (const lesson of lessons) {
    const concepts = byLesson.get(lesson.id);
    if (!concepts) continue;
    byLesson.delete(lesson.id); // a lesson listed twice is shown once
    const list = byWeek.get(lesson.week) ?? [];
    list.push({ lesson, concepts });
    byWeek.set(lesson.week, list);
  }
  return [...byWeek.keys()].sort((a, b) => a - b).map((week) => ({ week, lessons: byWeek.get(week)! }));
}

export type Relation = { dir: "out" | "in"; label: string; other: Concept };

/**
 * The links of concept `id` as relations: outgoing first, then incoming, each in data order.
 * Self-links and links to concepts not in the data are dropped; a (dir, other) pair is kept once.
 */
export function relationsOf(id: string, data: ConceptMapData): Relation[] {
  const conceptOf = new Map(data.concepts.map((c) => [c.id, c]));
  if (!conceptOf.has(id)) return [];
  const seen = new Set<string>();
  const out: Relation[] = [];
  for (const dir of ["out", "in"] as const) {
    for (const l of data.links) {
      if (l.from === l.to) continue;
      const otherId = dir === "out" ? (l.from === id ? l.to : null) : l.to === id ? l.from : null;
      const other = otherId ? conceptOf.get(otherId) : undefined;
      if (!other || seen.has(`${dir}:${other.id}`)) continue;
      seen.add(`${dir}:${other.id}`);
      out.push({ dir, label: l.label, other });
    }
  }
  return out;
}

type Rect = { x: number; y: number; w: number; h: number };
const r = (n: number) => Math.round(n * 10) / 10;

/**
 * A soft cubic curve between two rects: from the middle of a's edge that faces b to the middle of
 * b's edge that faces a. Rects in different rows (no vertical overlap) connect bottom ↔ top with
 * vertical tangents; rects in the same row connect side ↔ side with horizontal tangents.
 */
export function linkCurve(a: Rect, b: Rect): string {
  const sameRow = a.y < b.y + b.h && b.y < a.y + a.h;
  if (sameRow) {
    const right = b.x + b.w / 2 >= a.x + a.w / 2;
    const x1 = right ? a.x + a.w : a.x;
    const x2 = right ? b.x : b.x + b.w;
    const [y1, y2] = [a.y + a.h / 2, b.y + b.h / 2];
    const k = Math.max(24, Math.abs(x2 - x1) / 2) * (right ? 1 : -1);
    return `M${r(x1)} ${r(y1)} C${r(x1 + k)} ${r(y1)} ${r(x2 - k)} ${r(y2)} ${r(x2)} ${r(y2)}`;
  }
  const down = b.y >= a.y;
  const [x1, x2] = [a.x + a.w / 2, b.x + b.w / 2];
  const y1 = down ? a.y + a.h : a.y;
  const y2 = down ? b.y : b.y + b.h;
  const k = Math.max(16, Math.abs(y2 - y1) / 2) * (down ? 1 : -1);
  return `M${r(x1)} ${r(y1)} C${r(x1)} ${r(y1 + k)} ${r(x2)} ${r(y2 - k)} ${r(x2)} ${r(y2)}`;
}

// --- Old absolute layout, kept only until the focus map replaces its one caller (next commit). ---
export type LayoutNode = { id: string; x: number; y: number; w: number; h: number; tone: ConceptTone };
export type LayoutBand = { week: number; y: number; h: number };
export type ConceptLayout = { bands: LayoutBand[]; nodes: LayoutNode[]; edges: { from: string; to: string; d: string }[]; height: number };
export const LAYOUT = { chipH: 40, gapX: 8, gapY: 12, side: 16, bandTop: 36, bandBottom: 16, bandGap: 8 } as const;
export function chipWidth(label: string, width: number) {
  return Math.max(0, Math.min(8 * [...label].length + 24, width - 2 * LAYOUT.side));
}
function curve(a: LayoutNode, b: LayoutNode) {
  const [x1, y1, x2, y2] = [a.x + a.w / 2, a.y + a.h / 2, b.x + b.w / 2, b.y + b.h / 2];
  if (Math.abs(y1 - y2) < 1) {
    const lift = Math.min(40, 12 + Math.abs(x2 - x1) / 4);
    return `M${r(x1)} ${r(y1)} C${r(x1)} ${r(y1 - lift)} ${r(x2)} ${r(y2 - lift)} ${r(x2)} ${r(y2)}`;
  }
  const my = (y1 + y2) / 2;
  return `M${r(x1)} ${r(y1)} C${r(x1)} ${r(my)} ${r(x2)} ${r(my)} ${r(x2)} ${r(y2)}`;
}
export function layoutConceptMap(data: ConceptMapData, lessons: MapLesson[], width: number): ConceptLayout {
  const lessonIdx = new Map(lessons.map((l, i) => [l.id, i]));
  const byWeek = new Map<number, { id: string; label: string; lesson: MapLesson; order: number }[]>();
  data.concepts.forEach((c, order) => {
    const i = lessonIdx.get(c.lessonId);
    if (i === undefined) return;
    const lesson = lessons[i]!;
    const list = byWeek.get(lesson.week) ?? [];
    list.push({ id: c.id, label: c.label, lesson, order });
    byWeek.set(lesson.week, list);
  });

  const bands: LayoutBand[] = [];
  const nodes: LayoutNode[] = [];
  const inner = width - 2 * LAYOUT.side;
  let y = 0;
  for (const week of [...byWeek.keys()].sort((a, b) => a - b)) {
    const items = byWeek.get(week)!.sort((a, b) => lessonIdx.get(a.lesson.id)! - lessonIdx.get(b.lesson.id)! || a.order - b.order);
    // Greedy rows that fit the inner width, each centred.
    const rows: { id: string; w: number; tone: ConceptTone }[][] = [[]];
    let used = 0;
    for (const it of items) {
      const w = chipWidth(it.label, width);
      const row = rows.at(-1)!;
      if (row.length && used + LAYOUT.gapX + w > inner) {
        rows.push([]);
        used = 0;
      }
      used += (rows.at(-1)!.length ? LAYOUT.gapX : 0) + w;
      rows.at(-1)!.push({ id: it.id, w, tone: masteryTone(it.lesson.mastery) });
    }
    const top = y;
    let rowY = top + LAYOUT.bandTop;
    for (const row of rows) {
      const rowW = row.reduce((s, n) => s + n.w, 0) + LAYOUT.gapX * (row.length - 1);
      let x = LAYOUT.side + Math.max(0, (inner - rowW) / 2);
      for (const n of row) {
        nodes.push({ id: n.id, x: r(x), y: rowY, w: n.w, h: LAYOUT.chipH, tone: n.tone });
        x += n.w + LAYOUT.gapX;
      }
      rowY += LAYOUT.chipH + LAYOUT.gapY;
    }
    const h = rowY - LAYOUT.gapY + LAYOUT.bandBottom - top;
    bands.push({ week, y: top, h });
    y = top + h + LAYOUT.bandGap;
  }

  const at = new Map(nodes.map((n) => [n.id, n]));
  const edges = data.links.flatMap((l) => {
    const a = at.get(l.from);
    const b = at.get(l.to);
    return a && b && a !== b ? [{ from: l.from, to: l.to, d: curve(a, b) }] : [];
  });
  return { bands, nodes, edges, height: bands.length ? y - LAYOUT.bandGap : 0 };
}
