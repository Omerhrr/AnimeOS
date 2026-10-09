// ─────────────────────────────────────────────────────────────
// PROBE ITERATION 146 - THE REPAIR AND THE GATE: two instruments,
// one refusal. The 145 night's settled verdict named its own repair
// path ("Repair the distribution (identity_repair_pass)") - and the
// probe asks the question BEFORE any pen moves: does the repair
// pass, as built, actually answer THAT verdict?
//
// Three questions, measured honestly:
//
//   PART 1 (the production ledger, read-only): the two instruments
//   read side by side at the same moment - the sweep standing the
//   repair pass reads (castIdentityMeasurement) vs the arc verdict
//   the release gate reads (episodeReleaseVerdict off the durable
//   receipt). Plus the repair's own queue: which shots would the
//   pass actually re-render, and do they include the worst shots
//   the gate's under cells named (the 145 refusal: S005 for
//   calm/emission/med, S002 for shadow)?
//
//   PART 2 (the lab scope, real functions): the divergence measured
//   live - two arc nights at 0.35, a repair-shaped re-score at 0.90
//   (the IdentityScore row scoreRenderIdentity leaves behind), then
//   both instruments read again: the repair's ledger law says
//   REPAIRED, the gate's arc median still sits at 0.35 BELOW. The
//   repair's re-scores die in the sweep - the arc never hears them.
//
//   PART 3 (the source truth): the wiring named - the repair renders
//   through createRenderJob PREVIEW (the bridge's rung ladder rides:
//   ESTABLISHING/WIDE at 1024, so no rung gap), but scoreRenderIdentity
//   contains NO arc append and the arc's only production writer is
//   the night rescore. The repair cannot feed the instrument it was
//   named to repair.
//
// No pen moves on the production: zero re-renders, zero production
// writes. The lab scope cleans up exactly (the no-residue law).
//
// Run: DATABASE_URL=file:... npx tsx scripts/probe-146-repair.ts
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import { readFileSync } from "fs";
import { castIdentityMeasurement } from "../src/lib/identity";
import { episodeReleaseVerdict, episodeReleaseRefusal } from "../src/lib/identity-matrix";
import { appendIdentityArcReading } from "../src/lib/identity-arc";
import { belowRenderShotsForCharacter, shotRepairVerdict } from "../src/lib/identity-repair";

const db = new PrismaClient();
const TITLE = "Immortal Path";
const LAB_ARC = "receipts/.probe146-lab.jsonl"; // gitignored - the lab never commits
const NIGHT_A = "probe146-a";
const NIGHT_B = "probe146-b";
const CO = "probe146-co";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || !detail ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}
const entry = (name: string, sim: number, note: string) => ({
  characterName: name,
  similarity: sim,
  aspects: { face: sim },
  note,
});

