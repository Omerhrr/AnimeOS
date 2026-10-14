// DRAIN-WHOLE CHECK - the watcher's done-key (the 205 done-key law,
// taught twice): the drain is whole when ALL SIX standing shots'
// latest RenderJobs ride the BLENDER engine AND hold clips on disk
// paths - not when any single run's NIGHT RESULT line reads 6/6
// (the repair run redoes only the three, printing 3/3).
// Prints exactly one line: WHOLE 6/6 or PARTIAL n/6.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
const db = new PrismaClient();
async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
  let whole = 0;
  for (const s of shots) {
    const job = await db.renderJob.findFirst({
      where: { shotId: s.id },
      orderBy: { createdAt: "desc" },
    });
    const isBlender = (job as any)?.driver === "BLENDER";
    const hasClip = Boolean((job as any)?.outputUrl);
    if (isBlender && hasClip) whole += 1;
    else console.error(`S00${s.number}: driver=${(job as any)?.driver ?? "none"} clip=${hasClip}`);
  }
  console.log(whole === shots.length && shots.length === 6 ? "WHOLE 6/6" : `PARTIAL ${whole}/${shots.length}`);
  fs.writeFileSync("/home/z/my-project/AnimeOS/drain-whole.verdict", whole === shots.length && shots.length === 6 ? "WHOLE 6/6" : `PARTIAL ${whole}/${shots.length}`);
  await db.$disconnect();
  // THE WATCHER'S HELPER LAW: exit explicitly - the Prisma pool keeps
  // the tsx event loop alive after disconnect, the parent's exit
  // listener never fires, the watch stalls mid-probe (the 208 seam).
  process.exit(0);
}
main().catch((e) => { console.error("CHECK FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
