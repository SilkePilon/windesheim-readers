// Weekly audio episodes ("afleveringen"): one spoken story per reader week, shared by every
// student. Script (generation model) → TTS per chapter (Stem role) → MP3 files in
// UPLOAD_DIR/audio/episodes/<readerId>/<week>/<n>.mp3. Jobs run on the global audio queue.
import { generateText, Output } from "ai";
import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { db, schema } from "../db";
import type { LessonAudioChapter } from "../db/schema";
import {
  audioFailure,
  audioRoot,
  claimAudioJob,
  enqueueAudioJobs,
  EPISODES_DIR,
  episodeKey,
  isAudioInFlight,
  releaseAudioJob,
  resolveVoice,
  speakChapters,
  swapAudioDir,
  type AudioJobDeps,
  type AudioJobResult,
} from "./audio";
import {
  EpisodeValidationError,
  episodeInstructions,
  episodeMaterial,
  episodePrompt,
  episodeScriptSchema,
  episodeWordCount,
  EPISODE_WORDS,
  MIN_EPISODE_WORDS,
  normalizeEpisodeScript,
  stubEpisodeScript,
  type EpisodeScript,
  type EpisodeSource,
} from "./episode-script";
import { getPageText } from "./pipeline";
import { createModel, getRoleConfig } from "./providers";
import { aiStubEnabled } from "./speech";

const episodesRoot = () => join(audioRoot(), EPISODES_DIR);
/** A reader id that is safe as one path segment (ids are nanoids); anything else never reaches the file system. */
const SAFE_ID = /^[\w-]+$/;
function readerFolder(readerId: string) {
  if (!SAFE_ID.test(readerId)) throw new Error("Invalid reader id");
  return join(episodesRoot(), readerId);
}
export const episodeDir = (readerId: string, week: number) => {
  if (!Number.isSafeInteger(week) || week < 1) throw new Error("Invalid week");
  return join(readerFolder(readerId), String(week));
};
export const episodeChapterPath = (readerId: string, week: number, n: number) => join(episodeDir(readerId, week), `${n}.mp3`);

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const episodeWhere = (readerId: string, week: number) => and(eq(schema.readerEpisode.readerId, readerId), eq(schema.readerEpisode.week, week));

export type EpisodeRow = typeof schema.readerEpisode.$inferSelect;
export type EpisodeLesson = { id: string; generatedAt: Date | null; startPage: number; endPage: number };

/** The ready lessons of one week, in reading order. */
export function weekLessons(readerId: string, week: number) {
  return db
    .select()
    .from(schema.lesson)
    .where(and(eq(schema.lesson.readerId, readerId), eq(schema.lesson.week, week), eq(schema.lesson.status, "ready")))
    .orderBy(asc(schema.lesson.position));
}

/** Every week of the reader that has at least one ready lesson, ascending. */
export async function readyWeeks(readerId: string) {
  const rows = await db
    .selectDistinct({ week: schema.lesson.week })
    .from(schema.lesson)
    .where(and(eq(schema.lesson.readerId, readerId), eq(schema.lesson.status, "ready")));
  return rows.map((r) => r.week).sort((a, b) => a - b);
}

export const episodeSnapshot = (lessons: EpisodeLesson[]): EpisodeSource =>
  lessons.map((l) => ({ lessonId: l.id, generatedAt: l.generatedAt?.getTime() ?? null, startPage: l.startPage, endPage: l.endPage }));

const sameSnapshot = (a: EpisodeSource | null | undefined, b: EpisodeSource) => {
  if (!a || a.length !== b.length) return false;
  const byId = new Map(a.map((s) => [s.lessonId, s]));
  return b.every((s) => {
    const o = byId.get(s.lessonId);
    return !!o && o.generatedAt === s.generatedAt && o.startPage === s.startPage && o.endPage === s.endPage;
  });
};

