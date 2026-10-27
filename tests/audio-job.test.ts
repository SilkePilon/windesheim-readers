// Luisterles job runner against the throwaway DB (tests/setup-env.ts points DATABASE_PATH and
// UPLOAD_DIR at a temp dir). TTS and script are injected fakes: no network.
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { audioDir, audioQueueIdle, generateLessonAudio, isAudioInFlight, markAudioStale, queueReaderAudio, recoverAudio, type AudioJobDeps } from "../server/ai/audio";
import { normalizeScript, stubScript } from "../server/ai/audio-script";
import { pcmToWav, tone } from "../server/lib/audio-codec";
import type { SpeakFn } from "../server/ai/speech";

const script = async () => ({ chapters: normalizeScript({ chapters: stubScript("nl") }, "nl"), grounded: false, sources: [] });
// A configured voice with a (fake) key: the injected `speak` never uses it.
const voiceConfig: AudioJobDeps["voiceConfig"] = async () => ({ choice: { provider: "google", model: "gemini-3.8-flash-tts", voice: "Sulafat" }, apiKey: "test-key" });
const audioRoot = () => join(env.uploadDir, "audio");
const row = (id: string) => db.query.lessonAudio.findFirst({ where: eq(schema.lessonAudio.lessonId, id) });

async function seedLesson(id: string) {
  await db.insert(schema.reader).values({ id: `r-${id}`, title: "R", fileName: "r.pdf", status: "ready", published: true }).onConflictDoNothing();
  await db
    .insert(schema.lesson)
    .values({ id, readerId: `r-${id}`, code: "1.1", title: "L", startPage: 1, endPage: 2, status: "ready", generatedAt: new Date(1000) })
    .onConflictDoNothing();
}

beforeAll(() => runMigrations());

