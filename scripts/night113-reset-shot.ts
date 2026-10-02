// Reset ONE shot's renders so the night driver redoes it through the
// current laws (the staleness tool's law: the job files' own
// conclusions are the truth - done + mp4Path get their clips deleted
// with the job rows). Usage: npx tsx scripts/night113-reset-shot.ts <shotNumber>
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const db = new PrismaClient();
const n = Number(process.argv[2] ?? "3");

async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: n } });
  if (!shot) throw new Error(`shot S00${n} missing`);
  const jobs = await db.renderJob.findMany({ where: { projectId: project.id, shotId: shot.id } });
  for (const j of jobs) {
    if (j.outputUrl) {
      const file = path.join(process.cwd(), "public", j.outputUrl.split("?")[0].replace(/^\//, ""));
      try { fs.unlinkSync(file); } catch { /* already gone */ }
    }
  }
  await db.renderJob.deleteMany({ where: { projectId: project.id, shotId: shot.id } });
  await db.identityScore.deleteMany({ where: { shotId: shot.id } });
  await db.shot.update({ where: { id: shot.id }, data: { status: "REVIEW" } });
  console.log(`reset S00${n}: ${jobs.length} job(s) + clips deleted, identity score cleared`);
}
main()
  .catch((e) => { console.error("reset failed:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
