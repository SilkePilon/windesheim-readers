// Voice catalogue for the "Stem" (TTS) role. Descriptions are the providers' own style labels.
import type { VoiceProviderId } from "./providers";

export interface VoiceInfo {
  id: string;
  /** Style label from the provider docs (English, e.g. "Warm"). */
  style: string;
  /** If set, the voice only works with model ids starting with this prefix. */
  modelPrefix?: string;
}

/** Gemini TTS prebuilt voices (all 30; same set for 2.5, 3.1 and 3.8 TTS models). */
const GOOGLE: VoiceInfo[] = [
  ["Sulafat", "Warm"],
  ["Achird", "Friendly"],
  ["Vindemiatrix", "Gentle"],
  ["Iapetus", "Clear"],
  ["Erinome", "Clear"],
  ["Charon", "Informative"],
  ["Rasalgethi", "Informative"],
  ["Sadaltager", "Knowledgeable"],
  ["Kore", "Firm"],
  ["Orus", "Firm"],
  ["Alnilam", "Firm"],
  ["Puck", "Upbeat"],
  ["Laomedeia", "Upbeat"],
  ["Zephyr", "Bright"],
  ["Autonoe", "Bright"],
  ["Aoede", "Breezy"],
  ["Callirrhoe", "Easy-going"],
  ["Umbriel", "Easy-going"],
  ["Algieba", "Smooth"],
  ["Despina", "Smooth"],
  ["Schedar", "Even"],
  ["Gacrux", "Mature"],
  ["Pulcherrima", "Forward"],
  ["Zubenelgenubi", "Casual"],
  ["Sadachbia", "Lively"],
  ["Fenrir", "Excitable"],
  ["Leda", "Youthful"],
  ["Enceladus", "Breathy"],
  ["Algenib", "Gravelly"],
  ["Achernar", "Soft"],
].map(([id, style]) => ({ id: id!, style: style! }));

/** OpenAI built-in voices. marin/cedar are OpenAI's recommended (most natural) voices. */
const OPENAI: VoiceInfo[] = [
  { id: "marin", style: "Natural, warm (recommended)", modelPrefix: "gpt-4o-mini-tts" },
  { id: "cedar", style: "Natural, calm (recommended)", modelPrefix: "gpt-4o-mini-tts" },
  { id: "coral", style: "Warm, friendly" },
  { id: "sage", style: "Calm, thoughtful" },
  { id: "nova", style: "Bright, energetic" },
  { id: "alloy", style: "Neutral, balanced" },
  { id: "ash", style: "Clear, direct" },
  { id: "ballad", style: "Expressive, soft", modelPrefix: "gpt-4o-mini-tts" },
  { id: "echo", style: "Resonant" },
  { id: "fable", style: "Storyteller" },
  { id: "onyx", style: "Deep, authoritative" },
  { id: "shimmer", style: "Light, upbeat" },
  { id: "verse", style: "Versatile, expressive", modelPrefix: "gpt-4o-mini-tts" },
];

export const VOICES: Record<VoiceProviderId, VoiceInfo[]> = { google: GOOGLE, openai: OPENAI };

/** Gemini TTS model to fall back to when the (default) newest one isn't available for the key. */
export const GOOGLE_TTS_FALLBACK = "gemini-2.5-flash-preview-tts";
