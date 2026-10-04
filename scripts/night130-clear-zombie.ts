// NIGHT 130 ops - clear the wall's zombie: the 55-minute wall expired
// mid-S006 and this time the resident did NOT survive it (nights
// 128/129 the resident served past the wall; tonight no Blender
// process lives and the job holds RENDERING with no clip). A zombie
// at RENDERING is skipped by the drain driver's redo scope - clear it
// honestly: delete the stuck job, re-queue the shot to REVIEW, and
// let the re-run redo exactly that shot.
// Run: DATABASE_URL=file:... npx tsx scripts/night130-clear-zombie.ts
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
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });

  let cleared = 0;
  for (const s of shots) {
    const last = await db.renderJob.findFirst({
      where: { projectId: p.id, shotId: s.id },
      orderBy: { startedAt: "desc" },
    });
    // the zombie: a Blender job still RENDERING while no clip exists
    // (the wall's kill left it mid-flight - the resident-serving law
    // has its limit: this night the resident died with the wall)
    if (last && last.status === "RENDERING" && !last.outputUrl
      && (last.driver === "BLENDER_LOCAL" || last.driver === "BLENDER")) {
      await db.renderJob.deleteMany({ where: { projectId: p.id, shotId: s.id } });
      await db.shot.update({ where: { id: s.id }, data: { status: "REVIEW" } });
      cleared += 1;
      console.log(`cleared zombie S00${s.number} (job ${last.id}, stage "${last.stage}") -> REVIEW`);
    }
  }
  if (!cleared) console.log("no zombies found");
  process.exit(0);
}
main().finally(() => db.$disconnect());
