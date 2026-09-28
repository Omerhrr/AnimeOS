# Smoke-test THE FACE IS SCULPTED, NOT ASSEMBLED (iteration 82) inside
# the REAL Blender worker: a cast DNA carrying a faceProfile must build
# a figure whose render state names the applied face family, factors,
# sculpted hair parts and the head mesh's deterministic hash; a guess
# build (no profile) keeps the NEUTRAL sculpt, honestly named; the same
# profile lands the same mesh twice, and a different family lands a
# different mesh. Three 1-second PREVIEW shots over the real engine.
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT_DIR = os.path.join(ROOT, "public", "renders")
os.makedirs(OUT_DIR, exist_ok=True)

# the hero: an ANGULAR face with wild profile factors (the worker clamps)
ANGULAR = {
    "name": "Angular Hero", "hairColor": "#1B1B2A", "hairStyle": "ponytail",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "sword", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle", "build", "faceShape"], "conformFactor": 0.75,
    "silhouetteShape": {"shoulders": 1.1, "torso": 0.9, "hair": 1.3, "fields": ["broad-shouldered", "long hair"]},
    "faceShape": "angular",
    "faceProfile": {"jawTaper": 2.0, "chinFwd": 0.042, "browFwd": 0.024, "cheekOut": 0.014, "noseLen": 1.12, "eyeScale": 0.1, "fields": ["angular face"]},
}
# the second figure's own family (the worker sculpts member B too)
ROUND_B = {
    "name": "Round Rival", "hairColor": "#221133", "hairStyle": "long",
    "robeColor": "#5a2f4d", "robeAccent": "#c2a13c", "skinTone": "#d9b48f",
    "weaponType": "spear", "bladeColor": "#ff7b72", "build": "sturdy", "beard": False,
    "silhouetteShape": {"shoulders": 1.15, "torso": 1.1, "fields": ["broad-shouldered"]},
    "faceShape": "round",
    "faceProfile": {"jawTaper": 0.84, "chinFwd": 0.016, "browFwd": 0.008, "cheekOut": 0.034, "noseLen": 0.86, "eyeScale": 1.14, "fields": ["round face"]},
}
# the neutral sculpt: the same oval DNA twice (determinism law)
OVAL = {
    "name": "Oval Hero", "hairColor": "#1B1B2A", "hairStyle": "topknot",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "staff", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "faceShape": "oval",
    "faceProfile": {"jawTaper": 0.74, "chinFwd": 0.028, "browFwd": 0.014, "cheekOut": 0.022, "noseLen": 1.0, "eyeScale": 1.05, "fields": ["oval face"]},
}
# the guess build: no faceShape, no faceProfile - the neutral sculpt stays
GUESS = {k: v for k, v in ANGULAR.items() if k not in ("faceShape", "faceProfile", "sheetFields", "conformFactor", "silhouetteShape")}


