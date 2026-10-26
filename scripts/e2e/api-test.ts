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
  const link = [...log.matchAll(new RegExp(`\\[magic-link\\] ${email.replace(".", "\\.")}\\n\\s+(\\S+)`, "g"))].pop()![1]!.replace("5173", PORT);
  const r = await fetch(link, { redirect: "manual" });
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
const j = async (cookie: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(base + path, { method, headers: { ...H, cookie }, body: body ? JSON.stringify(body) : undefined });
  return [r.status, await r.json()] as const;
};
const admin = await login("admin@windesheim.nl");
const student = await login("s1234567@student.windesheim.nl");
const bob = await login("bob@student.windesheim.nl");
console.log("student me:", (await j(student, "GET", "/me"))[1].user.role);
ok((await j(bob, "GET", "/me"))[1].user.locale === null, "a fresh user's locale is null (never chosen)");
ok((await j(bob, "PATCH", "/me", { locale: "en" }))[0] === 200, "PATCH /me locale en");
ok((await j(bob, "GET", "/me"))[1].user.locale === "en", "PATCH /me locale persists");
ok((await j(student, "GET", "/admin/readers"))[0] === 403, "students cannot access admin");
// AI key validation + model list (real network calls; bogus key must be rejected)
const [, val] = await j(admin, "POST", "/admin/settings/ai/validate", { provider: "google", apiKey: "bogus" });
console.log("validate bogus:", JSON.stringify(val));
ok(val.ok === false, "bogus Google key is not ok");
if (val.invalid !== true) console.log("note: invalid!=true (no network or non-auth error):", val.error);
const [orSt, orModels] = await j(admin, "POST", "/admin/settings/ai/models", { provider: "openrouter" });
console.log("openrouter models:", orSt, Array.isArray(orModels) ? orModels.length : JSON.stringify(orModels));
ok(Array.isArray(orModels) || orSt === 502, "openrouter models returns array (or 502 without network)");
ok((await j(student, "POST", "/admin/settings/ai/validate", { provider: "google" }))[0] === 403, "students cannot validate keys");
{
  // Saving a single provider key must work (regression: zod v4 z.record(enum) required ALL providers → 400)
  const [s1, a1] = await j(admin, "PUT", "/admin/settings/ai", { keys: { openrouter: "sk-or-e2e-bogus" } });
  ok(s1 === 200 && a1.keys.openrouter.stored === true, "admin can save a single provider key");
  const [s2, a2] = await j(admin, "PUT", "/admin/settings/ai", { keys: { openrouter: null } });
  ok(s2 === 200 && a2.keys.openrouter.stored === false, "admin can remove a single provider key");
  ok((await j(admin, "PUT", "/admin/settings/ai", { keys: { nope: "x" } }))[0] === 400, "unknown provider key is rejected");
}
const [, readers] = await j(student, "GET", "/readers");
const lesson = readers[0].lessons[0];
ok(readers[0].lastStudiedLessonId === null, "/readers: lastStudiedLessonId is null before studying");
console.log("lessons visible:", readers[0].lessons.length, lesson.code);
const [, detail] = await j(student, "GET", `/lessons/${lesson.id}`);
console.log("detail:", detail.quizCount, detail.flashcardCount, detail.openCount);
// quiz (server-side sessions; only the first check counts)
const [, quiz] = await j(student, "GET", `/lessons/${lesson.id}/quiz?n=10`);
const qs = quiz.questions;
ok(typeof quiz.sessionId === "string" && qs.length > 0, "quiz session created");
ok(typeof quiz.xpPerCorrect === "number" && quiz.xpPerCorrect >= 0, "quiz GET returns numeric xpPerCorrect");
ok(!JSON.stringify(qs).includes("explanation"), "quiz questions leak no explanations");
console.log("quiz qs:", qs.map((q: any) => q.type).join(","));
for (const q of qs) {
  await j(student, "POST", `/questions/${q.id}/check`, { sessionId: quiz.sessionId, answer: q.type === "fill" ? "Strategisch" : q.type === "mc" ? 0 : q.type === "tf" ? true : q.items });
}
const [, sub] = await j(student, "POST", `/lessons/${lesson.id}/quiz/submit`, { sessionId: quiz.sessionId });
ok(typeof sub.gained === "number", "quiz submit awards xp");
console.log("submit:", sub);
// read + review
console.log("read:", (await j(student, "POST", `/lessons/${lesson.id}/read`))[1].gained);
const [, queue] = await j(student, "GET", `/review/queue?lessonId=${lesson.id}`);
ok(queue.length > 0 && queue.every((c: any) => ["again", "good", "easy"].every((k) => typeof c.intervals?.[k] === "number") && c.intervals.again < c.intervals.good && c.intervals.good < c.intervals.easy), "queue cards have intervals again < good < easy (ms)");
ok((await j(admin, "POST", "/admin/readers/e2e-reader/retry"))[1].action === "none", "retry on a healthy ready reader is a no-op");
{
  // A failed, unpublished, lesson-less reader (oldest, so it never becomes readers[0]): retry would re-extract.
  const { Database } = await import("bun:sqlite");
  const sdb = new Database(LOG.replace(/[^/]+$/, "app.db"));
  sdb.run("insert into reader (id, title, file_name, status, error, created_at) values ('e2e-broken', 'Broken', 'x.pdf', 'error', 'boom', 0)");
  sdb.close();
  const both = await Promise.all([1, 2].map(() => j(admin, "POST", "/admin/readers/e2e-broken/retry")));
  ok(both.map(([, b]) => b.action).sort().join() === "extract,none", "two simultaneous retries start exactly one job");
}
for (const c of queue) await j(student, "POST", "/review", { flashcardId: c.id, rating: 3 });
console.log("reviewed", queue.length, "due now:", (await j(student, "GET", "/review/queue"))[1].length);
const [, me] = await j(student, "GET", "/me");
ok(
  Array.isArray(me.quests) && me.quests.length === 3 &&
    me.quests.every((q: any) => q.id && q.target > 0 && q.reward > 0 && typeof q.progress === "number" && typeof q.done === "boolean"),
  "/me returns exactly 3 quests with id/target/reward/progress/done",
);
console.log("stats:", me.stats, me.badges.map((b: any) => b.id));
ok((await j(student, "GET", "/readers"))[1][0].lastStudiedLessonId === lesson.id, "/readers: lastStudiedLessonId is the studied lesson");
const [, l2] = await j(student, "GET", `/lessons/${lesson.id}`);
console.log("progress:", l2.progress);
await j(bob, "PATCH", "/me", { nickname: "Bobby" });
await j(bob, "POST", `/lessons/${lesson.id}/read`);
console.log("leaderboard:", JSON.stringify((await j(student, "GET", "/leaderboard?period=week"))[1]));
console.log("invalid review:", (await j(student, "POST", "/review", { flashcardId: "x", rating: 9 }))[0]);

