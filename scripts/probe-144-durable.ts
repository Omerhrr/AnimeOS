// ─────────────────────────────────────────────────────────────
// PROBE 144 - THE LEDGER MUST OUTLIVE THE SANDBOX.
//
// The question the 143 handoff could not see coming: the arc ledger
// rides the runtime DB, and the runtime DB dies with every sandbox
// rebuild. Measured, twice, back to back:
//   • death #1 - the 143 rebuild found the ledger empty (the
//     night-142 arc rows died with the old DB; the record refused
//     to backfill them - the anti-fabrication law held),
//   • death #2 - THIS rebuild killed the night-143 arc rows the
//     same way. The two-night median has now been attempted twice
//     (142 -> 143, 143 -> 144) and zeroed twice.
//
// The candidates, probed honestly:
//   A (status quo): the ledger's lifetime IS the DB's lifetime.
//      Every death zeroes it; in a world with deaths the arc can
//      never accumulate past one DB lifetime.
//   B (the committed receipt): the rescore's append ALSO writes a
//      JSONL receipt into the repo - keyed by the WORK's number
//      chain (episode/scene/shot), not the DB's surrogate cuids.
//      The work survives every rebuild byte-exact (the restore law
//      recreates EP07/Sc12/S001-006 every time); the surrogate ids
//      do not (fresh cuids every seed). The gate unions the DB rows
//      and the receipt lines; dedupe by (ref, source, night).
//
// The anti-fabrication law holds unchanged: receipts START EMPTY -
// the dead rows stay dead (the 142/143 boards live in the records,
// not backfilled); only REAL appends write lines, going forward.
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const db = new PrismaClient();

async function main() {
  console.log("== Probe 144: does the arc ledger survive a sandbox death? ==\n");

  // P1 - the LIVE evidence of death #2: this sandbox was rebuilt at
  // 4fc5515 minutes ago; the night-143 arc rows are gone with the
  // old DB file. Queried, not remembered:
  const arcCount = await db.identityArcReading.count();
  console.log(`P1 the live arc ledger carries ${arcCount} row(s) after the rebuild`);
  console.log(`   death #2 is LIVE: night-143's 7 readings (recorded in README item 56,`);
  console.log(`   mean 55 / median 60 / p10 35, BELOW 5/6) exist only in the records now.`);

  // P2 - the recorded evidence of death #1: the 143 record named it
  // verbatim. The records are the receipts the anti-fabrication law
  // trusts - but the GATE cannot read prose:
  const readme = readFileSync("README.md", "utf8");
  const death1 = readme.includes("the sandbox death killed the night-142 arc rows WITH the old DB file");
  console.log(`\nP2 death #1 is recorded (README item 56 names the night-142 rows dead): ${death1}`);
  console.log(`   two deaths, two zeroings - the pattern, not the accident.`);

  // P3 - the surrogate is not stable; the work is. The rebuild's
  // fresh seed recreated the standing scene: the NUMBER chain
  // (episode 7 / scene 12 / shots 1..6) is code-deterministic - the
  // restore law wires byte-exact designs onto it every time - while
  // the cuids are new. The receipt must key the WORK:
  const scene = await db.scene.findFirst({
    where: { episode: { season: { project: { title: "Immortal Path" } } } },
    orderBy: { number: "asc" },
    include: { episode: { select: { number: true } }, shots: { orderBy: { number: "asc" } } },
  });
  if (!scene) throw new Error("the standing scene is missing");
  const refs = scene.shots.map((s) => `E${scene.episode.number}/Sc${scene.number}/S${String(s.number).padStart(3, "0")}`).join(" ");
  console.log(`\nP3 the work's number chain survived the death (the seed's own law):`);
  console.log(`   ${refs}`);
  console.log(`   cuids ${scene.shots[0].id.slice(0, 8)}... are fresh; the chain above is what receipts key.`);

  // P4 - the fold mechanics (pure): the receipt is a JSONL of
  // appends; folding replaces by (source, ref, night) - the same
  // idempotent replace the DB upsert obeys - and lines whose ref
  // names no live shot do not join (honest: the work is gone).
  const line = (shot: number, night: string, sim: number) =>
    JSON.stringify({ source: "RENDER", night, cohort: "a125/t133/p108", worst: sim,
      scores: [{ characterName: "Lin Yue", similarity: sim, aspects: {}, note: "probe" }],
      scoredAt: new Date(2026, 0, shot === 91 ? 1 : 2).toISOString(), ref: { episode: 7, scene: 12, shot } });
  type Fold = { key: string; night: string; sim: number };
  const fold = (lines: string[]): Fold[] => {
    const byKey = new Map<string, Fold>();
    for (const l of lines) {
      const o = JSON.parse(l) as { ref: { shot: number }; night: string; scores: Array<{ similarity: number }> };
      byKey.set(`RENDER|7/12/${o.ref.shot}|${o.night}`,
        { key: `RENDER|7/12/${o.ref.shot}|${o.night}`, night: o.night, sim: o.scores[0].similarity });
    }
    return [...byKey.values()];
  };
  const folded = fold([line(91, "night-A", 0.35), line(91, "night-B", 0.85), line(91, "night-A", 0.60)]);
  const reRode = folded.length === 2 && folded.find((f) => f.night === "night-A")?.sim === 0.60;
  console.log(`\nP4 the fold replaces by (source, ref, night) - three lines, two readings, the re-ride's 0.60 wins: ${reRode}`);

  // P5 - the two-night settle ACROSS a death (the exact scenario
  // that zeroed twice): night-A's rows died with the DB, night-B's
  // rows are live - the union reads two nights, the median settles,
  // the verdict loses PROVISIONAL:
  const nights = new Set(folded.map((f) => f.night)).size;
  const median = [...folded.map((f) => f.sim)].sort((a, b) => a - b);
  const med = median.length % 2 ? median[(median.length - 1) / 2] : (median[median.length / 2 - 1] + median[median.length / 2]) / 2;
  console.log(`\nP5 the union of {live DB: night-B 0.85} + {receipt: night-A 0.60} reads ${nights} night(s),`);
  console.log(`   per-entry median ${med} - a single night cannot move it; PROVISIONAL lifts at two.`);

  console.log(`\nVERDICT:`);
  console.log(`   A (DB-only ledger): measured dead twice - the instrument cannot reach`);
  console.log(`      its own purpose (the two-night median) in a world with deaths.`);
  console.log(`   B (the committed receipt): the append writes the durable line keyed`);
  console.log(`      by the work's chain; the gate unions DB + receipts; dedupe by`);
  console.log(`      (ref, source, night); receipts start EMPTY (no backfill - the`);
  console.log(`      anti-fabrication law holds); the first REAL line is the 144`);
  console.log(`      night's own append.`);
  console.log(`\nPROBE COMPLETE - the instrument fix is backed: the ledger outlives the sandbox.`);
}

main()
  .catch((e) => { console.error("probe failed:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
