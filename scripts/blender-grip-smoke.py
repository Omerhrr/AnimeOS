#!/usr/bin/env python3
# Smoke-test THE HAND CLOSES ON THE HILT (iteration 97, the
# grip-contact slice) inside the REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the
#      canonical key + hash mirroring the sha256-16 formula over the
#      hand-built key; the sensitivity law (a tilt, an anchor or a
#      hold move moves the hash); A/B determinism; the axis law (the
#      sword's tip points down-forward, the staff/spear shafts
#      through-grip); the STRUCTURAL contact on a REAL stand-in rig
#      (the pivot's world location == the hand's world matrix x the
#      anchor, the cone centered ON the pivot, the relation holding
#      through a SLASH frame with the follow-through lag riding the
#      PIVOT); the STRUCTURAL contact on a REAL DESIGNED sword build
#      (the hilt at the pivot, the guard and the blade on the law's
#      offsets, collinear, the kind's own tilt preserved).
#   2. RENDER JOBS over the real worker: the sword SLASH closeup
#      names the rig's grip evidence (kind, hand, anchor, the 16-hex
#      hash matching the independent derivation, contact true) with
#      the legIk evidence riding beside (iteration 96 regression);
#      the staff render lands the SAME law hash with its own kind
#      named; A/B determinism; the clips render; cleanup.
import hashlib
import json, os, subprocess, sys, time, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT_DIR = os.path.join(ROOT, "public", "renders")
os.makedirs(OUT_DIR, exist_ok=True)

BLENDER = next(p for p in ("/home/z/blender-5.2.2-linux-x64/blender", "/home/z/blender-4.3.2-linux-x64/blender") if os.path.exists(p))
HALF = os.environ.get("HALF", "all").lower()  # all | direct | render (the gateway's 10-min cap)

