# AnimeOS ⇄ Blender Live Bridge Add-on (v3 - worker-pool animated sequences)
#
# One script, three run modes:
#   SERVER  blender -b -P animeos_bridge.py -- --port 8100
#           (or open it from Blender's Scripting tab and Run - the HTTP
#           server lives on a daemon thread and Blender stays open)
#           plain python3 animeos_bridge.py -- --port 8100 also works:
#           the server itself does NOT need bpy.
#   WORKER  spawned by the server per job:
#           blender -b -P animeos_bridge.py -- --worker --job <tmp.json>
#
# Endpoints (bound to 127.0.0.1 only):
#   GET  /status                 → {"ok", "blender_version", "scene", "busy"}
#   GET  /progress?job_id=...    → {"progress", "stage", "done", "mp4_base64"?}
#   POST /render                 → submit an AnimeOS job
#   POST /ping                   → {"ok": true}
#
# The /render payload comes from AnimeOS's render pipeline:
# {
#   "jobId": "...",
#   "shot":  {"number":3,"description":"...","shotType":"CLOSEUP","lens":"50mm",
#             "movement":"DOLLY_IN","lighting":"...","duration":4.0},
#   "scene": {"number":12,"title":"...","fogDensity":0.45,"lightningIntensity":0.55,
#             "energyIntensity":0.6,"cameraDistance":1.0,"rimLightIntensity":0.5},
#   "project": {"title":"...","visualStyle":"DONGHUA","resolution":"1920x1080","fps":24},
#   "mode": "PREVIEW"
# }
#
# WHY WORKERS: bpy rendering holds the Python GIL for whole frames, so a
# render running on the server's main thread would starve the HTTP
# threads and /progress would freeze. v3 runs every job in a FRESH
# headless Blender subprocess: the server stays responsive, progress is
# exchanged through a small JSON file the worker rewrites per frame, a
# crashed worker can never poison the server, and every job gets a
# clean scene.
#
# v3 renders REAL ANIMATED SHOTS, not stills: the worker builds a small
# 3D stand-in scene (rocky terrace, emissive blade, moon/rim/energy
# lights), drives a CAMERA RIG through the shot's movement grammar frame
# by frame (orbit / dolly / pan / tracking / crane / tilt / static),
# applies the AnimeOS scene parameters (fog-colored world, deterministic
# lightning strobes, emission energy), renders the range with Cycles
# CPU and encodes an h264 clip (system ffmpeg when present, Blender's
# own FFMPEG writer otherwise). The finished clip flows back to AnimeOS
# as mp4_base64 and lands in public/renders/{jobId}.mp4.

import argparse
import base64
import json
import math
import os
import shutil
import subprocess
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT_DEFAULT = 8100

# ─── shared camera grammar + scene DNA (imported by both modes) ──

SHOT_FRAMING = {
    # AnimeOS shot type → (camera distance multiplier, lens mm, height offset)
    "ESTABLISHING":     (2.6, 24, 1.6),
    "WIDE":             (1.8, 35, 1.4),
    "LOW_ANGLE":        (1.2, 35, 0.4),
    "MEDIUM":           (1.0, 50, 1.2),
    "CLOSEUP":          (0.55, 85, 1.5),
    "EXTREME_CLOSEUP":  (0.28, 100, 1.55),
}

def fnv1a(s):
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h

def mulberry32(seed):
    cell = [seed & 0xFFFFFFFF]

    def rng():
        cell[0] = (cell[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = cell[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61)))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rng

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def render_dir():
    candidates = [
        os.path.join(os.getcwd(), "public", "renders"),
        os.path.join(os.path.expanduser("~"), "animeos_renders"),
    ]
    for d in candidates:
        if os.path.isdir(os.path.dirname(d)):
            try:
                os.makedirs(d, exist_ok=True)
                return d
            except OSError:
                continue
    d = candidates[1]
    os.makedirs(d, exist_ok=True)
    return d

def lightning_windows(job_id, lightning, duration_sec):
    """Deterministic flash windows (seconds) - same DNA as the MOTION
    engine's planner so both engines strobe alike for the same job."""
    if lightning <= 0.03:
        return []
    rng = mulberry32(fnv1a(job_id))
    windows = []
    for _ in range(1 + int(lightning * 2)):
        windows.append((0.12 + rng() * 0.74, 0.08 + 0.1 * lightning, 0.35 + 0.35 * lightning))
    return windows

