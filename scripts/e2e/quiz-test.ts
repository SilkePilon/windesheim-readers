const PORT = process.env.E2E_PORT ?? "3200";
const LOG = process.env.E2E_LOG ?? "/tmp/wr-e2e/srv.log";
const base = `http://localhost:${PORT}/api`;
const H = { "content-type": "application/json", origin: "http://localhost:5173" };
await fetch(base + "/auth/sign-in/magic-link", { method: "POST", headers: H, body: JSON.stringify({ email: "eve@student.windesheim.nl" }) });
await Bun.sleep(300);
const link = (await Bun.file(LOG).text()).match(/\[magic-link\] eve@student\.windesheim\.nl\n\s+(\S+)/)![1]!.replace("5173", PORT);
const cookie = (await fetch(link, { redirect: "manual" })).headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const j = async (m: string, p: string, b?: unknown) => (await fetch(base + p, { method: m, headers: { ...H, cookie }, body: b ? JSON.stringify(b) : undefined })).json();
const readers = await j("GET", "/readers");
const lid = readers[0].lessons[1].id;
const { sessionId, questions } = await j("GET", `/lessons/${lid}/quiz?n=5`);
for (const q of questions) {
  const c = await j("POST", `/questions/${q.id}/check`, { sessionId, answer: "wrong" });
  await j("POST", `/questions/${q.id}/check`, { sessionId, answer: c.correctAnswer });
}
console.log("cheat submit:", await j("POST", `/lessons/${lid}/quiz/submit`, { sessionId }));
console.log("replay submit:", await j("POST", `/lessons/${lid}/quiz/submit`, { sessionId }));
const q = await j("GET", `/review/queue?lessonId=${lid}`);
await j("POST", "/review", { flashcardId: q[0].id, rating: 3 });
console.log("cardMastery after 1 review:", (await j("GET", `/lessons/${lid}`)).progress.cardMastery);
process.exit(0);
