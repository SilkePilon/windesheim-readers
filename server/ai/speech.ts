// Text-to-speech for the "Stem" role: AI SDK generateSpeech (Gemini TTS or OpenAI), input
// chunking under the provider limit, and normalisation to MP3 64 kbps mono.
import { generateSpeech, type SpeechModel } from "ai";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { env } from "../env";
import { concatPcm, encodeMp3, isWav, mp3Info, parseWav, pcmToWav, tone, type Pcm } from "../lib/audio-codec";
import { chunkText, defaultVoiceInstructions, TTS_MAX_CHARS } from "./audio-script";
import type { VoiceChoice } from "./providers";
import { effectiveVoice, GOOGLE_TTS_CHAIN, supportsInstructions } from "./voices";

/** Stub script + TTS for tests/dev: only outside production, only with AI_STUB=1. */
export function aiStubEnabled() {
  return !env.isProd && process.env.AI_STUB === "1";
}

export function createSpeechModel(choice: VoiceChoice, apiKey: string | undefined): SpeechModel {
  if (!apiKey) throw new Error(`No API key configured for provider "${choice.provider}"`);
  return choice.provider === "google" ? createGoogle({ apiKey }).speech(choice.model) : createOpenAI({ apiKey }).speech(choice.model);
}

const errText = (e: unknown) => {
  const err = e as { message?: string; responseBody?: string; lastError?: { message?: string; responseBody?: string } };
  return [err?.message, err?.responseBody, err?.lastError?.message, err?.lastError?.responseBody].filter(Boolean).join(" ");
};
const statusOf = (e: unknown) => {
  const err = e as { statusCode?: number; lastError?: { statusCode?: number } };
  return err?.statusCode ?? err?.lastError?.statusCode;
};

/** The model itself is unavailable for this key/API (vs. a transient or input error). */
export function isModelUnavailable(e: unknown) {
  return statusOf(e) === 404 || /not[ _]found|NOT_FOUND|is not supported|unsupported model|does not support|not available|no longer available/i.test(errText(e));
}

export function isRateLimited(e: unknown) {
  return statusOf(e) === 429 || /RESOURCE_EXHAUSTED|rate limit|quota/i.test(errText(e));
}

/** Gemini models to try in order: the configured one, then the newer-to-older chain after it. */
export function googleModelChain(model: string) {
  const i = GOOGLE_TTS_CHAIN.indexOf(model);
  return [model, ...GOOGLE_TTS_CHAIN.slice(i + 1).filter((m) => m !== model)];
}

/** Rough description of bytes we couldn't decode, for admin error messages. */
function describeAudio(b: Uint8Array) {
  const head = String.fromCharCode(...b.subarray(0, 4)).replace(/[^\x20-\x7e]/g, ".");
  return `${b.length} bytes starting "${head}"`;
}

export type SpeakFn = (text: string, choice: VoiceChoice, apiKey: string | undefined, language: string, signal?: AbortSignal) => Promise<Uint8Array>;

/** Voice + instructions for one call: `instructions` only where the model supports them. */
export function speechParams(choice: VoiceChoice, model: string, language: string) {
  return {
    voice: choice.voice,
    instructions: supportsInstructions(choice.provider, model) ? choice.instructions?.trim() || defaultVoiceInstructions(language) : undefined,
  };
}

/** One TTS call (with the Gemini model fallback chain). Returns WAV or MP3 bytes. `gen` is injectable for tests. */
export function makeSpeak(gen: typeof generateSpeech = generateSpeech): SpeakFn {
  return async (text, choice, apiKey, language, signal) => {
    if (aiStubEnabled()) return pcmToWav(tone(Math.min(3000, 600 + text.length * 10)));
    const run = async (model: string) =>
      (
        await gen({
          model: createSpeechModel({ ...choice, model }, apiKey),
          text,
          ...speechParams(choice, model, language),
          outputFormat: "wav",
          abortSignal: signal,
        })
      ).audio.uint8Array;
    if (choice.provider !== "google") return run(choice.model);
    const tried: string[] = [];
    let last: unknown;
    for (const model of googleModelChain(choice.model)) {
      try {
        return await run(model);
      } catch (e) {
        if (signal?.aborted || !isModelUnavailable(e)) throw e;
        tried.push(model);
        last = e;
      }
    }
    throw new Error(`Gemini TTS model unavailable for this key (tried ${tried.join(", ")}): ${errText(last).slice(0, 300)}`);
  };
}

const speakOnce = makeSpeak();

/**
 * Speak `text` (chunked under the provider's input limit) and return it as MP3 64 kbps mono.
 * WAV/PCM output is decoded, joined and encoded; MP3 output (if a provider ignores the wav
 * request) is concatenated frame-wise. An invalid voice for the model falls back to a valid one.
 */
export async function synthesize(
  text: string,
  voiceChoice: VoiceChoice,
  apiKey: string | undefined,
  language: string,
  opts: { signal?: AbortSignal; speak?: SpeakFn } = {},
) {
  const choice = effectiveVoice(voiceChoice);
  const speak = opts.speak ?? speakOnce;
  const chunks = chunkText(text, TTS_MAX_CHARS[choice.provider]);
  if (!chunks.length) throw new Error("Nothing to speak");
  const parts: Uint8Array[] = [];
  for (const chunk of chunks) {
    opts.signal?.throwIfAborted();
    parts.push(await speak(chunk, choice, apiKey, language, opts.signal));
  }
  const what = `${choice.provider} ${choice.model}`;
  if (parts.every(isWav)) {
    let pcm: Pcm;
    try {
      pcm = concatPcm(parts.map(parseWav), 150);
    } catch (e) {
      throw new Error(`Could not decode WAV audio from ${what}: ${e instanceof Error ? e.message : e}`);
    }
    return { mp3: encodeMp3(pcm), durationMs: Math.round((pcm.samples.length / pcm.sampleRate) * 1000) };
  }
  if (parts.some(isWav)) throw new Error(`Mixed audio formats from ${what}`);
  try {
    const durationMs = parts.reduce((a, p) => a + mp3Info(p).durationMs, 0);
    const mp3 = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let at = 0;
    for (const p of parts) {
      mp3.set(p, at);
      at += p.length;
    }
    return { mp3, durationMs };
  } catch {
    throw new Error(`Unexpected audio format from ${what} (expected WAV or MP3, got ${describeAudio(parts[0]!)})`);
  }
}

export function voiceSampleText(language: string) {
  return language === "en"
    ? "Hi! This is how I sound in your listening lesson. Let's dive into the reader together."
    : "Hoi! Zo klink ik in je luisterles. Laten we samen de reader induiken.";
}
