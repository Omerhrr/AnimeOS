// NIGHT 115 RECON - the standing scene's shots + env + the cast rows.
// The 115 work order: the antagonist (Demon Lord Wei rides the crew),
// the hair tint under the level lens, the wide-framing style.
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const proj = await p.project.findFirst({ where: { title: "Immortal Path" } });
  if (!proj) throw new Error("Immortal Path missing");
  console.log(`project ${proj.id} look=${proj.renderLook} style=${proj.visualStyle}`);
  const episodes = await p.episode.findMany({
    where: { season: { projectId: proj.id } },
    include: { season: true },
    orderBy: { number: "asc" },
  });
  for (const ep of episodes) {
    const scenes = await p.scene.findMany({
      where: { episodeId: ep.id },
      orderBy: { number: "asc" },
      include: { shots: { orderBy: { number: "asc" } } },
    });
    for (const s of scenes) {
      console.log(`\nE${String(ep.number).padStart(2, "0")} Sc${s.number} "${s.title}" tod=${s.timeOfDay ?? "?"} weather=${s.weather ?? "?"}`);
      for (const sh of s.shots) {
        console.log(`  S00${sh.number} ${sh.shotType} [${sh.status}] ${sh.lens ?? "-"} ${(sh.description || "").slice(0, 110)}`);
      }
    }
  }
  const chars = await p.character.findMany({
    where: { projectId: proj.id },
    select: { name: true, role: true, appearance: true, modelSheetPrompt: true, designSpec: true, modelSheetUrl: true },
  });
  console.log("\nCAST:");
  for (const c of chars) {
    console.log(`- ${c.name} (${c.role ?? "-"}) sheet=${c.modelSheetUrl ? "Y" : "N"} spec=${c.designSpec ? "Y" : "N"}`);
    if (c.name === "Demon Lord Wei") {
      console.log(`  appearance: ${c.appearance}`);
      console.log(`  anchor: ${(c.modelSheetPrompt ?? "").slice(0, 300)}`);
    }
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => p.$disconnect());
