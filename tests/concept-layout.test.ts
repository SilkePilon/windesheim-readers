import { describe, expect, test } from "bun:test";
import { layoutConceptMap, masteryTone, type MapLesson } from "../src/lib/concept-layout";
import type { ConceptMapData } from "../shared/concept-map";

const lessons: MapLesson[] = [
  { id: "l1", code: "1.1", title: "Intro", week: 1, mastery: 0 },
  { id: "l2", code: "1.2", title: "Cel", week: 1, mastery: 0.5 },
  { id: "l3", code: "3.1", title: "Organen", week: 3, mastery: 0.9 },
  { id: "l4", code: "2.1", title: "Weefsel", week: 2, mastery: 0.2 },
];

const words = ["homeostase", "cel", "mitochondrion", "ATP", "enzymen en substraten", "membraanpotentiaal", "DNA", "eiwitsynthese", "osmose", "diffusie"];
function bigMap(n: number): ConceptMapData {
  const concepts = Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    label: `${words[i % words.length]}${i % 3 === 0 ? " in het lichaam" : ""}`,
    description: "",
    lessonId: lessons[i % lessons.length]!.id,
  }));
  const links = concepts.slice(1).map((c, i) => ({ from: concepts[i]!.id, to: c.id, label: "leidt tot" }));
  return { concepts, links };
}

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("layoutConceptMap", () => {
  const data = bigMap(40);
  const out = layoutConceptMap(data, lessons, 358);
  const weekOf = (id: string) => lessons.find((l) => l.id === data.concepts.find((c) => c.id === id)!.lessonId)!.week;

  test("no two nodes overlap at width 358, and all fit the width", () => {
    expect(out.nodes).toHaveLength(40);
    for (let i = 0; i < out.nodes.length; i++) {
      const a = out.nodes[i]!;
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(358);
      for (let j = i + 1; j < out.nodes.length; j++) expect(overlap(a, out.nodes[j]!)).toBe(false);
    }
  });

  test("node width follows the label, capped at width - 32", () => {
    const one = layoutConceptMap(
      { concepts: [{ id: "a", label: "x".repeat(80), description: "", lessonId: "l1" }, { id: "b", label: "ATP", description: "", lessonId: "l1" }], links: [] },
      lessons,
      358,
    );
    expect(one.nodes[0]!.w).toBe(326);
    expect(one.nodes[1]!.w).toBe(8 * 3 + 24);
  });

  test("every node lies inside its week band", () => {
    for (const n of out.nodes) {
      const band = out.bands.find((b) => b.week === weekOf(n.id))!;
      expect(band).toBeDefined();
      expect(n.y).toBeGreaterThanOrEqual(band.y);
      expect(n.y + n.h).toBeLessThanOrEqual(band.y + band.h);
    }
  });

  test("bands are in week order, top to bottom, without overlap", () => {
    expect(out.bands.map((b) => b.week)).toEqual([1, 2, 3]);
    for (let i = 1; i < out.bands.length; i++) expect(out.bands[i]!.y).toBeGreaterThanOrEqual(out.bands[i - 1]!.y + out.bands[i - 1]!.h);
    const last = out.bands.at(-1)!;
    expect(out.height).toBeGreaterThanOrEqual(last.y + last.h);
  });

  test("tones follow the mastery thresholds", () => {
    expect(masteryTone(0)).toBe("new");
    expect(masteryTone(0.19)).toBe("new");
    expect(masteryTone(0.2)).toBe("learning");
    expect(masteryTone(0.79)).toBe("learning");
    expect(masteryTone(0.8)).toBe("mastered");
    expect(masteryTone(1)).toBe("mastered");
    const tones = Object.fromEntries(out.nodes.map((n) => [data.concepts.find((c) => c.id === n.id)!.lessonId, n.tone]));
    expect(tones).toEqual({ l1: "new", l2: "learning", l3: "mastered", l4: "learning" });
  });

  test("edges start with M; links to missing nodes are dropped", () => {
    expect(out.edges).toHaveLength(39);
    for (const e of out.edges) expect(e.d.startsWith("M")).toBe(true);
    const withMissing = layoutConceptMap(
      { ...data, links: [...data.links, { from: "c0", to: "ghost", label: "x" }, { from: "ghost", to: "c1", label: "y" }] },
      lessons,
      358,
    );
    expect(withMissing.edges).toHaveLength(39);
  });

  test("concepts of unknown lessons get no node; empty map has no bands", () => {
    const r = layoutConceptMap({ concepts: [{ id: "z", label: "Z", description: "", lessonId: "nope" }], links: [] }, lessons, 358);
    expect(r.nodes).toEqual([]);
    expect(r.bands).toEqual([]);
  });
});
