# Smoke-test the AnimeOS bridge worker path with a minimal render job
# (same protocol submitLocalJob uses; 1-second PREVIEW shot).
import json, os, subprocess, sys, time

ROOT = "/home/z/my-project"
SCRIPT = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT_DIR = os.path.join(ROOT, "public", "renders")
os.makedirs(OUT_DIR, exist_ok=True)

payload = {
    "jobId": "blender-smoke-test",
    "payload": {
        "jobId": "blender-smoke-test",
        "shot": {
            "number": 1,
            "description": "bridge smoke test shot",
            "shotType": "MEDIUM",
            "lens": "50mm",
            "movement": "DOLLY_IN",
            "poseStart": "STANCE",
            "poseEnd": "DRAW",
            "lighting": "moonlit ridge",
            "duration": 1.0,
        },
        "scene": {
            "number": 1, "title": "Smoke Test Terrace", "fogDensity": 0.4,
            "lightningIntensity": 0.3, "energyIntensity": 0.5,
            "cameraDistance": 1.0, "rimLightIntensity": 0.5,
        },
        "project": {"title": "Bridge Smoke Test", "visualStyle": "DONGHUA",
                     "resolution": "1920x1080", "fps": 24},
        "mode": "PREVIEW",
    },
    "outDir": OUT_DIR,
}

job_file = os.path.join(OUT_DIR, ".job-blender-smoke-test.json")
with open(job_file, "w") as fh:
    json.dump(payload, fh)

bin_path = "/home/z/blender-4.3.2-linux-x64/blender"
state_file = job_file  # the worker rewrites the same file as state
t0 = time.time()
proc = subprocess.run(
    [bin_path, "-b", "-P", SCRIPT, "--", "--worker", "--job", job_file],
    capture_output=True, text=True, timeout=420, cwd=ROOT,
)
elapsed = time.time() - t0
print(f"worker exit={proc.returncode} elapsed={elapsed:.1f}s")
if proc.returncode != 0:
    print("STDERR tail:", proc.stderr[-1500:])
with open(state_file) as fh:
    print("final state:", json.load(fh))
clip = os.path.join(OUT_DIR, "blender-smoke-test.mp4")
print("clip exists:", os.path.exists(clip), "size:", os.path.getsize(clip) if os.path.exists(clip) else 0)
