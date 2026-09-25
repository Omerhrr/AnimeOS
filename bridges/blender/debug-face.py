# Face/mat closeup: purge startup cube, build designed figure, render
# a beauty closeup + print the material colors actually in use.
import bpy, sys, os, math, mathutils
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("animeos_bridge", os.path.join(os.path.dirname(os.path.abspath(__file__)), "animeos_bridge.py"))
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

scn = bpy.context.scene
for ob in list(scn.objects):
    if ob.name in ("Cube", "Light", "Camera"):
        bpy.data.objects.remove(ob, do_unlink=True)

ENV = {"name": "Cloudveil Terrace", "terrain": "terrace", "timeOfDay": "night", "weather": "storm",
       "skyColor": "#0b1220", "fogColor": "#0a1018", "groundColor": "#16211d", "keyLight": "#cfe0ee",
       "features": ["moons", "bell", "banners", "pillars", "cloudsea"]}
HERO = {"name": "Yun Shu", "hairColor": "#16161d", "hairStyle": "long", "robeColor": "#2f6d63",
        "robeAccent": "#3f8f7a", "skinTone": "#d9b48f", "weaponType": "sword", "bladeColor": "#5eead4", "build": "lean"}

bridge.build_designed_set(bpy, scn, ENV, {}, "faceprobe")
mats = {
    "robe": bridge.principled_mat(bpy, "RobeMat", HERO["robeColor"], 0.82),
    "accent": bridge.principled_mat(bpy, "AccentMat", HERO["robeAccent"], 0.7),
    "skin": bridge.principled_mat(bpy, "SkinMat", HERO["skinTone"], 0.5),
    "hair": bridge.principled_mat(bpy, "HairMat", HERO["hairColor"], 0.35),
    "blade": bridge.emission_mat(bpy, "BladeMat", HERO["bladeColor"], 6.4),
    "boots": bridge.principled_mat(bpy, "BootsMat", "#241a12", 0.8),
}
for name, m in mats.items():
    b = m.node_tree.nodes.get("Principled BSDF") if m.use_nodes else None
    col = tuple(round(v, 3) for v in b.inputs["Base Color"].default_value) if b else "emission"
    print(f"MAT {name}: {m.name} base={col}")
hero = bridge.build_designed_figure(bpy, scn, HERO, mats)
bridge.apply_pose(hero, "STANCE", "STANCE", 0.0, 0.0)

world = bpy.data.worlds.new("W")
scn.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (*bridge.hex_to_rgb(ENV["skyColor"]), 1.0)
print(f"MAT world: {tuple(round(v,3) for v in bg.inputs[0].default_value)}")

sun = bpy.data.lights.new("Sun", "SUN")
sun.energy = 2.86
sun.color = bridge.hex_to_rgb(ENV["keyLight"])
so = bpy.data.objects.new("Sun", sun)
so.rotation_euler = (math.radians(62), 0, math.radians(35))
scn.collection.objects.link(so)
for i, e in enumerate((0.5, 0.6)):
    ld = bpy.data.lights.new(f"Fill{i}", "AREA")
    ld.size = 4.0
    ld.energy = (200 + e * 1800) * 0.6
    lo = bpy.data.objects.new(f"Fill{i}", ld)
    lo.rotation_euler = (math.radians(-55), math.radians(20 * (i or -1)), 0)
    lo.location = ((3.5, -4.0, 2.6) if i == 0 else (-3.0, 3.5, 3.2))
    scn.collection.objects.link(lo)

scn.render.engine = "CYCLES"
scn.cycles.device = "CPU"
scn.cycles.samples = 32
scn.cycles.use_denoising = True
scn.render.resolution_x = 854
scn.render.resolution_y = 480
cam_data = bpy.data.cameras.new("C")
cam = bpy.data.objects.new("C", cam_data)
scn.collection.objects.link(cam)
scn.camera = cam
cam.data.lens = 85
cam.location = mathutils.Vector((0.55, -1.15, 0.92))
d = mathutils.Vector((0, 0, 0.82)) - cam.location
cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
scn.render.filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug_face.png")
bpy.ops.render.render(write_still=True)
print("FACE DONE")
