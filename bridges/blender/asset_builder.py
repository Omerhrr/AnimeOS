# ─────────────────────────────────────────────────────────────
# AnimeOS ASSET BUILDER (v4.1) - the design-time Blender pass
#
# Builds a LIBRARY ASSET (.blend) for one design DNA: the DESIGNED
# character (v4.0 figure builder, full v3.x rig contract) or the
# DESIGNED environment set, saved as a persistent, versionable
# asset the render worker can load instead of rebuilding
# procedurally. Geometry and materials ONLY go into the file - the
# worker keeps ownership of lighting, weather, sky and camera, so
# per-shot direction always wins.
#
# Run headless:
#   blender -b -P asset_builder.py -- --kind CHARACTER \
#     --dna <dna.json> --out <dir> [--name "Lin Yue"]
#
# After the .blend is saved the script stages its own neutral
# preview rig (3-point light + camera, NOT saved into the asset)
# and renders a turntable-ish preview PNG next to it.
#
# stdout markers the caller parses:
#   ASSET_BLEND <path>
#   ASSET_PREVIEW <path>
#   ASSET_OBJECTS <n>
#   ASSET_TRIS <n>
#   ASSET_ERROR <msg>
# ─────────────────────────────────────────────────────────────

import json
import math
import os
import sys


def _argv_map():
    extra = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {}
    i = 0
    while i < len(extra):
        key = extra[i]
        if key.startswith("--"):
            if i + 1 < len(extra) and not extra[i + 1].startswith("--"):
                out[key[2:]] = extra[i + 1]
                i += 2
            else:
                out[key[2:]] = True
                i += 1
        else:
            i += 1
    return out


