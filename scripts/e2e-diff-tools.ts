// E2E: DSH direction-diff tools against the Immortal Path production.
// Pure-diff steps run here (no TTS); re-render steps run through the
// dev server (curl) and a second pass of this script.
import { executeTool } from "@/lib/dsh/tools";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" }, select: { id: true } });
if (!project) throw new Error("Immortal Path project not found");
const projectId = project.id;
await db.$disconnect();

const step = process.argv[2] ?? "diff";

async function run(name: string, args: Record<string, unknown>) {
  const t0 = Date.now();
  const res = await executeTool(projectId, name, args);
  console.log(`\n=== ${name} ${JSON.stringify(args)} [${res.status}, ${Date.now() - t0}ms]`);
  console.log(res.result);
}

if (step === "diff") {
  await run("diff_episode_direction", { episodeNumber: 7 });
  await run("diff_all_episodes", {});
} else if (step === "rerender-dsh") {
  // batch re-render across all episodes as DSH (capped at 16)
  await run("diff_all_episodes", { reRender: true });
  await run("diff_all_episodes", {});
} else if (step === "pin") {
  // pin a standing delivery on Ep8 scene 1 to force a stale sig
  await run("direct_voice_takes", { sceneNumber: 1, delivery: "EXCITED", note: "storm obeys: riding high after the clash" });
  await run("diff_episode_direction", { episodeNumber: 8, reRender: true });
  await run("diff_episode_direction", { episodeNumber: 8 });
} else if (step === "errors") {
  await run("diff_episode_direction", { episodeNumber: 99 });
  await run("diff_episode_direction", {});
}
