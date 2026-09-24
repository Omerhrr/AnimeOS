#!/bin/bash
# Ensure the AnimeOS dev server answers on 127.0.0.1:3000 within this
# tool call. Background processes are reaped between tool calls in this
# sandbox, so callers run this first; turbopack's .next cache keeps the
# restart fast.
cd /home/z/my-project
if curl -s -o /dev/null -m 2 http://127.0.0.1:3000/api/projects; then
  echo "dev server already up"
  exit 0
fi
pkill -f "[n]ext-server" 2>/dev/null
pkill -f "[n]ext dev" 2>/dev/null
rm -f dev.log
setsid bash -c 'cd /home/z/my-project && exec bun run dev' < /dev/null > /dev/null 2>&1 &
for i in $(seq 1 60); do
  sleep 1
  if curl -s -o /dev/null -m 2 http://127.0.0.1:3000/api/projects; then
    echo "dev server up after ${i}s"
    exit 0
  fi
done
echo "dev server failed to start"
tail -20 dev.log 2>/dev/null | sed 's/\x00//g'
exit 1