/**
 * The week's lessons changed since the episode was made: another set of lessons, or a lesson
 * regenerated or moved to other pages. An episode that was never made is not stale.
 */
export function episodeIsStale(row: Pick<EpisodeRow, "sourceSnapshot"> | null | undefined, currentLessons: EpisodeLesson[]) {
  if (!row?.sourceSnapshot) return false;
  return !sameSnapshot(row.sourceSnapshot, episodeSnapshot(currentLessons));
}

// ---------- script ----------

/** Write the script of one week's episode, grounded in its ready lessons (stub under AI_STUB=1). */
export async function generateEpisodeScript(readerId: string, week: number): Promise<EpisodeScript> {
  const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, readerId) });
  if (!r) throw new Error("Reader not found");
  const lessons = await weekLessons(readerId, week);
  if (!lessons.length) throw new Error(`Week ${week} has no ready lessons`);
  const language = r.language;
  if (aiStubEnabled()) return stubEpisodeScript(week, lessons, language);

  const terms = await db
    .select({ lessonId: schema.term.lessonId, term: schema.term.term, definition: schema.term.definition })
    .from(schema.term)
    .where(inArray(schema.term.lessonId, lessons.map((l) => l.id)));
  const inputs = await Promise.all(
    lessons.map(async (l) => ({
      code: l.code,
      title: l.title,
      summary: l.summary,
      keyPoints: l.keyPoints,
      terms: terms.filter((t) => t.lessonId === l.id),
      text: await getPageText(readerId, l.startPage, l.endPage),
    })),
  );
  const material = episodeMaterial(inputs, language);
  const gen = await getRoleConfig("generation");
  const label = `[episode ${readerId} w${week}]`;
  const call = async (retryNote: string | null) => {
    if (retryNote) console.warn(`${label} retrying the script: ${retryNote}`);
    const { output } = await generateText({
      model: createModel(gen.provider, gen.model, gen.apiKey),
      instructions: episodeInstructions(language, lessons.length),
      prompt: episodePrompt({ week, lessons, material, language, readerTitle: r.title, course: r.course, retryNote }),
      output: Output.object({ schema: episodeScriptSchema }),
    });
    return normalizeEpisodeScript(output, language, lessons.length);
  };

  // Like writeScript for lessons: one retry for an invalid script, one for a short one (keep the longer).
  const en = language === "en";
  let first: EpisodeScript | null = null;
  let note: string;
  try {
    first = await call(null);
    if (episodeWordCount(first) >= MIN_EPISODE_WORDS) return first;
    note = en
      ? `the script is too short (${episodeWordCount(first)} spoken words). Aim for ${EPISODE_WORDS[0]} to ${EPISODE_WORDS[1]} words.`
      : `het script is te kort (${episodeWordCount(first)} gesproken woorden). Mik op ${EPISODE_WORDS[0]} tot ${EPISODE_WORDS[1]} woorden.`;
  } catch (e) {
    if (!(e instanceof EpisodeValidationError)) throw e;
    note = `${e.message}. ${en ? "Keep exactly the required structure." : "Houd je precies aan de gevraagde opbouw."}`;
  }
  let second: EpisodeScript;
  try {
    second = await call(note);
  } catch (e) {
    if (!first) throw e instanceof EpisodeValidationError ? new Error(`Episode script still invalid after a retry: ${e.message}`) : e;
    second = first;
  }
  const best = first && episodeWordCount(first) > episodeWordCount(second) ? first : second;
  if (episodeWordCount(best) < MIN_EPISODE_WORDS) console.warn(`${label} script is short: ${episodeWordCount(best)} spoken words`);
  return best;
}

// ---------- audio ----------

async function upsertEpisode(readerId: string, week: number, data: Partial<typeof schema.readerEpisode.$inferInsert>) {
  await db
    .insert(schema.readerEpisode)
    .values({ readerId, week, ...data })
    .onConflictDoUpdate({ target: [schema.readerEpisode.readerId, schema.readerEpisode.week], set: data });
}

