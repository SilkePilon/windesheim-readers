import { describe, expect, test } from "bun:test";
import { makeLocaleLoader } from "@/lib/locale-load";

describe("makeLocaleLoader", () => {
  test("nl never imports", async () => {
    let imports = 0;
    const load = makeLocaleLoader(() => {}, async () => { imports++; return { default: {} }; });
    await load("nl");
    expect(imports).toBe(0);
  });

  test("concurrent en calls import and add once", async () => {
    let imports = 0;
    const added: unknown[][] = [];
    const bundle = { a: 1 };
    const load = makeLocaleLoader((l, b) => added.push([l, b]), async () => { imports++; return { default: bundle }; });
    await Promise.all([load("en"), load("en")]);
    await load("en");
    expect(imports).toBe(1);
    expect(added).toEqual([["en", bundle]]);
  });

  test("a failed import rejects, then retries", async () => {
    let n = 0;
    const load = makeLocaleLoader(() => {}, async () => { if (++n === 1) throw new Error("x"); return { default: {} }; });
    await expect(load("en")).rejects.toThrow();
    await load("en");
    expect(n).toBe(2);
  });
});
