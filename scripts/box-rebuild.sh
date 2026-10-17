#!/usr/bin/env bash
# BOX-REBUILD - THE REBUILD LAW MADE DURABLE (the 225 graduation the
# thirteenth drift named; grown by the FOURTH DEATH, the 228 ride).
# The box has died three times (the twelfth drift took the box
# mid-frontier, iteration 222; the thirteenth took the repo + .env +
# the watch chain, iteration 225; the FOURTH took the DB too - the
# box wiped while the chain rode, generation 1's honest gap: it
# never exited, so no ledger line was owed). The 228 ride exposed
# the 225 law's own three gaps, graduated here:
#   (a) THE BOX'S MEMORY DIED WITH THE BODY: the arrival eye had
#       just written its refusal line (never-launched -> rebuild,
#       exit 2) when the clone wiped it - the session-opens ledger
#       is the box's MEMORY and is now CARRIED ACROSS the clone
#       (append-only, deduped by openedAt; the remote's committed
#       lines win, the box's uncommitted lines survive).
#   (b) THE STANDING ROWS DIED WITH THE DB: "the db file itself
#       survived both deaths under /home/z/my-project/db" was the
#       old law's assumption - FALSE on the fourth death. prisma db
#       push births an EMPTY database; the standing seed
#       (scripts/seed140.ts, idempotent - an existing project is
#       named, never re-seeded) rides right after the schema: the
#       standing rows are born back, because the watch's first leg
#       (the restore) needs the project to exist.
#   (c) THE SPLIT-BRAIN DB: the rebuild's .env names the PARENT
#       path (outside APP - the path that survives the rm -rf),
#       but the watch wrapper hardcoded the APP path for its
#       children - two databases, never noticed because the wall
#       kept the legs un-ridden. The wrapper now carries the SAME
#       law's path (the unification, window-watch223.mjs).
#
# THE COMMIT LAW (the fourth death's own ride taught it): a
# graduation is COMMITTED BEFORE the rebuild rides it - the clone
# replaces the script with the remote's law mid-ride, and the
# ride's own rm -rf eats any uncommitted work. The arrival ledger
# is the ONE carried exception (it is the box's memory, not work).
#
# THE LAW (the 222 + 225 + 228 rides, byte-faithful):
#   1. THE DRIFT CHECK FIRST: git ls-remote verifies the remote HEAD
#      (the remote is the truth, the box is disposable).
#   2. THE MEMORY CARRIED ASIDE: the arrival ledger rides out the
#      clone (the box's memory is not the box).
#   3. THE CLONE: the workspace's scaffold (or corpse) is replaced by
#      a fresh clone; the remote carries the full state; the memory
#      is merged back (append-only, deduped by openedAt).
#   4. THE ENV: .env rewritten (the DATABASE_URL path is the law).
#   5. THE INSTALL: npm install (the lockfile pins the tree).
#   6. THE SCHEMA: prisma db push (the standing path recreated).
#   7. THE SEED: the standing rows born back (idempotent - a
#      surviving DB is named, not re-seeded).
#   8. THE PROBES: the DB's own state named (the project, the scene,
#      the shots) and the WINDOW's shape measured (the wall's words
#      verbatim, the receipt refreshed) - never guessed.
#   9. THE CHAIN RELAUNCHED: the standing watch's generation 1 rides
#      again (the previous chain died with the box - the honest gap
#      in the ledger's history is named by the log, not hidden).
#
# THE TOKEN LAW: the token is NEVER committed and NEVER hardcoded -
# it arrives via ANIMEOS_TOKEN (env) or arg 1. The script refuses to
# run without it (the refusal is the law, not a warning).
#
# Usage:
#   ANIMEOS_TOKEN=ghp_... bash scripts/box-rebuild.sh
#   bash scripts/box-rebuild.sh ghp_...
set -uo pipefail

REPO="Omerhrr/AnimeOS"
PARENT="/home/z/my-project"
APP="${PARENT}/AnimeOS"
DB_URL="file:/home/z/my-project/db/custom.db"
HOURS="${ANIMEOS_WATCH_HOURS:-12}"

TOKEN="${ANIMEOS_TOKEN:-${1:-}}"
if [ -z "$TOKEN" ]; then
  echo "REFUSED: no token (ANIMEOS_TOKEN or arg 1) - the token law is not a warning"
  exit 2
fi

echo "== BOX-REBUILD: the drift check first =="
REMOTE_HEAD=$(git ls-remote "https://${TOKEN}@github.com/${REPO}.git" main | cut -f1)
if [ -z "$REMOTE_HEAD" ]; then
  echo "REFUSED: the remote did not answer - fix the token or the network before rebuilding"
  exit 2
