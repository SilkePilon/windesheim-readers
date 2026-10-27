// Text-to-speech for the "Stem" role: AI SDK generateSpeech (Gemini TTS or OpenAI), input
// chunking under the provider limit, and normalisation to MP3 64 kbps mono.
import { generateSpeech, type SpeechModel } from "ai";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { env } from "../env";
import { concatPcm, encodeMp3, isWav, mp3Info, parseWav, pcmToWav, tone, type Pcm } from "../lib/audio-codec";
import { chunkText, defaultVoiceInstructions, PAUSE_MS, splitPauses, TTS_MAX_CHARS } from "./audio-script";
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

/** The key is missing, invalid or not allowed to use the model: retrying or continuing is pointless. */
export function isAuthError(e: unknown) {
  const s = statusOf(e);
  return s === 401 || s === 403 || /API[ _]key not valid|invalid[ _]api[ _]key|incorrect api key|PERMISSION_DENIED|UNAUTHENTICATED|unauthorized/i.test(errText(e));
}

/** Errors that will hit every following lesson too: stop the queue instead of paying for more scripts. */
export function isFatalProviderError(e: unknown) {
  return isAuthError(e) || isRateLimited(e);
}

/** Gemini's suggested wait (`"retryDelay": "37s"` in the error body), in ms. */
export function retryDelayHint(e: unknown): number | null {
  const m = errText(e).match(/retryDelay\\?"?\s*:\s*\\?"(\d+(?:\.\d+)?)s/);
  return m ? Math.round(Number.parseFloat(m[1]!) * 1000) : null;
}

/** Wait before the single retry: Gemini's hint after a 429 (capped at 2 min), else 20-60 s; 1 s for other errors. */
export function defaultRetryDelay(e: unknown) {
  if (!isRateLimited(e)) return 1000;
  const hint = retryDelayHint(e);
  return hint != null ? Math.min(Math.max(hint, 1000), 120_000) : 20_000 + Math.round(Math.random() * 40_000);
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

/** Audio bytes plus the model that actually spoke them (after the Gemini fallback chain). */
export interface Spoken {
  audio: Uint8Array;
  model: string;
}

/** One TTS call. Fakes in tests may return bare bytes (then the configured model is assumed). */
export type SpeakFn = (text: string, choice: VoiceChoice, apiKey: string | undefined, language: string, signal?: AbortSignal) => Promise<Uint8Array | Spoken>;

/** Voice + instructions for one call: `instructions` only where the model supports them. */
export function speechParams(choice: VoiceChoice, model: string, language: string) {
  return {
    voice: choice.voice,
    instructions: supportsInstructions(choice.provider, model) ? choice.instructions?.trim() || defaultVoiceInstructions(language) : undefined,
  };
}

/** One TTS call (with the Gemini model fallback chain). Returns WAV or MP3 bytes and the model used. `gen` is injectable for tests. */
export function makeSpeak(gen: typeof generateSpeech = generateSpeech): (...a: Parameters<SpeakFn>) => Promise<Spoken> {
  return async (text, choice, apiKey, language, signal) => {
    if (aiStubEnabled()) return { audio: pcmToWav(tone(Math.min(3000, 600 + text.length * 10))), model: "stub" };
    const run = async (model: string): Promise<Spoken> => ({
      audio: (
        await gen({
          model: createSpeechModel({ ...choice, model }, apiKey),
          text,
          ...speechParams(choice, model, language),
          outputFormat: "wav",
          abortSignal: signal,
        })
      ).audio.uint8Array,
      model,
    });
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
 * Pause markers split the text; the parts are joined with ~3 s of silence (150 ms between
 * chunks otherwise). WAV/PCM output is decoded, joined and encoded; MP3 output (if a provider
 * ignores the wav request) is concatenated frame-wise, without the silences. An invalid voice
 * for the model falls back to a valid one. `model` is the model that actually spoke.
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
  const pieces: string[] = [];
  const gaps: number[] = []; // gaps[i] = silence after pieces[i]
  for (const segment of splitPauses(text)) {
    if (pieces.length) gaps[pieces.length - 1] = PAUSE_MS;
    for (const chunk of chunkText(segment, TTS_MAX_CHARS[choice.provider])) {
      if (gaps.length < pieces.length) gaps.push(150);
      pieces.push(chunk);
    }
  }
  if (!pieces.length) throw new Error("Nothing to speak");
  const parts: Uint8Array[] = [];
  let model = choice.model;
  for (const piece of pieces) {
    opts.signal?.throwIfAborted();
    const out = await speak(piece, choice, apiKey, language, opts.signal);
    if (out instanceof Uint8Array) parts.push(out);
    else {
      parts.push(out.audio);
      model = out.model;
    }
  }
  const what = `${choice.provider} ${choice.model}`;
  if (parts.every(isWav)) {
    let pcm: Pcm;
    try {
      pcm = concatPcm(parts.map(parseWav), gaps);
    } catch (e) {
      throw new Error(`Could not decode WAV audio from ${what}: ${e instanceof Error ? e.message : e}`);
    }
    return { mp3: encodeMp3(pcm), durationMs: Math.round((pcm.samples.length / pcm.sampleRate) * 1000), model };
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
    return { mp3, durationMs, model };
  } catch {
    throw new Error(`Unexpected audio format from ${what} (expected WAV or MP3, got ${describeAudio(parts[0]!)})`);
  }
}

export function voiceSampleText(language: string) {
  return language === "en"
    ? "Hi! This is how I sound in your listening lesson. Let's dive into the reader together."
    : "Hoi! Zo klink ik in je luisterles. Laten we samen de reader induiken.";
}
