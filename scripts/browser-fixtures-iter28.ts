// Browser fixtures for Iteration 28 UI verification (seed | clean).
// seed: a standalone fixture production "E2E Browser Poses" whose
//       shots carry pose programs (STANCE->LUNGE, CAST hold) and are
//       RENDERED before the script returns (headless Blender stand-in
//       for pose shots, MOTION engine for the camera-only beat).
// clean: deletes the fixture production (cascades jobs) and unlinks
//        every clip/cut artifact it produced.
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";
const TITLE = "E2E Browser Poses";

async function api<T>(p: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${p}`, init);
  return (await res.json()) as T;
}

if (process.argv[2] === "clean") {
  const proj = await db.project.findFirst({ where: { title: TITLE }, select: { id: true } });
  if (!proj) {
    console.log("nothing to clean");
    process.exit(0);
  }
  const jobs = await db.renderJob.findMany({ where: { projectId: proj.id, outputUrl: { not: null } }, select: { outputUrl: true } });
  await db.project.delete({ where: { id: proj.id } });
  const rendersDir = path.join(process.cwd(), "public", "renders");
  let removed = 0;
  for (const j of jobs) {
    if (!j.outputUrl) continue;
    const f = path.join(process.cwd(), "public", j.outputUrl.replace(/^\//, "").split("?")[0]);
    try { fs.unlinkSync(f); removed += 1; } catch { /* already gone */ }
  }
  try {
    for (const f of fs.readdirSync(rendersDir)) {
      if (f.endsWith(".mp4") || f.startsWith(".job-") || f.startsWith(".plate-") || f.startsWith(".frames-")) {
        try { fs.unlinkSync(path.join(rendersDir, f)); removed += 1; } catch { /* best-effort */ }
      }
    }
  } catch { /* dir missing */ }
  console.log(`cleaned: fixture project + ${removed} artifact(s)`);
} else {
  // fresh artifacts sweep first so the fixture owns its files
  const rendersDir = path.join(process.cwd(), "public", "renders");
  try {
    for (const f of fs.readdirSync(rendersDir)) {
      if (f.endsWith(".mp4") || f.startsWith(".job-") || f.startsWith(".plate-") || f.startsWith(".frames-")) {
        try { fs.unlinkSync(path.join(rendersDir, f)); } catch { /* best-effort */ }
      }
    }
  } catch { /* dir missing */ }

  const proj = await db.project.create({
    data: {
      title: TITLE,
      logline: "browser fixture: character motion inside the frame",
      fps: 24,
      resolution: "1280x720",
      seasons: {
        create: {
          number: 1,
          title: "S1",
          episodes: {
            create: {
              number: 1,
              title: "Blocking Pass",
              scenes: {
                create: {
                  number: 1,
                  title: "Terrace",
                  description: "duel blocking",
                  fogDensity: 0.45,
                  lightningIntensity: 0.3,
                  energyIntensity: 0.65,
                  cameraDistance: 1.0,
                  rimLightIntensity: 0.55,
                  shots: {
                    create: [
                      { number: 1, description: "the striker commits", shotType: "MEDIUM", movement: "STATIC", poseStart: "STANCE", poseEnd: "LUNGE", duration: 2.0 },
                      { number: 2, description: "storm sweeps the terrace", shotType: "WIDE", movement: "PAN", lens: "24mm", lighting: "storm night", duration: 1.6 },
                      { number: 3, description: "channeling the storm", shotType: "CLOSEUP", movement: "DOLLY_IN", poseStart: "CAST", poseEnd: "CAST", duration: 2.0 },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } } },
  });
  const shots = proj.seasons[0].episodes[0].scenes[0].shots.sort((a, b) => a.number - b.number);

  await db.audioCue.create({ data: { shotId: shots[0].id, kind: "SFX", label: "lunge impact", startMs: 400, durationMs: 800, volume: 0.8 } });

  // render all three shots, wait for clips
  for (const s of shots) {
    await api("/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "create", shotId: s.id, mode: "PREVIEW" }) });
  }
  const deadline = Date.now() + 5 * 60_000;
  let withClips = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const jobs = await api<Array<{ shotId: string | null; outputUrl: string | null }>>(`/api/render-jobs?projectId=${proj.id}`);
    const byShot = new Map<string, string | null>();
    for (const j of jobs) if (j.shotId) byShot.set(j.shotId, byShot.get(j.shotId) ?? j.outputUrl);
    withClips = shots.filter((s) => (byShot.get(s.id) ?? null) !== null).length;
    process.stdout.write(`\rclips: ${withClips}/${shots.length}   `);
    if (withClips === shots.length) break;
  }
  console.log(`\nseeded: ${TITLE} project=${proj.id} with ${withClips}/${shots.length} clips`);
  if (withClips < shots.length) {
    console.log("WARN: not every shot finished in time - the browser check will show partial state");
  }
}
process.exit(0);
