import { Hono } from "hono";
import { logger } from "hono/logger";
import { upgradeWebSocket, websocket, serveStatic } from "@hono/bun";
import { ZodError } from "zod";
import { auth } from "./auth";
import { env } from "./env";
import { runMigrations } from "./db";
import { admin } from "./routes/admin";
import { learn } from "./routes/learn";
import { userFromHeaders } from "./middleware";
import { battleConnection } from "./live/battle";
import { recoverInterruptedJobs } from "./ai/pipeline";
import { backfillBadges } from "./lib/badges";

runMigrations();
await recoverInterruptedJobs();
// Existing accounts silently get the badges their data already earns (once per catalogue version).
void backfillBadges()
  .then((r) => r.users && console.log(`[badges] backfill: ${r.granted} badges for ${r.users} users`))
  .catch((err) => console.error("[badges] backfill failed", err));

const app = new Hono();
if (!env.isProd) app.use("/api/*", logger());

app.onError((err, c) => {
  if (err instanceof ZodError) return c.json({ error: "VALIDATION", issues: err.issues }, 400);
  console.error(err);
  return c.json({ error: err.message || "INTERNAL" }, 500);
});

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get(
  "/api/battle/ws",
  upgradeWebSocket(async (c) => {
    const user = await userFromHeaders(c.req.raw.headers);
    if (!user) {
      return {
        onOpen(_e, ws) {
          ws.send(JSON.stringify({ t: "error", error: "UNAUTHORIZED" }));
          ws.close(4401, "unauthorized");
        },
      };
    }
    const conn = battleConnection(user);
    return {
      onMessage(e, ws) {
        void conn.onMessage(String(e.data), ws);
      },
      onClose(_e, ws) {
        conn.onClose(ws);
      },
    };
  }),
);

app.route("/api/admin", admin);
app.route("/api", learn);
app.all("/api/*", (c) => c.json({ error: "NOT_FOUND" }, 404));

if (env.isProd) {
  // The app shell and service worker files must revalidate on every load, or clients get
  // stuck on an old build. Hashed /assets/* files are left to the default.
  app.use("/*", async (c, next) => {
    await next();
    const p = c.req.path;
    const noCache =
      /^\/(sw\.js|registerSW\.js|workbox-[\w-]+\.js|manifest\.webmanifest)$/.test(p) ||
      c.res.headers.get("Content-Type")?.startsWith("text/html");
    if (noCache) c.header("Cache-Control", "no-cache");
  });
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

console.log(`API listening on http://localhost:${env.port}`);

export default {
  port: env.port,
  fetch: app.fetch,
  websocket,
  idleTimeout: 120, // seconds; AI generation requests can take a while
};
