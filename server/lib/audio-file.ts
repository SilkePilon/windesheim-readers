// Serving one MP3 chapter file with Range support (lesson audio and weekly episodes share it).
import type { Context } from "hono";
import { parseRange } from "./audio-codec";

/** 404 when the file is missing, 206/416 for a Range request, else the whole file. */
export async function serveChapter(c: Context, path: string): Promise<Response> {
  const f = Bun.file(path);
  if (!(await f.exists())) return c.json({ error: "NOT_FOUND" }, 404);
  const size = f.size;
  // /api stays network-only in the service worker; the browser may cache it privately (URLs carry ?v=).
  const headers: Record<string, string> = { "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=86400" };
  const range = parseRange(c.req.header("range"), size);
  if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  if (range)
    return new Response(f.slice(range.start, range.end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": String(range.end - range.start + 1) },
    });
  return new Response(f, { headers: { ...headers, "Content-Length": String(size) } });
}
