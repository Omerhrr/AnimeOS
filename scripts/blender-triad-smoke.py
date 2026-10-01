#!/usr/bin/env python3
# Smoke-test THE TRIAD (iteration 107 - the frontier the crafted
# night's distribution named) inside the REAL Blender worker, in two
# halves:
#   1. DIRECT (blender -b, the bridge imported as a module):
#      THE SURFACE - the cloth tree's ramp ends pull toward the
#      sheet palette's own dark/light members (bounded PALETTE_PULL),
#      the large-scale wash node rides at PALETTE_WASH, the palette
#      is stored on the material (animeosSheetPalette) and a regrade
#      without a palette reuses it; the no-palette tree is unchanged.
#      THE FACE - the hair cap opens the face band (the cap's front
#      reach stops above the brow line, the fringe's tip hangs no
#      lower than the brows); the eyes/brows/mouth/nose genuinely
#      protrude past the head ellipsoid (measured, in world units);
#      the deep planes carry FACE_RELIEF (the sculpt evidence names
#      it, the faceHash stable across builds).
#      THE PRESENCE - measure_subject returns the real box of a
#      built figure, and _Framing solves each shot type's distance
#      so the solved fill lands within eps of the law's fill.
#   2. RENDER JOBS over the real worker: a cast job's state names
#      the triad's evidence (rig.sculpt.relief, render.presence with
#      the measured subjectH + solved fill, the identity rows with
#      the sheet palette riding the conformance); the clip renders;
#      cleanup.
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

scn = bpy.context.scene

# ── THE SURFACE: the sheet's range rides the cloth tree ──
PROF = {"factors": {"skinSss": 0.3, "skinRough": 0.42, "skinWarmth": 0.25, "rim": 0.35,
                    "clothRamp": 0.4, "clothSheen": 0.3, "clothWeave": 0.2, "hairRough": 0.35},
        "fields": ["clothSheen"]}
PALETTE = ["#1c2a24", "#2F6D63", "#7fd4c0", "#A8842C", "#e8d9a8"]
mat_plain = m.graded_mat(bpy, "cloth", "PlainMat", "#2F6D63", PROF)
mat_sheet = m.graded_mat(bpy, "cloth", "SheetMat", "#2F6D63", PROF, palette=PALETTE)

ok("the no-palette tree stores an empty sheet palette",
   json.loads(mat_plain.get("animeosSheetPalette") or "[]") == [])

stored = json.loads(mat_sheet.get("animeosSheetPalette") or "[]")
ok("the palette tree stores the sheet palette on the material", stored == PALETTE, str(stored))

def mix_nodes(mat):
    return [n for n in mat.node_tree.nodes if n.type == "MIX_RGB"]
ok("the palette tree carries the extra wash mix node (3 mixes vs 2)",
   len(mix_nodes(mat_sheet)) == 3 and len(mix_nodes(mat_plain)) == 2,
   f"sheet={len(mix_nodes(mat_sheet))} plain={len(mix_nodes(mat_plain))}")