const usableStored = (s: EpisodeScript | null | undefined, lessons: number): s is EpisodeScript =>
  !!s && Array.isArray(s.chapters) && s.chapters.filter((c) => c.kind === "lesson").length === lessons && s.chapters.every((c) => c.text?.trim());

/**
 * (Re)generate one week's episode, like `generateLessonAudio`: in-flight guard, voice key checked
 * before any paid call, the script stored (and reused by a retry while the week is unchanged),
 * chapters spoken two at a time with one retry, and the directory swapped in once complete.
 */
export async function generateEpisode(readerId: string, week: number, deps: AudioJobDeps = {}): Promise<AudioJobResult> {
  const key = episodeKey(readerId, week);
  if (!SAFE_ID.test(readerId) || !claimAudioJob(key)) return { status: "skipped" };
  const parent = readerFolder(readerId);
  const tmp = join(parent, `.tmp-${week}-${nanoid(6)}`);
  const old = join(parent, `.old-${week}-${nanoid(6)}`);
  const label = `episode ${readerId} w${week}`;
  try {
    const r = await db.query.reader.findFirst({ where: eq(schema.reader.id, readerId), columns: { id: true, language: true } });
    if (!r) return { status: "skipped" };
    await upsertEpisode(readerId, week, { status: "generating", error: null });
    try {
      const lessons = await weekLessons(readerId, week);
      if (!lessons.length) throw new Error(`Week ${week} has no ready lessons`);
      const voice = await resolveVoice(deps);
      const { choice, stub } = voice;

      const source = episodeSnapshot(lessons);
      const prev = (await db.query.readerEpisode.findFirst({ where: episodeWhere(readerId, week), columns: { script: true } }))?.script;
      let script: EpisodeScript;
      if (prev && prev.spoken === false && sameSnapshot(prev.source, source) && usableStored(prev, lessons.length)) {
        console.info(`[${label}] reusing the stored script from the failed attempt`);
        script = prev;
      } else {
        script = { ...(await (deps.episodeScript ?? generateEpisodeScript)(readerId, week)), source, spoken: false };
        await upsertEpisode(readerId, week, { script });
      }
      await mkdir(tmp, { recursive: true });
      const { chapters, models } = await speakChapters(
        script.chapters.map((c) => c.text),
        { voice, language: r.language, deps, dir: tmp, label },
      );

      // The reader may have been deleted (or the episode removed by an admin) meanwhile.
      if (!(await db.query.reader.findFirst({ where: eq(schema.reader.id, readerId), columns: { id: true } }))) return { status: "skipped" };
      if (!(await db.query.readerEpisode.findFirst({ where: episodeWhere(readerId, week), columns: { week: true } }))) return { status: "skipped" };
      await mkdir(parent, { recursive: true });
      await swapAudioDir(tmp, episodeDir(readerId, week), old);
      await upsertEpisode(readerId, week, {
        status: "ready",
        error: null,
        title: script.title,
        script: { ...script, spoken: true },
        chapters,
        provider: stub ? "stub" : choice.provider,
        model: stub ? "stub" : [...models].join(", ") || choice.model,
        voice: choice.voice,
        generatedAt: new Date(),
        // Staleness is computed on read against this snapshot (lessons changed meanwhile → stale).
        sourceSnapshot: source,
      });
      return { status: "ready" };
    } catch (e) {
      const { message, fatal } = audioFailure(e);
      console.error(`[${label}]`, e);
      await db.update(schema.readerEpisode).set({ status: "error", error: message }).where(episodeWhere(readerId, week)).catch(() => {});
      return { status: "error", error: message, fatal };
    }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    await rm(old, { recursive: true, force: true }).catch(() => {});
    releaseAudioJob(key);
  }
}

/**
 * Queue episodes for a reader's weeks with ready lessons: by default only "missing" ones (none
 * yet, failed, stale or interrupted); `force` regenerates every selected week. Runs on the global
 * audio queue, one job at a time. Returns the queued weeks.
 */
