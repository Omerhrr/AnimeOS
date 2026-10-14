// PROBE 201C - the framing arm's driver (arm A's clip already
// landed: cmv7inkry0001njdksdonze7f). Lands each arm's row per the
// 107 law, scores with the damped instrument, submits arm B (the
// camera closer - ONE variable), and saves the eye's frames.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const CWD = "/home/z/my-project/AnimeOS";
const RENDERS = path.join(CWD, "public", "renders");
const db = new PrismaClient();

async function landClip(jobId: string): Promise<void> {
  const mp4 = path.join(RENDERS, `${jobId}.mp4`);
  if (!fs.existsSync(mp4)) throw new Error(`the clip is missing: ${mp4}`);
  await db.renderJob.update({
    where: { id: jobId },
    data: {
      outputUrl: `/renders/${jobId}.mp4`,
      stage: "Blender clip ready - the clip landed by hand (the 107 law's manual path)",
      driver: "BLENDER_LOCAL",
    },
  });
  console.log(`LANDED: ${jobId}`);
}

async function scoreArm(shotId: string, label: string): Promise<void> {
  const { scoreShotIdentityMedian } = await import("../src/lib/identity");
  const res = await scoreShotIdentityMedian(shotId, "RENDER", 5);
  if (!res.ok) { console.log(`${label}: SCORING REFUSED - ${String(res.error).slice(0, 140)}`); return; }
  const v = res.scored.verdict;
  for (const e of v.entries) {
    const aspects = Object.entries(e.aspects ?? {})
      .map(([k, n]) => `${k} ${Math.round((n as number) * 100)}%`)
      .join(", ");
    console.log(`${label} ${e.characterName}: ${Math.round(e.similarity * 100)}% [${aspects}]`);
  }
  console.log(`${label} SHOT WORST ${Math.round(v.worst * 100)}%`);
}

async function waitClip(jobId: string, capMin = 40): Promise<string> {
  const t0 = Date.now();
  while (Date.now() - t0 < capMin * 60 * 1000) {
    const p = path.join(RENDERS, `${jobId}.mp4`);
    if (fs.existsSync(p) && fs.statSync(p).size > 40_000) return p;
    await new Promise((r) => setTimeout(r, 20_000));
  }
  throw new Error(`the clip never landed: ${jobId}`);
}

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

  const idA = "cmv7inkry0001njdksdonze7f";
  await landClip(idA);
  console.log("ARM A (standing framing) scored:");
  await scoreArm(shot.id, "A-STANDING");

  // ARM B: the captured payload, ONE variable - the camera closer
  const envFile = path.join(RENDERS, `.job-${idA}.json`);
  const env = JSON.parse(fs.readFileSync(envFile, "utf8"));
  const armPayload = JSON.parse(JSON.stringify(env.payload));
  const idB = `framing201${Date.now().toString(36)}`;
  (armPayload as { jobId: string }).jobId = idB;
  const sc = (armPayload as { scene: { cameraDistance: number } }).scene;
  const standing = sc.cameraDistance;
  sc.cameraDistance = Math.round(standing * 0.6 * 1000) / 1000;
  console.log(`ARM B: scene.cameraDistance ${standing} -> ${sc.cameraDistance} (one variable)`);
  const bridge = await import("../src/lib/bridge/blender");
  const sub = await bridge.submitRenderJob(armPayload as never);
  console.log(`ARM B SUBMITTED: ${JSON.stringify(sub).slice(0, 120)}`);
  if (!(sub as { submitted?: boolean }).submitted) throw new Error(`the bridge refused arm B: ${JSON.stringify(sub).slice(0, 160)}`);
  const clipB = await waitClip(idB);
  console.log(`ARM B CLIP LANDED: ${path.basename(clipB)}`);
  await landClip(idB);
  console.log("ARM B (closer camera) scored:");
  await scoreArm(shot.id, "B-CLOSER");

  // THE EYE'S FRAMES
  fs.mkdirSync(path.join(CWD, "inspect", "eye201"), { recursive: true });
  execSync(`ffmpeg -y -ss 2 -i "${path.join(RENDERS, `${idA}.mp4`)}" -frames:v 1 -loglevel error "${CWD}/inspect/eye201/standing.png"`);
  execSync(`ffmpeg -y -ss 2 -i "${clipB}" -frames:v 1 -loglevel error "${CWD}/inspect/eye201/closer.png"`);
  console.log("THE FRAMES: inspect/eye201/{standing,closer}.png");
  await db.$disconnect();
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
