// ─────────────────────────────────────────────────────────────
// NIGHT 146 REPAIR - the FIRST REAL repair pass on the drain's
// own below cells, on the production scope, against the
// committed ledger.
//
// The 145 verdict named identity_repair_pass as the repair; 146
// wired the repair's re-scores INTO the arc the gate reads. This
// runner is the closed loop's second beat: refuse (the night's
// rescore, already appended) -> repair (this pass: sheet DNA
// read, worst named shots re-rendered over the real engine,
// re-scored through the real vision channel, the arc appends
// under repair-<calendar day>) -> re-read (episodeReleaseVerdict
// off the SAME receipt path the appends rode - the gate answers
// in its own vocabulary).
//
// The pass defaults are the production law: reanchor ON, night
// tag repair-<calendar day> (a re-run the same day folds into
// the same night - the idempotent replace), receiptPath default
// (the committed production ledger).
//
// Run AFTER scripts/night111-rescore.ts appended night-146.
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { castIdentityMeasurement } from "../src/lib/identity";
import { runIdentityRepairPass } from "../src/lib/identity-repair";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";

const db = new PrismaClient();
const TITLE = "Immortal Path";

const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? "-" : `${(v * 100).toFixed(0)}%`);

async function main() {
  const project = await db.project.findFirst({ where: { title: TITLE } });
  if (!project) throw new Error("project missing");

  const before = await castIdentityMeasurement(project.id, "RENDER");
  console.log(`=== BEFORE (the drain's own standing, bar ${pct(before.bar)}) ===`);
  for (const m of before.members) {
    console.log(`  ${m.name}: ${m.standing} avg ${pct(m.average)} worst ${pct(m.worst)} (${m.worstRef ?? "-"})`);
  }

  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const gateBefore = await episodeReleaseVerdict(project.id, scene.episodeId, "RENDER");
  console.log(`=== GATE BEFORE ===\n${gateBefore.message ?? gateBefore.verdict}`);

  console.log(`\n=== THE FIRST REAL REPAIR PASS (members 2, shotsPerMember 3 - the probe-proven coverage of the gate's named cells, reanchor ON, night repair-<today>, production receipt) ===`);
  const pass = await runIdentityRepairPass(project.id, {
    members: 2,
    shotsPerMember: 3,
    reanchor: true,
  });

  console.log(`\narc night: ${pass.night} (bar ${pct(pass.bar)})`);
  for (const mem of pass.members) {
    console.log(`\n  ${mem.name}: ${mem.verdict} (${mem.before.standing} avg ${pct(mem.before.average)} -> after ${mem.after.standing} avg ${pct(mem.after.average)})`);
    console.log(`    dna: ${mem.dna.line}`);
    if (mem.shots.length) {
      for (const s of mem.shots) {
        console.log(`    ${s.ref}: ${pct(s.before)} -> ${s.after === null ? "unscored" : pct(s.after)} - ${s.verdict}${s.error ? ` (${s.error})` : ""}`);
      }
    } else {
      console.log(`    (no named below shot found)`);
    }
    if (mem.reanchored) console.log(`    re-anchored: the sheet regenerated mid-loop, shots re-scored against the new sheet`);
    if (mem.reanchorError) console.log(`    re-anchor FAILED: ${mem.reanchorError}`);
  }

  console.log(`\n=== ARC AFTER (the gate's own read off the appends' receipt path) ===`);
  for (const a of pass.arcAfter) {
    console.log(`  EP${a.episodeNumber ?? "?"}: ${a.verdict} (mean ${pct(a.overall.mean)}, median ${pct(a.overall.median)}, p10 ${pct(a.overall.p10)}, worst ${pct(a.overall.worst)} over ${a.readings} arc reading(s) across ${a.nights} night(s)${a.provisional ? " (PROVISIONAL - single-night read)" : ""}, floor ${pct(a.floor)})`);
    if (a.message) console.log(`    gate: ${a.message}`);
  }

  const after = await castIdentityMeasurement(project.id, "RENDER");
  console.log(`\n=== STANDING: ${pass.before.below} below -> ${pass.after.below} below, ${pass.before.clearing} -> ${pass.after.clearing} clearing (${pass.after.measured} measured) ===`);
  for (const m of after.members) {
    console.log(`  ${m.name}: ${m.standing} avg ${pct(m.average)} worst ${pct(m.worst)} (${m.worstRef ?? "-"})`);
  }

  const gateAfter = await episodeReleaseVerdict(project.id, scene.episodeId, "RENDER");
  console.log(`\n=== GATE AFTER (the re-read - the closed loop's third beat) ===\n${gateAfter.message ?? gateAfter.verdict}`);
}

main()
  .catch((e) => { console.error("REPAIR FAILED:", e); process.exit(1); })
  .finally(() => db.$disconnect());
