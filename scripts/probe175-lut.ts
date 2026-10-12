// THE 175 LUT PROBE - THE VIOLET CAST'S OWN ARM (the 159 rider,
// named with code in hand: S006's lighting words 'Lightning
// detonation' compile the tribulation LUT - gain R+0.08/G-0.03,
// sat 1.12, mistTint (0.3, 0.24, 0.38) = violet - and the standing
// job file carries the receipt: "lut": "tribulation", fields
// ["tribulation", "fog", "speed", "lightning"]).
// THE DISCIPLINE (the 141 law, the 164 precedent): BOTH ARMS RIDE
// THE REAL DOORS IN THE SAME SESSION - the standing arm is a FRESH
// createRenderJob for S006 (the engine's own payload assembly, the
// standing LUT), with the payload CAPTURED at the submission door
// (the spy rides the same namespace binding render.ts calls); the
// neutral arm submits the SAME payload bytes with ONE variable
// changed: shot.comp.lut 'tribulation' -> 'neutral'. Same builds,
// same session, one variable.
// THE MEASUREMENT: t=2 frames from both clips, Lin's robe crop (a
// fixed normalized box), mean RGB -> HSV per arm, the violet shift
// quantified (the hue degrees + the S/V deltas).
// Run: DATABASE_URL=file:... npx tsx scripts/probe175-lut.ts
import fs from "fs";
import path from "path";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const CWD = "/home/z/my-project/AnimeOS";
const RENDERS = path.join(CWD, "public", "renders");
const EYE = path.join(CWD, "inspect", "eye175");

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
  const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: 6 } });
  if (!shot) throw new Error("S006 missing");
  console.log(`S006 found: ${shot.id} (${shot.shotType}, "${shot.lighting}")`);

  // THE KNOWN JOB IDS (the watcher ignores the standing history)
  const known = new Set(fs.readdirSync(RENDERS).filter((f) => f.startsWith(".job-")).map((f) => f.slice(5, -5)));

  // THE CAPTURE WATCHER: the bridge writes {jobId, payload, outDir} at
  // submit - the envelope lives until the worker's first rewrite; a
  // 150ms poll catches it (the render's first progress write is
  // seconds away)
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
    } catch { /* the worker may be mid-write - the next tick retries */ }
  }, 150);

  const { createRenderJob } = await import("../src/lib/engine/render");
  console.log("THE STANDING ARM: createRenderJob(S006, PREVIEW) through the real assembly...");
  const standingJob = await createRenderJob(project.id, shot.id, "PREVIEW");
  const standingId = (standingJob as { id?: string })?.id ?? "";
  console.log(`STANDING JOB ROW: ${standingId} - rendering at the standing comp`);
  for (let i = 0; i < 200 && !captured; i++) await new Promise((r) => setTimeout(r, 150));
  clearInterval(watch);
  if (!captured) throw new Error("the payload envelope never appeared (30s cap)");

  // THE NEUTRAL ARM: the same bytes, ONE variable
  const armPayload = JSON.parse(JSON.stringify(captured.payload));
  const armId = `lutprobe175${Date.now().toString(36)}`;
  (armPayload as { jobId: string }).jobId = armId;
  const armComp = (armPayload as { shot: { comp: { lut: string; fields?: string[] } } }).shot.comp;
  armComp.lut = "neutral";
  if (Array.isArray(armComp.fields)) armComp.fields = [...armComp.fields, "lut-probe-override"];
  const bridge = await import("../src/lib/bridge/blender");
  const sub = await bridge.submitRenderJob(armPayload as never);
  console.log(`NEUTRAL ARM SUBMITTED: ${JSON.stringify(sub).slice(0, 120)}`);
  if (!(sub as { submitted?: boolean }).submitted) throw new Error(`the bridge refused the arm: ${JSON.stringify(sub).slice(0, 160)}`);

  // POLL BOTH TO CLIPS (cap 30 min - two S006-rung renders)
  const t0 = Date.now();
  const standingClip = path.join(RENDERS, `${captured.jobId}.mp4`);
  let armDone = false;
  while (Date.now() - t0 < 30 * 60 * 1000) {
    if (!fs.existsSync(path.join(EYE, ".standingNoted")) && fs.existsSync(standingClip)) {
      fs.writeFileSync(path.join(EYE, ".standingNoted"), String(Date.now()));
      console.log(`[${Math.round((Date.now() - t0) / 1000)}s] THE STANDING CLIP LANDED`);
    }
    const a = path.join(RENDERS, `${armId}.mp4`);
    if (fs.existsSync(a) && fs.statSync(a).size > 50_000) { armDone = true; break; }
    await new Promise((r) => setTimeout(r, 20_000));
  }
  if (!armDone) throw new Error("the arm never landed a clip (30 min cap)");
  console.log(`[${Math.round((Date.now() - t0) / 1000)}s] THE ARM CLIP LANDED - both arms done`);
  await db.$disconnect();

  // THE FRAMES + THE TEXELS
  fs.mkdirSync(EYE, { recursive: true });
  const fStanding = path.join(EYE, "standing.png");
  const fArm = path.join(EYE, "neutral-arm.png");
  execSync(`ffmpeg -y -ss 2 -i "${path.join(RENDERS, `${standingId}.mp4`)}" -frames:v 1 -loglevel error "${fStanding}"`);
  execSync(`ffmpeg -y -ss 2 -i "${path.join(RENDERS, `${armId}.mp4`)}" -frames:v 1 -loglevel error "${fArm}"`);

  const sample = (file: string) => {
    const out = execSync(`python3 -c "
from PIL import Image
im = Image.open('${file}').convert('RGB')
w, h = im.size
box = (int(w*0.20), int(h*0.44), int(w*0.32), int(h*0.72))
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
  const st = sample(fStanding);
  const ar = sample(fArm);
  const [hSt, sSt, vSt] = rgbToHsv(st.r, st.g, st.b);
  const [hAr, sAr, vAr] = rgbToHsv(ar.r, ar.g, ar.b);
  const dh = ((hAr - hSt + 540) % 360) - 180;
  console.log(`STANDING (tribulation): RGB=(${st.r.toFixed(3)}, ${st.g.toFixed(3)}, ${st.b.toFixed(3)}) HSV=(${hSt.toFixed(1)}deg, ${sSt.toFixed(3)}, ${vSt.toFixed(3)})`);
  console.log(`NEUTRAL ARM           : RGB=(${ar.r.toFixed(3)}, ${ar.g.toFixed(3)}, ${ar.b.toFixed(3)}) HSV=(${hAr.toFixed(1)}deg, ${sAr.toFixed(3)}, ${vAr.toFixed(3)})`);
  console.log(`THE VIOLET SHIFT (neutral minus standing): dHue=${dh.toFixed(1)}deg dSat=${(sAr - sSt).toFixed(3)} dVal=${(vAr - vSt).toFixed(3)}`);
  console.log(`VERDICT: ${Math.abs(dh) > 5 || Math.abs(sAr - sSt) > 0.02 ? "THE LUT RIDES THE VIOLET (the shift is the LUT's own - the correction lever is named)" : "THE VIOLET IS NOT THE LUT'S RIDE (the cast survives the neutral arm - the search moves)"}`);
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
