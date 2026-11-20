// The reader concept map (spec: "Concept map (admin pipeline)"): types, limits and the pure
// checks shared by the server (generation, admin PUT, student view) and the client.

export const CONCEPT_LIMITS = { concepts: 60, links: 120, label: 80, description: 400, relation: 60 } as const;

export type Concept = { id: string; label: string; description: string; lessonId: string };
export type ConceptLink = { from: string; to: string; label: string };
export type ConceptMapData = { concepts: Concept[]; links: ConceptLink[] };

export type ConceptMapError = "DUPLICATE_ID" | "UNKNOWN_CONCEPT" | "UNKNOWN_LESSON" | "TOO_MANY" | "SELF_LINK";

/**
 * Structural checks beyond the field sizes (zod does those). The first failure wins, in this
 * order: TOO_MANY, DUPLICATE_ID, UNKNOWN_LESSON, UNKNOWN_CONCEPT, SELF_LINK.
 */
export function validateConceptMap(d: ConceptMapData, lessonIds: Set<string>): { ok: true } | { ok: false; error: ConceptMapError } {
  if (d.concepts.length > CONCEPT_LIMITS.concepts || d.links.length > CONCEPT_LIMITS.links) return { ok: false, error: "TOO_MANY" };
  const ids = new Set(d.concepts.map((c) => c.id));
  if (ids.size !== d.concepts.length) return { ok: false, error: "DUPLICATE_ID" };
  if (d.concepts.some((c) => !lessonIds.has(c.lessonId))) return { ok: false, error: "UNKNOWN_LESSON" };
  if (d.links.some((l) => !ids.has(l.from) || !ids.has(l.to))) return { ok: false, error: "UNKNOWN_CONCEPT" };
  if (d.links.some((l) => l.from === l.to)) return { ok: false, error: "SELF_LINK" };
  return { ok: true };
}

/** Only the concepts of lessons this viewer may see, and only links between those. */
export function visibleMap(d: ConceptMapData, visibleLessonIds: Set<string>): ConceptMapData {
  const concepts = d.concepts.filter((c) => visibleLessonIds.has(c.lessonId));
  const ids = new Set(concepts.map((c) => c.id));
  return { concepts, links: d.links.filter((l) => ids.has(l.from) && ids.has(l.to)) };
}
