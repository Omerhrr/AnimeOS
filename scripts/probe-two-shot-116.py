# Probe: replicate the S006 build path (anime hero + anime second figure,
# conformance regrade, cel look) and measure BOTH rigs with
# measure_subject - to find why the second rig measures None in the
# real render (twoShot: null) while the hero measures 0.9303.
import json
import math
import os
import sys

import bpy

ROOT = "/home/z/my-project/AnimeOS"
sys.path.insert(0, os.path.join(ROOT, "bridges", "blender"))

import animeos_bridge as B  # noqa: E402

scn = bpy.context.scene
scn.render.engine = "CYCLES"

mats = {
    "robe": B.graded_mat(bpy, "cloth", "RobeMat", "#9cc5b4", B.material_profile({})),
    "accent": B.graded_mat(bpy, "cloth", "AccentMat", "#c2b280", B.material_profile({})),
    "skin": B.graded_mat(bpy, "skin", "SkinMat", "#f0d5c0", B.material_profile({}), sdepth=B.skin_depth({})),
    "hair": B.graded_mat(bpy, "hair", "HairMat", "#1a1a1a", B.material_profile({})),
    "blade": None,
    "boots": B.graded_mat(bpy, "cloth", "BootsMat", "#241a12", B.material_profile({})),
}

dna_hero = {"name": "Lin Yue", "hairColor": "#1a1a1a", "robeColor": "#9cc5b4", "robeAccent": "#c2b280",
            "skinTone": "#f0d5c0", "weaponType": "sword"}
dna_other = {"name": "Demon Lord Wei", "hairColor": "#0a0a0a", "robeColor": "#5b7d7e", "robeAccent": "#c5a96f",
             "skinTone": "#e8d4c4", "weaponType": "none"}

hero = B.build_anime_character(bpy, scn, dna_hero, mats, br=B._grip_law()) if hasattr(B, "build_anime_character") else None
if hero is None:
    import anime_character
    hero = anime_character.build_anime_character(bpy, scn, dna_hero, mats, br=B._grip_law())
print("PROBE hero builder ok, root:", hero.get("root") is not None)

mats_b = {
    "robe": B.graded_mat(bpy, "cloth", "RobeMatB", "#5b7d7e", B.material_profile({})),
    "accent": B.graded_mat(bpy, "cloth", "AccentMatB", "#c5a96f", B.material_profile({})),
    "skin": B.graded_mat(bpy, "skin", "SkinMatB", "#e8d4c4", B.material_profile({}), sdepth=B.skin_depth({})),
    "hair": B.graded_mat(bpy, "hair", "HairMatB", "#0a0a0a", B.material_profile({})),
    "blade": mats["blade"],
    "boots": B.graded_mat(bpy, "cloth", "BootsMatB", "#241a12", B.material_profile({})),
}
import anime_character  # noqa: E402
other = anime_character.build_anime_character(bpy, scn, dna_other, mats_b, br=B._grip_law())
print("PROBE other builder ok, root:", other.get("root") is not None, "head:", other.get("head") is not None)

# place the second figure like the 116 law does
_loc, _rot = B.standoff_placement("WIDE", B.base_camera_angle({"number": 6}), 0.9)
other["root"].location = (_loc[0], _loc[1], 0.0)
other["root"].rotation_euler = (0.0, 0.0, math.radians(_rot))
bpy.context.view_layer.update()

hero_ctx = B.measure_subject(hero.get("root"))
other_ctx = B.measure_subject(other.get("root"))
print("PROBE hero_ctx:", json.dumps(hero_ctx))
print("PROBE other_ctx:", json.dumps(other_ctx))
if other_ctx is None:
    # diagnose: what does the walk see?
    root = other.get("root")
    n_mesh = 0
    names = []
    stack = [root]
    while stack:
        ob = stack.pop()
        stack.extend(ob.children)
        if ob.type == "MESH":
            n_mesh += 1
            if len(names) < 8:
                names.append(ob.name)
    print("PROBE other meshes:", n_mesh, names)
