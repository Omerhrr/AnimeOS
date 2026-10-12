// THE 155 DUMPER - the S005 payload on the drain's own assembly
// (the resume law: the 151/152 probe payloads died with the box).
// A throwaway PREVIEW job rides createRenderJob + tickRenderJob with
// ANIMEOS_BLENDER_HOST pointed at the capture stand-in - the engine's
// REAL payload assembly posts the byte-honest S006 payload; the
// throwaway job row is deleted after (the lab is gone exactly).
// Run: DATABASE_URL=file:... ANIMEOS_BLENDER_HOST=127.0.0.1:8199 npx tsx scripts/probe164-dump.ts
import { db } from "../src/lib/db";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import fs from "node:fs";

(async () => {
  const CAPTURED = "/home/z/my-project/inspect/probe164/job-s005.json";
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: 5 } });
  if (!shot) throw new Error("S005 missing");

  const job = await createRenderJob(project.id, shot.id, "PREVIEW");
  console.log("throwaway job:", job.id);
  await tickRenderJob(job.id); // the assembly posts to the capture stand-in
  for (let i = 0; i < 10 && !fs.existsSync(CAPTURED); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    await tickRenderJob(job.id).catch(() => {});
  }
  const ok = fs.existsSync(CAPTURED);
  console.log(ok ? "PAYLOAD CAPTURED" : "CAPTURE FAILED");
  await db.renderJob.delete({ where: { id: job.id } }).catch(() => {});
  console.log("the throwaway job is gone exactly");
  await db.$disconnect();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("DUMP FAILED:", e); process.exit(1); });
