// "Luisterles" pipeline: script (generation model, optionally grounded through provider web
// search) → TTS per chapter (Stem role) → MP3 files in UPLOAD_DIR/audio/<lessonId>/<n>.mp3.
// One audio per lesson, shared by every student. Jobs run in-process (like content generation).
import { generateText, Output, type ToolSet } from "ai";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { db, schema } from "../db";
import type { LessonAudioChapter } from "../db/schema";
import { env } from "../env";
import { examplesPrompt, normalizeScript, scriptInstructions, scriptPrompt, scriptSchema, stubScript, type AudioScript } from "./audio-script";
import { getPageText } from "./pipeline";
import { createModel, getRoleConfig, getVoiceConfig, type ModelChoice } from "./providers";
import { aiStubEnabled, isRateLimited, synthesize, type SpeakFn } from "./speech";
import { effectiveVoice } from "./voices";

const AUDIO_ROOT = () => join(env.uploadDir, "audio");
export const audioDir = (lessonId: string) => join(AUDIO_ROOT(), lessonId);
export const chapterPath = (lessonId: string, n: number) => join(audioDir(lessonId), `${n}.mp3`);

const CHAPTER_CONCURRENCY = 2;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- script ----------

/** Real-world examples via the generation provider's web search (Gemini Google Search / OpenAI web search). */
async function groundedExamples(gen: ModelChoice & { apiKey: string | undefined }, p: { code: string; title: string; text: string; language: string }) {
  if (!gen.apiKey) return null;
  let model, tools: ToolSet;
  if (gen.provider === "google") {
    const g = createGoogle({ apiKey: gen.apiKey });
    model = g(gen.model);
    tools = { google_search: g.tools.googleSearch({}) };
  } else if (gen.provider === "openai") {
    const o = createOpenAI({ apiKey: gen.apiKey });
    model = o(gen.model);
    tools = { web_search: o.tools.webSearch({}) };
  } else return null;
  const r = await generateText({ model, tools, prompt: examplesPrompt(p) });
  const text = r.text.trim();
  if (!text) return null;
  const sources = [...new Set(r.sources.flatMap((s) => (s.sourceType === "url" ? [s.url] : [])))];
  return { text, sources };
}

export async function generateScript(l: typeof schema.lesson.$inferSelect, language: string): Promise<AudioScript> {
  if (aiStubEnabled()) return { chapters: normalizeScript({ chapters: stubScript(language) }, language), grounded: false, sources: [] };
  const gen = await getRoleConfig("generation");
  const text = await getPageText(l.readerId, l.startPage, l.endPage);
  let examples: Awaited<ReturnType<typeof groundedExamples>> = null;
  try {
    examples = await groundedExamples(gen, { code: l.code, title: l.title, text, language });
  } catch (e) {
    // Grounding is a bonus: without it the prompt falls back to knowledge-only example rules.
    console.warn(`[audio ${l.code}] grounding failed, using knowledge-only examples:`, errMsg(e));
  }
  const { output } = await generateText({
    model: createModel(gen.provider, gen.model, gen.apiKey),
    instructions: scriptInstructions(language, !!examples),
    prompt: scriptPrompt({ ...l, text, examples: examples?.text }),
    output: Output.object({ schema: scriptSchema }),
  });
  return { chapters: normalizeScript(output, language), grounded: !!examples, sources: examples?.sources ?? [] };
}

// ---------- audio ----------

async function upsertAudio(lessonId: string, data: Partial<typeof schema.lessonAudio.$inferInsert>) {
  const set = { ...data, updatedAt: new Date() };
  await db
    .insert(schema.lessonAudio)
    .values({ lessonId, ...set })
    .onConflictDoUpdate({ target: schema.lessonAudio.lessonId, set });
}

const inFlight = new Set<string>();

export function isAudioInFlight(lessonId: string) {
  return inFlight.has(lessonId);
}

