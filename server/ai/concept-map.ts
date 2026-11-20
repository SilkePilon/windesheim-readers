// The reader concept map (spec: "Concept map (admin pipeline)"): one AI call over every ready
// lesson's study material (no page text, which keeps it cheap). The model names concepts by
// label and lesson code; the server maps those to ids and drops whatever doesn't resolve.
import { generateText, Output } from "ai";
import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "../db";
import { CONCEPT_LIMITS, type Concept, type ConceptLink, type ConceptMapData } from "../../shared/concept-map";
import { stripControl } from "../../shared/control";
import { getModel } from "./providers";
import { aiStubEnabled } from "./speech";

export const conceptMapOutputSchema = z.object({
  concepts: z
    .array(
      z.object({
        label: z.string().describe("Korte naam van het begrip (1-5 woorden)"),
        description: z.string().describe("Wat het begrip is, in één of twee zinnen"),
        lessonCode: z.string().describe("De code van de les waar het begrip thuishoort, precies zoals gegeven (bv. 1.2)"),
      }),
    )
    .describe(`2-4 kernbegrippen per les, samen hoogstens ${CONCEPT_LIMITS.concepts}`),
  links: z
    .array(
      z.object({
        fromLabel: z.string().describe("Label van het begrip waar de relatie begint, precies zoals in concepts"),
        toLabel: z.string().describe("Label van het begrip waar de relatie naartoe wijst, precies zoals in concepts"),
        label: z.string().describe("Korte relatie, bv. 'is een soort', 'veroorzaakt', 'is nodig voor'"),
      }),
    )
    .describe(`Relaties tussen begrippen, ook tussen lessen en weken; hoogstens ${CONCEPT_LIMITS.links}`),
});
export type RawConceptMap = z.infer<typeof conceptMapOutputSchema>;

export type ConceptMapLesson = {
  id: string;
  code: string;
  title: string;
  week: number;
  summary: string | null;
  keyPoints: string[] | null;
  terms: { term: string; definition: string }[];
};
export type ConceptMapInput = { language: string; readerTitle: string; lessons: ConceptMapLesson[] };
export type ConceptMapDeps = { generate?: (input: ConceptMapInput) => Promise<RawConceptMap> };

/** Per lesson summary in the prompt: enough to find its concepts without blowing up the input. */
const SUMMARY_CHARS = 2_500;

/** Single line, no control characters, at most `max` code points (as the PUT schema counts them). */
const clip = (s: string, max: number) => [...stripControl(s).replace(/\s+/g, " ").trim()].slice(0, max).join("").trim();
const key = (label: string) => clip(label, CONCEPT_LIMITS.label).toLowerCase();

/**
 * Model output → stored data. Lesson codes and labels resolve trimmed and case-insensitively;
 * duplicate labels within a lesson merge into the first; links with an unresolved end, a
 * self-link or a repeated (from, to) pair are dropped. Above the concept limit, lessons take
 * turns, so late lessons aren't cut off wholesale.
 */
export function buildConceptMap(raw: RawConceptMap, lessons: { id: string; code: string }[], newId: () => string = nanoid): ConceptMapData {
  const lessonByCode = new Map(lessons.map((l) => [l.code.trim().toLowerCase(), l.id]));
  const perLesson = new Map<string, { label: string; description: string; order: number }[]>();
  const seen = new Set<string>();
  raw.concepts.forEach((c, order) => {
    const lessonId = lessonByCode.get(c.lessonCode.trim().toLowerCase());
    const label = clip(c.label, CONCEPT_LIMITS.label);
    if (!lessonId || !label) return;
    const k = `${lessonId}\u0000${label.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    const list = perLesson.get(lessonId) ?? [];
    list.push({ label, description: clip(c.description, CONCEPT_LIMITS.description), order });
    perLesson.set(lessonId, list);
  });

  // Round-robin over lessons (in lesson order) up to the limit, then back to the model's order.
  const groups = lessons.map((l) => ({ lessonId: l.id, items: perLesson.get(l.id) ?? [] }));
  const picked: (Omit<Concept, "id"> & { order: number })[] = [];
  for (let round = 0; picked.length < CONCEPT_LIMITS.concepts; round++) {
    const batch = groups.filter((g) => g.items[round]);
    if (!batch.length) break;
    for (const g of batch) {
      if (picked.length >= CONCEPT_LIMITS.concepts) break;
      const it = g.items[round]!;
      picked.push({ label: it.label, description: it.description, lessonId: g.lessonId, order: it.order });
    }
  }
  picked.sort((a, b) => a.order - b.order);
  const concepts: Concept[] = picked.map(({ label, description, lessonId }) => ({ id: newId(), label, description, lessonId }));

  // A label used in several lessons resolves to its first concept.
  const byLabel = new Map<string, string>();
  for (const c of concepts) if (!byLabel.has(c.label.toLowerCase())) byLabel.set(c.label.toLowerCase(), c.id);
  const links: ConceptLink[] = [];
  const pairs = new Set<string>();
  for (const l of raw.links) {
    if (links.length >= CONCEPT_LIMITS.links) break;
    const from = byLabel.get(key(l.fromLabel));
    const to = byLabel.get(key(l.toLabel));
    if (!from || !to || from === to) continue;
    const pair = `${from}\u0000${to}`;
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    links.push({ from, to, label: clip(l.label, CONCEPT_LIMITS.relation) });
  }
  return { concepts, links };
}

/** AI_STUB=1: two concepts per lesson, chained in order (concept i → i+1). */
export function stubConceptMap(input: ConceptMapInput): RawConceptMap {
  const concepts = input.lessons.flatMap((l) =>
    [1, 2].map((i) => ({ label: `${l.code} begrip ${i}`, description: `Begrip ${i} uit les ${l.code}: ${l.title}.`, lessonCode: l.code })),
  );
  const links = concepts.slice(1).map((c, i) => ({ fromLabel: concepts[i]!.label, toLabel: c.label, label: "hangt samen met" }));
  return { concepts, links };
}

function instructions(language: string) {
  return `Je bent een ervaren hbo-docent. Je maakt een conceptkaart van een hele studiereader, zodat studenten zien hoe de ideeën samenhangen.
- Je krijgt per les de code, titel, week, samenvatting, leerpunten en begrippen.
- Kies per les 2 tot 4 kernbegrippen (samen hoogstens ${CONCEPT_LIMITS.concepts}). Een begrip hoort bij precies één les: de les waar het wordt uitgelegd. Gebruik de lescode precies zoals gegeven.
- Geef elk begrip een korte, unieke naam (label) en een beschrijving van één of twee zinnen.
- Leg relaties tussen begrippen (hoogstens ${CONCEPT_LIMITS.links}), vooral ook tussen lessen en weken. Gebruik voor fromLabel en toLabel precies de labels van je begrippen. Het relatielabel is kort en leest als zin: "<van> <relatie> <naar>" (bv. "is een soort", "veroorzaakt", "is nodig voor").
- Gebruik UITSLUITEND informatie uit het materiaal. Verzin niets.
- Schrijf alles in de taal van de reader (taalcode: ${language}).`;
}

function prompt(input: ConceptMapInput) {
  const blocks = input.lessons.map((l) => {
    const summary = (l.summary ?? "").slice(0, SUMMARY_CHARS);
    const points = (l.keyPoints ?? []).map((p) => `- ${p}`).join("\n");
    const terms = l.terms.map((t) => `- ${t.term}: ${t.definition}`).join("\n");
    return `## Les ${l.code} (week ${l.week}): ${l.title}\n\n${summary}\n\nLeerpunten:\n${points}\n\nBegrippen:\n${terms}`;
  });
  return `Reader: ${input.readerTitle}\n\n${blocks.join("\n\n---\n\n")}`;
}

