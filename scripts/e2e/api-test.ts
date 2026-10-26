const PORT = process.env.E2E_PORT ?? "3100";
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
ok((await j(student, "GET", "/admin/readers"))[0] === 403, "students cannot access admin");
const [, readers] = await j(student, "GET", "/readers");
const lesson = readers[0].lessons[0];
console.log("lessons visible:", readers[0].lessons.length, lesson.code);
const [, detail] = await j(student, "GET", `/lessons/${lesson.id}`);
console.log("detail:", detail.quizCount, detail.flashcardCount, detail.openCount);
// quiz (server-side sessions; only the first check counts)
const [, quiz] = await j(student, "GET", `/lessons/${lesson.id}/quiz?n=10`);
const qs = quiz.questions;
ok(typeof quiz.sessionId === "string" && qs.length > 0, "quiz session created");
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
for (const c of queue) await j(student, "POST", "/review", { flashcardId: c.id, rating: 3 });
console.log("reviewed", queue.length, "due now:", (await j(student, "GET", "/review/queue"))[1].length);
const [, me] = await j(student, "GET", "/me");
ok(
  Array.isArray(me.quests) && me.quests.length === 3 &&
    me.quests.every((q: any) => q.id && q.target > 0 && q.reward > 0 && typeof q.progress === "number" && typeof q.done === "boolean"),
  "/me returns exactly 3 quests with id/target/reward/progress/done",
);
console.log("stats:", me.stats, me.badges.map((b: any) => b.id));
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
process.exit(0);
