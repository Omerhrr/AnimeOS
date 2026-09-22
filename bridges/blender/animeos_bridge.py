# AnimeOS ⇄ Blender Live Bridge Add-on
#
# Run inside Blender (GUI or headless):
#   blender -b -P animeos_bridge.py -- --port 8100
# or from Blender's Scripting tab: open + Run Script (GUI keeps serving
# while Blender stays open; the HTTP server runs on a daemon thread).
#
# Endpoints (bound to 127.0.0.1 only):
#   GET  /status                 → {"ok", "blender_version", "scene", "busy"}
#   GET  /progress?job_id=...    → {"progress", "stage", "done", "png_base64"?}
#   POST /render                 → submit an AnimeOS job (see README)
#   POST /ping                   → {"ok": true}
#
# The /render payload comes from AnimeOS's render pipeline:
# {
#   "jobId": "...",
#   "shot":  {"number":3,"description":"...","shotType":"CLOSEUP","lens":"50mm",
#             "movement":"DOLLY_IN","lighting":"..."},
#   "scene": {"number":12,"title":"...","fogDensity":0.45,"lightningIntensity":0.55,
#             "energyIntensity":0.6,"cameraDistance":1.0,"rimLightIntensity":0.5},
#   "project": {"title":"...","visualStyle":"DONGHUA","resolution":"1920x1080","fps":24},
#   "mode": "PREVIEW"
# }
#
# The add-on maps AnimeOS scene parameters onto bpy equivalents (mist/fog,
# world lightning flashes, emission energy, camera framing per shot type),
# renders one still per job into AnimeOS's public/renders directory (or
# ./animeos_renders when run elsewhere), and reports progress via /progress.

import argparse
import base64
import json
import os
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import bpy
import mathutils

# ─── job state (protected by LOCK) ────────────────────────────

LOCK = threading.Lock()
JOBS = {}  # job_id -> {"progress": float, "stage": str, "done": bool, "error": str|None, "png": str|None, "ts": float}
CURRENT = {"id": None}

RENDER_DIR_CANDIDATES = [
    os.path.join(os.getcwd(), "public", "renders"),
    os.path.join(os.path.expanduser("~"), "animeos_renders"),
]

SHOT_FRAMING = {
    # AnimeOS shot type → (camera distance multiplier, lens mm, height offset)
    "ESTABLISHING":     (2.6, 24, 1.6),
    "WIDE":             (1.8, 35, 1.4),
    "LOW_ANGLE":        (1.2, 35, 0.4),
    "MEDIUM":           (1.0, 50, 1.2),
    "CLOSEUP":          (0.55, 85, 1.5),
    "EXTREME_CLOSEUP":  (0.28, 100, 1.55),
}

STAGES = [
    (0.00, "Blender: scene received"),
    (0.10, "Blender: applying AnimeOS parameters"),
    (0.30, "Blender: lighting & atmosphere"),
    (0.55, "Blender: camera rig"),
    (0.70, "Blender: rendering frame"),
    (0.97, "Blender: encoding"),
]


def render_dir():
    for d in RENDER_DIR_CANDIDATES:
        if os.path.isdir(os.path.dirname(d)) or d.endswith(os.path.join("public", "renders")):
            try:
                os.makedirs(d, exist_ok=True)
                return d
            except OSError:
                continue
    d = RENDER_DIR_CANDIDATES[1]
    os.makedirs(d, exist_ok=True)
    return d


def set_job(job_id, **kw):
    with LOCK:
        job = JOBS.setdefault(job_id, {"progress": 0.0, "stage": "queued", "done": False, "error": None, "png": None, "ts": time.time()})
        job.update(kw)
        job["ts"] = time.time()


def get_job(job_id):
    with LOCK:
        job = JOBS.get(job_id)
        return dict(job) if job else None


# ─── AnimeOS params → bpy scene ───────────────────────────────

