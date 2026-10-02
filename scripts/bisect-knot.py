# Bisect the floating knot: render the front view with hair sets hidden.
import importlib.util, json, math, os, sys
import bpy

d = "/home/z/my-project/AnimeOS/bridges/blender"
sys.path.insert(0, d)
spec = importlib.util.spec_from_file_location("br", os.path.join(d, "animeos_bridge.py"))
br = importlib.util.module_from_spec(spec); spec.loader.exec_module(br)
import anime_character as ac
import toon_pass as tp

out = "/tmp/turn113"
dna = json.load(open(os.path.join(out, "dna.json")))

scn = bpy.context.scene
for ob in list(scn.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
prof = br.material_profile(dna)
mats = {
    "robe": br.graded_mat(bpy, "cloth", "RobeMat", dna.get("robeColor", "#2f6d63"), prof),
    "accent": br.graded_mat(bpy, "cloth", "AccentMat", dna.get("robeAccent", "#a8842c"), prof),
    "skin": br.graded_mat(bpy, "skin", "SkinMat", dna.get("skinTone", "#f2d6c2"), prof),
    "hair": br.graded_mat(bpy, "hair", "HairMat", dna.get("hairColor", "#16161d"), prof),
    "blade": br.emission_mat(bpy, "BladeMat", dna.get("bladeColor", "#40f2d2"), 4.0),
    "boots": br.graded_mat(bpy, "cloth", "BootsMat", "#241a12", prof),
}
fig = ac.build_anime_character(bpy, scn, dna, mats, br=br._grip_law())
fig["syncRig"]()

w = bpy.data.worlds.new("W"); scn.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.64, 0.68, 1.0)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.7
sd = bpy.data.lights.new("Sun", "SUN"); sd.energy = 2.6
sun = bpy.data.objects.new("Sun", sd); scn.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
kd = bpy.data.lights.new("Key", "AREA"); kd.energy = 110.0; kd.size = 1.1
key = bpy.data.objects.new("Key", kd); scn.collection.objects.link(key)
key.location = (0.8, -1.4, 1.9)
key.rotation_euler = (math.radians(-30), 0, 0)

scn.render.engine = "CYCLES"
scn.cycles.samples = 16
scn.render.resolution_x = 420
scn.render.resolution_y = 588
tp.apply_look(bpy, scn, "TOON", "FINAL", br.hex_to_rgb, None)
cd = bpy.data.cameras.new("C"); cam = bpy.data.objects.new("C", cd)
scn.collection.objects.link(cam); scn.camera = cam
cd.lens = 60
cam.location = (0, -4.4, 1.05)
cam.rotation_euler = (math.radians(88), 0, 0)

def render(tag):
    scn.render.filepath = os.path.join(out, f"bisect_{tag}.png")
    bpy.ops.render.render(write_still=True)

sets = {
    "all": [],
    "no_tail": [n for n in bpy.data.objects.keys() if n.startswith(("HairTail", "BackClump"))],
    "no_cap": ["HairCap"],
    "no_bangs": [n for n in bpy.data.objects.keys() if n.startswith(("Bang", "SideLock"))],
}
for tag, hide in sets.items():
    for ob in bpy.data.objects:
        ob.hide_render = False
    for n in hide:
        bpy.data.objects[n].hide_render = True
    render(tag)

# where is the knot? dump every mesh object's world bbox top
report = {}
for ob in scn.objects:
    if ob.type != "MESH" or ob.hide_render:
        continue
    zs = [(ob.matrix_world @ v.co).z for v in ob.data.vertices]
    ys = [(ob.matrix_world @ v.co).y for v in ob.data.vertices]
    if zs:
        head_top = 0.0  # head empty world z reference printed below
        report[ob.name] = {"zmin": round(min(zs), 3), "zmax": round(max(zs), 3), "ymax": round(max(ys), 3)}
head = fig["head"]
print("HEAD_EMPTY_WORLD", tuple(round(c, 3) for c in head.matrix_world.translation))
print("BBOX " + json.dumps(report))