async function modelConceptMap(input: ConceptMapInput): Promise<RawConceptMap> {
  const { output } = await generateText({
    model: await getModel("generation"),
    instructions: instructions(input.language),
    prompt: prompt(input),
    output: Output.object({ schema: conceptMapOutputSchema }),
  });
  return output;
}

/** The ready lessons of a reader, in reading order. */
export function readyLessons(readerId: string) {
  return db
    .select()
    .from(schema.lesson)
    .where(and(eq(schema.lesson.readerId, readerId), eq(schema.lesson.status, "ready")))
    .orderBy(asc(schema.lesson.week), asc(schema.lesson.position));
}

async function upsert(readerId: string, data: Partial<typeof schema.conceptMap.$inferInsert>) {
  const set = { ...data, updatedAt: new Date() };
  await db.insert(schema.conceptMap).values({ readerId, ...set }).onConflictDoUpdate({ target: schema.conceptMap.readerId, set });
}

const inFlight = new Set<string>();
/** True while this process generates the reader's map. */
export const isConceptMapInFlight = (readerId: string) => inFlight.has(readerId);

/**
 * Claim and mark a generation (status `generating`) so a caller can answer 202 and run
 * `generateConceptMap` in the background. False when one is already running.
 */
export async function startConceptMap(readerId: string) {
  if (inFlight.has(readerId)) return false;
  inFlight.add(readerId);
  try {
    await upsert(readerId, { status: "generating", error: null });
  } catch (e) {
    inFlight.delete(readerId);
    throw e;
  }
  return true;
}

/**
 * (Re)generate the reader's concept map from its ready lessons. Replaces any manual edits
 * (`editedAt` goes back to null). A failure keeps the previous data and stores the error.
 */
export async function generateConceptMap(readerId: string, deps: ConceptMapDeps = {}) {
  inFlight.add(readerId);
  try {
    await upsert(readerId, { status: "generating", error: null });
    const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, readerId), columns: { title: true, language: true } });
    if (!r) throw new Error("Reader not found");
    const lessons = await readyLessons(readerId);
    if (!lessons.length) throw new Error("No ready lessons");
    const terms = await db
      .select({ lessonId: schema.term.lessonId, term: schema.term.term, definition: schema.term.definition })
      .from(schema.term)
      .where(inArray(schema.term.lessonId, lessons.map((l) => l.id)));
    const input: ConceptMapInput = {
      language: r.language,
      readerTitle: r.title,
      lessons: lessons.map((l) => ({
        id: l.id,
        code: l.code,
        title: l.title,
        week: l.week,
        summary: l.summary,
        keyPoints: l.keyPoints,
        terms: terms.filter((t) => t.lessonId === l.id).map(({ term, definition }) => ({ term, definition })),
      })),
    };
    const generate = deps.generate ?? (aiStubEnabled() ? async (i: ConceptMapInput) => stubConceptMap(i) : modelConceptMap);
    const data = buildConceptMap(await generate(input), lessons);
    if (!data.concepts.length) throw new Error("No concepts could be matched to the lessons");
    await upsert(readerId, { status: "ready", error: null, data, editedAt: null });
  } catch (e) {
    console.error(`[concept map ${readerId}]`, e);
    await upsert(readerId, { status: "error", error: e instanceof Error ? e.message : String(e) }).catch(() => {});
  } finally {
    inFlight.delete(readerId);
  }
}
