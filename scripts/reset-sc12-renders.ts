// Reset Immortal Path's first-scene render artifacts so the shots
// re-render through the TRIAD build (iteration 107: the surface's
// sheet range, the face that steps out of the skull, the presence
// solve), and clear the RENDER identity scores so the vision
// re-score judges the new pixels honestly.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const db = new PrismaClient();
const TITLE = "Immortal Path";

async function main() {
  const p = await db.project.findFirst({ where: { title: TITLE } });
  if (!p) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: p.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");

  const jobs = await db.renderJob.findMany({
    where: { projectId: p.id, sceneId: undefined, shot: { sceneId: scene.id } } as never,
    select: { id: true, outputUrl: true },
  }).catch(async () => {
    // fallback: join through shots
    const shots = await db.shot.findMany({ where: { sceneId: scene.id }, select: { id: true } });
    return db.renderJob.findMany({
      where: { projectId: p.id, shotId: { in: shots.map((s) => s.id) } },
      select: { id: true, outputUrl: true },
    });
  });
  let removed = 0;
  for (const j of jobs) {
    if (j.outputUrl) {
      const file = path.join(process.cwd(), "public", j.outputUrl.split("?")[0].replace(/^\//, ""));
      try { fs.unlinkSync(file); removed += 1; } catch { /* already gone */ }
    }
  }
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, select: { id: true } });
  const delJobs = await db.renderJob.deleteMany({ where: { projectId: p.id, shotId: { in: shots.map((s) => s.id) } } });
  console.log(`deleted ${delJobs.count} render jobs (${removed} clips removed)`);
  const delScores = await db.identityScore.deleteMany({ where: { projectId: p.id, source: "RENDER" } });
  console.log(`deleted ${delScores.count} RENDER identity scores`);
  const upd = await db.shot.updateMany({ where: { sceneId: scene.id }, data: { status: "REVIEW" } });
  console.log(`reset ${upd.count} shots to REVIEW`);
}
main().finally(() => db.$disconnect());