failures = 0
def expect(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
    if not cond:
        failures += 1


# ── half 1: direct verification inside the real Blender ──
DIRECT = r"""
import hashlib
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

R = math.radians
D = math.degrees

# ── the canonical key + hash against the hand-built key ──
def indep_key():
    kinds = []
    for k, s in m.GRIP_SPEC.items():
        t = R(s["tilt"])
        uy, uz = round(math.sin(t), 4), round(-math.cos(t), 4)
        kinds.append(f"{k}:tilt={s['tilt']:.4f},hold={s['hold']:.4f},hilt={s['hilt']:.4f},guard={s['guard']:.4f},u={uy:.4f},{uz:.4f}")
    a = m.GRIP_ANCHOR
    return f"{m.GRIP_LAW_VERSION}|A={a[0]:.4f},{a[1]:.4f},{a[2]:.4f}|{'|'.join(kinds)}|v1"

EXPECT_KEY = indep_key()
ok("the canonical key mirrors the hand-built key field for field",
   m.grip_key() == EXPECT_KEY, m.grip_key()[:180])
ok("the grip hash mirrors the sha256-16 formula over that key",
   m.grip_hash() == hashlib.sha256(EXPECT_KEY.encode("utf-8")).hexdigest()[:16],
   m.grip_hash())
ok("the grip hash is 16 hex", len(m.grip_hash()) == 16)

# the sensitivity law: the law's own constants move the hash
old = (m.GRIP_ANCHOR, dict(m.GRIP_SPEC["sword"]))
base = m.grip_hash()
try:
    m.GRIP_ANCHOR = (0.0, -0.012, -0.048)
    h1 = m.grip_hash()
    m.GRIP_ANCHOR = old[0]
    m.GRIP_SPEC["sword"] = {**old[1], "tilt": -58.0}
    h2 = m.grip_hash()
    m.GRIP_SPEC["sword"] = {**old[1], "hold": 0.05}
    h3 = m.grip_hash()
    ok("an anchor move, a tilt move and a hold move each move the hash",
       h1 != base and h2 != base and h3 != base,
       f"{h1} {h2} {h3} vs {base}")
finally:
    m.GRIP_ANCHOR = old[0]
    m.GRIP_SPEC["sword"] = old[1]
ok("the same law lands the same hash twice (A/B)", m.grip_hash() == m.grip_hash())

# the axis law: the kinds' own reads preserved
us = m.grip_tip_axis("sword")
ok("the sword's tip axis points down-forward (the read stays)",
   us[1] < 0 and us[2] < 0 and abs(us[1] - round(math.sin(R(-55)), 4)) < 1e-9,
   str(us))
u2 = m.grip_tip_axis("staff")
ok("the staff's shaft through-grips (the hold sits the fist in the lower third)",
   u2[1] < 0 and m.GRIP_SPEC["staff"]["hold"] > 0, str(u2))
o1 = m.grip_piece_offset("sword", 0.2)
o2 = m.grip_piece_offset("sword", 0.6)
ok("the sword's pieces hang collinear (guard and blade on the same axis line)",
   abs(o1[1] * o2[2] - o2[1] * o1[2]) < 1e-4,
   json.dumps([o1, o2]))

# ── the STRUCTURAL contact on a REAL stand-in rig ──
mat = bpy.data.materials.new("SmokeMat")
mat.use_nodes = True
bl = bpy.data.materials.new("SmokeBlade")
bl.use_nodes = True
fig = m.build_stand_in_figure(bpy, bpy.context.scene, mat, bl)

bpy.context.view_layer.update()
hand = fig["rHand"] if "rHand" in fig else None
# the stand-in's dict does not carry rHand; reach it through the pivot's parent
pivot = fig["gripPivot"]
hand = pivot.parent
expected_world = hand.matrix_world @ __import__("mathutils").Vector(m.GRIP_ANCHOR)
ok("the grip pivot hangs at the anchor in the hand's own frame",
   (pivot.location - __import__("mathutils").Vector(m.GRIP_ANCHOR)).length < 1e-9
   and (pivot.matrix_world.translation - expected_world).length < 1e-6,
   f"{tuple(pivot.matrix_world.translation)} vs {tuple(expected_world)}")
ok("the stand-in's blade is centered ON the pivot (the midpoint gripped)",
   (fig["blade"].location - __import__("mathutils").Vector((0, 0, 0))).length < 1e-9
   and fig["blade"].parent == pivot)

# the pair rides the swing: after a SLASH mid-frame the relation holds
# and the follow-through wrote the lag to the PIVOT (not the slab)
m.apply_pose(fig, "STANCE", "SLASH", 0.5, 0.3)
bpy.context.view_layer.update()
a_row = m.POSE_JOINTS["STANCE"]
b_row = m.POSE_JOINTS["SLASH"]
x = 0.5
k_deriv = 12.0 * x * x  # the eased-cubic derivative at the first half
lag = max(-12.0, min(12.0, (b_row[4] - a_row[4]) * k_deriv * 0.03))
ok("the follow-through pivots the WHOLE weapon around the fist (the lag rides the pivot)",
   abs(pivot.rotation_euler.x - R(lag)) < 1e-6,
   f"{D(pivot.rotation_euler.x)} vs {lag}")
ok("the contact survives the swing (the pivot still at the anchor in the hand's frame)",
   (pivot.matrix_world.translation - hand.matrix_world @ __import__("mathutils").Vector(m.GRIP_ANCHOR)).length < 1e-6)

# ── the STRUCTURAL contact on a REAL DESIGNED sword build ──
DNA = {
    "name": "Grip Smoke Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "sword", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle", "hairColor"], "conformFactor": 0.75,
    "silhouetteShape": {"height": 1.02, "shoulders": 0.94, "torso": 0.97, "sleeves": 1.06, "skirt": 1.0, "hair": 1.08, "fields": ["flowing"]},
    "faceShape": "oval",
    "faceProfile": {"jawTaper": 0.92, "chinFwd": 0.88, "browFwd": 0.9, "cheekOut": 0.85, "noseLen": 0.95, "eyeScale": 1.12},
    "materialProfile": {"skinSss": 0.3, "skinRough": 0.42, "skinWarmth": 0.25, "rim": 0.35, "clothRamp": 0.4, "clothSheen": 0.3, "clothWeave": 0.2, "hairRough": 0.35},
    "hairShade": {"melanin": 0.82, "redness": 0.12, "radial": 0.3, "longitudinal": 0.25},
    "skinDepth": {"weight": 0.42, "radius": 0.66, "scale": 0.4, "coat": 0.08, "coatRough": 0.47},
    "groomProfile": {"sweep": 0.1, "flow": 0.55, "flyaway": 0.35, "taper": 0.85},
}
def plain(name):
    mm = bpy.data.materials.new(name)
    mm.use_nodes = True
    return mm
mats = {k: plain(f"GripSmoke{k}") for k in ("robe", "accent", "skin", "hair", "blade", "boots")}
dfig = m.build_designed_figure(bpy, bpy.context.scene, DNA, mats, strand_f=0.6)
dp = dfig.get("gripPivot")
ok("the designed sword builds a grip pivot", dp is not None)
if dp is not None:
    spec = m.GRIP_SPEC["sword"]
    V = __import__("mathutils").Vector
    kids = {c.name: c for c in dp.children}
    grip_ob = kids.get("BladeGrip")
    guard_ob = kids.get("BladeGuard")
    blade_ob = next((c for n, c in kids.items() if n.startswith("HandBlade")), None)
    ok("the fist grips the HILT at the pivot (pivot-local zero, the kind's own tilt)",
       grip_ob is not None and grip_ob.parent == dp
       and (grip_ob.location - V((0, 0, 0))).length < 1e-9
       and abs(grip_ob.rotation_euler.x - R(spec["tilt"])) < 1e-6,
       str(grip_ob.location if grip_ob else None))
    exp_guard = V(m.grip_piece_offset("sword", spec["hilt"] / 2.0 + 0.0055))
    exp_blade = V(m.grip_piece_offset("sword", spec["guard"] + 0.0055 + 0.55))
    ok("the guard sits past the hilt ON the law's offset",
       guard_ob is not None and (guard_ob.location - exp_guard).length < 1e-6,
       f"{tuple(guard_ob.location) if guard_ob else None} vs {tuple(exp_guard)}")
    ok("the blade meets the guard ON the law's offset (the pieces collinear)",
       blade_ob is not None and (blade_ob.location - exp_blade).length < 1e-6
       and abs(blade_ob.rotation_euler.x - R(spec["tilt"])) < 1e-6,
       f"{tuple(blade_ob.location) if blade_ob else None} vs {tuple(exp_blade)}")
    bpy.context.view_layer.update()
    dhand = dp.parent
    ok("the designed contact is structural (the pivot at the anchor in the hand's world frame)",
       (dp.matrix_world.translation - dhand.matrix_world @ V(m.GRIP_ANCHOR)).length < 1e-6)

print("DIRECT_FAILS", len(fails))
sys.exit(1 if fails else 0)
"""
if HALF in ("all", "direct"):
  proc = subprocess.run(
    [BLENDER, "-b", "--factory-startup", "--python-expr", DIRECT, "--", SCRIPT],
    capture_output=True, text=True, timeout=420, cwd=ROOT,
  )
  for line in proc.stdout.splitlines():
    if line.startswith(("PASS", "FAIL", "DIRECT_FAILS")):
      print(line)
  if proc.returncode != 0 or "DIRECT_FAILS 0" not in proc.stdout:
    print("direct half failed; stderr tail:", proc.stderr[-1200:])
    failures += 1


# ── half 2: render jobs over the real worker ──
def run_job(job_id, cast, shot_type="CLOSEUP", pose_start="SLASH", pose_end="SLASH"):
    shot = {
        "number": 1,
        "description": "grip smoke shot",
        "shotType": shot_type, "lens": "50mm", "movement": "STATIC",
        "poseStart": pose_start, "poseEnd": pose_end,
        "lighting": "moonlit ridge", "duration": 1.0,
        "cast": cast,
    }
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Grip Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Grip Smoke", "visualStyle": "DONGHUA",
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


if HALF == "direct":
    print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - grip smoke (direct half)")
    sys.exit(0 if failures == 0 else 1)

def hero_dna(name, weapon):
    return {
        "name": name, "hairColor": "#1B1B2A", "hairStyle": "long",
        "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
        "weaponType": weapon, "bladeColor": "#5eead4", "build": "lean", "beard": False,
        "sheetFields": ["hairStyle", "hairColor"], "conformFactor": 0.75,
        "silhouetteShape": {"height": 1.02, "shoulders": 0.94, "torso": 0.97, "sleeves": 1.06, "skirt": 1.0, "hair": 1.08, "fields": ["flowing"]},
        "faceShape": "oval",
        "faceProfile": {"jawTaper": 0.92, "chinFwd": 0.88, "browFwd": 0.9, "cheekOut": 0.85, "noseLen": 0.95, "eyeScale": 1.12},
        "materialProfile": {"skinSss": 0.3, "skinRough": 0.42, "skinWarmth": 0.25, "rim": 0.35, "clothRamp": 0.4, "clothSheen": 0.3, "clothWeave": 0.2, "hairRough": 0.35},
        "hairShade": {"melanin": 0.82, "redness": 0.12, "radial": 0.3, "longitudinal": 0.25},
        "skinDepth": {"weight": 0.42, "radius": 0.66, "scale": 0.4, "coat": 0.08, "coatRough": 0.47},
        "groomProfile": {"sweep": 0.1, "flow": 0.55, "flyaway": 0.35, "taper": 0.85, "fields": ["flowing"]},
    }

# the INDEPENDENTLY derived expected grip hash (the hand-built key)
def indep_hash():
    kinds = []
    SPEC = {
        "sword": {"tilt": -55.0, "hold": 0.0, "hilt": 0.14, "guard": 0.076},
        "staff": {"tilt": -72.0, "hold": 0.25, "hilt": 0.0, "guard": 0.0},
        "spear": {"tilt": -72.0, "hold": 0.2, "hilt": 0.0, "guard": 0.0},
        "blade": {"tilt": -72.0, "hold": 0.0, "hilt": 0.0, "guard": 0.0},
    }
    for k, s in SPEC.items():
        t = math.radians(s["tilt"])
        uy, uz = round(math.sin(t), 4), round(-math.cos(t), 4)
        kinds.append(f"{k}:tilt={s['tilt']:.4f},hold={s['hold']:.4f},hilt={s['hilt']:.4f},guard={s['guard']:.4f},u={uy:.4f},{uz:.4f}")
    key = f"97|A=0.0000,-0.0100,-0.0480|{'|'.join(kinds)}|v1"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]

