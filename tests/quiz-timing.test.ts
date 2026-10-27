import { describe, expect, test } from "bun:test";
import { autoAdvanceMs } from "../src/lib/quiz-timing";

describe("autoAdvanceMs", () => {
  test("gives time to read, scaling with the explanation", () => {
    expect(autoAdvanceMs(true, "")).toBe(2000);
    expect(autoAdvanceMs(true, "Effectiviteit gaat over doelbereik, efficiëntie over de inzet van middelen.")).toBe(4000);
    expect(autoAdvanceMs(false, "")).toBe(3500);
    expect(autoAdvanceMs(false, "Onwaar Dat is financieel management; HRM gaat over personeelszaken.")).toBe(4750);
  });
  test("is capped", () => {
    const long = "woord ".repeat(200);
    expect(autoAdvanceMs(true, long)).toBe(8000);
    expect(autoAdvanceMs(false, long)).toBe(10000);
  });
});
