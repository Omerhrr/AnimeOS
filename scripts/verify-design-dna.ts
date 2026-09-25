// Verify design DNA compilation against the real production rows.
import { PrismaClient } from "@prisma/client";
import { characterDesignDna, environmentDna } from "../src/lib/animation/design";

const db = new PrismaClient();

async function main() {
  const project = await db.project.findFirst({ where: { title: "Cloudveil Ascent" } });
  if (!project) throw new Error("project missing");
  const chars = await db.character.findMany({ where: { projectId: project.id }, include: { states: true } });
  for (const c of chars) {
    const st = [...c.states].sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1))[0];
    const dna = characterDesignDna({
      name: c.name, role: c.role, appearance: c.appearance,
      modelSheetPrompt: c.modelSheetPrompt, stateClothing: st?.clothing ?? null, stateWeapon: st?.weapon ?? null,
    });
    console.log(`${c.name}:`, JSON.stringify({ ...dna, source: dna.source.slice(0, 60) + "..." }));
  }
  const envs = await db.environment.findMany({ where: { projectId: project.id } });
  for (const e of envs) {
    const dna = environmentDna({ name: e.name, description: e.description, atmosphere: e.atmosphere, timeOfDay: e.timeOfDay, weather: e.weather });
    console.log(`${e.name}:`, JSON.stringify({ ...dna, source: dna.source.slice(0, 60) + "..." }));
  }
}

main().finally(() => process.exit(0));
