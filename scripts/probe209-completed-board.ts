// ITERATION 209 PROBE - THE EYE'S READ OF THE COMPLETED BOARD.
// The completion's receipt made night-203 whole (6/6); the gate's
// verdict now reads the union across ALL nights INCLUDING the
// completed night-203 (readIdentityArcEpisode: DB rows UNION the
// committed receipt lines). This probe prints:
//   1. the gate's own verdict (floor, mean, median, p10, blocking)
//   2. the night-203 board (the six shots' RENDER worsts)
//   3. the arc's night list (which nights ride the union)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const episode = await db.episode.findFirst({
    where: { season: { projectId: project.id } },
    orderBy: { number: "asc" },
  });
  if (!episode) throw new Error("episode missing");
  const { episodeReleaseVerdict } = await import("../src/lib/identity-matrix");
  const v = await episodeReleaseVerdict(project.id, episode.id, "RENDER");
  const pct = (n: number | null) => (n === null ? "-" : Math.round(n * 100) + "%");
  console.log(`GATE VERDICT: ${v.verdict} over ${v.readings} reading(s), floor ${pct(v.floor)}`);
  console.log(`mean ${pct(v.overall.mean)}, median ${pct(v.overall.median)}, p10 ${pct(v.overall.p10)}`);
  console.log(`blocking: ${v.blocking.map((c) => `${c.key} ${c.verdict} p10 ${pct(c.p10)} (worst at ${c.worstRef ?? "-"})`).join(" | ") || "none"}`);
  // the night-203 board by shot number
  const scene = await db.scene.findFirst({
    where: { episodeId: episode.id },
    orderBy: { number: "asc" },
  });
  const shots = await db.shot.findMany({ where: { sceneId: scene!.id }, orderBy: { number: "asc" } });
  console.log("--- night-203 board ---");
  for (const s of shots) {
    const r = await db.identityArcReading.findFirst({ where: { shotId: s.id, night: "night-203", source: "RENDER" } });
    console.log(`S00${s.number}: ${r ? Math.round(r.worst * 100) + "%" : "no row"}`);
  }
  // the union's night list
  const { readIdentityArcEpisode } = await import("../src/lib/identity-arc");
  const arcRows = await readIdentityArcEpisode(project.id, episode.id, "RENDER");
  const nights = new Map<string, number>();
  for (const row of arcRows) nights.set(row.night, (nights.get(row.night) ?? 0) + 1);
  console.log(`--- the union: ${arcRows.length} rows across ${nights.size} nights ---`);
  for (const [n, c] of [...nights.entries()].sort()) console.log(`${n}: ${c} rows`);
  await db.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
