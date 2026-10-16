// NIGHT 219 - THE V3 LAW'S FIRST NIGHT (the real production append).
//
// The 219 law rides: the v2 prompt law UNCHANGED (the count CLAUSE
// did not earn its place - the 219A evidence: the clause's 92 ride
// DISOBEYED its own binding, three figures where two were staged,
// the shot grammar lost) and the take law's selection carrying the
// FIGURE-COUNT GUARD (the probe219-countpass instrument, 6/6
// agreement with the eye's labeled receipts; the guard demotes an
// echo draw whatever its identity score). The cohort is the keyframe
// law's OWN (kf-v3) - the v1/v2 nights stay on the committed receipt
// under their cohorts; the new law's arc starts honest (nights 1,
// PROVISIONAL - the release clock's answer waits on the v3 law's own
// second night).
//
// PER-SHOT IDEMPOTENCE: a shot already on the ledger for this night
// is skipped - the chunked foreground rides stay clean (the reaper's
// law; the same idempotent replace every writer obeys).
//
// Run: npx tsx scripts/night219-aikeyframe.ts [shotNumber ...]
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_SOURCE,
  aiKeyframeCohort,
  runAiKeyframeNight,
} from "../src/lib/ai/keyframe";

const NIGHT = "night-219-aikeyframe";
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
  console.log(`night ${NIGHT} (cohort ${aiKeyframeCohort()}, takes 2, the figure-count guard riding) - already on the ledger: [${[...done].join(", ") || "none"}]`);

  // the shots not yet appended (the DB is the ride list; the skip is
  // enforced inside the loop below by the shot's own number chain)
  const shots = await db.shot.findMany({
    where: { sceneId: scene.id },
    orderBy: { number: "asc" },
    select: { id: true, number: true },
  });
  // optional argv filter: the chunked foreground rides (the reaper's law)
  const argNums = process.argv.slice(2).map((a) => parseInt(a, 10)).filter((n) => !isNaN(n));
  const filtered = argNums.length ? shots.filter((s) => argNums.includes(s.number)) : shots;
  const pending = filtered.filter((s) => !done.has(`12/${s.number}`));
  console.log(`pending shots: ${pending.map((s) => `S${String(s.number).padStart(3, "0")}`).join(", ") || "none"}`);

  if (pending.length === 0) {
    // every shot on the ledger - the gate read only, no re-ride (a
    // re-ride would overwrite the shipped draws with fresh ones)
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
    const takes = (r.takes ?? []).map((t) => `take${t.take} ${t.ok ? Math.round((t.worst ?? 0) * 100) : `MISS`}(n=${t.countedFigures ?? "?"})${t.shipped ? "*" : ""}`).join(" ");
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
