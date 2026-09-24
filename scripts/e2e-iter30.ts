// E2E: stand-in rig upgrade (faces/hands) + universe-facts vision checks.
// Steps:
//   plan - pure checks: the v3.2 bridge rig (POSE_FACE coverage, eased
//          face channels, grip/point/blink mapping) verified by the real
//          python module, the rig report + face/hand construction in the
//          worker source, DSH's two new tools + doctrine + context line,
//          the universe-facts API surface on disk.
//   tool - live pipeline: facts CRUD + DSH add_universe_fact +
//          context listing, real panel art, the REAL vision fact check
//          (per-fact holds/confidence verdicts persisted as FACT_*
//          events), DSH check_universe_facts wording, the
//          confidence-ranked re-render queue (worst first, low
//          confidence excluded), the re-render + re-check client flow
//          replacing prior verdicts, a real BLENDER_LOCAL render of a
//          STANCE -> POINT program through the v3.2 rig (h264 clip +
//          rig report + extracted frames), and the in-Blender rig probe
//          (brow mirror, index extension, blade follow-through, all 13
//          poses driving the rig without error).
//          Every artifact is removed at the end.
import { executeTool, TOOL_DEFS } from "@/lib/dsh/tools";
import { tickRenderJob } from "@/lib/engine/render";
import { UNIVERSE_QUEUE_THRESHOLD, UNIVERSE_EVENT_KINDS } from "@/lib/universe-facts";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
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

function ffprobe(file: string): Promise<{ duration: number; streams: Array<{ codec_type: string; codec_name: string }> } | null> {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => {
      if (code !== 0) return resolve(null);
      try {
        const j = JSON.parse(out) as { streams: Array<{ codec_type: string; codec_name: string }>; format: { duration: string } };
        resolve({ duration: Number(j.format.duration ?? 0), streams: j.streams });
      } catch {
        resolve(null);
      }
    });
  });
}

function extractFrame(file: string, atSec: number, out: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(atSec), "-i", file, "-frames:v", "1", out], { stdio: ["ignore", "ignore", "ignore"] });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0 && fs.existsSync(out)));
  });
}

const BLENDER_BIN = "/home/z/blender-4.3.2-linux-x64/blender";

// the in-Blender rig probe: build the v3.2 figure for real, drive it,
// and report the face/hand state as JSON (no render, ~seconds)
const RIG_PROBE = `
import sys, json, math
sys.path.insert(0, "bridges/blender")
import animeos_bridge as B
import bpy
scn = bpy.context.scene
body = bpy.data.materials.new("Body"); body.use_nodes = True
blade_m = bpy.data.materials.new("Blade"); blade_m.use_nodes = True
fig = B.build_stand_in_figure(bpy, scn, body, blade_m)
deg = math.degrees
out = {}
# POINT at t=1.0: index extended, others curled, brows mirrored +, no blade lag at rest
B.apply_pose(fig, "STANCE", "POINT", 1.0, 1.9)
out["browL"] = deg(fig["browL"].rotation_euler.y)
out["browR"] = deg(fig["browR"].rotation_euler.y)
out["eyeScaleZ"] = fig["eyeL"].scale.z
out["mouthScaleZ"] = fig["mouth"].scale.z
r_index = next(p for p, ix in fig["rFingers"] if ix)
r_other = next(p for p, ix in fig["rFingers"] if not ix)
out["indexCurl"] = deg(r_index.rotation_euler.x)
out["otherCurl"] = deg(r_other.rotation_euler.x)
out["thumbCurl"] = deg(fig["rThumb"].rotation_euler.x)
out["bladeRest"] = deg(fig["blade"].rotation_euler.x)
# midpoint: the blade follow-through leans against the swing direction
B.apply_pose(fig, "STANCE", "POINT", 0.5, 1.3)
out["bladeMid"] = deg(fig["blade"].rotation_euler.x)
# every pose in the vocabulary drives the rig without error
poses = list(B.POSE_JOINTS.keys())
ok_all = True
for end in poses:
    try:
        B.apply_pose(fig, "STANCE", end, 0.5, 1.3)
        B.apply_pose(fig, end, end, 1.0, 0.05)  # blink window eye squash
    except Exception:
        ok_all = False
out["allPosesDriveRig"] = ok_all
out["poseCount"] = len(poses)
print("RIG_JSON:" + json.dumps(out))
`;

