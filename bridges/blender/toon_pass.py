# ─────────────────────────────────────────────────────────────
# AnimeOS TOON + ANATOMY PASS (iteration 108) - THE BODY READS AS
# A CHARACTER, THE FRAME READS AS ANIME
#
# The render night's scorer named the frontier in its own words:
# "a 3D rendered robotic figure". Two things said robot, and neither
# was a proportion number:
#
#   1. THE ANATOMY - the robe was assembled from parts the eye could
#      count: a sphere hip block, a capsule torso, a sphere chest,
#      knee-length plate panels and tapered tube sleeves. A hanfu is
#      ONE garment: a fitted bodice that flows into a floor-length
#      skirt, sleeves that BELL toward the wrist. reshape_anatomy
#      rebuilds those parts IN PLACE - same object names, same
#      parents, same joint anchors - so the secondary rig, the cloth
#      solver (SkirtPanel*, *Sleeve) and the flesh solver (TorsoMesh)
#      read exactly the objects they always read. Mesh only.
#
#   2. THE LOOK - a Cycles PBR grade over procedural shapes is the
#      textbook "3D render" read; the model sheets the vision model
#      compares against are FLAT COLOR WITH INK LINES. apply_look
#      converts every material to a cel tree (Toon BSDF for the lit
#      band + a tinted flat emission floor so the shadow side keeps
#      its hue instead of going to black - anime shadows are a darker
#      color, not an absence of light) and draws ink outlines with
#      Freestyle (silhouette + border + crease). The grain/chroma comp
#      layers are dropped under TOON - film grain on a cel frame is
#      noise, not texture.
#
# The look is a production choice: payload project.look = TOON | PBR,
# default TOON for DONGHUA / ANIME / KOREAN (resolve_look). PBR keeps
# every earlier law untouched (reshape_anatomy still runs - the
# garment is right under either look).
# ─────────────────────────────────────────────────────────────

import math

TOON_LAW_VERSION = 108
TOON_STYLES = ("DONGHUA", "ANIME", "KOREAN")

# cel tree tuning
TOON_SIZE = 0.62          # Toon BSDF lit-band angular size
TOON_SMOOTH = 0.04        # band edge softness (near-hard cel edge)
SHADOW_FLOOR = 0.42       # flat emission floor (fraction of the dye) - the shadow side's hue
SHADOW_COOL = (0.86, 0.9, 1.08)   # the shadow tint pulls slightly cool (the anime shadow color)
SKIN_FLOOR = 0.55         # skin keeps a higher floor - faces never go muddy
INK_HEX = "#1a1216"       # warm near-black ink
INK_PX = {"PREVIEW": 1.2, "FINAL": 2.2}
EYE_WHITE_STRENGTH = 0.85
TOON_BLOOM_THRESHOLD = 2.4
TOON_FILL_SCALE = 0.45
HEM_BAND = 0.24           # the lower fraction of a cloth piece the hem band paints
# the sheet's range must survive the framing: at wide the garment is a
# few dozen pixels and the 0.22 cap drowns - the cap rises with distance
PALETTE_WASH_BY_SHOT = {"EXTREME_CLOSEUP": 0.22, "CLOSEUP": 0.22, "MCU": 0.25, "MEDIUM": 0.32,
                        "LOW_ANGLE": 0.32, "WIDE": 0.45, "ESTABLISHING": 0.5}
CREASE_DEG = 112.0   # only real folds ink; the sculpted head's soft planes stay clean
INK_OFFSET = 0.005   # the hull outline's expansion along vertex normals (figure-local units)


def resolve_look(project):
    raw = str((project or {}).get("look") or "").upper()
    if raw in ("TOON", "PBR"):
        return raw
    return "TOON" if str((project or {}).get("visualStyle") or "").upper() in TOON_STYLES else "PBR"


# ── anatomy ───────────────────────────────────────────────────

