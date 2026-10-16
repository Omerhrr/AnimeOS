// PROBE 215 - RECON: the three remaining cells (S001 / S003 / S006).
// Read-only: what are these shots, who is featured, what dyes must ride.
import { db } from "../src/lib/db";
import { detectCast } from "../src/lib/ai/art";

async function main() {
  const prod = await db.project.findFirst({
    where: { title: "Immortal Path" },
    include: { characters: true },
  });
  if (!prod) throw new Error("Immortal Path missing");

  const scene = await db.scene.findFirst({
    where: { number: 12, episode: { number: 7 } },
    include: { environment: true },
  });
  if (!scene) throw new Error("E7 Sc12 missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });

  console.log(`E7 Sc12 "${scene.title ?? ""}" env=${scene.environment?.name ?? "?"} tod=${scene.timeOfDay ?? "?"} weather=${scene.weather ?? "?"}`);
  for (const s of shots) {
    const cast = detectCast(prod.characters, s.description);
    console.log(`\nS${String(s.number).padStart(3, "0")} [${s.shotType}] cast=[${cast.map((c) => c.name).join(", ")}]`);
    console.log(`  desc: ${s.description}`);
    if (s.lighting) console.log(`  light: ${s.lighting}`);
  }

  // the dye source for the featured cast of 1/3/6
  for (const c of prod.characters) {
    if (c.sheetDna) {
      console.log(`\nDNA ${c.name}: ${c.sheetDna.slice(0, 300)}`);
    }
  }
  await db.$disconnect();
}
main();
