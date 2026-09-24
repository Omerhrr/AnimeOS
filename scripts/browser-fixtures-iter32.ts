// Browser fixtures for Iteration 32 UI verification (seed | clean).
// seed: a standalone fixture production "E2E Browser Iter32" with TWO
//       cross-turn DSH plans: one PROPOSED (awaiting review, 3 cheap
//       tool steps) and one ACTIVE mid-progress (step 1 DONE, cursor
//       parked on step 2) so the plan review panel shows both states
//       from the first paint. All steps are fast tools, so pressing
//       Run next in the browser really executes one.
// clean: deletes the fixture production (cascades plans/events).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TITLE = "E2E Browser Iter32";

if (process.argv[2] === "clean") {
  const proj = await db.project.findFirst({ where: { title: TITLE }, select: { id: true } });
  if (!proj) {
    console.log("nothing to clean");
    process.exit(0);
  }
  await db.project.delete({ where: { id: proj.id } });
  console.log("cleaned: fixture project (plans cascade)");
  process.exit(0);
}

const proj = await db.project.create({
  data: {
    title: TITLE,
    logline: "browser fixture: DSH plans that survive the turn",
    characters: { create: [{ name: "Lin Yue", role: "PROTAGONIST" }] },
    seasons: {
      create: {
        number: 1,
        title: "S1",
        episodes: {
          create: {
            number: 1,
            title: "Terrace",
            scenes: {
              create: {
                number: 1,
                title: "Cloud Terrace",
                description: "a rain-slick terrace above the cloud sea",
                fogDensity: 0.4, lightningIntensity: 0.3, energyIntensity: 0.5, cameraDistance: 1.0, rimLightIntensity: 0.5,
                shots: { create: [{ number: 1, description: "Lin Yue watches the horizon", shotType: "CLOSEUP", movement: "STATIC", duration: 2 }] },
              },
            },
          },
        },
      },
    },
  },
  include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } } },
});
const shot = proj.seasons[0].episodes[0].scenes[0].shots[0];
console.log(`fixture project ${proj.id}`);

await db.dshPlan.create({
  data: {
    projectId: proj.id,
    title: "Season push: score the terrace beat",
    goal: "store the beat's terminology, author Lin Yue's line, paint the key panel",
    status: "PROPOSED",
    source: "DSH",
    steps: JSON.stringify([
      { tool: "create_terminology", args: { term: "Cloud Terrace", category: "LOCATION" }, why: "translation memory for the beat", status: "PENDING" },
      { tool: "set_shot_dialogue", args: { sceneNumber: 1, shotNumber: 1, lines: JSON.stringify([{ speaker: "Lin Yue", text: "The terrace remembers us.", kind: "SPEECH" }]) }, why: "author the beat's line", status: "PENDING" },
      { tool: "generate_panel_art", args: { sceneNumber: 1, shotNumber: 1, format: "MANHUA" }, why: "key art for the closeup", status: "PENDING" },
    ]),
    cursor: 0,
  },
});

await db.dshPlan.create({
  data: {
    projectId: proj.id,
    title: "Canon notes continuation",
    goal: "finish registering the world's rules across conversations",
    status: "ACTIVE",
    source: "DSH",
    steps: JSON.stringify([
      { tool: "create_terminology", args: { term: "Sky Law" }, why: "law one", status: "DONE", result: "Term 'Sky Law' stored in translation memory.", at: new Date(Date.now() - 60_000).toISOString() },
      { tool: "add_universe_fact", args: { text: "The Cloud Terrace sits above the cloud sea", category: "LOCATION" }, why: "register the canon", status: "PENDING" },
      { tool: "create_terminology", args: { term: "Moon Vein" }, why: "the rival's blade ore", status: "PENDING" },
    ]),
    cursor: 1,
  },
});

console.log("plans: 1 PROPOSED (3 steps) + 1 ACTIVE mid-progress");
process.exit(0);
