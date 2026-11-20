import { describe, expect, test } from "bun:test";
import { ApiError } from "../src/lib/api";
import { errorSeed, isReportable } from "../src/lib/report-error";

describe("isReportable", () => {
  test("server failures and network errors are reportable", () => {
    expect(isReportable(new ApiError(500, "INTERNAL_ERROR"))).toBe(true);
    expect(isReportable(new ApiError(503, "HTTP_503"))).toBe(true);
    expect(isReportable(new TypeError("Failed to fetch"))).toBe(true);
  });
  test("the user's own mistakes and limits are not", () => {
    expect(isReportable(new ApiError(400, "VALIDATION"))).toBe(false);
    expect(isReportable(new ApiError(404, "NOT_FOUND"))).toBe(false);
    expect(isReportable(new ApiError(429, "RATE_LIMITED"))).toBe(false);
    expect(isReportable(new Error("boom"))).toBe(false);
    expect(isReportable("nope")).toBe(false);
    expect(isReportable(null)).toBe(false);
  });
});

describe("errorSeed", () => {
  test("an ApiError becomes a bug seed with status, code and path, no stack", () => {
    const seed = errorSeed(new ApiError(502, "BAD_GATEWAY"), "/me");
    expect(seed.type).toBe("bug");
    expect(seed.error).toEqual({ message: "BAD_GATEWAY", status: 502, code: "BAD_GATEWAY", apiPath: "/me" });
    expect(seed.error && "stack" in seed.error).toBe(false);
  });
  test("a network TypeError carries its message only", () => {
    const seed = errorSeed(new TypeError("Failed to fetch"));
    expect(seed.type).toBe("bug");
    expect(seed.error).toEqual({ message: "Failed to fetch" });
  });
  test("non-errors still give a message", () => {
    expect(errorSeed("x").error?.message).toBe("x");
    expect(errorSeed(undefined).error?.message).toBe("Unknown error");
  });
});
