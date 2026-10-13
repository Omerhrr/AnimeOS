// THE 179 S004 PROBE - THE PAIRED-ARM DISCIPLINE AT THE
// PERSISTENT-WORST CELL (the 175 instrument, retargeted; the 178
// night named S004 the gate's worst in EVERY under cell - four
// consecutive 35s, a mode not a coin). THE CANDIDATES THE ARM
// SPLITS: (a) the tribulation LUT's own ride (S004's 'Aura glow +
// lightning' compiles tribulation exactly like S006 - the 175
// probe's lever applies), (b) the build's wide-distance face (the
// crops the judge reads), (c) the composition's own read. ONE
// VARIABLE: shot.comp.lut 'tribulation' -> 'neutral'; both arms
// through the REAL doors in the SAME session (the standing arm via
// createRenderJob's own assembly with the payload captured at the
// bridge's job-file door; the neutral arm the same bytes).
// THE MEASUREMENT: t=2 frames, Wei's FACE crop and ROBE crop (the
// figure center-frame in the standing grammar), mean RGB -> HSV per
// arm per region, the shifts quantified.
// Run: DATABASE_URL=file:... npx tsx scripts/probe179-s004.ts
import fs from "fs";
import path from "path";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const CWD = "/home/z/my-project/AnimeOS";
const RENDERS = path.join(CWD, "public", "renders");
const EYE = path.join(CWD, "inspect", "eye179");
const SHOT_NUMBER = 4;

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, mx === 0 ? 0 : d / mx, mx];
}

async function main() {
  const db = new PrismaClient();
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({ where: { episode: { season: { projectId: project.id } } }, orderBy: { number: "asc" } });
  if (!scene) throw new Error("scene missing");
  const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: SHOT_NUMBER } });
  if (!shot) throw new Error(`S00${SHOT_NUMBER} missing`);
  console.log(`S00${SHOT_NUMBER} found: ${shot.id} (${shot.shotType}, "${shot.lighting}")`);

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
        if (env?.payload?.shot?.comp?.lut) {
          captured = { jobId: id, payload: env.payload };
          console.log(`PAYLOAD CAPTURED FROM THE JOB FILE: ${id} shot.comp.lut=${env.payload.shot.comp.lut}`);
          return;
        }
      }
    } catch { /* mid-write - retry */ }
  }, 150);

  const { createRenderJob } = await import("../src/lib/engine/render");
  console.log(`THE STANDING ARM: createRenderJob(S00${SHOT_NUMBER}, PREVIEW) through the real assembly...`);
  await createRenderJob(project.id, shot.id, "PREVIEW");
  for (let i = 0; i < 200 && !captured; i++) await new Promise((r) => setTimeout(r, 150));
  clearInterval(watch);
  if (!captured) throw new Error("the payload envelope never appeared (30s cap)");
  const standingId = captured.jobId;
  console.log(`STANDING JOB: ${standingId} - rendering at the standing comp`);

  const armPayload = JSON.parse(JSON.stringify(captured.payload));
  const armId = `lutprobe179s${Date.now().toString(36)}`;
  (armPayload as { jobId: string }).jobId = armId;
  const armComp = (armPayload as { shot: { comp: { lut: string; fields?: string[] } } }).shot.comp;
  armComp.lut = "neutral";
  if (Array.isArray(armComp.fields)) armComp.fields = [...armComp.fields, "lut-probe-override"];
  const bridge = await import("../src/lib/bridge/blender");
  const sub = await bridge.submitRenderJob(armPayload as never);
  console.log(`NEUTRAL ARM SUBMITTED: ${JSON.stringify(sub).slice(0, 120)}`);
  if (!(sub as { submitted?: boolean }).submitted) throw new Error(`the bridge refused the arm: ${JSON.stringify(sub).slice(0, 160)}`);

  const t0 = Date.now();
  let armDone = false;
  while (Date.now() - t0 < 40 * 60 * 1000) {
    const a = path.join(RENDERS, `${armId}.mp4`);
    if (fs.existsSync(a) && fs.statSync(a).size > 50_000) { armDone = true; break; }
    await new Promise((r) => setTimeout(r, 20_000));
  }
  if (!armDone) throw new Error("the arm never landed a clip (40 min cap)");
  console.log(`[${Math.round((Date.now() - t0) / 1000)}s] BOTH ARMS DONE`);
  await db.$disconnect();

  fs.mkdirSync(EYE, { recursive: true });
  const fStanding = path.join(EYE, "standing.png");
  const fArm = path.join(EYE, "neutral-arm.png");
  execSync(`ffmpeg -y -ss 2 -i "${path.join(RENDERS, `${standingId}.mp4`)}" -frames:v 1 -loglevel error "${fStanding}"`);
  execSync(`ffmpeg -y -ss 2 -i "${path.join(RENDERS, `${armId}.mp4`)}" -frames:v 1 -loglevel error "${fArm}"`);

  // THE REGIONS: the figure center-frame in the standing grammar -
  // the face (the small wide-distance crop the judge reads) and the
  // robe (the crimson mass the LUT's red gain pushes)
  const sample = (file: string, x0: number, y0: number, x1: number, y1: number) => {
    const out = execSync(`python3 -c "
from PIL import Image
im = Image.open('${file}').convert('RGB')
w, h = im.size
box = (int(w*${x0}), int(h*${y0}), int(w*${x1}), int(h*${y1}))
px = im.crop(box)
data = list(px.getdata())
n = len(data)
r = sum(p[0] for p in data)/n/255
g = sum(p[1] for p in data)/n/255
b = sum(p[2] for p in data)/n/255
print(f'{r:.4f} {g:.4f} {b:.4f}')
"`).toString().trim().split(/\s+/).map(Number);
    return { r: out[0], g: out[1], b: out[2] };
  };
  const regions: Array<[string, number, number, number, number]> = [
    ["FACE", 0.44, 0.28, 0.56, 0.44],
    ["ROBE", 0.42, 0.48, 0.58, 0.72],
  ];
  for (const [name, x0, y0, x1, y1] of regions) {
    const st = sample(fStanding, x0, y0, x1, y1);
    const ar = sample(fArm, x0, y0, x1, y1);
    const [hSt, sSt, vSt] = rgbToHsv(st.r, st.g, st.b);
    const [hAr, sAr, vAr] = rgbToHsv(ar.r, ar.g, ar.b);
    const dh = ((hAr - hSt + 540) % 360) - 180;
    console.log(`${name} STANDING (tribulation): HSV=(${hSt.toFixed(1)}deg, ${sSt.toFixed(3)}, ${vSt.toFixed(3)})`);
    console.log(`${name} NEUTRAL ARM           : HSV=(${hAr.toFixed(1)}deg, ${sAr.toFixed(3)}, ${vAr.toFixed(3)})`);
    console.log(`${name} SHIFT: dHue=${dh.toFixed(1)}deg dSat=${(sAr - sSt).toFixed(3)} dVal=${(vAr - vSt).toFixed(3)}`);
  }
  console.log(`VERDICT: read the shifts - a large FACE shift names the LUT in the face's own read; a small FACE shift moves the search to the build/composition`);
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
