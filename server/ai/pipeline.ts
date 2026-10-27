import { generateText, Output } from "ai";
import { z } from "zod";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { db, schema } from "../db";
import { env } from "../env";
import { getModel } from "./providers";
import { mergeLetterParts, questionCounts, readerReferenceRule, readerWording } from "./content-rules";
import { deleteAudioFiles, markAudioStale } from "./audio";

// ---------- helpers ----------

export async function getPageText(readerId: string, startPage: number, endPage: number) {
  const pages = await db
    .select()
    .from(schema.readerPage)
    .where(
      and(
        eq(schema.readerPage.readerId, readerId),
        gte(schema.readerPage.page, startPage),
        lte(schema.readerPage.page, endPage),
      ),
    )
    .orderBy(asc(schema.readerPage.page));
  return pages.map((p) => `[[PAGINA ${p.page}]]\n${p.text}`).join("\n\n");
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function setReader(id: string, data: Partial<typeof schema.reader.$inferInsert>) {
  await db.update(schema.reader).set(data).where(eq(schema.reader.id, id));
}

// ---------- 1. extract ----------

export async function extractPdf(readerId: string, bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  await db.delete(schema.readerPage).where(eq(schema.readerPage.readerId, readerId));
  const rows = text.map((t, i) => ({ readerId, page: i + 1, text: t.trim() }));
  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(schema.readerPage).values(rows.slice(i, i + 100));
  }
  await setReader(readerId, { pageCount: totalPages });
}

// ---------- 2. propose lesson structure ----------

const structureSchema = z.object({
  title: z.string().describe("Title of the reader / course"),
  language: z.string().describe("ISO 639-1 code of the reader's language, e.g. nl or en"),
  lessons: z.array(
    z.object({
      code: z.string().describe("Paragraph number from the reader, e.g. 1.1, 1.2, 2.1 (no letter suffix)"),
      title: z.string(),
      week: z.number().int(),
      startPage: z.number().int(),
      endPage: z.number().int(),
    }),
  ),
});

const STRUCTURE_PROMPT = `Je krijgt de volledige tekst van een studiereader (hbo). Elke pagina begint met [[PAGINA n]].

Taak: stel een lesindeling voor.
- Eén les per paragraaf, met de paragraafnummering uit de reader als code (bv. 1.1, 1.2, 2.1). Het eerste cijfer is meestal de week.
- Splits een paragraaf NIET op in delen en gebruik GEEN letters (dus 1.2, niet 1.2A/1.2B), ook niet als de paragraaf lang is.
- Heeft de reader geen paragraafnummers, nummer dan zelf per hoofdstuk (1.1, 1.2, ...) op natuurlijke grenzen (kopjes).
- startPage/endPage zijn de paginanummers uit de [[PAGINA n]] markers en omvatten de hele paragraaf. Opeenvolgende lessen mogen dezelfde grenspagina delen.
- Sla inhoudsopgave, voorwoord, bronnenlijsten en lege pagina's over.
- De titel beschrijft de paragraaf kort, in de taal van de reader (gebruik de paragraaftitel uit de reader als die er is).`;

export async function proposeStructure(readerId: string) {
  await setReader(readerId, { status: "structuring", error: null });
  try {
    const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, readerId) });
    if (!r) throw new Error("Reader not found");
    const text = await getPageText(readerId, 1, r.pageCount);
    const { output } = await generateText({
      model: await getModel("generation"),
      instructions: STRUCTURE_PROMPT,
      prompt: text,
      output: Output.object({ schema: structureSchema }),
    });

    const lessons = mergeLetterParts(output.lessons.filter((l) => l.startPage >= 1 && l.endPage >= l.startPage))
      .map((l, i) => ({
        id: nanoid(),
        readerId,
        code: l.code.trim(),
        title: l.title.trim(),
        week: l.week,
        position: i,
        startPage: Math.max(1, l.startPage),
        endPage: Math.min(r.pageCount, l.endPage),
      }));

    const oldIds = (await db.select({ id: schema.lesson.id }).from(schema.lesson).where(eq(schema.lesson.readerId, readerId))).map((x) => x.id);
    await db.transaction(async (tx) => {
      await tx.delete(schema.lesson).where(eq(schema.lesson.readerId, readerId));
      if (lessons.length) await tx.insert(schema.lesson).values(lessons);
    });
    await deleteAudioFiles(oldIds);
    await setReader(readerId, {
      status: "review",
      language: output.language || "nl",
      title: r.title || output.title,
    });
  } catch (e) {
    console.error("[structure]", e);
    await setReader(readerId, { status: "error", error: errMsg(e) });
  }
}