export interface AudioJobDeps {
  script?: typeof generateScript;
  speak?: SpeakFn;
  /** Wait before the per-chapter retry (ms); default 2 s after a 429, else 1 s. */
  retryDelayMs?: (e: unknown) => number;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted || ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/**
 * (Re)generate the audio of one lesson. The previous audio keeps being served until the new
 * set is complete; then the directory is swapped. "ready" only when every chapter exists.
 * The first chapter that fails (after one retry) stops every worker: no further TTS calls,
 * nothing written, and the job only finishes (and leaves `inFlight`) once all workers settled.
 */
export async function generateLessonAudio(lessonId: string, deps: AudioJobDeps = {}) {
  if (inFlight.has(lessonId)) return;
  inFlight.add(lessonId);
  const tmp = join(AUDIO_ROOT(), `.tmp-${lessonId}-${nanoid(6)}`);
  const old = join(AUDIO_ROOT(), `.old-${lessonId}-${nanoid(6)}`);
  try {
    const l = await db.query.lesson.findFirst({ where: eq(schema.lesson.id, lessonId) });
    if (!l) return;
    const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, l.readerId) });
    if (!r) return;
    await upsertAudio(lessonId, { status: "generating", error: null });
    try {
      if (l.status !== "ready") throw new Error("Lesson content is not ready");
      const script = await (deps.script ?? generateScript)(l, r.language);
      const { choice: configured, apiKey } = await getVoiceConfig();
      const choice = effectiveVoice(configured);
      await mkdir(tmp, { recursive: true });

      const ac = new AbortController();
      let failure: unknown = null;
      const chapters: LessonAudioChapter[] = new Array(script.chapters.length);
      const retryDelay = deps.retryDelayMs ?? ((e: unknown) => (isRateLimited(e) ? 2000 : 1000));
      const speakChapter = async (i: number) => {
        const text = script.chapters[i]!.text;
        const opts = { signal: ac.signal, speak: deps.speak };
        try {
          return await synthesize(text, choice, apiKey, r.language, opts);
        } catch (e) {
          if (ac.signal.aborted) throw e;
          console.warn(`[audio ${l.code}] chapter ${i + 1} failed, retrying once:`, errMsg(e));
          await sleep(retryDelay(e), ac.signal);
          ac.signal.throwIfAborted();
          return await synthesize(text, choice, apiKey, r.language, opts);
        }
      };
      let next = 0;
      // Workers never reject: Promise.all only resolves once every one of them has settled.
      await Promise.all(
        Array.from({ length: Math.min(CHAPTER_CONCURRENCY, chapters.length) }, async () => {
          while (!failure && next < chapters.length) {
            const i = next++;
            try {
              const audio = await speakChapter(i);
              if (failure) return; // another chapter failed meanwhile: write nothing more
              await Bun.write(join(tmp, `${i + 1}.mp3`), audio.mp3);
              chapters[i] = { n: i + 1, durationMs: audio.durationMs, bytes: audio.mp3.length };
            } catch (e) {
              if (!failure) {
                failure = new Error(`Chapter ${i + 1}: ${errMsg(e)}`);
                ac.abort();
              }
            }
          }
        }),
      );
      if (failure) throw failure;

      // The lesson may have been deleted (or its reader re-structured) while we were working.
      const now = await db.query.lesson.findFirst({ where: eq(schema.lesson.id, lessonId), columns: { id: true, generatedAt: true } });
      if (!now) return;
      // Swap without a 404 gap: move the old set aside, move the new one in, then delete the old one.
      await rename(audioDir(lessonId), old).catch(() => {});
      await rename(tmp, audioDir(lessonId));
      await upsertAudio(lessonId, {
        status: "ready",
        // Content regenerated while we were speaking the old text → still stale.
        stale: now.generatedAt?.getTime() !== l.generatedAt?.getTime(),
        error: null,
        script,
        chapters,
        provider: aiStubEnabled() && !deps.speak ? "stub" : choice.provider,
        model: aiStubEnabled() && !deps.speak ? "stub" : choice.model,
        voice: choice.voice,
        generatedAt: new Date(),
      });
    } catch (e) {
      console.error(`[audio ${l.code}]`, e);
      await upsertAudio(lessonId, { status: "error", error: errMsg(e) }).catch(() => {});
    }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    await rm(old, { recursive: true, force: true }).catch(() => {});
    inFlight.delete(lessonId);
  }
}

/**
 * Queue audio for a reader's ready lessons: by default only "missing" ones (no audio yet, failed,
 * stale or interrupted); `force` regenerates every selected lesson. Runs in the background,
 * one lesson at a time (chapters in parallel). Returns the queued lesson ids.
 */
