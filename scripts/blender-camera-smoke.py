# Smoke-test THE CAMERA CHOREOGRAPHS THE DRAMA (iteration 88, Layer C)
# inside the REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge + camera_choreo imported as
#      modules): the choreo validator clamps against the same bounds
#      camera-choreo.ts clamps against (a wild factor clamps, a missing
#      choreo is None honestly); the hash mirrors the TS formula
#      bit-exactly; a REAL aimed camera moves - the push-in travels the
#      view axis toward the target, the pull-out retreats, the dutch
#      rolls the horizon clockwise, the handheld breath moves the frame
#      deterministically, the whip snaps and decays over the window.
#   2. RENDER JOBS over the real worker: a designed shot with a directed
#      choreo rides it (the evidence names the profile, the fields, the
#      hash); the same choreo twice hashes the same over real renders;
#      a payload without a choreo keeps the steady house camera
#      honestly; a wild choreo clamps and hashes differently.
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT_DIR = os.path.join(ROOT, "public", "renders")
os.makedirs(OUT_DIR, exist_ok=True)

BLENDER = next(p for p in ("/home/z/blender-5.2.2-linux-x64/blender", "/home/z/blender-4.3.2-linux-x64/blender") if os.path.exists(p))

failures = 0
def expect(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
    if not cond:
        failures += 1


# ── half 1: direct verification inside the real Blender ──
DIRECT = r"""
import importlib.util, hashlib, json, math, sys
import bpy
from mathutils import Vector
spec = importlib.util.spec_from_file_location("bridge", sys.argv[-1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
sys.path.insert(0, "/".join(sys.argv[-1].split("/")[:-1]))
import camera_choreo

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# the choreo validator: one law, two runtimes
c = m.camera_choreo({"cameraChoreo": {"pushIn": 3.0, "pullOut": -1.0, "dutch": 0.5, "handheld": 9.0, "whip": -0.4, "fields": ["dread"]}})
ok("a wild choreo clamps (pushIn 3->1, pullOut -1->0, handheld 9->1, whip -0.4->0) and the lawful dutch rides",
   c["pushIn"] == 1.0 and c["pullOut"] == 0.0 and c["dutch"] == 0.5 and c["handheld"] == 1.0 and c["whip"] == 0.0
   and c["fields"] == ["dread"], json.dumps(c))
ok("a missing choreo is None honestly (the steady house camera)", m.camera_choreo({}) is None)

# the hash mirrors the TS formula bit-exactly
key = "88|0.600|0.000|0.600|0.400|0.600|v1"
expect_hash = hashlib.sha256(key.encode()).hexdigest()[:16]
fixture = m.camera_choreo({"cameraChoreo": {"pushIn": 0.6, "pullOut": 0.0, "dutch": 0.6, "handheld": 0.4, "whip": 0.6}})
ok("the camera hash mirrors cameraChoreoHash in camera-choreo.ts (sha256-16)",
   m.camera_choreo_hash(fixture) == expect_hash, f"{m.camera_choreo_hash(fixture)} vs {expect_hash}")
ok("the same choreo hashes the same twice (deterministic)", m.camera_choreo_hash(fixture) == m.camera_choreo_hash(fixture))
other = m.camera_choreo({"cameraChoreo": {"pushIn": 0.6, "pullOut": 0.0, "dutch": 0.6, "handheld": 0.4, "whip": 0.2}})
ok("a different choreo hashes differently", m.camera_choreo_hash(fixture) != m.camera_choreo_hash(other))
ok("the hash is 16 hex", len(m.camera_choreo_hash(fixture)) == 16, m.camera_choreo_hash(fixture))

# the ledger line reads honestly
line_src = {"pushIn": 0.6, "pullOut": 0.0, "dutch": 0.6, "handheld": 0.4, "whip": 0.6, "fields": ["dread", "action"]}
ok("the ledger line names the factors and the fields",
   "push-in 0.60" in m.camera_choreo_line(line_src) and "named by the shot: dread, action" in m.camera_choreo_line(line_src),
   m.camera_choreo_line(line_src))

# a REAL aimed camera: the choreo layers onto the aim
def make_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cam_data = bpy.data.cameras.new("ProbeCam")
    cam = bpy.data.objects.new("ProbeCam", cam_data)
    bpy.context.collection.objects.link(cam)
    target = Vector((0.0, 0.0, 1.0))
    cam.location = Vector((0.0, -2.0, 1.0))
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam, target, direction

choreo_push = {"pushIn": 1.0, "pullOut": 0.0, "dutch": 0.0, "handheld": 0.0, "whip": 0.0}
cam, target, direction = make_scene()
d0 = (target - cam.location).length
camera_choreo.apply_choreo(cam, choreo_push, 1.0, 1.0, direction)
d1 = (target - cam.location).length
ok("the push-in travels the view axis TOWARD the target (bounded 0.35 units)",
   abs((d0 - d1) - camera_choreo.DOLLY_UNITS) < 1e-6, f"d0={d0:.4f} d1={d1:.4f}")

choreo_pull = {"pushIn": 0.0, "pullOut": 1.0, "dutch": 0.0, "handheld": 0.0, "whip": 0.0}
cam, target, direction = make_scene()
d0 = (target - cam.location).length
camera_choreo.apply_choreo(cam, choreo_pull, 1.0, 1.0, direction)
d1 = (target - cam.location).length
ok("the pull-out retreats FROM the target (the mirror travel)",
   abs((d1 - d0) - camera_choreo.DOLLY_UNITS) < 1e-6, f"d0={d0:.4f} d1={d1:.4f}")

choreo_dutch = {"pushIn": 0.0, "pullOut": 0.0, "dutch": 1.0, "handheld": 0.0, "whip": 0.0}
cam, target, direction = make_scene()
r0 = cam.rotation_euler.to_quaternion()
camera_choreo.apply_choreo(cam, choreo_dutch, 0.5, 0.5, direction)
# the local view-axis roll reads as a swing of the world-up's projection
up_world = Vector((0.0, 0.0, 1.0))
cam_vec = cam.rotation_euler.to_quaternion() @ Vector((0.0, 1.0, 0.0))   # the camera's local up in world
base_vec = r0 @ Vector((0.0, 1.0, 0.0))
ok("the dutch rolls the frame around the view axis (the camera's up swings, the aim holds)",
   (cam_vec - base_vec).length > 0.1 and abs((target - cam.location).length - 2.0) < 1e-5,
   f"swing={(cam_vec - base_vec).length:.4f}")

choreo_whip = {"pushIn": 0.0, "pullOut": 0.0, "dutch": 0.0, "handheld": 0.0, "whip": 1.0}
cam, target, direction = make_scene()
camera_choreo.apply_choreo(cam, choreo_whip, 0.0, 0.0, direction)
cam_vec = cam.rotation_euler.to_quaternion() @ Vector((0.0, 1.0, 0.0))
ok("the whip snaps the pan at the cut-in (t=0 carries the full roll)",
   (cam_vec - base_vec).length > 0.25, f"swing={(cam_vec - base_vec).length:.4f}")
# the worker re-aims the lens fresh every frame - probe the settled
# window's end the same way (a fresh aim, then the decayed whip)
cam, target, direction = make_scene()
camera_choreo.apply_choreo(cam, choreo_whip, camera_choreo.WHIP_WINDOW, 1.0, direction)
cam_vec_after = cam.rotation_euler.to_quaternion() @ Vector((0.0, 1.0, 0.0))
ok("the whip decays to zero by the window's end (the pan settles)",
   (cam_vec_after - base_vec).length < 1e-6, f"swing={(cam_vec_after - base_vec).length:.4f}")

choreo_hand = {"pushIn": 0.0, "pullOut": 0.0, "dutch": 0.0, "handheld": 1.0, "whip": 0.0}
probes = []
for ts in (0.25, 0.62):
    cam, target, direction = make_scene()
    camera_choreo.apply_choreo(cam, choreo_hand, 0.5, ts, direction)
    probes.append(cam.location.copy())
ok("the handheld breath moves the frame over time (deterministic frequencies)",
   (probes[0] - probes[1]).length > 1e-4, f"delta={(probes[0] - probes[1]).length:.5f}")
cam, target, direction = make_scene()
camera_choreo.apply_choreo(cam, choreo_hand, 0.5, 0.25, direction)
ok("the handheld breath is deterministic (the same t_sec lands the same frame)",
   (cam.location - probes[0]).length < 1e-9, f"delta={(cam.location - probes[0]).length:.9f}")

print("DIRECT_FAILS", len(fails))
sys.exit(1 if fails else 0)
"""
proc = subprocess.run(
    [BLENDER, "-b", "--factory-startup", "--python-expr", DIRECT, "--", SCRIPT],
    capture_output=True, text=True, timeout=300, cwd=ROOT,
)
for line in proc.stdout.splitlines():
    if line.startswith(("PASS", "FAIL", "DIRECT_FAILS")):
        print(line)
if proc.returncode != 0 or "DIRECT_FAILS 0" not in proc.stdout:
    print("direct half failed; stderr tail:", proc.stderr[-1500:])
    failures += 1


# ── half 2: render jobs over the real worker ──
def run_job(job_id, choreo, description="camera smoke shot"):
    shot = {
        "number": 1,
        "description": description,
        "shotType": "CLOSEUP", "lens": "50mm", "movement": "STATIC",
        "poseStart": "STANCE", "poseEnd": "STANCE",
        "lighting": "tribulation lightning", "duration": 1.0,
        "cast": [HERO],
    }
    if choreo is not None:
        shot["cameraChoreo"] = choreo
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Camera Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Camera Smoke", "visualStyle": "DONGHUA",
                        "resolution": "960x540", "fps": 24},
            "mode": "PREVIEW",
        },
        "outDir": OUT_DIR,
    }
    job_file = os.path.join(OUT_DIR, f".job-{job_id}.json")
    with open(job_file, "w") as fh:
        json.dump(payload, fh)
    t0 = time.time()
    proc = subprocess.run(
        [BLENDER, "-b", "-P", SCRIPT, "--", "--worker", "--job", job_file],
        capture_output=True, text=True, timeout=560, cwd=ROOT,
    )
    elapsed = time.time() - t0
    print(f"[{job_id}] worker exit={proc.returncode} elapsed={elapsed:.1f}s")
    if proc.returncode != 0:
        print("STDERR tail:", proc.stderr[-1500:])
        sys.exit(1)
    with open(job_file) as fh:
        return json.load(fh)


