import { Hono, type Context } from "hono";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { upgradeWebSocket, serveStatic } from "@hono/bun";
import { ZodError } from "zod";
import { auth } from "./auth";
import { env } from "./env";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { admin } from "./routes/admin";
import { learn } from "./routes/learn";
import { userFromHeaders } from "./middleware";
import { battleConnection } from "./live/battle";
import { limits } from "./limits";
import { magicLinkGate } from "./lib/email-gate";
import { AUTH_IP_HEADER, clientIp } from "./lib/client-ip";
import { magicLinkBody, publicIssues, updateUserBody } from "./lib/input";
import { LIMITS } from "../shared/limits";
import { og, spaShell } from "./og";

/** The request for better-auth, carrying our resolved client IP (a client-sent value is overwritten). */
function withClientIp(c: Context): Request {
  const headers = new Headers(c.req.raw.headers);
  const ip = clientIp(c);
  if (ip === "unknown") headers.delete(AUTH_IP_HEADER);
  else headers.set(AUTH_IP_HEADER, ip);
  return new Request(c.req.raw, { headers });
}

export const app = new Hono();
if (!env.isProd) app.use("/api/*", logger());

app.onError((err, c) => {
  // Issues are size-capped and never echo the input back.
  if (err instanceof ZodError) return c.json({ error: "VALIDATION", issues: publicIssues(err.issues) }, 400);
  // A body that isn't JSON at all.
  if (err instanceof SyntaxError && /JSON/i.test(err.message)) return c.json({ error: "VALIDATION", issues: [] }, 400);
  console.error(err);
  return c.json({ error: err.message || "INTERNAL" }, 500);
});

// Liveness/readiness probe for Docker and Kubernetes: also proves the database answers.
app.get("/api/health", (c) => {
  try {
    db.get(sql`select 1`);
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 503);
  }
});

// Flood guard first, so oversized requests count too.
app.use("/api/*", limits.api);

// ----- request body caps (shared/limits.ts): 413 PAYLOAD_TOO_LARGE before any parsing -----
const tooLarge = (c: Context) => c.json({ error: "PAYLOAD_TOO_LARGE" }, 413);
const bodyCaps = {
  default: bodyLimit({ maxSize: LIMITS.body.default, onError: tooLarge }),
  tutor: bodyLimit({ maxSize: LIMITS.body.tutor, onError: tooLarge }),
  admin: bodyLimit({ maxSize: LIMITS.body.admin, onError: tooLarge }),
  upload: bodyLimit({ maxSize: LIMITS.body.upload, onError: tooLarge }),
};
app.use("/api/*", (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const p = c.req.path;
  if (c.req.method === "POST" && p === "/api/admin/readers") return bodyCaps.upload(c, next);
  if (c.req.method === "POST" && /^\/api\/lessons\/[^/]+\/chat$/.test(p)) return bodyCaps.tutor(c, next);
  if (p.startsWith("/api/admin/")) return bodyCaps.admin(c, next);
  return bodyCaps.default(c, next);
});

// ----- rate limits (see server/limits.ts; the README has the table) -----
app.use("/api/auth/*", (c, next) =>
  c.req.method === "GET" && c.req.path === "/api/auth/get-session" ? limits.authSession(c, next) : limits.auth(c, next),
);
app.post("/api/auth/sign-in/*", limits.signIn);
// better-auth takes a few free-text fields too: check them before it (or the email gate) sees them.
const authBody = (schema: { parse: (v: unknown) => unknown }) => async (c: Context, next: () => Promise<void>) => {
  const body: unknown = await c.req.raw.clone().json().catch(() => undefined);
  if (body !== undefined) schema.parse(body);
  await next();
};
app.post("/api/auth/sign-in/magic-link", authBody(magicLinkBody));
app.post("/api/auth/update-user", authBody(updateUserBody));
// Hard, persisted limits on sign-in emails, checked before better-auth sends anything.
app.post("/api/auth/sign-in/magic-link", magicLinkGate);

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(withClientIp(c)));

app.get(
  "/api/battle/ws",
  limits.battleUpgrade,
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

// Link previews: dynamic battle invite images (the default card is the static public/og/*.png).
app.route("/og", og);

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
  // The SPA shell, with link-preview meta for the path (crawlers don't run JS).
  const shell = spaShell("./dist/index.html");
  app.get("/", shell);
  app.get("/index.html", shell);
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", shell);
}

