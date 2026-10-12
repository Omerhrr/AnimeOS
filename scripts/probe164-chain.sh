#!/bin/bash
# THE 164 RUNG CHAIN (the resume law, one detached run):
# capture the S005 payload -> render both rung arms (640 standing /
# 1024 candidate) -> meter the face-crop sources -> done marker.
set -u
cd /home/z/my-project/AnimeOS
LOG=probe164-chain.log
echo "[$(date -Iseconds)] chain start" >> $LOG

mkdir -p /home/z/my-project/inspect/probe164
python3 scripts/probe-155-capture.py 8198 /home/z/my-project/inspect/probe164/job-s005.json > capture164.log 2>&1 &
CAP=$!
# the capture stand-in writes to the 151 path; the dumper copies it
sleep 2
ANIMEOS_BLENDER_HOST=127.0.0.1:8198 DATABASE_URL=file:/home/z/my-project/db/custom.db \
  npx tsx scripts/probe164-dump.ts >> $LOG 2>&1
kill $CAP 2>/dev/null
if [ ! -f /home/z/my-project/inspect/probe164/job-s005.json ]; then
  echo "[$(date -Iseconds)] CAPTURE FAILED" >> $LOG; exit 1
fi
true
echo "[$(date -Iseconds)] payload captured (S005)" >> $LOG

BLENDER=/home/z/blender-5.2.2-linux-x64/blender python3 scripts/probe164-arms.py >> $LOG 2>&1
RC=$?
echo "[$(date -Iseconds)] arms rc=$RC" >> $LOG
[ $RC -eq 0 ] && echo "ALL GREEN" > probe164.done
exit $RC
