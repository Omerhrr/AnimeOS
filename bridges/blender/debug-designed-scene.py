# Debug: build the v4 designed scene in-process and render 3 views
# (wide / medium / closeup) so the geometry can be inspected.
# Run: blender -b -P debug-designed-scene.py
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("animeos_bridge", os.path.join(os.path.dirname(os.path.abspath(__file__)), "animeos_bridge.py"))
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

scn = bpy.context.scene
# purge Blender startup Cube/Light/Camera (worker_run does this in production)
for ob in list(scn.objects):
    if ob.name in ("Cube", "Light", "Camera"):
        bpy.data.objects.remove(ob, do_unlink=True)
for ob in list(scn.objects):
    if ob.name in ("Cube", "Light", "Camera"):
        bpy.data.objects.remove(ob, do_unlink=True)

ENV = {
    "name": "Cloudveil Terrace", "terrain": "terrace", "timeOfDay": "night", "weather": "storm",
    "skyColor": "#0b1220", "fogColor": "#0a1018", "groundColor": "#16211d", "keyLight": "#cfe0ee",
    "features": ["moons", "bell", "banners", "pillars", "cloudsea"],
}
HERO = {"name": "Yun Shu", "hairColor": "#16161d", "hairStyle": "long", "robeColor": "#2f6d63",
        "robeAccent": "#3f8f7a", "skinTone": "#d9b48f", "weaponType": "sword", "bladeColor": "#5eead4", "build": "lean"}
OTHER = {"name": "Heiyan", "hairColor": "#6b7280", "hairStyle": "topknot", "robeColor": "#4a5560",
         "robeAccent": "#a8842c", "skinTone": "#d9b48f", "weaponType": "sword", "bladeColor": "#5eead4", "build": "sturdy"}

bridge.build_designed_set(bpy, scn, ENV, {}, "debug-job")

mats = {
    "robe": bridge.principled_mat(bpy, "RobeMat", HERO["robeColor"], 0.82),
    "accent": bridge.principled_mat(bpy, "AccentMat", HERO["robeAccent"], 0.7),
    "skin": bridge.principled_mat(bpy, "SkinMat", HERO["skinTone"], 0.6),
    "hair": bridge.principled_mat(bpy, "HairMat", HERO["hairColor"], 0.55),
    "blade": bridge.emission_mat(bpy, "BladeMat", HERO["bladeColor"], 6.0),
    "boots": bridge.principled_mat(bpy, "BootsMat", "#241a12", 0.8),
}
hero = bridge.build_designed_figure(bpy, scn, HERO, mats)
bridge.apply_pose(hero, "STANCE", "DRAW", 0.5, 0.6)

om = {
    "robe": bridge.principled_mat(bpy, "RobeMatB", OTHER["robeColor"], 0.82),
    "accent": bridge.principled_mat(bpy, "AccentMatB", OTHER["robeAccent"], 0.7),
    "skin": bridge.principled_mat(bpy, "SkinMatB", OTHER["skinTone"], 0.6),
    "hair": bridge.principled_mat(bpy, "HairMatB", OTHER["hairColor"], 0.55),
    "blade": mats["blade"],
    "boots": bridge.principled_mat(bpy, "BootsMatB", "#241a12", 0.8),
}
other = bridge.build_designed_figure(bpy, scn, OTHER, om)
other["root"].location = (0.6, 1.7, 0.0)
other["root"].rotation_euler = (0.0, 0.0, math.radians(166))
bridge.apply_pose(other, "STANCE", "STANCE", 0.0, 0.0)

world = bpy.data.worlds.new("W")
scn.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (*bridge.hex_to_rgb(ENV["skyColor"]), 1.0)
bg.inputs[1].default_value = 1.0

# night key (production: 30 deg low moon above the horizon) + debug fill
sun = bpy.data.lights.new("Sun", "SUN")
sun.energy = 2.2
sun.color = bridge.hex_to_rgb(ENV["keyLight"])
so = bpy.data.objects.new("Sun", sun)
so.rotation_euler = (math.radians(62), 0, math.radians(35))
scn.collection.objects.link(so)
fill = bpy.data.lights.new("Fill", "AREA")
fill.size = 6
fill.energy = 2600
fo = bpy.data.objects.new("Fill", fill)
fo.location = (3, -4, 3.4)
fo.rotation_euler = (math.radians(-52), 0, 0)
scn.collection.objects.link(fo)

scn.render.engine = "CYCLES"
scn.cycles.device = "CPU"
scn.cycles.samples = 24
scn.cycles.use_denoising = True
scn.render.resolution_x = 854
scn.render.resolution_y = 480

cam_data = bpy.data.cameras.new("C")
cam = bpy.data.objects.new("C", cam_data)
scn.collection.objects.link(cam)
scn.camera = cam

import mathutils
views = {
    "debug_wide": (4.6, -4.6, 2.6, (0, 0, 0.9)),
    "debug_medium": (1.6, -1.6, 1.3, (0, 0, 0.8)),
    "debug_close": (0.75, -0.75, 0.95, (0, 0, 0.82)),
    "debug_side": (0.2, 3.0, 1.1, (0, 0, 0.8)),
}
outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)))
for name, (x, y, z, target) in views.items():
    cam.location = mathutils.Vector((x, y, z))
    d = mathutils.Vector(target) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = os.path.join(outdir, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("rendered", name)
print("DEBUG DONE")
