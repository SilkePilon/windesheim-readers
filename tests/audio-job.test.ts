// Luisterles job runner against the throwaway DB (tests/setup-env.ts points DATABASE_PATH and
// UPLOAD_DIR at a temp dir). TTS and script are injected fakes: no network.
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { audioDir, generateLessonAudio, isAudioInFlight, markAudioStale } from "../server/ai/audio";
import { normalizeScript, stubScript } from "../server/ai/audio-script";
import { pcmToWav, tone } from "../server/lib/audio-codec";
import type { SpeakFn } from "../server/ai/speech";

const script = async () => ({ chapters: normalizeScript({ chapters: stubScript("nl") }, "nl"), grounded: false, sources: [] });
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
    await generateLessonAudio("job-fail", { script, speak, retryDelayMs: () => 20 });

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
    await generateLessonAudio("job-ok", { script, speak });
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
    await generateLessonAudio("job-ok", { script, speak: slow });
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
    await generateLessonAudio("job-retry", { script, speak, retryDelayMs: () => 10 });
    expect((await row("job-retry"))?.status).toBe("ready");
  });
});