HERO = {
    "name": "Camera Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "none", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle"], "conformFactor": 0.75,
}

WIRE = {"pushIn": 0.6, "pullOut": 0.0, "dutch": 0.6, "handheld": 0.4, "whip": 0.6, "fields": ["dread", "action"]}

state = run_job("camera-smoke-wire", WIRE, "she dreads the truth as the blade bursts free")
cam_ev = (state.get("render") or {}).get("camera")
expect("the wire build names the camera evidence", isinstance(cam_ev, dict), json.dumps((state.get("render") or {}).get("camera"))[:200])
if isinstance(cam_ev, dict):
    expect("the source is the shot wire with the profile riding",
           cam_ev.get("source") == "shot wire" and cam_ev.get("profile", {}).get("dutch") == 0.6, json.dumps(cam_ev.get("profile")))
    expect("the shot's own fields ride", cam_ev.get("fields") == ["dread", "action"], json.dumps(cam_ev.get("fields")))
    expect("the hash is 16 hex", isinstance(cam_ev.get("hash"), str) and len(cam_ev["hash"]) == 16, str(cam_ev.get("hash")))
    expect("the ledger line rides", "camera: choreographed" in str(cam_ev.get("line")), str(cam_ev.get("line")))

state2 = run_job("camera-smoke-wire-2", WIRE, "she dreads the truth as the blade bursts free")
cam2 = (state2.get("render") or {}).get("camera")
expect("the same choreo hashes the same over two real renders",
       cam_ev.get("hash") == cam2.get("hash"), f"{cam_ev.get('hash')} vs {cam2.get('hash')}")

