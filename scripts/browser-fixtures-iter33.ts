// Browser fixtures for Iteration 33 UI verification (seed | clean).
// seed: a standalone fixture production "E2E Browser Iter33" with ONE
//       ACTIVE cross-turn plan (cheap steps) and TWO schedules: a
//       PLAN_RUN armed over that plan (never fired) and a
//       REPAINT_QUEUE watch with a last fire recorded (OK), so the
//       cadence scheduler panel shows armed + fired rows from the
//       first paint. Run now on the watch really fires it (clean
//       queue -> SKIPPED, safe to press).
// clean: deletes the fixture production (cascades plans/schedules).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TITLE = "E2E Browser Iter33";

if (process.argv[2] === "clean") {
  const proj = await db.project.findFirst({ where: { title: TITLE }, select: { id: true } });
  if (!proj) {
    console.log("nothing to clean");
    process.exit(0);
  }
  await db.project.delete({ where: { id: proj.id } });
  console.log("cleaned: fixture project (plans + schedules cascade)");
  process.exit(0);
}

const proj = await db.project.create({
  data: {
    title: TITLE,
    logline: "browser fixture: cadence scheduler + audio-driven visemes",
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
});
console.log(`fixture project ${proj.id}`);

const plan = await db.dshPlan.create({
  data: {
    projectId: proj.id,
    title: "Season push: score the terrace beat",
    goal: "stamp the glossary and canon across the terrace scenes",
    status: "ACTIVE",
    source: "DSH",
    steps: JSON.stringify([
      { tool: "create_terminology", args: { term: "Cloud Terrace", definition: "the rain-slick dueling terrace" }, why: "glossary", status: "DONE", result: "Terminology 'Cloud Terrace' registered.", at: new Date().toISOString() },
      { tool: "add_universe_fact", args: { text: "the terrace lanterns burn blue at night", category: "WORLD" }, why: "canon", status: "PENDING" },
    ]),
    cursor: 1,
  },
});

// PLAN_RUN schedule over the ACTIVE plan: armed, never fired
await db.studioSchedule.create({
  data: {
    projectId: proj.id,
    name: "Nightly terrace push",
    kind: "PLAN_RUN",
    planId: plan.id,
    cadence: "DAILY",
    hourUtc: 2,
    maxSteps: 1,
    enabled: true,
    nextRunAt: new Date(Date.now() + 8 * 3600_000),
  },
});

// REPAINT_QUEUE watch with a recorded last fire (OK)
await db.studioSchedule.create({
  data: {
    projectId: proj.id,
    name: "Render-queue watch",
    kind: "REPAINT_QUEUE",
    cadence: "HOURLY",
    intervalHours: 2,
    enabled: true,
    nextRunAt: new Date(Date.now() + 3600_000),
    lastRunAt: new Date(Date.now() - 7200_000),
    lastStatus: "OK",
    lastReport: "started a supervised re-paint pass over 2 queued panel(s), worst confidence first; 0 render job(s) ticked",
    runCount: 3,
  },
});

console.log("fixture ready: 1 ACTIVE plan + 2 schedules (1 never fired, 1 with a last fire)");
process.exit(0);