export async function queueReaderEpisodes(readerId: string, opts: { weeks?: number[]; force?: boolean; deps?: AudioJobDeps } = {}) {
  const weeks = (await readyWeeks(readerId)).filter((w) => !opts.weeks || opts.weeks.includes(w));
  const rows = await db.select().from(schema.readerEpisode).where(eq(schema.readerEpisode.readerId, readerId));
  const queued: number[] = [];
  for (const week of weeks) {
    if (isAudioInFlight(episodeKey(readerId, week))) continue;
    const row = rows.find((x) => x.week === week);
    if (row?.status === "pending") continue;
    const missing = !row || row.status === "error" || !row.chapters.length || episodeIsStale(row, await weekLessons(readerId, week));
    if (!opts.force && !missing) continue;
    queued.push(week);
  }
  for (const week of queued) await upsertEpisode(readerId, week, { status: "pending", error: null });
  enqueueAudioJobs(
    queued.map((week) => ({ kind: "episode", readerId, week })),
    opts.deps,
  );
  return queued;
}

// ---------- housekeeping ----------

/** Remove one episode (row and files). */
export async function deleteEpisode(readerId: string, week: number) {
  await db.delete(schema.readerEpisode).where(episodeWhere(readerId, week));
  await rm(episodeDir(readerId, week), { recursive: true, force: true }).catch(() => {});
}

/** Remove every episode file of a reader that is being deleted (its rows cascade with the reader). */
export async function deleteReaderEpisodeFiles(readerId: string) {
  await rm(readerFolder(readerId), { recursive: true, force: true }).catch(() => {});
}

/**
 * Boot (called from `recoverAudio`): a week whose swap was cut short (only `.old-<week>-*` left)
 * gets its previous audio back; leftover temp dirs and the folders of deleted readers are removed.
 */
export async function recoverEpisodeFiles() {
  const readers = await readdir(episodesRoot()).catch(() => [] as string[]);
  if (!readers.length) return;
  const existing = new Set((await db.select({ id: schema.reader.id }).from(schema.reader)).map((r) => r.id));
  for (const readerId of readers) {
    const dir = join(episodesRoot(), readerId);
    if (!existing.has(readerId)) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      continue;
    }
    const entries = await readdir(dir).catch(() => [] as string[]);
    const present = new Set(entries);
    for (const e of entries) {
      const m = /^\.old-(\d+)-.{6}$/.exec(e);
      if (!m || present.has(m[1]!)) continue;
      try {
        await rename(join(dir, e), join(dir, m[1]!));
        present.add(m[1]!);
        present.delete(e);
      } catch (err) {
        console.warn(`[episode] could not restore ${readerId}/${e}:`, errMsg(err));
      }
    }
    await Promise.all(
      [...present].filter((e) => e.startsWith(".")).map((e) => rm(join(dir, e), { recursive: true, force: true }).catch(() => {})),
    );
  }
}

// ---------- views ----------

const totalMs = (chapters: LessonAudioChapter[]) => chapters.reduce((a, c) => a + c.durationMs, 0);

/** Admin list: one entry per week with ready lessons. */
export async function adminEpisodeList(readerId: string) {
  const weeks = await readyWeeks(readerId);
  const rows = await db.select().from(schema.readerEpisode).where(eq(schema.readerEpisode.readerId, readerId));
  return Promise.all(
    weeks.map(async (week) => {
      const row = rows.find((x) => x.week === week);
      return {
        week,
        status: row?.status ?? ("none" as const),
        title: row?.title ?? null,
        stale: row ? episodeIsStale(row, await weekLessons(readerId, week)) : false,
        durationSec: Math.round(totalMs(row?.chapters ?? []) / 1000),
        error: row?.error ?? null,
        running: isAudioInFlight(episodeKey(readerId, week)),
      };
    }),
  );
}
