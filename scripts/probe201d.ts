// PROBE 201D - the framing arm, capture-fresh (the 175 pattern:
// a throwaway standing submit whose envelope is caught at the door,
// then the ONE-variable arm B from those bytes). Arm A's receipt
// already rides (Wei 40 / face 20 - probe201c).
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

  const known = new Set(fs.readdirSync(RENDERS).filter((f) => f.startsWith(".job-")).map((f) => f.slice(5, -5)));
  let captured: { jobId: string; payload: Record<string, unknown> } | null = null;
  const watch = setInterval(() => {
    if (captured) return;
    try {
      for (const f of fs.readdirSync(RENDERS)) {
        if (!f.startsWith(".job-") || !f.endsWith(".json")) continue;
        const id = f.slice(5, -5);
        if (known.has(id)) continue;
        const env = JSON.parse(fs.readFileSync(path.join(RENDERS, f), "utf8"));
        if (env?.payload?.shot && env?.payload?.scene) {
          captured = { jobId: id, payload: env.payload };
          console.log(`PAYLOAD CAPTURED: ${id}`);
          return;
        }
      }
    } catch { /* mid-write - retry */ }
  }, 150);

  // the throwaway standing submit whose envelope feeds arm B
  const { createRenderJob } = await import("../src/lib/engine/render");
  console.log("THE CAPTURE SUBMIT (rides as an extra standing clip)...");
  const jobC = await createRenderJob(project.id, shot.id, "PREVIEW");
  const idC = (jobC as { id?: string })?.id ?? "";
  console.log(`CAPTURE JOB: ${idC}`);
  for (let i = 0; i < 200 && !captured; i++) await new Promise((r) => setTimeout(r, 150));
  clearInterval(watch);
  if (!captured) throw new Error("the payload envelope never appeared");

  // ARM B: the same bytes, ONE variable - the camera closer
  const armPayload = JSON.parse(JSON.stringify(captured.payload));
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

  fs.mkdirSync(path.join(CWD, "inspect", "eye201"), { recursive: true });
  execSync(`ffmpeg -y -ss 2 -i "${path.join(RENDERS, `${idB}.mp4`)}" -frames:v 1 -loglevel error "${CWD}/inspect/eye201/closer.png"`);
  console.log("THE FRAME: inspect/eye201/closer.png");
  await db.$disconnect();
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