def _lathe_mesh(bpy, name, profile, segments=32, sx=1.0, sy=1.0):
    """Revolve a (z, r) profile around Z into a closed, smooth mesh."""
    verts, faces = [], []
    n = len(profile)
    for (z, r) in profile:
        for s in range(segments):
            a = s / segments * math.tau
            verts.append((math.cos(a) * r * sx, math.sin(a) * r * sy, z))
    for i in range(n - 1):
        for s in range(segments):
            a0 = i * segments + s
            a1 = i * segments + (s + 1) % segments
            b0 = (i + 1) * segments + s
            b1 = (i + 1) * segments + (s + 1) % segments
            faces.append((a0, a1, b1, b0))
    # caps
    top = len(verts)
    verts.append((0.0, 0.0, profile[-1][0]))
    bot = len(verts)
    verts.append((0.0, 0.0, profile[0][0]))
    for s in range(segments):
        faces.append(((n - 1) * segments + s, (n - 1) * segments + (s + 1) % segments, top))
        faces.append(((s + 1) % segments, s, bot))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    return me


def _swap_mesh(bpy, ob, new_me):
    mats = list(ob.data.materials)
    old = ob.data
    for m in mats:
        new_me.materials.append(m)
    ob.data = new_me
    if old.users == 0:
        bpy.data.meshes.remove(old)


def _subsurf(ob, levels=1):
    if not any(m.type == "SUBSURF" for m in ob.modifiers):
        m = ob.modifiers.new("ToonSubsurf", "SUBSURF")
        m.levels = levels
        m.render_levels = levels


