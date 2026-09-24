// DB state check for the end-to-end 1-minute production run.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const main = async () => {
  const projects = await db.project.findMany({
    select: { id: true, title: true, visualStyle: true, resolution: true, fps: true },
  });
  console.log("PROJECTS:", JSON.stringify(projects).slice(0, 900));
  const chars = await db.character.count();
  const envs = await db.environment.count();
  const eps = await db.episode.count();
  const scenes = await db.scene.count();
  const shots = await db.shot.count();
  const jobs = await db.renderJob.count();
  const sheets = await (db as any).modelSheet?.count?.() ?? "n/a";
  const cuts = await (db as any).episodeCut?.count?.() ?? "n/a";
  const cues = await db.audioCue.count();
  console.log({ chars, envs, eps, scenes, shots, jobs, sheets, cuts, cues });
  await db.$disconnect();
};
main();
