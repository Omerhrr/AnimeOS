// NIGHT 131 ops - redo S001: the drain's first submission raced the
// pool admission (the 115 honest-ops receipt repeated) and the job
// fell through to the SIMULATOR - a stand-in with no clip, which the
// re-score would judge. Clear it honestly: delete the SIMULATOR job,
// re-queue the shot, and let the re-run redo exactly that shot.
// Run: DATABASE_URL=file:... npx tsx scripts/night131-redo-s001.ts
import { PrismaClient } from "@prisma/client";

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
  const s1 = await db.shot.findFirst({ where: { sceneId: scene.id, number: 1 } });
  if (!s1) throw new Error("shot 1 missing");
  const last = await db.renderJob.findFirst({
    where: { projectId: p.id, shotId: s1.id },
    orderBy: { startedAt: "desc" },
  });
  if (!last) { console.log("no job for S001"); process.exit(0); }
  if (last.outputUrl) { console.log(`S001's latest job already holds a clip (${last.outputUrl}) - nothing to do`); process.exit(0); }
  await db.renderJob.deleteMany({ where: { projectId: p.id, shotId: s1.id, outputUrl: null } });
  await db.shot.update({ where: { id: s1.id }, data: { status: "REVIEW" } });
  console.log(`cleared S001's clip-less job (driver ${last.driver}, status ${last.status}, stage "${last.stage}") -> REVIEW; the re-run redoes exactly S001`);
  process.exit(0);
}
main().finally(() => db.$disconnect());
