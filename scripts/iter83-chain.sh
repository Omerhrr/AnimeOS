#!/bin/bash
# Iteration 83 full chain, run detached (the sandbox reaps children
# between tool calls unless double-detached). Polls the AI API until
# the account throttle clears, then runs in order:
#   1. prep (Immortal Path sheets + scores)   -> /tmp/iter83-prep.log
#   2. E2E phase a                            -> /tmp/iter83-a.log
#   3. E2E phase b                            -> /tmp/iter83-b.log
#   4. the real repair loop                   -> /tmp/iter83-loop.log
# Each step only runs when the previous one succeeded (exit 0).
cd /home/z/my-project
STATUS=/tmp/iter83-chain.status
echo "chain-start $(date +%H:%M:%S)" > "$STATUS"

# 0. poll: one tiny vision call every 8 minutes, up to 20 tries (~2.7h)
for i in $(seq 1 20); do
  if npx tsx -e "
import ZAI from 'z-ai-web-dev-sdk';
const zai = await ZAI.create();
const r = await zai.chat.completions.create({ messages: [{ role: 'user', content: 'say OK' }] });
console.log(r.choices?.[0]?.message?.content?.slice(0, 5));
" 2>/dev/null | rg -q "OK"; then
    echo "api-clear try=$i $(date +%H:%M:%S)" >> "$STATUS"
    break
  fi
  echo "api-throttled try=$i $(date +%H:%M:%S)" >> "$STATUS"
  sleep 480
done

# 1. prep
npx tsx scripts/run-prep-immortal.ts > /tmp/iter83-prep.log 2>&1
echo "prep exit=$? $(date +%H:%M:%S)" >> "$STATUS"
grep -q "STANDING" /tmp/iter83-prep.log || { echo "chain-abort prep $(date +%H:%M:%S)" >> "$STATUS"; exit 1; }

# 2. E2E phase a
PHASE=a npx tsx scripts/e2e-iter83-material.ts > /tmp/iter83-a.log 2>&1
A=$?
echo "e2e-a exit=$A $(date +%H:%M:%S)" >> "$STATUS"
[ "$A" = "0" ] || { echo "chain-abort e2e-a $(date +%H:%M:%S)" >> "$STATUS"; exit 1; }

# 3. E2E phase b
PHASE=b npx tsx scripts/e2e-iter83-material.ts > /tmp/iter83-b.log 2>&1
B=$?
echo "e2e-b exit=$B $(date +%H:%M:%S)" >> "$STATUS"
[ "$B" = "0" ] || { echo "chain-abort e2e-b $(date +%H:%M:%S)" >> "$STATUS"; exit 1; }

# 4. the real repair loop (members=2 shotsPerMember=3, reanchor on)
npx tsx scripts/run-repair-immortal.ts 2 3 true > /tmp/iter83-loop.log 2>&1
echo "loop exit=$? $(date +%H:%M:%S)" >> "$STATUS"
echo "chain-done $(date +%H:%M:%S)" >> "$STATUS"
