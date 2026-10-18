// RIDE 234 - THE TAIL'S OWN ANSWERER. The 233 ride answered RENDER's
// order (the repair pass) and named AI_KEYFRAME's answerer honestly:
// night-law. This ride executes that order for real: the plan
// resolves the order's named worst refs to live shots (the pure law,
// src/lib/keyframe-regen.ts), and the night writer's own door
// (runAiKeyframeNight, onlyShotIds) re-rides them - fresh anchored
// pixels through the edit channel, the damped instrument reading
// them N times, the shipped take appending to the arc night-tagged
// under the source's own cohort (kf-v4), and the gate re-reading the
// medians. The ride receipt lands for the e2e to audit against the
// live db, the committed half, and the pure laws - the claim
// checked, not trusted.
// Run: npx tsx scripts/ride234-thetail.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { runAiKeyframeNight } from "../src/lib/ai/keyframe";
import { buildRepairWorkOrders } from "../src/lib/repair-work-order";
import { nightLawPlan } from "../src/lib/keyframe-regen";
import type { ReleaseReview } from "../src/lib/release-review";

const RIDE_RECEIPT = "receipts/ride234.jsonl";
const IDENTITY_PATH = "receipts/box-identity.json";
const REVIEW_PATH = "receipts/release-review.json";
const OUT_DIR = "receipts/ride234";

async function main() {
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };
  const projectId = identity.projectId;
  const review = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as ReleaseReview;

  // the map's own order: AI_KEYFRAME, answeredBy night-law
  const orders = buildRepairWorkOrders(review);
  const order = orders.find((o) => o.source === "AI_KEYFRAME");
  if (!order) throw new Error("the review carries no AI_KEYFRAME order - nothing for the night law to answer");

  // the live shot chain (the resolver's argument - read-only)
  const shotRows = await db.shot.findMany({
    where: { scene: { episodeId: review.episodeId } },
    select: { id: true, number: true, scene: { select: { number: true, episode: { select: { number: true } } } } },
  });
  const shots = shotRows.map((s) => ({
    id: s.id,
    episode: s.scene.episode.number,
    scene: s.scene.number,
    number: s.number,
  }));

  // THE PLAN (pure): the named refs resolved, the answerer guarded
  const plan = nightLawPlan(order, shots);
  console.log(`RIDE 234 - THE TAIL`);
  console.log(`  ${plan.planLine}`);

  if (plan.onlyShotIds.length === 0) {
    // the honest no-op: named in the receipt, never silent
    const row = {
      kind: "tail",
      rodeAt: new Date().toISOString(),
      night: plan.night,
      source: order.source,
      planLine: plan.planLine,
      resolvedRefs: plan.resolvedRefs,
      unresolvedRefs: plan.unresolvedRefs,
      onlyShotIds: [],
      results: [],
      appended: 0,
      gate: null,
      noop: true,
    };
    fs.appendFileSync(path.join(process.cwd(), RIDE_RECEIPT), JSON.stringify(row) + "\n");
    console.log(`  nothing to re-ride - the no-op is named in the receipt`);
    return;
  }

  // THE NIGHT WRITER'S OWN DOOR: generate + read + append, the gate
  // re-reads (the report carries the gate's own read)
  const night = await runAiKeyframeNight(projectId, review.episodeId, {
    night: plan.night,
    samples: 3,
    takes: 1,
    onlyShotIds: plan.onlyShotIds,
    outDir: OUT_DIR,
  });

  const row = {
    kind: "tail",
    rodeAt: new Date().toISOString(),
    night: plan.night,
    source: order.source,
    planLine: plan.planLine,
    resolvedRefs: plan.resolvedRefs,
    unresolvedRefs: plan.unresolvedRefs,
    onlyShotIds: plan.onlyShotIds,
    cohort: night.cohort,
    lawVersion: night.lawVersion,
    results: night.results.map((r) => ({
      ref: r.ref,
      shotId: r.shotId,
      ok: r.ok,
      ...(r.error ? { error: r.error } : {}),
      ...(r.worst !== undefined ? { worst: r.worst } : {}),
      ...(r.mode ? { mode: r.mode } : {}),
      ...(r.anchoredSheets ? { anchoredSheets: r.anchoredSheets } : {}),
      ...(r.pngPath ? { pngPath: r.pngPath } : {}),
    })),
    appended: night.appended,
    gate: night.gate
      ? {
          verdict: night.gate.verdict,
          readings: night.gate.readings,
          nights: night.gate.nights,
          p10: night.gate.overall.p10,
          mean: night.gate.overall.mean,
        }
      : null,
    ...(night.gateError ? { gateError: night.gateError } : {}),
    reportPath: night.reportPath,
  };
  fs.appendFileSync(path.join(process.cwd(), RIDE_RECEIPT), JSON.stringify(row) + "\n");

  for (const r of night.results) {
    console.log(`  ${r.ref}: ${r.ok ? `worst ${Math.round((r.worst ?? 0) * 100)}% (${r.mode}, anchored: ${(r.anchoredSheets ?? []).join(", ") || "none"})` : `FAILED - ${r.error}`}`);
  }
  console.log(`  appended ${night.appended} arc reading(s) under ${plan.night} (cohort ${night.cohort})`);
  if (night.gate) {
    console.log(`  the gate re-read: ${night.gate.verdict} over ${night.gate.readings} reading(s), ${night.gate.nights} night(s) - p10 ${Math.round((night.gate.overall.p10 ?? 0) * 100)}%, mean ${Math.round((night.gate.overall.mean ?? 0) * 100)}%`);
  }
  console.log(`  receipt -> ${RIDE_RECEIPT}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