def reshape_anatomy(bpy, scn, figure, dna):
    """Rebuild the garment parts in place (names, parents and anchors
    kept). Returns the evidence. Works on any figure dict that carries
    'root' (the procedural designed figure); a loaded library asset
    carries the same names and is reshaped by the same law."""
    root = figure.get("root") if isinstance(figure, dict) else None
    if root is None:
        return {"applied": False, "note": "no figure root"}
    obs = {}
    stack = [root]
    while stack:
        o = stack.pop()
        obs[o.name] = o
        stack.extend(o.children)

    def find(base):
        if base in obs:
            return obs[base]
        for k, v in obs.items():
            if k.split(".")[0] == base:
                return v
        return None

    lean = dna.get("build") == "lean"
    sturdy = dna.get("build") == "sturdy"
    width = 0.85 if lean else (1.18 if sturdy else 1.0)
    done = []

    # 1. THE BODICE: one fitted lathe from hip to collar replaces the
    #    hip sphere + capsule torso + chest sphere (TorsoMesh keeps
    #    its name - the flesh solver's region).
    torso = find("TorsoMesh")
    if torso is not None:
        w = width
        prof = [
            (-0.10, 0.150 * w), (-0.02, 0.150 * w), (0.08, 0.122 * w), (0.16, 0.112 * w),  # hip -> waist
            (0.26, 0.128 * w), (0.36, 0.142 * w), (0.44, 0.140 * w), (0.50, 0.118 * w),    # ribs -> chest
            (0.55, 0.085 * w), (0.60, 0.050), (0.64, 0.040),                               # shoulder slope -> high collar
        ]
        me = _lathe_mesh(bpy, "BodiceMesh", prof, segments=36, sx=1.08, sy=0.74)
        _swap_mesh(bpy, torso, me)
        torso.location = (0.0, 0.0, 0.0)
        torso.rotation_euler = (0.0, 0.0, 0.0)
        torso.scale = (1.0, 1.0, 1.0)
        _subsurf(torso)
        done.append("TorsoMesh->bodice")
    for hidden in ("HipsMesh", "ChestMesh"):
        o = find(hidden)
        if o is not None:
            # hide_render only: a viewport-hidden object drops out of the
            # depsgraph and keeps a stale world matrix
            o.hide_render = True
            done.append(f"{hidden}:hidden")

    # 2. THE SKIRT: the eight panels drop to the ankle and overlap into
    #    one flowing gown (each stays its own SkirtPanel - the solver
    #    still swings them); an inner underskirt closes the gaps the
    #    legs would otherwise read through.
    panels = sorted([o for n, o in obs.items() if n.startswith("SkirtPanel")], key=lambda o: o.name)
    drop = 0.30   # half-length: the outer robe layer falls to mid-shin over the floor-length underskirt
    for i, panel in enumerate(panels):
        a = i * (math.tau / max(1, len(panels))) + 0.18
        r = 0.135 * width
        panel.scale = (0.085 * width, 0.010, drop)
        panel.rotation_euler = (math.sin(a) * 0.16, -math.cos(a) * 0.16, a)
        panel.location = (math.cos(a) * r, math.sin(a) * r * 0.82, -0.02 - drop)
    if panels:
        done.append(f"SkirtPanel x{len(panels)}:floor-length")
        pelvis = panels[0].parent
        robe_mat = panels[0].data.materials[0] if panels[0].data.materials else None
        under_prof = [(-0.94, 0.25 * width), (-0.6, 0.2 * width), (-0.25, 0.165 * width), (0.02, 0.15 * width)]
        ume = _lathe_mesh(bpy, "UnderskirtMesh", under_prof, segments=36, sx=1.0, sy=0.82)
        if robe_mat is not None:
            ume.materials.append(robe_mat)
        uob = bpy.data.objects.new("Underskirt", ume)
        scn.collection.objects.link(uob)
        uob.parent = pelvis
        _subsurf(uob)
        done.append("Underskirt")

    # 2b. THE GOWN HIDES THE LEGS: the thighs/shins (and the upper arms
    #     inside the sleeves) are robe-colored tubes that poke through
    #     the skirt on every WALK/LUNGE swing - the mannequin tell. The
    #     boots and wraps stay: the feet still step under the hem.
    if panels:
        for side in ("L", "R"):
            for part in ("Thigh", "Shin", "UpperArm"):
                o = find(side + part)
                if o is not None:
                    o.hide_render = True
                    done.append(f"{side}{part}:under the robe")

    # 3. THE SLEEVES BELL: narrow at the shoulder, wide at the wrist,
    #    hanging past the hand line (the donghua hanfu read).
    for side in ("L", "R"):
        sl = find(side + "Sleeve")
        if sl is None:
            continue
        prof = [(-0.52, 0.088), (-0.47, 0.095), (-0.32, 0.075), (-0.16, 0.058), (-0.04, 0.048), (0.03, 0.038)]
        me = _lathe_mesh(bpy, side + "SleeveBell", prof, segments=28, sx=1.0, sy=0.9)
        _swap_mesh(bpy, sl, me)
        sl.location = (0.0, 0.0, 0.0)
        sl.rotation_euler = (0.0, 0.0, 0.0)
        sl.scale = (width, width, 1.0)
        _subsurf(sl)
        done.append(side + "Sleeve:bell")
        cuff = find(side + "Cuff")
        if cuff is not None:
            cuff.hide_render = True  # the bell's own hem is the cuff now
            done.append(side + "Cuff:folded into the bell")

    # the presence law measures world bounding boxes next - the new and
    # re-parented parts must have fresh world matrices first
    try:
        bpy.context.view_layer.update()
    except Exception:  # noqa: BLE001
        pass
    # 4. THE FACE READS AS A DRAWN FACE: the anime proportion law -
    #    big eyes, thin brows, a small mouth, a barely-there nose. The
    #    v3.2 face rig keeps driving the pivots (blink, brow tilt,
    #    mouth open); only the meshes under them are re-proportioned.
    for nm, sc in (("EyeLMesh", (1.55, 1.0, 1.6)), ("EyeRMesh", (1.55, 1.0, 1.6)),
                   ("EyeLIris", (1.6, 1.0, 1.7)), ("EyeRIris", (1.6, 1.0, 1.7)),
                   ("BrowLMesh", (1.1, 1.0, 0.45)), ("BrowRMesh", (1.1, 1.0, 0.45)),
                   ("MouthMesh", (0.7, 1.0, 0.55)), ("NoseMesh", (0.55, 0.7, 0.6))):
        o = find(nm)
        if o is not None:
            o.scale = (o.scale[0] * sc[0], o.scale[1] * sc[1], o.scale[2] * sc[2])
            done.append(f"{nm}:anime-proportion")

    # 5. THE NECK IS A NECK: the bodice's high collar closes the throat,
    #    so the old accent collar capsule becomes a slim skin neck
    #    (the long gold tube read as a robot's spine)
    neck = find("NeckMesh")
    skin = None
    hm = find("HeadMesh")
    if hm is not None and hm.data.materials:
        skin = hm.data.materials[0]
    if neck is not None:
        if skin is not None:
            neck.data.materials.clear()
            neck.data.materials.append(skin)
        neck.scale = (0.85, 0.85, 0.75)
        done.append("NeckMesh:skin")

    return {"applied": bool(done), "lawVersion": TOON_LAW_VERSION, "parts": done}