// battle
function ws(cookie: string) {
  const s = new WebSocket(`ws://localhost:${PORT}/api/battle/ws`, { headers: { cookie } } as any);
  const msgs: any[] = [];
  s.onmessage = (e) => msgs.push(JSON.parse(e.data as string));
  return { s, msgs, ready: new Promise((r) => (s.onopen = r)), send: (m: any) => s.send(JSON.stringify(m)) };
}
const host = ws(admin), p1 = ws(student), p2 = ws(bob);
await Promise.all([host.ready, p1.ready, p2.ready]);
host.send({ t: "create", lessonIds: readers[0].lessons.map((l: any) => l.id), count: 3, hostPlays: false });
await Bun.sleep(300);
const code = host.msgs.find((m) => m.t === "room").code;
p1.send({ t: "join", code }); p2.send({ t: "join", code });
await Bun.sleep(300);
host.send({ t: "start" });
await Bun.sleep(100);
ok(p1.msgs.some((m) => m.t === "countdown" && m.endsAt > m.serverNow) && !p1.msgs.some((m) => m.t === "question"), "start: countdown first, no question yet");
await Bun.sleep(400); // BATTLE_COUNTDOWN_MS=300 in run.sh
{
  const kinds = p1.msgs.map((m) => m.t);
  ok(kinds.indexOf("countdown") < kinds.indexOf("question"), "countdown arrives before the first question");
  ok(typeof p1.msgs.find((m) => m.t === "question")?.serverNow === "number", "question carries serverNow");
}
for (let i = 0; i < 3; i++) {
  await Bun.sleep(300);
  const q = p1.msgs.filter((m) => m.t === "question").pop();
  const answer = q.question.type === "mc" ? 0 : true;
  p1.send({ t: "answer", index: q.index, answer });
  await Bun.sleep(150);
  p2.send({ t: "answer", index: q.index, answer: q.question.type === "mc" ? 1 : false });
  await Bun.sleep(300);
  host.send({ t: "next" }); // reveal already auto (all answered) -> next/finish
}
await Bun.sleep(800);
const end = host.msgs.find((m) => m.t === "end");
console.log("battle end:", JSON.stringify(end?.ranking), JSON.stringify(end?.xp));
const errs = [...host.msgs, ...p1.msgs, ...p2.msgs].filter((m) => m.t === "error");
console.log("ws errors:", errs);

// Player leave: the host's room state drops them. Host end: everyone gets `closed`.
{
  const h2 = ws(admin), a = ws(student), b = ws(bob);
  await Promise.all([h2.ready, a.ready, b.ready]);
  h2.send({ t: "create", lessonIds: readers[0].lessons.map((l: any) => l.id), count: 3, hostPlays: false });
  await Bun.sleep(300);
  const code2 = h2.msgs.find((m) => m.t === "room").code;
  a.send({ t: "join", code: code2 }); b.send({ t: "join", code: code2 });
  await Bun.sleep(300);
  ok(h2.msgs.filter((m) => m.t === "room").pop().players.length === 2, "two players in the lobby");
  const bobId = (await j(bob, "GET", "/me"))[1].user.id;
  b.send({ t: "leave" });
  await Bun.sleep(200);
  const after = h2.msgs.filter((m) => m.t === "room").pop();
  ok(after.players.length === 1 && !after.players.some((p: any) => p.id === bobId), "leave: the host's room state drops the player");
  h2.send({ t: "start" });
  await Bun.sleep(100);
  h2.send({ t: "end" });
  await Bun.sleep(200);
  ok(h2.msgs.some((m) => m.t === "closed" && m.reason === "host") && a.msgs.some((m) => m.t === "closed" && m.reason === "host"), "end: host and players get closed");
  ok(!b.msgs.some((m) => m.t === "closed"), "a player who left gets nothing more");
  await Bun.sleep(400); // past the countdown: an ended room must not start a question
  ok(!a.msgs.some((m) => m.t === "question"), "an ended battle never starts");
  a.send({ t: "join", code: code2 });
  await Bun.sleep(200);
  ok(a.msgs.filter((m) => m.t === "error").pop()?.error === "ROOM_NOT_FOUND", "an ended battle can't be rejoined");
  h2.send({ t: "start" });
  await Bun.sleep(150);
  ok(h2.msgs.filter((m) => m.t === "error").pop()?.error === "NOT_IN_ROOM", "the host's old connection is out of the room");
}
process.exit(0);