fi
echo "remote HEAD: ${REMOTE_HEAD}"

echo "== THE MEMORY CARRIED ASIDE (the arrival ledger is the box's memory) =="
ASIDE="${PARENT}/.session-opens-carry"
rm -f "$ASIDE"
if [ -f "${APP}/receipts/session-opens.jsonl" ]; then
  cp "${APP}/receipts/session-opens.jsonl" "$ASIDE"
  echo "carried: $(grep -c . "$ASIDE") arrival line(s) ride out the rebuild"
else
  echo "no arrival ledger on the corpse - nothing to carry"
fi

echo "== THE CLONE (the scaffold or corpse is replaced) =="
cd "$PARENT" || exit 1
rm -rf "$APP"
git clone -q "https://${TOKEN}@github.com/${REPO}.git" "$APP" || { echo "REFUSED: the clone failed"; exit 2; }
CLONED_HEAD=$(cd "$APP" && git rev-parse HEAD)
if [ "$CLONED_HEAD" != "$REMOTE_HEAD" ]; then
  echo "REFUSED: the clone's HEAD does not match the remote's answer (${CLONED_HEAD} != ${REMOTE_HEAD})"
  exit 2
fi
echo "clone verified at ${CLONED_HEAD}"

echo "== THE MEMORY MERGED BACK (append-only, deduped by openedAt) =="
if [ -f "$ASIDE" ]; then
  CLONE_LEDGER="${APP}/receipts/session-opens.jsonl"
  touch "$CLONE_LEDGER"
  MERGED=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    OPENED=$(printf '%s' "$line" | grep -oE '"openedAt":"[^"]*"' | head -1)
    if [ -n "$OPENED" ] && ! grep -qF "$OPENED" "$CLONE_LEDGER"; then
      printf '%s\n' "$line" >> "$CLONE_LEDGER"
      MERGED=$((MERGED + 1))
    fi
  done < "$ASIDE"
  rm -f "$ASIDE"
  echo "arrival ledger restored: $(grep -c . "$CLONE_LEDGER") line(s) total, ${MERGED} carried back - the story survives the body"
else
  echo "nothing carried - the clone's own ledger stands"
fi

echo "== THE ENV =="
printf 'DATABASE_URL="%s"\n' "$DB_URL" > "${APP}/.env"
echo ".env written: ${DB_URL}"

echo "== THE INSTALL =="
cd "$APP" || exit 1
npm install 2>&1 | tail -1

echo "== THE SCHEMA =="
npx prisma db push 2>&1 | tail -2

echo "== THE SEED (the fourth death took the DB - the standing rows born back) =="
npx tsx scripts/seed140.ts 2>&1 | tail -1

echo "== THE PROBES: the DB's own state, named =="
npx tsx -e "
import { db } from './src/lib/db';
async function main() {
  const project = await db.project.findFirst({ where: { title: 'Immortal Path' }, include: { characters: true } });
  console.log('project:', project ? project.id : 'MISSING', '| characters:', project?.characters.length ?? 0);
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { shots: true } });
  console.log('E7 Sc12:', scene ? scene.id : 'MISSING', '| shots:', scene?.shots.length ?? 0);
  console.log('AI_KEYFRAME arc rows (db half):', await db.identityArcReading.count({ where: { source: 'AI_KEYFRAME' } }));
}
main().then(() => db.\$disconnect()).catch((e) => { console.error('DB PROBE FAILED:', e.message); process.exitCode = 1; });
"

echo "== THE PROBE: the window's own shape, measured =="
npx tsx scripts/probe222-window.ts 2>&1 | grep -E "CHANNEL|WINDOW SHAPE" || echo "(the probe's law rides in probe222-window.ts - its output above, its receipt on disk)"

echo "== THE CHAIN RELAUNCHED (the standing watch, generation 1) =="
node scripts/window-watch223.mjs "$HOURS" 600000 1
sleep 8
# the pid file is JSON since 226 ({"pid":N,...}) or plain N before it -
# the first number in the file is the pid either way
WPID=$(grep -oE '[0-9]+' watch223.pid 2>/dev/null | head -1)
if [ -f watch223.pid ] && [ -n "$WPID" ] && ps -p "$WPID" > /dev/null 2>&1; then
  echo "chain generation 1 riding: pid $WPID, ${HOURS}h, the log watch223.log"
else
  echo "WARNING: the chain's pid did not answer - read watch223.log before trusting the watch"
fi

echo "== BOX-REBUILD COMPLETE: the drift law's answer, one command =="
echo "next: the arrival eye re-reads the reborn box (npx tsx scripts/session-open.ts), then the standing gates re-run before any commit"
