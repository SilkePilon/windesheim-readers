import { expect, test } from "bun:test";
import type { TFunction } from "i18next";
import { ApiError } from "../src/lib/api";
import { errorText } from "../src/lib/error-text";

const t = ((k: string) => `t:${k}`) as unknown as TFunction;

test("errorText never shows raw codes", () => {
  expect(errorText(new ApiError(409, "ALREADY_RUNNING"), t)).toBe("t:errors.ALREADY_RUNNING");
  expect(errorText(new ApiError(500, "HTTP_500"), t)).toBe("t:common.error");
  expect(errorText(new ApiError(500, "INTERNAL_ERROR"), t)).toBe("t:common.error");
  expect(errorText(new TypeError("Failed to fetch"), t)).toBe("t:common.error");
  expect(errorText(undefined, t)).toBe("t:common.error");
  expect(errorText(new ApiError(400, "INVALID_VOICE", { message: "Unknown voice" }), t)).toBe("Unknown voice");
  expect(errorText(new Error("Gemini quota exceeded"), t)).toBe("Gemini quota exceeded");
});
