#!/usr/bin/env python3
# Smoke-test THE FEET STAY PLANTED (iteration 96, the two-bone leg IK)
# inside the REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the solve
#      law against an INDEPENDENT derivation (the smoke's own trig,
#      never the bridge's functions); the fold law (a fired solve
#      never lowers the knee below the table's angle) over the whole
#      vocabulary AND over interpolated frame grids; the plant law
#      (zero residual across the vocabulary); the clearance law (the
#      leap tuck and the lunge heel are named floats, never fixed);
#      the clamp law (a synthetic deep pose clamps at KNEE_MAX and
#      the root takes the residual); the canonical key + hash
#      mirroring the sha256-16 formula over the hand-built key; the
#      walk-swing determinism; the apply_pose integration on a REAL
#      stand-in rig (the solved knees land on the empties, the root
#      takes the lift).
#   2. RENDER JOBS over the real worker: the DETERMINED pair
#      CROUCH->RISE (the readings' named frontier) names the rig's
#      legIk evidence with the hash matching the independent
#      derivation, the table's penetration named before AND after,
#      and the applied report proving every frame solved with zero
#      residual; the STANCE->LEAP clip stays honest (nothing
#      penetrated, nothing solved); A/B determinism; the clips
#      render; cleanup.
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

D = math.degrees
R = math.radians

# ── the INDEPENDENT derivation: the smoke's own two-bone solve ──
def indep_solve(root_y, thigh, knee, bob=0.0,
                L1=m.LEG_IK_UPPER, L2=m.LEG_IK_LOWER,
                hip_stand=m.LEG_IK_HIP_STAND, kmax=m.LEG_IK_KNEE_MAX):
    hip = hip_stand + root_y + bob
    drop = L1 * math.cos(R(thigh)) + L2 * math.cos(R(knee - thigh))
    pen = round(drop - hip, 3)
    if pen <= 0:
        return {"knee": round(knee, 3), "pen": pen, "residual": 0.0,
                "clearance": 0.0 if pen == 0 else round(hip - drop, 3), "solved": False}
    rhs = max(-1.0, min(1.0, (hip - L1 * math.cos(R(thigh))) / L2))
    knee_s = round(min(kmax, thigh + D(math.acos(rhs))), 3)
    drop_s = L1 * math.cos(R(thigh)) + L2 * math.cos(R(knee_s - thigh))
    return {"knee": knee_s, "pen": pen, "residual": round(max(0.0, drop_s - hip), 3),
            "clearance": 0.0, "solved": True}

# the solve law over the whole vocabulary against the derivation
TABLE = m.leg_ik_table()
ok("the vocabulary solves the table row by row",
   all(
       TABLE[n]["kneeSolvedR"] == indep_solve(m.POSE_JOINTS[n][1], m.POSE_JOINTS[n][8], m.POSE_JOINTS[n][9])["knee"]
       and TABLE[n]["kneeSolvedL"] == indep_solve(m.POSE_JOINTS[n][1], m.POSE_JOINTS[n][10], m.POSE_JOINTS[n][11])["knee"]
       for n in m.LEG_IK_POSES),
   json.dumps(TABLE)[:300])

# the named frontier: the readings' crouch/RISE penetration, before AND after
ok("CROUCH names the penetration before and plants after",
   TABLE["CROUCH"]["penBefore"] > 0.1 and TABLE["CROUCH"]["penAfter"] == 0.0
   and TABLE["CROUCH"]["kneeSolvedR"] > TABLE["CROUCH"]["kneeTableR"]
   and TABLE["CROUCH"]["kneeSolvedL"] > TABLE["CROUCH"]["kneeTableL"],
   json.dumps(TABLE["CROUCH"]))
ok("RISE names the penetration before and plants after",
   TABLE["RISE"]["penBefore"] > 0.15 and TABLE["RISE"]["penAfter"] == 0.0,
   json.dumps(TABLE["RISE"]))
ok("FALL plants through the fold (the deepest drop, still zero residual)",
   TABLE["FALL"]["penBefore"] > 0.5 and TABLE["FALL"]["penAfter"] == 0.0
   and TABLE["FALL"]["kneeSolvedR"] <= m.LEG_IK_KNEE_MAX,
   json.dumps(TABLE["FALL"]))

# the plant law: zero residual across the whole vocabulary
ok("the whole vocabulary plants (penAfter 0 everywhere, no root lift)",
   all(TABLE[n]["penAfter"] == 0.0 and TABLE[n]["rootLift"] == 0.0 for n in m.LEG_IK_POSES),
   json.dumps({n: TABLE[n]["penAfter"] for n in m.LEG_IK_POSES}))

