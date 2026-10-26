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

runMigrations();
await recoverInterruptedJobs();

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