describe("generateLessonAudio", () => {
  test("a failing chapter stops every worker, writes nothing and leaves no temp dir", async () => {
    await seedLesson("job-fail");
    const calls: string[] = [];
    let inFlightWhenSlowSettled: boolean | null = null;
    const speak: SpeakFn = async (text) => {
      calls.push(text);
      if (text === "Het eerste punt.") throw new Error("boom (chapter 2)"); // chapter 2 (1 = hook)
      if (calls.length === 1) {
        // Chapter 1 is slow and ignores the abort: the job must still wait for it.
        await Bun.sleep(150);
        inFlightWhenSlowSettled = isAudioInFlight("job-fail");
      }
      return pcmToWav(tone(200));
    };
    await generateLessonAudio("job-fail", { script, speak, voiceConfig, retryDelayMs: () => 20 });

    // Chapter 1 once, chapter 2 twice (one retry), nothing after the failure.
    expect(calls).toHaveLength(3);
    expect(calls.filter((c) => c === "Het eerste punt.")).toHaveLength(2);
    const n = calls.length;
    await Bun.sleep(300);
    expect(calls.length).toBe(n);
    expect(inFlightWhenSlowSettled as boolean | null).toBe(true); // not cleared before every worker settled
    expect(isAudioInFlight("job-fail")).toBe(false);
    const r = await row("job-fail");
    expect(r?.status).toBe("error");
    expect(r?.error).toMatch(/Chapter 2: boom/);
    expect(r?.chapters).toEqual([]);
    expect(existsSync(audioDir("job-fail"))).toBe(false);
    expect(readdirSync(audioRoot()).filter((e) => e.startsWith(".tmp-") || e.startsWith(".old-"))).toEqual([]);
  });

  test("success swaps in the new set; content regenerated meanwhile keeps it stale", async () => {
    await seedLesson("job-ok");
    const speak: SpeakFn = async () => pcmToWav(tone(300));
    await generateLessonAudio("job-ok", { script, speak, voiceConfig });
    let r = await row("job-ok");
    expect(r?.status).toBe("ready");
    expect(r?.stale).toBe(false);
    expect(r?.chapters.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(readdirSync(audioDir("job-ok")).sort()).toEqual(["1.mp3", "2.mp3", "3.mp3", "4.mp3", "5.mp3", "6.mp3"]);

    // Regenerate while the lesson content changes mid-job.
    const slow: SpeakFn = async (text) => {
      if (text.startsWith("Stel je voor")) {
        await db.update(schema.lesson).set({ generatedAt: new Date(2000) }).where(eq(schema.lesson.id, "job-ok"));
        await markAudioStale(["job-ok"]);
      }
      return pcmToWav(tone(300));
    };
    await generateLessonAudio("job-ok", { script, speak: slow, voiceConfig });
    r = await row("job-ok");
    expect(r?.status).toBe("ready");
    expect(r?.stale).toBe(true);
    expect(readdirSync(audioDir("job-ok"))).toHaveLength(6);
    expect(readdirSync(audioRoot()).filter((e) => e.startsWith("."))).toEqual([]);
  });

  test("a retry after one failed attempt succeeds", async () => {
    await seedLesson("job-retry");
    let failed = false;
    const speak: SpeakFn = async (text) => {
      if (text === "Het tweede punt." && !failed) {
        failed = true;
        throw Object.assign(new Error("Too many requests"), { statusCode: 429 });
      }
      return pcmToWav(tone(200));
    };
    await generateLessonAudio("job-retry", { script, speak, voiceConfig, retryDelayMs: () => 10 });
    expect((await row("job-retry"))?.status).toBe("ready");
  });

  test("pages changed while the job ran keep the new audio stale", async () => {
    await seedLesson("job-pages");
    const speak: SpeakFn = async (text) => {
      if (text.startsWith("Stel je voor")) await db.update(schema.lesson).set({ endPage: 3 }).where(eq(schema.lesson.id, "job-pages"));
      return pcmToWav(tone(100));
    };
    await generateLessonAudio("job-pages", { script, speak, voiceConfig });
    const r = await row("job-pages");
    expect(r?.status).toBe("ready");
    expect(r?.stale).toBe(true);
  });

  test("cost guard: no voice key fails before the script is written", async () => {
    await seedLesson("job-nokey");
    let scripts = 0;
    const res = await generateLessonAudio("job-nokey", {
      script: async () => (scripts++, script()),
      speak: async () => pcmToWav(tone(100)),
      voiceConfig: async () => ({ choice: { provider: "openai", model: "gpt-4o-mini-tts", voice: "marin" }, apiKey: undefined }),
    });
    expect(scripts).toBe(0);
    expect(res).toMatchObject({ status: "error", fatal: true });
    expect((await row("job-nokey"))?.error).toMatch(/No API key for the voice provider "openai"/);
  });

  test("the stored script is reused after a TTS failure while the lesson is unchanged", async () => {
    await seedLesson("job-reuse");
    let scripts = 0;
    const counted = async () => (scripts++, script());
    const failing: SpeakFn = async () => {
      throw new Error("TTS down");
    };
    const ok: SpeakFn = async () => pcmToWav(tone(100));
    await generateLessonAudio("job-reuse", { script: counted, speak: failing, voiceConfig, retryDelayMs: () => 0 });
    let r = await row("job-reuse");
    expect(r?.status).toBe("error");
    expect(r?.script?.spoken).toBe(false); // stored before the TTS step
    await generateLessonAudio("job-reuse", { script: counted, speak: ok, voiceConfig });
    r = await row("job-reuse");
    expect(r?.status).toBe("ready");
    expect(scripts).toBe(1); // reused, not paid for again
    expect(r?.script?.spoken).toBe(true);

    // A spoken script is not reused: "Opnieuw" writes a fresh one.
    await generateLessonAudio("job-reuse", { script: counted, speak: failing, voiceConfig, retryDelayMs: () => 0 });
    expect(scripts).toBe(2);
    // The content changed since that failed attempt: its script is stale, write a new one.
    await db.update(schema.lesson).set({ generatedAt: new Date(5000) }).where(eq(schema.lesson.id, "job-reuse"));
    await generateLessonAudio("job-reuse", { script: counted, speak: ok, voiceConfig });
    expect(scripts).toBe(3);
  });

  test("the model that actually spoke is stored", async () => {
    await seedLesson("job-model");
    const speak: SpeakFn = async () => ({ audio: pcmToWav(tone(100)), model: "gemini-2.5-flash-preview-tts" });
    await generateLessonAudio("job-model", { script, speak, voiceConfig });
    expect((await row("job-model"))?.model).toBe("gemini-2.5-flash-preview-tts");
  });
});

describe("audio queue", () => {
  async function seedReader(id: string, n: number) {
    await db.insert(schema.reader).values({ id, title: "R", fileName: "r.pdf", status: "ready", published: true }).onConflictDoNothing();
    for (let i = 0; i < n; i++)
      await db
        .insert(schema.lesson)
        .values({ id: `${id}-l${i}`, readerId: id, code: `1.${i}`, title: "L", position: i, startPage: 1, endPage: 4, status: "ready", generatedAt: new Date(1000) })
        .onConflictDoNothing();
    return Array.from({ length: n }, (_, i) => `${id}-l${i}`);
  }

  test("an auth error stops the queue: one script, no more TTS, the rest marked as errors", async () => {
    const ids = await seedReader("q-auth", 3);
    let scripts = 0;
    let calls = 0;
    const speak: SpeakFn = async () => {
      calls++;
      throw Object.assign(new Error("API key not valid. Please pass a valid API key."), { statusCode: 400 });
    };
    const queued = await queueReaderAudio("q-auth", { deps: { script: async () => (scripts++, script()), speak, voiceConfig, retryDelayMs: () => 0 } });
    expect(queued).toEqual(ids);
    await audioQueueIdle();
    expect(scripts).toBe(1);
    expect(calls).toBeLessThanOrEqual(2); // two chapter workers, no retries for a bad key
    const rows = await Promise.all(ids.map(row));
    expect(rows.map((r) => r?.status)).toEqual(["error", "error", "error"]);
    expect(rows[0]?.error).toMatch(/API key not valid/);
    expect(rows[1]?.error).toMatch(/Not generated: an earlier lesson failed with: .*API key not valid/);
    // Re-queueable afterwards.
    expect(await queueReaderAudio("q-auth", { deps: { script, speak: async () => pcmToWav(tone(50)), voiceConfig } })).toEqual(ids);
    await audioQueueIdle();
    expect((await Promise.all(ids.map(row))).map((r) => r?.status)).toEqual(["ready", "ready", "ready"]);
  });

  test("a quota error that survives the retry stops the queue too", async () => {
    const ids = await seedReader("q-quota", 2);
    const speak: SpeakFn = async () => {
      throw Object.assign(new Error("RESOURCE_EXHAUSTED"), { statusCode: 429 });
    };
    await queueReaderAudio("q-quota", { deps: { script, speak, voiceConfig, retryDelayMs: () => 0 } });
    await audioQueueIdle();
    const rows = await Promise.all(ids.map(row));
    expect(rows[0]?.error).toMatch(/RESOURCE_EXHAUSTED/);
    expect(rows[1]?.error).toMatch(/^Not generated/);
  });

  test("bulk runs and per-lesson regenerations share one queue (never more than 2 TTS calls at once)", async () => {
    const a = await seedReader("q-a", 2);
    const b = await seedReader("q-b", 1);
    let active = 0;
    let peak = 0;
    const speak: SpeakFn = async () => {
      peak = Math.max(peak, ++active);
      await Bun.sleep(5);
      active--;
      return pcmToWav(tone(50));
    };
    const deps = { script, speak, voiceConfig };
    await Promise.all([queueReaderAudio("q-a", { deps }), queueReaderAudio("q-b", { lessonIds: b, force: true, deps })]);
    await audioQueueIdle();
    expect(peak).toBeLessThanOrEqual(2);
    expect((await Promise.all([...a, ...b].map(row))).every((r) => r?.status === "ready")).toBe(true);
  });
});

describe("recoverAudio", () => {
  test("puts back an old audio set whose swap was interrupted, sweeps the rest", async () => {
    await seedLesson("rec-1");
    const root = audioRoot();
    mkdirSync(join(root, ".old-rec-1-abc_12"), { recursive: true });
    writeFileSync(join(root, ".old-rec-1-abc_12", "1.mp3"), "x");
    mkdirSync(join(root, ".tmp-rec-1-zzzzzz"), { recursive: true });
    mkdirSync(join(root, "no-such-lesson"), { recursive: true });
    await recoverAudio();
    expect(existsSync(join(audioDir("rec-1"), "1.mp3"))).toBe(true);
    const left = readdirSync(root);
    expect(left.filter((e) => e.startsWith("."))).toEqual([]);
    expect(left).not.toContain("no-such-lesson");
  });
});