# the clearance law: the leap tuck and the lunge heel are floats, never fixed
ok("LEAP floats honestly (no solve, the clearance named)",
   TABLE["LEAP"]["penBefore"] <= 0.0 and TABLE["LEAP"]["kneeSolvedR"] == TABLE["LEAP"]["kneeTableR"],
   json.dumps(TABLE["LEAP"]))
ok("LUNGE's heel floats (the pose's own read, no solve)",
   TABLE["LUNGE"]["penBefore"] <= 0.0 and TABLE["LUNGE"]["kneeSolvedR"] == TABLE["LUNGE"]["kneeTableR"],
   json.dumps(TABLE["LUNGE"]))

# the fold law over interpolated frame grids (the pairs the presets drive)
def grid(start, end, steps=25):
    worst_violation = None
    for i in range(steps):
        t = i / (steps - 1)
        row = m.lerp_pose(start, end, t)
        root_y = row[1]
        for (thigh, knee_tab) in ((row[8], row[9]), (row[10], row[11])):
            s = m.solve_leg_ik(root_y, thigh, knee_tab)
            if s["solved"] and s["knee"] < knee_tab - 1e-9:
                worst_violation = (start, end, t, thigh, knee_tab, s)
            if s["residual"] > 0.0:
                worst_violation = worst_violation or ("residual", start, end, t, s)
    return worst_violation

ok("the fold law holds over STANCE->CROUCH (never extends a fired solve)",
   grid("STANCE", "CROUCH") is None)
ok("the fold law holds over CROUCH->RISE (the DETERMINED pair)",
   grid("CROUCH", "RISE") is None)
ok("the fold law holds over FALL->RISE (the RECOVER pair)",
   grid("FALL", "RISE") is None)
ok("the fold law holds over STANCE->FALL (the WOUNDED pair)",
   grid("STANCE", "FALL") is None)

# the clamp law: a synthetic deep pose clamps the knee and the root takes it
deep = m.solve_leg_ik(-1.0, 10.0, 10.0)
deep_ind = indep_solve(-1.0, 10.0, 10.0)
ok("a deep synthetic pose clamps at KNEE_MAX and names the residual",
   deep["knee"] == m.LEG_IK_KNEE_MAX and deep["residual"] == deep_ind["residual"] > 0.0,
   json.dumps(deep))
ok("the vocabulary itself never clamps (the residual law is for the wild)",
   all(m.solve_leg_ik(m.POSE_JOINTS[n][1], m.POSE_JOINTS[n][8], m.POSE_JOINTS[n][9])["residual"] == 0.0
       and m.solve_leg_ik(m.POSE_JOINTS[n][1], m.POSE_JOINTS[n][10], m.POSE_JOINTS[n][11])["residual"] == 0.0
       for n in m.LEG_IK_POSES))

# the walk swing: the effective thigh rides the solve, deterministically
a = m.solve_leg_ik(0.0, 28.0 + 22.0, 12.0, bob=0.045)
b = m.solve_leg_ik(0.0, 28.0 + 22.0, 12.0, bob=0.045)
c = m.solve_leg_ik(0.0, 28.0 - 22.0, 12.0, bob=0.02)
ok("the walk swing's solve is deterministic (same inputs, same knees)",
   a == b, json.dumps(a))
ok("the stride's floats are named, never solved (both swing extremes clear)",
   a["solved"] is False and c["solved"] is False and a["clearance"] > 0.0 and c["clearance"] > 0.0,
   json.dumps([a, c]))

# the canonical key + hash against the hand-built key (independent)
def indep_key():
    rows = []
    for n in m.LEG_IK_POSES:
        j = m.POSE_JOINTS[n]
        sr = indep_solve(j[1], j[8], j[9])
        sl = indep_solve(j[1], j[10], j[11])
        res = round(max(sr["residual"], sl["residual"]), 3)
        rows.append(f"{n}:r={float(j[9]):.3f},{sr['knee']:.3f};l={float(j[11]):.3f},{sl['knee']:.3f};res={res:.3f};lift={res:.3f}")
    return (f"{m.LEG_IK_VERSION}|L1={m.LEG_IK_UPPER:.3f}|L2={m.LEG_IK_LOWER:.3f}"
            f"|HIP={m.LEG_IK_HIP_STAND:.3f}|KMAX={m.LEG_IK_KNEE_MAX:.3f}"
            f"|{'|'.join(rows)}|v1")

EXPECT_KEY = indep_key()
ok("the canonical key mirrors the hand-built key field for field",
   m.leg_ik_key() == EXPECT_KEY, m.leg_ik_key()[:220])
