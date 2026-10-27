// Bun test preload: point the app at throwaway storage before any module reads server/env,
// so the unit tests never open ./data (the real/demo database).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), `wr-unit-${process.pid}-`));
process.env.DATABASE_PATH = join(dir, "app.db");
process.env.UPLOAD_DIR = join(dir, "uploads");
// Never send real email or call real AI from tests, and keep rate limits on unless a test opts out.
delete process.env.RESEND_API_KEY;
delete process.env.RATE_LIMIT_DISABLED;
delete process.env.CLIENT_IP_HEADER;
