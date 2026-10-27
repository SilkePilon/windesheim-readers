import type { LanguageModel } from "ai";

/**
 * Stub AI for tests/dev (used when `aiStubEnabled()`: AI_STUB=1, never in production): the
 * tutor model and the graders answer fixed text and never call a provider.
 */

/** Test hook: make the stubs fail like a provider error would. */
export const aiStubControl = { fail: false };

const stubFailure = () => new Error("AI stub: simulated provider failure");

/** A fixed grade: the score follows the answer length, so tests can tell answers apart. */
export function stubGrade(answer: string) {
  if (aiStubControl.fail) throw stubFailure();
  const score = Math.min(100, 40 + answer.trim().length);
  return { score, feedback: "Stub-beoordeling: dit is een testantwoord.", strengths: ["Stub"], missing: [] as string[] };
}

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
    doGenerate: async () => {
      if (aiStubControl.fail) throw stubFailure();
      return { content: [{ type: "text", text: REPLY }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] };
    },
    doStream: async () => {
      if (aiStubControl.fail) throw stubFailure();
      const stream = new ReadableStream({
        start(c) {
          for (const p of parts) c.enqueue(p);
          c.close();
        },
      });
      return { stream };
    },
  } as unknown as LanguageModel;
}
