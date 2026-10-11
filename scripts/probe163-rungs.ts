// THE 163 PROBE: S005's own rung - the 159 face boxes said resX=640;
// the 138 ladder promises the wides 1024. Read the shots' types.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({ where: { episode: { season: { projectId: project.id } } }, orderBy: { number: "asc" } });
  if (!scene) throw new Error("scene missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" }, select: { number: true, shotType: true, lens: true } });
  for (const s of shots) console.log(`S00${s.number}: shotType=${s.shotType} lens=${s.lens}`);
  await db.$disconnect();
})();
