// NIGHT 222 - THE SECOND kf-v4 NIGHT (the clock's answer - the close
// cell's band vs the void guard's selection), the real production
// append. READY TO RIDE: at nights 2 the kf-v4 arc exits PROVISIONAL
// and the gate's verdict becomes the v4 law's own answer.
//
// The v4 law rides: the prompt law UNCHANGED (the guards are SELECTION
// laws, never prompt clauses - the 219 refusal's own shape) and the
// take law's selection carrying BOTH guards: the 219 FIGURE-COUNT
// GUARD (the echo demoted) and the 221 SCENE-PRESENCE GUARD (the
// studio void demoted). The cohort is the keyframe law's OWN (kf-v4).
//
// THE 222 REBUILD STATE: the sheets are the image channel's own work
// (the twelfth-drift wipe took the box; the restore's honest attempt
// named them window-bound). Until the sheets land, every shot misses
// HONESTLY naming the sheetless state ("No featured character with a
// model sheet") - the night report carries the errors verbatim, the
// gate still reads the committed arc (the ref chain survived the wipe),
// and the re-ride discipline (per-shot idempotence) makes the ride
// clean when the window opens. The 220 completion-ride pattern: this
// script is IDEMPOTENT - shots already on the ledger for this night
// are skipped.
//
// Run: npx tsx scripts/night222-v4aikeyframe.ts [shotNumber ...]
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_SOURCE,
  aiKeyframeCohort,
  runAiKeyframeNight,
} from "../src/lib/ai/keyframe";

const NIGHT = "night-222-v4aikeyframe";
const OUT_DIR = path.join(process.cwd(), "inspect", "aikeyframes");

async function main() {
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
  console.log(`night ${NIGHT} (cohort ${aiKeyframeCohort()}, takes 2, both guards riding) - already on the ledger: [${[...done].join(", ") || "none"}]`);

  const shots = await db.shot.findMany({
    where: { sceneId: scene.id },
    orderBy: { number: "asc" },
    select: { id: true, number: true },
  });
  const argNums = process.argv.slice(2).map((a) => parseInt(a, 10)).filter((n) => !isNaN(n));
  const filtered = argNums.length ? shots.filter((s) => argNums.includes(s.number)) : shots;
  const pending = filtered.filter((s) => !done.has(`12/${s.number}`));
  console.log(`pending shots: ${pending.map((s) => `S${String(s.number).padStart(3, "0")}`).join(", ") || "none"}`);

  if (pending.length === 0) {
    const { episodeReleaseVerdict } = await import("../src/lib/identity-matrix");
    const g = await episodeReleaseVerdict(project.id, scene.episode.id, AI_KEYFRAME_SOURCE);
    console.log(`\nGATE (no ride): verdict ${g.verdict}, arc ${g.arc}, nights ${g.nights}, provisional ${g.provisional}`);
    console.log(`  overall: mean ${Math.round((g.overall.mean ?? 0) * 100)}, median ${Math.round((g.overall.median ?? 0) * 100)}, p10 ${Math.round((g.overall.p10 ?? 0) * 100)}, worst ${Math.round((g.overall.worst ?? 0) * 100)}`);
    for (const c of g.blocking) {
      console.log(`  blocking: ${c.key} - ${c.verdict}, median ${Math.round((c.median ?? 0) * 100)}, p10 ${Math.round((c.p10 ?? 0) * 100)}${c.worstRef ? ` (worst at ${c.worstRef})` : ""}`);
    }
    await db.$disconnect();
    return;
  }

  const report = await runAiKeyframeNight(project.id, scene.episode.id, {
    night: NIGHT,
    takes: 2,
    samples: 3,
    outDir: OUT_DIR,
    onlyShotIds: pending.map((s) => s.id),
  });

  console.log(`\n=== NIGHT ${NIGHT} REPORT (cohort ${report.cohort}, law v${report.lawVersion}) ===`);
  for (const r of report.results) {
    if (!r.ok) {
      console.log(`${r.ref}: MISS ${r.error}`);
      continue;
    }
    const takes = (r.takes ?? []).map((t) => `take${t.take} ${t.ok ? Math.round((t.worst ?? 0) * 100) : `MISS`}(n=${t.countedFigures ?? "?"},a=${t.countedAnchors ?? "?"})${t.shipped ? "*" : ""}`).join(" ");
    const entries = (r.entries ?? []).map((e) => `${e.characterName} ${Math.round(e.similarity * 100)}`).join(", ");
    console.log(`${r.ref}: worst ${Math.round((r.worst ?? 0) * 100)} (${takes}) [${entries}] png: ${r.pngPath ?? "-"}`);
  }
  console.log(`appended: ${report.appended}`);
  const g = report.gate;
  if (g) {
    console.log(`GATE: verdict ${g.verdict}, arc ${g.arc}, nights ${g.nights}, provisional ${g.provisional}, floor ${Math.round(g.floor * 100)}`);
    console.log(`  overall: mean ${Math.round((g.overall.mean ?? 0) * 100)}, median ${Math.round((g.overall.median ?? 0) * 100)}, p10 ${Math.round((g.overall.p10 ?? 0) * 100)}, worst ${Math.round((g.overall.worst ?? 0) * 100)}`);
    for (const c of g.blocking) {
      console.log(`  blocking: ${c.key} - ${c.verdict}, median ${Math.round((c.median ?? 0) * 100)}, p10 ${Math.round((c.p10 ?? 0) * 100)}${c.worstRef ? ` (worst at ${c.worstRef})` : ""}`);
    }
  } else {
    console.log(`GATE ERROR: ${report.gateError}`);
  }

  await db.$disconnect();
}

main().catch((e) => { console.error("NIGHT FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