async function main() {
  console.log("== Probe 146: THE REPAIR AND THE GATE - two instruments, one refusal ==\n");

  // ── the production truth baselines (the no-residue law) ──
  const project = await db.project.findFirst({ where: { title: TITLE } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const episodeId = scene.episodeId;
  const receiptBefore = (() => {
    try { return readFileSync("receipts/identity-arc.jsonl", "utf8"); } catch { return "ABSENT"; }
  })();
  const arcCountBefore = await db.identityArcReading.count({ where: { projectId: project.id } });
  const scoreCountBefore = await db.identityScore.count({ where: { projectId: project.id } });
  console.log(`production baselines: arc rows ${arcCountBefore}, score rows ${scoreCountBefore}, receipt ${receiptBefore === "ABSENT" ? "ABSENT" : receiptBefore.split("\n").length + " lines"}\n`);

  // ══════ PART 1 - the two instruments, side by side, read-only ══════
  console.log("── PART 1: the production ledger reads ──\n");

  // P1a: the sweep standing - THE INSTRUMENT THE REPAIR READS
  const sweep = await castIdentityMeasurement(project.id, "RENDER");
  console.log("the repair's instrument (the sweep, castIdentityMeasurement):");
  for (const m of sweep.members) {
    console.log(`  ${m.name}: ${m.standing} (avg ${m.average === null ? "-" : (m.average * 100).toFixed(0) + "%"}, worst ${m.worst === null ? "-" : (m.worst * 100).toFixed(0) + "%"} at ${m.worstRef ?? "-"})`);
  }
  console.log(`  bar ${(sweep.bar * 100).toFixed(0)}%, below ${sweep.below}, clearing ${sweep.clearing}, measured ${sweep.measured}\n`);

  // P1b: the arc verdict - THE INSTRUMENT THE GATE READS
  const gate = await episodeReleaseVerdict(project.id, episodeId);
  const refusal = episodeReleaseRefusal(gate, "EP07");
  console.log("the gate's instrument (the arc, episodeReleaseVerdict off the durable receipt):");
  console.log(`  verdict ${gate.verdict}, arc=${gate.arc}, nights=${gate.nights}, provisional=${gate.provisional}, readings=${gate.readings}`);
  console.log(`  overall: mean ${(gate.overall.mean * 100).toFixed(0)}%, median ${(gate.overall.median * 100).toFixed(0)}%, p10 ${(gate.overall.p10 * 100).toFixed(0)}%, worst ${(gate.overall.worst * 100).toFixed(0)}% vs floor ${(gate.floor * 100).toFixed(0)}%`);
  console.log(`  blocking cells: ${gate.blocking.map((c) => `${c.key} ${c.verdict} (worst ${(c.worst * 100).toFixed(0)}% at ${c.worstRef})`).join("; ")}`);
  console.log(`  refusal verbatim: ${refusal}\n`);

  // P1c: the repair's queue - what the pass would actually re-render
  console.log("the repair's queue (belowRenderShotsForCharacter, limit 3, worst first):");
  const belowMembers = sweep.members.filter((m) => m.standing === "BELOW");
  const queues = new Map<string, { ref: string; similarity: number }[]>();
  for (const m of belowMembers) {
    const q = await belowRenderShotsForCharacter(project.id, m.name, sweep.bar, 3);
    queues.set(m.name, q);
    console.log(`  ${m.name}: ${q.map((s) => `${s.ref} @ ${(s.similarity * 100).toFixed(0)}%`).join(", ") || "(none)"}`);
  }
  console.log();

  // P1d: the alignment measure - do the queues carry the gate's named worst shots?
  const namedWorst = new Set(
    gate.blocking
      .map((c) => c.worstRef)
      .filter((r): r is string => typeof r === "string"),
  );
  const queuedRefs = new Set([...queues.values()].flatMap((q) => q.map((s) => s.ref)));
  const covered = [...namedWorst].filter((r) => queuedRefs.has(r));
  const missed = [...namedWorst].filter((r) => !queuedRefs.has(r));
  console.log(`the alignment measure: the gate names ${[...namedWorst].join(", ") || "(no named worst)"}; the default pass (2 members x 1 shot) would work ${[...queues.values()].map((q) => q[0]?.ref).filter(Boolean).join(", ") || "(none)"}`);
  console.log(`  the queues (limit 3) cover: ${covered.join(", ") || "none"} of the named; missed: ${missed.join(", ") || "none"}`);
  check("P1 the gate's named worst shots ride the repair's worst-first queues",
    namedWorst.size === 0 || covered.length === namedWorst.size,
    covered.length === namedWorst.size ? "all named" : `missed ${missed.join(", ")}`);
  console.log();

  // ══════ PART 2 - the divergence, measured on the lab scope ══════
  console.log("── PART 2: the divergence measured (the lab scope, real functions) ──\n");

  const season = await db.season.findFirst({ where: { projectId: project.id } });
  if (!season) throw new Error("season missing");
  const labEpisode = await db.episode.create({ data: { seasonId: season.id, number: 97, title: "probe146-lab" } });
  const labScene = await db.scene.create({ data: { episodeId: labEpisode.id, number: 97, title: "probe146-lab" } });
  const labShot = await db.shot.create({
    data: { sceneId: labScene.id, number: 91, description: "probe146 lab - Lin Yue stands", shotType: "MEDIUM", movement: "STATIC", poseStart: "stand", lighting: "night", duration: 1 },
  });

  try {
    // L1: two arc nights at 0.35 - the settled-two-night shape
    fs.rmSync(LAB_ARC, { force: true });
    await appendIdentityArcReading({
      projectId: project.id, shotId: labShot.id, source: "RENDER",
      night: NIGHT_A, cohort: CO, worst: 0.35, scores: [entry("Lin Yue", 0.35, "probe146 n-a")],
    }, { receiptPath: LAB_ARC });
    await appendIdentityArcReading({
      projectId: project.id, shotId: labShot.id, source: "RENDER",
      night: NIGHT_B, cohort: CO, worst: 0.35, scores: [entry("Lin Yue", 0.35, "probe146 n-b")],
    }, { receiptPath: LAB_ARC });
    const labGate = await episodeReleaseVerdict(project.id, labEpisode.id, "RENDER", { receiptPath: LAB_ARC });
    check("L1a the lab arc reads settled two nights", labGate.arc === true && labGate.nights === 2 && labGate.provisional === false,
      `nights=${labGate.nights} provisional=${labGate.provisional}`);
    check("L1b the lab gate refuses BELOW at the 0.35 median", labGate.verdict === "BELOW" && Math.abs(labGate.overall.median - 0.35) < 1e-9,
      `verdict=${labGate.verdict} median=${labGate.overall.median}`);

    // L2: the repair-shaped re-score - the IdentityScore row the repair's
    // scoreRenderIdentity leaves behind (exactly its write shape)
    await db.identityScore.create({
      data: {
        projectId: project.id,
        shotId: labShot.id,
        source: "RENDER",
        scores: JSON.stringify([entry("Lin Yue", 0.9, "probe146: the repair's re-score")]),
        worst: 0.9,
        castSize: 1,
        note: "probe146: the repair-shaped after reading",
      },
    });

    // L3: the repair's ledger law reads the lift (its own verdict function)
    const repairVerdict = shotRepairVerdict(0.35, 0.9, 0.7);
    const labRow = await db.identityScore.findFirst({ where: { shotId: labShot.id, source: "RENDER" } });
    check("L3a the repair's verdict law says REPAIRED (0.35 -> 0.90 clears the 0.70 bar)",
      repairVerdict === "REPAIRED", `verdict=${repairVerdict}`);
    check("L3b the sweep row carries the lift (the repair's after-instrument reads 0.90)",
      labRow?.worst === 0.9, `worst=${labRow?.worst}`);

    // L4: the gate's instrument reads the SAME MOMENT - and never heard
    // the re-score: the arc median still sits at 0.35
    const afterRepairGate = await episodeReleaseVerdict(project.id, labEpisode.id, "RENDER", { receiptPath: LAB_ARC });
    check("L4a the gate still refuses BELOW after the repair-shaped re-score",
      afterRepairGate.verdict === "BELOW", `verdict=${afterRepairGate.verdict}`);
    check("L4b the arc median never moved (0.35 - the re-score died in the sweep)",
      Math.abs(afterRepairGate.overall.median - 0.35) < 1e-9, `median=${afterRepairGate.overall.median}`);
    check("L4c the arc still reads exactly 2 nights (the repair appended nothing - readings count per-entry medians: 1 entry x 2 nights)",
      afterRepairGate.nights === 2 && afterRepairGate.readings === 1, `nights=${afterRepairGate.nights} readings=${afterRepairGate.readings}`);

    console.log(`
  THE DIVERGENCE, measured: the repair's ledger says REPAIRED
  (0.35 -> 0.90, the bar cleared); the gate's arc reads the same
  work at the same moment and still refuses BELOW (median 0.35,
  2 nights). The repair's re-scores write IdentityScore rows -
  the sweep - and the gate stopped reading the sweep the moment
  the arc existed. The repair pass cannot close the refusal it
  was named by, because its after-readings never reach the
  instrument that refused.`);
    console.log();
  } finally {
    // ── the no-residue law: the lab scope gone, byte-exact ──
    await db.episode.delete({ where: { id: labEpisode.id } }); // cascades scene -> shots -> scores + arc rows
    fs.rmSync(LAB_ARC, { force: true });
  }

  const receiptAfter = (() => {
    try { return readFileSync("receipts/identity-arc.jsonl", "utf8"); } catch { return "ABSENT"; }
  })();
  const arcCountAfter = await db.identityArcReading.count({ where: { projectId: project.id } });
  const scoreCountAfter = await db.identityScore.count({ where: { projectId: project.id } });
  check("P2 the no-residue law (receipt bytes, arc rows, score rows byte-exact)",
    receiptAfter === receiptBefore && arcCountAfter === arcCountBefore && scoreCountAfter === scoreCountBefore,
    `receipt ${receiptAfter === receiptBefore ? "byte-exact" : "CHANGED"}, arc ${arcCountBefore}->${arcCountAfter}, scores ${scoreCountBefore}->${scoreCountAfter}`);
  console.log();

  // ══════ PART 3 - the source truth ══════
  console.log("── PART 3: the wiring, named in source ──\n");
  const repairSrc = readFileSync("src/lib/identity-repair.ts", "utf8");
  const identitySrc = readFileSync("src/lib/identity.ts", "utf8");
  const bridgeSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  const rescoreSrc = readFileSync("scripts/night111-rescore.ts", "utf8");

  check("S1 the repair re-renders through createRenderJob PREVIEW (the bridge's ladder rides the render)",
    repairSrc.includes('createRenderJob(projectId, t.shotId, "PREVIEW")') || repairSrc.includes('createRenderJob(projectId, shotId, "PREVIEW")'),
    "the renderAndWait call");
  check("S2 the rung ladder keys the wide-end framings to 1024 (the repair's re-render inherits the wide rung - no rung gap)",
    bridgeSrc.includes("ESTABLISHING_CAP = 1024")
      && bridgeSrc.includes('return ESTABLISHING_CAP if str(shot_type or "").upper() in ("ESTABLISHING", "WIDE") else PREVIEW_CAP'),
    "preview_cap_for");
  check("S3 the repair's re-score path (scoreRenderIdentity) never touches the arc ledger - the gap's source truth",
    !identitySrc.includes("identityArcReading") && !identitySrc.includes("appendIdentityArcReading"),
    "identity.ts arc references");
  check("S4 the arc's only production writer is the night rescore (appendIdentityArcReading rides the night, not the repair)",
    rescoreSrc.includes("appendIdentityArcReading(") && !repairSrc.includes("appendIdentityArcReading"),
    "the append call sites");

  console.log(`
  THE PROBE'S VERDICT: the 145 refusal named identity_repair_pass as
  the repair - and the pass as built answers a DIFFERENT instrument.
  It reads the sweep (castIdentityMeasurement), works the per-member
  bar, re-scores into the sweep - while the refusal came from the ARC
  (the multi-night median), whose rows only the night rescore writes.
  A repair that lifts its shots to 0.90 reports REPAIRED into a ledger
  the gate no longer reads; the gate's median never moves; the refusal
  stands. The named repair cannot close the named gap until the
  repair's re-scores APPEND TO THE ARC (real production readings,
  ref-chained, cohort-tagged, a repair night tag) and the pass reads
  its after-standing the way the gate does - off the arc.
`);

  if (failures > 0) {
    console.log(`PROBE 146: ${failures} FAILURE(S) - the evidence is broken, fix the probe first`);
    process.exit(1);
  }
  console.log("PROBE 146 COMPLETE - the divergence is measured, the wiring is named, the 146 law follows from the evidence");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
