// Screenshot storage for feedback reports: magic-byte sniffing, file names and the retention sweep.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { HOUR } from "../server/lib/rate-limit";
import {
  FEEDBACK_DIR_CAP,
  RETENTION_MS,
  deleteScreenshot,
  feedbackDirBytes,
  saveScreenshot,
  sniffImage,
  sweepFeedbackScreenshots,
} from "../server/lib/feedback-store";

runMigrations();

const bytes = (...b: (number | string)[]) =>
  new Uint8Array(b.flatMap((x) => (typeof x === "string" ? [...new TextEncoder().encode(x)] : [x])));

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, "JFIF");
const WEBP = bytes("RIFF", 0x24, 0, 0, 0, "WEBPVP8 ");

describe("sniffImage", () => {
  test("recognises PNG, JPEG and WebP signatures", () => {
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(JPEG)).toBe("jpeg");
    expect(sniffImage(WEBP)).toBe("webp");
  });

  test("refuses SVG, HTML, a RIFF that isn't WebP, and short input", () => {
    expect(sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(bytes("<html><body>hi</body></html>"))).toBeNull();
    expect(sniffImage(bytes("RIFF", 0x24, 0, 0, 0, "WAVEfmt "))).toBeNull();
    expect(sniffImage(bytes(0x89, 0x50))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe("storage", () => {
  test("constants", () => {
    expect(FEEDBACK_DIR_CAP).toBe(500 * 1024 * 1024);
    expect(RETENTION_MS).toBe(90 * 24 * HOUR);
  });

  test("saves under UPLOAD_DIR/feedback/<id>.<ext>, counts bytes, deletes (missing file is fine)", async () => {
    const before = await feedbackDirBytes();
    const name = await saveScreenshot("store-a", PNG, "png");
    expect(name).toBe("store-a.png");
    expect(existsSync(join(env.uploadDir, "feedback", "store-a.png"))).toBe(true);
    expect(await feedbackDirBytes()).toBe(before + PNG.length);
    await deleteScreenshot(name);
    expect(existsSync(join(env.uploadDir, "feedback", "store-a.png"))).toBe(false);
    await deleteScreenshot(name); // already gone: no throw
  });

  test("refuses ids and names that could leave the feedback directory", async () => {
    expect(saveScreenshot("../evil", PNG, "png")).rejects.toThrow();
    expect(saveScreenshot("a/b", PNG, "png")).rejects.toThrow();
    expect(saveScreenshot("ok", PNG, "svg" as never)).rejects.toThrow();
    // A crafted name is ignored, never resolved outside the directory.
    await deleteScreenshot("../../app.db");
    expect(existsSync(env.databasePath)).toBe(true);
  });
});

describe("sweepFeedbackScreenshots", () => {
  test("deletes only screenshots of reports done for 90+ days, nulls the column, leaves the rest", async () => {
    const now = Date.now();
    const ctx = { path: "/", appVersion: "dev", userAgent: "", browser: "", viewport: "1x1", locale: "nl", theme: "light", standalone: false };
    const rows = [
      { id: "sweep-old-done", status: "done" as const, age: RETENTION_MS + HOUR },
      { id: "sweep-exact-done", status: "done" as const, age: RETENTION_MS },
      { id: "sweep-young-done", status: "done" as const, age: RETENTION_MS - HOUR },
      { id: "sweep-old-new", status: "new" as const, age: 2 * RETENTION_MS },
      { id: "sweep-old-progress", status: "in_progress" as const, age: 2 * RETENTION_MS },
    ];
    for (const r of rows) {
      const screenshot = await saveScreenshot(r.id, PNG, "png");
      const at = new Date(now - r.age);
      db.insert(schema.feedback)
        .values({ id: r.id, userId: null, type: "bug", message: "a long enough message", context: ctx, screenshot, status: r.status, createdAt: at, updatedAt: at })
        .run();
    }
    // A done row whose file is already gone is still cleared.
    const at = new Date(now - 2 * RETENTION_MS);
    db.insert(schema.feedback)
      .values({ id: "sweep-gone", userId: null, type: "bug", message: "a long enough message", context: ctx, screenshot: "sweep-gone.png", status: "done", createdAt: at, updatedAt: at })
      .run();

    expect(await sweepFeedbackScreenshots(now)).toBe(3);

    const get = (id: string) => db.select().from(schema.feedback).where(eq(schema.feedback.id, id)).get()!;
    const file = (id: string) => existsSync(join(env.uploadDir, "feedback", `${id}.png`));
    for (const id of ["sweep-old-done", "sweep-exact-done", "sweep-gone"]) {
      expect(get(id).screenshot).toBeNull();
      expect(file(id)).toBe(false);
      expect(get(id).message).toBe("a long enough message"); // the text stays
    }
    for (const id of ["sweep-young-done", "sweep-old-new", "sweep-old-progress"]) {
      expect(get(id).screenshot).toBe(`${id}.png`);
      expect(file(id)).toBe(true);
    }
    // The sweep doesn't bump updatedAt.
    expect(get("sweep-old-done").updatedAt.getTime()).toBe(now - RETENTION_MS - HOUR);
    expect(await sweepFeedbackScreenshots(now)).toBe(0);
  });
});