// ---------- 3. generate study content per lesson ----------

const studySchema = (c: ReturnType<typeof questionCounts>) =>
  z.object({
    summary: z
      .string()
      .describe("Duidelijke samenvatting van de hele paragraaf in Markdown (kopjes ##, opsommingen, **vetgedrukte** kernbegrippen). 400-900 woorden."),
    keyPoints: z.array(z.string()).describe("5-10 belangrijkste leerpunten, elk één zin"),
    terms: z.array(z.object({ term: z.string(), definition: z.string() })).describe("Alle belangrijke begrippen uit de paragraaf met korte definitie"),
    flashcards: z
      .array(z.object({ front: z.string(), back: z.string() }))
      .describe(`${c.flashcards[0]}-${c.flashcards[1]} flashcards over de hele paragraaf: vraag of begrip op de voorkant, kort en precies antwoord op de achterkant`),
  });

const quizSchema = (c: ReturnType<typeof questionCounts>) =>
  z.object({
    multipleChoice: z
      .array(
        z.object({
          prompt: z.string(),
          options: z.array(z.string()).describe("Precies 4 opties, plausibele afleiders"),
          correctIndex: z.number().int().describe("0-based index van het juiste antwoord"),
          explanation: z.string(),
          difficulty: z.number().int().describe("1 = makkelijk, 2 = gemiddeld, 3 = moeilijk"),
        }),
      )
      .describe(`${c.mc} meerkeuzevragen, verspreid over de hele paragraaf; mix van kennis, begrip en toepassing`),
    trueFalse: z
      .array(z.object({ statement: z.string(), isTrue: z.boolean(), explanation: z.string(), difficulty: z.number().int() }))
      .describe(`${c.tf} stellingen, ongeveer de helft onwaar`),
    fillInBlank: z
      .array(
        z.object({
          sentence: z.string().describe("Zin met precies één ___ op de plek van het ontbrekende woord"),
          acceptedAnswers: z.array(z.string()).describe("Geaccepteerde antwoorden (synoniemen/spellingen)"),
          explanation: z.string(),
          difficulty: z.number().int(),
        }),
      )
      .describe(`${c.fill} invulvragen voor kernbegrippen`),
    ordering: z
      .array(
        z.object({
          prompt: z.string(),
          stepsInOrder: z.array(z.string()).describe("3-6 stappen in de juiste volgorde"),
          explanation: z.string(),
          difficulty: z.number().int(),
        }),
      )
      .describe(`${c.ordering[0]}-${c.ordering[1]} volgordevragen; alleen als de stof een proces, cyclus of stappenplan bevat`),
    openQuestions: z
      .array(
        z.object({
          prompt: z.string().describe("Open vraag die begrip of toepassing toetst (bv. 'Leg uit...', 'Pas toe op...')"),
          modelAnswer: z.string(),
          rubric: z.array(z.string()).describe("3-5 punten die een goed antwoord moet bevatten"),
          difficulty: z.number().int(),
        }),
      )
      .describe(`${c.open} open vragen`),
  });

function contentPrompt(language: string, focus: "study" | "quiz") {
  return `Je bent een ervaren hbo-docent en didacticus. Je maakt ${focus === "study" ? "studiemateriaal (samenvatting, begrippen, flashcards)" : "toetsvragen"} voor studenten op basis van één volledige paragraaf uit hun reader.
- Je krijgt de volledige tekst van alle pagina's van de paragraaf. Behandel de HELE paragraaf, niet alleen het begin. De eerste en laatste pagina kunnen ook stukjes van naburige paragrafen bevatten; laat die weg.
- Gebruik UITSLUITEND informatie uit de reader. Verzin geen feiten.
- Schrijf alles in de taal van de reader (taalcode: ${language}).
${readerReferenceRule(language)}
- Vragen moeten begrip toetsen, niet alleen herkenning. Varieer moeilijkheid.
- Meerkeuze-afleiders moeten plausibel zijn (veelgemaakte misvattingen), niet absurd.
- Afbeeldingen zijn niet zichtbaar; negeer verwijzingen naar figuren tenzij de reader ze uitlegt.`;
}

