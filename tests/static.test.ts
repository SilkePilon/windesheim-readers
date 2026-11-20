// Production static serving (server/static.ts) on a fresh app with a temporary dist folder:
// immutable hashed assets, pre-compressed variants, no-cache shell/service worker, SPA fallback.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync } from "node:zlib";
import { Hono } from "hono";
import { mountStatic } from "../server/static";
import { shouldPrecompress } from "../scripts/precompress";

const dir = mkdtempSync(join(tmpdir(), "wr-static-"));
const js = `export const x = ${JSON.stringify("a".repeat(2048))};\n`;
mkdirSync(join(dir, "assets"));
writeFileSync(join(dir, "assets", "app-abc.js"), js);
writeFileSync(join(dir, "assets", "app-abc.js.br"), brotliCompressSync(js));
writeFileSync(join(dir, "sw.js"), "self.x = 1;");
writeFileSync(join(dir, "index.html"), "<html>file</html>");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const app = new Hono();
mountStatic(app, dir, (c) => c.html("<html>shell</html>"));
const IMMUTABLE = "public, max-age=31536000, immutable";

describe("mountStatic", () => {
  test("hashed assets are immutable", async () => {
    const r = await app.request("/assets/app-abc.js");
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe(IMMUTABLE);
    expect(r.headers.get("Content-Encoding")).toBeNull();
    expect(await r.text()).toBe(js);
  });

  test("the brotli copy is served to clients that accept it", async () => {
    const r = await app.request("/assets/app-abc.js", { headers: { "Accept-Encoding": "br" } });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Encoding")).toBe("br");
    expect(r.headers.get("Cache-Control")).toBe(IMMUTABLE);
  });

  test("a missing asset is a plain 404, never cached as immutable", async () => {
    const r = await app.request("/assets/missing.js");
    expect(r.status).toBe(404);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(await r.text()).toBe("Not Found");
  });

  test("the service worker revalidates", async () => {
    const r = await app.request("/sw.js");
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-cache");
  });

  test("app routes get the shell, revalidated", async () => {
    for (const p of ["/some/route", "/", "/index.html"]) {
      const r = await app.request(p);
      expect(r.status).toBe(200);
      expect(r.headers.get("Cache-Control")).toBe("no-cache");
      expect(await r.text()).toBe("<html>shell</html>");
    }
  });
});

describe("shouldPrecompress", () => {
  test("text assets over 1 KB only", () => {
    expect(shouldPrecompress("a.js", 2000)).toBe(true);
    expect(shouldPrecompress("a.css", 2000)).toBe(true);
    expect(shouldPrecompress("manifest.webmanifest", 2000)).toBe(true);
    expect(shouldPrecompress("a.js", 500)).toBe(false);
    expect(shouldPrecompress("a.png", 99999)).toBe(false);
    expect(shouldPrecompress("a.woff2", 99999)).toBe(false);
    expect(shouldPrecompress("a.js.br", 99999)).toBe(false);
    expect(shouldPrecompress("a.js.gz", 99999)).toBe(false);
  });
});
