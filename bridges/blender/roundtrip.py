# ─────────────────────────────────────────────────────────────
# AnimeOS ROUND-TRIP (iteration 53, HARDENED in iteration 62) -
# an asset that cannot LEAVE the studio is not a production asset.
#
# GLTF (.glb) and FBX are the two interchange formats the wider
# pipeline speaks (game engines, mocap tools, contractor DCCs,
# distributors' QC lanes). A professional does not trust an export:
# they RE-IMPORT it and compare against the source. This script is
# that comparison, deterministic and honest - and since iteration 62
# it is a PER-CHECK verdict, not one drift number:
#
#   1. open the accepted .blend, count the source truth
#      (objects, meshes, triangles, material NAMES, armature BONE
#      NAMES, actions (name + frame range + fcurve count), UV
#      layers, bbox dims)
#   2. export GLB or FBX with the hardened flags (FBX
#      add_leaf_bones=False so bone names survive; animation bakes on)
#   3. wipe the scene, PURGE the orphaned datablocks (the source's
#      meshes/materials/armatures/actions are gone, not lurking at
#      zero users behind the counts), import the exported file back
#   4. run the CHECKS - each one ok/fail with its own detail line:
#        MESH_NAMES      which named meshes are missing
#        MESH_COUNT      mesh object count matches
#        MATERIAL_NAMES  which named materials are missing
#        ARMATURE_BONES  which named bones are missing
#        ACTION          the baked animation survives (a re-imported
#                        action whose frame range matches the source's,
#                        within 1% - FBX may rename the take, the
#                        RANGE is the animation's identity)
#        UV_SETS         the UV layers survive (re >= src)
#        DIMS            per-axis bbox dimensions (max delta <= 8%)
#        TRIS            triangle count (delta <= 8%; FBX
#                        re-triangulates ngons its own way - bounded,
#                        not unbounded)
#   5. print the ROUNDTRIP marker (JSON) the caller parses;
#      verified = EVERY check green
#
# Known-format honesty (lands in the report's notes, not hidden):
#   - GLB drops lights and cameras by design (it is a geometry,
#     material and scene-graph format) - so the comparison counts
#     MESH objects and names the exclusion
#   - FBX re-triangulates ngons its own way - triangle counts may
#     drift a little; the TRIS check bounds it
#   - FBX cannot carry a Geometry Nodes tree - the clean BASE meshes
#     export (use_mesh_modifiers=False), the variation is re-applied
#     or baked in the receiving DCC
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
    # names, not just counts: a count can match while the identity is lost
    materials = sorted(m.name for m in bpy.data.materials)
    bones = sorted(b.name for arm in bpy.data.armatures for b in arm.bones)
    actions = []
    for a in bpy.data.actions:
        try:
            fr = a.frame_range
            actions.append({
                "name": a.name,
                "start": round(float(fr[0]), 2),
                "end": round(float(fr[1]), 2),
                "fcurves": len(a.fcurves),
            })
        except Exception:
            actions.append({"name": a.name, "start": 0.0, "end": 0.0, "fcurves": len(a.fcurves)})
    uvs = sum(len(ob.data.uv_layers) for ob in meshes)
    return {
        "objects": len(scn.objects),
        "meshes": len(meshes),
        "meshNames": sorted(o.name for o in meshes),
        "tris": tris,
        "materials": len(materials),
        "materialNames": materials,
        "armatures": len(bpy.data.armatures),
        "bones": len(bones),
        "boneNames": bones,
        "actions": actions,
        "uvs": uvs,
        "dims": dims,
    }


def _purge_orphans(bpy):
    """Drop every datablock with zero users, recursively. Without this
    the wiped source's meshes/materials/armatures/actions LURK at zero
    users behind the counts and every comparison lies."""
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)


