#!/usr/bin/env python3
# Smoke-test iteration 108 - THE PIXEL FRONTIER (the render night's four
# named issues) inside the REAL Blender worker:
#   1. THE BODY READS AS A CHARACTER (toon_pass.reshape_anatomy): the
#      garment rebuilt in place - names/parents kept for the solvers,
#      the bodice one lathe (TorsoMesh keeps its flesh-region name), the
#      skirt floor-length over an underskirt, the sleeves BELL (wrist
#      radius > shoulder radius), the legs/upper arms hidden under the
#      robe, the hidden parts excluded from the presence measure.
#   1b. THE PIVOT LAW: build_secondary_rig re-hangs a part WITHOUT
#      moving it (the old double offset hung every sleeve/panel at 2x
#      its authored offset).
#   2. THE KEY FINDS THE FACE: aim_hero_key places the key 35 degrees
#      off the lens axis, raised, distance from the measured head, and
#      eases the energy by inverse square.
#   3. THE MOVE KNOWS THE WORLD: solve_path_sightline catches a pillar
#      on the PAN path the single base ray misses, rotates the move
#      aside and clears every sample; push_past_obstacle parks the lens
#      in front of a pillar that still owns a frame.
#   4. THE SHEET'S RANGE AT WIDE: palette_wash_for rises with distance;
#      apply_palette_wash retunes the named nodes.
#   5. THE FRAME READS AS ANIME (apply_look): every graded material
#      becomes a cel tree WITHOUT freeing a node (the wrinkle drivers'
#      live references survive - the segfault the first draft hit),
#      the ink is its own pass, grain dropped, bloom threshold raised.
#   + RENDER HALF: one PAN job through worker_run with a pillar on the
#      path: the clip renders, the evidence names look/anatomy/path.
#
# Runs under a Blender binary (BLENDER=/path/to/blender) or a Python
# with the bpy module (pip install bpy). HALF=direct|render|all.
import json, math, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
HALF = os.environ.get("HALF", "all").lower()

