import type { Handler, Hono, MiddlewareHandler } from "hono";
import { serveStatic } from "@hono/bun";

/** Hashed build output: the name changes with the content, so browsers may keep it forever. */
export const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * Production file serving from the Vite build in `root`:
 * - the app shell and service worker files revalidate on every load, or clients get stuck on
 *   an old build;
 * - hashed `/assets/*` files are immutable, and a missing one is a plain 404 (never the shell,
 *   which a stale client would otherwise try to run as a script);
 * - `.br` / `.gz` copies written at build time (scripts/precompress.ts) are served to clients
 *   that accept them;
 * - every other GET gets the SPA shell (`/` and `/index.html` included, so the shell is the
 *   one with link-preview meta, not the raw file).
 * `wrap` (dynamic compression) runs on the shell routes only: assets are pre-compressed.
 */
export function mountStatic(app: Hono<any>, root: string, shell: Handler, wrap?: MiddlewareHandler): void {
  app.use("/*", async (c, next) => {
    await next();
    const noCache =
      /^\/(sw\.js|registerSW\.js|workbox-[\w-]+\.js|manifest\.webmanifest)$/.test(c.req.path) ||
      c.res.headers.get("Content-Type")?.startsWith("text/html");
    if (noCache) c.header("Cache-Control", "no-cache");
  });
  const shellRoute = (path: string) => (wrap ? app.get(path, wrap, shell) : app.get(path, shell));
  shellRoute("/");
  shellRoute("/index.html");
  app.get(
    "/assets/*",
    serveStatic({ root, precompressed: true, onFound: (_path, c) => void c.header("Cache-Control", IMMUTABLE) }),
    (c) => {
      c.header("Cache-Control", "no-store");
      return c.text("Not Found", 404);
    },
  );
  app.use("/*", serveStatic({ root, precompressed: true }));
  shellRoute("*");
}
