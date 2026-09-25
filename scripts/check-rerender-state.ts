import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const jobs = await db.renderJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, mode: true, status: true, driver: true, createdAt: true, outputUrl: true, attempt: true, shotId: true },
  });
  for (const j of jobs) {
    const shot = j.shotId ? await db.shot.findUnique({ where: { id: j.shotId }, select: { number: true, scene: { select: { number: true } } } }) : null;
    console.log(`${j.id} ${j.mode} ${j.status} ${j.driver} attempt${j.attempt} s${shot?.scene.number}.${shot?.number} ${j.outputUrl ?? "-"}`);
  }
}
main().finally(() => process.exit(0));
