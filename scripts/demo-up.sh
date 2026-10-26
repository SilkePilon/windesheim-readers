#!/usr/bin/env bash
# Starts the demo: production build of the app on :3000, published on the tailnet
# via a userspace tailscaled + `tailscale serve` (HTTPS). Config lives in data/demo.env.
set -euo pipefail
cd "$(dirname "$0")/.."

TS_DIR="${TS_DIR:-$HOME/.local/tailscale}"
TS_STATE="${TS_STATE:-$HOME/.local/state/tailscale}"
TS="$TS_DIR/tailscale --socket=$TS_STATE/tailscaled.sock"
mkdir -p "$TS_STATE" data

if ! pgrep -f "tailscaled --tun=userspace-networking" >/dev/null; then
  setsid nohup "$TS_DIR/tailscaled" --tun=userspace-networking \
    --state="$TS_STATE/tailscaled.state" --socket="$TS_STATE/tailscaled.sock" --statedir="$TS_STATE" \
    >"$TS_STATE/tailscaled.log" 2>&1 </dev/null &
  sleep 3
fi

if [[ "${1:-}" == "--build" ]]; then bunx vite build; fi

if ! pgrep -f "bun --env-file=data/demo.env" >/dev/null; then
  setsid nohup bun --env-file=data/demo.env server/index.ts >data/demo.log 2>&1 </dev/null &
  sleep 2
fi

$TS serve --bg --https=443 http://127.0.0.1:3000 >/dev/null
$TS serve status
