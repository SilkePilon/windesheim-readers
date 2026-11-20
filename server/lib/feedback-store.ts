/**
 * Screenshots of feedback reports: UPLOAD_DIR/feedback/<id>.<ext>. Only images whose magic
 * bytes say PNG, JPEG or WebP are stored, file names are checked before any path is built,
 * and a retention sweep deletes old screenshots of finished reports.
 */
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { HOUR } from "./rate-limit";

export type ImageExt = "webp" | "jpeg" | "png";

/** Above this many bytes in the feedback directory, new reports are saved without their screenshot. */
export const FEEDBACK_DIR_CAP = 500 * 1024 * 1024;
/** A report that has been `done` this long (by updatedAt) loses its screenshot. */
export const RETENTION_MS = 90 * 24 * HOUR;

export const CONTENT_TYPES: Record<ImageExt, string> = { webp: "image/webp", jpeg: "image/jpeg", png: "image/png" };

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const NAME = /^[A-Za-z0-9_-]{1,100}\.(webp|jpeg|png)$/;

export const feedbackDir = () => join(env.uploadDir, "feedback");

/** The full path of a stored screenshot, or null for a name we would never have written. */
export function screenshotPath(name: string): string | null {
  return NAME.test(name) ? join(feedbackDir(), name) : null;
}

/** The content type of a stored screenshot name. */
export const screenshotType = (name: string) => CONTENT_TYPES[name.slice(name.lastIndexOf(".") + 1) as ImageExt];

const startsWith = (b: Uint8Array, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);
const ascii = (s: string) => [...s].map((ch) => ch.charCodeAt(0));

/** What the bytes are, going by their signature only (the declared type and file name don't count). */
export function sniffImage(bytes: Uint8Array): ImageExt | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "webp";
  return null;
}

/** Total size of the files in the feedback directory (0 when it doesn't exist yet). */
export async function feedbackDirBytes(): Promise<number> {
  let names: string[];
  try {
    names = await readdir(feedbackDir());
  } catch {
    return 0;
  }
  let total = 0;
  for (const name of names) {
    try {
      const s = await stat(join(feedbackDir(), name));
      if (s.isFile()) total += s.size;
    } catch {
      // Deleted meanwhile.
    }
  }
  return total;
}

/** Writes the screenshot and returns its file name (`<id>.<ext>`). */
export async function saveScreenshot(id: string, bytes: Uint8Array, ext: ImageExt): Promise<string> {
  if (!ID.test(id) || !(ext in CONTENT_TYPES)) throw new Error("Bad screenshot name");
  const name = `${id}.${ext}`;
  await mkdir(feedbackDir(), { recursive: true });
  await Bun.write(join(feedbackDir(), name), bytes);
  return name;
}

/** Deletes a stored screenshot. A missing file, or a name we would never have written, is ignored. */
export async function deleteScreenshot(name: string): Promise<void> {
  const path = screenshotPath(name);
  if (!path) return;
  try {
    await unlink(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

/**
 * Deletes the screenshots of reports that have been `done` for RETENTION_MS or longer and
 * clears their column (the text stays, updatedAt is left alone). Returns how many were cleared.
 */
export async function sweepFeedbackScreenshots(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - RETENTION_MS);
  const rows = db
    .select({ id: schema.feedback.id, screenshot: schema.feedback.screenshot })
    .from(schema.feedback)
    .where(and(eq(schema.feedback.status, "done"), isNotNull(schema.feedback.screenshot), lte(schema.feedback.updatedAt, cutoff)))
    .all();
  let cleared = 0;
  for (const r of rows) {
    try {
      await deleteScreenshot(r.screenshot!);
    } catch (e) {
      console.error(`[feedback] could not delete screenshot of ${r.id}`, e);
      continue;
    }
    db.update(schema.feedback).set({ screenshot: null }).where(eq(schema.feedback.id, r.id)).run();
    cleared++;
  }
  return cleared;
}
