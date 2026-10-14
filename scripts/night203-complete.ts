// NIGHT 203 COMPLETION - the four refused shots' reads (S003-S006,
// the 429s beat the backoffs mid-sweep). The clips exist (the drain's
// 6/6); only the SCORING needs the door. This scores the refused four
// with the standing damped instrument and appends their night-203 arc
// rows - the night's ledger completes honestly (S001/S002 rode the
// first pass; the refused ride no rows until THIS runs).
// Run (detached on the first breath): the resume203 watcher calls this.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
  const NIGHT = process.env.ANIMEOS_NIGHT_TAG ?? "night-203";
  const { bridgeLawCohort } = await import("../src/lib/identity-arc");
  const COHORT = bridgeLawCohort();
  const { scoreShotIdentityMedian } = await import("../src/lib/identity");
  // THE COMPLETION'S OWN SEAM (the 208 first-execution lesson): the
  // arc append lives in the LEDGER module, not the scorer - the 205
  // idempotence was verified structurally, the window only opened on
  // this rebuild; the import is now the real home.
  const { appendIdentityArcReading } = await import("../src/lib/identity-arc");
  console.log(`completing night ${NIGHT} in cohort ${COHORT}: scoring S003-S006`);

  let worsts: number[] = [];
  for (const s of shots.filter((s) => s.number >= 3)) {
    const res = await scoreShotIdentityMedian(s.id, "RENDER", 5);
    if (!res.ok) {
      console.log(`S00${s.number}: REFUSED - ${String(res.error).slice(0, 120)}`);
      continue;
    }
    const v = res.scored.verdict;
    worsts.push(v.worst);
    await appendIdentityArcReading({
      projectId: project.id,
      shotId: s.id,
      source: "RENDER",
      night: NIGHT,
      cohort: COHORT,
      worst: v.worst,
      scores: v.entries,
    });
    for (const e of v.entries) {
      const aspects = Object.entries(e.aspects ?? {})
        .map(([k, n]) => `${k} ${Math.round((n as number) * 100)}%`)
        .join(", ");
      console.log(`S00${s.number} ${e.characterName}: ${Math.round(e.similarity * 100)}% [${aspects}]`);
    }
    console.log(`S00${s.number} SHOT WORST ${Math.round(v.worst * 100)}%`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.log(`COMPLETION: ${worsts.length}/4 scored, appended to ${NIGHT}`);
  await db.$disconnect();
  // THE WATCHER'S HELPER LAW (the 208 seam): exit explicitly - the
  // Prisma pool keeps the tsx event loop alive after disconnect and
  // the watcher's exit listener never fires, stalling the chain
  // after the receipt is already on the ledger.
  process.exit(0);
}

main().catch((e) => { console.error("COMPLETION FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
