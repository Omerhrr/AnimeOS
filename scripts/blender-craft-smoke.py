#!/usr/bin/env python3
# Smoke-test THE FIGURE IS CRAFTED, NOT ASSEMBLED (iteration 106, the
# gate's remaining work order: the vision scorer still read "a low-poly
# 3D robot") inside the REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the
#      canonical craft key + hash mirroring the sha256-16 formula over
#      the hand-built key; the CRAFT law on a REAL DESIGNED figure -
#      every organic box (brows, mouth, skirt panels, sash tail,
#      palms, guard, blade) carries a CraftBevel modifier and smooth
#      shading; the fingers/thumbs are ROUNDED CAPSULES (no 8-vertex
#      cubes in the hands); the curved primitives ride 24 segments
#      (the torso cylinder's vertex count proves it); the RIG CONTRACT
#      rides untouched (the anchors at their proven coordinates, the
#      GripPivot at the law's anchor, the head sculpt's faceHash
#      stable across builds); A/B determinism of the whole build.
#   2. RENDER JOBS over the real worker: the sword closeup names the
#      rig's craft evidence (version 106, the softened count, the
#      16-hex hash matching the independent derivation) with the grip
#      evidence riding beside (iteration 97 regression); the clip
#      renders; cleanup.
import hashlib
import json, os, subprocess, sys, time, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT_DIR = os.path.join(ROOT, "public", "renders")
os.makedirs(OUT_DIR, exist_ok=True)

BLENDER = next(p for p in ("/home/z/blender-5.2.2-linux-x64/blender", "/usr/local/bin/blender") if os.path.exists(p))
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

# ── the canonical craft key + hash against the hand-built key ──
def indep_key():
    bevels = {
        "blade": 0.0008, "brow": 0.0025, "finger": 0.0012, "guard": 0.002,
        "mouth": 0.0022, "palm": 0.0025, "sashTail": 0.004, "skirt": 0.006,
        "thumb": 0.0012,
    }
    parts = ",".join(f"{k}={v:.4f}" for k, v in sorted(bevels.items()))
    return f"106|bevel:{parts}|seg:2|cyl:24|v1"

EXPECT_KEY = indep_key()
ok("the canonical craft key mirrors the hand-built key field for field",
   m.craft_key() == EXPECT_KEY, f"{m.craft_key()} vs {EXPECT_KEY}")
EXPECT_HASH = hashlib.sha256(EXPECT_KEY.encode("utf-8")).hexdigest()[:16]
ok("the craft hash matches the independent derivation",
   m.craft_hash() == EXPECT_HASH, f"{m.craft_hash()} vs {EXPECT_HASH}")

