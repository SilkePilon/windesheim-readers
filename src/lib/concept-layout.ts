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
