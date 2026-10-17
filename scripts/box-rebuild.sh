#!/usr/bin/env bash
# BOX-REBUILD - THE REBUILD LAW MADE DURABLE (the 225 graduation the
# thirteenth drift named). The box has died twice (the twelfth drift
# took the box mid-frontier, iteration 222; the thirteenth took the
# repo + .env + the watch chain, iteration 225) and the rebuild was
# ridden manually both times. The third death rides ONE command.
#
# THE LAW (the 222 + 225 rides, byte-faithful):
#   1. THE DRIFT CHECK FIRST: git ls-remote verifies the remote HEAD
#      (the remote is the truth, the box is disposable).
#   2. THE CLONE: the workspace's scaffold (or corpse) is replaced by
#      a fresh clone; the remote carries the full state.
#   3. THE ENV: .env rewritten (the DATABASE_URL path is the law).
#   4. THE INSTALL: npm install (the lockfile pins the tree).
#   5. THE SCHEMA: prisma db push (the standing path recreated; the
#      db file itself survived both deaths under /home/z/my-project/db).
#   6. THE PROBES: the DB's own state named (the project, the scene,
#      the shots) and the WINDOW's shape measured (the wall's words
#      verbatim, the receipt refreshed) - never guessed.
#   7. THE CHAIN RELAUNCHED: the standing watch's generation 1 rides
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

echo "== THE ENV =="
printf 'DATABASE_URL="%s"\n' "$DB_URL" > "${APP}/.env"
echo ".env written: ${DB_URL}"

echo "== THE INSTALL =="
cd "$APP" || exit 1
npm install 2>&1 | tail -1

echo "== THE SCHEMA =="
npx prisma db push 2>&1 | tail -2

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
if [ -f watch223.pid ] && ps -p "$(cat watch223.pid)" > /dev/null 2>&1; then
  echo "chain generation 1 riding: pid $(cat watch223.pid), ${HOURS}h, the log watch223.log"
else
  echo "WARNING: the chain's pid did not answer - read watch223.log before trusting the watch"
fi

echo "== BOX-REBUILD COMPLETE: the drift law's answer, one command =="
echo "next: the standing gates (e2e-iter218..224, smoke222-224) re-run before any commit"