// ─────────────────────────────────────────────────────────────
if (step === "plan") {
  // ── the v3.2 bridge rig, verified by the real python module ──
  const py = spawnSync("python3", ["-c", `
import sys
sys.path.insert(0, "bridges/blender")
import animeos_bridge as B
assert set(B.POSE_FACE.keys()) == set(B.POSE_JOINTS.keys()), "face table must cover the vocabulary"
for k, row in B.POSE_FACE.items():
    assert len(B.normalize_face_row(row)) == 7, k
s, e = B.lerp_face("STANCE", "LUNGE", 0.0), B.lerp_face("STANCE", "LUNGE", 1.0)
assert s == B.face_row("STANCE") and e == B.face_row("LUNGE")
m = B.lerp_face("STANCE", "LUNGE", 0.5)
assert abs(m[0] - (-12.5)) < 1e-9 and abs(m[2] - 0.45) < 1e-9, m
assert B.finger_curl(0.1, 1.0, True) == 0.0
assert abs(B.finger_curl(0.1, 1.0, False) - 7.8) < 1e-9
assert abs(B.finger_curl(1.0, 0.0, False) - 78.0) < 1e-9
assert abs(B.thumb_curl(1.0) - 46.0) < 1e-9
assert B.blink_openness(0.05, 1.0) < 0.1 and B.blink_openness(1.3, 1.0) == 1.0
assert B.eye_scale(1.5) == 1.2 and B.eye_scale(0.0) == 0.12
assert abs(B.mouth_scale(1.0) - 1.7) < 1e-9 and abs(B.mouth_scale(0.0) - 0.3) < 1e-9
assert B.face_row("ATTACK") == B.face_row("LUNGE")
assert B.face_row("NOT_A_POSE") == B.face_row("STANCE")
print("PY_OK")
`], { cwd: process.cwd(), encoding: "utf-8" });
  check("bridge face/hand module passes the pure-function suite", py.status === 0 && py.stdout.includes("PY_OK"), py.stderr.slice(0, 200));

  const workerSrc = fs.readFileSync(path.join(process.cwd(), "bridges", "blender", "animeos_bridge.py"), "utf-8");
  check("worker builds eyes, brows and mouth", workerSrc.includes("EyeL") && workerSrc.includes("BrowL") && workerSrc.includes("MouthMesh"), "face construction");
  check("worker builds palms, fingers and thumbs", workerSrc.includes('prefix + "Palm"') && workerSrc.includes('prefix + ("Index"') && workerSrc.includes('prefix + "Thumb"'), "hand construction");
  check("apply_pose drives the face and finger rig", workerSrc.includes("blink_openness(t_sec, eye)") && workerSrc.includes('figure["browL"]') && workerSrc.includes("finger_curl(grip"), "apply_pose");
  check("worker reports the v3.2 rig in its state", workerSrc.includes('"version": "v3.2"') && workerSrc.includes('"fingers": 10'), "rig report");

  // ── DSH surface ──
  check("add_universe_fact is registered", TOOL_DEFS.some((t) => t.name === "add_universe_fact" && t.args.text && t.args.category), "tool def");
  check("check_universe_facts is registered", TOOL_DEFS.some((t) => t.name === "check_universe_facts" && t.args.sceneNumber !== undefined), "tool def");
  check("the registry grew to 36 tools", TOOL_DEFS.length === 36, String(TOOL_DEFS.length));
  const promptsSrc = fs.readFileSync(path.join(process.cwd(), "src", "lib", "dsh", "prompts.ts"), "utf-8");
  check("doctrine teaches the universe-facts loop", promptsSrc.includes("add_universe_fact") && promptsSrc.includes("check_universe_facts") && promptsSrc.includes("re-render queue"), "doctrine");

  // ── thresholds + API surface ──
  check("queue threshold is 0.6", UNIVERSE_QUEUE_THRESHOLD === 0.6, String(UNIVERSE_QUEUE_THRESHOLD));
  check("verdicts land as FACT_HELD / FACT_BROKEN", UNIVERSE_EVENT_KINDS.join(",") === "FACT_HELD,FACT_BROKEN", UNIVERSE_EVENT_KINDS.join(","));
  for (const p of ["src/app/api/universe-facts/route.ts", "src/app/api/universe-facts/[id]/route.ts", "src/app/api/universe-facts/check/route.ts"]) {
    check(`route exists: ${p}`, fs.existsSync(path.join(process.cwd(), p)), "on disk");
  }
  const viewSrc = fs.readFileSync(path.join(process.cwd(), "src", "components", "views", "continuity-view.tsx"), "utf-8");
  check("continuity view mounts the universe panel", viewSrc.includes("Universe-facts vision checks") && viewSrc.includes("UniverseFactsPanel"), "panel");
  check("FACT_* events have kind colors", viewSrc.includes("FACT_BROKEN") && viewSrc.includes("FACT_HELD"), "colors");
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  const rendersDir = path.join(process.cwd(), "public", "renders");
  const panelsDir = path.join(process.cwd(), "public", "panels");
  const sheetsDir = path.join(process.cwd(), "public", "sheets");
  const beforeFiles = {
    renders: new Set(fs.existsSync(rendersDir) ? fs.readdirSync(rendersDir) : []),
    panels: new Set(fs.existsSync(panelsDir) ? fs.readdirSync(panelsDir) : []),
    sheets: new Set(fs.existsSync(sheetsDir) ? fs.readdirSync(sheetsDir) : []),
  };

  const proj = await db.project.create({
    data: {
      title: "Rig and Facts E2E",
      logline: "stand-in rig upgrade + universe-facts vision checks",
      seasons: {
        create: {
          number: 1,
          title: "S1",
          episodes: {
            create: {
              number: 1,
              title: "Terrace",
              scenes: {
                create: {
                  number: 1,
                  title: "Cloud Terrace",
                  description: "a rain-slick terrace above the cloud sea, two moons overhead",
                  fogDensity: 0.4, lightningIntensity: 0.3, energyIntensity: 0.5, cameraDistance: 1.0, rimLightIntensity: 0.5,
                  shots: {
                    create: [
                      { number: 1, description: "Lin Yue channels spirit energy at the terrace edge", shotType: "CLOSEUP", movement: "STATIC", duration: 2 },
                      { number: 2, description: "Lin Yue snaps into the duel under the two moons", shotType: "MEDIUM", movement: "DOLLY_IN", duration: 2 },
                      { number: 3, description: "the empty terrace after the storm", shotType: "WIDE", movement: "STATIC", duration: 3 },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      characters: {
        create: [
          { name: "Lin Yue", role: "PROTAGONIST" },
          { name: "Chen Hao", role: "RIVAL" },
        ],
      },
    },
    include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } } },
  });
  const projectId = proj.id;
  const shots = proj.seasons[0].episodes[0].scenes[0].shots.sort((a, b) => a.number - b.number);
  console.log(`fixture project ${projectId} with ${shots.length} shots`);

  try {
    // ── 1. facts CRUD through the API ──
    const post1 = await api<{ id: string; text: string; source: string; active: boolean }>("/api/universe-facts", {
      method: "POST", body: JSON.stringify({ projectId, text: "Lin Yue's blade emits a cyan glow whenever spirit energy channels through it", category: "PROP" }),
    });
    check("POST creates a USER fact", post1.status === 200 && post1.body.source === "USER" && post1.body.active === true, post1.body.text?.slice(0, 60));
    const factBlade = post1.body.id;
    const post2 = await api<{ id: string }>("/api/universe-facts", {
      method: "POST", body: JSON.stringify({ projectId, text: "The Cloud Terrace arena sits under two moons in the night sky", category: "LOCATION" }),
    });
    check("second fact lands (LOCATION)", post2.status === 200 && Boolean(post2.body.id), "ok");
    const factMoons = post2.body.id;
    const postBad = await api<{ error?: string }>("/api/universe-facts", { method: "POST", body: JSON.stringify({ projectId, text: "" }) });
    check("empty fact text is rejected", postBad.status === 400, postBad.body.error ?? "ok");

    // DSH authoring
    const dshFact = await executeTool(projectId, "add_universe_fact", { text: "Chen Hao's iron half-mask covers the left side of his face", category: "CHARACTER" });
    check("DSH add_universe_fact registers canon", dshFact.status === "OK" && dshFact.result.includes("CHARACTER") && dshFact.result.includes("active"), dshFact.result.slice(0, 120));
    const dshFactBad = await executeTool(projectId, "add_universe_fact", { text: "" });
    check("DSH rejects empty fact text", dshFactBad.status === "ERROR", dshFactBad.result.slice(0, 80));

    // ── 2. the panel data feed ──
    const feed = await api<{ facts: Array<{ id: string; text: string; active: boolean }>; queue: unknown[]; shots: Array<{ shotId: string; hasArt: boolean }> }>(`/api/universe-facts?projectId=${projectId}`);
    check("GET lists the facts and the shot picker", feed.status === 200 && feed.body.facts.length === 3 && feed.body.shots.length === 3, `facts=${feed.body.facts.length} shots=${feed.body.shots.length}`);
    check("re-render queue starts empty", feed.body.queue.length === 0, String(feed.body.queue.length));

    // toggle: deactivating hides the fact from checks
    const toggle = await api<{ active: boolean }>(`/api/universe-facts/${factBlade}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
    check("PATCH deactivates a fact", toggle.status === 200 && toggle.body.active === false, "ok");
    const feed2 = await api<{ facts: Array<{ id: string; active: boolean }> }>(`/api/universe-facts?projectId=${projectId}`);
    check("deactivated fact still listed but inactive", feed2.body.facts.find((f) => f.id === factBlade)?.active === false, "ok");
    await api(`/api/universe-facts/${factBlade}`, { method: "PATCH", body: JSON.stringify({ active: true }) });

    // ── 3. context carries the facts ──
    const ctx = await executeTool(projectId, "get_production_context", {});
    check("context lists universeFacts", ctx.status === "OK" && ctx.result.includes("universeFacts") && ctx.result.includes("two moons"), "context");

    // ── 4. real panel art + the REAL vision fact check ──
    const art = await api<{ artworkUrl?: string; error?: string }>("/api/panel-art", {
      method: "POST", body: JSON.stringify({ shotId: shots[1].id, format: "MANHUA" }),
    });
    check("panel art generated for shot 2", art.status === 200 && Boolean(art.body.artworkUrl), art.body.error ?? "ok");

    const checkRes = await api<{ error?: string; result?: { shotId: string; shotRef: string; verdicts: Array<{ factId: string; holds: boolean; confidence: number; note: string }>; broken: number; summary: string } }>("/api/universe-facts/check", {
      method: "POST", body: JSON.stringify({ shotId: shots[1].id }),
    });
    check("vision fact check returns a verdict", checkRes.status === 200 && Boolean(checkRes.body.result), checkRes.body.error ?? checkRes.body.result?.summary ?? "no result");
    const r = checkRes.body.result;
    check("verdict covers every active fact by id", Boolean(r && Array.isArray(r.verdicts) && r.verdicts.length >= 3 && r.verdicts.every((v) => typeof v.factId === "string" && v.confidence >= 0 && v.confidence <= 1)), r ? `${r.verdicts.length} verdicts` : "none");
    check("verdict names the shot ref", r?.shotRef === "E1 Sc1 S002", r?.shotRef ?? "none");
    const events = await db.continuityEvent.findMany({ where: { projectId, kind: { in: ["FACT_HELD", "FACT_BROKEN"] } } });
    check("verdicts persist as FACT_* events with the shot tag", events.length >= 3 && events.every((ev) => ev.description.startsWith(`[universe ${shots[1].id}]`)), `${events.length} events`);
    const sevOk = events.every((ev) => {
      const m = ev.description.match(/confidence (0\.\d+)/);
      const conf = m ? Number(m[1]) : 0;
      if (ev.kind === "FACT_HELD") return ev.severity === "INFO";
      return ev.severity === (conf >= UNIVERSE_QUEUE_THRESHOLD ? "WARNING" : "INFO");
    });
    check("severity follows kind + confidence", sevOk && events.some((ev) => ev.kind === "FACT_HELD"), events.map((e) => `${e.kind}:${e.severity}`).join(","));

    // ── 5. DSH check_universe_facts wording ──
    const dshCheck = await executeTool(projectId, "check_universe_facts", { sceneNumber: 1, shotNumber: 2 });
    check("DSH check_universe_facts speaks the verdict", dshCheck.status === "OK" && (dshCheck.result.includes("HELD") || dshCheck.result.includes("BROKEN")) && dshCheck.result.includes("conf"), dshCheck.result.slice(0, 150));
    const dshCheckBad = await executeTool(projectId, "check_universe_facts", { sceneNumber: 1, shotNumber: 3 });
    check("DSH check on art-less shot reports why", dshCheckBad.status === "ERROR" && dshCheckBad.result.includes("no panel art"), dshCheckBad.result.slice(0, 110));

    // ── 6. the confidence-ranked re-render queue ──
    // manufactured verdicts: confident breaks on shots 1 (0.83) and 2
    // (0.71), plus a low-confidence break that must NOT enter the queue
    await db.continuityEvent.create({ data: { projectId, entityType: "UNIVERSE_FACT", entityName: "fact A for shot one", kind: "FACT_BROKEN", episodeNumber: 1, description: `[universe ${shots[0].id}] (E1 Sc1 S001) confidence 0.83 - only one moon visible`, severity: "WARNING" } });
    await db.continuityEvent.create({ data: { projectId, entityType: "UNIVERSE_FACT", entityName: "fact B for shot two", kind: "FACT_BROKEN", episodeNumber: 1, description: `[universe ${shots[1].id}] (E1 Sc1 S002) confidence 0.71 - blade glows red instead of cyan`, severity: "WARNING" } });
    await db.continuityEvent.create({ data: { projectId, entityType: "UNIVERSE_FACT", entityName: "uncertain fact", kind: "FACT_BROKEN", episodeNumber: 1, description: `[universe ${shots[0].id}] (E1 Sc1 S001) confidence 0.30 - cannot judge from this panel`, severity: "INFO" } });
    const queue = await api<{ queue: Array<{ shotId: string; worst: number; items: Array<{ factText: string; confidence: number }> }> }>(`/api/universe-facts?projectId=${projectId}`);
    check("confident breaks feed the queue", queue.body.queue.length === 2, JSON.stringify(queue.body.queue.map((q) => q.worst)));
    check("queue ranks worst confidence first", queue.body.queue.length === 2 && queue.body.queue[0].worst < queue.body.queue[1].worst, queue.body.queue.map((q) => q.worst.toFixed(2)).join(" < "));
    check("low-confidence breaks stay out of the queue", queue.body.queue.every((q) => q.items.every((it) => it.confidence >= UNIVERSE_QUEUE_THRESHOLD)), "threshold holds");
    check("queue items carry the violated fact text", queue.body.queue.some((q) => q.items.some((it) => it.factText === "fact A for shot one")), "fact text");

    // ── 7. re-render + re-check replaces prior verdicts ──
    const art1 = await api<{ artworkUrl?: string; error?: string }>("/api/panel-art", {
      method: "POST", body: JSON.stringify({ shotId: shots[0].id, format: "MANHUA" }),
    });
    check("panel re-render succeeds (queue button flow)", art1.status === 200 && Boolean(art1.body.artworkUrl), art1.body.error ?? "ok");
    const recheck = await api<{ error?: string; result?: { verdicts: unknown[] } }>("/api/universe-facts/check", {
      method: "POST", body: JSON.stringify({ shotId: shots[0].id }),
    });
    check("re-check after re-render returns fresh verdicts", recheck.status === 200 && Boolean(recheck.body.result), recheck.body.error ?? "ok");
    const shot1Events = await db.continuityEvent.findMany({ where: { projectId, kind: { in: ["FACT_HELD", "FACT_BROKEN"] }, description: { startsWith: `[universe ${shots[0].id}]` } } });
    check("fresh check replaces the manufactured verdicts", shot1Events.length >= 3 && shot1Events.every((ev) => !ev.description.includes("only one moon visible") || ev.createdAt > new Date(Date.now() - 60_000)), `${shot1Events.length} events`);
    const queue2 = await api<{ queue: Array<{ shotId: string; items: Array<{ factText: string }> }> }>(`/api/universe-facts?projectId=${projectId}`);
    check("re-checked shot's manufactured verdict left the queue", !queue2.body.queue.some((q) => q.items.some((it) => it.factText === "fact A for shot one")), `${queue2.body.queue.length} current row(s), shot two's is expected until its own re-check`);

    // ── 8. the v3.2 rig renders a real STANCE -> POINT clip ──
    const inBlender = spawnSync(BLENDER_BIN, ["-b", "--python-expr", RIG_PROBE], { cwd: process.cwd(), encoding: "utf-8", timeout: 120_000 });
    const rigLine = (inBlender.stdout.split("\n").find((l) => l.startsWith("RIG_JSON:")) ?? "").replace("RIG_JSON:", "");
    let rig: Record<string, number | boolean> | null = null;
    try { rig = JSON.parse(rigLine) as Record<string, number | boolean>; } catch { rig = null; }
    check("in-Blender probe drives the v3.2 rig", Boolean(rig?.allPosesDriveRig) && rig?.poseCount === 13, rig ? `${rig.poseCount} poses` : (inBlender.stderr.slice(-160) || "no output"));
    check("POINT extends the index and curls the rest", rig?.indexCurl === 0 && (rig?.otherCurl ?? 0) > 5 && (rig?.thumbCurl ?? 0) > 20, rig ? `index=${rig.indexCurl} other=${rig.otherCurl} thumb=${rig.thumbCurl}` : "none");
    check("brows mirror their tilt", Math.abs((rig?.browL ?? 0) + (rig?.browR ?? 0)) < 1e-6 && (rig?.browL ?? 0) > 0, rig ? `${rig.browL}/${rig.browR}` : "none");
    check("face channels apply (eyes open, mouth mid)", (rig?.eyeScaleZ ?? 0) > 0.9 && (rig?.mouthScaleZ ?? 0) > 0.7, rig ? `eye=${rig.eyeScaleZ} mouth=${rig.mouthScaleZ}` : "none");
    check("blade follow-through leans into the swing", (rig?.bladeMid ?? 0) < (rig?.bladeRest ?? 0) - 2, rig ? `mid=${rig.bladeMid} rest=${rig.bladeRest}` : "none");

    // pose the shot and render through the real driver chain
    const patch = await api(`/api/shots`, { method: "PATCH", body: JSON.stringify({ id: shots[0].id, poseStart: "STANCE", poseEnd: "POINT" }) });
    check("shot carries the STANCE -> POINT program", patch.status === 200, "ok");
    const rendered = await executeTool(projectId, "render_shot", { sceneNumber: 1, shotNumber: 1, mode: "PREVIEW" });
    check("render_shot names the articulated stand-in", rendered.status === "OK" && rendered.result.includes("face + hands"), rendered.result.slice(0, 130));
    const job = await db.renderJob.findFirst({ where: { projectId, shotId: shots[0].id }, orderBy: { createdAt: "desc" } });
    check("job routes to the local Blender worker", job?.driver === "BLENDER_LOCAL", job?.driver ?? "none");
    let final = { status: "", outputUrl: null as string | null, stage: "", progress: 0 };
    if (job) {
      const deadline = Date.now() + 6 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((res) => setTimeout(res, 5000));
        const ticked = await tickRenderJob(job.id);
        final = { status: ticked.status, outputUrl: ticked.outputUrl, stage: ticked.stage, progress: ticked.progress };
        if (ticked.status !== "RENDERING") break;
      }
    }
    check("v3.2 rig clip renders to REVIEW", final.status === "REVIEW", `${final.status} :: ${final.stage}`);
    check("clip lands in the renders dir", Boolean(final.outputUrl?.startsWith("/renders/")), final.outputUrl ?? "none");
    const clipPath = path.join(process.cwd(), "public", final.outputUrl ?? "none");
    const probe = final.outputUrl ? await ffprobe(clipPath) : null;
    check("clip is a real h264 mp4", Boolean(probe?.streams.some((s) => s.codec_type === "video" && s.codec_name === "h264")), probe ? `${probe.duration.toFixed(2)}s` : "no probe");
    check("clip carries the shot duration", Math.abs((probe?.duration ?? 0) - 2) < 0.4, String(probe?.duration));
    const stateFile = path.join(rendersDir, `.job-${job?.id ?? "none"}.json`);
    let rigReport: { rig?: { version?: string; face?: boolean; hands?: boolean; fingers?: number; faceChannels?: number } } | null = null;
    try { rigReport = JSON.parse(fs.readFileSync(stateFile, "utf-8")) as typeof rigReport; } catch { rigReport = null; }
    check("worker reports the v3.2 rig in its final state", rigReport?.rig?.version === "v3.2" && rigReport?.rig?.face === true && rigReport?.rig?.hands === true && rigReport?.rig?.fingers === 10 && rigReport?.rig?.faceChannels === 7, JSON.stringify(rigReport?.rig ?? null));
    // frames for the visual pass (kept in a scratch dir so the cleanup
    // sweep leaves them for the operator to read, removed afterwards)
    const framesDir = path.join(process.cwd(), "scripts", ".e2e30-frames");
    fs.mkdirSync(framesDir, { recursive: true });
    const frameA = path.join(framesDir, "frame-hold.png");
    const frameB = path.join(framesDir, "frame-point.png");
    const gotA = await extractFrame(clipPath, 0.2, frameA);
    const gotB = await extractFrame(clipPath, 1.85, frameB);
    check("frames extracted for the visual pass", gotA && gotB, `${gotA}/${gotB}`);
    try { fs.unlinkSync(stateFile); } catch { /* cleanup */ }
    if (job) await db.renderJob.delete({ where: { id: job.id } }).catch(() => {});
  } finally {
    // ── cleanup: fixture project + artifacts ──
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
    const removeIfNew = (dir: string, before: Set<string>) => {
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir)) {
        if (!before.has(f)) {
          try { fs.unlinkSync(path.join(dir, f)); } catch { /* already gone */ }
        }
      }
    };
    removeIfNew(rendersDir, beforeFiles.renders);
    removeIfNew(panelsDir, beforeFiles.panels);
    removeIfNew(sheetsDir, beforeFiles.sheets);
  }
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
