import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import type { Plugin, ResolvedConfig } from "vite";

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);

/** Text files worth compressing; images and fonts are already compressed. */
const COMPRESSIBLE = /\.(js|css|svg|json|webmanifest)$/;

export const shouldPrecompress = (file: string, size: number) => COMPRESSIBLE.test(file) && size > 1024;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

/**
 * Build only: writes `file.br` (brotli 11) and `file.gz` (gzip 9) next to each compressible
 * file in the output, served by server/static.ts. Runs after the PWA plugin has written the
 * service worker (so sw.js is compressed too, and the copies are never in its precache list).
 */
export function precompress(): Plugin {
  let outDir = "dist";
  return {
    name: "wr-precompress",
    apply: "build",
    configResolved(config: ResolvedConfig) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle: {
      sequential: true,
      order: "post",
      async handler() {
        const jobs: Promise<void>[] = [];
        for await (const file of walk(outDir)) {
          if (!shouldPrecompress(file, (await stat(file)).size)) continue;
          jobs.push(
            readFile(file).then(async (buf) => {
              const [br, gzipped] = await Promise.all([
                brotli(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }),
                gz(buf, { level: 9 }),
              ]);
              await Promise.all([writeFile(`${file}.br`, br), writeFile(`${file}.gz`, gzipped)]);
            }),
          );
        }
        await Promise.all(jobs);
      },
    },
  };
}
