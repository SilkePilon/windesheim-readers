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
import {
  examplesPrompt,
  isUsableScript,
  minIdeasFor,
  minScriptWords,
  normalizeScript,
  ScriptValidationError,
  scriptInstructions,
  scriptPrompt,
  scriptSchema,
  stubScript,
  wordCount,
  type AudioScript,
  type RawScript,
  type ScriptChapter,
} from "./audio-script";
import { getPageText } from "./pipeline";
import { createModel, getRoleConfig, getVoiceConfig, type ModelChoice, type VoiceChoice } from "./providers";
import { aiStubEnabled, defaultRetryDelay, isAuthError, isFatalProviderError, synthesize, type SpeakFn } from "./speech";
import { effectiveVoice } from "./voices";

const AUDIO_ROOT = () => join(env.uploadDir, "audio");
export const audioDir = (lessonId: string) => join(AUDIO_ROOT(), lessonId);
export const chapterPath = (lessonId: string, n: number) => join(audioDir(lessonId), `${n}.mp3`);

const CHAPTER_CONCURRENCY = 2;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- script ----------

/** Real-world examples via the generation provider's web search (Gemini Google Search / OpenAI web search). */
async function groundedExamples(gen: ModelChoice & { apiKey: string | undefined }, p: Parameters<typeof examplesPrompt>[0]) {
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

/**
 * Turn model output into a usable script. An invalid script gets one retry with the validation
 * error appended to the prompt; a valid but short one (under `minScriptWords`) gets one retry
 * with a length note, and if that doesn't help the longer one is kept with a warning.
 * `call` is the (paid) script call; its own errors propagate.
 */
export async function writeScript(
  call: (retryNote: string | null) => Promise<RawScript>,
  o: { language: string; minIdeas: number },
): Promise<{ chapters: ScriptChapter[]; warnings: string[] }> {
  const en = o.language === "en";
  const norm = (raw: RawScript) => normalizeScript(raw, o.language, { minIdeas: o.minIdeas });
  const short = (c: ScriptChapter[]) => wordCount(c) < minScriptWords(c.filter((x) => x.kind === "idea").length);
  let first: ScriptChapter[] | null = null;
  let note: string;
  try {
    first = norm(await call(null));
    if (!short(first)) return { chapters: first, warnings: [] };
    const n = wordCount(first);
    note = en
      ? `the script is too short (${n} spoken words). Aim for 800 to 1,000 words and keep to the word targets per chapter.`
      : `het script is te kort (${n} gesproken woorden). Mik op 800 tot 1000 woorden en houd je aan de woordaantallen per hoofdstuk.`;
  } catch (e) {
    if (first) throw e;
    if (!(e instanceof ScriptValidationError)) throw e;
    note = `${e.message}. ${en ? "Keep exactly the required structure." : "Houd je precies aan de gevraagde opbouw."}`;
  }
  let second: ScriptChapter[];
  try {
    second = norm(await call(note));
  } catch (e) {
    if (!first) throw e instanceof ScriptValidationError ? new Error(`Script still invalid after a retry: ${e.message}`) : e;
    second = first; // keep the valid (short) first attempt
  }
  const best = first && wordCount(first) > wordCount(second) ? first : second;
  const warnings = short(best) ? [`Script is short: ${wordCount(best)} spoken words (target 800-1000)`] : [];
  return { chapters: best, warnings };
}

export type ScriptReader = Pick<typeof schema.reader.$inferSelect, "language" | "title" | "course">;

export async function generateScript(l: typeof schema.lesson.$inferSelect, r: ScriptReader): Promise<AudioScript> {
  const language = r.language;
  if (aiStubEnabled()) return { chapters: normalizeScript({ chapters: stubScript(language) }, language), grounded: false, sources: [] };
  const gen = await getRoleConfig("generation");
  const text = await getPageText(l.readerId, l.startPage, l.endPage);
  const ctx = { readerTitle: r.title, course: r.course };
  let examples: Awaited<ReturnType<typeof groundedExamples>> = null;
  try {
    examples = await groundedExamples(gen, { code: l.code, title: l.title, text, language, ...ctx });
  } catch (e) {
    // Grounding is a bonus: without it the prompt falls back to knowledge-only example rules.
    console.warn(`[audio ${l.code}] grounding failed, using knowledge-only examples:`, errMsg(e));
  }
  const minIdeas = minIdeasFor(l.startPage, l.endPage);
  const call = async (retryNote: string | null) => {
    if (retryNote) console.warn(`[audio ${l.code}] retrying the script: ${retryNote}`);
    const { output } = await generateText({
      model: createModel(gen.provider, gen.model, gen.apiKey),
      instructions: scriptInstructions(language, !!examples),
      prompt: scriptPrompt({ code: l.code, title: l.title, text, examples: examples?.text, language, minIdeas, retryNote, ...ctx }),
      output: Output.object({ schema: scriptSchema }),
    });
    return output;
  };
  const { chapters, warnings } = await writeScript(call, { language, minIdeas });
  for (const w of warnings) console.warn(`[audio ${l.code}] ${w}`);
  return { chapters, grounded: !!examples, sources: examples?.sources ?? [], ...(warnings.length ? { warnings } : {}) };
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
  script?: (l: typeof schema.lesson.$inferSelect, r: ScriptReader) => Promise<AudioScript>;
  speak?: SpeakFn;
  /** Voice role + key (default: AI settings). */
  voiceConfig?: () => Promise<{ choice: VoiceChoice; apiKey: string | undefined }>;
  /** Wait before the per-chapter retry (ms); default `defaultRetryDelay` (Gemini hint or 20-60 s after a 429), 0 under the stub. */
  retryDelayMs?: (e: unknown) => number;
}

export interface AudioJobResult {
  status: "ready" | "error" | "skipped";
  error?: string;
  /** The error will hit every following lesson too (no key, auth, quota): stop the queue. */
  fatal?: boolean;
}

/** A configuration problem found before any paid call. */
class AudioConfigError extends Error {}

/** A chapter failed for good; `reason` is the provider error (for auth/quota classification). */
class ChapterError extends Error {
  constructor(
    message: string,
    readonly reason: unknown,
  ) {
    super(message);
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted || ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

type ScriptSource = NonNullable<AudioScript["source"]>;
const sameSource = (a: ScriptSource | undefined, b: ScriptSource) =>
  !!a && a.generatedAt === b.generatedAt && a.startPage === b.startPage && a.endPage === b.endPage && a.language === b.language;

/**
 * (Re)generate the audio of one lesson. The previous audio keeps being served until the new
 * set is complete; then the directory is swapped. "ready" only when every chapter exists.
 * The voice key is checked before any paid call. The script is stored before the TTS step and
 * reused by the next attempt while the lesson is unchanged, so a TTS failure doesn't pay for a
 * second script. The first chapter that fails (after one retry) stops every worker: no further
 * TTS calls, nothing written, and the job only finishes (and leaves `inFlight`) once all workers settled.
 */
export async function generateLessonAudio(lessonId: string, deps: AudioJobDeps = {}): Promise<AudioJobResult> {
  if (inFlight.has(lessonId)) return { status: "skipped" };
  inFlight.add(lessonId);
  const tmp = join(AUDIO_ROOT(), `.tmp-${lessonId}-${nanoid(6)}`);
  const old = join(AUDIO_ROOT(), `.old-${lessonId}-${nanoid(6)}`);
  try {
    const l = await db.query.lesson.findFirst({ where: eq(schema.lesson.id, lessonId) });
    if (!l) return { status: "skipped" };
    const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, l.readerId) });
    if (!r) return { status: "skipped" };
    await upsertAudio(lessonId, { status: "generating", error: null });
    try {
      if (l.status !== "ready") throw new Error("Lesson content is not ready");
      // Cost guard: without a usable voice key every TTS call fails, so don't pay for a script first.
      const { choice: configured, apiKey } = await (deps.voiceConfig ?? getVoiceConfig)();
      const choice = effectiveVoice(configured);
      const stub = aiStubEnabled() && !deps.speak;
      if (!apiKey && !stub) throw new AudioConfigError(`No API key for the voice provider "${choice.provider}" (Stem role); add one in the AI settings`);

      const source: ScriptSource = { generatedAt: l.generatedAt?.getTime() ?? null, startPage: l.startPage, endPage: l.endPage, language: r.language };
      const minIdeas = minIdeasFor(l.startPage, l.endPage);
      const prev = (await db.query.lessonAudio.findFirst({ where: eq(schema.lessonAudio.lessonId, lessonId), columns: { script: true } }))?.script;
      let script: AudioScript;
      if (prev && prev.spoken === false && sameSource(prev.source, source) && isUsableScript(prev.chapters, minIdeas)) {
        console.info(`[audio ${l.code}] reusing the stored script from the failed attempt`);
        script = prev;
      } else {
        script = { ...(await (deps.script ?? generateScript)(l, r)), source, spoken: false };
        await upsertAudio(lessonId, { script });
      }
      await mkdir(tmp, { recursive: true });

      const ac = new AbortController();
      let failure: ChapterError | null = null;
      const chapters: LessonAudioChapter[] = new Array(script.chapters.length);
      const models = new Set<string>();
      const retryDelay = deps.retryDelayMs ?? (stub ? () => 0 : defaultRetryDelay);
      const speakChapter = async (i: number) => {
        const text = script.chapters[i]!.text;
        const opts = { signal: ac.signal, speak: deps.speak };
        try {
          return await synthesize(text, choice, apiKey, r.language, opts);
        } catch (e) {
          if (ac.signal.aborted || isAuthError(e)) throw e; // a bad key won't get better
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
              models.add(audio.model);
            } catch (e) {
              if (!failure) {
                failure = new ChapterError(`Chapter ${i + 1}: ${errMsg(e)}`, e);
                ac.abort();
              }
            }
          }
        }),
      );
      if (failure) throw failure;

      // The lesson may have been deleted (or its reader re-structured) while we were working.
      const now = await db.query.lesson.findFirst({
        where: eq(schema.lesson.id, lessonId),
        columns: { id: true, generatedAt: true, startPage: true, endPage: true },
      });
      if (!now) return { status: "skipped" };
      // Swap without a 404 gap: move the old set aside, move the new one in, then delete the old one.
      await rename(audioDir(lessonId), old).catch(() => {});
      await rename(tmp, audioDir(lessonId));
      await upsertAudio(lessonId, {
        status: "ready",
        // Content regenerated or pages changed while we were speaking the old text → still stale.
        stale: now.generatedAt?.getTime() !== l.generatedAt?.getTime() || now.startPage !== l.startPage || now.endPage !== l.endPage,
        error: null,
        script: { ...script, spoken: true },
        chapters,
        provider: stub ? "stub" : choice.provider,
        model: stub ? "stub" : [...models].join(", ") || choice.model,
        voice: choice.voice,
        generatedAt: new Date(),
      });
      return { status: "ready" };
    } catch (e) {
      const cause = e instanceof ChapterError ? e.reason : e;
      const message = errMsg(e);
      console.error(`[audio ${l.code}]`, e);
      await upsertAudio(lessonId, { status: "error", error: message }).catch(() => {});
      return { status: "error", error: message, fatal: cause instanceof AudioConfigError || isFatalProviderError(cause) };
    }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    await rm(old, { recursive: true, force: true }).catch(() => {});
    inFlight.delete(lessonId);
  }
}