export async function generateLessonContent(lessonId: string) {
  const l = await db.query.lesson.findFirst({ where: eq(schema.lesson.id, lessonId) });
  if (!l) return;
  const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, l.readerId) });
  if (!r) return;

  await db.update(schema.lesson).set({ status: "generating", error: null }).where(eq(schema.lesson.id, lessonId));
  try {
    const text = await getPageText(l.readerId, l.startPage, l.endPage);
    const counts = questionCounts(l.endPage - l.startPage + 1);
    const prompt = `Paragraaf ${l.code}: ${l.title} (reader-pagina ${l.startPage}-${l.endPage})\n\n${text}`;
    const model = await getModel("generation");
    // Two calls with the full paragraph text: study material and questions each get the whole output budget.
    const [study, quiz] = await Promise.all([
      generateText({ model, instructions: contentPrompt(r.language, "study"), prompt, output: Output.object({ schema: studySchema(counts) }) }),
      generateText({ model, instructions: contentPrompt(r.language, "quiz"), prompt, output: Output.object({ schema: quizSchema(counts) }) }),
    ]);
    const w = (s: string) => readerWording(s, r.language);
    const output = {
      summary: w(study.output.summary),
      keyPoints: study.output.keyPoints.map(w),
      terms: study.output.terms.map((t) => ({ term: t.term, definition: w(t.definition) })),
      flashcards: study.output.flashcards.map((f) => ({ front: w(f.front), back: w(f.back) })),
      multipleChoice: quiz.output.multipleChoice.map((q) => ({ ...q, prompt: w(q.prompt), options: q.options.map(w), explanation: w(q.explanation) })),
      trueFalse: quiz.output.trueFalse.map((q) => ({ ...q, statement: w(q.statement), explanation: w(q.explanation) })),
      fillInBlank: quiz.output.fillInBlank.map((q) => ({ ...q, sentence: w(q.sentence), explanation: w(q.explanation) })),
      ordering: quiz.output.ordering.map((q) => ({ ...q, prompt: w(q.prompt), stepsInOrder: q.stepsInOrder.map(w), explanation: w(q.explanation) })),
      openQuestions: quiz.output.openQuestions.map((q) => ({ ...q, prompt: w(q.prompt), modelAnswer: w(q.modelAnswer), rubric: q.rubric.map(w) })),
    };

    const d = (n: number) => Math.min(3, Math.max(1, Math.round(n || 2)));
    const questions: (typeof schema.question.$inferInsert)[] = [
      ...output.multipleChoice
        .filter((q) => q.options.length >= 2 && q.correctIndex >= 0 && q.correctIndex < q.options.length)
        .map((q) => ({
          id: nanoid(),
          lessonId,
          type: "mc" as const,
          prompt: q.prompt,
          difficulty: d(q.difficulty),
          data: { type: "mc" as const, options: q.options, answer: q.correctIndex, explanation: q.explanation },
        })),
      ...output.trueFalse.map((q) => ({
        id: nanoid(),
        lessonId,
        type: "tf" as const,
        prompt: q.statement,
        difficulty: d(q.difficulty),
        data: { type: "tf" as const, answer: q.isTrue, explanation: q.explanation },
      })),
      ...output.fillInBlank
        .filter((q) => q.sentence.includes("___") && q.acceptedAnswers.length)
        .map((q) => ({
          id: nanoid(),
          lessonId,
          type: "fill" as const,
          prompt: q.sentence,
          difficulty: d(q.difficulty),
          data: { type: "fill" as const, answers: q.acceptedAnswers, explanation: q.explanation },
        })),
      ...output.ordering
        .filter((q) => q.stepsInOrder.length >= 3)
        .map((q) => ({
          id: nanoid(),
          lessonId,
          type: "order" as const,
          prompt: q.prompt,
          difficulty: d(q.difficulty),
          data: { type: "order" as const, items: q.stepsInOrder, explanation: q.explanation },
        })),
      ...output.openQuestions.map((q) => ({
        id: nanoid(),
        lessonId,
        type: "open" as const,
        prompt: q.prompt,
        difficulty: d(q.difficulty),
        data: { type: "open" as const, modelAnswer: q.modelAnswer, rubric: q.rubric },
      })),
    ];

    await db.transaction(async (tx) => {
      await tx.delete(schema.term).where(eq(schema.term.lessonId, lessonId));
      await tx.delete(schema.flashcard).where(eq(schema.flashcard.lessonId, lessonId));
      await tx.delete(schema.question).where(eq(schema.question.lessonId, lessonId));
      if (output.terms.length)
        await tx.insert(schema.term).values(output.terms.map((t) => ({ id: nanoid(), lessonId, ...t })));
      if (output.flashcards.length)
        await tx.insert(schema.flashcard).values(output.flashcards.map((f) => ({ id: nanoid(), lessonId, ...f })));
      if (questions.length) await tx.insert(schema.question).values(questions);
      await tx
        .update(schema.lesson)
        .set({ status: "ready", summary: output.summary, keyPoints: output.keyPoints, generatedAt: new Date() })
        .where(eq(schema.lesson.id, lessonId));
    });
    await markAudioStale([lessonId]);
  } catch (e) {
    console.error(`[generate ${l.code}]`, e);
    await db.update(schema.lesson).set({ status: "error", error: errMsg(e) }).where(eq(schema.lesson.id, lessonId));
  }
}