ok("the hash mirrors the sha256-16 formula over that key",
   m.leg_ik_hash() == hashlib.sha256(EXPECT_KEY.encode("utf-8")).hexdigest()[:16],
   m.leg_ik_hash())
ok("the hash is 16 hex", len(m.leg_ik_hash()) == 16)

# sensitivity: a law constant move moves the hash (the versioned law)
old_upper = m.LEG_IK_UPPER
try:
    m.LEG_IK_UPPER = 0.47
    ok("a chain-constant move moves the hash (the law's own truth)",
       m.leg_ik_hash() != hashlib.sha256(EXPECT_KEY.encode("utf-8")).hexdigest()[:16])
finally:
    m.LEG_IK_UPPER = old_upper

# A/B determinism
ok("the same law lands the same hash twice (A/B)",
   m.leg_ik_hash() == m.leg_ik_hash())

# ── the apply_pose integration on a REAL stand-in rig ──
mat = bpy.data.materials.new("SmokeMat")
mat.use_nodes = True
bl = bpy.data.materials.new("SmokeBlade")
bl.use_nodes = True
fig = m.build_stand_in_figure(bpy, bpy.context.scene, mat, bl)

def apply(pose_s, pose_e, t, t_sec=0.0):
    m.apply_pose(fig, pose_s, pose_e, t, t_sec)

# STANCE rests: no solve, the knees keep the table's 4 degrees
apply("STANCE", "STANCE", 1.0)
ok("a standing frame keeps the table's knees (nothing penetrated)",
   abs(fig["rKnee"].rotation_euler.x - R(4.0)) < 1e-6
   and abs(fig["root"].location.z - 0.0) < 1e-9,
   f"{fig['rKnee'].rotation_euler.x} / {fig['root'].location.z}")

# CROUCH at full: the knees take the SOLVED angles, the root the lift
apply("CROUCH", "CROUCH", 1.0)
sr = m.solve_leg_ik(-0.40, 70.0, 95.0)
sl = m.solve_leg_ik(-0.40, 55.0, 90.0)
lift = max(sr["residual"], sl["residual"])
ok("the crouch frame wears the solved knees (fold law on the rig)",
   abs(fig["rKnee"].rotation_euler.x - R(sr["knee"])) < 1e-6
   and abs(fig["lKnee"].rotation_euler.x - R(sl["knee"])) < 1e-6,
   f"{D(fig['rKnee'].rotation_euler.x)} vs {sr['knee']}")
ok("the crouch frame's root takes the residual lift (zero here)",
   abs(fig["root"].location.z - (-0.40 + lift) * 0.45) < 1e-6,
   f"{fig['root'].location.z}")

# the boots' world height: the sole rests at its built plane, NOT below
# (the shin's own tilt rides the measurement: the shin's world angle is
# the solved knee minus the thigh, and the sole hangs 0.46 down THAT axis)
bpy.context.view_layer.update()
shin_world_r = sr["knee"] - 70.0
sole_r = (fig["rKnee"].matrix_world.translation.z
          - m.LEG_IK_LOWER * 0.45 * math.cos(R(shin_world_r)))
ok("the solved crouch plants the right sole at the built rest plane",
   abs(sole_r - (1.00 - 0.92) * 0.45) < 0.004,
   f"{sole_r} vs {(1.00 - 0.92) * 0.45}")

# the aggregate rode the frames
agg = fig.get("_legik") or {}
ok("the frame aggregate names the solves it fired",
   agg.get("frames") == 2 and agg.get("solvedFrames") == 1
   and agg.get("maxPenBefore") == round(max(sr["pen"], sl["pen"]), 3)
   and agg.get("maxResidual") == 0.0,
   json.dumps(agg))

# the deep pose through the rig: the root lifts by the residual
apply("STANCE", "STANCE", 0.0)
m.POSE_JOINTS["SMOKEDEEP"] = (0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 10.0, 10.0, 10.0, 10.0)
try:
    apply("SMOKEDEEP", "SMOKEDEEP", 1.0)
    deep_r = m.solve_leg_ik(-1.0, 10.0, 10.0)
    ok("the deep pose lifts the root by the residual (the root takes what the knee cannot)",
       abs(fig["root"].location.z - (-1.0 + deep_r["residual"]) * 0.45) < 1e-6
       and abs(fig["rKnee"].rotation_euler.x - R(m.LEG_IK_KNEE_MAX)) < 1e-6,
       f"root {fig['root'].location.z} knee {D(fig['rKnee'].rotation_euler.x)}")
