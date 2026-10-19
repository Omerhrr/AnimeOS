// RIDE 233 - THE MAP, ANSWERED ONE MEMBER AT A TIME.
// The full pass rides both BELOW members in one process (~13 min of
// real Blender renders), and this session's executor caps a single
// foreground call at 10 minutes - measured, not guessed (the control
// sleeper was reaped at the call boundary). So the ride splits by
// MEMBER: one call per member, the same pass, the same map, the same
// night - the appends idempotent (the night fold), each member's
// result appended to the ride receipt for the e2e to verify against
// the live db, the committed half, and the pure laws.
// THE WAIT RESUMES THE WORK (the 233 resume law): a render whose
// waiter was reaped is resumed, not duplicated - and --prerender
// queues a member's targets in a seconds-long call so the bridge
// (a daemon that outlives every call) renders across the boundary;
// the ride call then resumes the wait and spends its budget on the
// re-score, not the render.
// Run: npx tsx scripts/ride233-themap.ts --member "Lin Yue"
//      npx tsx scripts/ride233-themap.ts --prerender --member "Demon Lord Wei"
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { REPAIR_MAX_MEMBERS, REPAIR_MAX_SHOTS_PER_MEMBER, runIdentityRepairPass, castArcMeasurement, belowArcShotsForCharacter, renderJobHeartbeatAlive } from "../src/lib/identity-repair";
import { targetsNamedFirst } from "../src/lib/repair-work-order";
import { createRenderJob } from "../src/lib/engine/render";

const RIDE_RECEIPT = "receipts/ride233.jsonl";
const IDENTITY_PATH = "receipts/box-identity.json";
const REVIEW_PATH = "receipts/release-review.json";
const NIGHT = "repair-2026-10-18";

async function memberTargets(projectId: string, episodeId: string, member: string, namedRefs: string[]) {
  // the pass's own selection law, read-only (the same door, no work)
  const door = await castArcMeasurement(projectId, episodeId);
  const mem = door.measurement.members.find((m) => m.standing === "BELOW" && m.name.toLowerCase().includes(member.toLowerCase()));
  if (!mem) return { bar: door.measurement.bar, targets: [] as Array<{ shotId: string; ref: string }> };
  const below = await belowArcShotsForCharacter(projectId, episodeId, mem.name, door.measurement.bar, REPAIR_MAX_SHOTS_PER_MEMBER);
  const order = targetsNamedFirst(below, namedRefs, REPAIR_MAX_SHOTS_PER_MEMBER);
  return { bar: door.measurement.bar, targets: order.targets };
}

async function main() {
  const prerender = process.argv.includes("--prerender");
  const memberArg = (process.argv.find((a) => a === "--member") ? process.argv[process.argv.indexOf("--member") + 1] : "") ?? "";
  const member = memberArg.trim();
  if (!member) throw new Error("--member \"<name>\" names the member this call rides");

  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };
  const projectId = identity.projectId;
  const receipt = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as {
    episodeId: string;
    sources: Array<{ source: string; blocking: Array<{ worstRef: string | null }> }>;
  };
  const renderOrderRefs = [...new Set(receipt.sources.find((s) => s.source === "RENDER")?.blocking.flatMap((b) => (b.worstRef ? [b.worstRef] : [])) ?? [])];
  if (renderOrderRefs.length === 0) throw new Error("the map's RENDER order carries no named refs - nothing to ride");

  if (prerender) {
    // queue the member's targets now; the bridge renders across the
    // call boundary; the ride's own wait resumes the work
    const { targets } = await memberTargets(projectId, receipt.episodeId, member, renderOrderRefs);
    if (targets.length === 0) {
      console.log(`PRERENDER - ${member}: no below-bar targets on the gate's board (nothing to queue)`);
      return;
    }
    for (const t of targets) {
      const latest = await db.renderJob.findFirst({
        where: { projectId, shotId: t.shotId, mode: "PREVIEW", status: { in: ["RENDERING", "REVIEW", "APPROVED"] } },
        orderBy: { startedAt: "desc" },
      });
      const freshDone =
        latest && (latest.status === "REVIEW" || latest.status === "APPROVED") && latest.outputUrl && latest.finishedAt &&
        Date.now() - latest.finishedAt.getTime() < 30 * 60_000;
      const aliveRide = latest && latest.status === "RENDERING" && renderJobHeartbeatAlive(latest.id, { progress: latest.progress, stage: latest.stage });
      if (freshDone || aliveRide) {
        console.log(`PRERENDER - ${member} ${t.ref}: the work already rides (${latest?.status}, no duplicate queued)`);
        continue;
      }
      const job = await createRenderJob(projectId, t.shotId, "PREVIEW");
      console.log(`PRERENDER - ${member} ${t.ref}: job ${job?.id.slice(-6) ?? "FAILED"} queued (the bridge renders across the boundary)`);
    }
    return;
  }

  // the sheet acceptance waits for its own night (the executor's cap
  // is real; the renders + re-scores + appends ARE the map's work
  // order) - named in the receipt, never silent
  const result = await runIdentityRepairPass(projectId, {
    episodeId: receipt.episodeId,
    members: REPAIR_MAX_MEMBERS,
    shotsPerMember: REPAIR_MAX_SHOTS_PER_MEMBER,
    nameFilter: member,
    namedRefs: renderOrderRefs,
    night: NIGHT,
    reanchor: false,
  });

  const row = {
    rodeAt: new Date().toISOString(),
    night: NIGHT,
    memberFilter: member,
    instrument: result.instrument,
    episodeId: result.episodeId,
    bar: result.bar,
    workOrder: result.workOrder,
    before: result.before,
    after: result.after,
    members: result.members,
    arcAfter: result.arcAfter,
    reanchor: false,
  };
  fs.appendFileSync(path.join(process.cwd(), RIDE_RECEIPT), JSON.stringify(row) + "\n");

  console.log(`RIDE 233 - ${member}`);
  console.log(`  instrument: ${result.instrument} | night ${NIGHT} | episode ${result.episodeId}`);
  console.log(`  workOrder: named [${result.workOrder.namedRefs.join(", ")}] unnamed [${result.workOrder.unnamedRefs.join(", ") || "none"}]`);
  for (const m of result.members) {
    console.log(`  ${m.name}: ${m.verdict} (${m.before.standing} ${m.before.worst !== null ? Math.round(m.before.worst * 100) + "%" : "-"} -> ${m.after.standing} ${m.after.worst !== null ? Math.round(m.after.worst * 100) + "%" : "-"})`);
    for (const s of m.shots) {
      console.log(`    ${s.ref} ${Math.round(s.before * 100)}% -> ${s.after !== null ? Math.round(s.after * 100) + "%" : "unscored"} ${s.verdict}${s.error ? ` (${s.error.slice(0, 60)})` : ""}`);
    }
  }
  for (const a of result.arcAfter) {
    console.log(`  arcAfter E${a.episodeNumber}: ${a.verdict} over ${a.readings} reading(s), ${a.nights} night(s)`);
  }
  console.log(`  receipt -> ${RIDE_RECEIPT}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
