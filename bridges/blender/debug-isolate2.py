# Isolate 2: print every mesh transform near the platform top, then
# render with tiles visible and hidden to identify the black shapes.
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
    "name": "T", "terrain": "terrace", "timeOfDay": "night", "weather": "storm",
    "skyColor": "#0b1220", "fogColor": "#0a1018", "groundColor": "#16211d", "keyLight": "#cfe0ee",
    "features": [],
}
bridge.build_designed_set(bpy, scn, ENV, {}, "isolate2")

tiles = []
for o in scn.objects:
    if o.type != "MESH":
        continue
    print(f"MESH {o.name:22s} loc={tuple(round(v,3) for v in o.location)} dims={tuple(round(v,3) for v in o.dimensions)}")
    if o.dimensions.z < 0.1 and o.location.z > 0.4:
        tiles.append(o)

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
scn.cycles.samples = 24
scn.render.resolution_x = 720
scn.render.resolution_y = 460

cam_data = bpy.data.cameras.new("C")
cam = bpy.data.objects.new("C", cam_data)
scn.collection.objects.link(cam)
scn.camera = cam
cam.location = mathutils.Vector((0, -2.0, 5.0))
d = mathutils.Vector((0, 0.2, 0.5)) - cam.location
cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

outdir = os.path.dirname(os.path.abspath(__file__))
scn.render.filepath = os.path.join(outdir, "debug_iso_with.png")
bpy.ops.render.render(write_still=True)
for t in tiles:
    t.hide_render = True
scn.render.filepath = os.path.join(outdir, "debug_iso_without.png")
bpy.ops.render.render(write_still=True)
print("ISO2 DONE")
