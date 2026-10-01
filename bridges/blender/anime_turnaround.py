# ─────────────────────────────────────────────────────────────
# AnimeOS ANIME TURNAROUND (iteration 109) - the design crew's eyes
#
# Builds ONE designed anime character from a DNA + designSpec and
# renders the model-sheet views the judge compares against the
# canonical sheet: FRONT, THREE-QUARTER, SIDE, BACK and a face CLOSE,
# under the production look (TOON by default), plus one stitched
# sheet. Optionally saves the .blend (the library container).
#
#   blender -b -P anime_turnaround.py -- --dna dna.json --out DIR
#           [--look TOON|PBR] [--views front,three,side,back,close]
#           [--samples 24] [--blend out.blend]
#   (or: python3 anime_turnaround.py ... with the bpy module)
#
# Prints one line: TURNAROUND {"views": {...}, "sheet": path,
#   "spec": {...}, "build": {...}} - the crew parses it.
# ─────────────────────────────────────────────────────────────
import argparse, importlib.util, json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)


def _args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--dna", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--look", default="TOON")
    ap.add_argument("--views", default="front,three,side,back,close")
    ap.add_argument("--samples", type=int, default=24)
    ap.add_argument("--res", type=int, default=640)
    ap.add_argument("--blend", default="")
    return ap.parse_args(argv)


VIEW_CAMS = {
    "front": ((0.0, -3.2, 0.5), (0.0, 0.0, 0.45), 50),
    "three": ((1.8, -2.6, 0.6), (0.0, 0.0, 0.45), 50),
    "side": ((3.2, 0.0, 0.5), (0.0, 0.0, 0.45), 50),
    "back": ((0.0, 3.2, 0.5), (0.0, 0.0, 0.45), 50),
    "close": ((0.18, -0.8, 0.88), (0.0, 0.0, 0.85), 70),
}


def main():
    a = _args()
    import bpy, mathutils
    spec_b = importlib.util.spec_from_file_location("animeos_bridge", os.path.join(HERE, "animeos_bridge.py"))
    br = importlib.util.module_from_spec(spec_b)
    spec_b.loader.exec_module(br)
    import anime_character as ac
    import toon_pass as tp

    dna = json.load(open(a.dna, encoding="utf-8"))
    os.makedirs(a.out, exist_ok=True)
    scn = bpy.context.scene
    for ob in list(scn.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    prof = br.material_profile(dna)
    pal = ((dna.get("sheetConformance") or {}).get("palette")) or None
    mats = {
        "robe": br.graded_mat(bpy, "cloth", "RobeMat", dna.get("robeColor", "#2f6d63"), prof, palette=pal),
        "accent": br.graded_mat(bpy, "cloth", "AccentMat", dna.get("robeAccent", "#a8842c"), prof, palette=pal),
        "skin": br.graded_mat(bpy, "skin", "SkinMat", dna.get("skinTone", "#f2d6c2"), prof, sdepth=br.skin_depth(dna)),
        "hair": br.graded_mat(bpy, "hair", "HairMat", dna.get("hairColor", "#16161d"), prof),
        "blade": br.emission_mat(bpy, "BladeMat", dna.get("bladeColor", "#40f2d2"), 4.0),
        "boots": br.graded_mat(bpy, "cloth", "BootsMat", "#241a12", prof),
    }
    fig = ac.build_anime_character(bpy, scn, dna, mats, br=br._grip_law())
    fig["syncRig"]()

    # a neutral model-sheet stage: soft grey ground + sky, sun + a key
    # that finds the face from every view
    w = bpy.data.worlds.new("SheetWorld")
    scn.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.62, 0.64, 0.68, 1.0)
    bg.inputs[1].default_value = 0.7
    sd = bpy.data.lights.new("Sun", "SUN")
    sd.energy = 2.6
    sun = bpy.data.objects.new("Sun", sd)
    scn.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    kd = bpy.data.lights.new("HeroKey", "AREA")
    kd.energy = 110.0
    kd.size = br.HERO_KEY_SIZE
    kd.color = br.hex_to_rgb(br.HERO_KEY_DAY)
    key = bpy.data.objects.new("HeroKey", kd)
    scn.collection.objects.link(key)
    tc = key.constraints.new("TRACK_TO")
    tc.target = fig["head"]
    tc.track_axis = "TRACK_NEGATIVE_Z"
    tc.up_axis = "UP_Y"
    bpy.ops.mesh.primitive_plane_add(size=8)
    g = bpy.context.active_object
    g.data.materials.append(br.principled_mat(bpy, "SheetGround", "#8a9096"))

    scn.render.engine = "CYCLES"
    scn.cycles.samples = a.samples
    scn.cycles.max_bounces = 2
    scn.render.resolution_x = a.res
    scn.render.resolution_y = int(a.res * 1.4)
    look = tp.apply_look(bpy, scn, a.look.upper(), "FINAL", br.hex_to_rgb, None)
    try:
        scn.view_layers[0].freestyle_settings.as_render_pass = False   # no comp graph here: ink straight in
    except Exception:  # noqa: BLE001
        pass
    cd = bpy.data.cameras.new("SheetCam")
    cam = bpy.data.objects.new("SheetCam", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    views = {}
    for vw in [v.strip() for v in a.views.split(",") if v.strip() in VIEW_CAMS]:
        loc, tgt, lens = VIEW_CAMS[vw]
        cam.location = loc
        cd.lens = lens
        d = mathutils.Vector(tgt) - mathutils.Vector(loc)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        br.aim_hero_key(key, cam.location, fig["head"], {"headH": 0.13})
        p = os.path.join(a.out, f"turn_{vw}.png")
        scn.render.filepath = p
        bpy.ops.render.render(write_still=True)
        views[vw] = p
    sheet = None
    try:
        import numpy as np
        imgs = []
        for vw in views:
            im = bpy.data.images.load(views[vw])
            px = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)
            imgs.append(px)
        if imgs:
            hgt = max(i.shape[0] for i in imgs)
            row = np.concatenate([np.pad(i, ((0, hgt - i.shape[0]), (0, 0), (0, 0))) for i in imgs], axis=1)
            out = bpy.data.images.new("TurnSheet", row.shape[1], row.shape[0], alpha=True)
            out.pixels.foreach_set(row.reshape(-1))
            sheet = os.path.join(a.out, "turn_sheet.png")
            out.filepath_raw = sheet
            out.file_format = "PNG"
            out.save()
    except Exception as exc:  # noqa: BLE001
        sheet = None
        print(f"[turnaround] sheet stitch skipped: {exc}")
    if a.blend:
        try:
            bpy.ops.wm.save_as_mainfile(filepath=a.blend, copy=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[turnaround] blend save skipped: {exc}")
    print("TURNAROUND " + json.dumps({
        "views": views, "sheet": sheet, "spec": fig["anime"]["spec"],
        "build": {"body": fig["anime"]["body"], "hair": fig["anime"]["hair"], "garments": fig["anime"]["garments"]},
        "look": look.get("look"),
    }))


if __name__ == "__main__":
    main()
