#!/usr/bin/env python3
# Smoke-test iteration 109 - THE STUDIO DESIGNS CHARACTERS (anime_character.py):
#   1. the build: every v3.x rig-contract key exists; HeadMesh is one
#      mesh; the body is ONE skinned mesh on a real armature; hair
#      clumps, garments and the six painted face decals exist; decals
#      sit in the no-ink collection; covered skin was removed
#   2. THE RIG FOLLOWS THE JOINTS: apply_pose(LUNGE) + syncRig moves the
#      evaluated right-hand vertices with the RShoulder/RElbow empties
#   3. THE SPEC DRIVES THE DESIGN: two specs (topknot hanfu vs short
#      tunic) build different hair/garment sets
#   4. THE WORKER: a TOON job builds figureSource anime:v119 and renders
#   5. THE TURNAROUND CLI: five views + the stitched sheet + a .blend
# Runs under BLENDER=/path/to/blender or a Python with the bpy module.
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BR_DIR = os.path.join(ROOT, "bridges", "blender")
failures = 0


def expect(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
    if not cond:
        failures += 1


def cmd(script, *args):
    b = os.environ.get("BLENDER")
    if b and os.path.exists(b):
        return [b, "-b", "--factory-startup", "-P", script, "--", *args]
    return [sys.executable, script, *args]


DIRECT = r'''
import importlib.util, json, os, sys
import bpy
d = sys.argv[-1]
sys.path.insert(0, d)
spec = importlib.util.spec_from_file_location("br", os.path.join(d, "animeos_bridge.py"))
br = importlib.util.module_from_spec(spec); spec.loader.exec_module(br)
import anime_character as ac
fails = []
def ok(n, c, det=""):
    print(("PASS " if c else "FAIL ") + n + ("" if c else f" - {det}"))
    if not c: fails.append(n)
def build(dna):
    scn = bpy.context.scene
    for ob in list(scn.objects): bpy.data.objects.remove(ob, do_unlink=True)
    prof = br.material_profile(dna)
    mats = {k: br.graded_mat(bpy, "cloth", k, "#808080", prof) for k in ("robe", "accent", "boots")}
    mats["skin"] = br.graded_mat(bpy, "skin", "skin", "#f2d6c2", prof)
    mats["hair"] = br.graded_mat(bpy, "hair", "hair", "#1b1b22", prof)
    mats["blade"] = br.emission_mat(bpy, "blade", "#40f2d2", 4.0)
    return ac.build_anime_character(bpy, scn, dna, mats, br=br._grip_law())
dna = {"name": "Smoke", "hairStyle": "topknot", "weaponType": "sword", "build": "lean"}
fig = build(dna)
for k in ("root", "spine", "head", "rShoulder", "lShoulder", "rElbow", "lElbow", "rHip", "lHip", "rKnee", "lKnee",
          "eyeL", "eyeR", "browL", "browR", "mouth", "rFingers", "lFingers", "rThumb", "lThumb", "headMesh", "syncRig"):
    ok(f"contract key {k}", fig.get(k) is not None)
ok("4 fingers per hand", len(fig["rFingers"]) == 4 and len(fig["lFingers"]) == 4)
scn = bpy.context.scene
names = {o.name for o in scn.objects}
ok("one skinned body on an armature", "AnimeBody" in names and any(m.type == "ARMATURE" for m in scn.objects["AnimeBody"].modifiers))
ok("armature has the joint bones", len(scn.objects["AnimeRig"].data.bones) >= 20, len(scn.objects["AnimeRig"].data.bones))
for n in ("EyeLMesh", "EyeRMesh", "BrowLMesh", "BrowRMesh", "MouthMesh", "NoseMesh"):
    ok(f"painted decal {n}", n in names)
coll = bpy.data.collections.get("AnimeOSNoInk")
ok("decals sit in the no-ink collection", coll is not None and "EyeLMesh" in coll.objects)
ok("hair clumps + bun", "HairBun" in names and sum(1 for n in names if n.startswith("Bang")) >= 5)
ok("garments", "RobeBody" in names and "AnimeSleeveL" in names and "CollarR" in names)
body = scn.objects["AnimeBody"]
ok("covered skin removed (no torso faces under the robe)", not any(abs(p.center.x) < 0.15 and 1.3 < p.center.z < 1.6 for p in body.data.polygons))
# THE MANNEQUIN BREAKS (iteration 113): the body GRAPH carries the
# leg/arm profiles - the calf, the thigh fullness, the deltoid, the
# forearm - so the silhouette reads limbs, not tubes (the baked mesh
# sheds the covered faces; the graph is the law's surface of record)
_spec = fig["anime"]["spec"]
_V, _E, _R = ac.build_body_graph(_spec)
def _band(lo, hi):
    return [(v, r) for v, r in zip(_V, _R) if lo < v[2] < hi and abs(v[0]) > 0.02]
_calf = _band(0.30, 0.42)
ok("the leg carries a calf vertex at the calf band", len(_calf) >= 2 and max(r[0] for _v2, r in _calf) >= 0.045, _calf[:4])
_thigh = _band(0.66, 0.78)
ok("the leg carries thigh fullness above the knee", len(_thigh) >= 2 and max(r[0] for _v2, r in _thigh) > 0.05, _thigh[:4])
_delt = _band(1.44, 1.56)
ok("the arm carries a deltoid vertex", len(_delt) >= 2, _delt[:4])
_fore = _band(1.18, 1.30)
ok("the arm carries a forearm vertex", len(_fore) >= 2, _fore[:4])
_eyes = [o for o in scn.objects if o.name in ("EyeLMesh", "EyeRMesh")]
# dimensions are world-scaled (Root rides 0.45): the 113 law's 0.070
# local reads ~0.0315 world; the old 0.058 read ~0.0261
ok("the painted eye grew to the anime width", all(o.dimensions.x >= 0.029 for o in _eyes), [round(o.dimensions.x, 4) for o in _eyes])
_cap = scn.objects.get("HairCap")
if _cap:
    # the front hairline EDGE sits just above the brow line (the 113
    # law: hairline theta 1.02 -> edge z ~0.213 in head space; the old
    # 0.62 law left the edge at ~0.252 - a bald band)
    _front = [v.co.z for v in _cap.data.vertices if v.co.y < -0.06]
    ok("the cap hairline edge sits above the brows", _front and min(_front) <= 0.225, round(min(_front), 4) if _front else None)
# 2. the rig follows
def rhand_pos():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg); me = ev.to_mesh()
    pts = [body.matrix_world @ v.co for v in me.vertices if v.co.x < -0.2 and 1.0 < v.co.z < 1.1]
    ev.to_mesh_clear()
    import mathutils
    return sum((p for p in pts), mathutils.Vector()) / max(1, len(pts))
fig["syncRig"](); bpy.context.view_layer.update(); p0 = rhand_pos()
br.apply_pose(fig, "LUNGE", "LUNGE", 1.0, 0.0); fig["syncRig"](); bpy.context.view_layer.update(); p1 = rhand_pos()
ok("the posed rig moves the skinned hand", (p1 - p0).length > 0.05, (p0, p1))
# 3. the spec drives the design
fig2 = build({"name": "B", "hairStyle": "short", "weaponType": "none", "designSpec": {"body": {"gender": "male"}, "outfit": {"type": "tunic"}}})
names2 = {o.name for o in bpy.context.scene.objects}
ok("a different spec builds a different design", "HairBun" not in names2 and any(n.startswith("BackClump") for n in names2)
   and fig2["anime"]["spec"]["outfit"]["type"] == "tunic" and fig2["anime"]["spec"]["body"]["gender"] == "male")
print("DIRECT_FAILS " + json.dumps(fails))
'''

with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
    fh.write(DIRECT)
r = subprocess.run(cmd(fh.name, BR_DIR), capture_output=True, text=True, timeout=900)
for line in r.stdout.splitlines():
    if line.startswith(("PASS", "FAIL")):
        print("  " + line)
if "DIRECT_FAILS" in r.stdout:
    inner = json.loads(r.stdout.split("DIRECT_FAILS ", 1)[1].splitlines()[0])
    expect("direct half", not inner, inner)
else:
    expect("direct half ran", False, (r.stderr or r.stdout)[-800:])

# 4. the worker
out = tempfile.mkdtemp(prefix="anime-smoke-")
job = os.path.join(out, "job.json")
payload = {"shot": {"number": 1, "description": "Smoke stands", "shotType": "MEDIUM", "movement": "STATIC", "poseStart": "STANCE",
                    "poseEnd": "DRAW", "duration": 0.3, "cast": [{"name": "Smoke", "hairStyle": "ponytail", "weaponType": "sword"}]},
           "scene": {"number": 1, "title": "Smoke", "fogDensity": 0.3, "lightningIntensity": 0.2, "energyIntensity": 0.5, "cameraDistance": 1.0, "rimLightIntensity": 0.5},
           "project": {"title": "Smoke", "visualStyle": "ANIME", "resolution": "480x270", "fps": 8}, "mode": "PREVIEW"}
json.dump({"jobId": "anime-smoke", "payload": payload, "outDir": out}, open(job, "w"))
runner = "import importlib.util,sys\nspec=importlib.util.spec_from_file_location('b', sys.argv[-2]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); m.worker_run(sys.argv[-1])\n"
with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
    fh.write(runner)
subprocess.run(cmd(fh.name, os.path.join(BR_DIR, "animeos_bridge.py"), job), capture_output=True, text=True, timeout=1200)
st = json.load(open(job))
expect("worker builds the designed anime character", str(st.get("figureSource")).startswith("anime:v119"), (st.get("figureSource"), st.get("animeRefused")))
expect("worker clip rendered", bool(st.get("mp4Path")) and os.path.exists(st.get("mp4Path") or ""), st.get("error"))
forge = st.get("addons") or {}
expect("THE FORGE OPENS on the worker (all built-ins, zero failed)",
       (forge.get("alreadyOn", []) and (len(forge.get("alreadyOn", [])) + len(forge.get("enabledNow", [])) + len(forge.get("availableCore", []))) == 13
        and not forge.get("failed")), (forge.get("alreadyOn"), forge.get("failed")))
expect("the anatomy evidence rides the worker state", isinstance((st.get("anime") or {}).get("anatomy"), dict)
       and (st.get("anime") or {}).get("anatomy", {}).get("vertsMoved", 0) > 1000,
       ((st.get("anime") or {}).get("anatomy") or {}).get("vertsMoved"))

# 5. the turnaround CLI
td = tempfile.mkdtemp(prefix="anime-turn-")
dna = os.path.join(td, "dna.json")
json.dump({"name": "Smoke", "hairStyle": "long", "weaponType": "none"}, open(dna, "w"))
r = subprocess.run(cmd(os.path.join(BR_DIR, "anime_turnaround.py"), "--dna", dna, "--out", td, "--samples", "4", "--res", "240",
                       "--blend", os.path.join(td, "c.blend")), capture_output=True, text=True, timeout=1200)
line = next((l for l in r.stdout.splitlines() if l.startswith("TURNAROUND ")), None)
j = json.loads(line[len("TURNAROUND "):]) if line else {}
expect("turnaround renders five views", len(j.get("views") or {}) == 5, (r.stderr or r.stdout)[-400:])
expect("turnaround stitches the sheet and saves the .blend", bool(j.get("sheet")) and os.path.exists(j.get("sheet") or "") and os.path.exists(os.path.join(td, "c.blend")))

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - anime smoke (iteration 109)")
sys.exit(0 if failures == 0 else 1)
