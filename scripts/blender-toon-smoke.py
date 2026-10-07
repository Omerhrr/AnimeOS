#!/usr/bin/env python3
# Smoke-test iteration 108 - THE PIXEL FRONTIER (the render night's four
# named issues) inside the REAL Blender worker:
#   1. THE BODY READS AS A CHARACTER (toon_pass.reshape_anatomy): the
#      garment rebuilt in place - names/parents kept for the solvers,
#      the bodice one lathe (TorsoMesh keeps its flesh-region name), the
#      skirt floor-length over an underskirt, the sleeves BELL (wrist
#      radius > shoulder radius), the legs/upper arms hidden under the
#      robe, the hidden parts excluded from the presence measure.
#   1b. THE PIVOT LAW: build_secondary_rig re-hangs a part WITHOUT
#      moving it (the old double offset hung every sleeve/panel at 2x
#      its authored offset).
#   2. THE KEY FINDS THE FACE: aim_hero_key places the key 35 degrees
#      off the lens axis, raised, distance from the measured head, and
#      eases the energy by inverse square.
#   3. THE MOVE KNOWS THE WORLD: solve_path_sightline catches a pillar
#      on the PAN path the single base ray misses, rotates the move
#      aside and clears every sample; push_past_obstacle parks the lens
#      in front of a pillar that still owns a frame.
#   4. THE SHEET'S RANGE AT WIDE: palette_wash_for rises with distance;
#      apply_palette_wash retunes the named nodes.
#   5. THE FRAME READS AS ANIME (apply_look): every graded material
#      becomes a cel tree WITHOUT freeing a node (the wrinkle drivers'
#      live references survive - the segfault the first draft hit),
#      the ink is its own pass, grain dropped, bloom threshold raised.
#   + RENDER HALF: one PAN job through worker_run with a pillar on the
#      path: the clip renders, the evidence names look/anatomy/path.
#
# SECTION 10 (iteration 127 - THE VALUE WALL ANSWERS): the 126 night's
# rescore named the remaining frontier twice - the pale-dye VALUE wall
# ("a plain white robe instead of the detailed light green" - a
# multiplicative saturation bank cannot rescue a near-white VALUE) and
# the invisible brush ("a severe style downgrade to a low-fidelity 3D
# render" while the brush rode +/-8.4% steps). The proof: the pale-dye
# value branch (cloth dyes past PALE_L_HIGH with an authored hue
# DEEPEN toward PALE_L_TARGET and floor their saturation, hue exact,
# gray stands down, skin never deepens), the stronger statement (the
# swing is a law of the framing: base + gain x depth, 0.31/0.265/0.22
# at the three painted framings), and the dry-brush lift (the lifted
# patch pulls toward white on pale dyes instead of clamping flat).
#
# Runs under a Blender binary (BLENDER=/path/to/blender) or a Python
# with the bpy module (pip install bpy). HALF=direct|render|all.
import json, math, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
HALF = os.environ.get("HALF", "all").lower()

