// Pure edits for the admin concept-map list editor. Each returns a new ConceptMapData, or the
// same object when the edit is refused (a cap, a self-link, a duplicate, an unknown concept).
import { CONCEPT_LIMITS, validateConceptMap, type Concept, type ConceptLink, type ConceptMapData, type ConceptMapError } from "@shared/concept-map";

/** The first `c<n>` id not in use. */
function freshId(d: ConceptMapData): string {
  const used = new Set(d.concepts.map((c) => c.id));
  let n = d.concepts.length + 1;
  while (used.has(`c${n}`)) n++;
  return `c${n}`;
}

export function addConcept(d: ConceptMapData, lessonId: string): ConceptMapData {
  if (d.concepts.length >= CONCEPT_LIMITS.concepts) return d;
  return { ...d, concepts: [...d.concepts, { id: freshId(d), label: "", description: "", lessonId }] };
}

/** Removes the concept and every link from or to it. */
export function removeConcept(d: ConceptMapData, id: string): ConceptMapData {
  return { concepts: d.concepts.filter((c) => c.id !== id), links: d.links.filter((l) => l.from !== id && l.to !== id) };
}

export function updateConcept(d: ConceptMapData, id: string, patch: Partial<Omit<Concept, "id">>): ConceptMapData {
  return { ...d, concepts: d.concepts.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

/** May a link `from → to` exist next to the others (ignoring the link at `except`)? */
function linkAllowed(d: ConceptMapData, from: string, to: string, except = -1): boolean {
  if (from === to) return false;
  const ids = new Set(d.concepts.map((c) => c.id));
  if (!ids.has(from) || !ids.has(to)) return false;
  return !d.links.some((l, i) => i !== except && l.from === from && l.to === to);
}

export function addLink(d: ConceptMapData, from: string, to: string, label: string): ConceptMapData {
  if (d.links.length >= CONCEPT_LIMITS.links || !linkAllowed(d, from, to)) return d;
  return { ...d, links: [...d.links, { from, to, label }] };
}

export function updateLink(d: ConceptMapData, index: number, patch: Partial<ConceptLink>): ConceptMapData {
  const cur = d.links[index];
  if (!cur) return d;
  const next = { ...cur, ...patch };
  if ((next.from !== cur.from || next.to !== cur.to) && !linkAllowed(d, next.from, next.to, index)) return d;
  return { ...d, links: d.links.map((l, i) => (i === index ? next : l)) };
}

export function removeLink(d: ConceptMapData, index: number): ConceptMapData {
  return { ...d, links: d.links.filter((_, i) => i !== index) };
}

export type DraftIssue = ConceptMapError | "EMPTY_LABEL";

/**
 * Why the server would refuse this draft, or null: an empty label (zod), else the first
 * structural error against the reader's current lessons (e.g. a lesson removed by a restructure).
 */
export function draftIssue(d: ConceptMapData, lessonIds: Set<string>): DraftIssue | null {
  if (d.concepts.some((c) => !c.label.trim())) return "EMPTY_LABEL";
  const v = validateConceptMap(d, lessonIds);
  return v.ok ? null : v.error;
}
