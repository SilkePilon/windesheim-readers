import { websocket } from "@hono/bun";
import { env } from "./env";
import { runMigrations } from "./db";
import { recoverInterruptedJobs } from "./ai/pipeline";
import { recoverAudio } from "./ai/audio";
import { backfillBadges } from "./lib/badges";
import { sweepFeedbackScreenshots } from "./lib/feedback-store";
import { DAY } from "./lib/rate-limit";
import { app } from "./app";

runMigrations();
await recoverInterruptedJobs();
await recoverAudio();
// Existing accounts silently get the badges their data already earns (once per catalogue version).
void backfillBadges()
  .then((r) => r.users && console.log(`[badges] backfill: ${r.granted} badges for ${r.users} users`))
  .catch((err) => console.error("[badges] backfill failed", err));

// Screenshots of reports done for 90+ days are deleted: now, then once a day.
// (Tests import app.ts, not this file; the guard is for anything that imports it under bun test.)
if (process.env.NODE_ENV !== "test") {
  const sweep = () =>
    void sweepFeedbackScreenshots()
      .then((n) => n && console.log(`[feedback] removed ${n} old screenshots`))
      .catch((err) => console.error("[feedback] screenshot sweep failed", err));
  sweep();
  setInterval(sweep, DAY).unref?.();
}

// As PID 1 in a container nothing stops the process on SIGTERM unless we handle it.
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => process.exit(0));

console.log(`API listening on http://localhost:${env.port}`);

export default {
  port: env.port,
  fetch: app.fetch,
  // Backstop only: live/battle.ts already refuses messages over LIMITS.battleMessage (4 KB).
  // Bun closes a connection that sends a frame over this size.
  websocket: { ...websocket, maxPayloadLength: 64 * 1024 },
  idleTimeout: 120, // seconds; AI generation requests can take a while
};
