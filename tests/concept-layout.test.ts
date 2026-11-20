import { describe, expect, test } from "bun:test";
import { groupConcepts, linkCurve, masteryTone, relationsOf, type MapLesson } from "../src/lib/concept-layout";
import type { ConceptMapData } from "../shared/concept-map";

const lessons: MapLesson[] = [
  { id: "l1", code: "1.1", title: "Intro", week: 1, mastery: 0 },
  { id: "l2", code: "1.2", title: "Cel", week: 1, mastery: 0.5 },
  { id: "l3", code: "3.1", title: "Organen", week: 3, mastery: 0.9 },
  { id: "l4", code: "2.1", title: "Weefsel", week: 2, mastery: 0.2 },
  { id: "l5", code: "2.2", title: "Leeg", week: 2, mastery: 0 },
];

const c = (id: string, lessonId: string) => ({ id, label: id.toUpperCase(), description: "", lessonId });

describe("masteryTone", () => {
  test("thresholds", () => {
    expect(masteryTone(0)).toBe("new");
    expect(masteryTone(0.19)).toBe("new");
    expect(masteryTone(0.2)).toBe("learning");
    expect(masteryTone(0.79)).toBe("learning");
    expect(masteryTone(0.8)).toBe("mastered");
  });
});

describe("groupConcepts", () => {
  const data: ConceptMapData = {
    concepts: [c("a", "l3"), c("b", "l2"), c("c", "l1"), c("d", "l2"), c("e", "l4"), c("x", "gone")],
    links: [],
  };
  const out = groupConcepts(data, lessons);

  test("weeks ascending, lessons in the given order, concepts in data order", () => {
    expect(out.map((w) => w.week)).toEqual([1, 2, 3]);
    expect(out[0]!.lessons.map((l) => l.lesson.id)).toEqual(["l1", "l2"]);
    expect(out[0]!.lessons[1]!.concepts.map((x) => x.id)).toEqual(["b", "d"]);
    expect(out[2]!.lessons[0]!.concepts.map((x) => x.id)).toEqual(["a"]);
  });

  test("lessons with no concepts are omitted and orphan concepts dropped", () => {
    expect(out[1]!.lessons.map((l) => l.lesson.id)).toEqual(["l4"]);
    expect(out.flatMap((w) => w.lessons.flatMap((l) => l.concepts.map((x) => x.id)))).not.toContain("x");
  });

  test("empty data gives no weeks", () => expect(groupConcepts({ concepts: [], links: [] }, lessons)).toEqual([]));
});

describe("relationsOf", () => {
  const data: ConceptMapData = {
    concepts: [c("a", "l1"), c("b", "l1"), c("c", "l2"), c("d", "l2")],
    links: [
      { from: "c", to: "a", label: "verdeelt" },
      { from: "a", to: "b", label: "is nodig voor" },
      { from: "a", to: "a", label: "zelf" },
      { from: "a", to: "nope", label: "weg" },
      { from: "a", to: "b", label: "nogmaals" },
      { from: "a", to: "c", label: "leidt tot" },
    ],
  };

  test("outgoing first then incoming, in data order; self, missing and duplicates dropped", () => {
    const r = relationsOf("a", data);
    expect(r.map((x) => [x.dir, x.other.id, x.label])).toEqual([
      ["out", "b", "is nodig voor"],
      ["out", "c", "leidt tot"],
      ["in", "c", "verdeelt"],
    ]);
  });

  test("an unlinked concept has no relations", () => expect(relationsOf("d", data)).toEqual([]));
  test("an unknown concept has no relations", () => expect(relationsOf("zz", data)).toEqual([]));
});

describe("linkCurve", () => {
  const nums = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);

  test("side by side: from a's right edge to b's left edge", () => {
    const d = linkCurve({ x: 0, y: 0, w: 100, h: 40 }, { x: 200, y: 0, w: 80, h: 40 });
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("C");
    const n = nums(d);
    expect([n[0], n[1]]).toEqual([100, 20]);
    expect([n.at(-2), n.at(-1)]).toEqual([200, 20]);
  });

  test("side by side, reversed: from a's left edge to b's right edge", () => {
    const n = nums(linkCurve({ x: 200, y: 0, w: 80, h: 40 }, { x: 0, y: 0, w: 100, h: 40 }));
    expect([n[0], n[1]]).toEqual([200, 20]);
    expect([n.at(-2), n.at(-1)]).toEqual([100, 20]);
  });

  test("stacked: from a's bottom to b's top, with vertical control points", () => {
    const d = linkCurve({ x: 0, y: 0, w: 100, h: 40 }, { x: 40, y: 120, w: 100, h: 40 });
    const n = nums(d);
    expect([n[0], n[1]]).toEqual([50, 40]);
    expect([n.at(-2), n.at(-1)]).toEqual([90, 120]);
    // control points keep their end's x (vertical tangents)
    expect(n[2]).toBe(50);
    expect(n[4]).toBe(90);
  });

  test("stacked upward: from a's top to b's bottom", () => {
    const n = nums(linkCurve({ x: 40, y: 120, w: 100, h: 40 }, { x: 0, y: 0, w: 100, h: 40 }));
    expect([n[0], n[1]]).toEqual([90, 120]);
    expect([n.at(-2), n.at(-1)]).toEqual([50, 40]);
  });
});
