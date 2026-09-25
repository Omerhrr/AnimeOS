# Isolate: top-down view, sun only, print tile transforms.
import bpy, sys, os, math, mathutils
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
    "features": ["pillars"],
}
bridge.build_designed_set(bpy, scn, ENV, {}, "isolate-job")

for o in scn.objects:
    if o.type == "MESH" and ("tile" in o.name.lower() or "Tile" in o.name):
        print(f"TILE {o.name} loc={tuple(round(v,3) for v in o.location)} scale={tuple(round(v,3) for v in o.scale)} dims={tuple(round(v,3) for v in o.dimensions)} mats={[m.name for m in o.data.materials]}")

world = bpy.data.worlds.new("W")
scn.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.05, 0.07, 0.09, 1.0)
bg.inputs[1].default_value = 0.6

sun = bpy.data.lights.new("Sun", "SUN")
sun.energy = 4.0
so = bpy.data.objects.new("Sun", sun)
so.rotation_euler = (math.radians(30), 0, math.radians(35))
scn.collection.objects.link(so)

scn.render.engine = "CYCLES"
scn.cycles.device = "CPU"
scn.cycles.samples = 32
scn.render.resolution_x = 800
scn.render.resolution_y = 500

cam_data = bpy.data.cameras.new("C")
cam = bpy.data.objects.new("C", cam_data)
scn.collection.objects.link(cam)
scn.camera = cam
cam.location = mathutils.Vector((0, -2.2, 5.5))
d = mathutils.Vector((0, 0.3, 0.5)) - cam.location
cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
scn.render.filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug_isolate.png")
bpy.ops.render.render(write_still=True)
print("ISOLATE DONE")