EXPECT_GRIP = indep_hash()

state = run_job("grip-smoke-slash", [hero_dna("Grip Smoke Hero", "sword")])
rig = state.get("rig") or {}
grip = rig.get("grip")
expect("the slash render names the grip evidence", isinstance(grip, dict), json.dumps(rig)[:260])
if isinstance(grip, dict):
    expect("the grip names the kind, the hand, the anchor and the law version",
           grip.get("kind") == "sword" and grip.get("hand") == "R"
           and grip.get("anchor") == [0.0, -0.01, -0.048] and grip.get("lawVersion") == 97,
           json.dumps(grip))
    expect("the grip hash matches the INDEPENDENT derivation (one law, two runtimes)",
           grip.get("hash") == EXPECT_GRIP, f"{grip.get('hash')} vs {EXPECT_GRIP}")
    expect("the contact is STRUCTURAL (the pivot built)",
           grip.get("contact") is True, json.dumps(grip))
legik = rig.get("legIk")
expect("the legIk evidence rides beside (iteration 96 regression)",
       isinstance(legik, dict) and legik.get("lawVersion") == 96
       and (legik.get("table") or {}).get("SLASH", {}).get("penAfter") == 0.0,
       json.dumps(legik or {})[:160])
clip = os.path.join(OUT_DIR, "grip-smoke-slash.mp4")
expect("the clip rendered", os.path.exists(clip) and os.path.getsize(clip) > 0)