/**
 * One queue for every audio job (bulk "Genereer audio" and per-lesson "Opnieuw" from any
 * reader): batches run strictly one after another, so at most CHAPTER_CONCURRENCY TTS calls
 * are in flight at any time.
 */
let audioQueue: Promise<void> = Promise.resolve();

/** Resolves once every queued audio job so far has finished (tests). */
export function audioQueueIdle() {
  return audioQueue;
}

/** Lessons of a batch that never got to run become errors (re-queueable, no endless polling). */
async function failWaiting(ids: string[], error: string) {
  const waiting = ids.filter((id) => !inFlight.has(id));
  if (!waiting.length) return;
  await db
    .update(schema.lessonAudio)
    .set({ status: "error", error, updatedAt: new Date() })
    .where(and(inArray(schema.lessonAudio.lessonId, waiting), inArray(schema.lessonAudio.status, ["pending", "generating"])));
}

async function runBatch(ids: string[], deps: AudioJobDeps) {
  let i = 0;
  try {
    for (; i < ids.length; i++) {
      const id = ids[i]!;
      // Another queue may have handled it meanwhile (it is no longer "pending" then).
      const row = await db.query.lessonAudio.findFirst({ where: eq(schema.lessonAudio.lessonId, id), columns: { status: true } });
      if (row?.status !== "pending") continue;
      const res = await generateLessonAudio(id, deps);
      if (res.status === "error" && res.fatal) {
        // Every next lesson would fail the same way (and pay for its script first): stop here.
        await failWaiting(ids.slice(i + 1), `Not generated: an earlier lesson failed with: ${res.error}`);
        return;
      }
    }
  } catch (e) {
    await failWaiting(ids.slice(i), `Audio queue failed: ${errMsg(e)}`).catch(() => {});
    throw e;
  }
}

