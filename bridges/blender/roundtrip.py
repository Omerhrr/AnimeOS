# ─────────────────────────────────────────────────────────────
# AnimeOS ROUND-TRIP (iteration 53) - an asset that cannot LEAVE
# the studio is not a production asset.
#
# GLTF (.glb) and FBX are the two interchange formats the wider
# pipeline speaks (game engines, mocap tools, contractor DCCs,
# distributors' QC lanes). A professional does not trust an export:
# they RE-IMPORT it and compare against the source. This script is
# that comparison, deterministic and honest:
#
#   1. open the accepted .blend, count the source truth
#      (objects, meshes, triangles, materials, bbox dims)
#   2. export GLB or FBX
#   3. wipe the scene, import the exported file back
#   4. compare: object count, triangle count, material count,
#      per-axis bbox dimensions (max delta %), and WHICH named
#      meshes are missing from the re-import
#   5. print the ROUNDTRIP marker (JSON) the caller parses
#
# Known-format honesty (lands in the report's notes, not hidden):
#   - GLB drops lights and cameras by design (it is a geometry,
#     material and scene-graph format) - so the comparison counts
#     MESH objects and names the exclusion
#   - FBX re-triangulates ngons its own way - triangle counts may
#     drift a little; the drift number reports it
#   - armatures/actions travel in both formats but ANIMATION is not
#     compared here (a frame-sampled pose comparison is a separate,
#     heavier pass)
# ─────────────────────────────────────────────────────────────

import json
import os
import sys


def _scene_stats(bpy, scn):
    meshes = [o for o in scn.objects if o.type == "MESH"]
    tris = 0
    for ob in meshes:
        tris += sum(len(p.vertices) - 2 for p in ob.data.polygons)
    import mathutils

    mins = [1e9, 1e9, 1e9]
    maxs = [-1e9, -1e9, -1e9]
    for ob in meshes:
        for corner in ob.bound_box:
            wc = ob.matrix_world @ mathutils.Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], wc[i])
                maxs[i] = max(maxs[i], wc[i])
    dims = None
    if mins[0] < 1e8:
        dims = [maxs[i] - mins[i] for i in range(3)]
    return {
        "objects": len(scn.objects),
        "meshes": len(meshes),
        "meshNames": sorted(o.name for o in meshes),
        "tris": tris,
        "materials": len(bpy.data.materials),
        "dims": dims,
    }


def run(bpy, blend_path, fmt, out_dir):
    """One round-trip. Returns (report_dict, error_string)."""
    fmt = str(fmt).strip().upper()
    if fmt not in ("GLB", "FBX"):
        return None, f"unknown format '{fmt}' (allowed: GLB, FBX)"
    if not os.path.isfile(blend_path):
        return None, f"asset .blend missing: {blend_path}"
    os.makedirs(out_dir, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=blend_path)
    scn = bpy.context.scene
    src = _scene_stats(bpy, scn)
    if src["meshes"] == 0:
        return None, "the asset carries no meshes - nothing to round-trip"

    notes = []
    ext = "glb" if fmt == "GLB" else "fbx"
    export_path = os.path.join(out_dir, f"asset.{ext}")
    try:
        if fmt == "GLB":
            # glTF evaluates the node tree and REALIZES the instances:
            # the variation travels as real geometry, so the round-trip
            # compares the full designed form
            bpy.ops.export_scene.gltf(filepath=export_path, use_selection=False, export_format="GLB")
        else:
            # FBX cannot carry a Geometry Nodes tree, and exporting with
            # modifiers applied turns the carrier into bare points (the
            # 44m floor collapses out of the file). The professional
            # export is the BASE MESH: the scatter is re-applied or
            # baked in the receiving DCC - stated honestly in the notes.
            bpy.ops.export_scene.fbx(filepath=export_path, use_selection=False, use_mesh_modifiers=False)
    except Exception as exc:  # noqa: BLE001
        return None, f"{fmt} export failed: {exc}"
    if not os.path.isfile(export_path) or os.path.getsize(export_path) == 0:
        return None, f"{fmt} export produced no file"

    # wipe and re-import: the same Blender that wrote the file reads it
    # back - the comparison is against the BYTES on disk, not memory
    for ob in list(scn.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    try:
        if fmt == "GLB":
            bpy.ops.import_scene.gltf(filepath=export_path)
        else:
            bpy.ops.import_scene.fbx(filepath=export_path)
    except Exception as exc:  # noqa: BLE001
        return None, f"{fmt} re-import failed: {exc}"
    re_stats = _scene_stats(bpy, scn)

    if fmt == "GLB":
        notes.append("GLB carries geometry, materials and the scene graph - lights and cameras stay behind by design, so the comparison judges meshes")
        notes.append("glTF realizes the Geometry Nodes variation into real geometry - the scattered set travels whole")
    else:
        notes.append("FBX re-triangulates ngons its own way - a small triangle drift is the format, not a loss")
        notes.append("FBX cannot carry a Geometry Nodes tree - the base meshes export clean and the variation is re-applied or baked in the receiving DCC")
    notes.append("armature + baked Action travel in the file; animation is not frame-compared in this pass")

    missing = [n for n in src["meshNames"] if n not in set(re_stats["meshNames"])]

    # drift: the worst per-axis bbox dimension delta, 0..1
    drift = 0.0
    if src["dims"] and re_stats["dims"]:
        for i in range(3):
            a = src["dims"][i]
            b = re_stats["dims"][i]
            if a > 1e-6:
                drift = max(drift, abs(a - b) / a)
    tri_delta = 0.0
    if src["tris"] > 0:
        tri_delta = abs(src["tris"] - re_stats["tris"]) / src["tris"]
    drift = max(drift, tri_delta)

    verified = (
        len(missing) == 0
        and re_stats["meshes"] == src["meshes"]
        and drift <= 0.08
    )
    report = {
        "format": fmt,
        "path": export_path,
        "bytes": os.path.getsize(export_path),
        "objectsSrc": src["objects"],
        "meshesSrc": src["meshes"],
        "meshesRe": re_stats["meshes"],
        "trisSrc": src["tris"],
        "trisRe": re_stats["tris"],
        "triDeltaPct": round(tri_delta * 100, 2),
        "materialsSrc": src["materials"],
        "materialsRe": re_stats["materials"],
        "dimsSrc": [round(d, 4) for d in (src["dims"] or [0, 0, 0])],
        "dimsRe": [round(d, 4) for d in (re_stats["dims"] or [0, 0, 0])],
        "bboxDeltaPct": round(drift * 100, 2),
        "missing": missing,
        "verified": verified,
        "notes": notes,
    }
    return report, None


def main():
    # called by the runBlenderScript driver: --out <dir> then the
    # driver's own args follow (--blend, --format)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opts = {}
    i = 0
    while i < len(argv):
        if argv[i].startswith("--"):
            key = argv[i][2:]
            if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
                opts[key] = argv[i + 1]
                i += 2
            else:
                opts[key] = True
                i += 1
        else:
            i += 1
    out_dir = str(opts.get("out", os.getcwd()))
    blend_path = str(opts.get("blend", ""))
    fmt = str(opts.get("format", "GLB"))

    import bpy

    report, err = run(bpy, blend_path, fmt, out_dir)
    if report is None:
        print(f"RT_ERROR {err}", flush=True)
        sys.exit(1)
    print(f"ROUNDTRIP {json.dumps(report)}", flush=True)
    print("RT_OK", flush=True)


if __name__ == "__main__":
    main()
