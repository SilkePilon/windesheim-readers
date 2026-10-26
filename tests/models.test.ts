import { describe, expect, test } from "bun:test";
import googleFixture from "./fixtures/models/google.json";
import anthropicFixture from "./fixtures/models/anthropic.json";
import openaiFixture from "./fixtures/models/openai.json";
import openrouterFixture from "./fixtures/models/openrouter.json";
import {
  ProviderAuthError,
  ProviderError,
  listModels,
  parseAnthropic,
  parseGoogle,
  parseOpenAI,
  parseOpenRouter,
  validateKey,
} from "../server/ai/models";

describe("parsers", () => {
  test("google", () => {
    const g = parseGoogle(googleFixture);
    expect(g.map((m) => m.id)).toContain("gemini-2.5-flash");
    expect(g.some((m) => m.id.includes("embedding"))).toBe(false);
    expect(g.some((m) => m.id.includes("tts") || m.id.includes("imagen") || m.id === "aqa")).toBe(false);
    expect(g.find((m) => m.id === "gemini-2.5-flash")?.contextWindow).toBe(1048576);
    expect(g.find((m) => m.id === "gemini-2.5-flash")?.name).toBe("Gemini 2.5 Flash");
  });
  test("anthropic", () => {
    const a = parseAnthropic(anthropicFixture);
    expect(a.some((m) => m.id === "claude-retired-x")).toBe(false);
    expect(a.find((m) => m.id === "claude-old-dep")?.deprecated).toBe(true);
    expect(a.find((m) => m.id === "claude-opus-5-5")?.structuredOutput).toBe(true);
    expect(a[0].id).toBe("claude-opus-5-5"); // newest first
    expect(a[0].created).toBe(Date.parse("2026-05-01T00:00:00Z"));
  });
  test("openai", () => {
    const o = parseOpenAI(openaiFixture);
    expect(o.map((m) => m.id).sort()).toEqual(["gpt-5", "gpt-5-mini", "o4-mini"]);
    expect(o[0].created).toBe(1754500000 * 1000);
  });
  test("openrouter", () => {
    const r = parseOpenRouter(openrouterFixture);
    expect(r.some((m) => m.id === "some/image-only")).toBe(false);
    expect(r.find((m) => m.id === "google/gemini-2.5-flash")?.structuredOutput).toBe(true);
    expect(r.find((m) => m.id === "openai/gpt-5-mini")?.structuredOutput).toBe(false);
    expect(r.find((m) => m.id === "google/gemini-2.5-flash")?.maxOutput).toBe(65535);
  });
});

describe("listModels / validateKey", () => {
  const f401 = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
  const f429 = (async () => new Response("rate", { status: 429 })) as unknown as typeof fetch;

  test("error mapping", async () => {
    await expect(listModels("openai", "bad", { fetchImpl: f401, refresh: true })).rejects.toBeInstanceOf(ProviderAuthError);
    await expect(listModels("openai", "k", { fetchImpl: f429, refresh: true })).rejects.toBeInstanceOf(ProviderError);
    expect(await validateKey("openai", "bad", { fetchImpl: f401 })).toEqual({ ok: false, invalid: true, error: expect.any(String) });
    expect(await validateKey("openai", "k", { fetchImpl: f429 })).toMatchObject({ ok: false, invalid: false });
  });

  test("google bad key (400 API_KEY_INVALID) counts as invalid", async () => {
    const f = (async () => new Response('{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 })) as unknown as typeof fetch;
    expect(await validateKey("google", "bogus", { fetchImpl: f })).toMatchObject({ ok: false, invalid: true });
  });

  test("openrouter validation uses /key", async () => {
    const urls: string[] = [];
    const f = (async (u: any) => {
      urls.push(String(u));
      return new Response("{}", { status: 401 });
    }) as unknown as typeof fetch;
    expect(await validateKey("openrouter", "bad", { fetchImpl: f })).toMatchObject({ ok: false, invalid: true });
    expect(urls[0]).toBe("https://openrouter.ai/api/v1/key");
  });

  test("anthropic pagination", async () => {
    const base = anthropicFixture.data;
    const calls: string[] = [];
    const f = (async (u: any) => {
      calls.push(String(u));
      const n = calls.length;
      const body =
        n === 1
          ? { data: [base[0]], has_more: true, last_id: "p1" }
          : n === 2
            ? { data: [base[1]], has_more: true, last_id: "p2" }
            : { data: [base[2]], has_more: false, last_id: "p3" };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await listModels("anthropic", "pg", { fetchImpl: f, refresh: true });
    expect(r.map((m) => m.id).sort()).toEqual(["claude-old-dep", "claude-opus-5-5", "claude-sonnet-5-5"]);
    expect(calls[1]).toContain("after_id=p1");
    expect(calls[2]).toContain("after_id=p2");
  });

  test("google pagination, cache and refresh", async () => {
    let n = 0;
    const f = (async (u: any) => {
      n++;
      const first = !String(u).includes("pageToken");
      const body = first ? { models: [googleFixture.models[0]], nextPageToken: "t2" } : { models: [googleFixture.models[1]] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const a = await listModels("google", "cachekey", { fetchImpl: f, refresh: true });
    expect(a.length).toBe(2);
    expect(n).toBe(2);
    await listModels("google", "cachekey", { fetchImpl: f });
    expect(n).toBe(2); // cached
    await listModels("google", "cachekey", { fetchImpl: f, refresh: true });
    expect(n).toBe(4);
  });

  test("validateKey ok", async () => {
    const f = (async () => new Response(JSON.stringify(openaiFixture), { status: 200 })) as unknown as typeof fetch;
    expect(await validateKey("openai", "good", { fetchImpl: f })).toEqual({ ok: true, modelCount: 3 });
  });
});
