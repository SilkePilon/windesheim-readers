#!/usr/bin/env bash
# Runs the API regression tests against a throwaway server (port 3200, temp DB).
# Never touches the demo on port 3000 or ./data.
set -euo pipefail
cd "$(dirname "$0")/../.."
DIR=/tmp/wr-e2e
export E2E_PORT=${E2E_PORT:-3200} E2E_LOG=$DIR/srv.log
rm -rf "$DIR" && mkdir -p "$DIR/uploads"
env -u RESEND_API_KEY PORT=$E2E_PORT DATABASE_PATH=$DIR/app.db UPLOAD_DIR=$DIR/uploads \
  APP_URL=http://localhost:5173 APP_SECRET=e2e-secret-e2e-secret-e2e-secret-00 \
  ADMIN_EMAILS=admin@windesheim.nl NODE_ENV=development BATTLE_COUNTDOWN_MS=300 AI_STUB=1 \
  bun server/index.ts > "$E2E_LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do curl -sf "http://localhost:$E2E_PORT/api/readers" -o /dev/null -w '' 2>/dev/null && break; curl -s -o /dev/null "http://localhost:$E2E_PORT/" && break; sleep 0.2; done
bun scripts/e2e/seed.ts "$DIR/app.db"
for t in "${@:-api-test quiz-test badges-test}"; do for x in $t; do echo "== $x"; bun "scripts/e2e/$x.ts"; done; done
