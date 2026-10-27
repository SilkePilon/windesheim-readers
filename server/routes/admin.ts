import { Hono } from "hono";
import { LIMITS } from "../../shared/limits";
import { and, asc, count, desc, eq, getTableColumns, inArray, isNull, notInArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { generateText } from "ai";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { db, schema } from "../db";
import { limits } from "../limits";
import { getAiLimitSettings, setAiDailyLimits } from "../lib/ai-quota";
import { env } from "../env";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { extractAndStructure, extractPdf, generateReader, proposeStructure } from "../ai/pipeline";
import { retryAction } from "../ai/retry";
import { createModel, getAiSettingsPublic, getModelFor, resolveApiKey, updateAiSettings } from "../ai/providers";
import { listModels, validateKey } from "../ai/models";
import { adminAudioSummary, deleteAudioFiles, isAudioInFlight, markAudioStale, publicAudio, queueReaderAudio } from "../ai/audio";
import { synthesize, voiceSampleText } from "../ai/speech";
import { voiceProblem, VOICES, voicesFor } from "../ai/voices";
import { backfillBadges } from "../lib/badges";
import * as input from "../lib/input";

const MAX_UPLOAD = 50 * 1024 * 1024;
const pdfPath = (id: string) => join(env.uploadDir, `${id}.pdf`);

/** AI settings for the admin page, plus the usage limits that live next to them. */
const aiSettingsView = async () => ({ ...(await getAiSettingsPublic()), ...getAiLimitSettings() });

export const admin = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)

  /** Re-run the (idempotent, silent) badge backfill for every user; normally runs once at start. */
  .post("/badges/backfill", limits.adminJobs, async (c) => c.json(await backfillBadges({ force: true })))

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

  .post("/readers", limits.adminJobs, async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: "NO_FILE" }, 400);
    if (file.size > MAX_UPLOAD) return c.json({ error: "FILE_TOO_LARGE" }, 400);
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf")
      return c.json({ error: "NOT_A_PDF" }, 400);
    const fields = input.uploadFields.parse({
      title: typeof body.title === "string" ? body.title : undefined,
      course: typeof body.course === "string" ? body.course : undefined,
    });

    const id = nanoid();
    const bytes = new Uint8Array(await file.arrayBuffer());
    await mkdir(env.uploadDir, { recursive: true });
    await Bun.write(pdfPath(id), bytes);
    await db.insert(schema.reader).values({
      id,
      title: fields.title || file.name.replace(/\.pdf$/i, "").trim().slice(0, LIMITS.readerTitle.max) || "Reader",
      course: fields.course || null,
      fileName: file.name.slice(0, 255),
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
    const { script: _script, ...audioCols } = getTableColumns(schema.lessonAudio);
    const audio = ids.length ? await db.select(audioCols).from(schema.lessonAudio).where(inArray(schema.lessonAudio.lessonId, ids)) : [];
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
        audio: adminAudioSummary(audio.find((a) => a.lessonId === l.id)),
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
    const body = input.patchReader.parse(await c.req.json());
    await db.update(schema.reader).set(body).where(eq(schema.reader.id, c.req.param("id")));
    return c.json({ ok: true });
  })

  .delete("/readers/:id", async (c) => {
    const id = c.req.param("id");
    const lessonIds = (await db.select({ id: schema.lesson.id }).from(schema.lesson).where(eq(schema.lesson.readerId, id))).map((l) => l.id);
    await db.delete(schema.reader).where(eq(schema.reader.id, id));
    await unlink(pdfPath(id)).catch(() => {});
    await deleteAudioFiles(lessonIds);
    return c.json({ ok: true });
  })

  .post("/readers/:id/retry", limits.adminJobs, async (c) => {
    const id = c.req.param("id");
    const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, id) });
    if (!r) return c.json({ error: "NOT_FOUND" }, 404);
    const lessons = await db
      .select({ id: schema.lesson.id, status: schema.lesson.status })
      .from(schema.lesson)
      .where(eq(schema.lesson.readerId, id));
    const action = retryAction(r, lessons);
    if (action.kind === "none") return c.json({ action: action.kind });
    // Claim atomically: only the request that still sees the state we decided on starts a job,
    // so two simultaneous retries can't both run.
    const claimed = await db
      .update(schema.reader)
      .set({ status: action.kind === "extract" ? "extracting" : "generating", error: null })
      .where(
        and(
          eq(schema.reader.id, id),
          eq(schema.reader.status, r.status),
          r.error === null ? isNull(schema.reader.error) : eq(schema.reader.error, r.error),
        ),
      )
      .returning({ id: schema.reader.id });
    if (!claimed.length) return c.json({ action: "none" });
    if (action.kind === "extract") {
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

  .post("/readers/:id/restructure", limits.adminJobs, async (c) => {
    void proposeStructure(c.req.param("id"));
    return c.json({ ok: true });
  })

  /** Replace the lesson list. Lessons with an existing id keep their generated content. */
  .put("/readers/:id/lessons", async (c) => {
    const readerId = c.req.param("id");
    const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, readerId) });
    if (!r) return c.json({ error: "NOT_FOUND" }, 404);
    const lessons = input.lessonList.parse(await c.req.json());

    const before = await db
      .select({ id: schema.lesson.id, startPage: schema.lesson.startPage, endPage: schema.lesson.endPage })
      .from(schema.lesson)
      .where(eq(schema.lesson.readerId, readerId));
    const existing = new Set(before.map((l) => l.id));
    const keep: string[] = [];
    const moved: string[] = [];
    await db.transaction(async (tx) => {
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
          const old = before.find((b) => b.id === l.id)!;
          if (old.startPage !== data.startPage || old.endPage !== data.endPage) moved.push(l.id);
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
    await deleteAudioFiles(before.map((b) => b.id).filter((id) => !keep.includes(id)));
    await markAudioStale(moved); // other pages → the spoken summary no longer matches
    if (r.status === "structuring" || r.status === "error")
      await db.update(schema.reader).set({ status: "review", error: null }).where(eq(schema.reader.id, readerId));
    return c.json({ ok: true });
  })

  .post("/readers/:id/generate", limits.adminJobs, async (c) => {
    const { lessonIds } = input.lessonIdsBody.parse(await c.req.json().catch(() => ({})));
    void generateReader(c.req.param("id"), lessonIds);
    return c.json({ ok: true });
  })

  // ----- luisterles (audio summary) -----
  /** Queue audio for the reader's ready lessons: missing/failed/stale only, or all selected with `force`. */
  .post("/readers/:id/audio", limits.adminJobs, async (c) => {
    const id = c.req.param("id");
    const body = input.readerAudio.parse(await c.req.json().catch(() => ({})));
    if (!(await db.query.reader.findFirst({ where: eq(schema.reader.id, id), columns: { id: true } }))) return c.json({ error: "NOT_FOUND" }, 404);
    const lessonIds = await queueReaderAudio(id, body);
    return c.json({ queued: lessonIds.length, lessonIds });
  })
  /** Regenerate one lesson's audio ("Opnieuw"). */
  .post("/lessons/:id/audio", limits.adminJobs, async (c) => {
    const id = c.req.param("id");
    const l = await db.query.lesson.findFirst({ where: eq(schema.lesson.id, id) });
    if (!l) return c.json({ error: "NOT_FOUND" }, 404);
    if (l.status !== "ready") return c.json({ error: "LESSON_NOT_READY" }, 409);
    const ids = await queueReaderAudio(l.readerId, { lessonIds: [id], force: true });
    if (!ids.length) return c.json({ error: "ALREADY_RUNNING" }, 409);
    return c.json({ ok: true });
  })
  /** Admin detail incl. the internal script (quality control). */
  .get("/lessons/:id/audio", async (c) => {
    const id = c.req.param("id");
    if (!(await db.query.lesson.findFirst({ where: eq(schema.lesson.id, id), columns: { id: true } }))) return c.json({ error: "NOT_FOUND" }, 404);
    const row = await db.query.lessonAudio.findFirst({ where: eq(schema.lessonAudio.lessonId, id) });
    return c.json({
      ...adminAudioSummary(row),
      running: isAudioInFlight(id),
      provider: row?.provider ?? null,
      model: row?.model ?? null,
      voice: row?.voice ?? null,
      chapterList: publicAudio(id, row).chapters,
      script: row?.script ?? null,
    });
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
    const body = input.patchLesson.parse(await c.req.json());
    await db.update(schema.lesson).set(body).where(eq(schema.lesson.id, c.req.param("id")));
    return c.json({ ok: true });
  })
  .patch("/flashcards/:id", async (c) => {
    const body = input.patchFlashcard.parse(await c.req.json());
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
  .get("/settings/ai", async (c) => c.json(await aiSettingsView()))
  .put("/settings/ai", async (c) => {
    const body = input.aiSettings.parse(await c.req.json());
    const bad = body.voice && voiceProblem(body.voice);
    if (bad) return c.json({ error: "INVALID_VOICE", message: bad, validVoices: voicesFor(body.voice!.provider, body.voice!.model).map((v) => v.id) }, 400);
    const { tutorDailyLimit, explainDailyLimit, gradeDailyLimit, ...ai } = body;
    await updateAiSettings(ai);
    setAiDailyLimits({ tutor: tutorDailyLimit, explain: explainDailyLimit, grade: gradeDailyLimit });
    return c.json(await aiSettingsView());
  })
  .post("/settings/ai/validate", limits.adminAi, async (c) => {
    const body = input.validateKey.parse(await c.req.json());
    return c.json(await validateKey(body.provider, await resolveApiKey(body.provider, body.apiKey)));
  })
  .post("/settings/ai/models", limits.adminAi, async (c) => {
    const body = input.listModels.parse(await c.req.json());
    try {
      return c.json(await listModels(body.provider, await resolveApiKey(body.provider, body.apiKey), { refresh: body.refresh }));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  })
  /** Voice catalogue for the "Stem" role, per provider. */
  .get("/settings/ai/voices", (c) => c.json(VOICES))
  /** Live list of the provider's speech (TTS) models. */
  .post("/settings/ai/voice/models", limits.adminAi, async (c) => {
    const body = input.listVoiceModels.parse(await c.req.json());
    try {
      return c.json(await listModels(body.provider, await resolveApiKey(body.provider, body.apiKey), { refresh: body.refresh, kind: "speech" }));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  })
  /** "Probeer stem": a short MP3 sample with the given (unsaved) voice settings. */
  .post("/settings/ai/voice/sample", limits.adminAi, async (c) => {
    const body = input.voiceSample.parse(await c.req.json());
    const bad = voiceProblem(body);
    if (bad) return c.json({ error: "INVALID_VOICE", message: bad, validVoices: voicesFor(body.provider, body.model).map((v) => v.id) }, 400);
    try {
      const language = body.language ?? "nl";
      const { mp3 } = await synthesize(voiceSampleText(language), body, await resolveApiKey(body.provider, body.apiKey), language);
      return new Response(mp3 as Uint8Array<ArrayBuffer>, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  })
  .post("/settings/ai/test", limits.adminAi, async (c) => {
    const body = input.testModel.parse(await c.req.json());
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
    const { role } = input.patchUser.parse(await c.req.json());
    const id = c.req.param("id");
    if (id === c.get("user").id && role !== "admin") return c.json({ error: "CANNOT_DEMOTE_SELF" }, 400);
    await db.update(schema.user).set({ role }).where(eq(schema.user.id, id));
    return c.json({ ok: true });
  });
