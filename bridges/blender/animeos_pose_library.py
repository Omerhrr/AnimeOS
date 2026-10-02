# ─────────────────────────────────────────────────────────────
# AnimeOS POSE LIBRARY LAW (iteration 118) - THE VOCABULARY BECOMES
# BLENDER-NATIVE.
#
# The choreographer's grammar poses (LUNGE/SLASH/BLOCK/...) live as
# angle tuples in POSE_JOINTS. The pose_library addon turns them into
# what they really are: POSE ASSETS - Blender's own reusable pose
# vocabulary, one asset per canonical pose on an armature whose bone
# names are the production rig's (_bone_table), transformed with the
# SAME convention apply_pose drives the joint empties with.
#
# The laws:
#   1. THE NAMES MATCH THE RIG. The library's armature carries the
#      production bone names (Pelvis/Spine/Head/L,RShoulder/Elbow/
#      Palm/Hip/Knee) - a future linker can retarget these assets
#      onto any studio figure without a name map.
#   2. THE CONVENTION MATCHES THE PERFORMANCE. spine/head +X,
#      shoulders +X, elbows -X, hips -X, the knees take the leg-IK
#      solve's fold-only answer - the same writes apply_pose makes
#      every frame.
#   3. THE LIBRARY IS A FILE. The assets persist in a .blend the
#      whole crew can link from (public/pose-library/) - the tandem
#      fleet shares ONE vocabulary, not per-job copies.
#   4. THE VOCABULARY IS THE LAW'S. The asset set is exactly
#      POSE_JOINTS' canonical names; an alias (ATTACK etc.) resolves
#      through POSE_ALIASES and never becomes its own asset.
# ─────────────────────────────────────────────────────────────

import json
import os
import sys

POSE_LIBRARY_VERSION = "pose-lib-v1"


def _here():
    return os.path.dirname(os.path.abspath(__file__))


def build_library(path):
    """Build the pose asset library at `path`. Returns the summary
    dict. Runs inside Blender only (bpy + the pose_library addon)."""
    import bpy

    if _here() not in sys.path:
        sys.path.insert(0, _here())
    import animeos_bridge as ab

    # fresh scene, the library armature at the spec defaults
    bpy.ops.wm.read_factory_settings(use_empty=True)
    spec = ab.resolve_spec({}) if hasattr(ab, "resolve_spec") else None
    if spec is None:
        import anime_character

        spec = anime_character.resolve_spec({})
    table = _bone_names(spec)

    arm_data = bpy.data.armatures.new("AnimePoseLib")
    ob = bpy.data.objects.new("AnimePoseLib", arm_data)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    # bone layout mirrors the production rig: vertical spine chain,
    # limbs along -Z (the _bone_table convention, spec defaults)
    z = {
        "Pelvis": (0.0, 0.92, 1.3),
        "Spine": (1.3, 1.7),
        "Head": (1.7, 2.0),
    }
    made = []
    for name, h, t in table:
        eb = arm_data.edit_bones.new(name)
        eb.head, eb.tail = h, t
        eb.roll = 0.0
        made.append(name)
    bpy.ops.object.mode_set(mode="POSE")

    assets = []
    for i, (name, row) in enumerate(sorted(ab.POSE_JOINTS.items())):
        (root_x, root_y, spine_a, head_a, r_arm, r_elb, l_arm, l_elb, r_leg, r_knee, l_leg, l_knee) = row
        import math

        # clear to rest, then the apply_pose convention
        for pb in ob.pose.bones:
            pb.rotation_euler = (0.0, 0.0, 0.0)
        bones = {n: ob.pose.bones.get(n) for n in made}
        bones["Spine"].rotation_euler.x = math.radians(spine_a)
        bones["Head"].rotation_euler.x = math.radians(head_a)
        bones["RShoulder"].rotation_euler.x = math.radians(r_arm)
        bones["LShoulder"].rotation_euler.x = math.radians(l_arm)
        bones["RElbow"].rotation_euler.x = math.radians(-r_elb)
        bones["LElbow"].rotation_euler.x = math.radians(-l_elb)
        bones["RHip"].rotation_euler.x = math.radians(-r_leg)
        bones["LHip"].rotation_euler.x = math.radians(-l_leg)
        # THE KNEES TAKE THE SOLVE (the fold-only law, not the raw row)
        ik_r = ab.solve_leg_ik(root_y, r_leg, r_knee)
        ik_l = ab.solve_leg_ik(root_y, l_leg, l_knee)
        bones["RKnee"].rotation_euler.x = math.radians(ik_r["knee"])
        bones["LKnee"].rotation_euler.x = math.radians(ik_l["knee"])
        for pb in ob.pose.bones:
            pb.select = True
            pb.keyframe_insert("rotation_euler", frame=i + 1)
        res = bpy.ops.poselib.create_pose_asset(pose_name=name)
        if res == {"FINISHED"}:
            assets.append(name)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    return {
        "lawVersion": POSE_LIBRARY_VERSION,
        "path": path,
        "bones": made,
        "assets": sorted(assets),
        "expected": sorted(ab.POSE_JOINTS.keys()),
    }


def _bone_names(spec):
    """(name, head, tail) for the library armature - the production
    _bone_table's NAMES at spec-default positions."""
    L = spec["body"] if isinstance(spec, dict) else {}
    sw = 1.0
    hp = 1.0
    t = [
        ("Pelvis", (0.0, 0.0, 0.92), (0.0, 0.0, 1.3)),
        ("Spine", (0.0, 0.0, 1.3), (0.0, 0.0, 1.7)),
        ("Head", (0.0, 0.0, 1.7), (0.0, 0.0, 2.0)),
    ]
    for side, P in ((1.0, "L"), (-1.0, "R")):
        sx = side * 0.24 * sw
        t += [
            (P + "Shoulder", (sx, 0.0, 1.62), (sx, 0.0, 1.37)),
            (P + "Elbow", (sx, 0.0, 1.37), (sx, 0.0, 1.12)),
            (P + "Palm", (sx, 0.0, 1.12), (sx, 0.0, 1.06)),
            (P + "Hip", (side * 0.1 * hp, 0.0, 0.98), (side * 0.1 * hp, 0.0, 0.54)),
            (P + "Knee", (side * 0.1 * hp, 0.0, 0.54), (side * 0.1 * hp, -0.06, 0.04)),
        ]
    return t


def verify_library(path):
    """Re-open the saved .blend as a library and verify the assets
    landed. Returns (ok, detail)."""
    import bpy

    bpy.ops.wm.open_mainfile(filepath=path)
    got = sorted(a.name for a in bpy.data.actions if a.asset_data is not None)
    return got


def main():
    argv = sys.argv
    extra = argv[argv.index("--") + 1:] if "--" in argv else []
    out = None
    for i, a in enumerate(extra):
        if a == "--write-pose-library" and i + 1 < len(extra):
            out = extra[i + 1]
    if not out:
        print("usage: blender -b --python pose_library.py -- --write-pose-library <path>")
        return
    summary = build_library(out)
    got = verify_library(out)
    summary["verifiedAssets"] = got
    summary["verifyOk"] = got == summary["expected"]
    print("POSE_LIBRARY_SUMMARY " + json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
