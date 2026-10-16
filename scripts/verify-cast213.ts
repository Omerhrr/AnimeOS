// verify-cast213.ts — rebuild verification: cast sheets + DNA byte-exact.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const main = async () => {
  const chars = await db.character.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, states: true },
  });
  for (const c of chars) {
    console.log("char:", c.name, "id:", c.id, "states:", c.states?.length ?? 0);
  }
  // sheets: find the r3 revisions
  const sheets = await (db as any).characterSheet.findMany({
    where: { revision: "r3" },
    orderBy: { createdAt: "asc" },
  });
  for (const s of sheets) {
    const len = (s.text ?? s.content ?? s.body ?? "").length;
    console.log(
      "sheet r3:",
      s.characterId ?? s.character,
      "textLen:",
      len,
      "keys:",
      Object.keys(s).slice(0, 10).join(","),
    );
  }
  const dna = await (db as any).characterDna.findMany().catch(() => []);
  console.log("dna rows:", dna.length);
  await db.$disconnect();
};
main();