# ── the look ──────────────────────────────────────────────────

def _dye_of(mat, hex_to_rgb):
    # the graded trees record their dye (animeosBaseHex - kept current by
    # the sheet-conformance regrade); the flat helpers record animeos_dye
    if str(mat.get("animeos_kind") or "") == "emissive":
        return None, "emissive"
    for key in ("animeosBaseHex", "animeos_dye"):
        d = mat.get(key)
        if isinstance(d, str) and d.startswith("#"):
            kind = str(mat.get("animeosKind") or "")
            if kind == "hair-curve":
                kind = "hair"
            return hex_to_rgb(d), kind
    if mat.use_nodes and mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                c = n.inputs["Base Color"].default_value
                return (c[0], c[1], c[2]), ""
            if n.type == "EMISSION":
                return None, "emissive"
    return (0.3, 0.3, 0.32), ""


def _palette_mid(mat):
    import json
    raw = mat.get("animeosSheetPalette")
    try:
        members = [h for h in json.loads(raw) if isinstance(h, str) and h.startswith("#")] if isinstance(raw, str) else []
    except Exception:  # noqa: BLE001
        members = []
    if len(members) < 2:
        return None

    def lum(h):
        h = h.lstrip("#")
        r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    members.sort(key=lum)
    return members[len(members) // 2]


def _cel_tree(mat, rgb, kind, hex_to_rgb=None):
    nt = mat.node_tree
    # NEVER clear the tree: other passes hold live node references
    # (the wrinkle normals' Strength is driven per frame) - a freed
    # node is a segfault. The old graph stays, unlinked from the
    # output; the cel graph takes the surface socket.
    out = None
    for n in nt.nodes:
        if n.type == "OUTPUT_MATERIAL" and n.is_active_output:
            out = n
            break
    if out is None:
        out = nt.nodes.new("ShaderNodeOutputMaterial")
    for l in list(out.inputs["Surface"].links):
        nt.links.remove(l)
    for l in list(out.inputs["Displacement"].links):
        nt.links.remove(l)
    toon = nt.nodes.new("ShaderNodeBsdfToon")
    toon.component = "DIFFUSE"
    toon.inputs["Color"].default_value = (*rgb, 1.0)
    # THE SHEET'S RANGE AT WIDE (iteration 108): under TOON the sheet's
    # second color is not noise - it is a painted HEM BAND: the lower
    # part of every cloth piece takes the palette's mid member, hard
    # edged (the cel answer), its strength named PaletteWashToon so the
    # framing retunes it (apply_palette_wash)
    color_in = None
    mid = _palette_mid(mat) if (kind == "cloth" and hex_to_rgb) else None
    if mid is not None:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["Generated"], sep.inputs[0])
        band = nt.nodes.new("ShaderNodeMath")
        band.operation = "LESS_THAN"
        band.inputs[1].default_value = HEM_BAND
        nt.links.new(sep.outputs["Z"], band.inputs[0])
        k = nt.nodes.new("ShaderNodeMath")
        k.operation = "MULTIPLY"
        k.name = "PaletteWashToon"
        k.label = "PaletteWashToon"
        k.inputs[1].default_value = 0.0
        nt.links.new(band.outputs[0], k.inputs[0])
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.inputs[6].default_value = (*rgb, 1.0)
        mx.inputs[7].default_value = (*hex_to_rgb(mid), 1.0)
        nt.links.new(k.outputs[0], mx.inputs[0])
        color_in = mx.outputs[2]
        nt.links.new(color_in, toon.inputs["Color"])
    toon.inputs["Size"].default_value = TOON_SIZE
    toon.inputs["Smooth"].default_value = TOON_SMOOTH
    em = nt.nodes.new("ShaderNodeEmission")
    floor = SKIN_FLOOR if kind == "skin" else SHADOW_FLOOR
    lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    if kind != "skin" and lum > 0.35:
        # a pale dye (white hanfu) at the full floor glows and blooms -
        # the floor eases so the cel band, not the emission, carries it
        floor *= max(0.45, 1.0 - (lum - 0.35))
    em.inputs["Color"].default_value = (rgb[0] * SHADOW_COOL[0], rgb[1] * SHADOW_COOL[1], rgb[2] * SHADOW_COOL[2], 1.0)
    em.inputs["Strength"].default_value = floor
    if color_in is not None:
        # the floor carries the band too (on a pale dye the floor IS most
        # of the visible color)
        cool = nt.nodes.new("ShaderNodeMix")
        cool.data_type = "RGBA"
        cool.blend_type = "MULTIPLY"
        cool.inputs[0].default_value = 1.0
        cool.inputs[7].default_value = (*SHADOW_COOL, 1.0)
        nt.links.new(color_in, cool.inputs[6])
        nt.links.new(cool.outputs[2], em.inputs["Color"])
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(toon.outputs[0], add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    if kind == "hair":
        # the anime hair sheen: a tight glossy toon band rides on top
        gl = nt.nodes.new("ShaderNodeBsdfToon")
        gl.component = "GLOSSY"
        gl.inputs["Color"].default_value = (min(1, rgb[0] * 1.6 + 0.025), min(1, rgb[1] * 1.6 + 0.025), min(1, rgb[2] * 1.6 + 0.035), 1.0)
        gl.inputs["Size"].default_value = 0.07
        gl.inputs["Smooth"].default_value = 0.02
        add2 = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(add.outputs[0], add2.inputs[0])
        nt.links.new(gl.outputs[0], add2.inputs[1])
        add = add2
    nt.links.new(add.outputs[0], out.inputs["Surface"])


def apply_look(bpy, scn, look, mode, hex_to_rgb, comp_profile=None):
    """Convert the scene to the production's look. TOON: every
    non-emissive material becomes a cel tree, Freestyle inks the
    silhouettes/borders/creases, and the grain/chroma comp layers are
    zeroed (mutates comp_profile when given). Returns the evidence."""
    if look != "TOON":
        return {"look": "PBR", "lawVersion": TOON_LAW_VERSION}
    converted, kept = 0, 0
    for mat in list(bpy.data.materials):
        if not mat.use_nodes or mat.node_tree is None or mat.users == 0:
            continue
        if mat.get("animeos_toon"):
            continue
        name = mat.name.lower()
        rgb, kind = _dye_of(mat, hex_to_rgb)
        if rgb is None or kind == "emissive" or name.startswith(("eyemat", "irismat", "blade", "lantern", "glow")):
            kept += 1
            continue
        if not kind:
            kind = "skin" if "skin" in name else ("hair" if "hair" in name else "cloth")
        _cel_tree(mat, rgb, kind, hex_to_rgb)
        mat["animeos_toon"] = True
        converted += 1

    # the eyes are painted, not lit: a glowing eye-white is the robot's
    # visor read - under TOON the whites sit at paper brightness
    for mat in bpy.data.materials:
        if mat.name.startswith("EyeMat") and mat.use_nodes and mat.node_tree:
            for n in mat.node_tree.nodes:
                if n.type == "EMISSION":
                    n.inputs["Strength"].default_value = min(float(n.inputs["Strength"].default_value), EYE_WHITE_STRENGTH)

    # a cel frame is flat color: at the preview's 10 samples the Toon
    # BSDF's sampling noise reads as dirt on a white robe, so the TOON
    # preview denoises too (OIDN on the CPU - cheap at 512px)
    denoised = False
    try:
        scn.cycles.use_denoising = True
        denoised = True
    except Exception:  # noqa: BLE001
        pass

    # cel shading reads the light as BANDS: the studio's 200-2000W area
    # fills (tuned for the PBR grade) push a pale robe past white into
    # the bloom - under TOON the fills ease so the band, not the
    # overexposure, carries the form
    eased = []
    for ob in scn.objects:
        if ob.type == "LIGHT" and ob.name.startswith("Fill") and not ob.get("animeos_toon_eased"):
            ob.data.energy *= TOON_FILL_SCALE
            ob["animeos_toon_eased"] = True
            eased.append(ob.name)

    # ── THE INK (the freestyle law) ──────────────────────────
    # Blender 5.2.2 aborts headless (SIGABRT, no traceback) inside the
    # Freestyle stroke path on production scenes - bisected live: ANY
    # lineset that produces strokes dies mid-render (silhouette, border
    # and contour each alone), while the same scene with zero strokes
    # renders end to end, and the same strokes render on a fresh cube.
    # The ink therefore rides INVERTED HULLS by default - the classic
    # cel outline: one shell per inked mesh, expanded along its vertex
    # normals, flat ink only where the shell is backfacing (the rim
    # that peeks around the silhouette). Pure geometry - no GL, no
    # freestyle, deterministic. ANIMEOS_INK=freestyle opts a runtime
    # whose build draws strokes safely back onto the lineset path;
    # ANIMEOS_INK=off ships the cel shade unlined.
    import os as _os
    ink_mode = _os.environ.get("ANIMEOS_INK", "hull").strip().lower()
    r = scn.render
    ink_rgb = hex_to_rgb(INK_HEX)
    shells = []
    if ink_mode != "freestyle":
        r.use_freestyle = False
    if ink_mode == "hull":
        ink_mat = bpy.data.materials.get("InkShellMat")
        if ink_mat is None:
            ink_mat = bpy.data.materials.new("InkShellMat")
            ink_mat.use_nodes = True
            nt = ink_mat.node_tree
            nt.nodes.clear()
            out = nt.nodes.new("ShaderNodeOutputMaterial")
            mix = nt.nodes.new("ShaderNodeMixShader")
            geo = nt.nodes.new("ShaderNodeNewGeometry")
            transp = nt.nodes.new("ShaderNodeBsdfTransparent")
            emis = nt.nodes.new("ShaderNodeEmission")
            emis.inputs[0].default_value = (*ink_rgb, 1.0)
            emis.inputs[1].default_value = 1.0
            nt.links.new(geo.outputs["Backfacing"], mix.inputs[0])
            nt.links.new(transp.outputs[0], mix.inputs[1])
            nt.links.new(emis.outputs[0], mix.inputs[2])
            nt.links.new(mix.outputs[0], out.inputs[0])
        no_ink = bpy.data.collections.get("AnimeOSNoInk")
        no_ink_names = set(o.name for o in no_ink.objects) if no_ink is not None else set()
        for ob in list(scn.objects):
            if ob.type != "MESH" or ob.name.startswith("InkShell_"):
                continue
            if ob.name in no_ink_names or ob.name.startswith(("Ground", "Icosphere", "PhysDebris", "PhysSway")):
                continue
            if any(m.type == "CLOTH" for m in ob.modifiers):
                continue  # a simmed part moves under the solver - the hull would lag it
            try:
                shell_me = ob.data.copy()
                for v in shell_me.vertices:
                    v.co += v.normal * INK_OFFSET
                shell = bpy.data.objects.new(f"InkShell_{ob.name}", shell_me)
                scn.collection.objects.link(shell)
                shell.matrix_world = ob.matrix_world.copy()
                shell.parent = ob
                shell.visible_shadow = False
                shell.display_type = "WIRE"
                shell_me.materials.clear()
                shell_me.materials.append(ink_mat)
                for m in ob.modifiers:
                    if m.type == "ARMATURE" and m.object is not None:
                        arm = shell.modifiers.new(m.name, "ARMATURE")
                        arm.object = m.object
                        arm.use_vertex_groups = m.use_vertex_groups
                shells.append(shell.name)
            except Exception:  # noqa: BLE001
                continue
    else:
        r.use_freestyle = ink_mode == "freestyle"
    if r.use_freestyle:
        r.line_thickness_mode = "ABSOLUTE"
        r.line_thickness = INK_PX.get(mode, 1.1)
        vl = bpy.context.view_layer
        vl.use_freestyle = True
        fs = vl.freestyle_settings
        fs.crease_angle = math.radians(CREASE_DEG)
        # the ink burns into the frame here too: the compositor path is
        # part of the same broken territory the stroke path lives in
        fs.as_render_pass = False
        ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new("AnimeOSInk")
        ls.select_by_visibility = True
        ls.select_by_edge_types = True
        ls.select_silhouette = True
        ls.select_border = True
        # no crease ink: the solved cloth's subdivided folds turn every
        # crease into a jittering speck at preview size - the silhouette
        # and the part borders carry the drawing
        ls.select_crease = False
        ls.select_contour = True
        ls.linestyle.color = ink_rgb
        ls.linestyle.thickness = 1.0
        ls.linestyle.alpha = 0.92
        # painted decals (the anime face) are already drawn - no ink on
        # their plane borders
        no_ink = bpy.data.collections.get("AnimeOSNoInk")
        if no_ink is not None:
            ls.select_by_collection = True
            ls.collection = no_ink
            ls.collection_negation = "EXCLUSIVE"
            # the exclusion set never rides the scene graph: a stale
            # link from an older build is severed here
            try:
                for parent in list(no_ink.users_collection):
                    parent.children.unlink(no_ink)
            except Exception:  # noqa: BLE001
                pass

    comp_note = None
    f = comp_profile.get("factors") if isinstance(comp_profile, dict) else None
    if isinstance(f, dict):
        before = {k: f.get(k) for k in ("grain", "chroma")}
        f["grain"] = 0.0
        f["chroma"] = min(float(f.get("chroma") or 0.0), 0.02)
        # the cel frame reads crisp: the depth mist is halved (it still
        # separates planes) instead of hazing the whole frame
        if "mist" in f:
            f["mist"] = round(float(f.get("mist") or 0.0) * 0.5, 3)
        comp_profile["bloomThreshold"] = TOON_BLOOM_THRESHOLD
        if "beams" in f:
            f["beams"] = round(float(f.get("beams") or 0.0) * 0.3, 3)
        comp_note = {"dropped": before, "bloomThreshold": TOON_BLOOM_THRESHOLD, "note": "cel frames carry no film grain; the comp hash reflects the toon-adjusted profile"}
    return {"look": "TOON", "lawVersion": TOON_LAW_VERSION, "converted": converted, "keptEmissive": kept,
            "ink": (["hull"] if ink_mode == "hull" else (["silhouette", "border", "contour"] if ink_mode == "freestyle" else ["off"])),
            "inkShells": len(shells), "inkPx": round(r.line_thickness, 2) if r.use_freestyle else None,
            "denoised": denoised, "fillsEased": eased, "comp": comp_note}


def palette_wash_for(shot_type):
    return PALETTE_WASH_BY_SHOT.get(str(shot_type or "MEDIUM").upper(), 0.32)


def apply_palette_wash(bpy, shot_type):
    """Retune every material's palette wash for the framing: the PBR
    zone (PaletteWash, the iteration-107 cap) and the TOON hem band
    (PaletteWashToon - a hard band, so its strength reads ~2x)."""
    w = palette_wash_for(shot_type)
    tuned = 0
    for mat in bpy.data.materials:
        if not mat.use_nodes or mat.node_tree is None:
            continue
        for n in mat.node_tree.nodes:
            if n.name.startswith("PaletteWashToon"):
                n.inputs[1].default_value = min(1.0, w * 2.0)
                tuned += 1
            elif n.name.startswith("PaletteWash"):
                n.inputs[1].default_value = w
                tuned += 1
    return {"shotType": str(shot_type or "MEDIUM").upper(), "wash": w, "nodes": tuned}
