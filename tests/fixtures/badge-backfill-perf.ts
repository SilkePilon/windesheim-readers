// Run by tests/badges-db.test.ts against a throwaway DB: a synthetic backfill (USERS x EVENTS
// xp_events spread over ~20 weeks) timed, with a 5 ms timer sampling event-loop gaps meanwhile.
const { db, schema, runMigrations } = await import("../../server/db");
const { backfillBadges } = await import("../../server/lib/badges");
runMigrations();

const USERS = Number(process.env.PERF_USERS ?? 50);
const EVENTS = Number(process.env.PERF_EVENTS ?? 500);
const reasons = ["card", "card", "quiz", "explain", "battle", "battle_win", "open"];
const base = Date.now() - 140 * 864e5;
for (let u = 0; u < USERS; u++) {
  db.insert(schema.user).values({ id: `u${u}`, name: `u${u}`, email: `u${u}@student.windesheim.nl`, showOnLeaderboard: u % 7 !== 0 }).run();
  const rows = [];
  for (let e = 0; e < EVENTS; e++)
    rows.push({ id: `x${u}-${e}`, userId: `u${u}`, amount: 5 + ((u * 31 + e) % 20), reason: reasons[(u + e) % reasons.length], createdAt: new Date(base + e * 6.7 * 3600e3 + u * 60e3) });
  for (let i = 0; i < rows.length; i += 200) db.insert(schema.xpEvent).values(rows.slice(i, i + 200)).run();
}

let maxGap = 0;
let ticks = 0;
let last = performance.now();
const timer = setInterval(() => {
  const n = performance.now();
  maxGap = Math.max(maxGap, n - last);
  last = n;
  ticks++;
}, 5);
const t0 = performance.now();
const res = await backfillBadges({ force: true });
const ms = performance.now() - t0;
clearInterval(timer);
console.log(JSON.stringify({ ms, ticks, maxGap, users: res.users, granted: res.granted }));
process.exit(0);