DNA = {
    "name": "Craft Smoke Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
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

def build_once(dna):
    mats = {
        "robe": m.principled_mat(bpy, "RobeMat", "#2F6D63"),
        "accent": m.principled_mat(bpy, "AccentMat", "#A8842C"),
        "skin": m.principled_mat(bpy, "SkinMat", "#D9B48F"),
        "hair": m.principled_mat(bpy, "HairMat", "#1B1B2A"),
        "blade": m.emission_mat(bpy, "BladeMat", "#5eead4", 4.0),
        "boots": m.principled_mat(bpy, "BootsMat", "#241a12"),
    }
    return m.build_designed_figure(bpy, bpy.context.scene, dna, mats, strand_f=1.0)

def objects_of(figure):
    names = {}
    def walk(e):
        for ch in bpy.data.objects:
            pass
    # collect the MESH objects by name prefix via the scene
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH":
            names[ob.name] = ob
    return names

scn = bpy.context.scene
fig = build_once(DNA)
meshes = {ob.name: ob for ob in scn.objects if ob.type == "MESH"}

# ── the craft law on the real build ──
ORGANIC_BOXES = ["BrowLMesh", "BrowRMesh", "MouthMesh", "SashTail",
                 "RPalmMesh", "LPalmMesh", "BladeGuard", "HandBlade"]
missing = [n for n in ORGANIC_BOXES if n not in meshes]
ok("every organic box part built", not missing, f"missing {missing}")
bevel_missing = [n for n in ORGANIC_BOXES
                 if n in meshes and not any(mod.type == "BEVEL" and mod.name == "CraftBevel" for mod in meshes[n].modifiers)]
ok("every organic box carries the CraftBevel modifier", not bevel_missing, f"no bevel on {bevel_missing}")
smooth_missing = [n for n in ORGANIC_BOXES
                  if n in meshes and not all(p.use_smooth for p in meshes[n].data.polygons)]
ok("every organic box smooth-shades", not smooth_missing, f"flat faces on {smooth_missing}")

panels = [n for n in meshes if n.startswith("SkirtPanel")]
ok("all eight skirt panels built", len(panels) == 8, f"found {len(panels)}")
panel_ok = all(
    any(mod.type == "BEVEL" and mod.name == "CraftBevel" for mod in meshes[n].modifiers)
    and any(mod.type == "SUBSURF" and mod.name == "CraftSubsurf" for mod in meshes[n].modifiers)
    for n in panels)
ok("every skirt panel is beveled AND subdivided cloth", panel_ok)

# ── the fingers grow as rounded capsules ──
finger_meshes = [n for n in meshes if "Finger" in n or "Index" in n or "Thumb" in n]
ok("the ten finger/thumb meshes built", len(finger_meshes) == 10, f"found {sorted(finger_meshes)}")
square = [n for n in finger_meshes if len(meshes[n].data.vertices) == 8]
ok("no square robotic segments in the hands (no 8-vertex cubes)", not square, f"cubes: {square}")
round_ok = all(
    any(mod.type == "BEVEL" for mod in meshes[n].modifiers) for n in finger_meshes)
ok("every finger/thumb carries the craft bevel (rounded caps)", round_ok)

# ── the curved primitives lift to 24 segments ──
# the topology-true read: the CAP NGON carries one corner per segment
# (vertex-count layouts vary across Blender versions, the ngon does not)
def ngon_corners(ob, want):
    if ob is None:
        return False
    for p in ob.data.polygons:
        if len(p.vertices) == want:
            return True
    return False

torso = meshes.get("TorsoMesh")
ok("the torso is a 24-segment cylinder", ngon_corners(torso, 24),
   f"polys={sorted({len(p.vertices) for p in torso.data.polygons}) if torso else 'missing'}")
sleeve = meshes.get("RSleeve")
ok("the sleeve is a 24-segment cone", ngon_corners(sleeve, 24),
   f"polys={sorted({len(p.vertices) for p in sleeve.data.polygons}) if sleeve else 'missing'}")

# ── the rig contract rides untouched ──
empties = {ob.name: ob for ob in scn.objects if ob.type == "EMPTY"}
need_anchors = ["Root", "Pelvis", "Spine", "Head", "RShoulder", "RElbow",
                "LShoulder", "LElbow", "RHip", "RKnee", "LHip", "LKnee",
                "RHand", "LHand", "EyeL", "EyeR", "BrowL", "BrowR", "Mouth"]
anchor_missing = [n for n in need_anchors if n not in empties]
ok("the rig anchors all built", not anchor_missing, f"missing {anchor_missing}")
pel = empties.get("Pelvis")
ok("the Pelvis anchor keeps its proven coordinate",
   pel is not None and all(abs(a - b) < 1e-6 for a, b in zip(pel.location, (0.0, 0.0, 1.02))),
   str(list(pel.location) if pel else "missing"))
grip_pivot = empties.get("GripPivot")
ok("the GripPivot sits at the grip law's anchor",
   grip_pivot is not None and all(abs(a - b) < 1e-6 for a, b in zip(grip_pivot.location, m.GRIP_ANCHOR)),
   str(list(grip_pivot.location) if grip_pivot else "missing"))

craft = fig.get("craft") if isinstance(fig, dict) else None
ok("the figure names the craft evidence",
   isinstance(craft, dict) and craft.get("version") == 106 and craft.get("softened") == 26
   and craft.get("hash") == EXPECT_HASH, json.dumps(craft or {})[:300])

# ── the head sculpt's proven law rides untouched: A/B faceHash ──
face_a = (fig.get("sculpt") or {}).get("faceHash") if isinstance(fig, dict) else None
# purge and rebuild - the same DNA must land the same sculpt
for ob in list(scn.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
fig_b = build_once(DNA)
face_b = (fig_b.get("sculpt") or {}).get("faceHash") if isinstance(fig_b, dict) else None
craft_b = fig_b.get("craft") if isinstance(fig_b, dict) else None
ok("the head sculpt's faceHash is STABLE across builds (A/B determinism)",
   face_a and face_a == face_b, f"{face_a} vs {face_b}")
ok("the rebuild lands the same craft hash",
   isinstance(craft_b, dict) and craft_b.get("hash") == EXPECT_HASH,
   json.dumps(craft_b or {})[:160])

print(f"DIRECT_FAILS {json.dumps(fails)}")
"""
if HALF in ("all", "direct"):
    r = subprocess.run([BLENDER, "-b", "--python-expr", DIRECT, "--", SCRIPT],
                       capture_output=True, text=True, timeout=600, cwd=ROOT)
    for line in r.stdout.splitlines():
        if line.startswith(("PASS", "FAIL", "DIRECT_FAILS")):
            print(line)
            if line.startswith("FAIL"):
                failures += 1
    if r.returncode != 0:
        print("FAIL direct half crashed")
        print(r.stderr[-2000:])
        failures += 1
    if "DIRECT_FAILS" in r.stdout:
        try:
            inner = json.loads(r.stdout.split("DIRECT_FAILS ", 1)[1].splitlines()[0])
            failures += len(inner)
        except Exception:
            pass

if HALF == "direct":
    print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - craft smoke (direct half)")
    sys.exit(0 if failures == 0 else 1)


# ── half 2: render jobs over the real worker ──
def run_job(job_id, cast, shot_type="CLOSEUP", pose_start="SLASH", pose_end="SLASH"):
    shot = {
        "number": 1,
        "description": "craft smoke shot",
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
                "number": 1, "title": "Craft Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Craft Smoke", "visualStyle": "DONGHUA",
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
        capture_output=True, text=True, timeout=480, cwd=ROOT,
    )
    elapsed = time.time() - t0
    print(f"[{job_id}] worker exit={proc.returncode} elapsed={elapsed:.1f}s")
    if proc.returncode != 0:
        print("STDERR tail:", proc.stderr[-1500:])
        sys.exit(1)
    with open(job_file) as fh:
        return json.load(fh)


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


# the INDEPENDENTLY derived expected craft hash (the hand-built key)
def indep_hash():
    bevels = {
        "blade": 0.0008, "brow": 0.0025, "finger": 0.0012, "guard": 0.002,
        "mouth": 0.0022, "palm": 0.0025, "sashTail": 0.004, "skirt": 0.006,
        "thumb": 0.0012,
    }
    parts = ",".join(f"{k}={v:.4f}" for k, v in sorted(bevels.items()))
    key = f"106|bevel:{parts}|seg:2|cyl:24|v1"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]

EXPECT_CRAFT = indep_hash()

state = run_job("craft-smoke-closeup", hero_dna("Craft Smoke Hero", "sword"))
rig = state.get("rig") or {}
craft = rig.get("craft")
expect("the closeup render names the craft evidence",
       isinstance(craft, dict) and craft.get("version") == 106,
       json.dumps(list(rig.keys()))[:200])
if isinstance(craft, dict):
    expect("the craft evidence names the softened parts and the law hash (26 for a sword build)",
           craft.get("softened", 0) == 26 and craft.get("hash") == EXPECT_CRAFT,
           f"softened={craft.get('softened')} hash={craft.get('hash')} vs {EXPECT_CRAFT}")
    expect("the craft bevel table rides the evidence",
           craft.get("bevels", {}).get("skirt") == 0.006 and craft.get("cylSegments") == 24,
           json.dumps(craft.get("bevels") or {}))
grip = rig.get("grip")
expect("the grip evidence rides beside (iteration 97 regression)",
       isinstance(grip, dict) and grip.get("kind") == "sword" and grip.get("contact") is True,
       json.dumps(grip or {})[:160])
sculpt = rig.get("sculpt")
expect("the head sculpt evidence rides beside (iterations 82/90 regression)",
       isinstance(sculpt, dict) and sculpt.get("faceShape") == "oval" and sculpt.get("depth") == 5,
       json.dumps({k: sculpt.get(k) for k in ("faceShape", "depth")} if isinstance(sculpt, dict) else {}))
clip = os.path.join(OUT_DIR, "craft-smoke-closeup.mp4")
expect("the clip rendered", os.path.exists(clip) and os.path.getsize(clip) > 0)

# cleanup
for f in ("craft-smoke-closeup",):
    p = os.path.join(OUT_DIR, f + ".mp4")
    if os.path.exists(p):
        os.remove(p)
    jf = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(jf):
        os.remove(jf)
expect("cleanup removed the smoke artifacts",
       not os.path.exists(os.path.join(OUT_DIR, "craft-smoke-closeup.mp4")))

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - craft smoke (render half)")
sys.exit(0 if failures == 0 else 1)
