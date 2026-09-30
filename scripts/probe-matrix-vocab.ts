// read-only probe: production vocabularies + readings volume
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const shots = await db.shot.findMany({ select: { lighting: true, movement: true, poseStart: true, shotType: true, description: true } });
  const tally = (label: string, get: (s: (typeof shots)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const s of shots) { const k = get(s) ?? "(null)"; m.set(k, (m.get(k) ?? 0) + 1); }
    console.log(label, [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18));
  };
  tally("lighting:", (s) => s.lighting);
  tally("movement:", (s) => s.movement);
  tally("poseStart:", (s) => s.poseStart);
  tally("shotType:", (s) => s.shotType);
  const scores = await db.identityScore.groupBy({ by: ["source"], _count: true });
  console.log("identityScore by source:", scores);
  const jobs = await db.renderJob.findMany({ where: { finishedAt: { not: null } }, select: { mode: true, startedAt: true, finishedAt: true, createdAt: true }, take: 5, orderBy: { createdAt: "desc" } });
  console.log("recent finished jobs:", jobs.length);
  const sample = await db.renderJob.findFirst({ where: { finishedAt: { not: null } }, orderBy: { createdAt: "desc" }, select: { id: true, mode: true, driver: true, status: true, createdAt: true, startedAt: true, finishedAt: true, telemetry: true } });
  console.log("sample job:", sample ? { ...sample, telemetry: (sample.telemetry ?? "").slice(0, 400) } : null);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
