#!/usr/bin/env bash
# Starts the demo: production build of the app on :3000, published on the tailnet
# via a userspace tailscaled + `tailscale serve` (HTTPS).
# The demo always builds and runs from the demo worktree (DEMO_DIR), never from this checkout;
# its config, DB and log stay in this checkout's data/ (data/demo.env uses absolute paths).
#   scripts/demo-up.sh [--build]
set -euo pipefail
MAIN="$(cd "$(dirname "$0")/.." && pwd -P)"
DEMO_DIR="${DEMO_DIR:-/home/node/.t3/projects/windesheim-readers-demo}"
ENV_FILE="$MAIN/data/demo.env"
CMD="bun --env-file=$ENV_FILE server/index.ts"
# Exact full-command-line match (-x), so shells that merely mention the command don't count.
PATTERN="^$(printf '%s' "$CMD" | sed 's/[][\.*^$+?(){}|]/\\&/g')\$"

[[ -d "$DEMO_DIR" ]] || { echo "demo worktree $DEMO_DIR does not exist; create it or set DEMO_DIR" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE" >&2; exit 1; }

TS_DIR="${TS_DIR:-$HOME/.local/tailscale}"
TS_STATE="${TS_STATE:-$HOME/.local/state/tailscale}"
TS="$TS_DIR/tailscale --socket=$TS_STATE/tailscaled.sock"
mkdir -p "$TS_STATE"

if ! pgrep -f "tailscaled --tun=userspace-networking" >/dev/null; then
  setsid nohup "$TS_DIR/tailscaled" --tun=userspace-networking \
    --state="$TS_STATE/tailscaled.state" --socket="$TS_STATE/tailscaled.sock" --statedir="$TS_STATE" \
    >"$TS_STATE/tailscaled.log" 2>&1 </dev/null &
  sleep 3
fi

if [[ "${1:-}" == "--build" ]]; then (cd "$DEMO_DIR" && bun install && bunx vite build); fi

if ! pgrep -fx "$PATTERN" >/dev/null; then
  (cd "$DEMO_DIR" && setsid nohup $CMD >>"$MAIN/data/demo.log" 2>&1 </dev/null &)
  sleep 2
fi

$TS serve --bg --https=443 http://127.0.0.1:3000 >/dev/null
$TS serve status
