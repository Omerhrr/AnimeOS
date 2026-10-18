// E2E ITERATION 233 - THE MAP RIDES. The 232 review drew the map;
// this ride makes the path executable and reads it back:
//   - the work orders derived from the REAL receipt name the REAL
//     worst refs (the gate's own cells, worst-p10-first),
//   - the instrument seam is named LIVE: this body's sweep table is
//     empty (the sixth death took it) while the committed half still
//     carries both nights - the arc instrument answers what the gate
//     answers, where the old pass would have ridden an empty queue,
//   - THE RIDE: runIdentityRepairPass rides the map on the living
//     body - real re-renders (the built-in engine), real vision
//     re-scores (the open channel), the re-scores appending to the
//     arc night-tagged, the gate re-reading the medians,
//   - the union law after the ride: the committed half append-only,
//     the db half carrying the ride's own rows,
//   - the receipt re-rides alive (the map is the truth of NOW),
//   - the wiring: the route serves the review, the panel reads it.
// Run: npx tsx scripts/e2e-iter233.ts
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { db } from "../src/lib/db";
import { readDrift } from "./session-open";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import { REPAIR_MAX_MEMBERS, REPAIR_MAX_SHOTS_PER_MEMBER, runIdentityRepairPass, shotRepairVerdict, castArcMeasurement } from "../src/lib/identity-repair";
import { buildReleaseReview, type ReleaseReview } from "../src/lib/release-review";
import { buildRepairWorkOrders } from "../src/lib/repair-work-order";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

const REVIEW_PATH = "receipts/release-review.json";
const IDENTITY_PATH = "receipts/box-identity.json";
const ARC_RECEIPT = "receipts/identity-arc.jsonl";
const NIGHT = "repair-2026-10-18";

const foldKeys = (content: string): Set<string> => {
  const keys = new Set<string>();
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t) as { source?: string; night?: string; ref?: { episode?: number; scene?: number; shot?: number } };
      if (o.source && o.night && o.ref) keys.add(`${o.source}|${o.ref.episode}/${o.ref.scene}/${o.ref.shot}|${o.night}`);
    } catch { /* a corrupt line never poisons the fold */ }
  }
  return keys;
};

