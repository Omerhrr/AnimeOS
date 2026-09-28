// Browser E2E fixture for iteration 78: seeds a small production whose
// episode cut card has everything to show - two shots (the cut renders
// their clips inline on export, the fast MOTION path), and audio cues
// riding ALL FOUR buses (voice / sfx / bgm / ambience) so the graded
// mix line lands on the card (measured LUFS, ducked, stems).
// Run: npx tsx scripts/browser-fixture-iter78.ts
import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";

const MARK = "iter78-cut-fixture";

async function main() {
  // fresh fixture each run
  const prev = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (prev) {
    await db.audioCue.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: prev.id } } } } } });
    await db.renderJob.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: prev.id } } } } } });
    await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: prev.id } } } } });
    await db.scene.deleteMany({ where: { episode: { season: { projectId: prev.id } } } });
    await db.episode.deleteMany({ where: { season: { projectId: prev.id } } });
    await db.season.deleteMany({ where: { projectId: prev.id } });
    await db.projectMembership.deleteMany({ where: { projectId: prev.id } });
    await db.project.delete({ where: { id: prev.id } });
  }

  const owner = await db.user.findUnique({ where: { email: "director@studio.dev" } });
  if (!owner) throw new Error("seeded director missing - run the studio seed first");
  const user = { id: owner.id, name: owner.name ?? "Lin Director", role: owner.role };

  const created = await executeTool("fixture", "create_project", {
    title: `Thunder Gate ${MARK}`,
    logline: "a cut-card fixture: two shots, four buses, one graded mix",
    visualStyle: "DONGHUA",
  }, user);
  if (created.status !== "OK") throw new Error(`create_project failed: ${created.result}`);
  const project = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!project) throw new Error("fixture project missing");
  const T = (name: string, args: Record<string, unknown>) => executeTool(project.id, name, args, user);

  await T("create_episode", { seasonNumber: 1, number: 1, title: "The Gate Falls" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Gate approach" });
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Cultivator Lin rides the storm toward the gate", shotType: "ESTABLISHING", movement: "STATIC", duration: 2.5 });
  await T("create_shot", { sceneNumber: 1, number: 2, description: "the gate breaks - lightning detonates across the sky", shotType: "MEDIUM", movement: "STATIC", duration: 2.5 });

  const shots = await db.shot.findMany({ where: { scene: { episode: { season: { projectId: project.id } } } }, orderBy: { number: "asc" } });
  if (shots.length !== 2) throw new Error(`expected 2 shots, got ${shots.length}`);

  // all four buses ride the cut: voice + ambience on shot 1, sfx + bgm on shot 2
  await db.audioCue.create({ data: { shotId: shots[0].id, kind: "VOICE", label: "Lin: the gate falls today", startMs: 200, durationMs: 1400, volume: 0.9 } });
  await db.audioCue.create({ data: { shotId: shots[0].id, kind: "AMBIENCE", label: "mountain wind", startMs: 0, durationMs: 2400, volume: 0.5 } });
  await db.audioCue.create({ data: { shotId: shots[1].id, kind: "SFX", label: "gate shatter", startMs: 300, durationMs: 900, volume: 0.85 } });
  await db.audioCue.create({ data: { shotId: shots[1].id, kind: "BGM", label: "storm score", startMs: 0, durationMs: 2400, volume: 0.55 } });

  console.log(`fixture ready: project=${project.id}`);
  console.log(`title: Thunder Gate ${MARK}`);
}

main()
  .catch((err) => {
    console.error("fixture crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
