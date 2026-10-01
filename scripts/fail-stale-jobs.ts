// Fail RENDERING jobs whose local worker state file is gone or stale.
// THE STALENESS LAW READS THE CONCLUSION (iteration 107): the tool
// failed a finished-but-unticked render on mtime alone - the file's
// own truth (done + mp4Path, iteration 105's "the finalize never
// lies") answers before the clock does:
//   done + clip on disk  -> the job LANDS as REVIEW (outputUrl set),
//                           the shot re-enters inspection;
//   done + error         -> the job lands the NAMED failure (FAILED
//                           re-queues, the loss is counted);
//   no file / unconcluded + stale mtime -> the old law (worker lost).
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
const db = new PrismaClient();
async function main() {
  const jobs = await db.renderJob.findMany({ where: { status: "RENDERING" } });
  for (const j of jobs) {
    const f = path.join(process.cwd(), "public", "renders", `.job-${j.id}.json`);
    if (!fs.existsSync(f)) {
      await db.renderJob.update({ where: { id: j.id }, data: { status: "FAILED", stage: "worker lost (no state file)", finishedAt: new Date() } });
      const shot = j.shotId ? await db.shot.update({ where: { id: j.shotId }, data: { status: "REVIEW" } }).catch(() => null) : null;
      console.log(`failed stale job ${j.id}${shot ? " (shot requeued)" : ""} - no state file`);
      continue;
    }
    let state: { done?: boolean; error?: string | null; mp4Path?: string | null } = {};
    try {
      state = JSON.parse(fs.readFileSync(f, "utf-8"));
    } catch {
      state = {};
    }
    if (state.done === true && state.mp4Path && fs.existsSync(state.mp4Path)) {
      // the unticked conclusion lands: a finished render is never failed
      await db.renderJob.update({
        where: { id: j.id },
        data: {
          status: "REVIEW", progress: 100,
          stage: "Blender clip landed after the tick went quiet - the staleness law read the job file's conclusion",
          outputUrl: `/renders/${j.id}.mp4`,
          finishedAt: new Date(),
        },
      });
      console.log(`landed unticked conclusion ${j.id} (clip on disk) - REVIEW`);
      continue;
    }
    if (state.done === true && state.error) {
      await db.renderJob.update({ where: { id: j.id }, data: { status: "FAILED", stage: `worker concluded with an error: ${state.error}`.slice(0, 120), finishedAt: new Date() } });
      const shot = j.shotId ? await db.shot.update({ where: { id: j.shotId }, data: { status: "REVIEW" } }).catch(() => null) : null;
      console.log(`failed concluded job ${j.id}${shot ? " (shot requeued)" : ""} - the error is named`);
      continue;
    }
    const stale = Date.now() - fs.statSync(f).mtimeMs > 15 * 60_000;
    if (stale) {
      await db.renderJob.update({ where: { id: j.id }, data: { status: "FAILED", stage: "worker lost (stale state file)", finishedAt: new Date() } });
      const shot = j.shotId ? await db.shot.update({ where: { id: j.shotId }, data: { status: "REVIEW" } }).catch(() => null) : null;
      console.log(`failed stale job ${j.id}${shot ? " (shot requeued)" : ""}`);
    } else {
      console.log(`job ${j.id} alive, left alone`);
    }
  }
}
main().finally(() => process.exit(0));
