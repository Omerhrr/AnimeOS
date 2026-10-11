// THE 157 PROBE (evidence first): did the crop strips ride tonight's
// rescore? The scoreNote carries the strip suffix when they did.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const rows = await db.identityScore.findMany({
    where: { source: "RENDER" },
    orderBy: { scoredAt: "desc" },
    take: 6,
    select: { note: true, worst: true, scores: true, scoredAt: true, shotId: true },
  });
  for (const r of rows) {
    const d = await db.shot.findFirst({ where: { id: r.shotId }, select: { number: true } });
    console.log(`S00${d?.number}: worst=${r.worst} note=${(r.note ?? "null").slice(0, 180)}`);
  }
  await db.$disconnect();
})();
