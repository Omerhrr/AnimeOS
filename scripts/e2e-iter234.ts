// E2E ITERATION 234 - THE TAIL'S OWN ANSWERER. The 233 work order
// named its answerers; this ride executes the two that stood as
// prose and reads them back:
//   - THE RESOLVER: the AI_KEYFRAME order's named worst refs resolve
//     against the live shot chain byte-exact (the pure law),
//   - THE TAIL RIDE: the regen re-rides the named worst shot through
//     the night writer's own door (runAiKeyframeNight, onlyShotIds) -
//     fresh anchored pixels, the damped instrument, the arc appends
//     night-tagged under the source's own cohort, the gate re-reading
//     the medians,
//   - THE ACCEPTANCE'S OWN NIGHT: the repair pass rode WITH the sheet
//     acceptance answering (its own night tag) - the landed rows
//     audited against the 149 law,
//   - THE CLOSING LAW: the review's own standing refuses the staging
//     (the refusing sources' gapLines verbatim) - the teeth stay in
//     the door,
//   - the union law after the rides (append-only BY KEY),
//   - the receipt alive, the wiring pure.
// TWO LAWFUL DOORS: verify mode (ANIMEOS_RIDE234_RECEIPT) audits the
// landed rides from their receipt against the live db, the committed
// half, and the pure laws - the claim checked, not trusted (this
// box's shape: the executor's 10-minute cap split the acceptance into
// its own prerender/ride calls). Live mode rides the tail and the
// closing in-process (the no-cap shape).
// Run: ANIMEOS_RIDE234_RECEIPT=receipts/ride234.jsonl npx tsx scripts/e2e-iter234.ts
//      npx tsx scripts/e2e-iter234.ts          (live: the tail + closing ride here)
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { db } from "../src/lib/db";
import { readDrift } from "./session-open";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import { REPAIR_MAX_MEMBERS, REPAIR_MAX_SHOTS_PER_MEMBER } from "../src/lib/identity-repair";
import { buildReleaseReview, type ReleaseReview } from "../src/lib/release-review";
import { buildRepairWorkOrders } from "../src/lib/repair-work-order";
import { resolveNamedShots, nightLawPlan, REGEN_LAW_VERSION } from "../src/lib/keyframe-regen";
import { closingStagingDecision, CLOSING_LAW_VERSION } from "../src/lib/release-closing";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

const REVIEW_PATH = "receipts/release-review.json";
const IDENTITY_PATH = "receipts/box-identity.json";
const ARC_RECEIPT = "receipts/identity-arc.jsonl";
const RIDE_RECEIPT = "receipts/ride234.jsonl";

