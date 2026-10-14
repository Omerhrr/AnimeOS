// PROBE 201E - arm B's row (the 107-law landing for the raw-bridge
// submit: the clip is the worker's own real render; the row is the
// pipeline's own shape) + the damped scoring + the eye's frame.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const CWD = "/home/z/my-project/AnimeOS";
const db = new PrismaClient();

async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: 4 } });
  if (!shot) throw new Error("S004 missing");

  const idB = "framing201mv7jsxlb";
  const mp4 = path.join(CWD, "public", "renders", `${idB}.mp4`);
  if (!fs.existsSync(mp4)) throw new Error("arm B's clip is missing");
  const existing = await db.renderJob.findUnique({ where: { id: idB } });
  if (!existing) {
    await db.renderJob.create({
      data: {
        id: idB,
        projectId: project.id,
        shotId: shot.id,
        mode: "PREVIEW",
        status: "REVIEW",
        progress: 100,
        stage: "Blender clip ready - the framing arm's real render landed (the 107 law's row)",
        driver: "BLENDER_LOCAL",
        outputUrl: `/renders/${idB}.mp4`,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    console.log(`ARM B ROW CREATED: ${idB}`);
  }
  const { scoreShotIdentityMedian } = await import("../src/lib/identity");
  const res = await scoreShotIdentityMedian(shot.id, "RENDER", 5);
  if (!res.ok) { console.log(`B-CLOSER: SCORING REFUSED - ${String(res.error).slice(0, 140)}`); process.exit(1); }
  const v = res.scored.verdict;
  for (const e of v.entries) {
    const aspects = Object.entries(e.aspects ?? {})
      .map(([k, n]) => `${k} ${Math.round((n as number) * 100)}%`)
      .join(", ");
    console.log(`B-CLOSER ${e.characterName}: ${Math.round(e.similarity * 100)}% [${aspects}]`);
  }
  console.log(`B-CLOSER SHOT WORST ${Math.round(v.worst * 100)}%`);
  fs.mkdirSync(path.join(CWD, "inspect", "eye201"), { recursive: true });
  execSync(`ffmpeg -y -ss 2 -i "${mp4}" -frames:v 1 -loglevel error "${CWD}/inspect/eye201/closer.png"`);
  console.log("THE FRAME: inspect/eye201/closer.png");
  await db.$disconnect();
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
