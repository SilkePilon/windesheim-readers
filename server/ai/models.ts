import { createHash } from "node:crypto";
import type { ProviderId } from "./providers";

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutput?: number;
  /** epoch ms */
  created?: number;
  deprecated?: boolean;
  structuredOutput?: boolean;
}

export class ProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

/** Error code for "no key saved or typed"; the admin UI translates it. */
export const NO_API_KEY = "NO_API_KEY";

/** Thrown on 401/403: the key is invalid. */
export class ProviderAuthError extends ProviderError {
  constructor(message: string, status?: number) {
    super(message, status);
    this.name = "ProviderAuthError";
  }
}

type Json = any;

function sortModels(list: ModelInfo[]): ModelInfo[] {
  return list.sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id));
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function parseGoogle(json: Json): ModelInfo[] {
  const out: ModelInfo[] = [];
  for (const m of json?.models ?? []) {
    const id = String(m.name ?? "").replace(/^models\//, "");
    if (!id) continue;
    if (!(m.supportedGenerationMethods ?? []).includes("generateContent")) continue;
    if (/embedding|imagen|aqa|tts/i.test(id)) continue;
    out.push({ id, name: m.displayName || id, contextWindow: num(m.inputTokenLimit), maxOutput: num(m.outputTokenLimit) });
  }
  return sortModels(out);
}

export function parseAnthropic(json: Json): ModelInfo[] {
  const out: ModelInfo[] = [];
  for (const m of json?.data ?? []) {
    if (m.lifecycle === "retired") continue;
    const created = m.created_at ? Date.parse(m.created_at) : NaN;
    out.push({
      id: m.id,
      name: m.display_name || m.id,
      contextWindow: num(m.max_input_tokens),
      maxOutput: num(m.max_tokens),
      created: Number.isNaN(created) ? undefined : created,
      deprecated: m.lifecycle === "deprecated" ? true : undefined,
      structuredOutput: m.capabilities?.structured_outputs?.supported === true,
    });
  }
  return sortModels(out);
}

const OPENAI_KEEP = /^(gpt-|o\d|chatgpt-)/;
const OPENAI_DROP = /embedding|tts|whisper|transcribe|audio|realtime|image|^dall-e|moderation|search|^babbage|^davinci/;

export function parseOpenAI(json: Json): ModelInfo[] {
  const out: ModelInfo[] = [];
  for (const m of json?.data ?? []) {
    const id = String(m.id ?? "");
    if (!OPENAI_KEEP.test(id) || OPENAI_DROP.test(id)) continue;
    out.push({ id, name: id, created: typeof m.created === "number" ? m.created * 1000 : undefined });
  }
  return sortModels(out);
}

export function parseOpenRouter(json: Json): ModelInfo[] {
  const out: ModelInfo[] = [];
  for (const m of json?.data ?? []) {
    if (!(m.architecture?.output_modalities ?? ["text"]).includes("text")) continue;
    const params: string[] = m.supported_parameters ?? [];
    out.push({
      id: m.id,
      name: m.name || m.id,
      contextWindow: num(m.context_length),
      maxOutput: num(m.top_provider?.max_completion_tokens),
      created: typeof m.created === "number" ? m.created * 1000 : undefined,
      structuredOutput: params.includes("structured_outputs") || params.includes("response_format"),
    });
  }
  return sortModels(out);
}

interface Opts {
  refresh?: boolean;
  fetchImpl?: typeof fetch;
}

async function getJson(url: string, headers: Record<string, string>, f: typeof fetch): Promise<Json> {
  let res: Response;
  try {
    res = await f(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ProviderError(timeout ? "Request timed out" : e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg = `HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`;
    // Google answers a bad or expired key with 400 API_KEY_INVALID / API_KEY_EXPIRED instead of 401
    // (the reason can sit deep in the error details, so search the whole body).
    if (res.status === 401 || res.status === 403 || /API_KEY_(INVALID|EXPIRED)/.test(body)) throw new ProviderAuthError(msg, res.status);
    throw new ProviderError(msg, res.status);
  }
  try {
    return await res.json();
  } catch {
    throw new ProviderError("Invalid JSON in provider response", res.status);
  }
}

const MAX_PAGES = 20;

async function fetchAll(provider: ProviderId, apiKey: string | undefined, f: typeof fetch): Promise<ModelInfo[]> {
  if (provider !== "openrouter" && !apiKey) throw new ProviderAuthError(NO_API_KEY);
  switch (provider) {
    case "google": {
      const raw: Json[] = [];
      let token: string | undefined;
      for (let i = 0; i < MAX_PAGES; i++) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`;
        const j = await getJson(url, { "x-goog-api-key": apiKey! }, f);
        raw.push(...(j.models ?? []));
        token = j.nextPageToken;
        if (!token) break;
      }
      return parseGoogle({ models: raw });
    }
    case "anthropic": {
      const raw: Json[] = [];
      let after: string | undefined;
      for (let i = 0; i < MAX_PAGES; i++) {
        const url = `https://api.anthropic.com/v1/models?limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ""}`;
        const j = await getJson(url, { "x-api-key": apiKey!, "anthropic-version": "2023-06-01" }, f);
        raw.push(...(j.data ?? []));
        if (!j.has_more || !j.last_id) break;
        after = j.last_id;
      }
      return parseAnthropic({ data: raw });
    }
    case "openai":
      return parseOpenAI(await getJson("https://api.openai.com/v1/models", { Authorization: `Bearer ${apiKey}` }, f));
    case "openrouter":
      return parseOpenRouter(await getJson("https://openrouter.ai/api/v1/models", {}, f));
  }
}

const TTL = 60 * 60 * 1000;
const cache = new Map<string, { at: number; models: ModelInfo[] }>();

export async function listModels(provider: ProviderId, apiKey: string | undefined, opts: Opts = {}): Promise<ModelInfo[]> {
  const hash = createHash("sha256").update(apiKey ?? "").digest("hex").slice(0, 16);
  const key = `${provider}:${hash}`;
  const hit = cache.get(key);
  if (!opts.refresh && hit && Date.now() - hit.at < TTL) return hit.models;
  const models = await fetchAll(provider, apiKey, opts.fetchImpl ?? fetch);
  cache.set(key, { at: Date.now(), models });
  return models;
}

export type ValidateResult = { ok: true; modelCount: number } | { ok: false; invalid: boolean; error: string };

export async function validateKey(provider: ProviderId, apiKey: string | undefined, opts: Opts = {}): Promise<ValidateResult> {
  try {
    if (provider === "openrouter") {
      if (!apiKey) throw new ProviderAuthError(NO_API_KEY);
      await getJson("https://openrouter.ai/api/v1/key", { Authorization: `Bearer ${apiKey}` }, opts.fetchImpl ?? fetch);
      const models = await listModels(provider, undefined, opts).catch(() => []);
      return { ok: true, modelCount: models.length };
    }
    const models = await listModels(provider, apiKey, { ...opts, refresh: true });
    return { ok: true, modelCount: models.length };
  } catch (e) {
    return { ok: false, invalid: e instanceof ProviderAuthError, error: e instanceof Error ? e.message : String(e) };
  }
}