def _action_check(src_actions, re_actions):
    """The animation survives when SOME re-imported action's frame range
    matches SOME source action's range within 1% (or 1 frame on tiny
    ranges). FBX may rename the take; the RANGE is the identity."""
    if not src_actions:
        return True, "no source actions - nothing to verify"
    best = None
    for sa in src_actions:
        span = max(abs(sa["end"] - sa["start"]), 1e-6)
        tol = max(span * 0.01, 1.0)
        for ra in re_actions:
            d = max(abs(ra["start"] - sa["start"]), abs(ra["end"] - sa["end"]))
            if d <= tol:
                best = (sa, ra, d)
                break
        if best:
            break
    if best:
        sa, ra, d = best
        return True, f"'{sa['name']}' ({sa['start']}..{sa['end']}, {sa['fcurves']} fcurves) survived as '{ra['name']}' ({ra['start']}..{ra['end']}, {ra['fcurves']} fcurves, range delta {round(d, 2)})"
    srcs = ", ".join(f"{a['name']} {a['start']}..{a['end']}" for a in src_actions[:3])
    res = ", ".join(f"{a['name']} {a['start']}..{a['end']}" for a in re_actions[:3]) or "none"
    return False, f"no re-imported action matches the source range - src [{srcs}] vs re [{res}]"


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
            # compares the full designed form; animation carries explicitly
            bpy.ops.export_scene.gltf(filepath=export_path, use_selection=False, export_format="GLB", export_animations=True)
        else:
            # FBX cannot carry a Geometry Nodes tree, and exporting with
            # modifiers applied turns the carrier into bare points (the
            # 44m floor collapses out of the file). The professional
            # export is the BASE MESH: the scatter is re-applied or
            # baked in the receiving DCC - stated honestly in the notes.
            # add_leaf_bones=False keeps the bone NAMES exact (the default
            # appends _end leaves that would poison the bone comparison);
            # the animation bakes so the Action travels.
            bpy.ops.export_scene.fbx(
                filepath=export_path,
                use_selection=False,
                use_mesh_modifiers=False,
                add_leaf_bones=False,
                bake_anim=True,
            )
    except Exception as exc:  # noqa: BLE001
        return None, f"{fmt} export failed: {exc}"
    if not os.path.isfile(export_path) or os.path.getsize(export_path) == 0:
        return None, f"{fmt} export produced no file"

    # wipe and re-import: the same Blender that wrote the file reads it
    # back - the comparison is against the BYTES on disk, not memory.
    # The purge is the hardening: without it the source's datablocks
    # lurk at zero users and the name comparisons lie.
    for ob in list(scn.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    _purge_orphans(bpy)
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
        notes.append("FBX exported with add_leaf_bones=False so the bone names survive the trip exactly")
    notes.append("animation is verified as a frame-RANGE match on the re-imported actions (FBX may rename the take; the range is the identity)")

    # ── the per-check verdict (iteration 62 hardening) ──
    checks = []

    def add_check(name, ok, detail):
        checks.append({"name": name, "ok": bool(ok), "detail": str(detail)})

    missing = [n for n in src["meshNames"] if n not in set(re_stats["meshNames"])]
    add_check("MESH_NAMES", len(missing) == 0,
              "every named mesh survived the trip" if not missing else f"missing: {', '.join(missing[:8])}")

    add_check("MESH_COUNT", re_stats["meshes"] == src["meshes"],
              f"{src['meshes']} -> {re_stats['meshes']}")

    materials_missing = [n for n in src["materialNames"] if n not in set(re_stats["materialNames"])]
    add_check("MATERIAL_NAMES", len(materials_missing) == 0,
              f"{src['materials']} -> {re_stats['materials']} by name" if not materials_missing
              else f"missing: {', '.join(materials_missing[:8])} ({src['materials']} -> {re_stats['materials']})")

    bones_missing = [n for n in src["boneNames"] if n not in set(re_stats["boneNames"])]
    if src["bones"] > 0 or re_stats["bones"] > 0:
        add_check("ARMATURE_BONES", len(bones_missing) == 0,
                  f"{src['bones']} -> {re_stats['bones']} bones by name" if not bones_missing
                  else f"missing: {', '.join(bones_missing[:8])} ({src['bones']} -> {re_stats['bones']})")

    ok_action, detail_action = _action_check(src["actions"], re_stats["actions"])
    if src["actions"]:
        add_check("ACTION", ok_action, detail_action)

    if src["uvs"] > 0:
        add_check("UV_SETS", re_stats["uvs"] >= src["uvs"],
                  f"{src['uvs']} -> {re_stats['uvs']} UV layers")

    # drift: the worst per-axis bbox dimension delta, 0..1
    drift = 0.0
    if src["dims"] and re_stats["dims"]:
        for i in range(3):
            a = src["dims"][i]
            b = re_stats["dims"][i]
            if a > 1e-6:
                drift = max(drift, abs(a - b) / a)
    add_check("DIMS", drift <= 0.08, f"bbox delta {round(drift * 100, 2)}% (budget 8%)")

    tri_delta = 0.0
    if src["tris"] > 0:
        tri_delta = abs(src["tris"] - re_stats["tris"]) / src["tris"]
    add_check("TRIS", tri_delta <= 0.08,
              f"{src['tris']} -> {re_stats['tris']} tris (delta {round(tri_delta * 100, 2)}%, budget 8%)")

    drift = max(drift, tri_delta)
    verified = all(c["ok"] for c in checks)
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
        "materialsMissing": materials_missing[:8],
        "bonesSrc": src["bones"],
        "bonesRe": re_stats["bones"],
        "bonesMissing": bones_missing[:8],
        "actionsSrc": src["actions"][:4],
        "actionsRe": re_stats["actions"][:4],
        "uvsSrc": src["uvs"],
        "uvsRe": re_stats["uvs"],
        "dimsSrc": [round(d, 4) for d in (src["dims"] or [0, 0, 0])],
        "dimsRe": [round(d, 4) for d in (re_stats["dims"] or [0, 0, 0])],
        "bboxDeltaPct": round(drift * 100, 2),
        "missing": missing,
        "checks": checks,
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
