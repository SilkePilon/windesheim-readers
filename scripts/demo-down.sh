#!/usr/bin/env bash
# Stops the demo app started by scripts/demo-up.sh (tailscaled keeps running so the device stays on the tailnet).
# Only the exact demo server command line is matched; nothing else is killed.
set -euo pipefail
MAIN="$(cd "$(dirname "$0")/.." && pwd -P)"
CMD="bun --env-file=$MAIN/data/demo.env server/index.ts"
PATTERN="^$(printf '%s' "$CMD" | sed 's/[][\.*^$+?(){}|]/\\&/g')\$"
pids=$(pgrep -fx "$PATTERN" || true)
if [[ -z "$pids" ]]; then echo "demo app not running"; exit 0; fi
kill $pids && echo "demo app stopped ($pids)"