def run_job(job_id, cast):
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": {
                "number": 1,
                "description": "sculpted likeness smoke shot",
                "shotType": "CLOSEUP", "lens": "50mm", "movement": "STATIC",
                "poseStart": "STANCE", "poseEnd": "STANCE",
                "lighting": "moonlit ridge", "duration": 1.0,
                "cast": cast,
            },
            "scene": {
                "number": 1, "title": "Sculpt Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Sculpt Smoke", "visualStyle": "DONGHUA",
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
        sys.exit(1)
    with open(job_file) as fh:
        return json.load(fh)


failures = 0
def expect(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
    if not cond:
        failures += 1


# ── job 1: the shaped cast (angular hero + round second figure) ──
state = run_job("sculpt-smoke-shaped", [ANGULAR, ROUND_B])
rig = state.get("rig") or {}
sc = rig.get("sculpt")
expect("figure built procedurally", state.get("figureSource") == "procedural:v4.0-designed", str(state.get("figureSource")))
expect("the sculpted figure reports its sculpt evidence", isinstance(sc, dict), json.dumps(rig)[:400])
if isinstance(sc, dict):
    expect("the face family the sheet named rides the evidence", sc.get("faceShape") == "angular", json.dumps(sc.get("faceShape")))
    f = sc.get("factors", {})
    expect("wild factors clamped (jawTaper 2.0 -> 0.9, eyeScale 0.1 -> 0.85)",
           f.get("jawTaper") == 0.9 and f.get("eyeScale") == 0.85, json.dumps(f))
    expect("namedBySheet rides the state", sc.get("namedBySheet") == ["angular face"], json.dumps(sc.get("namedBySheet")))
    parts = sc.get("parts", [])
    expect("the hair is sculpted (cap + fringe + ponytail sweep + tail)",
           "HairCap" in parts and "HairFringe" in parts and "HairSweep" in parts and "HairTail" in parts, json.dumps(parts))
    expect("the sculpt moved real vertices", isinstance(sc.get("verts"), int) and sc["verts"] > 600, str(sc.get("verts")))
    expect("the head mesh carries a deterministic hash", isinstance(sc.get("faceHash"), str) and len(sc["faceHash"]) == 16, str(sc.get("faceHash")))
second = state.get("secondFigureSculpt")
expect("the second figure's sculpt rides the state (round family, its own factors)",
       isinstance(second, dict) and second.get("faceShape") == "round" and second.get("factors", {}).get("jawTaper") == 0.84, json.dumps(second or {})[:300])
clip = os.path.join(OUT_DIR, "sculpt-smoke-shaped.mp4")
expect("the clip rendered", os.path.exists(clip) and os.path.getsize(clip) > 0)
ANGULAR_HASH = sc.get("faceHash") if isinstance(sc, dict) else None

# ── job 2: determinism - the same oval DNA twice ──
state_a = run_job("sculpt-smoke-determinism-a", [OVAL])
state_b = run_job("sculpt-smoke-determinism-b", [OVAL])
hash_a = ((state_a.get("rig") or {}).get("sculpt") or {}).get("faceHash")
hash_b = ((state_b.get("rig") or {}).get("sculpt") or {}).get("faceHash")
verts_a = ((state_a.get("rig") or {}).get("sculpt") or {}).get("verts")
verts_b = ((state_b.get("rig") or {}).get("sculpt") or {}).get("verts")
expect("the same profile lands the same mesh (hash equality, run A/B)", hash_a == hash_b and hash_a is not None, f"{hash_a} vs {hash_b}")
expect("the same profile lands the same vertex count", verts_a == verts_b and isinstance(verts_a, int), f"{verts_a} vs {verts_b}")

# ── job 3: difference - oval vs angular must hash differently ──
expect("a different family lands a different mesh (oval hash differs from angular)",
       ANGULAR_HASH is not None and hash_a is not None and ANGULAR_HASH != hash_a, f"{ANGULAR_HASH} vs {hash_a}")

# ── job 4: the guess build keeps the NEUTRAL sculpt, honestly named ──
state = run_job("sculpt-smoke-guess", [GUESS])
rig = state.get("rig") or {}
sc = rig.get("sculpt")
expect("the guess build still sculpts (the head is never a sphere again)", isinstance(sc, dict), json.dumps(rig)[:400])
if isinstance(sc, dict):
    expect("no family named on a guess build", sc.get("faceShape") is None, json.dumps(sc.get("faceShape")))
    f = sc.get("factors", {})
    expect("the neutral (oval) factors keep the default face", f.get("jawTaper") == 0.74 and f.get("eyeScale") == 1.05, json.dumps(f))
    expect("namedBySheet empty and honest", sc.get("namedBySheet") == [], json.dumps(sc.get("namedBySheet")))
    expect("the guess build's mesh differs from the angular build's", sc.get("faceHash") not in (None, ANGULAR_HASH), str(sc.get("faceHash")))
    expect("the guess build's hair is sculpted too", "HairCap" in sc.get("parts", []), json.dumps(sc.get("parts")))

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - sculpted likeness smoke")
sys.exit(0 if failures == 0 else 1)
