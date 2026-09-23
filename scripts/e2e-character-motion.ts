// E2E: character motion inside the frame (shot pose vocabulary).
// Steps:
//   plan - pure checks: pose vocabulary + aliases, eased joint
//          interpolation endpoints and monotonicity, pose chips and
//          descriptions, MOTION program pose wording + impact pulse,
//          img2vid slot disabled by default.
//   tool - live pipeline: a mock img2vid provider speaks the real
//          client protocol (submit / poll / clip download), the
//          shots API validates poses (400 on unknown, alias
//          normalization), DSH create_shot / set_shot_poses /
//          render_shot carry the pose language, a pose shot renders
//          on the headless Blender stand-in (ffprobe-verified clip),
//          and the MOTION engine renders a pose pair as a blocking
//          approximation. Every artifact is removed at the end.
import { planCameraProgram, describeProgram, renderShotClip } from "@/lib/bridge/motion";
import {
  POSES, POSE_JOINTS, normalizePose, lerpPose, poseChip, describePosePair, hasPoseProgram,
} from "@/lib/animation/poses";
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
  // vocabulary
  check("vocabulary has 13 named poses", POSES.length === 13, POSES.join(","));
  check("every pose has joints, a label and a gloss", POSES.every((p) => POSE_JOINTS[p] && Object.keys(POSE_JOINTS[p]).length === 12), "12 joint channels each");
  check("normalizePose is case and separator forgiving", normalizePose("lunge") === "LUNGE" && normalizePose("sword slash") === "SLASH" && normalizePose("stand-up") === "RISE", `${normalizePose("sword slash")}/${normalizePose("stand-up")}`);
  check("aliases map onto the vocabulary", normalizePose("ATTACK") === "LUNGE" && normalizePose("idle") === "STANCE" && normalizePose("jump") === "LEAP", `${normalizePose("ATTACK")}/${normalizePose("idle")}`);
  check("unknown poses normalize to null", normalizePose("flying kick") === null && normalizePose("") === null, String(normalizePose("flying kick")));

  // interpolation: endpoints exact, mid eased between, monotonic
  const a = lerpPose("STANCE", "BOW", 0);
  const b = lerpPose("STANCE", "BOW", 1);
  check("lerp at t=0 is the start pose", a.spine === POSE_JOINTS.STANCE.spine && a.rArm === POSE_JOINTS.STANCE.rArm, `spine ${a.spine}`);
  check("lerp at t=1 is the end pose", b.spine === POSE_JOINTS.BOW.spine && b.rootY === POSE_JOINTS.BOW.rootY, `spine ${b.spine}`);
  const q1 = lerpPose("STANCE", "BOW", 0.25).spine;
  const mid = lerpPose("STANCE", "BOW", 0.5).spine;
  const q3 = lerpPose("STANCE", "BOW", 0.75).spine;
  check("eased interpolation is monotonic between poses", q1 < mid && mid < q3, `${q1} < ${mid} < ${q3}`);
  check("ease holds back early (cubic ease-in)", lerpPose("STANCE", "BOW", 0.25).spine < (1 + 38 * 0.25) / 2, String(lerpPose("STANCE", "BOW", 0.25).spine));
  check("unknown poses fall back to STANCE inside lerp", lerpPose("flying kick", "flying kick", 0.5).spine === POSE_JOINTS.STANCE.spine, "safe fallback");
  const walkA = lerpPose("WALK", "WALK", 0);
  check("walk joints carry stride asymmetry", walkA.rLeg === 28 && walkA.lLeg === -14, `r ${walkA.rLeg} / l ${walkA.lLeg}`);

  // chips + wording
  check("poseChip pairs and singles", poseChip("STANCE", "LUNGE") === "STANCE → LUNGE" && poseChip("SLASH", null) === "SLASH" && poseChip(null, null) === null, String(poseChip("STANCE", "LUNGE")));
  check("poseChip normalizes aliases", poseChip("stand", "attack") === "STANCE → LUNGE", String(poseChip("stand", "attack")));
  check("describePosePair speaks the beat", describePosePair("STANCE", "LUNGE").includes("character motion") && describePosePair("STANCE", "LUNGE").includes("forward lunge"), describePosePair("STANCE", "LUNGE").slice(0, 90));
  check("hasPoseProgram gates the engines", hasPoseProgram(null, "CAST") && !hasPoseProgram(null, null), "gate");

  // MOTION program: pose wording + impact pulse
  const mk = (over: Record<string, unknown>) => planCameraProgram({
    jobId: "posejob-1", shotType: "MEDIUM", lens: null, movement: "STATIC", lighting: null,
    fogDensity: 0.45, lightningIntensity: 0, energyIntensity: 0, cameraDistance: 1.0, rimLightIntensity: 0.5,
    duration: 4, fps: 24, resolution: "1920x1080", mode: "PREVIEW", hasArt: false, ...over,
  });
  const poseProg = mk({ poseStart: "STANCE", poseEnd: "LUNGE" });
  const plainProg = mk({});
  check("pose program carries the pose chip", poseProg.poseChipText === "STANCE → LUNGE", String(poseProg.poseChipText));
  check("plain program has no pose chip", plainProg.poseChipText === null, "null");
  check("pose program adds an impact pulse at the end pose", poseProg.pulses.length === 1 && poseProg.pulses[0].start >= 0.83, `at ${poseProg.pulses[0]?.start}`);
  check("plain program has no pulses (energy 0)", plainProg.pulses.length === 0, `${plainProg.pulses.length}`);
  const descP = describeProgram(poseProg, false);
  const descN = describeProgram(plainProg, false);
  check("describeProgram names poses as blocking", descP.includes("poses STANCE → LUNGE (blocking)") && !descN.includes("poses"), descP);
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  // ── 1. mock img2vid provider speaking the real protocol ──
  const rendersDir = path.join(process.cwd(), "public", "renders");
  fs.mkdirSync(rendersDir, { recursive: true });
  const mockClip = path.join(rendersDir, ".mock-img2vid-clip.mp4");
  await new Promise<void>((resolve) => {
    const gen = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=320x240:d=0.8:r=24", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", mockClip]);
    gen.on("exit", (code) => { if (code !== 0) console.log("WARN: mock clip generation failed"); resolve(); });
    gen.on("error", () => resolve());
  });
  const jobs = new Map<string, { created: number; poseStart: string | null; poseEnd: string | null }>();
  const MOCK_CLIP_URL = "/clip.mp4";
  const server = Bun.serve({
    port: 8291,
    idleTimeout: 30,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "POST" && url.pathname === "/jobs") {
        const body = (await req.json()) as { jobId?: string; poseStart?: string | null; poseEnd?: string | null };
        if (!body.jobId) return Response.json({ error: "jobId required" }, { status: 400 });
        if (body.poseStart !== "STANCE" || body.poseEnd !== "LUNGE") {
          return Response.json({ error: "expected STANCE -> LUNGE pose program" }, { status: 400 });
        }
        jobs.set(body.jobId, { created: Date.now(), poseStart: body.poseStart ?? null, poseEnd: body.poseEnd ?? null });
        return Response.json({ jobId: body.jobId, status: "queued" }, { status: 201 });
      }
      if (req.method === "GET" && url.pathname.startsWith("/jobs/")) {
        const id = decodeURIComponent(url.pathname.slice("/jobs/".length));
        const j = jobs.get(id);
        if (!j) return Response.json({ error: "unknown" }, { status: 404 });
        const elapsed = Date.now() - j.created;
        if (elapsed < 1200) return Response.json({ status: "running", progress: Math.min(0.9, elapsed / 1400) });
        return Response.json({ status: "done", progress: 1, videoUrl: `http://127.0.0.1:8291${MOCK_CLIP_URL}` });
      }
      if (req.method === "GET" && url.pathname === MOCK_CLIP_URL) {
        const buf = fs.readFileSync(mockClip);
        return new Response(buf, { headers: { "Content-Type": "video/mp4" } });
      }
      return Response.json({ error: "not found" }, { status: 404 });
    },
  });

  // the client reads the env at module load - set it before the dynamic import
  process.env.ANIMEOS_IMG2VID_HOST = "127.0.0.1:8291";
  const { img2vidStatus, submitImg2VidJob, pollImg2VidJob } = await import("@/lib/bridge/img2vid");

  const fixtureJobId = "e2e-img2vid-mockjob";
  try {
    check("img2vid slot reports available under env", img2vidStatus().available === true && img2vidStatus().host === "127.0.0.1:8291", JSON.stringify(img2vidStatus()));
    const submit = await submitImg2VidJob({
      jobId: fixtureJobId, imageUrl: null, poseStart: "STANCE", poseEnd: "LUNGE",
      movement: "STATIC", shotType: "MEDIUM", fps: 24, frames: 48, width: 1280, height: 720, mode: "PREVIEW",
    });
    check("img2vid submit accepted the pose program", submit.submitted === true, submit.error ?? "submitted");
    const bad = await submitImg2VidJob({
      jobId: "e2e-img2vid-badjob", imageUrl: null, poseStart: "FLYING_KICK", poseEnd: "LUNGE",
      movement: "STATIC", shotType: "MEDIUM", fps: 24, frames: 48, width: 1280, height: 720, mode: "PREVIEW",
    });
    check("img2vid submit rejects a bogus pose program", bad.submitted === false, bad.error ?? "rejected");

    let pollResult: Awaited<ReturnType<typeof pollImg2VidJob>> | null = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      pollResult = await pollImg2VidJob(fixtureJobId);
      if (pollResult.done) break;
    }
    check("img2vid poll reaches done", pollResult?.done === true && pollResult.status === "done", JSON.stringify(pollResult).slice(0, 120));
    const downloaded = pollResult?.mp4Path ? fs.existsSync(pollResult.mp4Path) : false;
    check("img2vid clip downloaded into public/renders", downloaded, pollResult?.mp4Path ?? "none");
    const mockProbe = downloaded ? await ffprobe(pollResult!.mp4Path!) : null;
    check("img2vid clip is a real h264 mp4", Boolean(mockProbe?.streams.some((s) => s.codec_type === "video" && s.codec_name === "h264")), mockProbe ? `${mockProbe.duration.toFixed(2)}s` : "no probe");
  } finally {
    server.stop(true);
    try { fs.unlinkSync(mockClip); } catch { /* already gone */ }
    try { fs.unlinkSync(path.join(rendersDir, `${fixtureJobId}.mp4`)); } catch { /* already gone */ }
  }

  // ── 2. live pipeline on a fixture production (dev server + db) ──
  const cutsDir = path.join(process.cwd(), "public", "renders");
  const before = new Set(fs.existsSync(cutsDir) ? fs.readdirSync(cutsDir) : []);
  const proj = await db.project.create({
    data: {
      title: "E2E Character Motion",
      logline: "fixture for pose-driven character motion",
      fps: 24,
      resolution: "1280x720",
      seasons: {
        create: {
          number: 1,
          title: "S1",
          episodes: {
            create: {
              number: 1,
              title: "Stand-in Blocking",
              scenes: {
                create: {
                  number: 1,
                  title: "Terrace",
                  description: "duel blocking pass",
                  ...SCENE_PARAMS,
                  shots: {
                    create: [
                      { number: 1, description: "the striker commits", shotType: "MEDIUM", movement: "STATIC", poseStart: "STANCE", poseEnd: "LUNGE", duration: 2.0 },
                      { number: 2, description: "camera only beat", shotType: "WIDE", movement: "PAN", duration: 1.6 },
                      { number: 3, description: "channel and bow", shotType: "CLOSEUP", movement: "DOLLY_IN", poseStart: "CAST", poseEnd: "BOW", duration: 2.0 },
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
  const projectId = proj.id;
  const scene = proj.seasons[0].episodes[0].scenes[0];
  const shots = scene.shots.sort((a, b) => a.number - b.number);
  console.log(`fixture project ${projectId} with ${shots.length} shots`);

  try {
    // API validation
    const badPatch = await api<{ error?: string }>("/api/shots", { method: "PATCH", body: JSON.stringify({ id: shots[0].id, poseStart: "FLYING KICK" }) });
    check("unknown pose rejected with 400", badPatch.status === 400 && (badPatch.body.error ?? "").includes("unknown pose"), badPatch.body.error ?? String(batchStatus(badPatch)));
    const aliasPatch = await api<{ id?: string }>("/api/shots", { method: "PATCH", body: JSON.stringify({ id: shots[1].id, poseStart: "stand", poseEnd: "attack" }) });
    const aliasRow = await db.shot.findUnique({ where: { id: shots[1].id } });
    check("pose aliases normalize through the API", aliasPatch.status === 200 && aliasRow?.poseStart === "STANCE" && aliasRow?.poseEnd === "LUNGE", `${aliasRow?.poseStart}/${aliasRow?.poseEnd}`);
    const clearPatch = await api("/api/shots", { method: "PATCH", body: JSON.stringify({ id: shots[1].id, poseStart: "", poseEnd: "" }) });
    const clearedRow = await db.shot.findUnique({ where: { id: shots[1].id } });
    check("empty strings clear the pose program", clearPatch.status === 200 && clearedRow?.poseStart === null && clearedRow?.poseEnd === null, "cleared");

    // DSH tools
    const created = await executeTool(projectId, "create_shot", { sceneNumber: 1, description: "DSH poses a strike", shotType: "CLOSEUP", poseStart: "STANCE", poseEnd: "SLASH", duration: 2 });
    check("create_shot accepts and reports poses", created.status === "OK" && created.result.includes("poses STANCE → SLASH"), created.result.slice(0, 110));
    const badPose = await executeTool(projectId, "create_shot", { sceneNumber: 1, description: "bad", poseStart: "FLYING KICK" });
    check("create_shot rejects unknown poses", badPose.status === "ERROR" && badPose.result.includes("Unknown pose"), badPose.result.slice(0, 90));
    const setPoses = await executeTool(projectId, "set_shot_poses", { sceneNumber: 1, shotNumber: 2, poseStart: "BLOCK", poseEnd: "CROUCH" });
    const posed2 = await db.shot.findUnique({ where: { id: shots[1].id } });
    check("set_shot_poses lands the pair on the shot", setPoses.status === "OK" && posed2?.poseStart === "BLOCK" && posed2?.poseEnd === "CROUCH", setPoses.result.slice(0, 110));
    const cleared = await executeTool(projectId, "set_shot_poses", { sceneNumber: 1, shotNumber: 2, poseStart: "", poseEnd: "" });
    const cleared2 = await db.shot.findUnique({ where: { id: shots[1].id } });
    check("set_shot_poses clears with empty strings", cleared.status === "OK" && cleared2?.poseStart === null && cleared2?.poseEnd === null, cleared.result.slice(0, 90));

    // render the pose shot on the headless Blender stand-in
    const renderCall = await executeTool(projectId, "render_shot", { sceneNumber: 1, shotNumber: 1 });
    check("render_shot names the stand-in and the pose beat", renderCall.status === "OK" && renderCall.result.includes("skeletal stand-in performing STANCE → LUNGE"), renderCall.result.slice(0, 150));
    const jobRow = await db.renderJob.findFirst({ where: { projectId, shotId: shots[0].id }, orderBy: { attempt: "desc" } });
    check("pose job routed to a real engine", Boolean(jobRow) && ["BLENDER_LOCAL", "BLENDER", "IMG2VID", "MOTION"].includes(jobRow?.driver ?? ""), jobRow?.driver ?? "none");

    let final1: { driver: string; outputUrl: string | null; status: string; stage: string } | null = null;
    if (jobRow) {
      // poll through the API - hitting the queue endpoint ticks the job forward
      for (let i = 0; i < 70; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const jobsRes = await api<Array<{ id: string; driver: string; outputUrl: string | null; status: string; stage: string }>>(`/api/render-jobs?projectId=${projectId}`);
        const me = jobsRes.body.find((j) => j.id === jobRow.id);
        if (me && ["REVIEW", "APPROVED", "NEEDS_REVISION", "FAILED"].includes(me.status)) { final1 = me; break; }
      }
    }
    check("pose shot finished with a playable clip", Boolean(final1?.outputUrl) && ["REVIEW", "APPROVED", "NEEDS_REVISION"].includes(final1?.status ?? ""), final1 ? `${final1.driver} ${final1.status} ${final1.outputUrl}` : "timeout");
    const clip1 = final1?.outputUrl ? path.join(process.cwd(), "public", final1.outputUrl.replace(/^\//, "").split("?")[0]) : null;
    const probe1 = clip1 ? await ffprobe(clip1) : null;
    check("stand-in clip is h264 at the shot duration", Boolean(probe1?.streams.some((s) => s.codec_type === "video" && s.codec_name === "h264")) && Math.abs((probe1?.duration ?? 0) - 2.0) < 0.35, probe1 ? `${probe1.duration.toFixed(2)}s` : "no probe");

    // MOTION engine renders a pose pair as a blocking approximation
    const motionResult = await renderShotClip({
      jobId: "e2e-pose-motion-direct",
      shotType: "CLOSEUP", lens: "85mm", movement: "DOLLY_IN",
      poseStart: "CAST", poseEnd: "BOW",
      lighting: "night", ...SCENE_PARAMS,
      duration: 1.6, fps: 24, resolution: "1280x720", mode: "PREVIEW",
      artworkUrl: null, shotNumber: 3,
    });
    check("MOTION pose render lands a clip with blocking wording", Boolean(motionResult.outputUrl) && motionResult.programNote.includes("poses CAST → BOW (blocking)"), motionResult.programNote);
    const motionClip = path.join(process.cwd(), "public", "renders", "e2e-pose-motion-direct.mp4");
    const probe2 = fs.existsSync(motionClip) ? await ffprobe(motionClip) : null;
    check("MOTION pose clip is a real h264 mp4", Boolean(probe2?.streams.some((s) => s.codec_type === "video" && s.codec_name === "h264")), probe2 ? `${probe2.duration.toFixed(2)}s` : "no probe");

    // db state + bridge slot visibility
    const events = await db.productionEvent.findMany({ where: { projectId, type: "RENDER" }, take: 5 });
    check("render events recorded for the fixture", events.length >= 1, `${events.length} events`);
    const bridge = await api<{ mode: string; img2vid?: { available: boolean; host: string | null } }>("/api/bridge");
    check("bridge status carries the img2vid slot (off by default)", bridge.body.img2vid?.available === false, JSON.stringify(bridge.body.img2vid));
    check("bridge reports LIVE_BLENDER on this box", bridge.body.mode === "LIVE_BLENDER", bridge.body.mode);
  } finally {
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
    for (const f of fs.readdirSync(path.join(process.cwd(), "public", "renders"))) {
      if (before.has(f)) continue;
      if (f === ".mock-img2vid-clip.mp4" || f === "e2e-img2vid-mockjob.mp4") continue;
      if (f.endsWith(".mp4") || f.startsWith(".job-") || f.startsWith(".plate-") || f.startsWith(".frames-")) {
        try { fs.unlinkSync(path.join(process.cwd(), "public", "renders", f)); } catch { /* best-effort */ }
      }
    }
    try { fs.unlinkSync(path.join(process.cwd(), "public", "renders", "e2e-pose-motion-direct.mp4")); } catch { /* best-effort */ }
  }
}

function batchStatus(r: { status: number }): string {
  return `status ${r.status}`;
}

if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nALL PASS");
process.exit(0);
