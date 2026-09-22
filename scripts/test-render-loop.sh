#!/bin/bash
# End-to-end render loop test: queue → progress → DSH inspection → apply & re-render
set -e
BASE=http://localhost:3000

PID=$(curl -s $BASE/api/projects | python3 -c "
import json,sys
d=json.load(sys.stdin)
print([x for x in d if x['title']=='Immortal Path'][0]['id'])")

SHOT=$(curl -s $BASE/api/projects/$PID | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d['seasons'][0]['episodes'][0]['scenes'][0]['shots'][1]['id'])")

echo "project=$PID shot=$SHOT"
JOB=$(curl -s -X POST $BASE/api/render-jobs -H 'Content-Type: application/json' \
  -d "{\"action\":\"create\",\"shotId\":\"$SHOT\",\"mode\":\"PREVIEW\"}" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "job=$JOB queued"

for i in $(seq 1 20); do
  sleep 4
  OUT=$(curl -s "$BASE/api/render-jobs?projectId=$PID" | python3 -c "
import json,sys
d=json.load(sys.stdin)
j=[x for x in d if x['id']=='$JOB'][0]
ev=j.get('evaluation')
acts=json.loads(ev['actions']) if ev and ev.get('actions') else []
print(f\"{j['status']}|{round(j['progress'])}|{j['stage']}|{ev['verdict'] if ev else '-'}|{len(acts)}\")
if ev and acts:
    for a in acts[:4]:
        print(f\"  {a['param']}: {a['from']} -> {a['to']} ({a['reason'][:60]})\")
")
  echo "poll $i: $OUT" | head -5
  if echo "$OUT" | grep -qE "APPROVED|NEEDS_REVISION"; then break; fi
done
