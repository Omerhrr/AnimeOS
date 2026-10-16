// NIGHT 220 - THE PATIENT COMPLETION RIDE (the 219 night's pending tail).
//
// The 219 frontier named it: S004/S005/S006 PENDING behind the 429 wall
// (the pixels endpoint's own deep quota window). The 219 fix rides
// underneath: the pixels call carries the bounded ladder, a 429 returns
// an HONEST MISS, the gate still reads. This wrapper adds the DEEP
// patience the wall asked for: per-shot retries spaced 240s apart, a
// bounded deadline per invocation (the bash call's own law), per-shot
// idempotence (a landed shot is never re-ridden - the ledger is the
// truth, the same done-set the 219 script reads).
//
// Run: npx tsx scripts/night220-complete219.ts [deadlineMinutes]
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_SOURCE,
  runAiKeyframeNight,
} from "../src/lib/ai/keyframe";

const NIGHT = "night-219-aikeyframe";
const OUT_DIR = path.join(process.cwd(), "inspect", "aikeyframes");
const RETRY_WAIT_MS = 240_000;
const DEFAULT_DEADLINE_MIN = 8.5;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const deadlineMin = parseFloat(process.argv[2] ?? "") || DEFAULT_DEADLINE_MIN;
  const deadline = Date.now() + deadlineMin * 60_000;

  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("Immortal Path missing");
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { episode: { select: { id: true, number: true } } } });
  if (!scene) throw new Error("E7 Sc12 missing");

  // the already-appended shots (the receipt is the durable truth)
  const done = new Set<string>();
  const receiptPath = path.join(process.cwd(), "receipts/identity-arc.jsonl");
  try {
    for (const line of fs.readFileSync(receiptPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        if (o.source === AI_KEYFRAME_SOURCE && o.night === NIGHT) done.add(`${o.ref.scene}/${o.ref.shot}`);
      } catch { /* skip */ }
    }
  } catch { /* absent - fine */ }

  const shots = await db.shot.findMany({
    where: { sceneId: scene.id },
    orderBy: { number: "asc" },
    select: { id: true, number: true },
  });
  const pending = shots.filter((s) => !done.has(`12/${s.number}`));
  console.log(`patient completion for ${NIGHT} - pending: [${pending.map((s) => `S${String(s.number).padStart(3, "0")}`).join(", ") || "none"}], deadline ${deadlineMin}min`);
  if (pending.length === 0) {
    console.log("COMPLETION: the night is already complete - nothing to ride");
    await db.$disconnect();
    return;
  }

  let landed = 0;
  for (const shot of pending) {
    let attempts = 0;
    while (Date.now() < deadline) {
      attempts++;
      const report = await runAiKeyframeNight(project.id, scene.episode.id, {
        night: NIGHT,
        takes: 2,
        samples: 3,
        outDir: OUT_DIR,
        onlyShotIds: [shot.id],
      });
      const r = report.results[0];
      if (r?.ok) {
        const takes = (r.takes ?? []).map((t) => `take${t.take} ${t.ok ? Math.round((t.worst ?? 0) * 100) : "MISS"}(n=${t.countedFigures ?? "?"})${t.shipped ? "*" : ""}`).join(" ");
        console.log(`S${String(shot.number).padStart(3, "0")} LANDED on attempt ${attempts}: worst ${Math.round((r.worst ?? 0) * 100)} (${takes}) png: ${r.pngPath ?? "-"}`);
        landed++;
        break;
      }
      const waitMs = Math.min(RETRY_WAIT_MS, Math.max(0, deadline - Date.now()));
      console.log(`S${String(shot.number).padStart(3, "0")} attempt ${attempts}: MISS (${(r?.error ?? "unknown").slice(0, 120)}) - waiting ${Math.round(waitMs / 1000)}s`);
      if (waitMs <= 0) break;
      await sleep(waitMs);
    }
    if (Date.now() >= deadline) {
      console.log(`DEADLINE reached - S${String(shot.number).padStart(3, "0")} stays PENDING (the honest tail; the idempotent re-ride named for the next window)`);
      break;
    }
  }

  console.log(`\nCOMPLETION RIDE: ${landed}/${pending.length} landed this invocation`);
  await db.$disconnect();
}

main().catch((e) => { console.error("PATIENT RIDE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
