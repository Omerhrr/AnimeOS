# Smoke-test THE HAIR SHADES LIKE HAIR (iteration 89, the deeper groom
# - true curve hair) inside the REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the shade
#      validator derives the melanin physics from the sheet hex (dark
#      dye = high melanin, warm hex = redness, the roughness pair
#      follows), the wire-carried profile re-clamps against the same
#      bounds hair-shade.ts clamps against, the hash mirrors the TS
#      formula bit-exactly, the melanin material builds a Principled
#      Hair BSDF, and REAL hair curves grow off the guides under the
#      seed law (deterministic, LOD-lawful: wide keeps the cards).
#   2. RENDER JOBS over the real worker: a designed closeup rides the
#      curve evidence (curves grown, the shade + hash named); the same
#      build twice hashes the same; a wide framing keeps the mesh
#      cards only (no curves - honest).
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
spec = importlib.util.spec_from_file_location("bridge", sys.argv[-1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# the shade derivation from the hex: dark raven vs warm auburn
raven = m.hair_shade({"hairColor": "#1B1B2A"})
auburn = m.hair_shade({"hairColor": "#7A3B20"})
ok("a raven hex derives HIGH melanin (dark dye named)",
   raven["melanin"] > 0.72 and "dark dye" in raven["fields"] and raven["redness"] < 0.1, json.dumps(raven))
ok("an auburn hex derives the warm red (redness named)",
   auburn["redness"] > 0.25 and "warm red" in auburn["fields"], json.dumps(auburn))
ok("dark hair glosses, pale hair dulls (the roughness pair follows the melanin)",
   raven["radial"] < m.HAIR_SHADE_BASE["radial"], json.dumps(raven))
pale = m.hair_shade({"hairColor": "#E8DCC8"})
ok("a pale hex derives LOW melanin (pale dye named)", pale["melanin"] < 0.3 and "pale dye" in pale["fields"], json.dumps(pale))
ok("a missing hex keeps the neutral mid-brown dye honestly",
   m.hair_shade({})["melanin"] == m.HAIR_SHADE_BASE["melanin"] and m.hair_shade({})["fields"] == [])

# the wire-carried profile re-clamps (one law, two runtimes)
clamped = m.hair_shade({"hairShade": {"melanin": 5.0, "redness": -1.0, "radial": 0.4, "longitudinal": 0.44}, "hairColor": "#1B1B2A"})
ok("a wild wire profile clamps (melanin 5->1, redness -1->0) and keeps the hex's fields",
   clamped["melanin"] == 1.0 and clamped["redness"] == 0.0 and clamped["radial"] == 0.4, json.dumps(clamped))

# the hash mirrors the TS formula bit-exactly
key = "89|0.876|0.000|0.290|0.362|v1"
import math as _math
# compute the expected raven values through the same law
r = m.hair_shade({"hairColor": "#1B1B2A"})
key_actual = "89|{:.3f}|{:.3f}|{:.3f}|{:.3f}|v1".format(r["melanin"], r["redness"], r["radial"], r["longitudinal"])
expect_hash = hashlib.sha256(key_actual.encode()).hexdigest()[:16]
ok("the hair-shade hash mirrors hairShadeHash in hair-shade.ts (sha256-16)",
   m.hair_shade_hash(r) == expect_hash, f"{m.hair_shade_hash(r)} vs {expect_hash}")
ok("the same hex hashes the same twice (deterministic)", m.hair_shade_hash(r) == m.hair_shade_hash(r))
ok("a different hex hashes differently", m.hair_shade_hash(raven) != m.hair_shade_hash(auburn))
ok("the hash is 16 hex", len(m.hair_shade_hash(r)) == 16, m.hair_shade_hash(r))

# the ledger line
ok("the ledger line names the melanin and the hex's own read",
   "melanin" in m.hair_shade_line(raven) and ("named by the hex" in m.hair_shade_line(raven)), m.hair_shade_line(raven))

# the melanin material builds a Principled Hair BSDF
mat = m.build_hair_shade_material(bpy, "ShadeProbe", "#1B1B2A", raven)
hair_node = next((n for n in mat.node_tree.nodes if n.type == "BSDF_HAIR_PRINCIPLED"), None)
ok("the melanin material carries a Principled Hair BSDF", hair_node is not None)
if hair_node:
    # the 5.2.2 law: the hair node's sockets resolve BY NAME through
    # iteration (string-key access raises KeyError, .get returns None)
    by_name = {s.name: s for s in hair_node.inputs}
    mel = by_name.get("Melanin")
    red = by_name.get("Melanin Redness")
    rad = by_name.get("Radial Roughness")
    ok("the BSDF carries the shade (melanin + redness + roughness on the node)",
       mel is not None and abs(mel.default_value - raven["melanin"]) < 1e-6
       and red is not None and abs(red.default_value - raven["redness"]) < 1e-6
       and rad is not None and abs(rad.default_value - raven["radial"]) < 1e-6,
       f"melanin={mel.default_value if mel else None} radial={rad.default_value if rad else None}")

# REAL hair curves grow off the guides under the seed law
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
bpy.ops.object.armature_add(location=(0, 0, 0))
head = bpy.context.active_object
head.name = "HeadProbe"
gp = {"factors": {"sweep": 0.1, "flow": 0.55, "flyaway": 0.35, "taper": 0.85}, "fields": ["long hair"], "style": "long"}
mat2 = m.build_hair_shade_material(bpy, "ShadeProbe2", "#1B1B2A", raven)
ev_full = m.groom_hair_curves(scn, bpy, head, mat2, "long", 1.0, 1.0, gp, 1.0)
ok("the full LOD grows TRUE CURVES (real curve objects with spline points)",
   ev_full is not None and ev_full["curves"] > 0 and ev_full["curvePts"] > 0, json.dumps(ev_full or {}))
curves = [ob for ob in scn.collection.objects if ob.type == "CURVE"]
# iteration 94 re-point: the full LOD now grows the HERO strands -
# twelve-point splines with the flyaway pass riding (the standard
# 6-point curve is the MIDDLE framing's reduced level now).
ok("the curves are real CURVE objects with 12-point HERO splines, parented to the head",
   len(curves) == ev_full["curves"] and all(len(ob.data.splines[0].points) == 12 for ob in curves)
   and all(ob.parent is head for ob in curves), f"count={len(curves)}")
bevels = {round(ob.data.bevel_depth, 5) for ob in curves}
ok("the strands carry a real bevel radius (guides + flyaways render as strands, not lines)",
   len(bevels) >= 1 and all(b > 0.0 for b in bevels), str(bevels))
ok("the curves carry the melanin material",
   all(any(m2.get("hairShadeHash") == raven["hash"] for m2 in ob.data.materials) for ob in curves))

# determinism: rebuild into a fresh scene, the same curves land
n_before, pts_before = ev_full["curves"], ev_full["curvePts"]
first_pts = [tuple(round(v, 5) for v in ob.data.splines[0].points[2].co) for ob in curves[:4]]
for ob in list(curves):
    bpy.data.objects.remove(ob, do_unlink=True)
ev_again = m.groom_hair_curves(scn, bpy, head, mat2, "long", 1.0, 1.0, gp, 1.0)
curves2 = [ob for ob in scn.collection.objects if ob.type == "CURVE"]
again_pts = [tuple(round(v, 5) for v in ob.data.splines[0].points[2].co) for ob in curves2[:4]]
ok("the same DNA grooms the same curves (deterministic, hash-proven)",
   ev_again["curves"] == n_before and ev_again["curvePts"] == pts_before and first_pts == again_pts,
   f"{n_before} vs {ev_again['curves']}")

# the LOD law: a wide framing keeps the mesh cards only
ev_wide = m.groom_hair_curves(scn, bpy, head, mat2, "long", 1.0, 1.0, gp, 0.4)
ok("the WIDE framing keeps the mesh cards only (no curves - honest)",
   ev_wide is None, json.dumps(ev_wide or {}))
# a reduced framing carries fewer curves than the full one
for ob in list([ob for ob in scn.collection.objects if ob.type == "CURVE"]):
    bpy.data.objects.remove(ob, do_unlink=True)
ev_reduced = m.groom_hair_curves(scn, bpy, head, mat2, "long", 1.0, 1.0, gp, 0.7)
ok("the reduced framing carries fewer curves than the full one (the LOD scales the pass)",
   ev_reduced is not None and 0 < ev_reduced["curves"] < n_before, json.dumps(ev_reduced or {}))

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
def run_job(job_id, shot_type, hair_shade=None):
    shot = {
        "number": 1,
        "description": "groom smoke shot",
        "shotType": shot_type, "lens": "50mm", "movement": "STATIC",
        "poseStart": "STANCE", "poseEnd": "STANCE",
        "lighting": "tribulation lightning", "duration": 1.0,
        "cast": [HERO],
    }
    if hair_shade is not None:
        HERO["hairShade"] = hair_shade
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Groom Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Groom Smoke", "visualStyle": "DONGHUA",
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
    "name": "Groom Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "none", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle"], "conformFactor": 0.75,
}

