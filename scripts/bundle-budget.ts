import { readFileSync } from "node:fs";
import { join } from "node:path";

export const BUDGET_RAW_BYTES = 800_000;

export function initialAssets(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*>/g)) {
    if (!/type="module"/.test(m[0])) continue;
    const src = /\bsrc="([^"]+)"/.exec(m[0]);
    if (src) out.push(src[1]);
  }
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    if (!/rel="modulepreload"/.test(m[0])) continue;
    const href = /\bhref="([^"]+)"/.exec(m[0]);
    if (href && href[1].endsWith(".js")) out.push(href[1]);
  }
  return out;
}

export function measure(distDir: string) {
  const html = readFileSync(join(distDir, "index.html"), "utf8");
  const files = initialAssets(html).map((path) => {
    const buf = readFileSync(join(distDir, path.replace(/^\//, "")));
    return { path, raw: buf.length, gzip: Bun.gzipSync(buf).length };
  });
  return {
    files,
    raw: files.reduce((n, f) => n + f.raw, 0),
    gzip: files.reduce((n, f) => n + f.gzip, 0),
  };
}

if (import.meta.main) {
  const m = measure(join(import.meta.dir, "..", "dist"));
  const kb = (n: number) => (n / 1024).toFixed(1).padStart(9) + " kB";
  for (const f of m.files) console.log(`${kb(f.raw)} ${kb(f.gzip)}  ${f.path}`);
  console.log(`${kb(m.raw)} ${kb(m.gzip)}  TOTAL (budget ${BUDGET_RAW_BYTES} bytes raw)`);
  console.log(`total raw bytes: ${m.raw}`);
  if (m.raw > BUDGET_RAW_BYTES) {
    console.error("Over budget");
    process.exit(1);
  }
}
