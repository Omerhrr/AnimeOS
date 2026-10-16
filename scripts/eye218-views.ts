// eye218-views - READ-ONLY: print the sheet/view URLs the close rung anchors ride.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const chars = await db.character.findMany({ select: { name: true, modelSheetUrl: true, designSheetUrl: true } });
  for (const c of chars) console.log(`${c.name}: model=${c.modelSheetUrl} design=${c.designSheetUrl}`);
}
main().finally(() => db.$disconnect());