finally:
    del m.POSE_JOINTS["SMOKEDEEP"]

print("DIRECT_FAILS", len(fails))
sys.exit(1 if fails else 0)
"""
if HALF in ("all", "direct"):
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
def run_job(job_id, cast, pose_start, pose_end, shot_type="CLOSEUP", duration=1.3):
    shot = {
        "number": 1,
        "description": "leg ik smoke shot",
        "shotType": shot_type, "lens": "50mm", "movement": "STATIC",
        "poseStart": pose_start, "poseEnd": pose_end,
        "lighting": "moonlit ridge", "duration": duration,
        "cast": cast,
    }
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Leg Ik Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Leg Ik Smoke", "visualStyle": "DONGHUA",
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
    print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - leg-ik smoke (direct half)")
    sys.exit(0 if failures == 0 else 1)

HERO = {
    "name": "Leg Ik Smoke Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "sword", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle", "hairColor"], "conformFactor": 0.75,
    "silhouetteShape": {"height": 1.02, "shoulders": 0.94, "torso": 0.97, "sleeves": 1.06, "skirt": 1.0, "hair": 1.08, "fields": ["flowing"]},
    "faceShape": "oval",
    "faceProfile": {"jawTaper": 0.92, "chinFwd": 0.88, "browFwd": 0.9, "cheekOut": 0.85, "noseLen": 0.95, "eyeScale": 1.12},
    "materialProfile": {"skinSss": 0.3, "skinRough": 0.42, "skinWarmth": 0.25, "rim": 0.35, "clothRamp": 0.4, "clothSheen": 0.3, "clothWeave": 0.2, "hairRough": 0.35},
    "hairShade": {"melanin": 0.82, "redness": 0.12, "radial": 0.3, "longitudinal": 0.25},
    "skinDepth": {"weight": 0.42, "radius": 0.66, "scale": 0.4, "coat": 0.08, "coatRough": 0.47},
    "groomProfile": {"sweep": 0.1, "flow": 0.55, "flyaway": 0.35, "taper": 0.85, "fields": ["flowing"]},
}

# the INDEPENDENTLY derived expected hash: the smoke solves the whole
# vocabulary with its own trig (never the bridge's functions)
R = math.radians
D = math.degrees
L1 = L2 = 0.46
def indep_solve(root_y, thigh, knee, bob=0.0):
    hip = 0.92 + root_y + bob
    drop = L1 * math.cos(R(thigh)) + L2 * math.cos(R(knee - thigh))
    pen = round(drop - hip, 3)
    if pen <= 0:
        return round(knee, 3), 0.0
    rhs = max(-1.0, min(1.0, (hip - L1 * math.cos(R(thigh))) / L2))
    knee_s = round(min(130.0, thigh + D(math.acos(rhs))), 3)
    drop_s = L1 * math.cos(R(thigh)) + L2 * math.cos(R(knee_s - thigh))
    return knee_s, round(max(0.0, drop_s - hip), 3)

POSES = ["STANCE", "WALK", "LUNGE", "SLASH", "CAST", "DRAW", "BLOCK", "LEAP", "CROUCH", "FALL", "RISE", "BOW", "POINT"]
JOINTS = {
    "STANCE": (0.00,  0.00,   1,   0,    -8,    8,    8,    8,     0,   4,    0,   4),
    "WALK":   (0.10,  0.00,   2,   0,    18,   12,  -18,   12,    28,  12,  -14,   8),
    "LUNGE":  (0.35, -0.12,  10,  -3,   -95,    5,   35,   45,    55,  40,  -25,  10),
    "SLASH":  (0.10, -0.05,  -8,  -5,  -160,   20,  -30,   30,    10,  10,   -8,   6),
    "CAST":   (0.00,  0.02,  -4, -12,  -120,   50, -120,   50,     6,   6,   -6,   6),
    "DRAW":   (0.05, -0.03,   3,   2,   -85,   95,  -70,   12,    12,  14,  -10,   6),
    "BLOCK":  (0.00, -0.06,   6,   4,   -70,  100,  -60,  100,    20,  30,  -10,  15),
    "LEAP":   (0.15,  0.55,  -6,  -4,  -140,   20, -120,   20,    60,  70,   35,  55),
    "CROUCH": (0.05, -0.40,  18,   6,   -30,   40,  -20,   35,    70,  95,   55,  90),
    "FALL":   (0.05, -0.62,  32,  20,    40,   10,  -55,   15,    15,  45,    5,  30),
    "RISE":   (0.10, -0.25,  14,   4,   -20,   25,  -15,   20,    40,  60,   25,  40),
    "BOW":    (0.00, -0.04,  38,  22,    12,    6,   12,    6,     0,   2,    0,   2),
    "POINT":  (0.05,  0.00,   2,  -2,   -88,    4,   10,   12,     8,   6,   -6,   4),
}
rows = []
for n in POSES:
    j = JOINTS[n]
    kr, rr = indep_solve(j[1], j[8], j[9])
    kl, rl = indep_solve(j[1], j[10], j[11])
    res = round(max(rr, rl), 3)
    rows.append(f"{n}:r={float(j[9]):.3f},{kr:.3f};l={float(j[11]):.3f},{kl:.3f};res={res:.3f};lift={res:.3f}")
KEY = ("96|L1=0.460|L2=0.460|HIP=0.920|KMAX=130.000|" + "|".join(rows) + "|v1")
EXPECT_HASH = hashlib.sha256(KEY.encode("utf-8")).hexdigest()[:16]

# job 1: the DETERMINED pair the readings named (CROUCH->RISE)
state = run_job("legik-smoke-crouch", [HERO], "CROUCH", "RISE")
rig = state.get("rig") or {}
legik = rig.get("legIk")
expect("the crouch render names the legIk evidence", isinstance(legik, dict), json.dumps(rig)[:260])
if isinstance(legik, dict):
    expect("the law version rides (96) with the knee clamp",
           legik.get("lawVersion") == 96 and legik.get("kneeMax") == 130.0, json.dumps(legik)[:160])
    expect("the hash matches the INDEPENDENT derivation",
           legik.get("hash") == EXPECT_HASH, f"{legik.get('hash')} vs {EXPECT_HASH}")
    table = legik.get("table") or {}
    expect("the table names the frontier honestly (CROUCH before AND after)",
           table.get("CROUCH", {}).get("penBefore", 0) > 0.1 and table.get("CROUCH", {}).get("penAfter") == 0.0,
           json.dumps(table.get("CROUCH")))
    expect("the whole table planted (penAfter 0, no root lift)",
           all(v.get("penAfter") == 0.0 and v.get("rootLift") == 0.0 for v in table.values()),
           json.dumps(table)[:200])
applied = legik.get("applied") if isinstance(legik, dict) else None
expect("the applied report proves every frame solved with zero residual",
       isinstance(applied, dict) and applied.get("frames") == applied.get("solvedFrames")
       and applied.get("frames", 0) > 0 and applied.get("maxResidual") == 0.0
       and applied.get("maxRootLift") == 0.0 and applied.get("maxPenBefore", 0) > 0.1,
       json.dumps(applied))
clip = os.path.join(OUT_DIR, "legik-smoke-crouch.mp4")
expect("the clip rendered", os.path.exists(clip) and os.path.getsize(clip) > 0)

# job 2: A/B determinism over the wire
state_b = run_job("legik-smoke-crouch-b", [HERO], "CROUCH", "RISE")
legik_b = (state_b.get("rig") or {}).get("legIk")
expect("the same shot lands the same hash (A/B over the real worker)",
       isinstance(legik_b, dict) and legik_b.get("hash") == EXPECT_HASH,
       json.dumps(legik_b or {})[:160])

# job 3: the honest airborne (STANCE->LEAP: nothing penetrated, nothing solved)
state_leap = run_job("legik-smoke-leap", [HERO], "STANCE", "LEAP")
legik_leap = (state_leap.get("rig") or {}).get("legIk")
applied_leap = legik_leap.get("applied") if isinstance(legik_leap, dict) else None
expect("the leap clip stays honest (no solve fired, nothing penetrated)",
       isinstance(applied_leap, dict) and applied_leap.get("solvedFrames") == 0
       and applied_leap.get("maxPenBefore") <= 0.0,
       json.dumps(applied_leap))
clip_leap = os.path.join(OUT_DIR, "legik-smoke-leap.mp4")
expect("the leap clip rendered", os.path.exists(clip_leap) and os.path.getsize(clip_leap) > 0)

# cleanup
for f in ("legik-smoke-crouch", "legik-smoke-crouch-b", "legik-smoke-leap"):
    for ext in (".mp4",):
        p = os.path.join(OUT_DIR, f + ext)
        if os.path.exists(p):
            os.remove(p)
    jf = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(jf):
        os.remove(jf)
expect("cleanup removed the smoke artifacts",
       not os.path.exists(os.path.join(OUT_DIR, "legik-smoke-crouch.mp4"))
       and not os.path.exists(os.path.join(OUT_DIR, ".job-legik-smoke-crouch.json")))

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - leg-ik smoke (render half)")
sys.exit(0 if failures == 0 else 1)
