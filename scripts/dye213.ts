import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const main = async () => {
  const chars = await db.character.findMany({ where: { name: { in: ["Lin Yue", "Demon Lord Wei"] } } });
  for (const c of chars) {
    console.log(`\n=== ${c.name} ===`);
    const dna = c.sheetDna ? JSON.parse(c.sheetDna) : null;
    console.log(JSON.stringify(dna, null, 1).slice(0, 900));
  }
  await db.$disconnect();
};
main();
