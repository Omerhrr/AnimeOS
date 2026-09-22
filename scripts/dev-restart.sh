#!/usr/bin/env bash
# Reliable dev-server restart.
#
# Why this exists: killing `bun run dev` (or its sh pipeline) does NOT
# kill the next-server child it spawned. A stale server then keeps
# serving port 3000 with OLD code - which once made a render come back
# NEUTRAL/no-variant mid-session and was the likely source of the
# reseeded-DB data incident. Next dev also silently bumps to port 3001
# when 3000 is busy, so an E2E run can hit the stale server while the
# fresh one listens elsewhere.
#
# This script is the canonical restart path:
#   1. kill the whole previous tree (next-server, next dev)
#   2. wait until port 3000 actually frees
#   3. start a fresh `bun run dev` in its own session
#   4. wait until the server answers on 3000 before returning
set -u

PORT=3000
LOG="${DEV_LOG:-/tmp/devserver.log}"

port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && { exec 3>&-; return 0; }
  return 1
}

echo "[dev-restart] killing stale server processes..."
# [n] bracket trick: the patterns must not match THIS script's own
# pkill command lines, or pkill kills its parent shell
pkill -f "[n]ext-server" 2>/dev/null
pkill -f "[n]ext dev" 2>/dev/null
pkill -f "[n]ext-worker" 2>/dev/null
sleep 0.5

for _ in $(seq 1 40); do
  if port_busy; then
    pkill -f "[n]ext-server" 2>/dev/null
    sleep 0.5
  else
    break
  fi
done

if port_busy; then
  echo "[dev-restart] ERROR: port $PORT still busy after 20s - refusing to start a second server"
  exit 1
fi
echo "[dev-restart] port $PORT free"

echo "[dev-restart] starting fresh dev server (log: $LOG)..."
: > "$LOG"
(setsid bash -c 'exec bun run dev' >> "$LOG" 2>&1 &)

for _ in $(seq 1 120); do
  if port_busy; then
    echo "[dev-restart] dev server is up on http://localhost:$PORT"
    exit 0
  fi
  sleep 0.5
done

echo "[dev-restart] ERROR: server did not answer on $PORT within 60s - last log lines:"
tail -20 "$LOG"
exit 1
