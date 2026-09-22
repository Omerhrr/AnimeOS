// Wipe all production data (dev utility) — the API auto-reseeds on next request.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // Delete children before parents where needed (most cascade via FK)
  await db.evaluation.deleteMany();
  await db.renderJob.deleteMany();
  await db.dshMessage.deleteMany();
  await db.productionEvent.deleteMany();
  await db.continuityEvent.deleteMany();
  await db.terminology.deleteMany();
  await db.assetVersion.deleteMany();
  await db.asset.deleteMany();
  await db.relationship.deleteMany();
  await db.characterState.deleteMany();
  await db.character.deleteMany();
  await db.shot.deleteMany();
  await db.scene.deleteMany();
  await db.episode.deleteMany();
  await db.season.deleteMany();
  await db.environment.deleteMany();
  await db.project.deleteMany();
  console.log("All production data wiped.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