/**
 * Queue audio for a reader's ready lessons: by default only "missing" ones (no audio yet, failed,
 * stale or interrupted); `force` regenerates every selected lesson. Runs in the background on the
 * global audio queue, one lesson at a time (chapters in parallel). Returns the queued lesson ids.
 */
export async function queueReaderAudio(readerId: string, opts: { lessonIds?: string[]; force?: boolean; deps?: AudioJobDeps } = {}) {
  const lessons = await db
    .select({ id: schema.lesson.id, status: schema.lessonAudio.status, stale: schema.lessonAudio.stale, chapters: schema.lessonAudio.chapters })
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
    .filter((l) => !inFlight.has(l.id) && l.status !== "pending")
    .filter((l) => opts.force || !l.status || l.status === "error" || l.stale || !l.chapters?.length)
    .map((l) => l.id);
  for (const id of ids) await upsertAudio(id, { status: "pending", error: null });
  if (ids.length) {
    const deps = opts.deps ?? {};
    audioQueue = audioQueue.then(() => runBatch(ids, deps)).catch((e) => console.error("[audio] queue failed", e));
  }
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

/**
 * Boot: interrupted jobs become errors; a lesson whose swap was cut short (only `.old-<id>-*` left)
 * gets its previous audio back; leftover temp dirs and orphaned lesson dirs are removed.
 */
export async function recoverAudio() {
  await db
    .update(schema.lessonAudio)
    .set({ status: "error", error: "Interrupted by server restart" })
    .where(inArray(schema.lessonAudio.status, ["pending", "generating"]));
  const entries = await readdir(AUDIO_ROOT()).catch(() => [] as string[]);
  if (!entries.length) return;
  const existing = new Set((await db.select({ id: schema.lesson.id }).from(schema.lesson)).map((l) => l.id));
  const present = new Set(entries);
  for (const e of entries) {
    if (!e.startsWith(".old-") || e.length <= ".old-".length + 7) continue;
    const id = e.slice(".old-".length, -7); // ".old-<lessonId>-<6-char nanoid>"
    if (present.has(id) || !existing.has(id)) continue;
    try {
      await rename(join(AUDIO_ROOT(), e), audioDir(id));
      present.add(id);
      present.delete(e);
    } catch (err) {
      console.warn(`[audio] could not restore ${e}:`, errMsg(err));
    }
  }
  await Promise.all(
    [...present]
      .filter((e) => e.startsWith(".tmp-") || e.startsWith(".old-") || !existing.has(e))
      .map((e) => rm(join(AUDIO_ROOT(), e), { recursive: true, force: true }).catch(() => {})),
  );
}

// ---------- views ----------

export type AudioRow = typeof schema.lessonAudio.$inferSelect;

/** Columns the student endpoints need (never the script JSON). */
export const PUBLIC_AUDIO_COLUMNS = { status: true, chapters: true, generatedAt: true } as const;

const totalMs = (chapters: LessonAudioChapter[]) => chapters.reduce((a, c) => a + c.durationMs, 0);

/** Student view: never the script. "ready" as long as a complete audio set is on disk. */
export function publicAudio(lessonId: string, row: Pick<AudioRow, "status" | "chapters" | "generatedAt"> | undefined) {
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