def apply_scene_params(scene_payload, project_payload):
    """Translate AnimeOS tunable scene parameters into bpy equivalents."""
    scn = bpy.context.scene

    # Fog / atmosphere → mist pass intensity + world volume hint
    fog = float(scene_payload.get("fogDensity", 0.45))
    world = scn.world or bpy.data.worlds.new("AnimeOS")
    scn.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        # denser fog → darker, murkier sky
        base = 0.05 + 0.25 * (1.0 - fog)
        bg.inputs[0].default_value = (base * 0.85, base, base * 1.1, 1.0)
        bg.inputs[1].default_value = 1.0

    try:  # mist pass drives compositor fog in production setups
        scn.use_mist = True
        scn.mist_start = 8.0 * (1.2 - fog)
        scn.mist_depth = 30.0 * (1.3 - fog)
    except Exception:
        pass

    # Lightning intensity → strobing sun energy (animated flicker at render time)
    lightning = float(scene_payload.get("lightningIntensity", 0.55))
    sun = next((o for o in bpy.data.objects if o.type == "LIGHT" and o.data.type == "SUN"), None)
    if not sun:
        sun_data = bpy.data.lights.new("AnimeOSSun", "SUN")
        sun = bpy.data.objects.new("AnimeOSSun", sun_data)
        scn.collection.objects.link(sun)
    sun.data.energy = 1.0 + lightning * 6.0
    sun.rotation_euler = (mathutils.radians(65), 0, mathutils.radians(35))

    # Energy intensity → rim/emission lights
    energy = float(scene_payload.get("energyIntensity", 0.6))
    rim = float(scene_payload.get("rimLightIntensity", 0.5))
    for i, (name, e) in enumerate((("AnimeOSRim", rim), ("AnimeOSEnergy", energy))):
        light = next((o for o in bpy.data.objects if o.name == name), None)
        if not light:
            light_data = bpy.data.lights.new(name, "AREA")
            light = bpy.data.objects.new(name, light_data)
            light.data.size = 4.0
            light.rotation_euler = (mathutils.radians(-55), mathutils.radians(20 * (i or -1)), 0)
            scn.collection.objects.link(light)
        light.data.energy = 200 + e * 1800
        light.location = ((3.5, -4.0, 2.6) if i == 0 else (-3.0, 3.5, 3.2))

    return scn


