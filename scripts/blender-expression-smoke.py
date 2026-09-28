# Smoke-test THE FACE PERFORMS THE BEAT (iteration 84) inside the REAL
# Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the clip
#      validator clamps against the same bounds expressions.ts clamps
#      against (a wild/unknown clip degrades to None honestly); the
#      timing curve attacks, holds and releases; the blended weights
#      land inside the bounds; the evidence hash matches the TS
#      formula; the four shape keys sculpt onto the real head mesh
#      WITHOUT moving the basis (the faceHash and vertex count stay
#      what iteration 82 proved); apply_pose composes the channels
#      (brow delta, lid squint, mouth floor) and drives the keys.
#   2. RENDER JOBS over the real worker: the render state names the
#      expression evidence (emotion, shapes, samples, hash) for a
#      clip payload; a payload without a clip stays honestly None; a
#      wild clip (unknown emotion) degrades to None; the same clip
#      lands the same hash twice.
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
import importlib.util, json, math, sys
import bpy
spec = importlib.util.spec_from_file_location("bridge", sys.argv[-1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# the clip validator: one law, two runtimes
clip = m.expression_clip({"expression": {"emotion": "Anger", "intensity": 0.6, "attackMs": 240, "releaseMs": 480}})
ok("a valid clip passes (emotion normalized, numbers kept)",
   clip == {"emotion": "anger", "intensity": 0.6, "attackMs": 240, "releaseMs": 480}, json.dumps(clip))
wild = m.expression_clip({"expression": {"emotion": "anger", "intensity": 9.0, "attackMs": 9000, "releaseMs": -5}})
ok("wild numbers clamped against the same bounds (intensity 9->1, attack 9000->800, release -5->200)",
   wild["intensity"] == 1.0 and wild["attackMs"] == 800 and wild["releaseMs"] == 200, json.dumps(wild))
ok("an unknown emotion degrades to None (the face stays pose-driven)",
   m.expression_clip({"expression": {"emotion": "fury", "intensity": 0.5}}) is None, "none")
ok("a missing clip degrades to None", m.expression_clip({}) is None, "none")

# the timing curve: attack, hold, release (deterministic)
c = {"emotion": "anger", "intensity": 0.6, "attackMs": 240, "releaseMs": 480}
env0 = m.expression_envelope(c, 0.0, 2.5)
env_mid = m.expression_envelope(c, 1.25, 2.5)
env_end = m.expression_envelope(c, 2.5, 2.5)
ok("the envelope starts at calm (0), holds (1) and releases (0)",
   abs(env0) < 1e-6 and abs(env_mid - 1.0) < 1e-6 and abs(env_end) < 1e-6, f"{env0}/{env_mid}/{env_end}")
ok("the envelope is deterministic (A/B)",
   m.expression_envelope(c, 1.25, 2.5) == env_mid, "same")
short = m.expression_envelope({"emotion": "joy", "intensity": 0.6, "attackMs": 800, "releaseMs": 1200}, 0.5, 1.0)
mid_third = m.expression_envelope({"emotion": "joy", "intensity": 0.6, "attackMs": 800, "releaseMs": 1200}, 1.0, 1.5)
ok("a clip whose timing does not fit the beat still performs (thirds law: attack, plateau, release)",
   abs(short - 1.0) < 1e-6 and abs(mid_third - 1.0) < 1e-6, f"t0.5/1.0={short:.4f} t1.0/1.5={mid_third:.4f}")

# the blended weights: calm at env 0, the library pose scaled by intensity
w0 = m.expression_at(c, 0.0, 2.5)
ok("envelope zero lands the alive CALM baseline (cheek 0.1, corner 0.08, never dead zero)",
   w0 == {"brow": 0.0, "squint": 0.06, "mouthFloor": 0.0, "knit": 0.0, "cheek": 0.1, "corner": 0.08, "jaw": 0.0}, json.dumps(w0))
w_hold = m.expression_at(c, 1.25, 2.5)
ok("the anger hold blends calm -> library * intensity (knit 0.42, corner -0.3, brow -0.42)",
   w_hold["knit"] == 0.42 and w_hold["corner"] == -0.3 and w_hold["brow"] == -0.42, json.dumps(w_hold))
in_bounds = all(lo <= v <= hi for k, (lo, hi) in m.EXPRESSION_BOUNDS.items() for v in [w_hold[k], w0[k]])
ok("every blended weight lands inside the bounds", in_bounds, json.dumps(w_hold))

# the evidence hash matches the TS formula (one law, two runtimes)
ev = m.expression_evidence(c, 2.5)
expect_ts = __import__("hashlib").sha256("84|anger|0.600|240|480|v1".encode()).hexdigest()[:16]
ok("the evidence hash matches the TS formula", ev["hash"] == expect_ts, f"{ev['hash']} vs {expect_ts}")
ok("the evidence samples the pose-matched fractions (22/40/62%)",
   [s["at"] for s in ev["samples"]] == [0.55, 1.0, 1.55] and ev["shapes"] == ["browKnit", "cheekRaise", "mouthCorner", "jawOpen"], json.dumps(ev["samples"])[:160])

# the four shape keys sculpt onto the real head mesh WITHOUT moving it
scn = bpy.context.scene
head = bpy.data.objects.new("HeadEmpty", None)
scn.collection.objects.link(head)
skin = m.principled_mat(bpy, "SkinMat", "#d9b48f")
prof = m.face_profile({"faceShape": "oval"})

def head_hash(mesh):
    return __import__("hashlib").sha256("".join(f"{v.co.x:.5f},{v.co.y:.5f},{v.co.z:.5f};" for v in mesh.data.vertices).encode("utf-8")).hexdigest()[:16]

plain = m.sculpt_head_mesh(scn, bpy, head, skin, prof, 1.0)
plain_hash = head_hash(plain)
plain_verts = len(plain.data.vertices)
keys = m.sculpt_expression_keys(plain)
ok("the four expression keys + basis exist on the sculpted head",
   sorted(keys.keys()) == ["browKnit", "cheekRaise", "jawOpen", "mouthCorner"] and len(plain.data.shape_keys.key_blocks) == 5, json.dumps(sorted(keys.keys())))
ok("the corner key is signed (slider -1..1)", keys["mouthCorner"].slider_min == -1.0 and keys["mouthCorner"].slider_max == 1.0, str(keys["mouthCorner"].slider_min))
ok("the keys never move the BASIS (faceHash unchanged, vertex count unchanged)",
   head_hash(plain) == plain_hash and len(plain.data.vertices) == plain_verts, f"{head_hash(plain)} vs {plain_hash}")
head2 = bpy.data.objects.new("HeadEmpty2", None)
scn.collection.objects.link(head2)
plain2 = m.sculpt_head_mesh(scn, bpy, head2, skin, prof, 1.0)
keys2 = m.sculpt_expression_keys(plain2)
same = all(
    all(tuple(keys[n].data[i].co) == tuple(keys2[n].data[i].co) for i in range(0, len(plain.data.vertices), 37))
    for n in keys
)
ok("the same sculpt lands the same keys (determinism, sampled A/B)", same, "sampled")
def key_delta_norm(kb):
    total = 0.0
    for i in range(len(kb.data)):
        co = kb.data[i].co
        base = plain.data.vertices[i].co
        total += abs(co.x - base.x) + abs(co.y - base.y) + abs(co.z - base.z)
    return round(total, 6)
norms = sorted(key_delta_norm(kb) for kb in keys.values())
ok("different keys carry different deltas (four shapes, not four copies)",
   len(set(norms)) == 4 and norms[0] > 0.0, json.dumps(norms))

# apply_pose composes the expression with the pose channels
dna = {
    "name": "Expr Hero", "hairColor": "#1B1B2A", "hairStyle": "ponytail",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "none", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "faceShape": "oval",
    "faceProfile": {"jawTaper": 0.74, "chinFwd": 0.028, "browFwd": 0.014, "cheekOut": 0.022, "noseLen": 1.0, "eyeScale": 1.05, "fields": ["oval face"]},
}
mats = {
    "robe": m.principled_mat(bpy, "RobeMat", "#2f6d63"),
    "accent": m.principled_mat(bpy, "AccentMat", "#a8842c"),
    "skin": skin, "hair": m.principled_mat(bpy, "HairMat", "#1b1b2a"),
    "blade": m.emission_mat(bpy, "BladeMat", "#5eead4", 3.0),
    "boots": m.principled_mat(bpy, "BootsMat", "#241a12"),
}
fig = m.build_designed_figure(bpy, scn, dna, mats)
ok("the designed figure carries its expression keys", isinstance(fig.get("exprKeys"), dict) and len(fig["exprKeys"]) == 4, json.dumps(sorted((fig.get("exprKeys") or {}).keys())))
T = 0.5556  # brow drift zero crossing (sin(2*pi*0.9*t) = 0)
m.apply_pose(fig, "STANCE", "STANCE", 0.0, T)
brow_plain = fig["browL"].rotation_euler.y
eye_plain = fig["eyeL"].scale.z
m.apply_pose(fig, "STANCE", "STANCE", 0.0, T, expr=w_hold)
brow_angry = fig["browL"].rotation_euler.y
eye_angry = fig["eyeL"].scale.z
brow_delta = abs(brow_angry - brow_plain)
ok("the brow rig composes the expression (14 deg per library unit: 0.42 -> ~5.88 deg)",
   abs(brow_delta - math.radians(14.0 * 0.42)) < 1e-4, f"delta={math.degrees(brow_delta):.3f}")
ok("the lids squint multiplicatively (x 1 - 0.55 * 0.27)", abs(eye_angry / eye_plain - (1.0 - 0.55 * 0.27)) < 1e-4, f"{eye_angry}/{eye_plain}")
ok("the shape keys took the mesh weights (knit 0.42, corner -0.3)",
   abs(fig["exprKeys"]["browKnit"].value - 0.42) < 1e-6 and abs(fig["exprKeys"]["mouthCorner"].value - (-0.3)) < 1e-6,
   json.dumps({k: kb.value for k, kb in fig["exprKeys"].items()}))
m.apply_pose(fig, "STANCE", "STANCE", 0.0, T)
ok("expr=None keeps the pose-driven face (keys reset by the caller's law, channels clean)",
   abs(fig["browL"].rotation_euler.y - brow_plain) < 1e-9, "unchanged")

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
    print("direct half failed; stderr tail:", proc.stderr[-1200:])
    failures += 1


# ── half 2: render jobs over the real worker ──
def run_job(job_id, cast, expression="__unset__"):
    shot = {
        "number": 1,
        "description": "performed beat smoke shot",
        "shotType": "CLOSEUP", "lens": "50mm", "movement": "STATIC",
        "poseStart": "STANCE", "poseEnd": "STANCE",
        "lighting": "moonlit ridge", "duration": 1.0,
        "cast": cast,
    }
    if expression != "__unset__":
        shot["expression"] = expression
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Beat Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Beat Smoke", "visualStyle": "DONGHUA",
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
        capture_output=True, text=True, timeout=420, cwd=ROOT,
    )
    elapsed = time.time() - t0
    print(f"[{job_id}] worker exit={proc.returncode} elapsed={elapsed:.1f}s")
    if proc.returncode != 0:
        print("STDERR tail:", proc.stderr[-1500:])
        sys.exit(1)
    with open(job_file) as fh:
        return json.load(fh)


HERO = {
    "name": "Performed Hero", "hairColor": "#1B1B2A", "hairStyle": "ponytail",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "sword", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle", "build"], "conformFactor": 0.75,
}
ANGER = {"emotion": "anger", "intensity": 0.6, "attackMs": 240, "releaseMs": 480}

state = run_job("expr-smoke-clip", [HERO], ANGER)
rig = state.get("rig") or {}
ev = rig.get("expression")
expect("the performed figure built procedurally", state.get("figureSource") == "procedural:v4.0-designed", str(state.get("figureSource")))
expect("the render state names the expression evidence", isinstance(ev, dict), json.dumps(rig)[:300])
if isinstance(ev, dict):
    expect("the clip rides (anger @ 0.6, bounded timing)", ev.get("emotion") == "anger" and ev.get("intensity") == 0.6 and ev.get("attackMs") == 240 and ev.get("releaseMs") == 480, json.dumps(ev)[:200])
    expect("the evidence names the four shape keys", ev.get("shapes") == ["browKnit", "cheekRaise", "mouthCorner", "jawOpen"], json.dumps(ev.get("shapes")))
    samples = ev.get("samples") or []
    hold = samples[1] if len(samples) > 1 else {}
    expect("the hold sample carries the blended weights (knit 0.42, corner -0.3)",
           hold.get("weights", {}).get("knit") == 0.42 and hold.get("weights", {}).get("corner") == -0.3, json.dumps(hold))
    expect("the evidence hash is deterministic and matches the TS formula",
           ev.get("hash") == __import__("hashlib").sha256("84|anger|0.600|240|480|v1".encode()).hexdigest()[:16], str(ev.get("hash")))
clip = os.path.join(OUT_DIR, "expr-smoke-clip.mp4")
expect("the clip rendered", os.path.exists(clip) and os.path.getsize(clip) > 0)

state_none = run_job("expr-smoke-none", [HERO])
ev_none = ((state_none.get("rig") or {}).get("expression"))
expect("a payload without a clip stays honestly None (the old face law)",
       ev_none is None, json.dumps(ev_none))

state_wild = run_job("expr-smoke-wild", [HERO], {"emotion": "fury", "intensity": 9.0})
ev_wild = ((state_wild.get("rig") or {}).get("expression"))
expect("a wild clip (unknown emotion) degrades to None, named", ev_wild is None, json.dumps(ev_wild))

state_again = run_job("expr-smoke-clip-b", [HERO], ANGER)
ev_again = ((state_again.get("rig") or {}).get("expression"))
expect("the same clip lands the same hash (A/B over real renders)",
       isinstance(ev, dict) and isinstance(ev_again, dict) and ev["hash"] == ev_again.get("hash"), f"{ev.get('hash') if isinstance(ev, dict) else None} vs {ev_again.get('hash') if isinstance(ev_again, dict) else None}")

for f in ("expr-smoke-clip", "expr-smoke-none", "expr-smoke-wild", "expr-smoke-clip-b"):
    p = os.path.join(OUT_DIR, f"{f}.mp4")
    if os.path.exists(p):
        os.unlink(p)
    j = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(j):
        os.unlink(j)

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - expression smoke")
sys.exit(0 if failures == 0 else 1)