def camera_pose(shot_payload, scene_payload, t):
    """Camera position + look target for progress t (0..1) through the
    shot, driven by the movement grammar."""
    dist, lens, height = SHOT_FRAMING.get(str(shot_payload.get("shotType", "MEDIUM")).upper(), SHOT_FRAMING["MEDIUM"])
    dist *= float(scene_payload.get("cameraDistance", 1.0))
    movement = str(shot_payload.get("movement") or "STATIC").upper()
    if movement not in ("ORBIT", "PAN", "TRACKING", "CRANE", "DOLLY_IN", "DOLLY_OUT", "TILT_UP", "TILT_DOWN"):
        movement = "STATIC"

    angle = 40.0
    radius = dist
    h = height
    lateral = 0.0
    target = [0.0, 0.0, height * 0.75]

    if movement == "ORBIT":
        angle = 40.0 + (t - 0.5) * 44.0
        radius = dist * (1.0 + 0.05 * math.sin(t * math.pi))
    elif movement == "DOLLY_IN":
        radius = dist * (1.0 - 0.28 * t)
    elif movement == "DOLLY_OUT":
        radius = dist * (0.72 + 0.28 * t)
    elif movement == "PAN":
        angle = 40.0 + math.sin((t - 0.5) * math.pi) * 24.0
    elif movement == "TRACKING":
        lateral = (t - 0.5) * dist * 0.42
    elif movement == "CRANE":
        h = height + 2.2 * (1.0 - t)
        radius = dist * (1.0 + 0.1 * t)
    elif movement == "TILT_UP":
        target[2] = height * (0.35 + 0.55 * t)
    elif movement == "TILT_DOWN":
        target[2] = height * (0.9 - 0.55 * t)

    rad = math.radians(angle)
    pos = [radius * math.sin(rad) + lateral, -radius * math.cos(rad), h]
    if movement == "STATIC":
        pos[2] += math.sin(t * math.pi * 2) * 0.015  # breathing lock-off
    return pos, target, lens


# ═══ WORKER MODE (runs inside a fresh headless Blender) ═══════

