import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { auth, type SessionUser } from "./auth";
import { db, schema } from "./db";
import { env } from "./env";

export type AppEnv = { Variables: { user: SessionUser } };

export async function userFromHeaders(headers: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const u = session.user as SessionUser;
  // Keep ADMIN_EMAILS authoritative: promote on the fly.
  if (u.role !== "admin" && env.adminEmails.includes(u.email.toLowerCase())) {
    await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, u.id));
    u.role = "admin";
  }
  return u;
}

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const u = await userFromHeaders(c.req.raw.headers);
  if (!u) return c.json({ error: "UNAUTHORIZED" }, 401);
  c.set("user", u);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("user")?.role !== "admin") return c.json({ error: "FORBIDDEN" }, 403);
  await next();
});

export function displayName(u: { nickname: string | null; name: string; email: string }) {
  return u.nickname?.trim() || u.name.split(/[ .]/)[0] || u.email.split("@")[0]!;
}
