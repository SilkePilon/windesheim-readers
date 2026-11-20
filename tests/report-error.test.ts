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
  test("a 5xx gets a generic message with its status, code and path, no stack", () => {
    const seed = errorSeed(new ApiError(502, "BAD_GATEWAY"), "/me");
    expect(seed.type).toBe("bug");
    expect(seed.error).toEqual({ message: "Server error 502", status: 502, code: "BAD_GATEWAY", apiPath: "/me" });
    expect(seed.error && "stack" in seed.error).toBe(false);
  });
  test("raw server text in a 5xx code never becomes the message or the code", () => {
    const seed = errorSeed(new ApiError(500, "SQLITE_CONSTRAINT: UNIQUE constraint failed: user.email"));
    expect(seed.error).toEqual({ message: "Server error 500", status: 500 });
  });
  test("a 4xx keeps its code as the message", () => {
    expect(errorSeed(new ApiError(404, "NOT_FOUND")).error).toEqual({ message: "NOT_FOUND", status: 404, code: "NOT_FOUND" });
  });
  test("a network TypeError says only that", () => {
    const seed = errorSeed(new TypeError("Failed to fetch"), "/me");
    expect(seed.type).toBe("bug");
    expect(seed.error).toEqual({ message: "Network error", apiPath: "/me" });
  });
  test("another Error keeps its message", () => {
    expect(errorSeed(new Error("boom")).error).toEqual({ message: "boom" });
  });
  test("non-errors still give a message", () => {
    expect(errorSeed("x").error?.message).toBe("x");
    expect(errorSeed(undefined).error?.message).toBe("Unknown error");
  });
});