def worker_run(job_file):
    import bpy
    import mathutils

    with open(job_file, "r", encoding="utf-8") as fh:
        job = json.load(fh)

    payload = job.get("payload", {})
    shot = payload.get("shot", {})
    scene_p = payload.get("scene", {})
    project = payload.get("project", {})
    mode = payload.get("mode", "PREVIEW")
    job_id = job.get("jobId", "job")
    out_dir = job.get("outDir") or render_dir()

    state = {"progress": 0.02, "stage": "Blender worker: scene received", "done": False, "error": None, "mp4Path": None}

    def flush():
        tmp = job_file + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump({"jobId": job_id, **state}, fh)
        os.replace(tmp, job_file)

    def fail(msg):
        state["error"] = str(msg)
        state["stage"] = f"Blender worker: failed - {msg}"
        state["done"] = True
        flush()

    try:
        duration_sec = clamp(float(shot.get("duration", 3.0) or 3.0), 0.8, 30.0)
        fps = clamp(int(project.get("fps", 24) or 24), 1, 60)
        frames_total = max(2, round(duration_sec * fps))
        try:
            res_w, res_h = [int(v) for v in str(project.get("resolution", "1920x1080")).split("x")][:2]
        except Exception:  # noqa: BLE001
            res_w, res_h = 1920, 1080
        cap = 1280 if mode == "FINAL" else 512
        scale = min(1.0, cap / max(res_w, res_h))
        out_w = max(16, round(res_w * scale / 2) * 2)
        out_h = max(16, round(res_h * scale / 2) * 2)

        scn = bpy.context.scene

        # ── stand-in set (built fresh in this clean .blend) ──
        ground_mesh = bpy.data.meshes.new("Ground")
        ground_mesh.from_pydata([(-14, -14, 0), (14, -14, 0), (14, 14, 0), (-14, 14, 0)], [], [(0, 1, 2, 3)])
        ground_mesh.update()
        ground = bpy.data.objects.new("Ground", ground_mesh)
        scn.collection.objects.link(ground)
        mat = bpy.data.materials.new("SetMat")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.035, 0.05, 0.045, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.95
        ground.data.materials.append(mat)

        rng = mulberry32(fnv1a(job_id) or 424242)
        for i in range(9):
            size = 0.25 + rng() * 0.8
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size,
                                                  location=((rng() - 0.5) * 16, (rng() - 0.5) * 16, size * 0.35))
            rock = bpy.context.active_object
            rock.scale = (1.0, 0.8 + rng() * 0.4, 0.6 + rng() * 0.5)
            rock.data.materials.append(mat)

        bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=0.9, location=(0, 0, 0.45))
        scn.collection.objects[-1].data.materials.append(mat)

        bpy.ops.mesh.primitive_cone_add(radius1=0.14, radius2=0.0, depth=1.9, vertices=6, location=(0, 0, 1.85))
        blade = scn.collection.objects[-1]
        blade.rotation_euler = (0.05, 0.12, 0.4)
        blade_mat = bpy.data.materials.new("BladeMat")
        blade_mat.use_nodes = True
        nodes = blade_mat.node_tree.nodes
        b = nodes.get("Principled BSDF")
        if b:
            nodes.remove(b)
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs[0].default_value = (0.25, 0.95, 0.82, 1.0)
        emission.inputs[1].default_value = 2.0 + float(scene_p.get("energyIntensity", 0.6)) * 8.0
        out_node = nodes.get("Material Output")
        blade_mat.node_tree.links.new(emission.outputs[0], out_node.inputs[0])
        blade.data.materials.append(blade_mat)

        # ── AnimeOS scene params ──
        fog = float(scene_p.get("fogDensity", 0.45))
        world = bpy.data.worlds.new("AnimeOSWorld")
        scn.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes.get("Background")
        if bg:
            base = 0.04 + 0.22 * (1.0 - fog)
            bg.inputs[0].default_value = (base * 0.8, base * 0.95, base * 1.15, 1.0)
            bg.inputs[1].default_value = 1.0

        lightning = float(scene_p.get("lightningIntensity", 0.55))
        sun_data = bpy.data.lights.new("Sun", "SUN")
        sun_data.energy = 1.0 + lightning * 6.0
        sun = bpy.data.objects.new("Sun", sun_data)
        sun.rotation_euler = (math.radians(65), 0, math.radians(35))
        scn.collection.objects.link(sun)
        sun_base = sun_data.energy

        rim_e = float(scene_p.get("rimLightIntensity", 0.5))
        energy_e = float(scene_p.get("energyIntensity", 0.6))
        for i, e in enumerate((rim_e, energy_e)):
            light_data = bpy.data.lights.new(f"Fill{i}", "AREA")
            light_data.size = 4.0
            light_data.energy = 200 + e * 1800
            light = bpy.data.objects.new(f"Fill{i}", light_data)
            light.rotation_euler = (math.radians(-55), math.radians(20 * (i or -1)), 0)
            light.location = ((3.5, -4.0, 2.6) if i == 0 else (-3.0, 3.5, 3.2))
            scn.collection.objects.link(light)

        # ── render settings ──
        windows = lightning_windows(job_id, lightning, duration_sec)
        scn.render.engine = "CYCLES"
        scn.cycles.device = "CPU"
        scn.cycles.samples = 48 if mode == "FINAL" else 10
        scn.cycles.use_denoising = mode == "FINAL"
        scn.cycles.max_bounces = 0
        scn.cycles.diffuse_bounces = 0
        scn.cycles.glossy_bounces = 0
        scn.cycles.transmission_bounces = 0
        scn.cycles.transparent_max_bounces = 0
        scn.render.resolution_x = out_w
        scn.render.resolution_y = out_h
        scn.render.resolution_percentage = 100
        scn.render.image_settings.file_format = "PNG"
        scn.render.fps = fps
        scn.frame_start = 1
        scn.frame_end = frames_total

        cam_data = bpy.data.cameras.new("AnimeOSCam")
        cam = bpy.data.objects.new("AnimeOSCam", cam_data)
        scn.collection.objects.link(cam)
        scn.camera = cam

        frames_dir = os.path.join(out_dir, f".frames-{job_id}")
        os.makedirs(frames_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{job_id}.mp4")

        # ── frame loop: camera grammar + lightning strobe per frame ──
        for f in range(1, frames_total + 1):
            t = (f - 1) / max(1, frames_total - 1)
            pos, target, lens = camera_pose(shot, scene_p, t)
            cam.data.lens = lens
            cam.location = mathutils.Vector(pos)
            direction = mathutils.Vector(target) - cam.location
            cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

            t_sec = (f - 1) / fps
            boost = 0.0
            for (start, dur, alpha) in windows:
                if start <= t_sec <= start + dur:
                    boost = alpha * 9.0
                    break
            sun_data.energy = sun_base + boost

            scn.frame_set(f)
            scn.render.filepath = os.path.join(frames_dir, f"f_{f:04d}.png")
            bpy.ops.render.render(write_still=True)
            state["progress"] = 0.05 + 0.8 * (f / frames_total)
            state["stage"] = f"Blender: rendering frame {f}/{frames_total}"
            flush()

        # ── encode ──
        state["stage"] = "Blender: encoding clip"
        state["progress"] = 0.9
        flush()
        encode_ok = False
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg:
            try:
                subprocess.run(
                    [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                     "-framerate", str(fps), "-i", os.path.join(frames_dir, "f_%04d.png"),
                     "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                     "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path],
                    check=True, timeout=300,
                )
                encode_ok = os.path.exists(out_path) and os.path.getsize(out_path) > 0
            except Exception:  # noqa: BLE001
                encode_ok = False
        if not encode_ok:
            # Blender's own FFMPEG writer as the fallback
            try:
                scn.render.image_settings.file_format = "FFMPEG"
                scn.render.ffmpeg.format = "MPEG4"
                scn.render.ffmpeg.codec = "H264"
                scn.render.ffmpeg.constant_rate_factor = "HIGH"
                scn.render.ffmpeg.gopsize = 18
                scn.render.ffmpeg.audio_codec = "NONE"
                scn.render.filepath = out_path
                bpy.ops.render.render(animation=True)
                encode_ok = os.path.exists(out_path) and os.path.getsize(out_path) > 0
            except Exception:  # noqa: BLE001
                encode_ok = False

        shutil.rmtree(frames_dir, ignore_errors=True)

        if not encode_ok:
            fail("clip encoding failed")
            return
        state["progress"] = 1.0
        state["stage"] = "Blender: clip ready"
        state["mp4Path"] = out_path
        state["done"] = True
        flush()
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        fail(exc)


# ═══ SERVER MODE (plain python; bpy NOT required) ═════════════

class BridgeServer:
    def __init__(self, blender_bin):
        self.lock = threading.Lock()
        self.jobs = {}  # job_id -> {"jobFile", "mp4Cache", "done"}
        self.current = None
        self.blender_bin = blender_bin
        self.blender_version = None
        self.script_path = os.path.abspath(__file__)

    def probe_version(self):
        try:
            out = subprocess.run([self.blender_bin, "--version"], capture_output=True, text=True, timeout=20)
            first = (out.stdout or "").splitlines()
            self.blender_version = first[0].replace("Blender", "").strip() if first else "unknown"
        except Exception:  # noqa: BLE001
            self.blender_version = "unknown"

    def status(self):
        with self.lock:
            busy = self.current is not None
        return {
            "ok": True,
            "blender_version": self.blender_version or "unknown",
            "scene": "AnimeOS sequence worker pool",
            "busy": busy,
        }

    def submit(self, payload):
        job_id = str(payload.get("jobId") or f"job_{int(time.time())}")
        with self.lock:
            if self.current is not None:
                return {"error": "busy", "current_job": self.current}, 409
            self.current = job_id
            job_file = os.path.join(render_dir(), f".job-{job_id}.json")
            self.jobs[job_id] = {"jobFile": job_file, "mp4Cache": None, "done": False}
        with open(job_file, "w", encoding="utf-8") as fh:
            json.dump({"jobId": job_id, "payload": payload, "outDir": render_dir()}, fh)
        threading.Thread(target=self._run_worker, args=(job_id, job_file), daemon=True).start()
        return {"ok": True, "jobId": job_id}, 200

    def _run_worker(self, job_id, job_file):
        entry = self.jobs.get(job_id)
        try:
            cmd = [self.blender_bin, "-b", "-P", self.script_path, "--", "--worker", "--job", job_file]
            subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        finally:
            with open(job_file, "r", encoding="utf-8") as fh:
                state = json.load(fh)
            state.setdefault("done", True)
            if not state.get("done"):
                state["done"] = True
                state.setdefault("error", "worker exited unexpectedly")
            tmp = job_file + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(state, fh)
            os.replace(tmp, job_file)
            with self.lock:
                self.current = None

    def progress(self, job_id):
        entry = self.jobs.get(job_id)
        if not entry:
            return {"error": "unknown job"}, 404
        try:
            with open(entry["jobFile"], "r", encoding="utf-8") as fh:
                state = json.load(fh)
        except Exception:  # noqa: BLE001
            return {"progress": 0.0, "stage": "queued", "done": False}, 200
        out = {"progress": state.get("progress", 0.0), "stage": state.get("stage", ""), "done": bool(state.get("done"))}
        if state.get("error"):
            out["error"] = state["error"]
        if out["done"] and not out.get("error") and state.get("mp4Path"):
            if entry["mp4Cache"] is None:
                try:
                    with open(state["mp4Path"], "rb") as fh:
                        entry["mp4Cache"] = base64.b64encode(fh.read()).decode("ascii")
                except Exception:  # noqa: BLE001
                    entry["mp4Cache"] = ""
            if entry["mp4Cache"]:
                out["mp4_base64"] = entry["mp4Cache"]
        return out, 200


def run_server(port, blender_bin):
    bridge = BridgeServer(blender_bin)
    bridge.probe_version()

    class Handler(BaseHTTPRequestHandler):
        def _json(self, obj, code=200):
            body = json.dumps(obj).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path == "/status":
                self._json(bridge.status())
            elif parsed.path == "/progress":
                job_id = (parse_qs(parsed.query).get("job_id") or [""])[0]
                out, code = bridge.progress(job_id)
                self._json(out, code)
            elif parsed.path == "/ping":
                self._json({"ok": True})
            else:
                self._json({"error": "not found"}, 404)

        def do_POST(self):  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path not in ("/render", "/ping"):
                self._json({"error": "not found"}, 404)
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length) or b"{}")
            except (ValueError, json.JSONDecodeError):
                self._json({"error": "malformed JSON"}, 400)
                return
            if parsed.path == "/ping":
                self._json({"ok": True})
                return
            out, code = bridge.submit(payload)
            self._json(out, code)

        def log_message(self, fmt, *args):  # quiet
            sys.stdout.write("[animeos-bridge] " + (fmt % args) + "\n")

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"[animeos-bridge] serving on 127.0.0.1:{port} (workers via {blender_bin})", flush=True)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


def main():
    argv = sys.argv
    port = PORT_DEFAULT
    worker_job = None
    extra = argv[argv.index("--") + 1:] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=PORT_DEFAULT)
    parser.add_argument("--worker", action="store_true")
    parser.add_argument("--job", type=str, default=None)
    args, _ = parser.parse_known_args(extra)
    port = args.port

    if args.worker and args.job:
        worker_run(args.job)
        return

    # Resolve the blender binary that worker subprocesses will use:
    # inside Blender sys.executable IS the blender binary; on a plain
    # python3 server fall back to PATH / ANIMEOS_BLENDER_BIN.
    blender_bin = sys.executable if os.path.basename(sys.executable).startswith("blender") else shutil.which("blender")
    blender_bin = blender_bin or os.environ.get("ANIMEOS_BLENDER_BIN") or ""
    if blender_bin and not os.path.exists(blender_bin):
        blender_bin = ""
    if not blender_bin:
        print("[animeos-bridge] no blender binary found - set ANIMEOS_BLENDER_BIN", flush=True)
        sys.exit(1)

    run_server(port, blender_bin)


if __name__ == "__main__":
    main()
