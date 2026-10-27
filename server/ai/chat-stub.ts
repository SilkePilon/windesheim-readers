import type { LanguageModel } from "ai";

/** Stub tutor model for tests/dev (used when `aiStubEnabled()`: AI_STUB=1, never in production). */

const REPLY = "Stub-tutor: dit is een testantwoord.";
const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

/** A minimal language model (spec v4) that streams one fixed reply. */
export function stubChatModel(): LanguageModel {
  const parts = [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: REPLY },
    { type: "text-end", id: "t" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
  ];
  return {
    specificationVersion: "v4",
    provider: "stub",
    modelId: "stub-chat",
    supportedUrls: {},
    doGenerate: async () => ({
      content: [{ type: "text", text: REPLY }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(c) {
          for (const p of parts) c.enqueue(p);
          c.close();
        },
      }),
    }),
  } as unknown as LanguageModel;
}
