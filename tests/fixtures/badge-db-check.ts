// Run by tests/badges-db.test.ts in its own process with DATABASE_PATH set to a temp DB.
// Counts the SQL statements a card review's badge check runs, and exercises the weekly
// claim (atomic, catches up on quiet weeks). Prints one JSON result line.
import { Database } from "bun:sqlite";

const log: string[] = [];
let counting = false;
for (const m of ["prepare", "query"] as const) {
  const orig = Database.prototype[m] as (this: Database, sql: string) => unknown;
  (Database.prototype as unknown as Record<string, unknown>)[m] = function (this: Database, sql: string) {
    if (counting) log.push(sql);
    return orig.call(this, sql);
  };
}

const { db, schema, runMigrations } = await import("../../server/db");
const { checkBadges, maybeAwardWeekly, resetWeeklyCache, lessonMastery } = await import("../../server/lib/badges");
const { startOfPreviousWeek } = await import("../../server/lib/time");
runMigrations();

const now = Date.now();
const users = ["u1", "u2", "u3", "u4", "u5"];
for (const id of users) db.insert(schema.user).values({ id, name: id, email: `${id}@student.windesheim.nl`, showOnLeaderboard: id !== "u5" }).run();
db.insert(schema.reader).values({ id: "r", title: "R", fileName: "r.pdf", status: "ready", published: true }).run();
for (const [i, week] of [1, 1, 2].entries())
  db.insert(schema.lesson).values({ id: `l${i}`, readerId: "r", code: `${i}`, title: `L${i}`, week, position: i, startPage: 1, endPage: 2, status: "ready" }).run();
for (let i = 0; i < 4; i++) db.insert(schema.flashcard).values({ id: `f${i}`, lessonId: "l0", front: "q", back: "a" }).run();
const review = { due: new Date(), stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, learningSteps: 0, reps: 1, lapses: 0, state: 1, lastReview: new Date() };
db.insert(schema.cardReview).values({ userId: "u1", flashcardId: "f0", lessonId: "l0", ...review }).run();
db.insert(schema.xpEvent).values({ id: "x0", userId: "u1", amount: 3, reason: "card" }).run();

// ---- a card review's badge check (user nowhere near mastery) ----
const ctx = { prevActiveDay: null, streak: 1, lessonId: "l0" };
const warm = await checkBadges("u1", ["xp", "card", "mastery"], ctx); // first_steps + the weekly catch-up
counting = true;
const again = await checkBadges("u1", ["xp", "card", "mastery"], ctx);
counting = false;
const reviewQueries = [...log];
const mastery = await lessonMastery("u1", "l0"); // 1 learning card of 4 → 0.125 * 0.3

// ---- crossing 0.8 recomputes once ----
db.insert(schema.lessonProgress).values({ userId: "u1", lessonId: "l0", summaryRead: true, bestQuiz: 1, bestExplain: 1 }).run();
for (let i = 1; i < 4; i++) db.insert(schema.cardReview).values({ userId: "u1", flashcardId: `f${i}`, lessonId: "l0", ...review, state: 2 }).run();
db.update(schema.cardReview).set({ state: 2 }).run();
const crossed = await checkBadges("u1", ["card", "mastery"], ctx);
log.length = 0;
counting = true;
await checkBadges("u1", ["card", "mastery"], ctx);
counting = false;
const afterCrossQueries = log.length;

// ---- weekly: a failure leaves the week unclaimed; quiet weeks are caught up ----
const prev = startOfPreviousWeek(new Date(now));
const twoBack = startOfPreviousWeek(prev);
const xp = (id: string, userId: string, amount: number, at: Date) =>
  db.insert(schema.xpEvent).values({ id, userId, amount, reason: "quiz", createdAt: at }).run();
// Last week: u2 > u3 > u4. Two weeks back (followed by last week's claim being missing too): u4 > u3 > u2.
xp("w1", "u2", 90, new Date(prev.getTime() + 3600e3));
xp("w2", "u3", 60, new Date(prev.getTime() + 3600e3));
xp("w3", "u4", 30, new Date(prev.getTime() + 3600e3));
xp("w4", "u4", 90, new Date(twoBack.getTime() + 3600e3));
xp("w5", "u3", 60, new Date(twoBack.getTime() + 3600e3));
xp("w6", "u2", 30, new Date(twoBack.getTime() + 3600e3));
// A hidden user tops the older week: ranks #1 there, so u4 is only #2 and gets no weekly_first.
xp("w7", "u5", 200, new Date(twoBack.getTime() + 3600e3));
// Undo the claims the warm-up made (it ran on empty weeks).
db.delete(schema.setting).run();
resetWeeklyCache();
const sqlite = new Database(process.env.DATABASE_PATH!);
sqlite.run("create trigger fail_badge before insert on user_badge begin select raise(abort, 'boom'); end");
let failed = false;
try {
  await maybeAwardWeekly("u2", new Date(now));
} catch {
  failed = true;
}
const claimsAfterFailure = db.select().from(schema.setting).all().length;
sqlite.run("drop trigger fail_badge");
const u2 = await maybeAwardWeekly("u2", new Date(now));
const badgesOf = (id: string) => db.select().from(schema.userBadge).all().filter((b) => b.userId === id).map((b) => b.badge).sort();
const secondRun = await maybeAwardWeekly("u2", new Date(now));
resetWeeklyCache();
const afterReset = await maybeAwardWeekly("u2", new Date(now));

console.log(
  JSON.stringify({
    warm,
    again,
    reviewQueries,
    mastery,
    crossed,
    afterCrossQueries,
    failed,
    claimsAfterFailure,
    u2,
    u2All: badgesOf("u2"),
    u3All: badgesOf("u3"),
    u4All: badgesOf("u4"),
    u5All: badgesOf("u5"),
    secondRun,
    afterReset,
  }),
);
process.exit(0);
