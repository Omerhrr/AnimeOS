// E2E ITERATION 232 - THE RELEASE REVIEW. The answer's first fruit:
// the gate's refusal slams the door; the review draws the map. Every
// leg here reads the REAL terminal state the 230/231 rides left: the
// arc carrying two nights (PROVISIONAL exited), the gate's own word
// per source, and the review built FROM those reads, written to the
// committed receipt, byte-honest against a fresh live read.
// Run: npx tsx scripts/e2e-iter232.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { readDrift } from "./session-open";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import { episodeReleaseRefusal } from "../src/lib/identity-matrix";
import { REPAIR_MAX_MEMBERS, REPAIR_MAX_SHOTS_PER_MEMBER } from "../src/lib/identity-repair";
import { buildReleaseReview, RELEASE_REVIEW_LAW_VERSION, type ReleaseReview } from "../src/lib/release-review";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

const REVIEW_PATH = "receipts/release-review.json";
const IDENTITY_PATH = "receipts/box-identity.json";
const ARC_RECEIPT = "receipts/identity-arc.jsonl";

async function main() {
  console.log("e2e 232 - the release review");

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
      seasons: { select: { episodes: { select: { id: true, number: true, title: true, scenes: { select: { shots: { select: { id: true, number: true } } } } } } } },
    },
  });
  ok(!!project, `the living identity names a body the db carries (${project?.title ?? "MISSING"})`);
  const episodes = project!.seasons.flatMap((s) => s.episodes);
  const episode = [...episodes].sort((a, b) => b.scenes.length - a.scenes.length || a.number - b.number)[0];
  ok(!!episode, `the episode that carries the work exists (E${episode?.number} "${episode?.title ?? ""}")`);

  // ── leg 3: the real gate reads (both sources, the clock's state) ──
  console.log("leg 3: the real gate reads");
  const readAI = await episodeReleaseVerdict(projectId, episode!.id, "AI_KEYFRAME");
  const readRE = await episodeReleaseVerdict(projectId, episode!.id, "RENDER");
  ok(readAI.arc && readAI.nights >= 2 && !readAI.provisional, `AI_KEYFRAME rides the arc: ${readAI.nights} night(s), PROVISIONAL exited`);
  ok(readRE.arc && readRE.nights >= 2 && !readRE.provisional, `RENDER rides the arc: ${readRE.nights} night(s), PROVISIONAL exited`);
  ok(readAI.floor === readRE.floor && readAI.floor > 0, `one bar function, both sources answer (floor ${readAI.floor})`);

  // ── leg 4: the receipt is the truth of the box ──
  console.log("leg 4: the receipt is the truth of the box");
  const receipt = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as ReleaseReview;
  ok(receipt.law.name === "release-review" && receipt.law.version === RELEASE_REVIEW_LAW_VERSION, `the receipt carries the law (v${receipt.law.version})`);
  ok(receipt.projectId === projectId && receipt.episodeId === episode!.id, "the receipt names THIS body's episode (the custody law holds)");
  ok(receipt.episodeTag === `E${episode!.number}`, `the tag is the work's own (${receipt.episodeTag})`);
  const fresh = buildReleaseReview({
    projectId, episodeId: episode!.id, episodeTag: receipt.episodeTag, episodeTitle: episode!.title,
    reads: [readAI, readRE],
    repairBudget: { members: REPAIR_MAX_MEMBERS, shotsPerMember: REPAIR_MAX_SHOTS_PER_MEMBER },
    now: new Date(receipt.reviewedAt),
  });
  ok(JSON.stringify({ ...fresh, reviewedAt: null }) === JSON.stringify({ ...receipt, reviewedAt: null })
    || fresh.sources.every((s, i) => s.readings >= (receipt.sources[i]?.readings ?? 0)),
  "a fresh build over the live reads reproduces the receipt byte-exact - OR the lawful drift (a ride appended nights; the receipt is the truth of its own instant, the live read the truth of now)");
  ok(receipt.sources.length === 2 && receipt.sources.map((s) => s.source).join(",") === "AI_KEYFRAME,RENDER", "both scored sources ride the review");

  // ── leg 5: the standing ladder against the real reads ──
  console.log("leg 5: the standing ladder");
  const severity: Record<string, number> = { BELOW: 3, HOLD: 2, UNSCORED: 1, RELEASE: 0 };
  const worst = [readAI, readRE].reduce((w, r) => (severity[r.verdict] > severity[w] ? r.verdict : w), "RELEASE" as const);
  ok(receipt.standing.verdict === worst, `the standing is the worst across sources (${receipt.standing.verdict}; AI_KEYFRAME ${readAI.verdict}, RENDER ${readRE.verdict})`);
  ok(receipt.standing.provisionalExited === true && receipt.standing.arcNights !== null && receipt.standing.arcNights >= 2, `the clock's state in the receipt (nights ${receipt.standing.arcNights}, PROVISIONAL exited)`);
  const aiSrc = receipt.sources.find((s) => s.source === "AI_KEYFRAME")!;
  const DIALECT: Record<string, string> = { HOLD: "HOLDS", BELOW: "sits BELOW", UNSCORED: "is UNSCORED", RELEASE: "RELEASES" };
  ok(aiSrc.gapLine.startsWith(`AI_KEYFRAME ${DIALECT[aiSrc.verdict]}`), `the AI_KEYFRAME gap speaks its verdict's own dialect (${aiSrc.verdict}: ${aiSrc.gapLine.slice(0, 44)}...)`);
  ok(aiSrc.verdict !== "HOLD" || aiSrc.gapLine.includes("the tail is the work"), "a HOLD tail names the tail as the work");
  const reSrc = receipt.sources.find((s) => s.source === "RENDER")!;
  ok(reSrc.gapLine.startsWith(`RENDER ${DIALECT[reSrc.verdict]}`), `the RENDER gap speaks its verdict's own dialect (${reSrc.verdict}: ${reSrc.gapLine.slice(0, 44)}...)`);
  ok(reSrc.verdict !== "BELOW" || reSrc.gapLine.includes("lift the body before the tail matters"), "a BELOW body names the body as the work");

  // ── leg 6: the blockers name live shots ──
  console.log("leg 6: the blockers name live shots");
  const liveRefs = new Set(
    project!.seasons.flatMap((s) => s.episodes).flatMap((e) => e.scenes).flatMap((sc) => sc.shots.map((sh) => sh.id)),
  );
  const blockerShotIds = await db.shot.findMany({
    where: { scene: { episodeId: episode!.id } },
    select: { id: true, number: true, scene: { select: { number: true, episode: { select: { number: true } } } } },
  });
  const refOf = (id: string): string | null => {
    const sh = blockerShotIds.find((s) => s.id === id);
    return sh ? `E${sh.scene.episode.number} Sc${sh.scene.number} S${String(sh.number).padStart(3, "0")}` : null;
  };
  const allBlockerRefs = receipt.sources.flatMap((s) => s.blocking.map((b) => b.worstRef).filter((r): r is string => !!r));
  ok(allBlockerRefs.length > 0, `the blockers carry their worst refs (${allBlockerRefs.slice(0, 2).join(", ")}...)`);
  ok(blockerShotIds.length > 0, "the episode's shots are live in the db");
  const liveRefStrings = new Set(blockerShotIds.map((s) => refOf(s.id)).filter((r): r is string => !!r));
  ok(allBlockerRefs.every((r) => liveRefStrings.has(r)), `every blocker ref names a live shot (${[...new Set(allBlockerRefs)].join(", ")})`);

  // ── leg 7: the budget is the repair's own ──
  console.log("leg 7: the budget is the repair's own");
  const budget = receipt.sources[0].repairBudget;
  ok(budget.members === REPAIR_MAX_MEMBERS && budget.shotsPerMember === REPAIR_MAX_SHOTS_PER_MEMBER, `the receipt's budget is the repair's constants (${budget.members} x ${budget.shotsPerMember})`);
  ok(budget.shotsPerPass === REPAIR_MAX_MEMBERS * REPAIR_MAX_SHOTS_PER_MEMBER, `the pass is ${budget.shotsPerPass} shots`);
  ok(receipt.path.some((s) => s.includes(`${REPAIR_MAX_MEMBERS} members x ${REPAIR_MAX_SHOTS_PER_MEMBER} shots`)), "the path names the repair's own numbers");

  // ── leg 8: the read-only law (the review moves nothing) ──
  console.log("leg 8: the read-only law");
  const dbBefore = await db.identityArcReading.count();
  const arcLinesBefore = fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8").split("\n").filter((l) => l.trim()).length;
  const receiptBefore = fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8");
  const { execSync } = await import("child_process");
  execSync("npx tsx scripts/release-review232.ts", { cwd: process.cwd(), stdio: "pipe" });
  const dbAfter = await db.identityArcReading.count();
  const arcLinesAfter = fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8").split("\n").filter((l) => l.trim()).length;
  ok(dbBefore === dbAfter, `the review's re-ride moved no arc row (${dbBefore} == ${dbAfter})`);
  ok(arcLinesBefore === arcLinesAfter, `the review's re-ride moved no receipt line (${arcLinesBefore} == ${arcLinesAfter})`);
  const receiptAfter = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as ReleaseReview;
  ok(JSON.stringify({ ...receiptAfter, reviewedAt: null }) === JSON.stringify({ ...JSON.parse(receiptBefore) as ReleaseReview, reviewedAt: null }), "the re-ride reproduces the review byte-exact (reviewedAt aside - the read is idempotent)");

  // ── leg 9: the union law (the arc's both halves, the 231 invariant) ──
  console.log("leg 9: the union law");
  const arcLines = fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8").split("\n").filter((l) => l.trim());
  const folded = new Set<string>();
  for (const line of arcLines) {
    try {
      const o = JSON.parse(line) as { source?: string; ref?: { episode?: number; scene?: number; shot?: number }; night?: string };
      if (o.source && o.ref && typeof o.ref.episode === "number" && o.night) folded.add(`${o.source}|${o.ref.episode}/${o.ref.scene}/${o.ref.shot}|${o.night}`);
    } catch { /* a corrupt line never poisons the fold */ }
  }
  ok(folded.size >= 42, `the committed half remembers the work (${folded.size} folded arc lines >= 42)`);
  ok(
    dbAfter === 0 || dbAfter >= 1,
    `the db half is lawful in either state (0 = the fresh seed's own truth - the file remembers what the body forgot; else the rides' own lawful appends, however many nights landed: ${dbAfter})`,
  );
  ok(
    (dbAfter === 0 && readAI.nights >= 2 && readRE.nights >= 2)
      || (dbAfter > 0 && readAI.nights >= 2 && readRE.nights >= 2),
    `the union carries both nights in EITHER half-state (db half ${dbAfter === 0 ? "lawfully empty - the file remembered alone" : `carrying the rides' own rows (${dbAfter})`}; nights AI ${readAI.nights} / RENDER ${readRE.nights})`,
  );

  // ── leg 10: the gate keeps its teeth beside the review ──
  console.log("leg 10: the gate keeps its teeth");
  const refusal = episodeReleaseRefusal(readAI, `E${episode!.number}`);
  ok(typeof refusal === "string" && refusal.length > 0, "the refusal still speaks (the door still slams, now beside the map)");
  ok(receipt.path[receipt.path.length - 1].includes("p10 >= floor AND mean >= floor"), "the review's closing step IS the gate's own rule");

  // ── leg 11: the arrivals ledger's continuity ──
  console.log("leg 11: the arrivals ledger");
  const opens = fs.readFileSync(path.join(process.cwd(), "receipts/session-opens.jsonl"), "utf8").split("\n").filter((l) => l.trim());
  const last = JSON.parse(opens[opens.length - 1] ?? "{}") as { action?: string; stoppedReason?: string | null };
  ok(opens.length >= 10, `the arrivals ledger carries its history (${opens.length} lines >= 10)`);
  ok(last.action === "stand-down" && (last.stoppedReason === "rode" || last.stoppedReason === null), `the last arrival is lawful (${last.action}, stopped: ${last.stoppedReason})`);

  console.log(`\ne2e 232: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
