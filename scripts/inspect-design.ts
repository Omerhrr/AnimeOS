import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const projects = await db.project.findMany({ select: { id: true, title: true, visualStyle: true } });
  console.log("PROJECTS:", JSON.stringify(projects));
  const chars = await db.character.findMany({
    select: { id: true, name: true, appearance: true, wardrobe: true, modelSheetUrl: true, modelSheetPrompt: true },
  });
  console.log("CHARACTERS:", JSON.stringify(chars, null, 1).slice(0, 2500));
  const envs = await db.environment.findMany({ select: { id: true, name: true, description: true, timeOfDay: true, weather: true } });
  console.log("ENVIRONMENTS:", JSON.stringify(envs, null, 1));
  const shots = await db.shot.findMany({ select: { id: true, number: true, description: true, poseStart: true, status: true, artworkUrl: true }, orderBy: { number: "asc" } });
  console.log("SHOTS:", JSON.stringify(shots.map(s => ({ n: s.number, d: s.description.slice(0, 80), p: s.poseStart, st: s.status, art: !!s.artworkUrl })), null, 1).slice(0, 3000));
  const renders = await db.renderJob.findMany({ where: { status: "COMPLETED" }, orderBy: { startedAt: "desc" }, take: 3, select: { id: true, driver: true, mode: true, shotId: true, clipMs: true } });
  console.log("RECENT RENDERS:", JSON.stringify(renders));
  const scores = await db.identityScore.findMany({ orderBy: { createdAt: "desc" }, take: 4 });
  console.log("IDENTITY SCORES:", JSON.stringify(scores.map(s => ({ source: (s as any).source, overall: (s as any).overall, verdict: (s as any).verdict })).slice(0, 4)));
}
main().finally(() => process.exit(0));
