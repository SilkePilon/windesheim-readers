// The student concept map's layout (spec: "Concept map view"): pure, no DOM, no i18n.
// Week bands top to bottom, chips wrapped into centred rows, cubic curves between centres.
import type { ConceptMapData } from "@shared/concept-map";

export type MapLesson = { id: string; code: string; title: string; week: number; mastery: number };
export type ConceptTone = "new" | "learning" | "mastered";
export type LayoutNode = { id: string; x: number; y: number; w: number; h: number; tone: ConceptTone };
export type LayoutBand = { week: number; y: number; h: number };
export type ConceptLayout = { bands: LayoutBand[]; nodes: LayoutNode[]; edges: { from: string; to: string; d: string }[]; height: number };

/** Chip height, gaps and band paddings, in px. */
export const LAYOUT = { chipH: 40, gapX: 8, gapY: 12, side: 16, bandTop: 36, bandBottom: 16, bandGap: 8 } as const;

/** A lesson's mastery as a chip tone: < 0.2 new, < 0.8 learning, otherwise mastered. */
export function masteryTone(mastery: number): ConceptTone {
  return mastery < 0.2 ? "new" : mastery < 0.8 ? "learning" : "mastered";
}

/** A chip's width: 8 px per character plus 24, capped at `width − 32` (the label truncates beyond it). */
export function chipWidth(label: string, width: number) {
  return Math.max(0, Math.min(8 * [...label].length + 24, width - 2 * LAYOUT.side));
}

const r = (n: number) => Math.round(n * 10) / 10;

/** A soft cubic curve from centre to centre; chips in the same row get a curve that bows upward. */
function curve(a: LayoutNode, b: LayoutNode) {
  const [x1, y1, x2, y2] = [a.x + a.w / 2, a.y + a.h / 2, b.x + b.w / 2, b.y + b.h / 2];
  if (Math.abs(y1 - y2) < 1) {
    const lift = Math.min(40, 12 + Math.abs(x2 - x1) / 4);
    return `M${r(x1)} ${r(y1)} C${r(x1)} ${r(y1 - lift)} ${r(x2)} ${r(y2 - lift)} ${r(x2)} ${r(y2)}`;
  }
  const my = (y1 + y2) / 2;
  return `M${r(x1)} ${r(y1)} C${r(x1)} ${r(my)} ${r(x2)} ${r(my)} ${r(x2)} ${r(y2)}`;
}

/**
 * Lays the map out for a container `width` px wide. Concepts of lessons not in `lessons` get
 * no node, and links whose ends have no node are dropped. Within a week, concepts follow the
 * lesson order of `lessons` (then their own order).
 */
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