def apply_camera(shot_payload, scene_payload):
    """Frame the camera per AnimeOS shot grammar (type + movement hint)."""
    scn = bpy.context.scene
    cam = next((o for o in bpy.data.objects if o.type == "CAMERA"), None)
    if not cam:
        cam_data = bpy.data.cameras.new("AnimeOSCam")
        cam = bpy.data.objects.new("AnimeOSCam", cam_data)
        scn.collection.objects.link(cam)
    scn.camera = cam

    dist, lens, height = SHOT_FRAMING.get(str(shot_payload.get("shotType", "MEDIUM")).upper(), SHOT_FRAMING["MEDIUM"])
    cam.data.lens = lens
    dist *= float(scene_payload.get("cameraDistance", 1.0))

    movement = str(shot_payload.get("movement") or "STATIC").upper()
    angle = {"ORBIT": 40, "PAN": 25, "TRACKING": 15, "CRANE": 8, "DOLLY_IN": 0, "STATIC": 0}.get(movement, 0)
    rad = mathutils.radians(angle)
    cam.location = (dist * math.sin(rad), -dist * math.cos(rad), height)
    # aim at a subject standing near the origin
    direction = mathutils.Vector((0, 0, height * 0.75)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam


def render_job(job_id, payload):
    """Worker thread: drive bpy outside the main thread where safe, else flag main-thread need."""
    try:
        shot = payload.get("shot", {})
        scene_p = payload.get("scene", {})
        project = payload.get("project", {})
        mode = payload.get("mode", "PREVIEW")

        set_job(job_id, stage="Blender: scene received", progress=0.05)

        def build():
            scn = apply_scene_params(scene_p, project)
            apply_camera(shot, scene_p)
            scn.render.resolution_x, scn.render.resolution_y = (
                [int(v) for v in str(project.get("resolution", "1920x1080")).split("x")] + [1920, 1080]
            )[:2]
            scn.render.resolution_percentage = 50 if mode == "PREVIEW" else 100
            scn.render.image_settings.file_format = "PNG"
            scn.render.filepath = os.path.join(render_dir(), f"{job_id}.png")
            set_job(job_id, stage="Blender: rendering frame", progress=0.72)
            bpy.ops.render.render(write_still=True)

        # bpy is main-thread-bound: schedule on Blender's main loop via a timer,
        # chunked so the HTTP server keeps answering between steps.
        state = {"step": 0}

        def steps():
            try:
                if state["step"] == 0:
                    set_job(job_id, stage="Blender: applying AnimeOS parameters", progress=0.18)
                elif state["step"] == 1:
                    set_job(job_id, stage="Blender: lighting & camera rig", progress=0.42)
                    build()  # heavy part - one shot inside the timer callback
                    set_job(job_id, stage="Blender: done", progress=1.0, done=True,
                            png=encode_render(job_id))
                    CURRENT["id"] = None
                    return None  # stop timer
                state["step"] += 1
            except Exception as exc:  # noqa: BLE001
                traceback.print_exc()
                set_job(job_id, error=str(exc), done=True, stage=f"Blender: failed - {exc}")
                CURRENT["id"] = None
                return None
            return 0.1  # next tick

        bpy.app.timers.register(steps, first_interval=0.1, persistent=True)

    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        set_job(job_id, error=str(exc), done=True)


def encode_render(job_id):
    path = os.path.join(render_dir(), f"{job_id}.png")
    if os.path.exists(path):
        with open(path, "rb") as fh:
            return base64.b64encode(fh.read()).decode("ascii")
    return None


# ─── HTTP server ──────────────────────────────────────────────

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
            with LOCK:
                busy = CURRENT["id"] is not None
            self._json({
                "ok": True,
                "blender_version": bpy.app.version_string,
                "scene": bpy.context.scene.name,
                "busy": busy,
            })
        elif parsed.path == "/progress":
            job_id = (parse_qs(parsed.query).get("job_id") or [""])[0]
            job = get_job(job_id)
            if not job:
                self._json({"error": "unknown job"}, 404)
                return
            out = {"progress": job["progress"], "stage": job["stage"], "done": job["done"]}
            if job.get("error"):
                out["error"] = job["error"]
            if job["done"] and not job.get("error") and job.get("png"):
                out["png_base64"] = job["png"]
            self._json(out)
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

        job_id = str(payload.get("jobId") or f"job_{int(time.time())}")
        with LOCK:
            if CURRENT["id"] is not None:
                self._json({"error": "busy", "current_job": CURRENT["id"]}, 409)
                return
            CURRENT["id"] = job_id
        set_job(job_id, progress=0.01, stage="Blender: job accepted")
        threading.Thread(target=render_job, args=(job_id, payload), daemon=True).start()
        self._json({"ok": True, "jobId": job_id})

    def log_message(self, fmt, *args):  # quiet
        sys.stdout.write("[animeos-bridge] " + (fmt % args) + "\n")


def main():
    argv = sys.argv
    port = 8100
    if "--" in argv:
        extra = argv[argv.index("--") + 1:]
        parser = argparse.ArgumentParser()
        parser.add_argument("--port", type=int, default=8100)
        args, _ = parser.parse_known_args(extra)
        port = args.port

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"[animeos-bridge] serving on 127.0.0.1:{port} (Blender {bpy.app.version_string})", flush=True)

    # Keep Blender alive when headless (-b): run a forever-timer
    def heartbeat():
        return 5.0

    bpy.app.timers.register(heartbeat, persistent=True)
    # In background mode Blender exits when the script ends - park the main thread:
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
