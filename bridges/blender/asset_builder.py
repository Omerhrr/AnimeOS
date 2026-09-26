# ─────────────────────────────────────────────────────────────
# AnimeOS ASSET BUILDER (v5.0) - the design-time Blender pass
#
# Builds a LIBRARY ASSET (.blend) for one design DNA: the DESIGNED
# character (v4.0 figure builder, full v3.x rig contract), the
# DESIGNED environment set, the DESIGNED prop (v5.0 weapons,
# artifacts, vessels, relics) or the DESIGNED creature (v5.0
# quadruped / serpent / bird) - saved as a persistent, versionable
# asset the render worker can load instead of rebuilding
# procedurally. Geometry and materials ONLY go into the file - the
# worker keeps ownership of lighting, weather, sky and camera, so
# per-shot direction always wins.
#
# Run headless:
#   blender -b -P asset_builder.py -- --kind CHARACTER \
#     --dna <dna.json> --out <dir> [--name "Lin Yue"] \
#     [--material <recipe.json>] [--rig <rig.json>]
#
# --material is a DESIGNED material recipe (design_material): the
#   builder applies it to the asset's primary materials after the
#   build (a recipe is law over the DNA defaults).
# --rig is a DESIGNED lighting rig (design_lighting): it drives the
#   PREVIEW rig only (key/fill/rim energy + color + camera) - the
#   saved asset still carries no lights.
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
    material_path = str(args.get("material", ""))
    rig_path = str(args.get("rig", ""))
    os.makedirs(out_dir, exist_ok=True)

    dna = {}
    if dna_path:
        with open(dna_path, "r", encoding="utf-8") as fh:
            dna = json.load(fh)
    recipe = None
    if material_path:
        try:
            with open(material_path, "r", encoding="utf-8") as fh:
                recipe = json.load(fh)
        except Exception:  # noqa: BLE001
            recipe = None
    rig = None
    if rig_path:
        try:
            with open(rig_path, "r", encoding="utf-8") as fh:
                rig = json.load(fh)
        except Exception:  # noqa: BLE001
            rig = None

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
    elif kind == "PROP":
        report = bridge.build_designed_prop(bpy, scn, dna)
        if not isinstance(report, dict) or not report.get("parts"):
            fail("prop builder returned no parts")
    elif kind == "CREATURE":
        report = bridge.build_designed_creature(bpy, scn, dna)
        if not isinstance(report, dict) or not report.get("parts"):
            fail("creature builder returned no parts")
    elif not from_blend:
        fail(f"unsupported kind {kind}")

    # DESIGNED material recipe is law over the DNA defaults: apply it
    # to the asset's primary materials AFTER the build (the builder
    # names its primary 'PropBodyMat' / 'HideMat' / 'RobeMat').
    if isinstance(recipe, dict):
        targets = recipe.get("targets") or {
            "CHARACTER": ["RobeMat"],
            "PROP": ["PropBodyMat"],
            "CREATURE": ["HideMat"],
        }.get(kind, [])
        for mat_name in targets:
            mat = bpy.data.materials.get(mat_name)
            if not mat or not mat.use_nodes:
                continue
            b = mat.node_tree.nodes.get("Principled BSDF")
            if not b:
                continue
            if recipe.get("baseColor"):
                b.inputs["Base Color"].default_value = (*bridge.hex_to_rgb(recipe["baseColor"]), 1.0)
            if recipe.get("roughness") is not None:
                b.inputs["Roughness"].default_value = max(0.0, min(1.0, float(recipe["roughness"])))
            if recipe.get("metallic") is not None:
                b.inputs["Metallic"].default_value = max(0.0, min(1.0, float(recipe["metallic"])))
            if recipe.get("ior") is not None and "IOR" in b.inputs:
                b.inputs["IOR"].default_value = max(0.0, min(2.0, float(recipe["ior"])))
            if recipe.get("emissionColor"):
                glow = bpy.data.materials.get("PropGlowMat") or bpy.data.materials.get("CreatureGlowMat")
                if glow and glow.use_nodes:
                    em = glow.node_tree.nodes.get("Emission")
                    if em:
                        em.inputs[0].default_value = (*bridge.hex_to_rgb(recipe["emissionColor"]), 1.0)
                    if recipe.get("emissionStrength") is not None and em:
                        em.inputs[1].default_value = max(0.0, float(recipe["emissionStrength"]))

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

    # DESIGNED lighting rig (design_lighting) drives the preview rig:
    # key/fill/rim energy + color + background strength + camera lens.
    # Defaults stay the neutral studio 3-point setup.
    rig_params = rig if isinstance(rig, dict) else {}

    def _rig_color(key, fallback):
        v = rig_params.get(key)
        if isinstance(v, str) and len(v) >= 7:
            try:
                return bridge.hex_to_rgb(v)
            except Exception:  # noqa: BLE001
                return fallback
        return fallback

    key = add_light("PreviewKey", (2.2, -2.6, 3.0), float(rig_params.get("keyEnergy", 420)), color=_rig_color("keyColor", (1.0, 0.96, 0.9)))
    key.rotation_euler = (math.radians(52), 0, math.radians(38))
    fill = add_light("PreviewFill", (-2.8, -1.4, 1.6), float(rig_params.get("fillEnergy", 140)), color=_rig_color("fillColor", (0.75, 0.82, 0.95)))
    fill.rotation_euler = (math.radians(78), 0, math.radians(-64))
    rim = add_light("PreviewRim", (0.4, 2.8, 2.4), float(rig_params.get("rimEnergy", 220)), color=_rig_color("rimColor", (0.92, 0.86, 1.0)))
    rim.rotation_euler = (math.radians(-40), 0, math.radians(180))
    if bg and isinstance(rig_params.get("bgStrength"), (int, float)):
        bg.inputs[1].default_value = float(rig_params["bgStrength"])

    cam_data = bpy.data.cameras.new("PreviewCam")
    default_lens = 55 if kind in ("CHARACTER", "PROP") else (85 if kind == "CREATURE" else 32)
    cam_data.lens = float(rig_params.get("camLens", default_lens))
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    scn.collection.objects.link(cam)
    scn.camera = cam
    # track-to framing: aim at the asset's visual center (a character's
    # chest, the set's midline) - manual euler tables kept cropping
    target = bpy.data.objects.new("PreviewTarget", None)
    if kind == "CHARACTER":
        target.location = (0.0, 0.0, 0.52)
    elif kind == "PROP":
        target.location = (0.0, 0.0, 0.35)
    elif kind == "CREATURE":
        target.location = (0.0, 0.0, 0.45)
    else:
        target.location = (0.0, 0.0, 0.8)
    scn.collection.objects.link(target)
    con = cam.constraints.new("TRACK_TO")
    con.target = target
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"

    # FRAME THE ACTUAL BUILD: compute the asset's world bounding box
    # and back the camera off along a 3/4 view far enough to hold the
    # whole asset (magic per-kind camera tables cropped big swords and
    # put the camera inside large serpents). Distance from the real
    # dimensions + the lens' vertical FOV - professional framing that
    # adapts to any size the design asks for.
    import mathutils

    mins = [1e9, 1e9, 1e9]
    maxs = [-1e9, -1e9, -1e9]
    for ob in scn.objects:
        if ob.type == "MESH":
            for corner in ob.bound_box:
                wc = ob.matrix_world @ mathutils.Vector(corner)
                for i in range(3):
                    mins[i] = min(mins[i], wc[i])
                    maxs[i] = max(maxs[i], wc[i])
    if mins[0] < 1e8:
        center = mathutils.Vector(
            ((mins[0] + maxs[0]) / 2, (mins[1] + maxs[1]) / 2, (mins[2] + maxs[2]) / 2)
        )
        dims = (maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2])
        radius = 0.5 * math.sqrt(dims[0] ** 2 + dims[1] ** 2 + dims[2] ** 2) or 0.8
    else:
        center = mathutils.Vector((0, 0, 0.5))
        radius = 0.8
    target.location = (center.x, center.y, center.z)
    lens = cam_data.lens
    half_fov = math.atan(12.0 / lens)  # 24mm sensor, half height 12mm
    dist = (radius * 1.18) / math.tan(half_fov)
    direction = mathutils.Vector((0.55, -1.0, 0.38)).normalized()  # 3/4 above
    cam.location = center + direction * dist

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
