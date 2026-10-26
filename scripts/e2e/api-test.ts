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
host.send({ t: "create", lessonIds: readers[0].lessons.map((l: any) => l.id), count: 5, hostPlays: false });
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
for (let i = 0; i < 5; i++) {
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
  h2.send({ t: "create", lessonIds: readers[0].lessons.map((l: any) => l.id), count: 5, hostPlays: false });
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

// Lobby settings: host only, lobby only, server-authoritative.
{
  const { scoreAnswer, DEFAULT_BATTLE_SETTINGS } = await import("../../shared/battle");
  // Seed answers (scripts/e2e/seed.ts): mc/tf prompts → correct answer; difficulty 1 = these 3.
  const correctFor: Record<string, unknown> = {
    "Wat is het verschil tussen effectiviteit en efficiëntie?": 0,
    "Welke discipline hoort NIET bij bedrijfskunde volgens de reader?": 2,
    "Een tennisvereniging is ook een organisatie.": true,
    "HRM gaat over het beheer van financiële middelen.": false,
  };
  const easyPrompts = new Set(["Wat is het verschil tussen effectiviteit en efficiëntie?", "Een tennisvereniging is ook een organisatie.", "HRM gaat over het beheer van financiële middelen."]);
  const wrongFor = (q: any) => (q.question.type === "mc" ? (correctFor[q.question.prompt] === 0 ? 1 : 0) : !correctFor[q.question.prompt]);
  const lessonIds = readers[0].lessons.map((l: any) => l.id);
  const studentId = (await j(student, "GET", "/me"))[1].user.id;
  const bobId = (await j(bob, "GET", "/me"))[1].user.id;
  const lastRoom = (c: { msgs: any[] }) => c.msgs.filter((m) => m.t === "room").pop();
  const lastError = (c: { msgs: any[] }) => c.msgs.filter((m) => m.t === "error").pop()?.error;

  /**
   * Host + student (a) + bob (b) play with the given settings. By default a is always right,
   * b always wrong and the host doesn't play; `right(who, i, total)` overrides who is right.
   */
  async function play(
    settings: Record<string, unknown>,
    checks?: (h: any, a: any) => Promise<void>,
    { right = (who: "a" | "b" | "h") => who === "a", hostPlays = false } = {},
  ) {
    const h = ws(admin), a = ws(student), b = ws(bob);
    await Promise.all([h.ready, a.ready, b.ready]);
    h.send({ t: "create", lessonIds, count: 5, hostPlays });
    await Bun.sleep(300);
    const code = lastRoom(h).code;
    a.send({ t: "join", code }); b.send({ t: "join", code });
    await Bun.sleep(200);
    h.send({ t: "settings", settings });
    await Bun.sleep(200);
    await checks?.(h, a);
    const total = lastRoom(h).total;
    const rs = lastRoom(h).settings;
    h.send({ t: "start" });
    await Bun.sleep(150);
    h.send({ t: "settings", settings: { questionSeconds: 30, points: "normal" } });
    await Bun.sleep(400);
    const results: { q: any; mine: any }[] = [];
    for (let i = 0; i < total; i++) {
      const q = a.msgs.filter((m) => m.t === "question").pop();
      ok(q?.index === i, `question ${i} arrived`);
      const pick = (who: "a" | "b" | "h") => (right(who, i, total) ? correctFor[q.question.prompt] : wrongFor(q));
      a.send({ t: "answer", index: i, answer: pick("a") });
      b.send({ t: "answer", index: i, answer: pick("b") });
      if (hostPlays) h.send({ t: "answer", index: i, answer: pick("h") });
      await Bun.sleep(250);
      const rev = a.msgs.filter((m) => m.t === "reveal").pop();
      ok(rev?.index === i, `reveal ${i} arrived`);
      results.push({ q, mine: rev.results[studentId] });
      h.send({ t: "next" });
      await Bun.sleep(250);
    }
    await Bun.sleep(300);
    const end = h.msgs.find((m) => m.t === "end");
    for (const c of [h, a, b]) c.s.close();
    return { results, end, settings: rs, rooms: h.msgs.filter((m) => m.t === "room") };
  }

  // A: 10 s questions, everything doubled, easy only.
  const A = await play({ questionSeconds: 10, points: "allDouble", difficulty: "easy" }, async (h, a) => {
    const seen = lastRoom(a);
    ok(seen.settings.questionSeconds === 10 && seen.settings.points === "allDouble" && seen.settings.difficulty === "easy", "settings: players see the host's change in room state");
    ok(seen.total === 5 && seen.available === 15, "settings: easy keeps the count (5 of 15 available)");
    a.send({ t: "settings", settings: { questionSeconds: 60, showScoreboard: false } });
    await Bun.sleep(200);
    ok(lastRoom(h).settings.questionSeconds === 10 && lastRoom(h).settings.showScoreboard === true, "settings: a non-host settings message is ignored");
    h.send({ t: "settings", settings: { difficulty: "hard" } });
    await Bun.sleep(200);
    ok(lastError(h) === "NOT_ENOUGH_QUESTIONS" && lastRoom(h).settings.difficulty === "easy", "settings: too few hard questions → NOT_ENOUGH_QUESTIONS, settings kept");
    h.send({ t: "settings", settings: { questionSeconds: 15 } });
    await Bun.sleep(150);
    ok(lastError(h) === "BAD_MESSAGE" && lastRoom(h).settings.questionSeconds === 10, "settings: invalid values are rejected");
    h.send({ t: "settings", settings: { count: 6 } });
    await Bun.sleep(150);
    ok(lastRoom(a).total === 6 && lastRoom(a).settings.count === 6, "settings: count re-picks the questions");
    h.send({ t: "settings", settings: { count: 4 } });
    await Bun.sleep(150);
    ok(lastError(h) === "BAD_MESSAGE" && lastRoom(h).settings.count === 6, "settings: count below 5 is rejected");
  });
  ok(A.rooms.every((r: any) => r.state === "lobby" || (r.settings.questionSeconds === 10 && r.settings.points === "allDouble")), "settings: a change after start is ignored");
  ok(A.results.every(({ q }) => easyPrompts.has(q.question.prompt)), "difficulty easy: only difficulty-1 questions");
  ok(
    A.results.every(({ q }) => q.durationMs === 10_000 && Math.abs(q.endsAt - q.serverNow - 10_000) < 250),
    "question timer = questionSeconds (endsAt - serverNow ≈ 10 s)",
  );
  ok(A.results.every(({ q }) => q.doubled === true), "allDouble: every question is marked doubled");
  ok(
    A.results.every(({ mine }, i) =>
      mine.correct && mine.points === 2 * scoreAnswer({ correct: true, msLeft: 10_000 - mine.at, totalMs: 10_000, streak: i + 1, settings: DEFAULT_BATTLE_SETTINGS, isLast: false }),
    ),
    "allDouble: a correct answer scores twice the normal points",
  );

  // B: last question double, no speed/streak bonus → base 500, 2× on the last.
  const B = await play({ points: "lastDouble", speedBonus: false, streakBonus: false, showScoreboard: false });
  ok(B.settings.showScoreboard === false, "settings: showScoreboard off is in room state");
  ok(B.results.map(({ q }) => q.doubled).join() === "false,false,false,false,true", "lastDouble: only the last question is doubled");
  ok(B.results.map(({ mine }) => mine.points).join() === "500,500,500,500,1000", "bonuses off: points = base (500), last doubled");

  // C: defaults.
  const C = await play({});
  ok(
    C.results.every(({ q, mine }, i) =>
      !q.doubled && q.durationMs === 20_000 &&
      mine.points === scoreAnswer({ correct: true, msLeft: 20_000 - mine.at, totalMs: 20_000, streak: i + 1, settings: DEFAULT_BATTLE_SETTINGS, isLast: false }),
    ),
    "normal: 20 s, nothing doubled, default scoring",
  );
  console.log("xp A/B/C:", JSON.stringify(A.end?.xp), JSON.stringify(B.end?.xp), JSON.stringify(C.end?.xp));
  ok(
    !!A.end && [A, B, C].every((x) => x.end.xp[studentId] === A.end.xp[studentId] && x.end.xp[bobId] === A.end.xp[bobId]) && A.end.xp[studentId] > A.end.xp[bobId],
    "XP is identical whatever the points mode or bonuses",
  );

  // Upset: student wins the first question, bob only the doubled last one → bob tops the
  // podium and gets the winner's XP and badge (placement follows the podium). Host plays, always wrong.
  const badges = async (c: string) => (await j(c, "GET", "/me"))[1].badges.map((x: any) => x.id);
  ok(!(await badges(bob)).includes("battle_winner"), "upset: bob has no winner badge yet");
  const U = await play({ points: "lastDouble", speedBonus: false, streakBonus: false }, undefined, {
    hostPlays: true,
    right: (who, i, total) => (who === "a" && i === 0) || (who === "b" && i === total - 1),
  });
  const adminId = (await j(admin, "GET", "/me"))[1].user.id;
  console.log("upset ranking:", JSON.stringify(U.end?.ranking.map((p: any) => [p.name, p.score])), JSON.stringify(U.end?.xp));
  ok(U.end?.ranking[0].id === bobId && U.end.ranking[0].score === 1000 && U.end.ranking[1].id === studentId, "upset: bob (doubled last) tops the podium");
  ok(U.end.xp[bobId] === 60 && U.end.xp[studentId] === 40 && U.end.xp[adminId] === 30, "upset: placement XP follows the podium");
  ok((await badges(bob)).includes("battle_winner") && !(await badges(student)).includes("battle_winner"), "upset: the podium winner gets the badge");
}

// Count is clamped to what the pool holds at the difficulty (one lesson: 4 mc/tf, 3 easy).
{
  const h = ws(admin), a = ws(student);
  await Promise.all([h.ready, a.ready]);
  h.send({ t: "create", lessonIds: [readers[0].lessons[0].id], count: 10, hostPlays: false });
  await Bun.sleep(300);
  const r0 = h.msgs.filter((m) => m.t === "room").pop();
  ok(r0.settings.count === 4 && r0.total === 4 && r0.available === 4, "count: create clamps to the available 4");
  a.send({ t: "join", code: r0.code });
  h.send({ t: "settings", settings: { difficulty: "easy" } });
  await Bun.sleep(200);
  const r1 = a.msgs.filter((m) => m.t === "room").pop();
  ok(r1.settings.count === 3 && r1.total === 3 && r1.available === 3, "count: easy clamps to the available 3");
  h.send({ t: "settings", settings: { count: 20 } });
  await Bun.sleep(200);
  const r2 = h.msgs.filter((m) => m.t === "room").pop();
  ok(r2.settings.count === 3 && r2.total === 3 && !h.msgs.some((m) => m.t === "error"), "count: asking for more than available is clamped");
  ok((await (async () => { h.send({ t: "create", lessonIds: [readers[0].lessons[0].id], count: 3 }); await Bun.sleep(200); return h.msgs.filter((m) => m.t === "error").pop()?.error; })()) === "BAD_MESSAGE", "count: create below 5 is rejected");
  h.s.close(); a.s.close();
}
process.exit(0);
