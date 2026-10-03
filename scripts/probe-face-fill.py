#!/usr/bin/env python3
# THE FACE-KEY PROBE (eye before pen): build the real committed Lin Yue
# (anime:v120 path), frame the CLOSEUP the night rode, aim the hero key
# + the face fill by the 113 law, apply the 121 TOON look, and render
# THREE frames: fill ON (the standing law), fill OFF, fill ALIGNED (the
# candidate law: the fill rides the key's own direction). The pixels
# answer whether the forehead ellipse + under-eye patches are the fill's
# own toon-band contour.
import importlib.util, json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
DNA = os.path.join(ROOT, "public", "designs", "cmuq1s4i00007ppgsjqryw9r5", "r2", "dna.json")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect")

import bpy, mathutils

spec_ = importlib.util.spec_from_file_location("bridge", BRIDGE)
m = importlib.util.module_from_spec(spec_)
spec_.loader.exec_module(m)
sys.path.insert(0, os.path.dirname(BRIDGE))
import anime_character
import toon_pass as tp

with open(DNA) as fh:
    dna = json.load(fh)

scn = bpy.context.scene

# the mats the bridge hands the builder (the graded surface trees the
# night rode - raw defaults would toon-convert to white)
mprof = m.material_profile(dna)
sdep = m.skin_depth(dna)
hero_mats = {
    "robe": m.graded_mat(bpy, "cloth", "RobeMat", dna.get("robeColor", "#2f6d63"), mprof),
    "accent": m.graded_mat(bpy, "cloth", "AccentMat", dna.get("robeAccent", "#a8842c"), mprof),
    "skin": m.graded_mat(bpy, "skin", "SkinMat", dna.get("skinTone", "#d9b48f"), mprof, sdepth=sdep),
    "hair": m.graded_mat(bpy, "hair", "HairMat", dna.get("hairColor", "#16161d"), mprof),
    "blade": m.emission_mat(bpy, "BladeMat", dna.get("bladeColor") or "#5eead4", 6.8),
    "boots": m.graded_mat(bpy, "cloth", "BootsMat", "#241a12", mprof),
}

figure = anime_character.build_anime_character(bpy, scn, dna, hero_mats, br=m._grip_law())
head = figure["head"]
print("PROBE figure:", figure["builder"])

# camera: the CLOSEUP framing (the night's 0.8-face shot rode ~0.9m at 50mm)
cam_data = bpy.data.cameras.new("ProbeCam")
cam_data.lens = 50.0
cam = bpy.data.objects.new("ProbeCam", cam_data)
scn.collection.objects.link(cam)
scn.camera = cam

# face target: the FaceTarget empty rides the head's front (the 113 law)
ft = bpy.data.objects.new("FaceTarget", None)
scn.collection.objects.link(ft)
ft.parent = head
ft.location = (0.0, -0.108, 0.128)

bpy.context.view_layer.update()
h = ft.matrix_world.translation
cam_loc = (h.x + 0.02, h.y - 0.85, h.z + 0.02)
cam.location = cam_loc
d = h - mathutils.Vector(cam_loc)
cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

# the key + the fill (the 113 rig)
key_data = bpy.data.lights.new("ProbeKey", "AREA")
key_data.size = m.HERO_KEY_SIZE
key_data.color = m.hex_to_rgb(m.HERO_KEY_NIGHT) if True else (1, 1, 1)
key = bpy.data.objects.new("ProbeKey", key_data)
scn.collection.objects.link(key)
key["baseEnergy"] = 900.0
key_data.energy = 900.0

fill_data = bpy.data.lights.new("ProbeFill", "AREA")
fill_data.size = m.FACE_FILL_SIZE
fill_data.color = m.hex_to_rgb(m.HERO_KEY_NIGHT)
fill = bpy.data.objects.new("ProbeFill", fill_data)
scn.collection.objects.link(fill)

scn.render.film_transparent = False
scn.world = bpy.data.worlds.new("ProbeWorld")
scn.world.use_nodes = True
bg = scn.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.035, 0.04, 0.055, 1.0)
    bg.inputs[1].default_value = 1.0

subject = {"headH": 0.26}


def aim(fill_yaw, fill_rise, fill_size):
    m.aim_hero_key(key, cam_loc, ft, subject, fill_ob=fill)
    # override the fill placement (the candidate law)
    import mathutils
    hh = ft.matrix_world.translation
    v = mathutils.Vector((cam_loc[0] - hh.x, cam_loc[1] - hh.y, 0.0))
    if v.length < 1e-6:
        v = mathutils.Vector((0.0, -1.0, 0.0))
    v.normalize()
    yaw = math.radians(fill_yaw)
    vx = v.x * math.cos(yaw) - v.y * math.sin(yaw)
    vy = v.x * math.sin(yaw) + v.y * math.cos(yaw)
    head_h = subject["headH"]
    dist = max(0.5, head_h * 7.0)
    rise = math.radians(fill_rise)
    fill_data.size = fill_size
    fill.location = (hh.x + vx * dist * math.cos(rise), hh.y + vy * dist * math.cos(rise), hh.z + dist * math.sin(rise))


# the 121 TOON look at CLOSEUP framing
framing = {"shotType": "CLOSEUP", "dist": 0.85, "lens": 50.0, "resX": 640}
look_ev = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb, None, framing_ctx=framing)
print("PROBE look:", json.dumps(look_ev)[:220])

scn.render.resolution_x = 640
scn.render.resolution_y = 640
scn.render.resolution_percentage = 100
scn.render.image_settings.file_format = "PNG"
scn.render.engine = "CYCLES"
scn.cycles.samples = 48
scn.cycles.device = "CPU"

# ink hull ON (the night's re-score law)
os.environ["ANIMEOS_INK"] = "hull"

shots = [
    ("fill_on", 24.0, 14.0, m.FACE_FILL_SIZE, True),
    ("fill_off", 24.0, 14.0, m.FACE_FILL_SIZE, False),
    ("fill_aligned", m.HERO_KEY_YAW, m.HERO_KEY_RISE, 0.9, True),
]
for name, fy, fr, fsz, on in shots:
    aim(fy, fr, fsz)
    fill.hide_render = not on
    bpy.context.view_layer.update()
    # re-apply the look so the toon band tree re-measures with the new lights
    tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb, None, framing_ctx=framing)
    scn.render.filepath = os.path.join(OUT, f"probe_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("PROBE wrote", name)

print("PROBE DONE")
