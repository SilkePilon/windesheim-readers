import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { env } from "../env";
import * as schema from "./schema";

mkdirSync(dirname(env.databasePath), { recursive: true });

const sqlite = new Database(env.databasePath, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });
export { schema };

export function runMigrations() {
  migrate(db, { migrationsFolder: join(import.meta.dir, "migrations") });
}
