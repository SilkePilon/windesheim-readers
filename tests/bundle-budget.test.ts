import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialAssets, measure } from "../scripts/bundle-budget";

const html = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-a.js"></script>
<link rel="modulepreload" crossorigin href="/assets/x.js">
<link rel="modulepreload" crossorigin href="/assets/y.js">
<link rel="stylesheet" href="/assets/i.css">
</head><body></body></html>`;

describe("bundle budget", () => {
  test("initialAssets lists entry then modulepreload js", () => {
    expect(initialAssets(html)).toEqual(["/assets/index-a.js", "/assets/x.js", "/assets/y.js"]);
  });

  test("measure sums raw and gzip sizes", () => {
    const dir = mkdtempSync(join(tmpdir(), "budget-"));
    mkdirSync(join(dir, "assets"));
    const a = "console.log('a');".repeat(50);
    const b = "console.log('bb');".repeat(50);
    writeFileSync(join(dir, "assets/index-a.js"), a);
    writeFileSync(join(dir, "assets/x.js"), b);
    writeFileSync(
      join(dir, "index.html"),
      `<script type="module" crossorigin src="/assets/index-a.js"></script><link rel="modulepreload" crossorigin href="/assets/x.js">`,
    );
    const m = measure(dir);
    expect(m.files.length).toBe(2);
    expect(m.raw).toBe(a.length + b.length);
    expect(m.gzip).toBeGreaterThan(0);
  });
});