failures = 0
def expect(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
    if not cond:
        failures += 1


def runner():
    b = os.environ.get("BLENDER")
    if b and os.path.exists(b):
        return lambda script, *args: [b, "-b", "--factory-startup", "-P", script, "--", *args]
    return lambda script, *args: [sys.executable, script, *args]


DIRECT = r'''
import importlib.util, json, math, os, sys
import bpy, mathutils
bridge = sys.argv[-1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.path.insert(0, os.path.dirname(bridge))
import toon_pass as tp

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond: fails.append(name)

scn = bpy.context.scene
for ob in list(scn.objects): bpy.data.objects.remove(ob, do_unlink=True)
dna = {"name": "Smoke", "hairStyle": "topknot", "hairColor": "#16161d", "robeColor": "#e8e3d6",
       "robeAccent": "#3f8f78", "skinTone": "#d9b48f", "build": "lean", "weaponType": "sword", "bladeColor": "#40f2d2"}
prof = m.material_profile(dna)
pal = ["#f0ece2", "#3f8f78", "#c9a24a", "#1b1b22", "#9cc7b6"]
mats = {"robe": m.graded_mat(bpy, "cloth", "RobeMat", dna["robeColor"], prof, palette=pal),
        "accent": m.graded_mat(bpy, "cloth", "AccentMat", dna["robeAccent"], prof, palette=pal),
        "skin": m.graded_mat(bpy, "skin", "SkinMat", dna["skinTone"], prof, sdepth=m.skin_depth(dna)),
        "hair": m.graded_mat(bpy, "hair", "HairMat", dna["hairColor"], prof),
        "blade": m.emission_mat(bpy, "BladeMat", dna["bladeColor"], 6.0),
        "boots": m.graded_mat(bpy, "cloth", "BootsMat", "#241a12", prof)}
fig = m.build_designed_figure(bpy, scn, dna, mats, strand_f=0.6)
names_before = {o.name for o in scn.objects}
ev = tp.reshape_anatomy(bpy, scn, fig, dna)
ok("anatomy applied", ev.get("applied") is True, ev)
for keep in ("TorsoMesh", "LSleeve", "RSleeve", "SkirtPanel0", "SkirtPanel7", "HeadMesh"):
    ok(f"name kept: {keep}", keep in {o.name for o in scn.objects})
ok("underskirt added", "Underskirt" in {o.name for o in scn.objects})
torso = scn.objects["TorsoMesh"]
ok("bodice is one lathe (>=300 verts)", len(torso.data.vertices) >= 300, len(torso.data.vertices))
sl = scn.objects["LSleeve"]
zs = [v.co.z for v in sl.data.vertices]
def ring_r(zt):
    pts = [v.co for v in sl.data.vertices if abs(v.co.z - zt) < 1e-4]
    return max(math.hypot(p.x, p.y) for p in pts) if pts else 0
ok("sleeve bells (wrist radius > shoulder radius)", ring_r(min(zs)) > ring_r(max(zs)) * 1.8, (ring_r(min(zs)), ring_r(max(zs))))
for hid in ("HipsMesh", "ChestMesh", "LThigh", "RShin", "LUpperArm"):
    ok(f"{hid} hidden under the robe", scn.objects[hid].hide_render is True)
bpy.context.view_layer.update()
meas = m.measure_subject(fig["root"])
ok("presence measure skips hidden parts (height < 1.2)", meas is not None and meas["h"] < 1.2, meas)

# 1b. THE PIVOT LAW: re-hanging moves nothing
p0 = scn.objects["SkirtPanel3"].matrix_world.translation.copy()
s0 = scn.objects["RSleeve"].matrix_world.translation.copy()
chains = m.build_secondary_rig(bpy, scn, fig)
bpy.context.view_layer.update()
p1 = scn.objects["SkirtPanel3"].matrix_world.translation
s1 = scn.objects["RSleeve"].matrix_world.translation
ok("pivot re-hang keeps the panel in place", (p1 - p0).length < 1e-4, (p0, p1))
ok("pivot re-hang keeps the sleeve in place", (s1 - s0).length < 1e-4, (s0, s1))

# 2. the key
kd = bpy.data.lights.new("HeroKey", "AREA"); kd.energy = 140.0
key = bpy.data.objects.new("HeroKey", kd); scn.collection.objects.link(key)
head = fig["head"]; cam = (0.0, -3.0, 0.9)
m.aim_hero_key(key, cam, head, {"headH": 0.1})
h = head.matrix_world.translation
off = mathutils.Vector((key.location[0] - h.x, key.location[1] - h.y, 0.0))
lens = mathutils.Vector((cam[0] - h.x, cam[1] - h.y, 0.0))
ang = math.degrees(off.angle(lens))
ok("key sits 35 deg off the lens axis", abs(ang - m.HERO_KEY_YAW) < 0.5, ang)
ok("key rises above the head", key.location[2] > h.z)
ok("key energy eases by inverse square", key.data.energy < 140.0 and abs(key.data.energy - 140.0 * (0.9 / 1.8) ** 2) < 1e-3, key.data.energy)

# 3. the path
shot = {"shotType": "MEDIUM", "movement": "PAN", "duration": 2.0, "poseStart": "STANCE", "poseEnd": "STANCE", "cast": [dna]}
scene_p = {"cameraDistance": 1.0}
subject = dict(meas)
pos, target, _ = m.camera_pose(shot, scene_p, 0.75, subject)
mid = [pos[i] * 0.55 + target[i] * 0.45 for i in range(3)]
bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=4.0, location=(mid[0], mid[1], 1.0))
bpy.context.view_layer.update()
p_base, t_base, _ = m.camera_pose(shot, scene_p, 0.0, subject)
ok("the single base ray misses the pillar", m._sightline_clear(scn, bpy, p_base, t_base))
pev = m.solve_path_sightline(scn, bpy, shot, scene_p, None, subject)
ok("the path walk sees the pillar", pev["blockedBefore"] > 0, pev)
ok("the move rotates aside and clears", pev["cleared"] and pev["pathOffset"] != 0 and pev["blockedAfter"] == 0, pev)
subject2 = dict(meas)
pos2, tgt2, _ = m.camera_pose(shot, scene_p, 0.75, subject2)
newp, pushed = m.push_past_obstacle(scn, bpy, pos2, tgt2)
ok("push_past_obstacle moves the lens in front of the pillar", pushed and m._sightline_clear(scn, bpy, newp, tgt2), (pushed, newp))

# 4. the wash
ok("wash rises with distance", tp.palette_wash_for("CLOSEUP") < tp.palette_wash_for("MEDIUM") < tp.palette_wash_for("WIDE"))

# 5. the look (wrinkle drivers keep their nodes)
wn = fig.get("wrinkleNodes") or {}
comp = m.comp_profile({})
lev = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb, comp)
ok("materials converted to cel trees", lev["converted"] >= 5, lev)
robe = bpy.data.materials["RobeMat"]
toon_nodes = [n for n in robe.node_tree.nodes if n.type == "BSDF_TOON"]
ok("robe surface is a Toon BSDF", bool(toon_nodes))
ok("the old graded nodes survive (no freed references)", any(n.name == "PaletteWash" for n in robe.node_tree.nodes))
ok("hem band carries the sheet's mid member", any(n.name.startswith("PaletteWashToon") for n in robe.node_tree.nodes))
for k, node in wn.items():
    try:
        node.inputs["Strength"].default_value = 0.5
        ok(f"wrinkle node {k} still alive", True)
    except Exception as exc:
        ok(f"wrinkle node {k} still alive", False, exc)
vl = bpy.context.view_layer
ok("ink rides as hulls (freestyle off)", (not scn.render.use_freestyle) and lev["ink"] == ["hull"] and lev["inkShells"] >= 3, lev)
ok("a hull shell exists, inked, shadowless", any(o.name.startswith("InkShell_") for o in scn.objects)
   and any(o.visible_shadow is False for o in scn.objects if o.name.startswith("InkShell_")))
ok("grain dropped, bloom threshold raised", comp["factors"]["grain"] == 0.0 and comp.get("bloomThreshold", 1.0) > 1.0, comp)
wev = tp.apply_palette_wash(bpy, "WIDE")
ok("wash nodes retuned for WIDE", wev["nodes"] >= 2 and wev["wash"] == tp.palette_wash_for("WIDE"), wev)
ok("resolve_look: DONGHUA -> TOON, WESTERN -> PBR, explicit wins",
   tp.resolve_look({"visualStyle": "DONGHUA"}) == "TOON" and tp.resolve_look({"visualStyle": "WESTERN"}) == "PBR"
   and tp.resolve_look({"visualStyle": "DONGHUA", "look": "PBR"}) == "PBR")
print("DIRECT_FAILS " + json.dumps(fails))
'''


RENDER_JOB = {
    "shot": {"number": 4, "description": "The camera pans across the terrace pillars to find Smoke",
             "shotType": "MEDIUM", "lens": "35mm", "movement": "PAN", "poseStart": "WALK", "poseEnd": "STANCE",
             "lighting": "lantern light", "duration": 0.5,
             "cast": [{"name": "Smoke", "hairStyle": "topknot", "hairColor": "#16161d", "robeColor": "#e8e3d6",
                       "robeAccent": "#3f8f78", "skinTone": "#d9b48f", "weaponType": "sword", "bladeColor": "#40f2d2"}]},
    "scene": {"number": 1, "title": "Smoke", "fogDensity": 0.45, "lightningIntensity": 0.3, "energyIntensity": 0.6,
              "cameraDistance": 1.0, "rimLightIntensity": 0.5},
    "project": {"title": "Smoke", "visualStyle": "DONGHUA", "resolution": "640x360", "fps": 8},
    "mode": "PREVIEW",
}

RENDER = r'''
import importlib.util, json, sys
import bpy
bridge, job = sys.argv[-2], sys.argv[-1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
orig = m.solve_path_sightline
def with_pillar(scn, bpy_, shot, scene_p, grammar, subject, *a, **k):
    pos, target, _ = m.camera_pose(shot, scene_p, 0.75, subject)
    mid = [pos[i] * 0.55 + target[i] * 0.45 for i in range(3)]
    bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=4.0, location=(mid[0], mid[1], 1.0))
    bpy.context.view_layer.update()
    return orig(scn, bpy_, shot, scene_p, grammar, subject, *a, **k)
m.solve_path_sightline = with_pillar
m.worker_run(job)
'''


def run_direct():
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(DIRECT)
    r = subprocess.run(runner()(fh.name, BRIDGE), capture_output=True, text=True, timeout=900)
    for line in r.stdout.splitlines():
        if line.startswith(("PASS", "FAIL")):
            print("  " + line)
    if "DIRECT_FAILS" not in r.stdout:
        expect("direct half ran", False, (r.stderr or r.stdout)[-800:])
        return
    inner = json.loads(r.stdout.split("DIRECT_FAILS ", 1)[1].splitlines()[0])
    expect("direct half", not inner, inner)


def run_render():
    out = tempfile.mkdtemp(prefix="toon-smoke-")
    job = os.path.join(out, "job.json")
    with open(job, "w") as fh:
        json.dump({"jobId": "toon-smoke", "payload": RENDER_JOB, "outDir": out}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
    subprocess.run(runner()(fh.name, BRIDGE, job), capture_output=True, text=True, timeout=1500)
    st = json.load(open(job))
    expect("clip rendered", bool(st.get("mp4Path")) and os.path.exists(st.get("mp4Path") or ""), st.get("error"))
    look = (st.get("render") or {}).get("look") or {}
    expect("evidence names the TOON look", look.get("look") == "TOON", look)
    # iteration 109: under TOON the anime builder designs the garment
    # itself (the 108 reshape runs only on the legacy figure)
    expect("evidence names the garment law", (st.get("anatomy") or {}).get("applied") is True
           or str(st.get("figureSource") or "").startswith("anime"), (st.get("figureSource"), st.get("anatomy")))
    path = (((st.get("render") or {}).get("presence") or {}).get("sightline") or {}).get("path") or {}
    expect("path walk caught and cleared the pillar", path.get("blockedBefore", 0) > 0 and path.get("cleared"), path)
    expect("hero key tracks the face", (st.get("heroKey") or {}).get("tracks") == "face", st.get("heroKey"))
    expect("shadowless face fill rides the key", ((st.get("heroKey") or {}).get("fill") or {}).get("shadowless") is True, (st.get("heroKey") or {}).get("fill"))
    expect("palette wash tuned for the framing", ((st.get("render") or {}).get("paletteWash") or {}).get("shotType") == "MEDIUM")


if HALF in ("all", "direct"):
    run_direct()
if HALF in ("all", "render"):
    run_render()
print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - toon smoke (iteration 108)")
sys.exit(0 if failures == 0 else 1)