async function main() {
  console.log("e2e 233 - the map rides");

  // ── leg 1: the drift check ──
  console.log("leg 1: the drift check");
  const drift = readDrift();
  ok(drift.match && /^[0-9a-f]{40}$/.test(drift.remoteHead ?? ""), `the remote and the box agree at ${drift.localHead?.slice(0, 7)}`);

  // ── leg 2: the living identity names the body ──
  console.log("leg 2: the living identity");
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string; source?: string };
  const projectId = identity.projectId;
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      title: true,
      seasons: { select: { episodes: { select: { id: true, number: true, title: true, scenes: { select: { _count: { select: { shots: true } } } } } } } },
    },
  });
  ok(!!project, `the living identity names a body the db carries (${project?.title ?? "MISSING"})`);
  const episodes = project!.seasons.flatMap((s) => s.episodes.map((e) => ({ ...e, shotCount: e.scenes.reduce((a, sc) => a + sc._count.shots, 0) })));
  const episode = [...episodes].sort((a, b) => b.shotCount - a.shotCount || a.number - b.number)[0];
  ok(!!episode, `the episode that carries the work exists (E${episode?.number} "${episode?.title ?? ""}", ${episode?.shotCount ?? 0} shots)`);

  // ── leg 3: the receipt's own work orders (the map, made executable) ──
  console.log("leg 3: the receipt's work orders");
  const receipt = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as ReleaseReview;
  ok(receipt.episodeId === episode!.id, "the receipt reviews THIS body's episode (the deterministic pick agrees)");
  const receiptOrders = buildRepairWorkOrders(receipt);
  const renderOrder = receiptOrders.find((o) => o.source === "RENDER")!;
  const aiOrder = receiptOrders.find((o) => o.source === "AI_KEYFRAME")!;
  ok(!!renderOrder && renderOrder.answeredBy === "repair-pass", `RENDER's order names the repair pass (${renderOrder?.answeredBy})`);
  ok(renderOrder.namedRefs.length > 0 && renderOrder.namedRefs[0] === "E7 Sc12 S002", `RENDER's named worst ref is the gate's own cell (${renderOrder.namedRefs[0]})`);
  ok(!!aiOrder && aiOrder.answeredBy === "night-law", "the AI_KEYFRAME tail is the night law's work (the answerer named, never implied)");
  ok(renderOrder.night === NIGHT && aiOrder.night === NIGHT, `both orders ride the same night tag (${NIGHT})`);
  ok(renderOrder.budget.members === REPAIR_MAX_MEMBERS && renderOrder.budget.shotsPerMember === REPAIR_MAX_SHOTS_PER_MEMBER, "the order's budget is the repair's own constants");

  // ── leg 4: the instrument seam, named LIVE ──
  console.log("leg 4: the instrument seam");
  const sweepRowsBefore = await db.identityScore.count();
  const arcDbRowsBefore = await db.identityArcReading.count();
  const arcFileBefore = fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8");
  const keysBefore = foldKeys(arcFileBefore);
  ok(sweepRowsBefore === 0, `the sweep table is DEAD on this body (${sweepRowsBefore} rows - the sixth death took it)`);
  const arcDoor = await castArcMeasurement(projectId, episode!.id);
  ok(arcDoor.instrument === "arc", "the arc instrument answers (the committed half carries what the sweep lost)");
  ok(arcDoor.measurement.measured >= 2, `the arc instrument measures the cast (${arcDoor.measurement.measured} measured, the gate's own medians)`);
  ok(arcDoor.measurement.below >= 1, `the arc instrument names the work (${arcDoor.measurement.below} below at bar ${Math.round(arcDoor.measurement.bar * 100)}%)`);
  const sweepDoor = await castArcMeasurement(projectId, "no-such-episode");
  ok(sweepDoor.instrument === "sweep" && sweepDoor.measurement.measured === 0, "no arc rows and the pre-arc world stands (the sweep door, byte-exact, honestly empty)");
  const belowNames = arcDoor.measurement.members.filter((m) => m.standing === "BELOW").map((m) => m.name);
  ok(belowNames.length >= 1 && belowNames.length <= REPAIR_MAX_MEMBERS, `the pass's queue is named by the gate's own standing (${belowNames.join(", ")})`);

  // ── leg 5: THE RIDE - the pass answers the map ──
  console.log("leg 5: THE RIDE (the repair pass rides the map)");
  const ride = await runIdentityRepairPass(projectId, {
    episodeId: episode!.id,
    members: REPAIR_MAX_MEMBERS,
    shotsPerMember: REPAIR_MAX_SHOTS_PER_MEMBER,
    namedRefs: renderOrder.namedRefs,
    night: NIGHT,
  });
  ok(ride.instrument === "arc", `the ride's instrument is the gate's own (${ride.instrument})`);
  ok(ride.episodeId === episode!.id, "the ride names the episode it rode");
  ok(ride.members.length === belowNames.length, `the pass worked exactly the arc's BELOW members (${ride.members.length})`);
  ok(ride.workOrder.namedRefs.join("|") === renderOrder.namedRefs.join("|"), "the map's named refs entered the budget verbatim");
  const workedRefs = ride.members.flatMap((m) => m.shots.map((s) => s.ref));
  const honestUnnamed = ride.workOrder.unnamedRefs.every((r) => !workedRefs.includes(r));
  const honestCarried = ride.workOrder.namedRefs.filter((r) => workedRefs.includes(r)).length > 0;
  ok(honestUnnamed && honestCarried, `the unnamed law held live (unnamed: ${ride.workOrder.unnamedRefs.length ? ride.workOrder.unnamedRefs.join(", ") : "none - every named ref was carried"})`);
  const firstShotNamed = ride.members.every((m) => {
    const named = m.shots.filter((s) => renderOrder.namedRefs.includes(s.ref));
    return named.length === 0 || renderOrder.namedRefs.includes(m.shots[0].ref);
  });
  ok(firstShotNamed, "the named refs rode FIRST for every member whose queue carried one (the map's order is THE order)");
  const verdictsLawful = ride.members.every((m) => m.shots.every((s) => shotRepairVerdict(s.before, s.after, ride.bar) === s.verdict));
  ok(verdictsLawful, `every shot's verdict answers the pure law (${ride.members.flatMap((m) => m.shots).map((s) => `${s.ref} ${s.before !== null ? Math.round(s.before * 100) : "-"}%→${s.after !== null ? Math.round(s.after * 100) : "-"}% ${s.verdict}`).join("; ")})`);
  const arcDbRowsAfterRide = await db.identityArcReading.count();
  ok(arcDbRowsAfterRide > arcDbRowsBefore, `the re-scores appended to the arc's db half (${arcDbRowsBefore} -> ${arcDbRowsAfterRide}, night ${NIGHT})`);
  const appendedNights = await db.identityArcReading.findMany({ where: { night: NIGHT, source: "RENDER" }, select: { shotId: true } });
  ok(appendedNights.length > 0, `the appends carry the ride's own night tag (${appendedNights.length} row(s))`);
  const arcAfterRead = ride.arcAfter.find((r) => r.episodeId === episode!.id);
  ok(!!arcAfterRead && arcAfterRead.arc && arcAfterRead.nights >= 3, `the after-standing answers the gate's own instrument (arc, ${arcAfterRead?.nights ?? 0} night(s))`);
  const event = await db.productionEvent.findFirst({
    where: { projectId, type: "IDENTITY_REPAIR" },
    orderBy: { createdAt: "desc" },
    select: { summary: true, payload: true },
  });
  ok(!!event && event.summary.includes("the arc's union") && event.summary.includes("riding the release review's map"), "the landing event names the instrument AND the map");
  ok(!!event && (JSON.parse(event.payload ?? "{}") as { instrument?: string }).instrument === "arc", "the event's payload carries the instrument");

  // ── leg 6: the gate re-reads (the medians moved only as the pixels did) ──
  console.log("leg 6: the gate re-reads");
  const readRE = await episodeReleaseVerdict(projectId, episode!.id, "RENDER");
  ok(readRE.arc && readRE.nights >= 3, `RENDER's release read now spans ${readRE.nights} night(s) (the repair night joined the cohort)`);
  const readAI = await episodeReleaseVerdict(projectId, episode!.id, "AI_KEYFRAME");
  ok(readAI.arc && readAI.nights === (receipt.sources.find((s) => s.source === "AI_KEYFRAME")?.nights ?? 2), `AI_KEYFRAME's read is untouched by a RENDER ride (${readAI.nights} night(s) - the tail waits for its own law)`);
  const fresh = buildReleaseReview({
    projectId, episodeId: episode!.id, episodeTag: receipt.episodeTag, episodeTitle: receipt.episodeTitle,
    reads: [readAI, readRE],
    repairBudget: { members: REPAIR_MAX_MEMBERS, shotsPerMember: REPAIR_MAX_SHOTS_PER_MEMBER },
  });
  const freshRender = fresh.sources.find((s) => s.source === "RENDER")!;
  ok(freshRender.spanLine.includes(`${readRE.nights} night(s)`), `the fresh map speaks the gate's new span (${freshRender.spanLine})`);
  const oldRender = receipt.sources.find((s) => s.source === "RENDER")!;
  ok(
    freshRender.overall.mean !== null && oldRender.overall.mean !== null && Math.abs(freshRender.overall.mean - oldRender.overall.mean) > 0 || readRE.nights > (oldRender.nights ?? 0),
    `the map MOVED with the work (mean ${oldRender.overall.mean !== null ? Math.round(oldRender.overall.mean * 100) : "-"}% -> ${freshRender.overall.mean !== null ? Math.round(freshRender.overall.mean * 100) : "-"}%)`,
  );
  const severity: Record<string, number> = { BELOW: 3, HOLD: 2, UNSCORED: 1, RELEASE: 0 };
  ok(severity[fresh.standing.verdict] <= severity[receipt.standing.verdict], `the standing moves only upward or holds (${receipt.standing.verdict} -> ${fresh.standing.verdict} - the gate keeps its teeth)`);

  // ── leg 7: the receipt is alive (the map is the truth of NOW) ──
  console.log("leg 7: the receipt is alive");
  execSync("npx tsx scripts/release-review232.ts", { cwd: process.cwd(), stdio: "pipe" });
  const receiptNow = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as ReleaseReview;
  const nowRender = receiptNow.sources.find((s) => s.source === "RENDER")!;
  ok(receiptNow.standing.verdict === fresh.standing.verdict && nowRender.spanLine === freshRender.spanLine, "the re-ride reproduces the fresh map (the receipt is not fiction)");
  ok(nowRender.spanLine.includes(`${readRE.nights} night(s)`), `the receipt carries the ride's own nights (${nowRender.spanLine})`);

  // ── leg 8: the union law after the ride (append-only across halves) ──
  console.log("leg 8: the union law after the ride");
  const arcFileAfter = fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8");
  const keysAfter = foldKeys(arcFileAfter);
  const linesBefore = arcFileBefore.split("\n").filter((l) => l.trim()).length;
  const linesAfter = arcFileAfter.split("\n").filter((l) => l.trim()).length;
  ok(linesAfter > linesBefore && linesAfter >= 43, `the committed half grew with the ride (${linesBefore} -> ${linesAfter} lines)`);
  let appendOnly = true;
  for (const k of keysBefore) if (!keysAfter.has(k)) appendOnly = false;
  ok(appendOnly, `every pre-ride key still stands (append-only across the ride, ${keysBefore.size} keys)`);
  ok(arcDbRowsAfterRide >= 1, `the db half carries the ride's own rows (${arcDbRowsAfterRide} - the live ledger is the truth of record)`);

  // ── leg 9: the wiring (the route, the client, the panel) ──
  console.log("leg 9: the wiring");
  const routeSrc = fs.readFileSync(path.join(process.cwd(), "src/app/api/release-review/route.ts"), "utf8");
  ok(routeSrc.includes("requireProjectAccess") && routeSrc.includes("episodeReleaseVerdict") && routeSrc.includes("buildRepairWorkOrders"), "the route serves the gate's reads AND the orders");
  const panelSrc = fs.readFileSync(path.join(process.cwd(), "src/components/views/calendar-view.tsx"), "utf8");
  ok(panelSrc.includes("api.releaseReview"), "the Releases panel reads the review live");

  // ── leg 10: the arrivals ledger's continuity ──
  console.log("leg 10: the arrivals ledger");
  const opens = fs.readFileSync(path.join(process.cwd(), "receipts/session-opens.jsonl"), "utf8").split("\n").filter((l) => l.trim());
  const last = JSON.parse(opens[opens.length - 1] ?? "{}") as { action?: string; stoppedReason?: string | null };
  ok(opens.length >= 10, `the arrivals ledger carries its history (${opens.length} lines >= 10)`);
  ok(last.action === "stand-down" && (last.stoppedReason === "rode" || last.stoppedReason === null), `the last arrival is lawful (${last.action}, stopped: ${last.stoppedReason})`);

  console.log(`\ne2e 233: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
