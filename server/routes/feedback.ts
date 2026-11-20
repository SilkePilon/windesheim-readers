/**
 * Feedback and issue reports. `feedback`: POST /api/feedback for any signed-in user.
 * `adminFeedback`: the admin inbox under /api/admin/feedback, behind the same guards as admin.ts.
 */
import { Hono, type Context } from "hono";
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";
import { LIMITS } from "../../shared/limits";
import { db, schema } from "../db";
import { env } from "../env";
import { limits } from "../limits";
import { displayName, requireAdmin, requireUser, type AppEnv } from "../middleware";
import * as input from "../lib/input";
import {
  FEEDBACK_DIR_CAP,
  deleteScreenshot,
  feedbackDirBytes,
  saveScreenshot,
  screenshotPath,
  screenshotType,
  sniffImage,
} from "../lib/feedback-store";

const invalid = (c: Context) => c.json({ error: "VALIDATION", issues: [] }, 400);

export const feedback = new Hono<AppEnv>().post("/", requireUser, limits.feedback, async (c) => {
  const body = await c.req.parseBody();

  // The context is a JSON string field: size-check it before parsing.
  const rawContext = body.context;
  if (typeof rawContext !== "string") return invalid(c);
  if (new TextEncoder().encode(rawContext).length > LIMITS.feedback.contextBytes) return invalid(c);
  let context: unknown;
  try {
    context = JSON.parse(rawContext);
  } catch {
    return invalid(c);
  }
  const data = input.feedbackCreate.parse({ type: body.type, message: body.message, context });

  // Everything is checked before anything is written.
  let image: { bytes: Uint8Array; ext: NonNullable<ReturnType<typeof sniffImage>> } | null = null;
  const file = body.screenshot;
  if (file !== undefined && file !== "") {
    if (!(file instanceof File)) return c.json({ error: "BAD_IMAGE" }, 400);
    if (file.size > LIMITS.feedback.screenshotBytes) return c.json({ error: "FILE_TOO_LARGE" }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = sniffImage(bytes);
    if (!ext) return c.json({ error: "BAD_IMAGE" }, 400);
    image = { bytes, ext };
  }

  const id = nanoid();
  // Millisecond timestamps (the column default is whole seconds): the inbox sorts by createdAt.
  const at = new Date();
  let screenshot: string | null = null;
  let screenshotDropped = false;
  if (image) {
    if ((await feedbackDirBytes()) + image.bytes.length > FEEDBACK_DIR_CAP) screenshotDropped = true;
    else screenshot = await saveScreenshot(id, image.bytes, image.ext);
  }
  try {
    db.insert(schema.feedback)
      .values({
        id,
        userId: c.get("user").id,
        type: data.type,
        message: data.message,
        context: data.context,
        screenshot,
        createdAt: at,
        updatedAt: at,
      })
      .run();
  } catch (e) {
    if (screenshot) await deleteScreenshot(screenshot);
    throw e;
  }
  return c.json(screenshotDropped ? { id, screenshotDropped: true as const } : { id }, 201);
});

const notFound = (c: Context) => c.json({ error: "NOT_FOUND" }, 404);

export const adminFeedback = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)

  .get("/", async (c) => {
    const f = input.feedbackFilter.parse({ status: c.req.query("status") || undefined, type: c.req.query("type") || undefined });
    const where: SQL[] = [];
    if (f.status) where.push(eq(schema.feedback.status, f.status));
    if (f.type) where.push(eq(schema.feedback.type, f.type));
    const rows = db
      .select({
        id: schema.feedback.id,
        type: schema.feedback.type,
        message: schema.feedback.message,
        context: schema.feedback.context,
        status: schema.feedback.status,
        githubUrl: schema.feedback.githubUrl,
        screenshot: schema.feedback.screenshot,
        createdAt: schema.feedback.createdAt,
        updatedAt: schema.feedback.updatedAt,
        userId: schema.user.id,
        name: schema.user.name,
        nickname: schema.user.nickname,
        email: schema.user.email,
      })
      .from(schema.feedback)
      .leftJoin(schema.user, eq(schema.user.id, schema.feedback.userId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(schema.feedback.createdAt), desc(schema.feedback.id))
      .all();
    const items = rows.map(({ screenshot, userId, name, nickname, email, ...r }) => ({
      ...r,
      hasScreenshot: !!screenshot,
      reporter: userId && name !== null && email !== null ? { name: displayName({ name, nickname, email }), email } : null,
    }));
    return c.json({ repo: env.githubRepo, items });
  })

  .get("/count", (c) => {
    const r = db.select({ n: count() }).from(schema.feedback).where(eq(schema.feedback.status, "new")).get();
    return c.json({ new: r?.n ?? 0 });
  })

  .patch("/:id", async (c) => {
    const b = input.feedbackPatch.parse(await c.req.json());
    const r = db
      .update(schema.feedback)
      .set({
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.githubUrl !== undefined ? { githubUrl: b.githubUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.feedback.id, c.req.param("id")))
      .returning({ id: schema.feedback.id })
      .all();
    if (!r.length) return notFound(c);
    return c.json({ ok: true });
  })

  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const row = db.select({ screenshot: schema.feedback.screenshot }).from(schema.feedback).where(eq(schema.feedback.id, id)).get();
    if (!row) return notFound(c);
    db.delete(schema.feedback).where(eq(schema.feedback.id, id)).run();
    if (row.screenshot) await deleteScreenshot(row.screenshot);
    return c.json({ ok: true });
  })

  .get("/:id/screenshot", async (c) => {
    const row = db
      .select({ screenshot: schema.feedback.screenshot })
      .from(schema.feedback)
      .where(eq(schema.feedback.id, c.req.param("id")))
      .get();
    // The path comes from the stored name, never from the request, and only for names we write.
    const path = row?.screenshot ? screenshotPath(row.screenshot) : null;
    const file = path ? Bun.file(path) : null;
    if (!file || !(await file.exists())) return notFound(c);
    return new Response(file, {
      headers: {
        "Content-Type": screenshotType(row!.screenshot!),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  });