failures = 0
def expect(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
    if not cond:
        failures += 1


def runner():
    b = os.environ.get("BLENDER")
    if b and os.path.exists(b):
        return lambda script, *args: [b, "-b", "--factory-startup", "-P", script, "--", *args]
    return lambda script, *args: [sys.executable, script, *args]


DIRECT = r'''
import importlib.util, json, math, os, sys
import bpy, mathutils
bridge = sys.argv[-1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.path.insert(0, os.path.dirname(bridge))
import toon_pass as tp

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond: fails.append(name)

scn = bpy.context.scene
for ob in list(scn.objects): bpy.data.objects.remove(ob, do_unlink=True)
dna = {"name": "Smoke", "hairStyle": "topknot", "hairColor": "#16161d", "robeColor": "#e8e3d6",
       "robeAccent": "#3f8f78", "skinTone": "#d9b48f", "build": "lean", "weaponType": "sword", "bladeColor": "#40f2d2"}
prof = m.material_profile(dna)
pal = ["#f0ece2", "#3f8f78", "#c9a24a", "#1b1b22", "#9cc7b6"]
mats = {"robe": m.graded_mat(bpy, "cloth", "RobeMat", dna["robeColor"], prof, palette=pal),
        "accent": m.graded_mat(bpy, "cloth", "AccentMat", dna["robeAccent"], prof, palette=pal),
        "skin": m.graded_mat(bpy, "skin", "SkinMat", dna["skinTone"], prof, sdepth=m.skin_depth(dna)),
        "hair": m.graded_mat(bpy, "hair", "HairMat", dna["hairColor"], prof),
        "blade": m.emission_mat(bpy, "BladeMat", dna["bladeColor"], 6.0),
        "boots": m.graded_mat(bpy, "cloth", "BootsMat", "#241a12", prof)}
fig = m.build_designed_figure(bpy, scn, dna, mats, strand_f=0.6)
names_before = {o.name for o in scn.objects}
ev = tp.reshape_anatomy(bpy, scn, fig, dna)
ok("anatomy applied", ev.get("applied") is True, ev)
for keep in ("TorsoMesh", "LSleeve", "RSleeve", "SkirtPanel0", "SkirtPanel7", "HeadMesh"):
    ok(f"name kept: {keep}", keep in {o.name for o in scn.objects})
ok("underskirt added", "Underskirt" in {o.name for o in scn.objects})
torso = scn.objects["TorsoMesh"]
ok("bodice is one lathe (>=300 verts)", len(torso.data.vertices) >= 300, len(torso.data.vertices))
sl = scn.objects["LSleeve"]
zs = [v.co.z for v in sl.data.vertices]
def ring_r(zt):
    pts = [v.co for v in sl.data.vertices if abs(v.co.z - zt) < 1e-4]
    return max(math.hypot(p.x, p.y) for p in pts) if pts else 0
ok("sleeve bells (wrist radius > shoulder radius)", ring_r(min(zs)) > ring_r(max(zs)) * 1.8, (ring_r(min(zs)), ring_r(max(zs))))
for hid in ("HipsMesh", "ChestMesh", "LThigh", "RShin", "LUpperArm"):
    ok(f"{hid} hidden under the robe", scn.objects[hid].hide_render is True)
bpy.context.view_layer.update()
meas = m.measure_subject(fig["root"])
ok("presence measure skips hidden parts (height < 1.2)", meas is not None and meas["h"] < 1.2, meas)

# 1b. THE PIVOT LAW: re-hanging moves nothing
p0 = scn.objects["SkirtPanel3"].matrix_world.translation.copy()
s0 = scn.objects["RSleeve"].matrix_world.translation.copy()
chains = m.build_secondary_rig(bpy, scn, fig)
bpy.context.view_layer.update()
p1 = scn.objects["SkirtPanel3"].matrix_world.translation
s1 = scn.objects["RSleeve"].matrix_world.translation
ok("pivot re-hang keeps the panel in place", (p1 - p0).length < 1e-4, (p0, p1))
ok("pivot re-hang keeps the sleeve in place", (s1 - s0).length < 1e-4, (s0, s1))

# 2. the key
kd = bpy.data.lights.new("HeroKey", "AREA"); kd.energy = 140.0
key = bpy.data.objects.new("HeroKey", kd); scn.collection.objects.link(key)
head = fig["head"]; cam = (0.0, -3.0, 0.9)
m.aim_hero_key(key, cam, head, {"headH": 0.1})
h = head.matrix_world.translation
off = mathutils.Vector((key.location[0] - h.x, key.location[1] - h.y, 0.0))
lens = mathutils.Vector((cam[0] - h.x, cam[1] - h.y, 0.0))
ang = math.degrees(off.angle(lens))
ok("key sits 35 deg off the lens axis", abs(ang - m.HERO_KEY_YAW) < 0.5, ang)
ok("key rises above the head", key.location[2] > h.z)
ok("key energy eases by inverse square", key.data.energy < 140.0 and abs(key.data.energy - 140.0 * (0.9 / 1.8) ** 2) < 1e-3, key.data.energy)

# 3. the path
shot = {"shotType": "MEDIUM", "movement": "PAN", "duration": 2.0, "poseStart": "STANCE", "poseEnd": "STANCE", "cast": [dna]}
scene_p = {"cameraDistance": 1.0}
subject = dict(meas)
pos, target, _ = m.camera_pose(shot, scene_p, 0.75, subject)
# the 133 rung pulls the MEDIUM in to ~1.3m - a pillar at the old
# 45% blend now sits inside the body radius and the push law honestly
# refuses it (the obstacle hugs the subject); the stage moves the
# pillar out where the last resort has room to park the lens
mid = [pos[i] * 0.75 + target[i] * 0.25 for i in range(3)]
bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=4.0, location=(mid[0], mid[1], 1.0))
bpy.context.view_layer.update()
p_base, t_base, _ = m.camera_pose(shot, scene_p, 0.0, subject)
ok("the single base ray misses the pillar", m._sightline_clear(scn, bpy, p_base, t_base))
pev = m.solve_path_sightline(scn, bpy, shot, scene_p, None, subject)
ok("the path walk sees the pillar", pev["blockedBefore"] > 0, pev)
ok("the move rotates aside and clears", pev["cleared"] and pev["pathOffset"] != 0 and pev["blockedAfter"] == 0, pev)
subject2 = dict(meas)
pos2, tgt2, _ = m.camera_pose(shot, scene_p, 0.75, subject2)
newp, pushed = m.push_past_obstacle(scn, bpy, pos2, tgt2)
ok("push_past_obstacle moves the lens in front of the pillar", pushed and m._sightline_clear(scn, bpy, newp, tgt2), (pushed, newp))

# 4. the wash
ok("wash rises with distance", tp.palette_wash_for("CLOSEUP") < tp.palette_wash_for("MEDIUM") < tp.palette_wash_for("WIDE"))

# 5. the look (wrinkle drivers keep their nodes)
wn = fig.get("wrinkleNodes") or {}
comp = m.comp_profile({})
lev = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb, comp)
ok("materials converted to cel trees", lev["converted"] >= 5, lev)
robe = bpy.data.materials["RobeMat"]
toon_nodes = [n for n in robe.node_tree.nodes if n.type == "BSDF_TOON"]
ok("robe surface is a Toon BSDF", bool(toon_nodes))
ok("the old graded nodes survive (no freed references)", any(n.name == "PaletteWash" for n in robe.node_tree.nodes))
ok("hem band carries the sheet's mid member", any(n.name.startswith("PaletteWashToon") for n in robe.node_tree.nodes))
for k, node in wn.items():
    try:
        node.inputs["Strength"].default_value = 0.5
        ok(f"wrinkle node {k} still alive", True)
    except Exception as exc:
        ok(f"wrinkle node {k} still alive", False, exc)
vl = bpy.context.view_layer
ok("ink rides as hulls (freestyle off)", (not scn.render.use_freestyle) and lev["ink"] == ["hull"] and lev["inkShells"] >= 3, lev)
ok("a hull shell exists, inked, shadowless", any(o.name.startswith("InkShell_") for o in scn.objects)
   and any(o.visible_shadow is False for o in scn.objects if o.name.startswith("InkShell_")))
ok("grain dropped, bloom threshold raised", comp["factors"]["grain"] == 0.0 and comp.get("bloomThreshold", 1.0) > 1.0, comp)
wev = tp.apply_palette_wash(bpy, "WIDE")
ok("wash nodes retuned for WIDE", wev["nodes"] >= 2 and wev["wash"] == tp.palette_wash_for("WIDE"), wev)
ok("resolve_look: DONGHUA -> TOON, WESTERN -> PBR, explicit wins",
   tp.resolve_look({"visualStyle": "DONGHUA"}) == "TOON" and tp.resolve_look({"visualStyle": "WESTERN"}) == "PBR"
   and tp.resolve_look({"visualStyle": "DONGHUA", "look": "PBR"}) == "PBR")

# 6. THE STYLE LAW (iteration 121): the toon ramp answers the framing
ramp_c, ramp_w, ramp_e = tp.style_ramp_for("CLOSEUP"), tp.style_ramp_for("WIDE"), tp.style_ramp_for("ESTABLISHING")
ok("the tight framings keep the earned ramp", ramp_c == (tp.TOON_SIZE, 1.0, tp.TOON_SMOOTH), ramp_c)
ok("the ramp narrows and deepens and hardens toward establishing",
   ramp_e[0] < ramp_w[0] < ramp_c[0] and ramp_e[1] < ramp_w[1] < ramp_c[1] and ramp_e[2] < ramp_w[2] < ramp_c[2],
   (ramp_c, ramp_w, ramp_e))
# the line weight solves from the framing's own pixels-per-world
off_e = tp.ink_offset_for({"dist": 2.6 * 0.9, "lens": 24, "resX": 512}, "PREVIEW")
exp_e = 1.4 / (512 * 24 / (2.6 * 0.9 * 36.0))
ok("the establishing ink solves to its target px", abs(off_e - exp_e) < 0.001, (off_e, exp_e))
ok("the solved offset stays inside the bounds at both ends",
   tp.INK_OFFSET_BOUNDS[0] <= tp.ink_offset_for({"dist": 0.495, "lens": 85, "resX": 512}, "FINAL") <= tp.INK_OFFSET_BOUNDS[1]
   and tp.INK_OFFSET_BOUNDS[0] <= off_e <= tp.INK_OFFSET_BOUNDS[1], off_e)
ok("the world offset rises with distance (the on-screen ink holds its width)",
   tp.ink_offset_for({"dist": 2.34, "lens": 24, "resX": 512}, "PREVIEW") < tp.ink_offset_for({"dist": 5.0, "lens": 24, "resX": 512}, "PREVIEW"))
ok("a missing context keeps the classic offset", tp.ink_offset_for(None, "PREVIEW") == tp.INK_OFFSET)

# 7. the ramp rides the real cel tree (a probe through _cel_tree)
probe = bpy.data.materials.new("RampProbe")
probe.use_nodes = True
probe.node_tree.nodes.clear()
probe.node_tree.nodes.new("ShaderNodeOutputMaterial")
tp._cel_tree(probe, m.hex_to_rgb("#1a3a34"), "cloth", m.hex_to_rgb, ramp=tp.style_ramp_for("ESTABLISHING"))
p_toon = [n for n in probe.node_tree.nodes if n.type == "BSDF_TOON"]
ok("the probe's band rides the establishing ramp",
   p_toon and abs(p_toon[0].inputs["Size"].default_value - 0.46) < 1e-6 and abs(p_toon[0].inputs["Smooth"].default_value - 0.02) < 1e-6,
   [(n.inputs["Size"].default_value, n.inputs["Smooth"].default_value) for n in p_toon])
ok("the probe's floor deepens by the ramp's scale",
   any(abs(n.inputs["Strength"].default_value - tp.SHADOW_FLOOR * 0.8) < 1e-6
       for n in probe.node_tree.nodes if n.type == "EMISSION"),
   [n.inputs["Strength"].default_value for n in probe.node_tree.nodes if n.type == "EMISSION"])

# 8. THE FACE PAINT ANSWERS THE ESTABLISHING SCALE (iteration 121)
# A clean stage: the legacy figure shares the decal names (its own
# reshape law scales those objects), so the anime face is measured
# alone - the staging must read ITS decals only.
for ob in list(scn.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for me in [m for m in bpy.data.meshes if m.users == 0]:
    bpy.data.meshes.remove(me)
import anime_character as ac
fig_a = ac.build_anime_character(bpy, scn, dna, mats, br=m._grip_law())
fig_a["syncRig"]()
fp_tight = tp.stage_face_paint_for_framing(bpy, "CLOSEUP")
ok("the tight framing keeps the 113 face paint", fp_tight["staged"] == 0, fp_tight)
eye = bpy.data.objects.get("EyeLMesh") or bpy.data.objects.get("EyeLMesh.001")
ok("the anime face carries its decals", eye is not None, [o.name for o in scn.objects if "EyeL" in o.name][:6])
r0 = max(abs(v.co.x) for v in eye.data.vertices)
fp_wide = tp.stage_face_paint_for_framing(bpy, "ESTABLISHING")
r1 = max(abs(v.co.x) for v in eye.data.vertices)
ok("the establishing staging vertex-scales the six decal meshes x1.45",
   fp_wide["staged"] == 6 and len(fp_wide["meshes"]) == 6 and abs(r1 - r0 * 1.45) < 1e-6, (fp_wide, r0, r1))
ok("the decal object scale stays the rig's (sync_rig owns the blink)", eye.scale[0] == 1.0 and eye.scale[1] == 1.0, tuple(eye.scale))
eye_mat = bpy.data.materials.get("EyeDecal")
ok("the decal emissions push to full strength",
   eye_mat is not None and all(n.inputs["Strength"].default_value >= 1.0
                               for n in eye_mat.node_tree.nodes if n.type == "EMISSION"),
   [n.inputs["Strength"].default_value for n in (eye_mat.node_tree.nodes if eye_mat else []) if n.type == "EMISSION"])
fig_a["syncRig"]()
r2 = max(abs(v.co.x) for v in eye.data.vertices)
ok("a rig sync does not undo the mesh scale", abs(r2 - r1) < 1e-6, (r1, r2))
# 9. THE THREE RUNGS (iteration 126): the painterly style rung, the
# figure-material grade exemption, the establishing-scale rung.
ok("the painterly depth answers the framing (the wide end breathes, the canon close look stays)",
   tp.painterly_depth_for("ESTABLISHING") == 0.70 and tp.painterly_depth_for("WIDE") == 0.55
   and tp.painterly_depth_for("LOW_ANGLE") == 0.40 and tp.painterly_depth_for("MEDIUM") == 0.0
   and tp.painterly_depth_for("CLOSEUP") == 0.0,
   [tp.painterly_depth_for(k) for k in ("ESTABLISHING", "WIDE", "LOW_ANGLE", "MEDIUM", "CLOSEUP")])
# the brush rides the real cel tree
pbrush = bpy.data.materials.new("PainterlyProbe")
pbrush.use_nodes = True
pbrush.node_tree.nodes.clear()
pbrush.node_tree.nodes.new("ShaderNodeOutputMaterial")
# the 135 composition: apply_look rides weave_on = p_depth > 0 at the
# wide end - the direct probe passes the same shape explicitly
tp._cel_tree(pbrush, m.hex_to_rgb("#3f8f78"), "cloth", m.hex_to_rgb, ramp=tp.style_ramp_for("ESTABLISHING"), painterly=0.7, trim=False, weave=True)
pn_names = [n.name for n in pbrush.node_tree.nodes]
ok("the painterly probe carries the brush layer",
   "PainterlyNoise" in pn_names and "PainterlyRamp" in pn_names
   and sum(1 for n in pbrush.node_tree.nodes if n.name.startswith("PainterlyMix")) == 2, pn_names)
p_ramp = pbrush.node_tree.nodes["PainterlyRamp"]
ok("the brush field is three constant steps (the brush, not a gradient)",
   p_ramp.color_ramp.interpolation == "CONSTANT" and len(p_ramp.color_ramp.elements) == 3,
   (p_ramp.color_ramp.interpolation, len(p_ramp.color_ramp.elements)))
ok("the brush rides both bands (lit + shadow wrapped, the 128 weave composing after it)",
   sum(1 for n in pbrush.node_tree.nodes if n.type == "EMISSION"
       and any(l.from_node.name.startswith(("PainterlyMix", "EmbroideryMix")) for l in n.inputs["Color"].links)) == 2,
   [(n.name, [l.from_node.name for l in n.inputs["Color"].links]) for n in pbrush.node_tree.nodes if n.type == "EMISSION"])
_emis_srcs = [l.from_node.name for n in pbrush.node_tree.nodes if n.type == "EMISSION" for l in n.inputs["Color"].links]
_emb_nodes = {n.name: n for n in pbrush.node_tree.nodes if n.name.startswith("EmbroideryMix")}
ok("the weave composes AFTER the brush (each EmbroideryMix's live color rides from a PainterlyMix)",
   all(any(l.from_node.name.startswith("PainterlyMix") for l in _emb_nodes[k].inputs[7].links) for k in _emb_nodes)
   and all(s.startswith("EmbroideryMix") for s in _emis_srcs), (_emis_srcs, list(_emb_nodes)))
ok("the measurer never sees the brush (the hard band edges intact)",
   all(abs(n.inputs["Size"].default_value - 0.46) < 1e-6 and abs(n.inputs["Smooth"].default_value - 0.02) < 1e-6
       for n in pbrush.node_tree.nodes if n.type == "BSDF_TOON"),
   [(n.inputs["Size"].default_value, n.inputs["Smooth"].default_value) for n in pbrush.node_tree.nodes if n.type == "BSDF_TOON"])
pflat = bpy.data.materials.new("FlatProbe")
pflat.use_nodes = True
pflat.node_tree.nodes.clear()
pflat.node_tree.nodes.new("ShaderNodeOutputMaterial")
tp._cel_tree(pflat, m.hex_to_rgb("#3f8f78"), "cloth", m.hex_to_rgb, ramp=tp.style_ramp_for("CLOSEUP"))
ok("the canon cel look stays flat (no brush at depth 0)",
   not any(n.name.startswith("Painterly") for n in pflat.node_tree.nodes), [n.name for n in pflat.node_tree.nodes])
# the figure-material grade exemption: numeric law + tagged-scene proof
import colorsys as _cs
_auth = m.hex_to_rgb("#3f8f78")
_banked = tp._keep_chroma(_auth, 1.28)
_h0, _l0, _s0 = _cs.rgb_to_hls(*_auth)
_h1, _l1, _s1 = _cs.rgb_to_hls(*_banked)
ok("chroma banks, hue and value survive",
   abs(_h1 - _h0) < 1e-9 and abs(_l1 - _l0) < 1e-9 and _s1 > _s0 and abs(_s1 - min(1.0, _s0 * 1.28)) < 1e-9,
   (_s0, _s1))
ok("the bank is bounded (S never leaves 0..1)", 0.0 <= _s1 <= 1.0, _s1)
ok("keep <= 1.0 is the identity",
   tp._keep_chroma((0.2, 0.4, 0.6), 1.0) == (0.2, 0.4, 0.6) and tp._keep_chroma((0.2, 0.4, 0.6), 0.9) == (0.2, 0.4, 0.6),
   "identity")
robe127 = m.graded_mat(bpy, "cloth", "X127Robe", "#3f8f78", prof, palette=pal)
stone127 = m.graded_mat(bpy, "cloth", "X127Stone", "#6b6b60", prof)
stone127["animeos_set_surface"] = True
hair127 = m.graded_mat(bpy, "hair", "X127Hair", "#7a3b1f", prof)
pale127 = m.graded_mat(bpy, "cloth", "X127PaleRobe", "#dbe8d0", prof, palette=pal)
# apply_look's loop skips userless datablocks - the probes ride fake
# users (no mesh needed) so the wash-class law can see them
for _mt in (robe127, stone127, hair127, pale127):
    _mt.use_fake_user = True
dye127 = {}
for _mt in (robe127, stone127, hair127, pale127):
    _r, _k = tp._dye_of(_mt, m.hex_to_rgb)
    dye127[_mt.name] = _r
look127 = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
                        {"lut": "moonlight", "factors": dict(m.COMP_BASE)},
                        framing_ctx={"shotType": "ESTABLISHING", "dist": 9.0 * tp.FIGURE_H, "lens": 24.0, "resX": 1024})
ok("the look names the 128 evidence",
   look127.get("lawVersion") == 132 and (look127.get("painterlyRung") or {}).get("depth") == 0.70
   and (look127.get("painterlyRung") or {}).get("painted", 0) > 0, look127.get("painterlyRung"))
ok("the painterly rung names its swing (the 127 statement at the establishing depth)",
   abs((look127.get("painterlyRung") or {}).get("swing", 0.0) - tp.painterly_swing_for(0.70)) < 1e-6,
   (look127.get("painterlyRung") or {}).get("swing"))
ge = look127.get("gradeExemption") or {}
ok("the exemption answers the gray wash, never the chroma-rich grades",
   ge.get("lut") == "moonlight" and ge.get("boosted", 0) >= 2 and ge.get("setExcluded", 0) >= 1, ge)
ok("the pale-dye value branch names its own count (the pale robe took the branch)",
   ge.get("paleBanked", 0) >= 1, ge)

def _has_patch(mat, base, swing):
    """one PainterlyMix whose patch pair derives from `base` (the sunk
    A + the lifted B at the framing's swing) - the node-level truth of
    WHICH dye the brush is wrapping; the lift answers the 127 law
    (multiplicative on ordinary dyes, the dry-brush toward white past
    PAINTERLY_PALE_LUM - the 126 clamp was a no-op exactly there)"""
    _lum = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2]
    if _lum > tp.PAINTERLY_PALE_LUM:
        _k = swing * tp.PAINTERLY_PALE_LIFT
        want_b = tuple(min(1.0, c + (1.0 - c) * _k) for c in base[:3])
    else:
        want_b = tuple(min(1.0, c * (1.0 + swing)) for c in base[:3])
    want_a = tuple(c * (1.0 - swing) for c in base[:3])
    for n in mat.node_tree.nodes:
        if n.name.startswith("PainterlyMix"):
            a = tuple(n.inputs[6].default_value[:3])
            b = tuple(n.inputs[7].default_value[:3])
            if all(abs(a[i] - want_a[i]) < 1e-6 for i in range(3)) and all(abs(b[i] - want_b[i]) < 1e-6 for i in range(3)):
                return True
    return False

_swing = tp.painterly_swing_for(0.70)
for _name, _keep in (("X127Robe", 1.28), ("X127Hair", 1.22)):
    _auth_rgb = dye127[_name]
    _boosted = tp._keep_chroma(_auth_rgb, _keep, "cloth" if "Robe" in _name else "hair")
    ok(f"{_name} banks chroma x{_keep} under moonlight (the brush wraps the BANKED dye)",
       _has_patch(bpy.data.materials[_name], _boosted, _swing)
       and not _has_patch(bpy.data.materials[_name], _auth_rgb, _swing), (_name, _auth_rgb, _boosted))
_stone_auth = dye127["X127Stone"]
_stone_boost = tp._keep_chroma(_stone_auth, 1.28, "cloth")
ok("the tagged set keeps the full wash (the world grays, unbanked - and its brush rides the SET swing)",
   _has_patch(bpy.data.materials["X127Stone"], _stone_auth, _swing * tp.PAINTERLY_SET_GAIN)
   and not _has_patch(bpy.data.materials["X127Stone"], _stone_boost, _swing), "X127Stone")
ok("the wide rung rides the ladder (the 138 advance: ESTABLISHING + WIDE at 1024)",
   m.preview_cap_for("ESTABLISHING", "PREVIEW") == 1024 and m.preview_cap_for("WIDE", "PREVIEW") == 1024
   and m.preview_cap_for("CLOSEUP", "PREVIEW") == 640 and m.preview_cap_for(None, "PREVIEW") == 640
   and m.preview_cap_for("ESTABLISHING", "FINAL") == 1280,
   [(s, mo, m.preview_cap_for(s, mo)) for s, mo in (("ESTABLISHING", "PREVIEW"), ("WIDE", "PREVIEW"), ("ESTABLISHING", "FINAL"))])
# 10. THE VALUE WALL ANSWERS (iteration 127): the pale-dye value
# branch, the stronger statement, the dry-brush lift.
ok("the swing is a law of the framing (base + gain x depth, bounded)",
   abs(tp.painterly_swing_for(0.70) - 0.31) < 1e-9 and abs(tp.painterly_swing_for(0.55) - 0.265) < 1e-9
   and abs(tp.painterly_swing_for(0.40) - 0.22) < 1e-9 and tp.painterly_swing_for(1.5) <= 0.5,
   [tp.painterly_swing_for(d) for d in (0.70, 0.55, 0.40, 1.5)])
_pale_auth = dye127["X127PaleRobe"]
_ph, _pl, _ps = _cs.rgb_to_hls(*_pale_auth)
_pale_banked = tp._keep_chroma(_pale_auth, 1.28, "cloth")
_bh, _bl, _bs = _cs.rgb_to_hls(*_pale_banked)
_spread0 = max(_pale_auth) - min(_pale_auth)
_spread1 = max(_pale_banked) - min(_pale_banked)
_mult_bank = tp._keep_chroma(_pale_auth, 1.28, "hair")
_mult_spread = max(_mult_bank) - min(_mult_bank)
ok("the pale robe takes the VALUE branch: approached, floored, hue exact, bounded",
   tp._is_pale_cloth(_pale_auth) and _bl < _pl and abs(_bl - (_pl - (_pl - tp.PALE_L_TARGET) * tp.PALE_APPROACH)) < 1e-9
   and _bs >= max(_ps * 1.28, tp.PALE_S_FLOOR) - 1e-9 and abs(_bh - _ph) < 1e-9 and 0.0 <= _bs <= 1.0,
   ((_pl, _bl), (_ps, _bs)))
ok("the deepened dye grants real chroma headroom the multiplicative bank could not",
   _spread1 > _mult_spread and _spread1 > _spread0 * 1.6, (_spread0, _mult_spread, _spread1))
# THE STANDING PRODUCTION'S OWN WALL (the 127 probe's finding): the
# sheet-read robe #9bbcb3 is a pale gray-sage - expressible spread
# 0.175 under the gate - the dye behind "a plain white robe instead
# of the detailed light green"
_robe127 = m.hex_to_rgb("#9bbcb3")
_rh, _rl, _rs = _cs.rgb_to_hls(*_robe127)
_robe_banked = tp._pale_bank(_robe127, 1.0)
_rbh, _rbl, _rbs = _cs.rgb_to_hls(*_robe_banked)
_rspread0 = max(_robe127) - min(_robe127)
_rspread1 = max(_robe_banked) - min(_robe_banked)
ok("the sheet-read robe fires the branch from BELOW the target (the L-aware lift)",
   _rl < tp.PALE_L_TARGET and _rbl > _rl and abs(_rbl - (_rl - (_rl - tp.PALE_L_TARGET) * tp.PALE_APPROACH)) < 1e-9
   and _rbs >= tp.PALE_S_FLOOR - 1e-9 and abs(_rbh - _rh) < 1e-9, ((_rl, _rbl), (_rs, _rbs)))
ok("the banked robe's spread nearly doubles (the readable pastel)",
   _rspread1 > _rspread0 * 1.8, (_rspread0, _rspread1))
_gray = (0.5, 0.5, 0.52)
_gh0, _gl0, _gs0 = _cs.rgb_to_hls(*_gray)
_gray_b = tp._keep_chroma(_gray, 1.28, "cloth")
_gh1, _gl1, _gs1 = _cs.rgb_to_hls(*_gray_b)
ok("a true gray stands down (no invented hue, the value kept)",
   not tp._is_pale_cloth(_gray) and abs(_gl1 - _gl0) < 1e-9 and abs(_gs1 - min(1.0, _gs0 * 1.28)) < 1e-9,
   ((_gs0, _gs1), (_gl0, _gl1)))
_pskin = (0.93, 0.85, 0.78)
_pskin_b = tp._keep_chroma(_pskin, 1.10, "skin")
_sl0 = _cs.rgb_to_hls(*_pskin)[1]
_sl1 = _cs.rgb_to_hls(*_pskin_b)[1]
ok("pale skin never deepens (the face's paleness IS the character)",
   abs(_sl1 - _sl0) < 1e-9, (_sl0, _sl1))
ok("a dark dye stands down (darks read dark honestly - the L gate)",
   not tp._is_pale_cloth(m.hex_to_rgb("#241a12")) and not tp._is_pale_cloth(m.hex_to_rgb("#3f8f7a")),
   "dark + saturated-mid stand down")
ok("the pale robe's brush wraps the DEEPENED dye and rides the dry-brush lift",
   _has_patch(bpy.data.materials["X127PaleRobe"], _pale_banked, _swing)
   and not _has_patch(bpy.data.materials["X127PaleRobe"], _pale_auth, _swing), "X127PaleRobe")
_pmixes = [n for n in bpy.data.materials["X127PaleRobe"].node_tree.nodes if n.name.startswith("PainterlyMix")]
_lum_b = 0.2126 * _pale_banked[0] + 0.7152 * _pale_banked[1] + 0.0722 * _pale_banked[2]
_kk = _swing * tp.PAINTERLY_PALE_LIFT
_want_lift = tuple(min(1.0, c + (1.0 - c) * _kk) for c in _pale_banked[:3])
_want_mult = tuple(min(1.0, c * (1.0 + _swing)) for c in _pale_banked[:3])
ok("the lifted patch is the dry-brush (toward white), not the clamped multiplicative",
   _lum_b > tp.PAINTERLY_PALE_LUM
   and all(any(abs(n.inputs[7].default_value[i] - _want_lift[i]) < 1e-6 for n in _pmixes) for i in range(3))
   and not all(any(abs(n.inputs[7].default_value[i] - _want_mult[i]) < 1e-6 for n in _pmixes) for i in range(3)),
   (_want_lift, _want_mult))
# THE WIDE-END VALUE BRANCH (the 127 scope): under a NON-wash grade at
# a WIDE framing the pale dye still banks - the named cell rode NEUTRAL
wide127 = m.graded_mat(bpy, "cloth", "X127WideRobe", "#9bbcb3", prof, palette=pal)
wide127.use_fake_user = True
look_wide = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
                          {"lut": "tribulation", "factors": dict(m.COMP_BASE)},
                          framing_ctx={"shotType": "WIDE", "dist": 6.0 * tp.FIGURE_H, "lens": 35.0, "resX": 640})
pw = look_wide.get("painterlyRung") or {}
ok("the wide-end branch banks the pale robe under a NON-wash grade (the evidence rides the rung)",
   look_wide.get("gradeExemption") is None and (pw.get("paleBanked") or 0) >= 1
   and abs(pw.get("swing", 0) - tp.painterly_swing_for(0.55)) < 1e-6, (pw, look_wide.get("gradeExemption")))
ok("the wide-banked robe's brush wraps the BANKED (lifted) dye",
   _has_patch(bpy.data.materials["X127WideRobe"], tp._pale_bank(m.hex_to_rgb("#9bbcb3"), 1.0), tp.painterly_swing_for(0.55)),
   "X127WideRobe")

# ── SECTION 11 (iteration 128 - THE DESIGN DYE IS THE ANCHOR + THE
#    EMBROIDERY RUNG): the conformance's own dye answer and the trim's
#    weave at the node level. The X128 mats ride the ANCHORED robe dye
#    (#4a8177 - where the design anchor lands the sheet-read #9bbcb3):
#    the robe weaves inside its hem band, the accent trim weaves its
#    whole surface, the skin and the set never weave, the measurer
#    chain never sees the weave, and the MEDIUM canon stays unpainted.
def _emb_mixes(mat):
    return [n for n in mat.node_tree.nodes if n.name.startswith("EmbroideryMix")]

def _factor_chain_has(mat, pred):
    """walk UP the EmbroideryMix factor chain - the wave's mask is the
    node-level truth of WHERE the weave lives"""
    for n in mat.node_tree.nodes:
        if n.name.startswith("EmbroideryMix"):
            seen, stack = 0, [l.from_node for l in n.inputs[0].links]
            while stack and seen < 64:
                cur = stack.pop(); seen += 1
                if pred(cur):
                    return True
                for inp in cur.inputs:
                    stack.extend(l.from_node for l in inp.links)
    return False

def _thread_ok(mat, base):
    want = tp.embroidery_thread_for(base)
    mixes = _emb_mixes(mat)
    return bool(mixes) and all(any(abs(n.inputs[6].default_value[i] - want[i]) < 1e-6 for n in mixes) for i in range(3))

def _weave_rides_emissions_only(mat):
    mixes = _emb_mixes(mat)
    if not mixes:
        return False
    for n in mixes:
        for l in n.outputs[2].links:
            if l.to_node.type != "EMISSION":
                return False
    return True

_hem_pred = lambda nd: nd.type == "MATH" and nd.operation == "LESS_THAN" and abs(nd.inputs[1].default_value - tp.HEM_BAND) < 1e-6  # the sockets are float32 - the house 1e-6
_str_pred = lambda nd: nd.name.startswith("EmbroideryStrength")

rob128 = m.graded_mat(bpy, "cloth", "X128Robe", "#4a8177", prof, palette=pal)
acc128 = m.graded_mat(bpy, "cloth", "X128AccentMat", "#3f8f7a", prof)
skn128 = m.graded_mat(bpy, "skin", "X128Skin", "#d9b48f", prof)
set128 = m.graded_mat(bpy, "cloth", "X128SetCloth", "#5a6b70", prof)
set128["animeos_set_surface"] = True
for _mt in (rob128, acc128, skn128, set128):
    _mt.use_fake_user = True
look128 = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
                        {"lut": "tribulation", "factors": dict(m.COMP_BASE)},
                        framing_ctx={"shotType": "WIDE", "dist": 6.0 * tp.FIGURE_H, "lens": 35.0, "resX": 640})
er128 = look128.get("embroideryRung") or {}
ok("the look names the 128 evidence (the rung rides at WIDE with both addresses and its dials - the 136 boldness rung's own dials at the wide end)",
   look128.get("lawVersion") == 132 and er128.get("trims", 0) >= 1 and er128.get("hems", 0) >= 1
   and er128.get("bold") is True and er128.get("strength") == tp.TRIM_WEAVE_BOLD_STRENGTH
   and er128.get("threadLift") == tp.EMBROIDERY_THREAD_LIFT
   and er128.get("stitch") == tp.TRIM_WEAVE_BOLD_STITCH
   and er128.get("boldness") == "the trim's own boldness rung (136)", er128)
_auth_rob = tp._dye_of(rob128, m.hex_to_rgb)[0]
_auth_acc = tp._dye_of(acc128, m.hex_to_rgb)[0]
ok("the anchored robe's weave lives inside the hem band only (a LESS_THAN hem mask gates the wave factor)",
   _emb_mixes(rob128) and _factor_chain_has(rob128, _hem_pred), "X128Robe")
ok("the trim weaves its WHOLE surface (the factor rides the strength node directly, no hem gate)",
   _emb_mixes(acc128) and _factor_chain_has(acc128, _str_pred) and not _factor_chain_has(acc128, _hem_pred), "X128AccentMat")
ok("the weave's thread answers the band's own dye (the lit band's thread = the dye lifted; the shadow band's = the cooled dye lifted)",
   _thread_ok(rob128, _auth_rob) and _thread_ok(acc128, _auth_acc), (tuple(round(v, 4) for v in tp.embroidery_thread_for(_auth_rob)), tuple(round(v, 4) for v in tp.embroidery_thread_for(_auth_acc))))
ok("the skin never weaves (the face's paleness IS the character)",
   not _emb_mixes(skn128), "X128Skin")
ok("the set's own cloth never weaves (the world is not embroidered)",
   not _emb_mixes(set128), "X128SetCloth")
ok("the weave rides INSIDE the band emissions only (the 121 hard band edges stand - the measurer chain blind)",
   _weave_rides_emissions_only(rob128) and _weave_rides_emissions_only(acc128), "the 121 law intact")
ok("the anchored robe's brush still wraps the anchored dye (the brush and the weave compose)",
   _has_patch(rob128, _auth_rob, tp.painterly_swing_for(0.55)), "X128Robe")
med128 = m.graded_mat(bpy, "cloth", "X128MedRobe", "#4a8177", prof, palette=pal)
med128.use_fake_user = True
look_med = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
                         {"lut": "tribulation", "factors": dict(m.COMP_BASE)},
                         framing_ctx={"shotType": "MEDIUM", "dist": 3.0 * tp.FIGURE_H, "lens": 35.0, "resX": 640})
ok("the MEDIUM canon keeps its brush refusal and the trim weave rides its OWN rung (the 135 scope: no brush, the hem weave present, depth 0)",
   look_med.get("painterlyRung") is None and (look_med.get("embroideryRung") or {}).get("scope") == "the trim weave's own rung (135)"
   and (look_med.get("embroideryRung") or {}).get("depth") == 0.0 and _emb_mixes(med128),
   (look_med.get("embroideryRung"), look_med.get("painterlyRung")))
ok("the MEDIUM's trim keeps the STANDING stitch (the 136 boldness keys the wide end only - the 135 receipt byte-kept)",
   (look_med.get("embroideryRung") or {}).get("stitch") == tp.EMBROIDERY_STITCH
   and (look_med.get("embroideryRung") or {}).get("strength") == tp.EMBROIDERY_STRENGTH
   and (look_med.get("embroideryRung") or {}).get("bold") is False
   and (look_med.get("embroideryRung") or {}).get("boldness") is None, look_med.get("embroideryRung"))

# ── iteration 131→132: THE DARK MASS READS, NOW A FRAMING RUNG ──
# The 131 lift rode every framing; the cross-night receipt (129's true
# dark read hair 90 at the closeup, 131's universal lift read it 20)
# moved the lift to the WIDE end - the canon framings read the true
# dark. The lifted canon lives at WIDE; the CLOSEUP asserts the
# stood-down read (the dye's own bands, the rung named).
hair131 = m.graded_mat(bpy, "hair", "X132HairWide", "#1a1a1a", prof)
hair131.use_fake_user = True
look131 = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
                        {"lut": "tribulation", "factors": dict(m.COMP_BASE)},
                        framing_ctx={"shotType": "WIDE", "dist": 6.0 * tp.FIGURE_H, "lens": 35.0, "resX": 640})
_mass = tp.hair_mass_dye(m.hex_to_rgb("#1a1a1a"))
def _em_color(mat, idx):
    for n in mat.node_tree.nodes:
        if n.type == "EMISSION":
            c = n.inputs["Color"].default_value
            if idx == 0:
                return (round(c[0], 4), round(c[1], 4), round(c[2], 4))
            idx -= 1
    return None
ok("the near-black hair's bands derive from the MASS dye at the WIDE (the lit band reads the lifted dark, hue preserved)",
   look131.get("hairMass") is not None and _mass is not None
   and _em_color(hair131, 1) == (round(_mass[0], 4), round(_mass[1], 4), round(_mass[2], 4)),
   (look131.get("hairMass"), _em_color(hair131, 1), _mass))
ok("the wide evidence names the wide-end rung",
   isinstance((look131.get("hairMass") or {}).get("lifted"), int)
   and (look131.get("hairMass") or {}).get("lifted", 0) >= 1
   and "wide-end" in str((look131.get("hairMass") or {}).get("rung")), look131.get("hairMass"))
hair132cu = m.graded_mat(bpy, "hair", "X132HairClose", "#1a1a1a", prof)
hair132cu.use_fake_user = True
look132cu = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
                          {"lut": "tribulation", "factors": dict(m.COMP_BASE)},
                          framing_ctx={"shotType": "CLOSEUP", "dist": 0.7 * tp.FIGURE_H, "lens": 85.0, "resX": 640})
ok("the CLOSEUP's near-black reads the TRUE DARK (the lift stood down - the 129 receipt's canon framings)",
   _em_color(hair132cu, 1) == (round(m.hex_to_rgb("#1a1a1a")[0], 4), round(m.hex_to_rgb("#1a1a1a")[1], 4), round(m.hex_to_rgb("#1a1a1a")[2], 4)),
   _em_color(hair132cu, 1))
ok("the closeup evidence names the stood-down rung",
   (look132cu.get("hairMass") or {}).get("lifted") == 0
   and (look132cu.get("hairMass") or {}).get("stoodDown", 0) >= 1
   and "true dark" in str((look132cu.get("hairMass") or {}).get("rung")), look132cu.get("hairMass"))
_glint = tp.hair_glint_from_mass(_mass)
ok("the mass-derived glint's additive floor is NEUTRAL (the 115 floor's blue lean dies on the dark masses)",
   abs(_glint[0] - _glint[1]) < 1e-9 and _glint[2] > _glint[0] - 1e-9 and abs(_glint[0] - _glint[2]) < 0.005,
   (tuple(round(v, 4) for v in _glint),))
_mid_hair = m.graded_mat(bpy, "hair", "X131MidHair", "#6a4a32", prof)
_mid_hair.use_fake_user = True
tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
              {"lut": "tribulation", "factors": dict(m.COMP_BASE)},
              framing_ctx={"shotType": "CLOSEUP", "dist": 0.7 * tp.FIGURE_H, "lens": 85.0, "resX": 640})
ok("a mid-tone hair dye keeps the earned read (no mass lift past the dark wall)",
   _em_color(_mid_hair, 1) == (round(m.hex_to_rgb("#6a4a32")[0], 4), round(m.hex_to_rgb("#6a4a32")[1], 4), round(m.hex_to_rgb("#6a4a32")[2], 4)),
   _em_color(_mid_hair, 1))
set131 = m.graded_mat(bpy, "cloth", "X131SetCloth", "#3a4a52", prof)
set131["animeos_set_surface"] = True
set131.use_fake_user = True
look131w = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
                         {"lut": "tribulation", "factors": dict(m.COMP_BASE)},
                         framing_ctx={"shotType": "WIDE", "dist": 6.0 * tp.FIGURE_H, "lens": 35.0, "resX": 640})
def _noise_src(mat):
    for n in mat.node_tree.nodes:
        if n.name == "PainterlyNoise":
            for l in n.inputs["Vector"].links:
                return l.from_node.type, round(float(n.inputs["Scale"].default_value), 3)
    return None
ok("THE SET'S OWN BRUSH reads world coordinates at the set scale (the naked flats breathe)",
   _noise_src(set131) == ("NEW_GEOMETRY", tp.PAINTERLY_SET_SCALE)
   and (look131w.get("painterlyRung") or {}).get("setBrush") is True
   and abs((look131w.get("painterlyRung") or {}).get("setSwing", 0) - round(tp.painterly_swing_for(0.55) * tp.PAINTERLY_SET_GAIN, 3)) < 1e-6,
   (_noise_src(set131), look131w.get("painterlyRung")))
ok("the figure's brush keeps the 126 Generated coords (the patches RIDE the fabric)",
   _noise_src(acc128) == ("TEX_COORD", tp.PAINTERLY_NOISE_SCALE), (_noise_src(acc128),))
# THE STRAND FALLS (the anime builder's hanging strands bow)
import anime_character as _ac
_p1 = _ac.strand_fall([(0.0, 0.0, 0.3), (0.0, 0.0, 0.1), (0.0, 0.0, -0.1)], 0)
_p1b = _ac.strand_fall([(0.0, 0.0, 0.3), (0.0, 0.0, 0.1), (0.0, 0.0, -0.1)], 0)
_p2 = _ac.strand_fall([(0.0, 0.0, 0.3), (0.0, 0.0, 0.1), (0.0, 0.0, -0.1)], 1)
ok("the strand fall is deterministic per index and distinct across strands",
   _p1 == _p1b and _p1 != _p2 and abs(_p1[1][0]) <= _ac.STRAND_SWAY_AMP + 1e-9
   and _p1[0][0] == 0.0 and _p1[-1][0] == 0.0, (_p1[1], _p2[1]))
print("DIRECT_FAILS " + json.dumps(fails))
'''


RENDER_JOB = {
    "shot": {"number": 4, "description": "The camera pans across the terrace pillars to find Smoke",
             "shotType": "MEDIUM", "lens": "35mm", "movement": "PAN", "poseStart": "WALK", "poseEnd": "STANCE",
             "lighting": "lantern light", "duration": 0.5,
             "cast": [{"name": "Smoke", "hairStyle": "topknot", "hairColor": "#16161d", "robeColor": "#e8e3d6",
                       "robeAccent": "#3f8f78", "skinTone": "#d9b48f", "weaponType": "sword", "bladeColor": "#40f2d2"}]},
    "scene": {"number": 1, "title": "Smoke", "fogDensity": 0.45, "lightningIntensity": 0.3, "energyIntensity": 0.6,
              "cameraDistance": 1.0, "rimLightIntensity": 0.5},
    "project": {"title": "Smoke", "visualStyle": "DONGHUA", "resolution": "640x360", "fps": 8},
    "mode": "PREVIEW",
}

RENDER = r'''
import importlib.util, json, sys
import bpy
bridge, job = sys.argv[-2], sys.argv[-1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
orig = m.solve_path_sightline
def with_pillar(scn, bpy_, shot, scene_p, grammar, subject, *a, **k):
    pos, target, _ = m.camera_pose(shot, scene_p, 0.75, subject)
    mid = [pos[i] * 0.55 + target[i] * 0.45 for i in range(3)]
    bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=4.0, location=(mid[0], mid[1], 1.0))
    bpy.context.view_layer.update()
    return orig(scn, bpy_, shot, scene_p, grammar, subject, *a, **k)
m.solve_path_sightline = with_pillar
m.worker_run(job)
'''


def run_direct():
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(DIRECT)
    r = subprocess.run(runner()(fh.name, BRIDGE), capture_output=True, text=True, timeout=900)
    for line in r.stdout.splitlines():
        if line.startswith(("PASS", "FAIL")):
            print("  " + line)
    if "DIRECT_FAILS" not in r.stdout:
        expect("direct half ran", False, (r.stderr or r.stdout)[-800:])
        return
    inner = json.loads(r.stdout.split("DIRECT_FAILS ", 1)[1].splitlines()[0])
    expect("direct half", not inner, inner)


def run_render():
    out = tempfile.mkdtemp(prefix="toon-smoke-")
    job = os.path.join(out, "job.json")
    with open(job, "w") as fh:
        json.dump({"jobId": "toon-smoke", "payload": RENDER_JOB, "outDir": out}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
    subprocess.run(runner()(fh.name, BRIDGE, job), capture_output=True, text=True, timeout=1500)
    st = json.load(open(job))
    expect("clip rendered", bool(st.get("mp4Path")) and os.path.exists(st.get("mp4Path") or ""), st.get("error"))
    look = (st.get("render") or {}).get("look") or {}
    expect("evidence names the TOON look", look.get("look") == "TOON", look)
    # iteration 109: under TOON the anime builder designs the garment
    # itself (the 108 reshape runs only on the legacy figure)
    expect("evidence names the garment law", (st.get("anatomy") or {}).get("applied") is True
           or str(st.get("figureSource") or "").startswith("anime"), (st.get("figureSource"), st.get("anatomy")))
    path = (((st.get("render") or {}).get("presence") or {}).get("sightline") or {}).get("path") or {}
    expect("path walk caught and cleared the pillar", path.get("blockedBefore", 0) > 0 and path.get("cleared"), path)
    expect("hero key tracks the face", (st.get("heroKey") or {}).get("tracks") == "face", st.get("heroKey"))
    expect("shadowless face fill rides the key", ((st.get("heroKey") or {}).get("fill") or {}).get("shadowless") is True, (st.get("heroKey") or {}).get("fill"))
    expect("palette wash tuned for the framing", ((st.get("render") or {}).get("paletteWash") or {}).get("shotType") == "MEDIUM")
    # THE STYLE LAW (iteration 121): the ramp answers the framing and
    # the hull ink solves from the shot's own pixels-per-world
    look121 = st.get("render") or {}
    ramp = (look121.get("look") or {}).get("styleRamp") or {}
    expect("the MEDIUM ramp rides the worker", ramp.get("shotType") == "MEDIUM" and abs(ramp.get("size", 0) - 0.58) < 1e-6
           and abs(ramp.get("floorScale", 0) - 0.95) < 1e-6 and abs(ramp.get("smooth", 0) - 0.035) < 1e-6, ramp)
    ink_off = (look121.get("look") or {}).get("inkOffset")
    expect("the hull ink solves from the framing (in bounds)",
           isinstance(ink_off, (int, float)) and 0.0012 <= ink_off <= 0.024, ink_off)
    expect("the ink target names its px", (look121.get("look") or {}).get("inkTargetPx") == 1.4, (look121.get("look") or {}).get("inkTargetPx"))
    fp = look121.get("facePaint") or {}
    # iteration 132: the MEDIUM FACE RUNG'S NEXT STEP - the moderate
    # stage (the 131 mild stage's own cell fell); six decal meshes at
    # 1.30/1.15/1.06/1.02 with the emission pushed FULL, while the
    # tight framings still refuse.
    expect("the face paint staging rides (the 132 MEDIUM rung: six meshes at the moderate stage)",
           fp.get("shotType") == "MEDIUM" and fp.get("staged") == 6
           and abs((fp.get("scale") or {}).get("eye", 0) - 1.30) < 1e-6
           and abs(fp.get("strengthPushed", 0) - 4) <= 6
           and "the face paint reads" in str(fp.get("note")), fp)
    # iteration 132: THE MASS AS A FRAMING RUNG - the MEDIUM job's
    # evidence names the STOOD-DOWN read (the true dark at the canon
    # framings; the lift lives at the wide end now).
    hm = (look121.get("look") or {}).get("hairMass")
    expect("the 131 mass stands down at the MEDIUM canon (the true dark reads - the 129 receipt)",
           isinstance(hm, dict) and hm.get("lifted") == 0
           and hm.get("stoodDown", 0) >= 1
           and "true dark" in str(hm.get("rung")),
           hm)


if HALF in ("all", "direct"):
    run_direct()
if HALF in ("all", "render"):
    run_render()
print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - toon smoke (iteration 127)")
sys.exit(0 if failures == 0 else 1)
