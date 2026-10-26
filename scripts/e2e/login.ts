// Usage: bun scripts/e2e/login.ts <email> <cookie-out-file>  (dev/e2e server logs magic links to its log)
const [email, out] = process.argv.slice(2) as [string, string];
const PORT = process.env.E2E_PORT ?? "3100";
const LOG = process.env.E2E_LOG ?? "/tmp/wr-dev/api.log";
const base = `http://localhost:${PORT}/api`;
await fetch(base + "/auth/sign-in/magic-link", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "http://localhost:5174" },
  body: JSON.stringify({ email, callbackURL: "/" }),
});
await Bun.sleep(400);
const log = await Bun.file(LOG).text();
const esc = email.replace(/[.+]/g, "\\$&");
const link = [...log.matchAll(new RegExp(`\\[magic-link\\] ${esc}\\n\\s+(\\S+)`, "g"))].pop()?.[1];
if (!link) throw new Error("magic link not found in " + LOG);
const url = new URL(link);
url.host = `localhost:${PORT}`;
const r = await fetch(url, { redirect: "manual" });
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
if (!cookie) throw new Error("no session cookie");
await Bun.write(out, cookie);
console.log(out);