/** Generate content for the given lessons (or all of the reader) with limited concurrency. */
export async function generateReader(readerId: string, lessonIds?: string[], concurrency = 2) {
  await setReader(readerId, { status: "generating", error: null });
  const lessons = await db
    .select({ id: schema.lesson.id })
    .from(schema.lesson)
    .where(
      lessonIds?.length
        ? and(eq(schema.lesson.readerId, readerId), inArray(schema.lesson.id, lessonIds))
        : eq(schema.lesson.readerId, readerId),
    )
    .orderBy(asc(schema.lesson.position));

  await db
    .update(schema.lesson)
    .set({ status: "pending" })
    .where(inArray(schema.lesson.id, lessons.map((l) => l.id)));

  const queue = lessons.map((l) => l.id);
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) await generateLessonContent(id);
    }),
  );

  const all = await db.select({ status: schema.lesson.status }).from(schema.lesson).where(eq(schema.lesson.readerId, readerId));
  const failed = all.filter((l) => l.status === "error").length;
  await setReader(readerId, {
    status: "ready",
    error: failed ? `${failed} lesson(s) failed to generate` : null,
  });
}

/** Called on boot: jobs run in-process, so anything "in progress" was interrupted by a restart. */
export async function recoverInterruptedJobs() {
  const interrupted = "Interrupted by server restart";
  await db
    .update(schema.lesson)
    .set({ status: "error", error: interrupted })
    .where(eq(schema.lesson.status, "generating"));
  await db
    .update(schema.reader)
    .set({ status: "error", error: interrupted })
    .where(inArray(schema.reader.status, ["extracting", "structuring"]));
  await db.update(schema.reader).set({ status: "ready", error: interrupted }).where(eq(schema.reader.status, "generating"));
}

/** Re-run extract + structure from the stored PDF. Refuses if lessons exist (proposeStructure deletes them). */
export async function extractAndStructure(readerId: string) {
  const existing = await db.select({ id: schema.lesson.id }).from(schema.lesson).where(eq(schema.lesson.readerId, readerId)).limit(1);
  if (existing.length) throw new Error("Reader already has lessons; refusing to re-structure");
  const bytes = new Uint8Array(await Bun.file(join(env.uploadDir, `${readerId}.pdf`)).arrayBuffer());
  await extractPdf(readerId, bytes);
  await proposeStructure(readerId);
}
