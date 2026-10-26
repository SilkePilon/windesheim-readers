// Adds fake students with XP so leaderboards/podiums have content. Usage: bun scripts/e2e/seed-users.ts <db>
import { Database } from "bun:sqlite";
const db = new Database(process.argv[2]);
const names = ["Noor", "Daan", "Sem", "Lotte", "Milan", "Emma", "Liam", "Julia", "Finn", "Sophie", "Lucas", "Mila", "Thijs", "Sara", "Jesse", "Tess", "Bram", "Evi", "Ruben", "Fleur"];
const now = Date.now();
names.forEach((n, i) => {
  const id = `seed-${i}`;
  const email = `${n.toLowerCase()}@student.windesheim.nl`;
  db.run("insert or ignore into user (id, name, email, email_verified, created_at, updated_at, role, show_on_leaderboard, locale) values (?,?,?,1,?,?, 'user', 1, 'nl')", [id, n, email, now, now]);
  const xp = 900 - i * 40;
  db.run("insert or ignore into user_stats (user_id, xp, streak, longest_streak, last_active_day) values (?,?,?,?,?)", [id, xp, (i % 9) + 1, (i % 9) + 4, new Date().toISOString().slice(0, 10)]);
  db.run("insert into xp_event (id, user_id, amount, reason, created_at) values (?,?,?,?,?)", [`seedxp-${i}`, id, xp, "seed", now]);
});
console.log("seeded", names.length, "users");
