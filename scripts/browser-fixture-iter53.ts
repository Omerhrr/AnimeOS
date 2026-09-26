// Browser fixture for iteration 53: gives the OWNER's real production
// one designed, VARIed environment + one DIRECTED shot + one completed
// PREVIEW render, so the render view can show the export strip, the
// +GN chip and the grammar beat chips live.
// Run: bun scripts/browser-fixture-iter53.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";

async function main() {
  const owner = await db.user.findUnique({ where: { email: "director@studio.dev" } });
  if (!owner) throw new Error("owner missing");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("Immortal Path missing");
  const user = { id: owner.id, name: owner.name ?? "Lin Director", role: owner.role };
  const T = (name: string, args: Record<string, unknown>) => executeTool(project.id, name, args, user);

  console.log("variation:", (await T("design_variation", { name: "Terrace Pebble Scatter", variation: "scatter", count: 44, seed: 11, scaleJitter: 0.45, rotJitter: 0.85 })).result.slice(0, 80));
  console.log("env:", (await T("create_environment", { name: "Cloudsea Terrace", description: "a mountain terrace above a sea of clouds, worn stone and scattered prayer pebbles", timeOfDay: "dusk", weather: "clear" })).result.slice(0, 60));
  console.log("build:", (await T("blender_asset_build", { kind: "ENVIRONMENT", refName: "Cloudsea Terrace", variation: "Terrace Pebble Scatter" })).result.slice(0, 140));
  console.log("export GLB:", (await T("blender_export", { refName: "Cloudsea Terrace", kind: "ENVIRONMENT", format: "GLB" })).result.slice(0, 100));

  console.log("ep:", (await T("create_episode", { seasonNumber: 1, number: 1, title: "Awakening" })).result.slice(0, 60));
  console.log("scene:", (await T("create_scene", { episodeNumber: 1, number: 1, title: "Terrace dawn", environmentName: "Cloudsea Terrace" })).result.slice(0, 60));
  console.log("shot:", (await T("create_shot", { sceneNumber: 1, number: 1, description: "the sword spirit rises over the Cloudsea Terrace at dawn", shotType: "ESTABLISHING", movement: "STATIC" })).result.slice(0, 60));
  console.log("grammar:", (await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: "The Reveal" })).result.slice(0, 120));

  const scene = await db.scene.findFirst({ where: { episode: { season: { projectId: project.id } }, number: 1 } });
  const shot = scene ? await db.shot.findFirst({ where: { sceneId: scene.id, number: 1 } }) : null;
  if (!shot) throw new Error("shot missing");
  const job = await createRenderJob(project.id, shot.id, "PREVIEW");
  let final = job;
  const deadline = Date.now() + 420_000;
  while (final.status === "RENDERING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    final = (await tickRenderJob(job.id))!;
  }
  console.log("render:", final.status, final.outputUrl ?? final.stage);
  process.exitCode = final.status === "REVIEW" ? 0 : 1;
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => db.$disconnect());
