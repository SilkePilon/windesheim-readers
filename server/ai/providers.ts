import { createGoogle } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { decrypt, encrypt } from "../lib/crypto";

export const PROVIDERS = ["google", "anthropic", "openai", "openrouter"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

/** "generation" = heavy reader processing, "fast" = tutor chat + grading. */
export type ModelRole = "generation" | "fast";

export interface ModelChoice {
  provider: ProviderId;
  model: string;
}

export const VOICE_PROVIDERS = ["google", "openai"] as const;
export type VoiceProviderId = (typeof VOICE_PROVIDERS)[number];

/** The "Stem" (text-to-speech) role. Empty `instructions` = per-language default direction. */
export interface VoiceChoice {
  provider: VoiceProviderId;
  model: string;
  voice: string;
  instructions?: string;
}

interface StoredAiSettings {
  generation: ModelChoice;
  fast: ModelChoice;
  /** Unset until the admin saves one: then Gemini if a Google key exists, else OpenAI. */
  voice?: VoiceChoice;
  keys: Partial<Record<ProviderId, string>>; // encrypted
}

const ENV_KEYS: Record<ProviderId, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export const DEFAULT_MODEL: Record<ProviderId, string> = {
  google: "gemini-2.5-flash",
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-5-mini",
  openrouter: "google/gemini-2.5-flash",
};

const DEFAULTS: StoredAiSettings = {
  generation: { provider: "google", model: "gemini-2.5-pro" },
  fast: { provider: "google", model: "gemini-2.5-flash" },
  keys: {},
};

const SETTINGS_KEY = "ai";

async function load(): Promise<StoredAiSettings> {
  const row = await db.query.setting.findFirst({ where: eq(schema.setting.key, SETTINGS_KEY) });
  if (!row) return DEFAULTS;
  return { ...DEFAULTS, ...(JSON.parse(row.value) as StoredAiSettings) };
}

async function save(s: StoredAiSettings) {
  const value = JSON.stringify(s);
  await db
    .insert(schema.setting)
    .values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: schema.setting.key, set: { value, updatedAt: new Date() } });
}

function apiKeyFor(s: StoredAiSettings, provider: ProviderId) {
  const stored = s.keys[provider];
  if (stored) return decrypt(stored);
  return process.env[ENV_KEYS[provider]] || undefined;
}

/** Typed key if given, else the stored key, else the env key. */
export async function resolveApiKey(provider: ProviderId, typedKey?: string): Promise<string | undefined> {
  const typed = typedKey?.trim();
  if (typed) return typed;
  return apiKeyFor(await load(), provider);
}

/** Gemini TTS first (newest flash TTS), OpenAI gpt-4o-mini-tts otherwise. See server/ai/voices.ts. */
export const DEFAULT_VOICE: Record<VoiceProviderId, VoiceChoice> = {
  google: { provider: "google", model: "gemini-3.8-flash-tts", voice: "Sulafat" },
  openai: { provider: "openai", model: "gpt-4o-mini-tts", voice: "marin" },
};

function voiceFor(s: StoredAiSettings): VoiceChoice {
  if (s.voice) return s.voice;
  if (apiKeyFor(s, "google") || !apiKeyFor(s, "openai")) return DEFAULT_VOICE.google;
  return DEFAULT_VOICE.openai;
}

/** The effective voice settings plus the key for its provider (server-side use only). */
export async function getVoiceConfig(): Promise<{ choice: VoiceChoice; apiKey: string | undefined; isDefault: boolean }> {
  const s = await load();
  const choice = voiceFor(s);
  return { choice, apiKey: apiKeyFor(s, choice.provider), isDefault: !s.voice };
}

/** A role's model choice plus its key (server-side use only, e.g. for provider tools). */
export async function getRoleConfig(role: ModelRole): Promise<ModelChoice & { apiKey: string | undefined }> {
  const s = await load();
  return { ...s[role], apiKey: apiKeyFor(s, s[role].provider) };
}

/** Safe view for the admin UI: never returns keys, only whether one is set. */
export async function getAiSettingsPublic() {
  const s = await load();
  return {
    generation: s.generation,
    fast: s.fast,
    voice: voiceFor(s),
    keys: Object.fromEntries(
      PROVIDERS.map((p) => [p, { stored: !!s.keys[p], env: !!process.env[ENV_KEYS[p]] }]),
    ) as Record<ProviderId, { stored: boolean; env: boolean }>,
    defaults: DEFAULT_MODEL,
    voiceDefaults: DEFAULT_VOICE,
  };
}

export async function updateAiSettings(input: {
  generation?: ModelChoice;
  fast?: ModelChoice;
  voice?: VoiceChoice;
  keys?: Partial<Record<ProviderId, string | null>>; // string = set, null = remove, undefined = keep
}) {
  const s = await load();
  if (input.generation) s.generation = input.generation;
  if (input.fast) s.fast = input.fast;
  if (input.voice) s.voice = { ...input.voice, instructions: input.voice.instructions?.trim() || undefined };
  for (const p of PROVIDERS) {
    const k = input.keys?.[p];
    if (k === null) delete s.keys[p];
    else if (typeof k === "string" && k.trim()) s.keys[p] = encrypt(k.trim());
  }
  await save(s);
}

export function createModel(provider: ProviderId, model: string, apiKey: string | undefined): LanguageModel {
  if (!apiKey) throw new Error(`No API key configured for provider "${provider}"`);
  switch (provider) {
    case "google":
      return createGoogle({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "openrouter":
      return createOpenRouter({ apiKey }).chat(model);
  }
}

export async function getModel(role: ModelRole): Promise<LanguageModel> {
  const s = await load();
  const choice = s[role];
  return createModel(choice.provider, choice.model, apiKeyFor(s, choice.provider));
}

export async function getModelFor(choice: ModelChoice): Promise<LanguageModel> {
  const s = await load();
  return createModel(choice.provider, choice.model, apiKeyFor(s, choice.provider));
}
