import { describe, expect, test } from "bun:test";
import { googleModelChain, isModelUnavailable, isRateLimited, makeSpeak, speechParams, synthesize, type SpeakFn } from "../server/ai/speech";
import { effectiveVoice, supportsInstructions, voiceProblem, voicesFor } from "../server/ai/voices";
import { pcmToWav, tone } from "../server/lib/audio-codec";
import type { VoiceChoice } from "../server/ai/providers";

const openai = (model: string, voice = "coral"): VoiceChoice => ({ provider: "openai", model, voice });

describe("voice validation", () => {
  test("instructions only for gpt-4o-mini-tts* and Gemini", () => {
    expect(supportsInstructions("openai", "gpt-4o-mini-tts")).toBe(true);
    expect(supportsInstructions("openai", "gpt-4o-mini-tts-2025-12-15")).toBe(true);
    expect(supportsInstructions("openai", "tts-1")).toBe(false);
    expect(supportsInstructions("openai", "tts-1-hd")).toBe(false);
    expect(supportsInstructions("google", "gemini-2.5-flash-preview-tts")).toBe(true);
    expect(speechParams({ ...openai("tts-1"), instructions: "warm" }, "tts-1", "nl").instructions).toBeUndefined();
    expect(speechParams(openai("gpt-4o-mini-tts"), "gpt-4o-mini-tts", "nl").instructions).toMatch(/Warme/);
    expect(speechParams({ ...openai("gpt-4o-mini-tts"), instructions: " Rustig " }, "gpt-4o-mini-tts", "en").instructions).toBe("Rustig");
  });

  test("voices are checked against the model", () => {
    expect(voiceProblem(openai("gpt-4o-mini-tts", "marin"))).toBeNull();
    expect(voiceProblem(openai("tts-1", "marin"))).toMatch(/only works with gpt-4o-mini-tts/);
    expect(voiceProblem(openai("tts-1", "coral"))).toBeNull();
    expect(voiceProblem(openai("tts-1", "nope"))).toMatch(/Unknown OpenAI voice/);
    expect(voiceProblem({ provider: "google", model: "gemini-3.8-flash-tts", voice: "Sulafat" })).toBeNull();
    expect(voiceProblem({ provider: "google", model: "gemini-3.8-flash-tts", voice: "marin" })).toMatch(/Unknown Gemini voice/);
    expect(voicesFor("openai", "tts-1").some((v) => v.id === "marin" || v.id === "verse")).toBe(false);
  });

  test("an invalid voice falls back to a valid default for the model", () => {
    expect(effectiveVoice(openai("tts-1", "marin")).voice).toBe("coral");
    expect(effectiveVoice(openai("gpt-4o-mini-tts", "marin")).voice).toBe("marin");
    expect(effectiveVoice({ provider: "google", model: "x-tts", voice: "bogus" }).voice).toBe("Sulafat");
  });

  test("synthesize uses the fallback voice", async () => {
    const seen: string[] = [];
    const speak: SpeakFn = async (_t, c) => (seen.push(c.voice), pcmToWav(tone(100)));
    await synthesize("Hallo.", openai("tts-1", "marin"), "k", "nl", { speak });
    expect(seen).toEqual(["coral"]);
  });
});

describe("provider calls", () => {
  const fakeGen = (fail: (model: string) => unknown) => {
    const calls: { model: string; instructions?: string; voice?: string }[] = [];
    const gen = (async (o: any) => {
      calls.push({ model: o.model.modelId, instructions: o.instructions, voice: o.voice });
      const err = fail(o.model.modelId);
      if (err) throw err;
      return { audio: { uint8Array: pcmToWav(tone(100)) } };
    }) as any;
    return { calls, speak: makeSpeak(gen) };
  };

  test("OpenAI tts-1 gets no instructions; gpt-4o-mini-tts does", async () => {
    const { calls, speak } = fakeGen(() => null);
    await speak("Hoi", openai("tts-1"), "k", "nl");
    await speak("Hoi", openai("gpt-4o-mini-tts", "marin"), "k", "nl");
    expect(calls[0]!.instructions).toBeUndefined();
    expect(calls[1]!.instructions).toMatch(/docent/);
  });

  test("Gemini falls back 3.8 → 3.1 → 2.5 on model-unavailable errors only", async () => {
    const g: VoiceChoice = { provider: "google", model: "gemini-3.8-flash-tts", voice: "Sulafat" };
    let f = fakeGen((m) => (m === "gemini-2.5-flash-preview-tts" ? null : Object.assign(new Error("models/x is not found for API version v1beta"), { statusCode: 404 })));
    await f.speak("Hoi", g, "k", "nl");
    expect(f.calls.map((c) => c.model)).toEqual(["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]);

    f = fakeGen(() => new Error("This model does not support audio output"));
    await expect(f.speak("Hoi", g, "k", "nl")).rejects.toThrow(/unavailable for this key \(tried gemini-3.8-flash-tts, gemini-3.1-flash-tts-preview, gemini-2.5-flash-preview-tts\)/);

    f = fakeGen(() => Object.assign(new Error("Too many requests"), { statusCode: 429 }));
    await expect(f.speak("Hoi", g, "k", "nl")).rejects.toThrow(/Too many/);
    expect(f.calls).toHaveLength(1);

    expect(googleModelChain("gemini-3.1-flash-tts-preview")).toEqual(["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]);
    expect(googleModelChain("custom-tts")).toEqual(["custom-tts", "gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"]);
  });

  test("error classification", () => {
    expect(isModelUnavailable({ statusCode: 404 })).toBe(true);
    expect(isModelUnavailable(new Error("Model gemini-3.8-flash-tts is not supported"))).toBe(true);
    expect(isModelUnavailable(new Error("Invalid voice"))).toBe(false);
    expect(isRateLimited({ statusCode: 429 })).toBe(true);
    expect(isRateLimited(new Error("RESOURCE_EXHAUSTED"))).toBe(true);
  });

  test("undecodable provider audio gives a clear error naming the model and format", async () => {
    const bad: SpeakFn = async () => new TextEncoder().encode("RIFF....WAVEjunkjunkjunk");
    await expect(synthesize("Hoi.", { provider: "google", model: "gemini-3.8-flash-tts", voice: "Sulafat" }, "k", "nl", { speak: bad })).rejects.toThrow(
      /Could not decode WAV audio from google gemini-3.8-flash-tts/,
    );
    const garbage: SpeakFn = async () => new Uint8Array([1, 2, 3, 4, 5, 6]);
    await expect(synthesize("Hoi.", openai("gpt-4o-mini-tts"), "k", "nl", { speak: garbage })).rejects.toThrow(
      /Unexpected audio format from openai gpt-4o-mini-tts \(expected WAV or MP3, got 6 bytes/,
    );
  });
});
