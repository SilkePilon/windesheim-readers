import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { env } from "../env";
import * as schema from "./schema";

mkdirSync(dirname(env.databasePath), { recursive: true });

export const sqlite = new Database(env.databasePath, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");
sqlite.exec("PRAGMA synchronous = NORMAL;"); // safe with WAL, far fewer fsyncs
sqlite.exec("PRAGMA busy_timeout = 5000;");
sqlite.exec("PRAGMA cache_size = -20000;"); // ~20 MB page cache
sqlite.exec("PRAGMA temp_store = MEMORY;");

export const db = drizzle(sqlite, { schema });
export { schema };

export function runMigrations() {
  migrate(db, { migrationsFolder: join(import.meta.dir, "migrations") });
}