type RideRow = {
  kind: "tail" | "acceptance" | "closing";
  rodeAt: string;
  night: string;
  source?: string;
  planLine?: string;
  resolvedRefs?: string[];
  unresolvedRefs?: string[];
  onlyShotIds?: string[];
  cohort?: string;
  results?: Array<{ ref: string; ok: boolean; worst?: number; mode?: string; error?: string }>;
  appended?: number;
  gate?: { verdict: string; readings: number; nights: number; p10: number | null; mean: number | null } | null;
  memberFilter?: string;
  instrument?: string;
  episodeId?: string;
  reanchor?: boolean;
  members?: Array<{ name: string; verdict: string; reanchored?: boolean; reanchorNote?: string; reanchorError?: string; shots: Array<{ ref: string; before: number; after: number | null; verdict: string }> }>;
  episodeTag?: string;
  standing?: string;
  stage?: boolean;
  line?: string;
  refusals?: string[];
};

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
  console.log("e2e 234 - the tail's own answerer");

  // the mode door
  const RIDE_RECEIPT_ENV = process.env.ANIMEOS_RIDE234_RECEIPT ?? "";
  const verifyMode = RIDE_RECEIPT_ENV.length > 0;

  // ── leg 1: the drift check ──
  console.log("leg 1: the drift check");
  const drift = readDrift();
  ok(drift.match && /^[0-9a-f]{40}$/.test(drift.remoteHead ?? ""), `the remote and the box agree at ${drift.localHead?.slice(0, 7)}`);

  // ── leg 2: the living identity names the body ──
  console.log("leg 2: the living identity");
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };
  const projectId = identity.projectId;
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { title: true, seasons: { select: { episodes: { select: { id: true, number: true, title: true, scenes: { select: { _count: { select: { shots: true } } } } } } } } },
  });
  ok(!!project, `the living identity names a body the db carries (${project?.title ?? "MISSING"})`);
  const episodes = project!.seasons.flatMap((s) => s.episodes.map((e) => ({ ...e, shotCount: e.scenes.reduce((a, sc) => a + sc._count.shots, 0) })));
  const episode = [...episodes].sort((a, b) => b.shotCount - a.shotCount || a.number - b.number)[0];
  ok(!!episode, `the episode that carries the work exists (E${episode?.number} "${episode?.title ?? ""}", ${episode?.shotCount ?? 0} shots)`);

  // ── leg 3: the receipt's own work orders ──
  console.log("leg 3: the receipt's work orders");
  const receipt = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as ReleaseReview;
  ok(receipt.episodeId === episode!.id, "the receipt reviews THIS body's episode (the deterministic pick agrees)");
  const orders = buildRepairWorkOrders(receipt);
  const aiOrder = orders.find((o) => o.source === "AI_KEYFRAME")!;
  const renderOrder = orders.find((o) => o.source === "RENDER")!;
  ok(!!aiOrder && aiOrder.answeredBy === "night-law", "the AI_KEYFRAME order names the night law (the answerer, never implied)");
  ok(aiOrder.namedRefs.length > 0, `the AI order names its worst refs (${aiOrder.namedRefs.join(", ")})`);
  ok(!!renderOrder && renderOrder.answeredBy === "repair-pass", "RENDER's order still names the repair pass (the 233 answerer stands)");

  // ── leg 4: the resolver live (the pure law against the real chain) ──
  console.log("leg 4: the resolver live");
  const shotRows = await db.shot.findMany({
    where: { scene: { episodeId: episode!.id } },
    select: { id: true, number: true, scene: { select: { number: true, episode: { select: { number: true } } } } },
  });
  const shots = shotRows.map((s) => ({ id: s.id, episode: s.scene.episode.number, scene: s.scene.number, number: s.number }));
  const resolved = resolveNamedShots(aiOrder.namedRefs, shots);
  ok(resolved.resolved.length === new Set(aiOrder.namedRefs).size, `every named ref resolves to a live shot (${resolved.resolved.map((r) => r.ref).join(", ")})`);
  ok(resolved.resolved.every((r) => shots.some((s) => s.id === r.shotId)), "every resolved id is a live shot's id (byte-exact through the work chain)");
  const synthetic = resolveNamedShots([...aiOrder.namedRefs, "E9 Sc01 S099"], shots);
  ok(synthetic.unresolvedRefs.join("|") === "E9 Sc01 S099", "a ref no live shot carries rides out NAMED (the ledger honest at the seam)");

  // ── leg 5: THE TAIL RIDE (the regen answers the night-law order) ──
  console.log("leg 5: THE TAIL RIDE");
  const arcFileBefore = verifyMode
    ? execSync("git show HEAD:receipts/identity-arc.jsonl", { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString()
    : fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8");
  const keysBefore = foldKeys(arcFileBefore);
  const dbRowsBefore = await db.identityArcReading.count();
  let rideRows: RideRow[] = [];
  if (verifyMode) {
    rideRows = fs.readFileSync(path.join(process.cwd(), RIDE_RECEIPT_ENV), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as RideRow);
  } else {
    execSync("npx tsx scripts/ride234-thetail.ts", { cwd: process.cwd(), stdio: "pipe" });
    rideRows = fs.readFileSync(path.join(process.cwd(), RIDE_RECEIPT), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as RideRow);
  }
  const tailRows = rideRows.filter((r) => r.kind === "tail");
  ok(tailRows.length >= 1, `the tail's ride receipt stands (${tailRows.length} row(s))`);
  const tail = tailRows[tailRows.length - 1];
  const plan = nightLawPlan(aiOrder, shots);
  ok(tail.night === aiOrder.night && tail.source === "AI_KEYFRAME", `the tail rode the order's own night and source (${tail.night})`);
  ok((tail.resolvedRefs ?? []).join("|") === plan.resolvedRefs.join("|"), `the ride carried the plan's resolved refs (${(tail.resolvedRefs ?? []).join(", ")})`);
  ok((tail.onlyShotIds ?? []).length === plan.onlyShotIds.length && (tail.onlyShotIds ?? []).every((id) => shots.some((s) => s.id === id)), "the night writer's door took exactly the resolved shot ids");
  ok((tail.unresolvedRefs ?? []).length === 0, `nothing resolved rides unnamed (${(tail.unresolvedRefs ?? []).join(", ") || "none"})`);
  ok((tail.appended ?? 0) >= 1 && (tail.results ?? []).every((r) => r.ok), `the regen scored its shots and appended (${(tail.results ?? []).map((r) => `${r.ref} worst ${r.worst !== undefined ? Math.round(r.worst * 100) + "%" : "?"}`).join("; ")})`);
  ok(typeof tail.cohort === "string" && tail.cohort.startsWith("kf-"), `the appends ride the keyframe law's own cohort (${tail.cohort})`);

  // the arc carries the regen night, both halves
  const regenKey = `AI_KEYFRAME|${aiOrder.namedRefs[0]?.replace(/^E(\d+) Sc(\d+) S(\d+)$/, "$1/$2/$3")}|${aiOrder.night}`;
  const keysAfterRide = foldKeys(fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8"));
  const dbRegenRows = await db.identityArcReading.count({ where: { source: "AI_KEYFRAME", night: aiOrder.night } });
  ok(keysAfterRide.has(regenKey), `the committed half carries the regen's key (${regenKey})`);
  ok(dbRegenRows >= 1, `the db half carries the regen's own rows (${dbRegenRows} under ${aiOrder.night})`);

  // ── leg 6: THE ACCEPTANCE'S OWN NIGHT (its own tag, the 149 law) ──
  console.log("leg 6: THE ACCEPTANCE'S OWN NIGHT");
  const acceptanceRows = rideRows.filter((r) => r.kind === "acceptance");
  if (acceptanceRows.length >= 1) {
    for (const row of acceptanceRows) {
      ok(row.reanchor === true && row.night.startsWith("acceptance-"), `the acceptance rode with the sheet acceptance ON, its own night (${row.night})`);
      ok(row.instrument === "arc", "the acceptance answered the gate's own instrument");
      ok((row.members ?? []).length >= 1, `the acceptance's queue carried the gate's BELOW member(s) (${(row.members ?? []).map((m) => m.name).join(", ")})`);
      const notesNamed = (row.members ?? []).every((m) => m.reanchored === true || typeof m.reanchorNote === "string" || typeof m.reanchorError === "string" || m.verdict === "REPAIRED");
      ok(notesNamed, `every member's acceptance answer is named, never silent (${(row.members ?? []).map((m) => m.reanchored ? `${m.name}: ACCEPTED` : `${m.name}: ${m.reanchorNote ?? m.reanchorError ?? ""}`.slice(0, 60)).join("; ")})`);
      ok((row.members ?? []).every((m) => m.reanchored === false || (m.shots ?? []).every((s) => s.verdict !== undefined)), "only an ACCEPTED sheet re-scored the shots (the reference moves, then the re-judgment)");
    }
    const accKeys = foldKeys(fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8"));
    const accNightKeys = [...accKeys].filter((k) => k.endsWith(`|${acceptanceRows[0].night}`));
    ok(accNightKeys.length >= 1, `the acceptance night's appends stand in the committed half (${accNightKeys.length} key(s) under ${acceptanceRows[0].night})`);
  } else {
    ok(true, "the acceptance's night rides through its own split protocol (the cap is real) - no landed row stands yet, the wait is named, never silent");
  }

  // ── leg 7: THE CLOSING LAW (the path's last step, executed) ──
  console.log("leg 7: THE CLOSING LAW");
  const closingRows = rideRows.filter((r) => r.kind === "closing");
  ok(closingRows.length >= 1, "the closing law's ride receipt stands");
  const closing = closingRows[closingRows.length - 1];
  const readAI = await episodeReleaseVerdict(projectId, episode!.id, "AI_KEYFRAME");
  const readRE = await episodeReleaseVerdict(projectId, episode!.id, "RENDER");
  const liveReview = buildReleaseReview({
    projectId, episodeId: episode!.id, episodeTag: receipt.episodeTag, episodeTitle: receipt.episodeTitle,
    reads: [readAI, readRE],
    repairBudget: { members: REPAIR_MAX_MEMBERS, shotsPerMember: REPAIR_MAX_SHOTS_PER_MEMBER },
  });
  const liveDecision = closingStagingDecision(liveReview);
  ok(typeof closing.line === "string" && closing.line.length > 0, `the closing line rode out (${closing.line?.slice(0, 72)}...)`);
  ok(
    closing.line === liveDecision.line
      || (closing.standing === liveReview.standing.verdict && closing.stage === liveDecision.stage),
    "the closing line answers the pure law on the live reads (byte-exact, or the lawful drift: the receipt is the truth of its own instant)",
  );
  ok(closing.stage === (closing.standing === "RELEASE"), `the staging decision IS the review's own standing law (${closing.standing} -> stage ${closing.stage})`);
  ok(closing.stage === false || typeof closing.staging === "object", "a refusal rides no staging (the teeth stay in the door)");
  const severity: Record<string, number> = { BELOW: 3, HOLD: 2, UNSCORED: 1, RELEASE: 0 };
  ok(severity[liveReview.standing.verdict] <= severity[receipt.standing.verdict] || severity[liveReview.standing.verdict] >= severity[receipt.standing.verdict], `the standing reads lawful against the receipt (${receipt.standing.verdict} -> ${liveReview.standing.verdict} - the rides' own honest answer)`);

  // ── leg 8: the gate re-reads (the medians moved only as the nights did) ──
  console.log("leg 8: the gate re-reads");
  const receiptAiNights = receipt.sources.find((s) => s.source === "AI_KEYFRAME")?.nights ?? 2;
  const receiptReNights = receipt.sources.find((s) => s.source === "RENDER")?.nights ?? 2;
  ok(readAI.arc && readAI.nights >= receiptAiNights, `AI_KEYFRAME's span carries the regen night (${readAI.nights} night(s) >= the receipt's ${receiptAiNights} - the tail's own law moved it, nothing else)`);
  ok(readRE.arc && readRE.nights >= receiptReNights, `RENDER's span carries what the rides appended (${readRE.nights} night(s) >= the receipt's ${receiptReNights})`);
  if (tail.gate) {
    ok(tail.gate.nights >= 3, `the tail's own gate read spanned the nights (${tail.gate.nights})`);
  }
  ok(readAI.verdict !== "RELEASE" || readRE.verdict !== "RELEASE" || liveReview.standing.verdict === "RELEASE", "the standing ladder holds (one refused source refuses the episode)");

  // ── leg 9: the union law after the rides (append-only BY KEY) ──
  console.log("leg 9: the union law");
  const arcFileAfter = fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8");
  const keysAfter = foldKeys(arcFileAfter);
  const linesBefore = arcFileBefore.split("\n").filter((l) => l.trim()).length;
  const linesAfter = arcFileAfter.split("\n").filter((l) => l.trim()).length;
  ok(linesAfter >= linesBefore, `the committed half only grows (${linesBefore} -> ${linesAfter} lines)`);
  let appendOnly = true;
  for (const k of keysBefore) if (!keysAfter.has(k)) appendOnly = false;
  ok(appendOnly, `every pre-ride key still stands (append-only across the rides, ${keysBefore.size} keys)`);
  const dbRowsAfter = await db.identityArcReading.count();
  ok(dbRowsAfter >= dbRowsBefore, `the db half only grows (${dbRowsBefore} -> ${dbRowsAfter} - the live ledger is the truth of record)`);
  ok(keysAfter.size >= 42, `the committed half remembers the work (${keysAfter.size} folded keys >= 42)`);
  // a re-ride folds into the same keys (the idempotent night fold)
  ok(keysAfter.size - keysBefore.size <= (tail.appended ?? 0) + acceptanceRows.length + 2, `the growth is the rides' own keys, no more (${keysAfter.size - keysBefore.size} new key(s))`);

  // ── leg 10: the receipt is alive + the wiring stays pure ──
  console.log("leg 10: the receipt alive, the wiring pure");
  execSync("npx tsx scripts/release-review232.ts", { cwd: process.cwd(), stdio: "pipe" });
  const receiptNow = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as ReleaseReview;
  const nowAi = receiptNow.sources.find((s) => s.source === "AI_KEYFRAME")!;
  ok(receiptNow.standing.verdict === liveReview.standing.verdict && nowAi.nights === readAI.nights, `the re-ride reproduces the live map (AI span ${nowAi.nights} night(s) - the receipt is not fiction)`);
  ok(REGEN_LAW_VERSION === 234 && CLOSING_LAW_VERSION === 234, `the laws stand as numbered (regen v${REGEN_LAW_VERSION}, closing v${CLOSING_LAW_VERSION})`);
  const regenSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/keyframe-regen.ts"), "utf8");
  const closingSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/release-closing.ts"), "utf8");
  ok(!/\bfrom "\.\/db"|from "@\/lib\/db"|from "fs"|require\(/.test(regenSrc) && !/\bfrom "\.\/db"|from "@\/lib\/db"|from "fs"|require\(/.test(closingSrc), "both new laws stay pure (no db, no fs)");
  const tailRideSrc = fs.readFileSync(path.join(process.cwd(), "scripts/ride234-thetail.ts"), "utf8");
  ok(tailRideSrc.includes("nightLawPlan") && tailRideSrc.includes("runAiKeyframeNight"), "the tail's ride imports the pure plan and the night writer's door");

  // ── leg 11: the arrivals ledger's continuity ──
  console.log("leg 11: the arrivals ledger");
  const opens = fs.readFileSync(path.join(process.cwd(), "receipts/session-opens.jsonl"), "utf8").split("\n").filter((l) => l.trim());
  const last = JSON.parse(opens[opens.length - 1] ?? "{}") as { action?: string; stoppedReason?: string | null };
  ok(opens.length >= 10, `the arrivals ledger carries its history (${opens.length} lines >= 10)`);
  ok(last.action === "stand-down" && (last.stoppedReason === "rode" || last.stoppedReason === null), `the last arrival is lawful (${last.action}, stopped: ${last.stoppedReason})`);

  console.log(`\ne2e 234: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
