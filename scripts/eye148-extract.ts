// EYE 148 EXTRACT - the standing eye receipts (the resume law
// re-creates this untracked extractor every box). Pulls one frame
// (-ss 2, the standing law) from each finished clip and cuts the
// standing crops the eye has read every night:
//   S001/S004/S005/S006 full frames; S002 + S003 face crops 4x;
//   S006 the two members 8x (jade left / crimson right).
// ffmpeg -ss 2 -loglevel error (the standing flags).
// Run: DATABASE_URL=file:... npx tsx scripts/eye148-extract.ts
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const db = new PrismaClient();
const OUT = "/home/z/my-project/inspect/eye148/night";
const CROPS: Record<number, Array<{ name: string; crop: string; scale: number }>> = {
  2: [{ name: "face-4x", crop: "210:30:220:180", scale: 4 }],
  3: [{ name: "face-4x", crop: "180:80:280:240", scale: 4 }],
  6: [
    { name: "lin-face-8x", crop: "205:185:90:75", scale: 8 },
    { name: "wei-face-8x", crop: "690:240:90:75", scale: 8 },
  ],
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({ where: { episode: { season: { projectId: project.id } } }, orderBy: { number: "asc" } });
  if (!scene) throw new Error("scene missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
  for (const s of shots) {
    const job = await db.renderJob.findFirst({
      where: { projectId: project.id, shotId: s.id, outputUrl: { not: null } },
      orderBy: { startedAt: "desc" },
    });
    if (!job?.outputUrl) { console.log(`S00${s.number}: no clip`); continue; }
    const clip = path.join(process.cwd(), "public", job.outputUrl.split("?")[0]);
    if (!fs.existsSync(clip)) { console.log(`S00${s.number}: clip missing on disk`); continue; }
    const full = `${OUT}/S00${s.number}-full.png`;
    execSync(`ffmpeg -y -ss 2 -i "${clip}" -frames:v 1 "${full}" -loglevel error`);
    for (const c of CROPS[s.number] ?? []) {
      const out = `${OUT}/S00${s.number}-${c.name}.png`;
      execSync(`ffmpeg -y -i "${full}" -vf "crop=${c.crop},scale=iw*${c.scale}:ih*${c.scale}:flags=neighbor" "${out}" -loglevel error`);
    }
    console.log(`S00${s.number}: extracted (+${(CROPS[s.number] ?? []).length} crops)`);
  }
  await db.$disconnect();
})().catch((e) => { console.error("EYE EXTRACT FAILED:", e); process.exit(1); });
