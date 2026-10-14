// REBUILD VERIFY - the cast law on the rebuilt box: Lin r3 514 /
// Wei r3 517 byte-exact + DNA present + S004's 0.6 seed law +
// the clone-ghost absence. The 205 rebuild's own verify shape.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const chars = await db.character.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } });
  console.log(`cast: ${chars.length} characters`);
  for (const c of chars) {
    const v3 = (c.designVersions ?? []).find ? (c.designVersions as any)?.find?.((v: any) => v.version === 3) : null;
    const spec = v3?.designSpec ? JSON.stringify(v3.designSpec) : null;
    console.log(`${c.name}: spec r3 ${spec ? spec.length + "b" : "none"}, dna ${c.identityDna ? "yes" : "NO"}`);
  }
  const ep = await db.episode.findFirst({ where: { season: { projectId: project.id } }, include: { scenes: true } });
  const sc1 = ep?.scenes?.[0];
  if (!sc1) throw new Error("scene missing");
  const shots = await db.shot.findMany({ where: { sceneId: sc1.id }, orderBy: { number: "asc" } });
  for (const s of shots) {
    console.log(`S00${s.number}: camOverride ${JSON.stringify((s as any).cameraDistanceOverride ?? null)}`);
  }
  await db.$disconnect();
}
main().catch((e) => { console.error("VERIFY FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
