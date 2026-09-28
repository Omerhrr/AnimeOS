# Smoke-test THE SILHOUETTE SHAPES THE MESH (iteration 81) inside the
# REAL Blender worker: a cast DNA carrying a silhouetteShape profile
# must build a shaped figure whose render state names the applied
# factors, and a guess build (no profile) must report none. Two
# 1-second PREVIEW shots over the real engine.
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT_DIR = os.path.join(ROOT, "public", "renders")
os.makedirs(OUT_DIR, exist_ok=True)

# THE SILHOUETTE SHAPES THE MESH: a rich profile exercising every trait
# (some factors deliberately outside the bounds - the worker clamps)
SHAPED = {
    "name": "Shaped Hero", "hairColor": "#1B1B2A", "hairStyle": "ponytail",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "sword", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle", "build"], "conformFactor": 0.75,
    "silhouetteShape": {"height": 1.2, "shoulders": 1.1, "torso": 99, "sleeves": 1.2, "skirt": 0.5, "hair": 1.3, "fields": ["tall", "broad-shouldered", "flowing sleeves", "long hair"]},
}
# the second figure's own profile (worker dresses + shapes member B too)
SHAPED_B = {
    "name": "Shaped Rival", "hairColor": "#221133", "hairStyle": "long",
    "robeColor": "#5a2f4d", "robeAccent": "#c2a13c", "skinTone": "#d9b48f",
    "weaponType": "spear", "bladeColor": "#ff7b72", "build": "sturdy", "beard": False,
    "silhouetteShape": {"shoulders": 1.15, "torso": 1.1, "fields": ["broad-shouldered"]},
}
GUESS = {k: v for k, v in SHAPED.items() if k not in ("silhouetteShape", "sheetFields", "conformFactor")}


def run_job(job_id, cast, expect_silhouette, expect_second):
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": {
                "number": 1,
                "description": "silhouette shaping smoke shot",
                "shotType": "MEDIUM", "lens": "50mm", "movement": "STATIC",
                "poseStart": "STANCE", "poseEnd": "STANCE",
                "lighting": "moonlit ridge", "duration": 1.0,
                "cast": cast,
            },
            "scene": {
                "number": 1, "title": "Silhouette Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Silhouette Smoke", "visualStyle": "DONGHUA",
                        "resolution": "960x540", "fps": 24},
            "mode": "PREVIEW",
        },
        "outDir": OUT_DIR,
    }
    job_file = os.path.join(OUT_DIR, f".job-{job_id}.json")
    with open(job_file, "w") as fh:
        json.dump(payload, fh)

    bin_path = next(
        p for p in (
            "/home/z/blender-5.2.2-linux-x64/blender",
            "/home/z/blender-4.3.2-linux-x64/blender",
        )
        if os.path.exists(p)
    )
    t0 = time.time()
    proc = subprocess.run(
        [bin_path, "-b", "-P", SCRIPT, "--", "--worker", "--job", job_file],
        capture_output=True, text=True, timeout=420, cwd=ROOT,
    )
    elapsed = time.time() - t0
    print(f"[{job_id}] worker exit={proc.returncode} elapsed={elapsed:.1f}s")
    if proc.returncode != 0:
        print("STDERR tail:", proc.stderr[-1500:])
        return False
    with open(job_file) as fh:
        state = json.load(fh)
    rig = state.get("rig") or {}
    sil = rig.get("silhouette")
    ok = True

    def expect(name, cond, detail=""):
        nonlocal ok
        print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
        ok = ok and cond

    expect("figure built procedurally", state.get("figureSource") == "procedural:v4.0-designed", str(state.get("figureSource")))
    if expect_silhouette:
        expect("the shaped figure reports its silhouette", isinstance(sil, dict), json.dumps(rig))
        if isinstance(sil, dict):
            f = sil.get("factors", {})
            expect("wild factors clamped (height 1.2 -> 1.12, torso 99 -> 1.2, skirt 0.5 -> 0.9)",
                   f.get("height") == 1.12 and f.get("torso") == 1.2 and f.get("skirt") == 0.9, json.dumps(f))
            expect("applied names every moved trait", set(sil.get("applied", [])) == {"height", "shoulders", "torso", "sleeves", "skirt", "hair"}, json.dumps(sil.get("applied")))
            expect("namedBySheet rides the state", sil.get("namedBySheet") == SHAPED["silhouetteShape"]["fields"], json.dumps(sil.get("namedBySheet")))
    else:
        expect("the guess build reports NO silhouette", sil is None, json.dumps(rig))
    second = state.get("secondFigureSilhouette")
    if expect_second:
        expect("the second figure's shaping rides the state too", isinstance(second, dict) and second.get("factors", {}).get("shoulders") == 1.15, json.dumps(second))
    else:
        expect("no second figure silhouette when cast is one", second is None, str(second))
    clip = os.path.join(OUT_DIR, f"{job_id}.mp4")
    expect("the clip rendered", os.path.exists(clip) and os.path.getsize(clip) > 0)
    return ok


ok = True
ok = run_job("silhouette-smoke-shaped", [SHAPED, SHAPED_B], expect_silhouette=True, expect_second=True) and ok
ok = run_job("silhouette-smoke-guess", [GUESS], expect_silhouette=False, expect_second=False) and ok
print(f"\n{'ALL GREEN' if ok else 'FAILURES'} - silhouette mesh shaping smoke")
sys.exit(0 if ok else 1)
