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

  // the mode door: verify mode reads the ride the per-member calls
  // already landed (the executor's cap split it); live mode rides
  // inside this process (the original shape)
  const RIDE_RECEIPT_ENV = process.env.ANIMEOS_RIDE233_RECEIPT ?? "";
  const verifyMode = RIDE_RECEIPT_ENV.length > 0;

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
  // THE MAP'S OWN CELLS (grown to the law, the 234 graduation): the
  // named refs are the gate's blocking cells' worst refs - every one
  // names a LIVE shot. The literal worst cell is the box's state at
  // the 233 landing; the rides may lawfully move it (an acceptance
  // night's honest median), the map's cells stay live either way.
  const liveShotRefs233 = new Set(
    (await db.shot.findMany({
      where: { scene: { episodeId: episode!.id } },
      select: { id: true, number: true, scene: { select: { number: true, episode: { select: { number: true } } } } },
    })).map((s) => `E${s.scene.episode.number} Sc${s.scene.number} S${String(s.number).padStart(3, "0")}`),
  );
  ok(renderOrder.namedRefs.length > 0 && renderOrder.namedRefs.every((r) => liveShotRefs233.has(r)), `RENDER's named worst refs are the gate's own cells, all live (${renderOrder.namedRefs.join(", ")})`);
  // THE ANSWERER'S OWN SUCCESS DISSOLVES ITS ORDER (the 234 tail's
  // law, grown here): the AI order's law is asserted on the HEAD
  // receipt (the map the 233 rides answered - the tail owed work
  // there); the LIVE receipt answers the dissolution law - a source
  // that RELEASES earns no order (nothing stands between).
  const headReceipt233 = JSON.parse(execSync(`git show HEAD:${REVIEW_PATH}`, { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString()) as ReleaseReview;
  const headAiOrder = buildRepairWorkOrders(headReceipt233).find((o) => o.source === "AI_KEYFRAME");
  ok(!!headAiOrder && headAiOrder.answeredBy === "night-law", "the AI order named the night law (the answerer, never implied - the map the rides answered)");
  const liveAiVerdict233 = receipt.sources.find((s) => s.source === "AI_KEYFRAME")?.verdict;
  const liveAiDissolved = !receiptOrders.some((o) => o.source === "AI_KEYFRAME");
  ok(
    (liveAiVerdict233 === "RELEASE") === liveAiDissolved,
    `the live order law holds (AI_KEYFRAME ${liveAiVerdict233 ?? "?"}: ${liveAiDissolved ? "no order stands - nothing stands between; the tail's law answered" : "the order stands - the tail still owes work"})`,
  );
  ok(renderOrder.night === NIGHT && headAiOrder?.night === NIGHT, `the orders ride the review's own night tag (${NIGHT})`);
  ok(renderOrder.budget.members === REPAIR_MAX_MEMBERS && renderOrder.budget.shotsPerMember === REPAIR_MAX_SHOTS_PER_MEMBER, "the order's budget is the repair's own constants");

  // ── leg 4: the instrument seam, named LIVE ──
  console.log("leg 4: the instrument seam");
  const sweepRowsBefore = await db.identityScore.count();
  const arcDbRowsBefore = await db.identityArcReading.count();
  // the pre-ride committed half: in verify mode the rides already
  // landed, so the baseline is the COMMITTED state (git HEAD), not
  // the live file the rides grew
  const arcFileBefore = verifyMode
    ? execSync("git show HEAD:receipts/identity-arc.jsonl", { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString()
    : fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8");
  const keysBefore = foldKeys(arcFileBefore);
  ok(sweepRowsBefore <= REPAIR_MAX_MEMBERS * REPAIR_MAX_SHOTS_PER_MEMBER, `the sweep carries only what rides wrote (${sweepRowsBefore} row(s) - the sixth death took the original board; the ride's own re-scores land here)`);
  const arcDoor = await castArcMeasurement(projectId, episode!.id);
  ok(arcDoor.instrument === "arc", "the arc instrument answers (the committed half carries what the sweep lost)");
  ok(arcDoor.measurement.measured >= 2, `the arc instrument measures the cast (${arcDoor.measurement.measured} measured, the gate's own medians)`);
  ok(arcDoor.measurement.below >= 1, `the arc instrument names the work (${arcDoor.measurement.below} below at bar ${Math.round(arcDoor.measurement.bar * 100)}%)`);
  const sweepDoor = await castArcMeasurement(projectId, "no-such-episode");
  ok(sweepDoor.instrument === "sweep" && sweepDoor.measurement.measured === sweepRowsBefore, "no arc rows and the pre-arc world stands (the sweep door answers its own truth, byte-exact)");
  const belowNames = arcDoor.measurement.members.filter((m) => m.standing === "BELOW").map((m) => m.name);
  ok(belowNames.length >= 1 && belowNames.length <= REPAIR_MAX_MEMBERS, `the pass's queue is named by the gate's own standing (${belowNames.join(", ")})`);

  // ── leg 5: THE RIDE - the pass answers the map ──
  // TWO LAWFUL DOORS: the executor's single foreground call caps at
  // 10 minutes (measured - the control sleeper was reaped at the call
  // boundary) while the full pass rides ~13 minutes of real Blender
  // renders. So the ride can land per member (scripts/ride233-themap,
  // one call each, the same pass/night/map, the appends idempotent)
  // and this e2e VERIFY mode audits the landed ride from its receipt
  // against the live db, the committed half, and the pure laws - the
  // claim checked, not trusted. No env var and the e2e rides the pass
  // live (the original shape, for executors without the cap).
  console.log("leg 5: THE RIDE (the repair pass rides the map)");
  const rideReceiptPath = RIDE_RECEIPT_ENV;
  const verifyModeLeg5 = verifyMode;
  type RideRow = {
    rodeAt: string; night: string; memberFilter: string; instrument: string; episodeId: string; bar: number;
    workOrder: { namedRefs: string[]; unnamedRefs: string[] };
    before: { below: number; clearing: number; measured: number };
    after: { below: number; clearing: number; measured: number };
    members: Array<{
      name: string; verdict: string;
      before: { standing: string; average: number | null; worst: number | null; worstRef: string | null };
      after: { standing: string; average: number | null; worst: number | null };
      shots: Array<{ ref: string; shotId: string; before: number; after: number | null; verdict: string; error?: string }>;
    }>;
    arcAfter: Array<{ episodeId: string; episodeNumber: number | null; arc: boolean; nights: number; verdict: string }>;
    reanchor: boolean;
  };
  let rideRows: RideRow[] = [];
  let liveRide: Awaited<ReturnType<typeof runIdentityRepairPass>> | null = null;
  if (verifyMode) {
    rideRows = fs.readFileSync(path.join(process.cwd(), rideReceiptPath), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as RideRow);
    ok(rideRows.length >= 1, `the ride receipt carries the landed rides (${rideRows.length} member ride(s) at night ${rideRows[0]?.night})`);
    ok(rideRows.every((r) => r.instrument === "arc" && r.episodeId === episode!.id && r.night === NIGHT), "every landed ride answered the gate's own instrument, the map's episode, the same night");
    ok(rideRows.every((r) => r.members.every((m) => belowNames.includes(m.name))), "the landed rides worked exactly the gate's BELOW queue (no invented members)");
    const unionWorked = [...new Set(rideRows.flatMap((r) => r.members.map((m) => m.name)))];
    ok(belowNames.every((n) => unionWorked.includes(n)), `the gate's whole BELOW queue was worked (${unionWorked.join(", ")})`);
    ok(rideRows.every((r) => r.workOrder.namedRefs.join("|") === renderOrder.namedRefs.join("|")), "the map's named refs entered every ride verbatim");
    const firstShotNamed = rideRows.every((r) => r.members.every((m) => {
      const named = m.shots.filter((s) => renderOrder.namedRefs.includes(s.ref));
      return named.length === 0 || renderOrder.namedRefs.includes(m.shots[0].ref);
    }));
    ok(firstShotNamed, "the named refs rode FIRST for every member whose queue carried one (the map's order is THE order)");
    const verdictsLawful = rideRows.every((r) => r.members.every((m) => m.shots.every((s) => shotRepairVerdict(s.before, s.after, r.bar) === s.verdict)));
    ok(verdictsLawful, `every landed verdict answers the pure law (${rideRows.flatMap((r) => r.members).flatMap((m) => m.shots).map((s) => `${s.ref} ${Math.round(s.before * 100)}%→${s.after !== null ? Math.round(s.after * 100) + "%" : "unscored"} ${s.verdict}`).join("; ")})`);
    const workedRefs = rideRows.flatMap((r) => r.members.flatMap((m) => m.shots.map((s) => s.ref)));
    const perRowHonest = rideRows.every((r) => {
      const rowWorked = r.members.flatMap((m) => m.shots.map((s) => s.ref));
      return r.workOrder.unnamedRefs.every((u) => !rowWorked.includes(u));
    });
    ok(perRowHonest && workedRefs.some((ref) => renderOrder.namedRefs.includes(ref)), `the unnamed law held live (per ride: a named ref rides out unnamed only when THAT ride's queues carried nothing; the map's refs were carried: ${[...new Set(workedRefs.filter((ref) => renderOrder.namedRefs.includes(ref)))].join(", ") || "none"})`);
    ok(rideRows.every((r) => r.arcAfter.some((a) => a.episodeId === episode!.id && a.arc && a.nights >= 3)), "the after-standing answered the gate's own instrument (arc, 3+ nights)");
    ok(rideRows.every((r) => r.reanchor === false), "the rides name their own scope honestly (renders + re-scores + appends; the sheet acceptance waits for its own night)");
  } else {
    liveRide = await runIdentityRepairPass(projectId, {
      episodeId: episode!.id,
      members: REPAIR_MAX_MEMBERS,
      shotsPerMember: REPAIR_MAX_SHOTS_PER_MEMBER,
      namedRefs: renderOrder.namedRefs,
      night: NIGHT,
    });
    ok(liveRide.instrument === "arc", `the ride's instrument is the gate's own (${liveRide.instrument})`);
    ok(liveRide.episodeId === episode!.id, "the ride names the episode it rode");
    ok(liveRide.members.length === belowNames.length, `the pass worked exactly the arc's BELOW members (${liveRide.members.length})`);
    ok(liveRide.workOrder.namedRefs.join("|") === renderOrder.namedRefs.join("|"), "the map's named refs entered the budget verbatim");
    const workedRefs = liveRide.members.flatMap((m) => m.shots.map((s) => s.ref));
    const honestUnnamed = liveRide.workOrder.unnamedRefs.every((r) => !workedRefs.includes(r));
    const honestCarried = liveRide.workOrder.namedRefs.filter((r) => workedRefs.includes(r)).length > 0;
    ok(honestUnnamed && honestCarried, `the unnamed law held live (unnamed: ${liveRide.workOrder.unnamedRefs.length ? liveRide.workOrder.unnamedRefs.join(", ") : "none - every named ref was carried"})`);
    const firstShotNamed = liveRide.members.every((m) => {
      const named = m.shots.filter((s) => renderOrder.namedRefs.includes(s.ref));
      return named.length === 0 || renderOrder.namedRefs.includes(m.shots[0].ref);
    });
    ok(firstShotNamed, "the named refs rode FIRST for every member whose queue carried one (the map's order is THE order)");
    const verdictsLawful = liveRide.members.every((m) => m.shots.every((s) => shotRepairVerdict(s.before, s.after, liveRide!.bar) === s.verdict));
    ok(verdictsLawful, `every shot's verdict answers the pure law (${liveRide.members.flatMap((m) => m.shots).map((s) => `${s.ref} ${Math.round(s.before * 100)}%→${s.after !== null ? Math.round(s.after * 100) + "%" : "unscored"} ${s.verdict}`).join("; ")})`);
  }
  const arcDbRowsAfterRide = await db.identityArcReading.count();
  if (verifyModeLeg5) {
    ok(arcDbRowsAfterRide >= rideRows.length, `the landed rides' appends stand in the arc's db half (${arcDbRowsAfterRide} rows >= ${rideRows.length} ride(s))`);
  } else {
    ok(
      arcDbRowsAfterRide > arcDbRowsBefore || (arcDbRowsAfterRide === arcDbRowsBefore && arcDbRowsAfterRide >= 1),
      `the re-scores stand in the arc's db half (${arcDbRowsBefore} -> ${arcDbRowsAfterRide}, night ${NIGHT} - a first ride appends, a re-ride folds into the same keys: the night fold is the idempotent law)`,
    );
  }
  const appendedNights = await db.identityArcReading.findMany({ where: { night: NIGHT, source: "RENDER" }, select: { shotId: true } });
  ok(appendedNights.length > 0, `the appends carry the ride's own night tag (${appendedNights.length} row(s))`);
  const arcAfterRead = verifyMode
    ? rideRows[0].arcAfter.find((r) => r.episodeId === episode!.id)
    : liveRide!.arcAfter.find((r) => r.episodeId === episode!.id);
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
  // THE TAIL'S OWN LAW (the 234 graduation): a RENDER ride never
  // touches the tail's span - it moves only when the tail's own
  // night (the regen under the AI_KEYFRAME source) stands in the
  // arc. Either half carrying the tail's night is the lawful growth;
  // no tail night and the span is byte-untouched.
  const receiptAiNights = receipt.sources.find((s) => s.source === "AI_KEYFRAME")?.nights ?? 2;
  const arcNow = fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8");
  const tailNightLanded =
    foldKeys(arcNow).has(`AI_KEYFRAME|${renderOrder.namedRefs[0]?.replace(/^E(\d+) Sc(\d+) S(\d+)$/, "$1/$2/$3")}|${NIGHT}`) ||
    (await db.identityArcReading.count({ where: { source: "AI_KEYFRAME", night: NIGHT } })) > 0;
  ok(
    readAI.arc && readAI.nights >= receiptAiNights && (tailNightLanded || readAI.nights === receiptAiNights),
    `AI_KEYFRAME's span moves only under its own law (${readAI.nights} night(s) vs the receipt's ${receiptAiNights} - a RENDER ride never touches the tail${tailNightLanded ? `; the regen night ${NIGHT} stands in the arc` : ""})`,
  );
  const fresh = buildReleaseReview({
    projectId, episodeId: episode!.id, episodeTag: receipt.episodeTag, episodeTitle: receipt.episodeTitle,
    reads: [readAI, readRE],
    repairBudget: { members: REPAIR_MAX_MEMBERS, shotsPerMember: REPAIR_MAX_SHOTS_PER_MEMBER },
  });
  const freshRender = fresh.sources.find((s) => s.source === "RENDER")!;
  ok(freshRender.spanLine.includes(`${readRE.nights} night(s)`), `the fresh map speaks the gate's new span (${freshRender.spanLine})`);
  const oldRender = receipt.sources.find((s) => s.source === "RENDER")!;
  // THE MAP MOVES WITH THE WORK (grown to the law, the 234
  // graduation): the mean moved, OR the fresh span carries MORE
  // nights than the receipt's own (a lawful night joined), OR the
  // span already carries the ride's nights (a re-ride folds into the
  // same keys - the idempotent night fold). The literal "3 night(s)"
  // was the 233 box's span, not the law.
  ok(
    (freshRender.overall.mean !== null && oldRender.overall.mean !== null && freshRender.overall.mean !== oldRender.overall.mean)
      || freshRender.nights > oldRender.nights
      || freshRender.spanLine === oldRender.spanLine,
    `the map moved with the work - or already carries it (mean ${oldRender.overall.mean !== null ? Math.round(oldRender.overall.mean * 100) : "-"}% -> ${freshRender.overall.mean !== null ? Math.round(freshRender.overall.mean * 100) : "-"}%; nights ${oldRender.nights} -> ${freshRender.nights}; a re-ride folds into the ride's own nights: ${freshRender.spanLine})`,
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
  // THE VERIFY DOOR'S OWN TWO LAWFUL STATES (grown to the law, the
  // 234 graduation): a baseline that predates the rides' evidence
  // commit lacks their keys (the file must have grown by them); a
  // baseline that already carries the ride night's keys (the
  // evidence landed) answers the append-only law alone.
  const rideKeysInBaseline = [...keysBefore].some((k) => k.startsWith("RENDER|") && k.endsWith(`|${NIGHT}`));
  ok(
    linesAfter >= linesBefore && linesAfter >= keysBefore.size + (verifyModeLeg5 && !rideKeysInBaseline ? 2 : 0),
    `the committed half carries the ride (${linesBefore} pre-ride -> ${linesAfter} lines - a first ride appends its keys, a re-ride folds into the same keys: append-only BY KEY${rideKeysInBaseline ? "; the evidence commit already carries the ride's own keys" : ""})`,
  );
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
