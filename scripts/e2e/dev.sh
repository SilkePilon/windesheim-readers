#!/usr/bin/env bash
# Isolated dev environment for UI work: API on :3100 (temp DB in /tmp/wr-dev), Vite on :5174.
# Never touches the demo (:3000, ./data).
#   scripts/e2e/dev.sh start [--fresh]   start (seeds on first start or with --fresh)
#   scripts/e2e/dev.sh stop
#   scripts/e2e/dev.sh login <email>     prints a cookie file path for that user
set -euo pipefail
cd "$(dirname "$0")/../.."
DIR=/tmp/wr-dev; API_PORT=3100; WEB_PORT=5174
cmd=${1:-start}
stop() { for f in "$DIR"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; rm -f "$f"; done; }
case "$cmd" in
  stop) stop ;;
  start)
    stop
    [ "${2:-}" = "--fresh" ] && rm -rf "$DIR"
    fresh=0; [ -f "$DIR/app.db" ] || fresh=1
    mkdir -p "$DIR/uploads"
    env -u RESEND_API_KEY PORT=$API_PORT DATABASE_PATH=$DIR/app.db UPLOAD_DIR=$DIR/uploads \
      APP_URL=http://localhost:$WEB_PORT APP_SECRET=dev-secret-dev-secret-dev-secret-0000 \
      ADMIN_EMAILS=admin@windesheim.nl NODE_ENV=development AI_STUB=${AI_STUB:-1} \
      nohup bun --watch server/index.ts > "$DIR/api.log" 2>&1 & echo $! > "$DIR/api.pid"
    API_URL=http://localhost:$API_PORT VITE_PORT=$WEB_PORT nohup bunx vite --strictPort > "$DIR/web.log" 2>&1 & echo $! > "$DIR/web.pid"
    for _ in $(seq 1 100); do curl -s -o /dev/null "http://localhost:$API_PORT/" && curl -s -o /dev/null "http://localhost:$WEB_PORT/" && break; sleep 0.2; done
    [ $fresh = 1 ] && bun scripts/e2e/seed.ts "$DIR/app.db" && bun scripts/e2e/seed-users.ts "$DIR/app.db" || true
    echo "web http://localhost:$WEB_PORT  api http://localhost:$API_PORT  logs $DIR/*.log"
    ;;
  login)
    email=${2:?email}
    E2E_PORT=$API_PORT E2E_LOG=$DIR/api.log bun scripts/e2e/login.ts "$email" "$DIR/cookie-${email%%@*}.txt"
    ;;
esac
