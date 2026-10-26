#!/usr/bin/env bash
# Stops the demo app (tailscaled keeps running so the device stays on the tailnet).
pkill -f "bun --env-file=data/demo.env" && echo "demo app stopped"
