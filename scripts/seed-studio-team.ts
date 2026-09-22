// One-shot augmentation: add LoRA registry / artist roster / shot
// assignments / sound cues to existing productions without wiping
// the live database (preserves generated artwork).
import { db } from "../src/lib/db";
import { seedStudioTeam } from "../src/lib/seed";

async function main() {
  const projects = await db.project.findMany({ select: { id: true, title: true } });
  for (const p of projects) {
    await seedStudioTeam(p.id);
    console.log(`studio team seeded for '${p.title}' (${p.id})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
