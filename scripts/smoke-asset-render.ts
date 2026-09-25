// Smoke test: queue one render for a shot featuring the asset-backed
// cast, tick it to completion, and report the worker's asset decisions
// (figureSource / setSource) - the Phase 4 proof.
import { PrismaClient } from "@prisma/client";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";

const db = new PrismaClient();

async function main() {
  const p = await db.project.findFirst({ where: { title: "Cloudveil Ascent" } });
  if (!p) throw new Error("project missing");
  const ep = await db.episode.findFirst({ where: { season: { projectId: p.id }, number: 1 } });
  if (!ep) throw new Error("episode missing");
  const shots = await db.shot.findMany({
    where: { scene: { episodeId: ep.id }, description: { contains: "Yun Shu" } },
    include: { scene: true },
    orderBy: [{ scene: { number: "asc" } }, { number: "asc" }],
  });
  const shot = shots.find((s) => s.duration >= 3) ?? shots[0];
  if (!shot) throw new Error("no shot mentioning Yun Shu");
  console.log(`shot: Sc${shot.scene.number} S${String(shot.number).padStart(3, "0")} - ${shot.description.slice(0, 70)}...`);

  const job = await createRenderJob(p.id, shot.id, "PREVIEW");
  console.log(`job ${job.id} driver=${job.driver} stage="${job.stage}"`);

  // tick until done (cap 12 min)
  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const ticked = await tickRenderJob(job.id);
    if (!ticked) break;
    if (ticked.status === "REVIEW" || ticked.status === "APPROVED" || ticked.status === "FAILED" || ticked.status === "NEEDS_REVISION") {
      console.log(`final: ${ticked.status} stage="${ticked.stage}" output=${ticked.outputUrl ?? "none"}`);
      const evalRow = await db.evaluation.findUnique({ where: { renderJobId: job.id } });
      if (evalRow) console.log(`inspection: ${evalRow.verdict} - ${evalRow.summary.slice(0, 160)}`);
      break;
    }
    console.log(`  tick: ${ticked.status} ${Math.round(ticked.progress * 100)}% "${ticked.stage}"`);
  }
}

main().finally(() => db.$disconnect());
