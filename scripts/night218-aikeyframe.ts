// NIGHT 218 - THE V2 LAW'S FIRST NIGHT (the real production append).
//
// The 218 law rides: the shadow-dye clause (the dim families), the
// artifact clause (every cell), the close-face v2 (ONE medium
// target), and the TAKE LAW (takes=2 - the full damped instrument on
// each take, the SHIPPED take's reading appends). The cohort is the
// keyframe law's OWN (kf-v2) - the v1 nights stay on the committed
// receipt under their bridge cohort; the new law's arc starts honest.
//
// PER-SHOT IDEMPOTENCE: a shot already on the ledger for this night
// is skipped - the chunked foreground rides stay clean (the reaper's
// law; the same idempotent replace every writer obeys).
//
// Run: npx tsx scripts/night218-aikeyframe.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_SOURCE,
  aiKeyframeCohort,
  runAiKeyframeNight,
} from "../src/lib/ai/keyframe";

const NIGHT = "night-218-aikeyframe";
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
  console.log(`night ${NIGHT} (cohort ${aiKeyframeCohort()}, takes 2) - already on the ledger: [${[...done].join(", ") || "none"}]`);

  // the shots not yet appended (the DB is the ride list; the skip is
  // enforced inside the loop below by the shot's own number chain)
  const shots = await db.shot.findMany({
    where: { sceneId: scene.id },
    orderBy: { number: "asc" },
    select: { id: true, number: true },
  });
  const pending = shots.filter((s) => !done.has(`12/${s.number}`));
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
    const takes = (r.takes ?? []).map((t) => `take${t.take} ${t.ok ? Math.round((t.worst ?? 0) * 100) : `MISS`}${t.shipped ? "*" : ""}`).join(" ");
    const entries = (r.entries ?? []).map((e) => `${e.characterName} ${Math.round(e.similarity * 100)}`).join(", ");
    console.log(`${r.ref}: worst ${Math.round((r.worst ?? 0) * 100)} (${takes}) [${entries}] views: ${(r.anchorViews ?? []).join(",") || "-"} png: ${r.pngPath ?? "-"}`);
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
