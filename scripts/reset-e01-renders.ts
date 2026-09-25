// Reset Cloudveil Ascent E01 render artifacts so the shots re-render
// through the v4 DESIGNED pipeline (the old clips shipped the box
// stand-in), and clear the RENDER identity scores so the vision
// scoring re-judges the new shipping pixels honestly.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const db = new PrismaClient();
const TITLE = "Cloudveil Ascent";

async function main() {
  const p = await db.project.findFirst({ where: { title: TITLE } });
  if (!p) throw new Error("project missing");

  // kill any in-flight jobs, then forget the old PREVIEW clips
  const jobs = await db.renderJob.findMany({
    where: { projectId: p.id, mode: "PREVIEW" },
    select: { id: true, outputUrl: true },
  });
  for (const j of jobs) {
    if (j.outputUrl) {
      const file = path.join(process.cwd(), "public", j.outputUrl.split("?")[0].replace(/^\//, ""));
      try { fs.unlinkSync(file); } catch { /* already gone */ }
    }
  }
  const delJobs = await db.renderJob.deleteMany({ where: { projectId: p.id, mode: "PREVIEW" } });
  console.log(`deleted ${delJobs.count} PREVIEW render jobs (clips removed)`);

  // reset shots to REVIEW (queued for re-render)
  const upd = await db.shot.updateMany({
    where: { scene: { episode: { season: { projectId: p.id } } } },
    data: { status: "REVIEW" },
  });
  console.log(`reset ${upd.count} shots to REVIEW`);

  // clear RENDER-source identity scores (panel scores stay canonical)
  const delScores = await db.identityScore.deleteMany({ where: { projectId: p.id, source: "RENDER" } });
  console.log(`deleted ${delScores.count} RENDER identity scores`);
}

main().finally(() => process.exit(0));
