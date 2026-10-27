// Text-to-speech for the "Stem" role: AI SDK generateSpeech (Gemini TTS or OpenAI), input
// chunking under the provider limit, and normalisation to MP3 64 kbps mono.
import { generateSpeech, type SpeechModel } from "ai";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { env } from "../env";
import { concatPcm, encodeMp3, isWav, mp3Info, parseWav, pcmToWav, tone, type Pcm } from "../lib/audio-codec";
import { chunkText, defaultVoiceInstructions, TTS_MAX_CHARS } from "./audio-script";
import { DEFAULT_VOICE, type VoiceChoice } from "./providers";
import { GOOGLE_TTS_FALLBACK } from "./voices";

/** Stub script + TTS for tests/dev: only outside production, only with AI_STUB=1. */
export function aiStubEnabled() {
  return !env.isProd && process.env.AI_STUB === "1";
}

export function createSpeechModel(choice: VoiceChoice, apiKey: string | undefined): SpeechModel {
  if (!apiKey) throw new Error(`No API key configured for provider "${choice.provider}"`);
  return choice.provider === "google" ? createGoogle({ apiKey }).speech(choice.model) : createOpenAI({ apiKey }).speech(choice.model);
}

const isNotFound = (e: unknown) => {
  const err = e as { statusCode?: number; message?: string; lastError?: { statusCode?: number } };
  return err?.statusCode === 404 || err?.lastError?.statusCode === 404 || /\b404\b|NOT_FOUND|not found/i.test(err?.message ?? "");
};

async function speakOnce(text: string, choice: VoiceChoice, apiKey: string | undefined, language: string): Promise<Uint8Array> {
  if (aiStubEnabled()) return pcmToWav(tone(Math.min(3000, 600 + text.length * 10)));
  const instructions = choice.instructions?.trim() || defaultVoiceInstructions(language);
  const run = async (c: VoiceChoice) =>
    (await generateSpeech({ model: createSpeechModel(c, apiKey), text, voice: c.voice, instructions, outputFormat: "wav" })).audio.uint8Array;
  try {
    return await run(choice);
  } catch (e) {
    // The default (newest) Gemini TTS model may not be enabled for every key: fall back once.
    if (choice.provider === "google" && choice.model === DEFAULT_VOICE.google.model && isNotFound(e))
      return run({ ...choice, model: GOOGLE_TTS_FALLBACK });
    throw e;
  }
}

/**
 * Speak `text` (chunked under the provider's input limit) and return it as MP3 64 kbps mono.
 * WAV/PCM output is decoded, joined and encoded; MP3 output (if a provider ignores the wav
 * request) is concatenated frame-wise.
 */
export async function synthesize(text: string, choice: VoiceChoice, apiKey: string | undefined, language: string) {
  const chunks = chunkText(text, TTS_MAX_CHARS[choice.provider]);
  if (!chunks.length) throw new Error("Nothing to speak");
  const parts: Uint8Array[] = [];
  for (const chunk of chunks) parts.push(await speakOnce(chunk, choice, apiKey, language));
  if (parts.every(isWav)) {
    const pcm: Pcm = concatPcm(parts.map(parseWav), 150);
    return { mp3: encodeMp3(pcm), durationMs: Math.round((pcm.samples.length / pcm.sampleRate) * 1000) };
  }
  if (parts.some(isWav)) throw new Error("Mixed audio formats from the TTS provider");
  const mp3 = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) {
    mp3.set(p, at);
    at += p.length;
  }
  return { mp3, durationMs: parts.reduce((a, p) => a + mp3Info(p).durationMs, 0) };
}

export function voiceSampleText(language: string) {
  return language === "en"
    ? "Hi! This is how I sound in your listening lesson. Let's dive into the reader together."
    : "Hoi! Zo klink ik in je luisterles. Laten we samen de reader induiken.";
}