WILD = {"pushIn": 5.0, "pullOut": -2.0, "dutch": 0.5, "handheld": -1.0, "whip": 0.0}
state_w = run_job("camera-smoke-wild", WILD, "a wild choreo arrives")
cam_w = (state_w.get("render") or {}).get("camera")
wild_hash = __import__("hashlib").sha256("88|1.000|0.000|0.500|0.000|0.000|v1".encode()).hexdigest()[:16]
expect("the wild choreo clamps on the wire (pushIn 1, pullOut 0, handheld 0) and hashes the clamped law",
       cam_w.get("profile", {}).get("pushIn") == 1.0 and cam_w.get("profile", {}).get("pullOut") == 0.0
       and cam_w.get("profile", {}).get("handheld") == 0.0 and cam_w.get("hash") == wild_hash, json.dumps(cam_w.get("profile")))
expect("the wild clamped hash differs from the lawful one", cam_w.get("hash") != cam_ev.get("hash"))

state_def = run_job("camera-smoke-house", None, "a quiet shot keeps the house camera")
cam_d = (state_def.get("render") or {}).get("camera")
expect("a payload without a choreo keeps the STEADY HOUSE CAMERA honestly (no profile, null hash)",
       cam_d.get("source") == "steady house camera" and cam_d.get("profile") is None and cam_d.get("hash") is None,
       json.dumps(cam_d)[:200])

for f in ("camera-smoke-wire", "camera-smoke-wire-2", "camera-smoke-wild", "camera-smoke-house"):
    p = os.path.join(OUT_DIR, f"{f}.mp4")
    if os.path.exists(p):
        os.unlink(p)
    j = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(j):
        os.unlink(j)

print(f"\n{'ALL GREEN' if failures == 0 else f'{failures} FAILURE(S)'} - blender-camera-smoke")
sys.exit(1 if failures else 0)
