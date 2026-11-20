// Pure edit helpers behind the admin concept-map list editor.
import { describe, expect, test } from "bun:test";
import { CONCEPT_LIMITS, type ConceptMapData } from "../shared/concept-map";
import { addConcept, addLink, draftIssue, removeConcept, removeLink, updateConcept, updateLink } from "../src/lib/concept-edit";

const c = (id: string, lessonId = "L1") => ({ id, label: id, description: "", lessonId });
const base = (): ConceptMapData => ({
  concepts: [c("a"), c("b"), c("c", "L2")],
  links: [
    { from: "a", to: "b", label: "leidt tot" },
    { from: "b", to: "c", label: "deel van" },
    { from: "c", to: "a", label: "voorbeeld" },
  ],
});

describe("addConcept", () => {
  test("appends an empty concept with a fresh id for the lesson", () => {
    const d = base();
    const next = addConcept(d, "L2");
    expect(next).not.toBe(d);
    expect(d.concepts).toHaveLength(3);
    expect(next.concepts).toHaveLength(4);
    const added = next.concepts[3]!;
    expect(added.lessonId).toBe("L2");
    expect(added.label).toBe("");
    expect(d.concepts.map((x) => x.id)).not.toContain(added.id);
  });
  test("ids stay unique over repeated adds", () => {
    let d = base();
    for (let i = 0; i < 5; i++) d = addConcept(d, "L1");
    expect(new Set(d.concepts.map((x) => x.id)).size).toBe(d.concepts.length);
  });
  test("returns the same object at the cap", () => {
    const d: ConceptMapData = { concepts: Array.from({ length: CONCEPT_LIMITS.concepts }, (_, i) => c(`k${i}`)), links: [] };
    expect(addConcept(d, "L1")).toBe(d);
  });
});

describe("removeConcept", () => {
  test("drops the concept and every link touching it", () => {
    const d = base();
    const next = removeConcept(d, "a");
    expect(next.concepts.map((x) => x.id)).toEqual(["b", "c"]);
    expect(next.links).toEqual([{ from: "b", to: "c", label: "deel van" }]);
    expect(d.links).toHaveLength(3);
  });
});

describe("updateConcept", () => {
  test("patches one concept immutably", () => {
    const d = base();
    const next = updateConcept(d, "b", { label: "Nieuw", lessonId: "L2" });
    expect(next.concepts[1]).toEqual({ id: "b", label: "Nieuw", description: "", lessonId: "L2" });
    expect(d.concepts[1]!.label).toBe("b");
  });
});

describe("addLink", () => {
  test("adds a link", () => {
    const d = base();
    const next = addLink(d, "a", "c", "hoort bij");
    expect(next.links).toHaveLength(4);
    expect(next.links[3]).toEqual({ from: "a", to: "c", label: "hoort bij" });
  });
  test("refuses self-links", () => {
    const d = base();
    expect(addLink(d, "a", "a", "x")).toBe(d);
  });
  test("refuses duplicates", () => {
    const d = base();
    expect(addLink(d, "a", "b", "anders")).toBe(d);
  });
  test("refuses unknown concepts and the cap", () => {
    const d = base();
    expect(addLink(d, "a", "zz", "x")).toBe(d);
    const full: ConceptMapData = {
      concepts: [c("a"), c("b")],
      links: Array.from({ length: CONCEPT_LIMITS.links }, () => ({ from: "b", to: "a", label: "" })),
    };
    expect(addLink(full, "a", "b", "x")).toBe(full);
  });
});

describe("removeLink / updateLink", () => {
  test("removeLink drops by index", () => {
    expect(removeLink(base(), 1).links.map((l) => l.label)).toEqual(["leidt tot", "voorbeeld"]);
  });
  test("updateLink changes the label, and refuses a self or duplicate target", () => {
    const d = base();
    expect(updateLink(d, 0, { label: "veroorzaakt" }).links[0]!.label).toBe("veroorzaakt");
    expect(updateLink(d, 0, { to: "a" })).toBe(d);
    const withAc = addLink(d, "a", "c", "");
    expect(updateLink(withAc, 0, { to: "c" })).toBe(withAc);
    expect(updateLink(d, 0, { to: "c" }).links[0]).toEqual({ from: "a", to: "c", label: "leidt tot" });
  });
});

describe("draftIssue", () => {
  const lessons = new Set(["L1", "L2"]);
  test("null for a valid draft", () => expect(draftIssue(base(), lessons)).toBeNull());
  test("an empty label blocks saving", () => expect(draftIssue(updateConcept(base(), "a", { label: "  " }), lessons)).toBe("EMPTY_LABEL"));
  test("a lesson that no longer exists", () => expect(draftIssue(base(), new Set(["L1"]))).toBe("UNKNOWN_LESSON"));
});
