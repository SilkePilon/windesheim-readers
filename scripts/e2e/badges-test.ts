// Badges: GET /me/badges, awarding once per badge, and the silent backfill.
// Runs after api-test (same server): its battles already earned some battle badges.
import { Database } from "bun:sqlite";
import { BADGE_IDS } from "../../shared/badges";

const PORT = process.env.E2E_PORT ?? "3200";
const LOG = process.env.E2E_LOG ?? "/tmp/wr-e2e/srv.log";
const base = `http://localhost:${PORT}/api`;
const H = { "content-type": "application/json", origin: "http://localhost:5173" };
function ok(cond: unknown, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok:", msg);
}
async function login(email: string) {
  await fetch(base + "/auth/sign-in/magic-link", { method: "POST", headers: H, body: JSON.stringify({ email, callbackURL: "/" }) });
  await Bun.sleep(300);
  const log = await Bun.file(LOG).text();
  const link = [...log.matchAll(new RegExp(`\\[magic-link\\] ${email.replace(/\./g, "\\.")}\\n\\s+(\\S+)`, "g"))].pop()![1]!.replace("5173", PORT);
  const r = await fetch(link, { redirect: "manual" });
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
const j = async (cookie: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(base + path, { method, headers: { ...H, cookie }, body: body ? JSON.stringify(body) : undefined });
  return [r.status, await r.json()] as const;
};
type Status = { id: string; earnedAt: string | null; progress?: { value: number; target: number } };
const badges = async (c: string) => new Map(((await j(c, "GET", "/me/badges"))[1] as Status[]).map((b) => [b.id, b]));

// ---- fresh user: full list with progress ----
const carol = await login("carol@student.windesheim.nl");
{
  const [st, list] = await j(carol, "GET", "/me/badges");
  ok(st === 200 && Array.isArray(list) && list.length === BADGE_IDS.length, `/me/badges lists all ${BADGE_IDS.length} badges`);
  ok(list.map((b: Status) => b.id).join() === BADGE_IDS.join(), "/me/badges is in catalogue order");
  ok(list.every((b: Status) => b.earnedAt === null), "a fresh user has earned nothing");
  const byId = new Map<string, Status>(list.map((b: Status) => [b.id, b]));
  ok(JSON.stringify(byId.get("cards_500")!.progress) === JSON.stringify({ value: 0, target: 500 }), "locked counted badge has progress 0 / 500");
  ok(byId.get("night_owl")!.progress === undefined, "badges without a metric have no progress");
}

// ---- card reviews: cards_50 exactly once ----
const [, readers] = await j(carol, "GET", "/readers");
const lessons = readers[0].lessons as { id: string }[];
const [, queue] = await j(carol, "GET", `/review/queue?lessonId=${lessons[0]!.id}`);
const cardId = queue[0].id as string;
const earnedFromReviews: string[] = [];
for (let i = 0; i < 52; i++) {
  const [, res] = await j(carol, "POST", "/review", { flashcardId: cardId, rating: 3 });
  earnedFromReviews.push(...res.newBadges);
  if (i === 0) ok(res.newBadges.includes("first_steps"), "first review → first_steps");
}
console.log("badges from 52 reviews:", earnedFromReviews.join(","));
ok(earnedFromReviews.filter((b) => b === "cards_50").length === 1, "50 reviews → cards_50, granted once");
ok(earnedFromReviews.filter((b) => b === "first_steps").length === 1, "first_steps is granted once");
ok(new Set(earnedFromReviews).size === earnedFromReviews.length, "no badge is announced twice");
{
  const b = await badges(carol);
  ok(!!b.get("cards_50")!.earnedAt && b.get("cards_50")!.progress === undefined, "/me/badges: cards_50 earned (no progress shown)");
  ok(JSON.stringify(b.get("cards_100")!.progress) === JSON.stringify({ value: 52, target: 100 }), "/me/badges: cards_100 progress 52 / 100");
  const me = (await j(carol, "GET", "/me"))[1];
  if (me.quests.some((q: { done: boolean }) => q.done)) ok(!!b.get("first_quest")!.earnedAt, "a completed daily quest → first_quest");
}

// ---- quiz: first_quiz + perfect_quiz once ----
const ANSWERS: Record<string, unknown> = {
  "Wat is het verschil tussen effectiviteit en efficiëntie?": 0,
  "Welke discipline hoort NIET bij bedrijfskunde volgens de reader?": 2,
  "Een tennisvereniging is ook een organisatie.": true,
  "HRM gaat over het beheer van financiële middelen.": false,
  "Bij ___ management worden langetermijnplannen geformuleerd en geïmplementeerd.": "strategisch",
  "Zet de stappen bij het opzetten van een organisatie in volgorde.": ["Doel definiëren", "Taken identificeren", "Taken en bevoegdheden toewijzen", "Hiërarchische structuur ontstaat"],
};
async function perfectQuiz(cookie: string, lessonId: string) {
  const [, quiz] = await j(cookie, "GET", `/lessons/${lessonId}/quiz?n=6`);
  for (const q of quiz.questions) await j(cookie, "POST", `/questions/${q.id}/check`, { sessionId: quiz.sessionId, answer: ANSWERS[q.prompt] });
  return (await j(cookie, "POST", `/lessons/${lessonId}/quiz/submit`, { sessionId: quiz.sessionId }))[1];
}
{
  const first = await perfectQuiz(carol, lessons[1]!.id);
  ok(first.correct === 6 && first.max === 6, "quiz answered perfectly (6/6)");
  ok(first.newBadges.includes("first_quiz") && first.newBadges.includes("perfect_quiz"), "perfect quiz → first_quiz + perfect_quiz");
  const again = await perfectQuiz(carol, lessons[1]!.id);
  ok(!again.newBadges.includes("first_quiz") && !again.newBadges.includes("perfect_quiz"), "a second perfect quiz grants neither again");
  ok(JSON.stringify((await badges(carol)).get("perfect_quiz_5")!.progress) === JSON.stringify({ value: 2, target: 5 }), "perfect_quiz_5 progress 2 / 5");
}

// ---- battle badges from api-test's battles ----
{
  const [student, bob, admin] = [await login("s1234567@student.windesheim.nl"), await login("bob@student.windesheim.nl"), await login("admin@windesheim.nl")];
  const [s, b, a] = [await badges(student), await badges(bob), await badges(admin)];
  ok(!!s.get("first_battle")!.earnedAt && !!b.get("first_battle")!.earnedAt, "played battles → first_battle");
  ok(!!b.get("battle_winner")!.earnedAt && JSON.stringify(b.get("battle_wins_5")!.progress) === JSON.stringify({ value: 1, target: 5 }), "podium win (3+ players) → battle_winner, wins 1 / 5");
  ok(!s.get("battle_winner")!.earnedAt, "wins with only 2 players don't count");
  ok(!!s.get("battle_perfect")!.earnedAt && !b.get("battle_perfect")!.earnedAt, "all answers right (5+ questions) → battle_perfect");
  ok(!!a.get("battle_host")!.earnedAt, "hosting a battle played to the end → battle_host");

  // ---- backfill: data that already earns badges, granted silently ----
  const dave = await login("dave@student.windesheim.nl");
  const daveId = (await j(dave, "GET", "/me"))[1].user.id as string;
  const carolId = (await j(carol, "GET", "/me"))[1].user.id as string;
  const bobId = (await j(bob, "GET", "/me"))[1].user.id as string;
  const sdb = new Database(LOG.replace(/[^/]+$/, "app.db"));
  const now = Date.now();
  const lastWeek = now - 8 * 864e5;
  const ins = sdb.prepare("insert into xp_event (id, user_id, amount, reason, created_at) values (?, ?, ?, ?, ?)");
  for (let i = 0; i < 120; i++) ins.run(`bf-card-${i}`, daveId, 3, "card", lastWeek + i * 1000);
  ins.run("bf-week-carol", carolId, 100, "quiz", lastWeek);
  ins.run("bf-week-bob", bobId, 50, "quiz", lastWeek);
  sdb.run("insert into user_stats (user_id, xp, streak, longest_streak, last_active_day) values (?, 1000, 0, 8, '2026-01-10')", [daveId]);
  for (const q of ["review_cards", "quiz_80", "earn_xp"])
    sdb.run("insert into quest_progress (user_id, day_key, quest_id, progress, completed_at) values (?, '2026-01-09', ?, 99, ?)", [daveId, q, lastWeek]);
  sdb.run("insert into attempt (id, user_id, lesson_id, kind, score, max_score, created_at) values ('bf-quiz', ?, ?, 'quiz', 6, 6, ?)", [daveId, lessons[2]!.id, lastWeek]);
  sdb.close();

  ok((await j(dave, "GET", "/me"))[1].badges.length === 0, "before the backfill dave has no badges");
  ok((await j(dave, "POST", "/admin/badges/backfill"))[0] === 403, "students cannot run the backfill");
  const [bst, run1] = await j(admin, "POST", "/admin/badges/backfill");
  console.log("backfill:", JSON.stringify(run1));
  ok(bst === 200 && run1.granted > 0, "backfill grants badges");
  const d = await badges(dave);
  const want = ["first_steps", "cards_50", "cards_100", "streak_3", "streak_7", "first_quest", "quests_daily_3", "first_quiz", "perfect_quiz", "weekly_top3", "weekly_first"];
  ok(want.every((id) => !!d.get(id)!.earnedAt), `backfill: dave earned ${want.join(", ")}`);
  ok(!d.get("cards_500")!.earnedAt && !d.get("streak_14")!.earnedAt, "backfill: nothing beyond the data");
  const c = await badges(carol);
  ok(!!c.get("weekly_top3")!.earnedAt && !c.get("weekly_first")!.earnedAt, "backfill: last week's #2 gets top 3, not #1");
  const [, run2] = await j(admin, "POST", "/admin/badges/backfill");
  ok(run2.granted === 0, "backfill is idempotent (second run grants nothing)");
  // Silent: the next action doesn't announce backfilled badges.
  const [, next] = await j(dave, "POST", "/review", { flashcardId: cardId, rating: 3 });
  ok(!next.newBadges.some((b: string) => want.includes(b)), "backfilled badges are never announced");
}
process.exit(0);