state = run_job("groomcurve-smoke-close", "CLOSEUP")
rig = state.get("rig") or {}
shade_ev = rig.get("hairShade")
curve_ev = rig.get("hairCurves")
expect("the closeup build names the hair-shade evidence (the hex's own melanin)",
       isinstance(shade_ev, dict) and shade_ev.get("melanin", 0) > 0.72 and len(shade_ev.get("hash") or "") == 16,
       json.dumps(shade_ev)[:220])
expect("the closeup build grows the TRUE CURVES (the curve evidence rides)",
       isinstance(curve_ev, dict) and curve_ev.get("curves", 0) > 0 and curve_ev.get("curvePts", 0) > 0,
       json.dumps(curve_ev)[:220])
expect("the shade hash mirrors the TS formula over the REAL render",
       isinstance(shade_ev, dict) and shade_ev.get("hash") == __import__("hashlib").sha256(
           "89|{:.3f}|{:.3f}|{:.3f}|{:.3f}|v1".format(shade_ev["melanin"], shade_ev["redness"], shade_ev["radial"], shade_ev["longitudinal"]).encode()
       ).hexdigest()[:16], str(shade_ev.get("hash") if isinstance(shade_ev, dict) else None))
expect("the groom strands still ride beside the curves (the mesh cards stay)",
       isinstance(rig.get("groom"), dict) and rig["groom"].get("strands", 0) > 0, json.dumps(rig.get("groom"))[:200])

state2 = run_job("groomcurve-smoke-close-2", "CLOSEUP")
rig2 = (state2.get("rig") or {})
expect("the same hero's shade hashes the same over two real renders",
       (rig.get("hairShade") or {}).get("hash") == (rig2.get("hairShade") or {}).get("hash"),
       f"{(rig.get('hairShade') or {}).get('hash')} vs {(rig2.get('hairShade') or {}).get('hash')}")

state_w = run_job("groomcurve-smoke-wide", "WS")
rig_w = (state_w.get("rig") or {})
expect("the WIDE framing keeps the mesh cards only (no curve evidence - the LOD law)",
       rig_w.get("hairCurves") is None and isinstance(rig_w.get("groom"), dict), json.dumps(rig_w.get("hairCurves"))[:120])

for f in ("groomcurve-smoke-close", "groomcurve-smoke-close-2", "groomcurve-smoke-wide"):
    p = os.path.join(OUT_DIR, f"{f}.mp4")
    if os.path.exists(p):
        os.unlink(p)
    j = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(j):
        os.unlink(j)

print(f"\n{'ALL GREEN' if failures == 0 else f'{failures} FAILURE(S)'} - blender-hairshade-smoke")
sys.exit(1 if failures else 0)