def main():
    args = _argv_map()
    kind = str(args.get("kind", "CHARACTER")).upper()
    dna_path = str(args.get("dna", ""))
    out_dir = str(args.get("out", os.getcwd()))
    from_blend = str(args.get("blend", ""))
    os.makedirs(out_dir, exist_ok=True)

    dna = {}
    if dna_path:
        with open(dna_path, "r", encoding="utf-8") as fh:
            dna = json.load(fh)

    # the v4.0/v4.1 builders live next to this script
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import bpy
    import animeos_bridge as bridge

    scn = bpy.context.scene

    def fail(msg):
        print(f"ASSET_ERROR {msg}", flush=True)
        sys.stdout.flush()
        sys.exit(1)

    def purge():
        for ob in list(scn.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        for block_list in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
            for block in list(block_list):
                if block.users == 0:
                    block_list.remove(block)

    purge()

    name = str(dna.get("name") or args.get("name") or "asset")
    slug = "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-")[:48] or "asset"

    objects_before = len(scn.objects)

    if from_blend:
        # preview-only pass: open the accepted asset, skip the build
        if not os.path.isfile(from_blend):
            fail(f"asset .blend missing: {from_blend}")
        bpy.ops.wm.open_mainfile(filepath=from_blend)
        scn = bpy.context.scene
        blend_path = from_blend
        obj_count = len(scn.objects)
        tris = 0
        for ob in scn.objects:
            if ob.type == "MESH":
                tris += sum(len(p.vertices) - 2 for p in ob.data.polygons)
        print(f"ASSET_BLEND {blend_path}", flush=True)
        print(f"ASSET_OBJECTS {obj_count}", flush=True)
        print(f"ASSET_TRIS {tris}", flush=True)
    elif kind == "CHARACTER":
        mats = {
            "robe": bridge.principled_mat(bpy, "RobeMat", dna.get("robeColor", "#2f6d63"), 0.82),
            "accent": bridge.principled_mat(bpy, "AccentMat", dna.get("robeAccent", "#a8842c"), 0.7),
            "skin": bridge.principled_mat(bpy, "SkinMat", dna.get("skinTone", "#d9b48f"), 0.5),
            "hair": bridge.principled_mat(bpy, "HairMat", dna.get("hairColor", "#16161d"), 0.35),
            "blade": bridge.emission_mat(bpy, "BladeMat", dna.get("bladeColor", "#5eead4"), 3.0),
            "boots": bridge.principled_mat(bpy, "BootsMat", "#241a12", 0.8),
        }
        figure = bridge.build_designed_figure(bpy, scn, dna, mats)
        if not figure or "root" not in figure:
            fail("figure builder returned no rig")
        # neutral A-pose report so the caller can assert the rig contract
        rig_names = sorted(o.name for o in scn.objects)
        required = {"Root", "Spine", "Head", "RShoulder", "RElbow", "LShoulder", "LElbow",
                    "RHip", "RKnee", "LHip", "LKnee", "HandBlade", "BrowL", "BrowR", "EyeL", "EyeR", "Mouth"}
        missing = [n for n in required if n not in rig_names]
        if missing:
            fail(f"rig contract missing joints: {', '.join(missing)}")
    elif kind == "ENVIRONMENT":
        report = bridge.build_designed_set(bpy, scn, dna, {}, "asset-build")
        if not isinstance(report, dict) or not report.get("terrain"):
            fail("set builder returned no report")
    elif not from_blend:
        fail(f"unsupported kind {kind}")

    obj_count = len(scn.objects)
    tris = 0
    for ob in scn.objects:
        if ob.type == "MESH":
            tris += sum(len(p.vertices) - 2 for p in ob.data.polygons)

    blend_path = os.path.join(out_dir, f"{slug}.blend")
    if not from_blend:
        # strip the DNA of long audit text before writing meta into the file
        bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
        print(f"ASSET_BLEND {blend_path}", flush=True)
        print(f"ASSET_OBJECTS {obj_count - objects_before}", flush=True)
        print(f"ASSET_TRIS {tris}", flush=True)

    # ── preview rig (NOT saved into the asset - this scene state
    #    exists only to show the asset) ──
    world = bpy.data.worlds.new("PreviewWorld")
    scn.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.045, 0.05, 0.062, 1.0)
        bg.inputs[1].default_value = 1.0

    def add_light(name, loc, energy, color=(1.0, 0.96, 0.9), size=2.0):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.size = size
        ob = bpy.data.objects.new(name, data)
        ob.location = loc
        scn.collection.objects.link(ob)
        return ob

    key = add_light("PreviewKey", (2.2, -2.6, 3.0), 420)
    key.rotation_euler = (math.radians(52), 0, math.radians(38))
    fill = add_light("PreviewFill", (-2.8, -1.4, 1.6), 140, color=(0.75, 0.82, 0.95))
    fill.rotation_euler = (math.radians(78), 0, math.radians(-64))
    rim = add_light("PreviewRim", (0.4, 2.8, 2.4), 220, color=(0.92, 0.86, 1.0))
    rim.rotation_euler = (math.radians(-40), 0, math.radians(180))

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 55 if kind == "CHARACTER" else 32
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    scn.collection.objects.link(cam)
    scn.camera = cam
    # track-to framing: aim at the asset's visual center (a character's
    # chest, the set's midline) - manual euler tables kept cropping
    target = bpy.data.objects.new("PreviewTarget", None)
    target.location = (0.0, 0.0, 0.52) if kind == "CHARACTER" else (0.0, 0.0, 0.8)
    scn.collection.objects.link(target)
    con = cam.constraints.new("TRACK_TO")
    con.target = target
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    if kind == "CHARACTER":
        cam.location = (1.5, -1.9, 1.05)
    else:
        cam.location = (6.8, -7.2, 3.6)

    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = 40
    scn.render.resolution_x = 512
    scn.render.resolution_y = 512
    scn.render.film_transparent = False
    preview_path = os.path.join(out_dir, f"{slug}.png")
    scn.render.filepath = preview_path
    bpy.ops.render.render(write_still=True)
    if not os.path.exists(preview_path):
        fail("preview render produced no file")
    print(f"ASSET_PREVIEW {preview_path}", flush=True)
    print("ASSET_OK", flush=True)


main()
