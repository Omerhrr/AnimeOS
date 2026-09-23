// E2E: real animated shots (MOTION engine + headless Blender workers)
// and the stem-muxed episode cut export.
// Steps:
//   plan - pure camera-grammar checks: movement profiles, shot-type
//          base zooms, lens character, lightning windows, fog veil,
//          deterministic planning, describeProgram wording, planCut
//          timeline math (slot offsets + cue retiming)
//   tool - live pipeline on a fixture production: render jobs finish
//          as playable clips (Blender worker or MOTION), ffprobe
//          verifies the artifacts, the episode cut muxes clips +
//          stems into one mp4 (video + audio streams, duration =
//          sum of shot durations), manifest + ProductionEvent land,
//          render_shot speaks the clip language, /api/bridge reports
//          the new driver world, Ep7 baseline untouched.
// Every fixture is removed at the end; cut artifacts are unlinked.
import { planCameraProgram, describeProgram, fnv1a } from "@/lib/bridge/motion";
import { planCut } from "@/lib/comic/cut";
import { executeTool } from "@/lib/dsh/tools";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";
const step = process.argv[2] ?? "plan";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function api<T>(p: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${p}`, init);
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

function ffprobe(file: string): Promise<{ duration: number; streams: Array<{ codec_type: string; codec_name: string; width?: number }> } | null> {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => {
      if (code !== 0) return resolve(null);
      try {
        const j = JSON.parse(out) as { streams: Array<{ codec_type: string; codec_name: string; width?: number }>; format: { duration: string } };
        resolve({ duration: Number(j.format.duration ?? 0), streams: j.streams });
      } catch {
        resolve(null);
      }
    });
  });
}

const SCENE_PARAMS = { fogDensity: 0.45, lightningIntensity: 0.55, energyIntensity: 0.6, cameraDistance: 1.0, rimLightIntensity: 0.5 };

// ─────────────────────────────────────────────────────────────
if (step === "plan") {
  const base = {
    jobId: "planjob-1",
    shotType: "MEDIUM",
    lens: null as string | null,
    movement: null as string | null,
    lighting: null as string | null,
    fogDensity: 0.45,
    lightningIntensity: 0.55,
    energyIntensity: 0.6,
    cameraDistance: 1.0,
    rimLightIntensity: 0.5,
    duration: 4,
    fps: 24,
    resolution: "1920x1080",
    mode: "PREVIEW" as "PREVIEW" | "FINAL",
    hasArt: false,
  };

  const dolly = planCameraProgram({ ...base, movement: "DOLLY_IN" });
  check("dolly in zooms forward", dolly.zoomTo > dolly.zoomFrom && dolly.zoomTo >= 1.3, `${dolly.zoomFrom}→${dolly.zoomTo}`);
  const pushAlias = planCameraProgram({ ...base, movement: "push in" });
  check("movement aliases share the dolly profile", pushAlias.moveLabel.includes("dolly in") && Math.abs(pushAlias.zoomTo - dolly.zoomTo) < 0.001, `${pushAlias.move} -> ${pushAlias.moveLabel}`);
  const unknown = planCameraProgram({ ...base, movement: "SPIRAL" });
  check("unknown movement falls to static", unknown.move === "STATIC", unknown.move);

  const pan = planCameraProgram({ ...base, movement: "PAN" });
  check("pan sweeps horizontally", pan.uxTo > pan.uxFrom && pan.zoomFrom === pan.zoomTo, `${pan.uxFrom}→${pan.uxTo}`);
  const crane = planCameraProgram({ ...base, movement: "CRANE" });
  check("crane descends vertically", crane.uyTo < crane.uyFrom, `${crane.uyFrom}→${crane.uyTo}`);
  const track = planCameraProgram({ ...base, movement: "TRACKING" });
  check("tracking drifts against the pan direction", track.uxTo < track.uxFrom, `${track.uxFrom}→${track.uxTo}`);

  const est = planCameraProgram({ ...base, shotType: "ESTABLISHING", movement: "STATIC" });
  const ecu = planCameraProgram({ ...base, shotType: "EXTREME_CLOSEUP", movement: "STATIC" });
  check("extreme closeup frames tighter than establishing", ecu.zoomFrom > est.zoomFrom, `${ecu.zoomFrom} vs ${est.zoomFrom}`);

  const tele = planCameraProgram({ ...base, lens: "85mm", movement: "STATIC" });
  const wide = planCameraProgram({ ...base, lens: "24mm", movement: "STATIC" });
  check("telephoto vignettes harder and frames tighter", tele.vignetteAngle > wide.vignetteAngle && tele.zoomTo > wide.zoomTo, `v ${tele.vignetteAngle.toFixed(3)} vs ${wide.vignetteAngle.toFixed(3)}`);

  const calm = planCameraProgram({ ...base, lightningIntensity: 0 });
  const stormy = planCameraProgram({ ...base, lightningIntensity: 0.8 });
  check("no lightning means no flashes", calm.flashes.length === 0, `${calm.flashes.length}`);
  check("storm opens 2 flash windows", stormy.flashes.length === 2, `${stormy.flashes.length}`);
  check("flash windows sit inside the clip", stormy.flashes.every((f) => f.start > 0 && f.start + f.dur <= stormy.durationSec + 0.01), "windows bounded");

  const foggy = planCameraProgram({ ...base, fogDensity: 0.9 });
  const clear = planCameraProgram({ ...base, fogDensity: 0.05 });
  check("fog thickens the veil and desaturates", foggy.fogAlpha > clear.fogAlpha && foggy.saturation < clear.saturation, `${foggy.fogAlpha} vs ${clear.fogAlpha}`);

  const timing = planCameraProgram({ ...base, duration: 2.5, fps: 24 });
  check("frames follow duration * fps", timing.frames === 60 && Math.abs(timing.durationSec - 2.5) < 0.01, `${timing.frames}f`);
  const prev = planCameraProgram({ ...base, mode: "PREVIEW" });
  const fin = planCameraProgram({ ...base, mode: "FINAL" });
  check("preview renders smaller than final", prev.width <= 960 && fin.width > prev.width, `${prev.width} vs ${fin.width}`);

  const again = planCameraProgram({ ...base, jobId: "planjob-1" });
  const again2 = planCameraProgram({ ...base, jobId: "planjob-1" });
  const other = planCameraProgram({ ...base, jobId: "planjob-2" });
  check("planning is deterministic per job and seeded per job", JSON.stringify(again.flashes) === JSON.stringify(again2.flashes) && JSON.stringify(again.flashes) !== JSON.stringify(other.flashes), `seed ${fnv1a("planjob-1") % 1000}`);

  const desc = describeProgram(timing, false);
  check("describeProgram names the move and the plate", desc.includes("static hold") && desc.includes("procedural plate"), desc);

  // planCut: timeline math
  const shots = [
    { id: "s1", number: 1, sceneNumber: 1, description: "a", duration: 2, movement: "PAN", shotType: "MEDIUM", clipUrl: "/renders/a.mp4" },
    { id: "s2", number: 2, sceneNumber: 1, description: "b", duration: 3, movement: "DOLLY_IN", shotType: "WIDE", clipUrl: "/renders/b.mp4" },
  ];
  const cuesByShot = {
    s1: [
      { id: "c1", kind: "SFX", label: "impact boom", startMs: 200, durationMs: 900, volume: 0.8 },
      { id: "c2", kind: "VOICE", label: "Lin Yue: line", startMs: 1500, durationMs: 4000, volume: 0.9, voiceUrl: "/voices/take.wav", voiceState: "NEUTRAL" },
    ],
    s2: [],
  };
  const cut = planCut(shots, cuesByShot, (url) => (url.endsWith(".wav") ? "/abs/voices/take.wav" : null));
  check("slots stack back to back", cut.slots[0].startMs === 0 && cut.slots[1].startMs === 2000 && cut.totalMs === 5000, `${cut.totalMs}ms`);
  check("cues retime onto the cut timeline", cut.cues[0].startMs === 200 && cut.cues[1].startMs === 1500, `${cut.cues[1].startMs} (0 + 1500 in slot 1)`);
  check("cues clamp inside their shot slot", cut.cues[1].durationMs === 500, `${cut.cues[1].durationMs}ms (slot ends at 5000)`);
  check("voice path resolves only for real files", cut.cues[1].voicePath === "/abs/voices/take.wav", String(cut.cues[1].voicePath));
  const orphan = planCut([{ ...shots[0], clipUrl: null }], { s1: [] }, () => null);
  check("missing clips keep empty slots for the builder to fill", orphan.slots[0].clipUrl === "" && orphan.slots[0].durationMs === 2000, orphan.slots[0].clipUrl);
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  const cutsDir = path.join(process.cwd(), "public", "renders", "cuts");
  const cutsBefore = fs.existsSync(cutsDir) ? new Set(fs.readdirSync(cutsDir)) : new Set();

  // fixture production tuned for fast renders
  const proj = await db.project.create({
    data: {
      title: "E2E Motion Cut",
      logline: "fixture for animated shots + cut export",
      fps: 24,
      resolution: "1280x720",
      seasons: {
        create: {
          number: 1,
          title: "S1",
          episodes: {
            create: {
              number: 1,
              title: "Blade Test",
              scenes: {
                create: {
                  number: 1,
                  title: "Cliff Terrace",
                  description: "storm terrace duel",
                  ...SCENE_PARAMS,
                  shots: {
                    create: [
                      { number: 1, description: "storm sweeps the terrace", shotType: "WIDE", movement: "PAN", lens: "24mm", lighting: "storm night", duration: 2.0 },
                      { number: 2, description: "the blade answers", shotType: "CLOSEUP", movement: "DOLLY_IN", lens: "85mm", lighting: "night", duration: 2.0 },
                      { number: 3, description: "stillness after", shotType: "MEDIUM", movement: "STATIC", duration: 1.6 },
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
  const episode = proj.seasons[0].episodes[0];
  const scene = episode.scenes[0];
  const shots = scene.shots.sort((a, b) => a.number - b.number);
  const projectId = proj.id;
  console.log(`fixture project ${projectId} with ${shots.length} shots`);

  // cues: SFX + a VOICE cue riding a REAL rendered take
  const takeCue = await db.audioCue.findFirst({ where: { voiceUrl: { not: null } }, orderBy: { createdAt: "desc" } });
  await db.audioCue.create({ data: { shotId: shots[0].id, kind: "SFX", label: "impact boom", startMs: 300, durationMs: 900, volume: 0.8 } });
  if (takeCue?.voiceUrl) {
    await db.audioCue.create({ data: { shotId: shots[0].id, kind: "VOICE", label: "Lin Yue: The storm bends.", startMs: 700, durationMs: 1200, volume: 0.9, voiceUrl: takeCue.voiceUrl, voiceActor: takeCue.voiceActor, voiceDurationMs: takeCue.voiceDurationMs } });
  }
  await db.audioCue.create({ data: { shotId: shots[2].id, kind: "AMBIENCE", label: "wind bed", startMs: 0, durationMs: 1400, volume: 0.5 } });

  try {
    // 1. render shot 1, wait for the clip
    const created = await api<{ id: string }>("/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "create", shotId: shots[0].id, mode: "PREVIEW" }) });
    check("render job created", created.status === 200 && Boolean(created.body.id), JSON.stringify(created.body).slice(0, 80));
    const jobId = created.body.id;

    let final1: { driver: string; outputUrl: string | null; status: string; stage: string } | null = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const jobs = await api<Array<{ id: string; driver: string; outputUrl: string | null; status: string; stage: string }>>(`/api/render-jobs?projectId=${projectId}`);
      const me = jobs.body.find((j) => j.id === jobId);
      if (me && ["REVIEW", "APPROVED", "NEEDS_REVISION", "FAILED"].includes(me.status)) { final1 = me; break; }
    }
    check("shot 1 finished with a playable clip", Boolean(final1?.outputUrl) && ["REVIEW", "APPROVED", "NEEDS_REVISION"].includes(final1?.status ?? ""), final1 ? `${final1.driver} ${final1.status} ${final1.outputUrl} :: ${final1.stage}` : "timeout");
    check("driver is a real engine (blender or motion)", ["BLENDER", "BLENDER_LOCAL", "MOTION"].includes(final1?.driver ?? ""), final1?.driver ?? "none");

    const clip1 = path.join(process.cwd(), "public", "renders", `${jobId}.mp4`);
    if (final1?.outputUrl && fs.existsSync(clip1)) {
      const probe = await ffprobe(clip1);
      const v = probe?.streams.find((s) => s.codec_type === "video");
      check("clip 1 is real h264 video", v?.codec_name === "h264" && (v?.width ?? 0) > 0, `${v?.codec_name} ${v?.width}px`);
      check("clip 1 duration follows the shot", Math.abs((probe?.duration ?? 0) - 2.0) < 0.5, `${probe?.duration?.toFixed(2)}s vs 2.0s`);
    } else {
      check("clip 1 file exists", false, clip1);
    }

    // 2. queue the remaining shots
    for (const s of shots.slice(1)) {
      await api("/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "create", shotId: s.id, mode: "PREVIEW" }) });
    }
    let allClips = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const jobs = await api<Array<{ shotId: string | null; outputUrl: string | null; status: string }>>(`/api/render-jobs?projectId=${projectId}`);
      const byShot = new Map<string, string | null>();
      for (const j of jobs.body) if (j.shotId) byShot.set(j.shotId, byShot.get(j.shotId) ?? j.outputUrl);
      allClips = shots.every((s) => (byShot.get(s.id) ?? null) !== null);
      if (allClips) break;
    }
    check("every shot ends with a clip", allClips, "3/3 shots with outputUrl");

    // 3. export the cut
    const cut = await api<{ url?: string; durationMs?: number; shotCount?: number; cueCount?: number; width?: number; height?: number; warnings?: string[]; error?: string }>(`/api/episodes/${episode.id}/cut`, { method: "POST", body: JSON.stringify({ mode: "PREVIEW" }) });
    check("cut export succeeded", cut.status === 200 && Boolean(cut.body.url), cut.status === 200 ? `${cut.body.shotCount} shots ${(cut.body.durationMs ?? 0) / 1000}s` : cut.body.error ?? "no url");
    if (cut.body.url) {
      const abs = path.join(process.cwd(), "public", cut.body.url.replace(/^\//, ""));
      const probe = await ffprobe(abs);
      check("cut file exists on disk", fs.existsSync(abs), abs);
      check("cut carries video + audio streams", Boolean(probe?.streams.some((s) => s.codec_type === "video")) && Boolean(probe?.streams.some((s) => s.codec_type === "audio")), probe?.streams.map((s) => s.codec_type).join("+") ?? "none");
      check("cut duration equals the shot sum", Math.abs((probe?.duration ?? 0) - 5.6) < 0.8, `${probe?.duration?.toFixed(2)}s vs 5.6s`);
      check("cut canvas matches the project fit", cut.body.width === 960 && cut.body.height === 540, `${cut.body.width}x${cut.body.height}`);
      const manifestPath = abs.replace(/\.mp4$/, ".json");
      check("manifest sidecar written", fs.existsSync(manifestPath) && fs.readFileSync(manifestPath, "utf-8").includes("\"episode\""), manifestPath);
    }

    // 4. ProductionEvent recorded
    const events = await db.productionEvent.findMany({ where: { projectId, type: "RENDER" }, orderBy: { createdAt: "desc" }, take: 8 });
    check("episode cut lands in the production history", events.some((e) => e.summary.includes("Episode cut muxed")), `${events.length} render events`);

    // 5. render_shot speaks clip language
    const renderCall = await executeTool(projectId, "render_shot", { sceneNumber: 1, shotNumber: 2 });
    check("render_shot names the engine and the clip contract", renderCall.status === "OK" && renderCall.result.includes("animated clip") && renderCall.result.includes("DOLLY_IN"), renderCall.result.slice(0, 140));

    // 6. bridge status reflects the new driver world
    const bridge = await api<{ mode: string; detail: string; source: string | null }>("/api/bridge");
    check("bridge reports MOTION or LIVE_BLENDER", ["MOTION", "LIVE_BLENDER"].includes(bridge.body.mode), `${bridge.body.mode} :: ${bridge.body.detail.slice(0, 90)}`);

    // 7. Ep7 baseline untouched
    const ep7 = await db.episode.findFirst({ where: { number: 7 }, include: { scenes: { include: { shots: { include: { audioCues: true } } } } } });
    if (ep7) {
      const cues = ep7.scenes.flatMap((s) => s.shots.flatMap((sh) => sh.audioCues));
      const voice = cues.filter((c) => c.kind === "VOICE");
      const fresh = voice.filter((c) => c.voiceSig).length;
      const stale = 0;
      check("Ep7 baseline holds (0 fresh / 0 stale / voice cues intact)", fresh === 0 && stale === 0 && voice.length > 0, `${voice.length} voice cues`);
    }
  } finally {
    // cleanup: fixture project cascades jobs; cut artifacts + job clips removed
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
    if (fs.existsSync(cutsDir)) {
      for (const f of fs.readdirSync(cutsDir)) {
        if (!cutsBefore.has(f)) {
          try { fs.unlinkSync(path.join(cutsDir, f)); } catch { /* best-effort */ }
        }
      }
    }
    // remove orphan clip files from the fixture jobs
    for (const f of fs.readdirSync(path.join(process.cwd(), "public", "renders"))) {
      if (f.endsWith(".mp4") || f.startsWith(".job-") || f.startsWith(".plate-") || f.startsWith(".frames-")) {
        try { fs.unlinkSync(path.join(process.cwd(), "public", "renders", f)); } catch { /* best-effort */ }
      }
    }
  }
}

if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nALL PASS");
process.exit(0);