export async function queueReaderAudio(readerId: string, opts: { lessonIds?: string[]; force?: boolean } = {}) {
  const lessons = await db
    .select({ id: schema.lesson.id, audio: schema.lessonAudio })
    .from(schema.lesson)
    .leftJoin(schema.lessonAudio, eq(schema.lessonAudio.lessonId, schema.lesson.id))
    .where(
      and(
        eq(schema.lesson.readerId, readerId),
        eq(schema.lesson.status, "ready"),
        opts.lessonIds?.length ? inArray(schema.lesson.id, opts.lessonIds) : undefined,
      ),
    )
    .orderBy(asc(schema.lesson.position));
  const ids = lessons
    .filter((l) => !inFlight.has(l.id) && l.audio?.status !== "pending")
    .filter((l) => opts.force || !l.audio || l.audio.status === "error" || l.audio.stale || !l.audio.chapters.length)
    .map((l) => l.id);
  for (const id of ids) await upsertAudio(id, { status: "pending", error: null });
  void (async () => {
    for (const id of ids) {
      // Another queue may have handled it meanwhile (it is no longer "pending" then).
      const row = await db.query.lessonAudio.findFirst({ where: eq(schema.lessonAudio.lessonId, id), columns: { status: true } });
      if (row?.status === "pending") await generateLessonAudio(id);
    }
  })().catch((e) => console.error("[audio] queue failed", e));
  return ids;
}

// ---------- housekeeping ----------

/** Content was regenerated: the audio no longer matches it (kept playable until regenerated). */
export async function markAudioStale(lessonIds: string[]) {
  if (!lessonIds.length) return;
  await db.update(schema.lessonAudio).set({ stale: true, updatedAt: new Date() }).where(inArray(schema.lessonAudio.lessonId, lessonIds));
}

/** Remove the audio files of lessons that are being deleted (their rows cascade with the lesson). */
export async function deleteAudioFiles(lessonIds: string[]) {
  await Promise.all(lessonIds.map((id) => rm(audioDir(id), { recursive: true, force: true }).catch(() => {})));
}

/** Boot: interrupted jobs become errors; leftover temp dirs and orphaned lesson dirs are removed. */
export async function recoverAudio() {
  await db
    .update(schema.lessonAudio)
    .set({ status: "error", error: "Interrupted by server restart" })
    .where(inArray(schema.lessonAudio.status, ["pending", "generating"]));
  const entries = await readdir(AUDIO_ROOT()).catch(() => [] as string[]);
  if (!entries.length) return;
  const existing = new Set((await db.select({ id: schema.lesson.id }).from(schema.lesson)).map((l) => l.id));
  await Promise.all(
    entries.filter((e) => e.startsWith(".tmp-") || e.startsWith(".old-") || !existing.has(e)).map((e) => rm(join(AUDIO_ROOT(), e), { recursive: true, force: true }).catch(() => {})),
  );
}

// ---------- views ----------

export type AudioRow = typeof schema.lessonAudio.$inferSelect;

const totalMs = (chapters: LessonAudioChapter[]) => chapters.reduce((a, c) => a + c.durationMs, 0);

/** Student view: never the script. "ready" as long as a complete audio set is on disk. */
export function publicAudio(lessonId: string, row: AudioRow | undefined) {
  const chapters = row?.chapters ?? [];
  const v = row?.generatedAt?.getTime() ?? 0;
  return {
    status: chapters.length ? ("ready" as const) : row && (row.status === "pending" || row.status === "generating") ? ("generating" as const) : ("none" as const),
    chapters: chapters.map((c) => ({ n: c.n, durationMs: c.durationMs, url: `/api/lessons/${lessonId}/audio/${c.n}.mp3?v=${v}` })),
    totalMs: totalMs(chapters),
  };
}

/** Admin lessons-list view. */
export function adminAudioSummary(row: Pick<AudioRow, "status" | "stale" | "chapters" | "error" | "generatedAt"> | undefined | null) {
  return {
    status: row?.status ?? ("none" as const),
    stale: row?.stale ?? false,
    chapters: row?.chapters.length ?? 0,
    totalMs: totalMs(row?.chapters ?? []),
    error: row?.error ?? null,
    generatedAt: row?.generatedAt ?? null,
  };
}