state_b = run_job("grip-smoke-slash-b", [hero_dna("Grip Smoke Hero", "sword")])
grip_b = (state_b.get("rig") or {}).get("grip")
expect("the same shot lands the same grip hash (A/B over the real worker)",
       isinstance(grip_b, dict) and grip_b.get("hash") == EXPECT_GRIP,
       json.dumps(grip_b or {})[:160])

state_staff = run_job("grip-smoke-staff", [hero_dna("Grip Smoke Sage", "staff")])
grip_staff = (state_staff.get("rig") or {}).get("grip")
expect("the staff render names its own kind under the SAME law hash",
       isinstance(grip_staff, dict) and grip_staff.get("kind") == "staff"
       and grip_staff.get("hash") == EXPECT_GRIP and grip_staff.get("contact") is True,
       json.dumps(grip_staff or {})[:200])
clip_staff = os.path.join(OUT_DIR, "grip-smoke-staff.mp4")
expect("the staff clip rendered", os.path.exists(clip_staff) and os.path.getsize(clip_staff) > 0)

# cleanup
for f in ("grip-smoke-slash", "grip-smoke-slash-b", "grip-smoke-staff"):
    p = os.path.join(OUT_DIR, f + ".mp4")
    if os.path.exists(p):
        os.remove(p)
    jf = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(jf):
        os.remove(jf)
expect("cleanup removed the smoke artifacts",
       not os.path.exists(os.path.join(OUT_DIR, "grip-smoke-slash.mp4"))
       and not os.path.exists(os.path.join(OUT_DIR, ".job-grip-smoke-staff.json")))

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - grip smoke (render half)")
sys.exit(0 if failures == 0 else 1)