def bsdf_of(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")

def base_color_link(mat):
    b = bsdf_of(mat)
    for l in mat.node_tree.links:
        if l.to_node == b and l.to_socket.name == "Base Color":
            return l.from_node
    return None

# the last mix in the chain: palette build's Color1 is the sheet's mid member
last_sheet = base_color_link(mat_sheet)
last_plain = base_color_link(mat_plain)
# the DYE RAMP is the mix whose Color1 carries a constant (the chain head);
# the downstream mixes' Color1 sockets are linked (the fold rim, the wash)
def dye_ramp(mat):
    for n in mix_nodes(mat):
        linked = any(l.to_node == n and l.to_socket.name == "Color1" for l in mat.node_tree.links)
        if not linked:
            return n
    return None

head_plain = dye_ramp(mat_plain)
fm = dye_ramp(mat_sheet)
ok("the dye ramp mix found on both builds", head_plain is not None and fm is not None)
# the dye constants ride in LINEAR space (the bridge's hex_to_rgb owns
# the sRGB->linear transfer) - the same space the tree computes in
r, g, b = m.hex_to_rgb("#2F6D63")
expect_shadow = (r * (1.0 - 0.4 * 0.55), g * (1.0 - 0.4 * 0.55), b * (1.0 - 0.4 * 0.55))
c1p = head_plain.inputs["Color1"].default_value[:]
ok("the no-palette ramp's shadow end is the dye's own (the 83 law unchanged)",
   all(abs(a - e) < 1e-5 for a, e in zip(c1p[:3], expect_shadow)),
   f"{tuple(round(x, 4) for x in c1p[:3])} vs {tuple(round(x, 4) for x in expect_shadow)}")
c1 = fm.inputs["Color1"].default_value[:]
c2 = fm.inputs["Color2"].default_value[:]
dark = m.hex_to_rgb(min(PALETTE, key=lambda h: sum(m.hex_to_rgb(h))))
light = m.hex_to_rgb(max(PALETTE, key=lambda h: sum(m.hex_to_rgb(h))))
pull = m.PALETTE_PULL
expect_c1 = tuple(expect_shadow[i] + (dark[i] - expect_shadow[i]) * pull for i in range(3))
expect_high = tuple(min(1.0, c + (1.0 - c) * 0.4 * 0.4) for c in (r, g, b))
expect_c2 = tuple(expect_high[i] + (light[i] - expect_high[i]) * pull for i in range(3))
ok("the palette ramp's shadow end pulls toward the sheet's dark member (bounded)",
   all(abs(a - e) < 1e-4 for a, e in zip(c1[:3], expect_c1)),
   f"{tuple(round(x, 4) for x in c1[:3])} vs {tuple(round(x, 4) for x in expect_c1)}")
ok("the palette ramp's high end pulls toward the sheet's light member (bounded)",
   all(abs(a - e) < 1e-4 for a, e in zip(c2[:3], expect_c2)),
   f"{tuple(round(x, 4) for x in c2[:3])} vs {tuple(round(x, 4) for x in expect_c2)}")

# the regrade without a palette reuses the stored one
m.regrade_material(mat_sheet, "#4a5560")
ok("the regrade keeps the stored palette riding (the 107 reuse law)",
   json.loads(mat_sheet.get("animeosSheetPalette") or "[]") == PALETTE)

# ── THE FACE: the cap opens, the features step out ──
DNA = {
    "name": "Triad Smoke Hero", "hairColor": "#1B1B2A", "hairStyle": "topknot",
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
mats = {
    "robe": m.graded_mat(bpy, "cloth", "RobeMat", "#2F6D63", PROF, palette=PALETTE),
    "accent": m.graded_mat(bpy, "cloth", "AccentMat", "#A8842C", PROF, palette=PALETTE),
    "skin": m.graded_mat(bpy, "skin", "SkinMat", "#D9B48F", PROF),
    "hair": m.graded_mat(bpy, "hair", "HairMat", "#1B1B2A", PROF),
    "blade": m.emission_mat(bpy, "BladeMat", "#5eead4", 4.0),
    "boots": m.graded_mat(bpy, "cloth", "BootsMat", "#241a12", PROF, palette=PALETTE),
}
fig = m.build_designed_figure(bpy, scn, DNA, mats, strand_f=1.0)
meshes = {ob.name: ob for ob in scn.objects if ob.type == "MESH"}
empties = {ob.name: ob for ob in scn.objects if ob.type == "EMPTY"}

# the head's ellipsoid (the sculpt scale rides: 0.92, 0.98, 1.05*height_f)
head_mesh = meshes.get("HeadMesh")
ok("the head mesh built", head_mesh is not None)
RX, RY, RZ = 0.115 * 0.92, 0.115 * 0.98, 0.115 * 1.05 * 1.02

def surface_y(x, z_mesh):
    # the head ellipsoid's front surface y at (x, z_mesh) - mesh-local
    # space (the mesh sits at head-local +0.12)
    t = 1.0 - (x / RX) ** 2 - (z_mesh / RZ) ** 2
    if t <= 0:
        return 0.0
    return -RY * math.sqrt(t)

# 1. the cap opens the face band: the cap's front reach stays above
#    the face (the cap is parented to the head EMPTY: mesh-local z =
#    empty z - 0.12)
cap = meshes.get("HairCap")
ok("the hair cap built", cap is not None)
cap_front = min(v.co.y for v in cap.data.vertices)  # cap-local y == empty-space y
ok("the cap's front reach stops above the face band (no hair over the eyes)",
   cap_front > -0.08, f"front={cap_front:.4f} (the old full ring reached -0.108; the face surface sits at -0.098)")
fringe = meshes.get("HairFringe")
ok("the fringe built", fringe is not None)
# fringe tip: the lowest mesh vertex's z (empty space) must sit above the brows (0.182)
fringe_tip_z = min(v.co.z for v in fringe.data.vertices)
ok("the fringe's tip hangs no lower than the brow line",
   fringe_tip_z >= 0.176, f"tip_z={fringe_tip_z:.4f} vs brows 0.182")

# 2. the features protrude past the head ellipsoid (world units)
def world_front(name, empty_name=None):
    ob = meshes.get(name)
    if ob is None:
        return None
    # the mesh's own min y in its object space, transformed by its world matrix
    import mathutils
    pts = [ob.matrix_world @ mathutils.Vector(c) for c in ob.bound_box]
    return min(p.y for p in pts)

def empty_world(name):
    e = empties.get(name)
    import mathutils
    return e.matrix_world.translation if e else None

# the eyeball: pivot + radius*(squash) - the sphere's own bound box is honest
eye_l = empty_world("EyeL")
ok("the eye pivot built", eye_l is not None)
eye_surface = surface_y(0.048, eye_l.z - 0.12 if eye_l else 0.0)
eye_front = world_front("EyeLMesh")
ok("the eyeball protrudes past the head surface (measured)",
   eye_front is not None and eye_front < eye_surface - 0.004,
   f"front={eye_front:.4f} vs surface={eye_surface:.4f}")
iris_front = world_front("EyeLIris")
ok("the iris sits proud of the eyeball's face",
   iris_front is not None and eye_front is not None and iris_front < eye_front - 0.003,
   f"iris={iris_front} vs eyeball={eye_front}")
brow_front = world_front("BrowLMesh")
brow_surface = surface_y(0.05, empties["BrowL"].location.z - 0.12)
ok("the brow breaks the head surface line",
   brow_front is not None and brow_front < brow_surface - 0.01,
   f"front={brow_front:.4f} vs surface={brow_surface:.4f}")
mouth_front = world_front("MouthMesh")
mouth_surface = surface_y(0.0, empties["Mouth"].location.z - 0.12)
ok("the mouth sits proud of the chin surface",
   mouth_front is not None and mouth_front < mouth_surface - 0.008,
   f"front={mouth_front:.4f} vs surface={mouth_surface:.4f}")
nose = meshes.get("NoseMesh")
nose_surface = surface_y(0.0, 0.092 - 0.12)
nose_front = world_front("NoseMesh")
ok("the nose breaks the silhouette line",
   nose_front is not None and nose_front < nose_surface - 0.008,
   f"front={nose_front:.4f} vs surface={nose_surface:.4f}")

# 3. the deep relief: the evidence names the factor; the faceHash is A/B stable
sculpt = fig.get("sculpt") if isinstance(fig, dict) else None
ok("the sculpt evidence names the relief factor (107)",
   isinstance(sculpt, dict) and sculpt.get("relief") == 2.0,
   json.dumps({k: sculpt.get(k) for k in ("relief",)} if isinstance(sculpt, dict) else {}))
face_a = sculpt.get("faceHash") if isinstance(sculpt, dict) else None
for ob in list(scn.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
fig_b = m.build_designed_figure(bpy, scn, DNA, mats, strand_f=1.0)
face_b = (fig_b.get("sculpt") or {}).get("faceHash")
ok("the sculpt's faceHash is stable across builds (the relief law is deterministic)",
   face_a and face_a == face_b, f"{face_a} vs {face_b}")

# 4. THE PRESENCE: the measured box + the fill solve
bpy.context.view_layer.update()
root = fig_b.get("root")
subj = m.measure_subject(root)
ok("the subject measured from the built figure", isinstance(subj, dict) and subj.get("h", 0) > 0.5,
   json.dumps(subj or {}))
ok("the measured head size is honest (a fraction of the figure)",
   isinstance(subj, dict) and 0.05 < subj.get("headH", 0) < subj.get("h", 1) * 0.5,
   json.dumps(subj or {}))
if subj is None:
    subj = {"h": 0.9, "headH": 0.14, "face": 0.76, "chest": 0.6}

shot_base = {"number": 2, "poseStart": "STANCE", "poseEnd": "SLASH", "cast": [{"name": "x"}]}
scene_p = {"cameraDistance": 1.0}
eps = 0.02
for st, lens_mm, fill in (("MEDIUM", 50, 0.74), ("WIDE", 35, 0.50), ("CLOSEUP", 85, 0.82)):
    sp = dict(shot_base, shotType=st)
    fr = m._Framing(sp, scene_p, subj)
    size = subj["headH"] if st == "CLOSEUP" else subj["h"]
    want = size / (fill * 2.0 * (10.125 / lens_mm))
    got_fill = size / (fr.dist * 2.0 * (10.125 / fr.lens))
    ok(f"{st}: the framing solves the law's fill ({fill})",
       fr.fill == fill and abs(got_fill - fill) < eps and abs(fr.dist - want) < 0.15,
       f"dist={fr.dist:.3f} want={want:.3f} fill={got_fill:.3f}")
# the fallback: no subject -> the 106 law holds
fr_leg = m._Framing(dict(shot_base, shotType="MEDIUM"), scene_p, None)
ok("the no-subject fallback keeps the 106 table (dist x1.9)",
   abs(fr_leg.dist - 1.9) < 1e-6 and fr_leg.fill is None, f"dist={fr_leg.dist}")

# 5. THE SIGHTLINE WALK: a wall between the solved camera and the
#    subject walks the solve in until the ray clears (the triad
#    night's temple pillar law)
sp_med = dict(shot_base, shotType="MEDIUM")
fr_w = m._Framing(sp_med, scene_p, subj)
import mathutils
pos0 = mathutils.Vector(m._solve_position(fr_w.dist, fr_w.h, fr_w.angle, 0.0))
tgt = mathutils.Vector(fr_w.target)
wall_loc = pos0 + (tgt - pos0) * 0.5
bpy.ops.mesh.primitive_cube_add(location=wall_loc, size=0.5)
wall = bpy.context.active_object
wall.name = "SmokeWall"
bpy.context.view_layer.update()
walk = m.solve_sightline(scn, bpy, sp_med, scene_p, dict(subj))
ok("the sightline walk clears the wall (aside-first, bounded walk)",
   walk.get("cleared") is True and (walk.get("scale", 1.0) < 0.99 or abs(walk.get("angleOffset") or 0.0) > 0),
   json.dumps(walk))
cleared_now = m._sightline_clear(scn, bpy, m._solve_position(walk["dist"], fr_w.h, fr_w.angle + (walk.get("angleOffset") or 0.0), 0.0), fr_w.target)
ok("the walked solve's ray is actually clear", cleared_now is True)
# a clear world rides untouched
bpy.data.objects.remove(wall, do_unlink=True)
bpy.context.view_layer.update()
walk_clear = m.solve_sightline(scn, bpy, sp_med, scene_p, dict(subj))
ok("a clear world leaves the solve untouched (scale 1.0, no walk)",
   walk_clear.get("walked") is False and walk_clear.get("scale") == 1.0, json.dumps(walk_clear))

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
    # blender exits 0 even when the embedded script raises - the
    # sentinel line is the honest completion signal (a missing
    # sentinel is a crash, not a pass)
    if r.returncode != 0 or "DIRECT_FAILS" not in r.stdout:
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
    print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - triad smoke (direct half)")
    sys.exit(0 if failures == 0 else 1)


# ── half 2: render jobs over the real worker ──
def run_job(job_id, cast, shot_type="CLOSEUP", pose_start="STANCE", pose_end="SLASH"):
    shot = {
        "number": 1,
        "description": "triad smoke shot",
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
                "number": 1, "title": "Triad Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Triad Smoke", "visualStyle": "DONGHUA",
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


PALETTE = ["#1c2a24", "#2F6D63", "#7fd4c0", "#A8842C", "#e8d9a8"]
hero = hero_dna("Triad Smoke Hero", "sword")
hero["sheetConformance"] = {
    "characterName": "Triad Smoke Hero",
    "palette": PALETTE,
    "rows": [{"role": "robe", "mat": "RobeMat", "from": "#2F6D63", "to": "#2a6157", "delta": 0.05}],
    "note": "smoke palette",
}

state = run_job("triad-smoke-medium", [hero], shot_type="MEDIUM")
rig = state.get("rig") or {}
sculpt = rig.get("sculpt")
expect("the sculpt evidence names the relief factor (107)",
       isinstance(sculpt, dict) and sculpt.get("relief") == 2.0,
       json.dumps({k: sculpt.get(k) for k in ("relief",)} if isinstance(sculpt, dict) else {}))
render_ev = state.get("render") or {}
presence = render_ev.get("presence")
expect("the presence evidence rides (measured subject + solved fill)",
       isinstance(presence, dict) and presence.get("lawVersion") == 107
       and presence.get("fill") == 0.74 and (presence.get("subjectH") or 0) > 0.5,
       json.dumps(presence or {})[:240])
ident = state.get("identity") or {}
expect("the conformance rows applied with the sheet palette riding",
       ident.get("sheet") == "Triad Smoke Hero"
       and ident.get("palette") == PALETTE
       and any(r.get("mat") == "RobeMat" for r in ident.get("conformed", [])),
       json.dumps(ident)[:240])
clip = os.path.join(OUT_DIR, "triad-smoke-medium.mp4")
expect("the clip rendered", os.path.exists(clip) and os.path.getsize(clip) > 0)

# cleanup
for f in ("triad-smoke-medium",):
    p = os.path.join(OUT_DIR, f + ".mp4")
    if os.path.exists(p):
        os.remove(p)
    jf = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(jf):
        os.remove(jf)
expect("cleanup removed the smoke artifacts",
       not os.path.exists(os.path.join(OUT_DIR, "triad-smoke-medium.mp4")))

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - triad smoke (render half)")
sys.exit(0 if failures == 0 else 1)
