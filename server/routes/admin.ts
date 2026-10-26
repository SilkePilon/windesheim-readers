import { Hono } from "hono";
import { z } from "zod";
import { and, asc, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { generateText } from "ai";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { db, schema } from "../db";
import { env } from "../env";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { extractAndStructure, extractPdf, generateReader, proposeStructure } from "../ai/pipeline";
import { retryAction } from "../ai/retry";
import { createModel, getAiSettingsPublic, getModelFor, PROVIDERS, resolveApiKey, updateAiSettings } from "../ai/providers";
import { listModels, validateKey } from "../ai/models";

const MAX_UPLOAD = 50 * 1024 * 1024;
const pdfPath = (id: string) => join(env.uploadDir, `${id}.pdf`);

const providerEnum = z.enum(PROVIDERS);
const modelChoice = z.object({ provider: providerEnum, model: z.string().min(1) });

export const admin = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)

  // ----- readers -----
  .get("/readers", async (c) => {
    const readers = await db.select().from(schema.reader).orderBy(desc(schema.reader.createdAt));
    const counts = await db
      .select({ readerId: schema.lesson.readerId, status: schema.lesson.status, n: count() })
      .from(schema.lesson)
      .groupBy(schema.lesson.readerId, schema.lesson.status);
    return c.json(
      readers.map((r) => {
        const mine = counts.filter((x) => x.readerId === r.id);
        return {
          ...r,
          lessonCount: mine.reduce((a, x) => a + x.n, 0),
          readyCount: mine.find((x) => x.status === "ready")?.n ?? 0,
          failedCount: mine.find((x) => x.status === "error")?.n ?? 0,
        };
      }),
    );
  })

  .post("/readers", async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: "NO_FILE" }, 400);
    if (file.size > MAX_UPLOAD) return c.json({ error: "FILE_TOO_LARGE" }, 400);
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf")
      return c.json({ error: "NOT_A_PDF" }, 400);

    const id = nanoid();
    const bytes = new Uint8Array(await file.arrayBuffer());
    await mkdir(env.uploadDir, { recursive: true });
    await Bun.write(pdfPath(id), bytes);
    await db.insert(schema.reader).values({
      id,
      title: String(body.title || "").trim() || file.name.replace(/\.pdf$/i, ""),
      course: String(body.course || "").trim() || null,
      fileName: file.name,
      createdBy: c.get("user").id,
    });

    // Background: extract text, then let AI propose the lesson split.
    void (async () => {
      try {
        await extractPdf(id, bytes);
        await proposeStructure(id);
      } catch (e) {
        await db
          .update(schema.reader)
          .set({ status: "error", error: e instanceof Error ? e.message : String(e) })
          .where(eq(schema.reader.id, id));
      }
    })();

    return c.json({ id });
  })

  .get("/readers/:id", async (c) => {
    const id = c.req.param("id");
    const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, id) });
    if (!r) return c.json({ error: "NOT_FOUND" }, 404);
    const lessons = await db
      .select({
        id: schema.lesson.id,
        code: schema.lesson.code,
        title: schema.lesson.title,
        week: schema.lesson.week,
        position: schema.lesson.position,
        startPage: schema.lesson.startPage,
        endPage: schema.lesson.endPage,
        status: schema.lesson.status,
        error: schema.lesson.error,
        generatedAt: schema.lesson.generatedAt,
      })
      .from(schema.lesson)
      .where(eq(schema.lesson.readerId, id))
      .orderBy(asc(schema.lesson.position));
    const ids = lessons.map((l) => l.id);
    const [cards, qs] = ids.length
      ? await Promise.all([
          db
            .select({ lessonId: schema.flashcard.lessonId, n: count() })
            .from(schema.flashcard)
            .where(inArray(schema.flashcard.lessonId, ids))
            .groupBy(schema.flashcard.lessonId),
          db
            .select({ lessonId: schema.question.lessonId, n: count() })
            .from(schema.question)
            .where(inArray(schema.question.lessonId, ids))
            .groupBy(schema.question.lessonId),
        ])
      : [[], []];
    return c.json({
      ...r,
      lessons: lessons.map((l) => ({
        ...l,
        flashcards: cards.find((x) => x.lessonId === l.id)?.n ?? 0,
        questions: qs.find((x) => x.lessonId === l.id)?.n ?? 0,
      })),
    });
  })

  .get("/readers/:id/pdf", async (c) => {
    const f = Bun.file(pdfPath(c.req.param("id")));
    if (!(await f.exists())) return c.json({ error: "NOT_FOUND" }, 404);
    return new Response(f, { headers: { "content-type": "application/pdf" } });
  })

  .get("/readers/:id/pages/:page", async (c) => {
    const p = await db.query.readerPage.findFirst({
      where: and(eq(schema.readerPage.readerId, c.req.param("id")), eq(schema.readerPage.page, Number(c.req.param("page")))),
    });
    return c.json({ text: p?.text ?? "" });
  })

  .patch("/readers/:id", async (c) => {
    const body = z
      .object({ title: z.string().min(1).optional(), course: z.string().nullable().optional(), published: z.boolean().optional() })
      .parse(await c.req.json());
    await db.update(schema.reader).set(body).where(eq(schema.reader.id, c.req.param("id")));
    return c.json({ ok: true });
  })

  .delete("/readers/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(schema.reader).where(eq(schema.reader.id, id));
    await unlink(pdfPath(id)).catch(() => {});
    return c.json({ ok: true });
  })

  .post("/readers/:id/retry", async (c) => {
    const id = c.req.param("id");
    const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, id) });
    if (!r) return c.json({ error: "NOT_FOUND" }, 404);
    const lessons = await db
      .select({ id: schema.lesson.id, status: schema.lesson.status })
      .from(schema.lesson)
      .where(eq(schema.lesson.readerId, id));
    const action = retryAction(r, lessons);
    if (action.kind === "extract") {
      await db.update(schema.reader).set({ status: "extracting", error: null }).where(eq(schema.reader.id, id));
      void extractAndStructure(id).catch(async (e) => {
        await db
          .update(schema.reader)
          .set({ status: "error", error: e instanceof Error ? e.message : String(e) })
          .where(eq(schema.reader.id, id));
      });
    } else if (action.kind === "generate") {
      void generateReader(id, action.lessonIds).catch(async (e) => {
        await db
          .update(schema.reader)
          .set({ status: "error", error: e instanceof Error ? e.message : String(e) })
          .where(eq(schema.reader.id, id));
      });
    }
    return c.json({ action: action.kind });
  })

  .post("/readers/:id/restructure", async (c) => {
    void proposeStructure(c.req.param("id"));
    return c.json({ ok: true });
  })

  /** Replace the lesson list. Lessons with an existing id keep their generated content. */
  .put("/readers/:id/lessons", async (c) => {
    const readerId = c.req.param("id");
    const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, readerId) });
    if (!r) return c.json({ error: "NOT_FOUND" }, 404);
    const lessons = z
      .array(
        z.object({
          id: z.string().optional(),
          code: z.string().min(1),
          title: z.string().min(1),
          week: z.number().int().min(1),
          startPage: z.number().int().min(1),
          endPage: z.number().int().min(1),
        }),
      )
      .parse(await c.req.json());

    const existing = new Set(
      (await db.select({ id: schema.lesson.id }).from(schema.lesson).where(eq(schema.lesson.readerId, readerId))).map((l) => l.id),
    );
    await db.transaction(async (tx) => {
      const keep: string[] = [];
      for (const [i, l] of lessons.entries()) {
        const data = {
          code: l.code.trim(),
          title: l.title.trim(),
          week: l.week,
          position: i,
          startPage: Math.min(l.startPage, r.pageCount),
          endPage: Math.min(Math.max(l.endPage, l.startPage), r.pageCount),
        };
        if (l.id && existing.has(l.id)) {
          await tx.update(schema.lesson).set(data).where(eq(schema.lesson.id, l.id));
          keep.push(l.id);
        } else {
          const id = nanoid();
          await tx.insert(schema.lesson).values({ id, readerId, ...data });
          keep.push(id);
        }
      }
      await tx
        .delete(schema.lesson)
        .where(keep.length ? and(eq(schema.lesson.readerId, readerId), notInArray(schema.lesson.id, keep)) : eq(schema.lesson.readerId, readerId));
    });
    if (r.status === "structuring" || r.status === "error")
      await db.update(schema.reader).set({ status: "review", error: null }).where(eq(schema.reader.id, readerId));
    return c.json({ ok: true });
  })

  .post("/readers/:id/generate", async (c) => {
    const { lessonIds } = z.object({ lessonIds: z.array(z.string()).optional() }).parse(await c.req.json().catch(() => ({})));
    void generateReader(c.req.param("id"), lessonIds);
    return c.json({ ok: true });
  })

  // ----- lesson content editing -----
  .get("/lessons/:id", async (c) => {
    const id = c.req.param("id");
    const l = await db.query.lesson.findFirst({ where: eq(schema.lesson.id, id) });
    if (!l) return c.json({ error: "NOT_FOUND" }, 404);
    const [terms, flashcards, questions] = await Promise.all([
      db.select().from(schema.term).where(eq(schema.term.lessonId, id)),
      db.select().from(schema.flashcard).where(eq(schema.flashcard.lessonId, id)),
      db.select().from(schema.question).where(eq(schema.question.lessonId, id)),
    ]);
    return c.json({ ...l, terms, flashcards, questions });
  })
  .patch("/lessons/:id", async (c) => {
    const body = z.object({ summary: z.string().optional(), title: z.string().optional() }).parse(await c.req.json());
    await db.update(schema.lesson).set(body).where(eq(schema.lesson.id, c.req.param("id")));
    return c.json({ ok: true });
  })
  .patch("/flashcards/:id", async (c) => {
    const body = z.object({ front: z.string().min(1), back: z.string().min(1) }).parse(await c.req.json());
    await db.update(schema.flashcard).set(body).where(eq(schema.flashcard.id, c.req.param("id")));
    return c.json({ ok: true });
  })
  .delete("/flashcards/:id", async (c) => {
    await db.delete(schema.flashcard).where(eq(schema.flashcard.id, c.req.param("id")));
    return c.json({ ok: true });
  })
  .delete("/questions/:id", async (c) => {
    await db.delete(schema.question).where(eq(schema.question.id, c.req.param("id")));
    return c.json({ ok: true });
  })
  .delete("/terms/:id", async (c) => {
    await db.delete(schema.term).where(eq(schema.term.id, c.req.param("id")));
    return c.json({ ok: true });
  })

  // ----- AI settings -----
  .get("/settings/ai", async (c) => c.json(await getAiSettingsPublic()))
  .put("/settings/ai", async (c) => {
    const body = z
      .object({
        generation: modelChoice.optional(),
        fast: modelChoice.optional(),
        keys: z.record(providerEnum, z.string().nullable()).optional(),
      })
      .parse(await c.req.json());
    await updateAiSettings(body);
    return c.json(await getAiSettingsPublic());
  })
  .post("/settings/ai/validate", async (c) => {
    const body = z.object({ provider: providerEnum, apiKey: z.string().optional() }).parse(await c.req.json());
    return c.json(await validateKey(body.provider, await resolveApiKey(body.provider, body.apiKey)));
  })
  .post("/settings/ai/models", async (c) => {
    const body = z.object({ provider: providerEnum, apiKey: z.string().optional(), refresh: z.boolean().optional() }).parse(await c.req.json());
    try {
      return c.json(await listModels(body.provider, await resolveApiKey(body.provider, body.apiKey), { refresh: body.refresh }));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  })
  .post("/settings/ai/test", async (c) => {
    const body = modelChoice.extend({ apiKey: z.string().optional() }).parse(await c.req.json());
    try {
      const model = body.apiKey ? createModel(body.provider, body.model, body.apiKey) : await getModelFor(body);
      const started = Date.now();
      const { text } = await generateText({ model, prompt: "Reply with exactly: OK", maxOutputTokens: 20 });
      return c.json({ ok: true, reply: text.trim(), ms: Date.now() - started });
    } catch (e) {
      return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  })

  // ----- users -----
  .get("/users", async (c) => {
    const users = await db
      .select({
        id: schema.user.id,
        email: schema.user.email,
        name: schema.user.name,
        nickname: schema.user.nickname,
        role: schema.user.role,
        createdAt: schema.user.createdAt,
        xp: schema.userStats.xp,
        streak: schema.userStats.streak,
      })
      .from(schema.user)
      .leftJoin(schema.userStats, eq(schema.userStats.userId, schema.user.id))
      .orderBy(desc(schema.user.createdAt));
    return c.json(users.map((u) => ({ ...u, envAdmin: env.adminEmails.includes(u.email.toLowerCase()) })));
  })
  .patch("/users/:id", async (c) => {
    const { role } = z.object({ role: z.enum(["user", "admin"]) }).parse(await c.req.json());
    const id = c.req.param("id");
    if (id === c.get("user").id && role !== "admin") return c.json({ error: "CANNOT_DEMOTE_SELF" }, 400);
    await db.update(schema.user).set({ role }).where(eq(schema.user.id, id));
    return c.json({ ok: true });
  });
