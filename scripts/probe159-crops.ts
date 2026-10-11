// THE 159 PROBE (evidence first): pixel-bound or contract-bound?
// Extracts the SAME face crops the judge saw for the two limiting
// cells (S004 Wei face 20, S005 Lin face 40/style 40) straight from
// the render jobs' own face boxes - the pixel-space [x0,y0,x1,y1]
// boxes at the marks, cropped and scaled to 224h exactly as
// cropFaceCell does. The eye reads what the judge read.
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const db = new PrismaClient();
const OUT = "/home/z/my-project/inspect/probe159";
const ROOT = "/home/z/my-project/AnimeOS";

interface FB { marks: number[]; resX: number; resY: number; frames: Array<number | null>; cast: Array<{ name: string; boxes: Array<[number, number, number, number] | null> }> }

function readFaceBoxes(jobId: string): FB | null {
  const p = path.join(ROOT, "public", "renders", `.job-${jobId}.json`);
  try {
    const job = JSON.parse(fs.readFileSync(p, "utf-8")) as { render?: { faceBoxes?: FB }; state?: { render?: { faceBoxes?: FB } } };
    return ((job.render ?? job.state?.render) ?? {})?.faceBoxes ?? null;
  } catch { return null; }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({ where: { episode: { season: { projectId: project.id } } }, orderBy: { number: "asc" } });
  if (!scene) throw new Error("scene missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id, number: { in: [4, 5] } }, orderBy: { number: "asc" } });
  for (const s of shots) {
    const job = await db.renderJob.findFirst({
      where: { projectId: project.id, shotId: s.id, outputUrl: { not: null } },
      orderBy: { startedAt: "desc" },
    });
    if (!job?.outputUrl) { console.log(`S00${s.number}: no job`); continue; }
    const rel = job.outputUrl.split("?")[0];
    const jobId = (rel.split("/").filter(Boolean).pop() ?? "").replace(/\.mp4$/, "");
    const clip = path.join(ROOT, "public", rel);
    if (!fs.existsSync(clip)) { console.log(`S00${s.number}: clip missing`); continue; }
    const fb = readFaceBoxes(jobId);
    if (!fb) { console.log(`S00${s.number}: no faceBoxes at public/renders/${jobId}/job.json`); continue; }
    console.log(`S00${s.number}: boxes law v-rid, resX=${fb.resX} resY=${fb.resY} marks=${JSON.stringify(fb.marks)} frames=${JSON.stringify(fb.frames)}`);
    for (const c of fb.cast) {
      const who = c.name.includes("Wei") ? "wei" : "lin";
      for (let k = 0; k < c.boxes.length; k++) {
        const b = c.boxes[k];
        if (!b) continue;
        const [x0, y0, x1, y1] = b;
        const w = Math.max(2, Math.min(fb.resX - x0, x1 - x0));
        const h = Math.max(2, Math.min(fb.resY - y0, y1 - y0));
        const frame = fb.frames[k];
        const out = `${OUT}/S00${s.number}-${who}-f${k + 1}.png`;
        const sel = frame !== null && frame !== undefined ? `-vf "select=eq(n\\,${frame})" -frames:v 1` : `-frames:v 1`;
        execSync(`ffmpeg -y -i "${clip}" ${sel} -vf "crop=${w}:${h}:${x0}:${y0},scale=-2:224" "${out}" -loglevel error`, { cwd: ROOT, shell: "/bin/bash" });
        const sz = fs.existsSync(out) ? fs.statSync(out).size : 0;
        console.log(`  ${c.name} f${k + 1}: box [${x0},${y0},${x1},${y1}] crop ${w}x${h} frame=${frame} -> ${sz}b`);
      }
    }
  }
  await db.$disconnect();
})().catch((e) => { console.error("PROBE159 FAILED:", e); process.exit(1); });
