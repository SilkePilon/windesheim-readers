// A "restarted server": a fresh process with an empty memory that reserves one sign-in email
// against the database it is pointed at, and prints the result as JSON.
// Usage: DATABASE_PATH=... bun tests/fixtures/email-gate-reserve.ts <email> <ip>
if (!process.env.DATABASE_PATH) throw new Error("DATABASE_PATH must be set (never touch ./data)");
const [email, ip] = process.argv.slice(2) as [string, string];
const { runMigrations } = await import("../../server/db");
const { reserveEmailSend } = await import("../../server/lib/email-gate");
runMigrations();
console.log(JSON.stringify(reserveEmailSend(email, ip)));
