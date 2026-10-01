# ─────────────────────────────────────────────────────────────
# AnimeOS ANIME CHARACTER GENERATOR (iteration 109) - THE STUDIO
# DESIGNS CHARACTERS, NOT MANNEQUINS
#
# 107 iterations of laws over a figure ASSEMBLED from primitives
# (spheres, capsules, beveled boxes) ended where the scorer said they
# would: "a 3D rendered robotic figure". This module builds a
# character the way a character artist does in Blender - the same
# techniques, scripted:
#
#   HEAD   one quad mesh with an anime skull (a large cranium, a soft
#          tapering jaw to a small chin, a flattened face plane), with
#          SPHERE-TRANSFERRED NORMALS so the toon terminator falls in a
#          clean anime curve instead of following every bump
#   FACE   PAINTED, like anime: the eyes, brows, mouth and nose are
#          texture decals drawn procedurally (iris gradient, pupil,
#          two highlights, a thick upper lash line) and conformed onto
#          the face surface - the face rig keeps driving them (blink
#          squashes the eye decal, the brow pivots tilt, the mouth
#          decal opens)
#   BODY   ONE continuous skinned mesh grown from a skeleton graph
#          (Blender's Skin modifier + subdivision, baked) - no joint
#          balls, no segment seams - hands with five fingers
#   RIG    a real Armature + vertex weights; the bones FOLLOW the v3.x
#          joint empties every frame (sync_rig), so apply_pose, the
#          choreography keys, the leg IK, the smear, the reaction and
#          the secondary rig all drive the new body unchanged
#   HAIR   anime CLUMPS - lofted lens-section strands with taper and
#          curl, per style (topknot, ponytail, braid, long, short),
#          bangs + side locks + back mass; long back clumps are named
#          HairTail* so the secondary rig swings them
#   GARMENT hanfu / tunic / fitted: lofted robe body with a flared
#          skirt, belled sleeves that hang past the wrist, the crossed
#          jiaoling collar, the sash band and its tails - all skinned
#          to the same rig
#
# Everything is driven by a DESIGN SPEC (resolve_spec): the character
# DNA's fields plus an optional `designSpec` the design crew writes
# from the sheet (gender, proportions, face, eyes, hair, outfit). Pure
# Blender, no external tools. Deterministic: the same spec builds the
# same character.
# ─────────────────────────────────────────────────────────────

import math

ANIME_LAW_VERSION = 109
EYE_OPEN_FLOOR = 0.45   # a painted eye never squashes below this (a blink still reads)

# ── the design spec ──────────────────────────────────────────

SPEC_DEFAULTS = {
    "body": {"gender": "female", "build": "lean", "shoulders": 1.0, "hips": 1.0, "bust": 0.5, "headScale": 1.0},
    "face": {"shape": "oval", "jawTaper": 0.72, "chinFwd": 0.02, "cheek": 1.0},
    "eyes": {"size": 1.0, "tilt": 0.0, "color": "#5a6a62", "shape": "almond", "lashes": 1.0},
    "brows": {"thickness": 1.0, "arch": 0.5},
    "mouth": {"width": 1.0, "color": "#a0524e"},
    "hair": {"style": "long", "length": 0.8, "bangs": "parted", "volume": 1.0, "color": "#1b1b22", "accessory": "none"},
    "outfit": {"type": "hanfu", "length": 1.0, "sleeves": "bell", "collar": "crossed", "sash": True},
}

_STYLES = ("topknot", "ponytail", "braid", "long", "short")
_OUTFITS = ("hanfu", "tunic", "fitted")


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _num(src, key, default, lo, hi):
    v = src.get(key) if isinstance(src, dict) else None
    if isinstance(v, (int, float)) and math.isfinite(float(v)):
        return _clamp(float(v), lo, hi)
    return default


def _enum(v, vocab, default):
    v = str(v or "").lower()
    return v if v in vocab else default


def _hex(src, key, default):
    v = src.get(key) if isinstance(src, dict) else None
    if isinstance(v, str) and len(v) == 7 and v.startswith("#"):
        return v
    return default


def resolve_spec(dna):
    """DNA (+ optional dna['designSpec']) -> the full, clamped spec. A
    missing field takes the default; the DNA's own fields (hairStyle,
    hairColor, build) win over defaults; the designSpec wins over both."""
    d = dna or {}
    ds = d.get("designSpec") if isinstance(d.get("designSpec"), dict) else {}
    b0, f0, e0 = ds.get("body") or {}, ds.get("face") or {}, ds.get("eyes") or {}
    br0, m0, h0, o0 = ds.get("brows") or {}, ds.get("mouth") or {}, ds.get("hair") or {}, ds.get("outfit") or {}
    D = SPEC_DEFAULTS
    gender = str(b0.get("gender") or D["body"]["gender"]).lower()
    gender = gender if gender in ("female", "male") else "female"
    build = str(b0.get("build") or d.get("build") or "lean").lower()
    build = build if build in ("lean", "sturdy", "heavy") else "lean"
    style = str(h0.get("style") or d.get("hairStyle") or D["hair"]["style"]).lower()
    style = style if style in _STYLES else "long"
    outfit = str(o0.get("type") or D["outfit"]["type"]).lower()
    outfit = outfit if outfit in _OUTFITS else "hanfu"
    fp = d.get("faceProfile") if isinstance(d.get("faceProfile"), dict) else {}
    face_shape = str(f0.get("shape") or fp.get("faceShape") or "oval")
    face_shape = face_shape if face_shape in ("oval", "round", "angular") else "oval"
    jaw_default = {"oval": 0.72, "round": 0.84, "angular": 0.62}[face_shape]
    return {
        "lawVersion": ANIME_LAW_VERSION,
        "body": {
            "gender": gender, "build": build,
            "shoulders": _num(b0, "shoulders", 1.12 if gender == "male" else 1.0, 0.8, 1.35),
            "hips": _num(b0, "hips", 0.92 if gender == "male" else 1.06, 0.8, 1.3),
            "bust": _num(b0, "bust", 0.0 if gender == "male" else 0.5, 0.0, 1.0),
            "headScale": _num(b0, "headScale", 1.0, 0.85, 1.2),
        },
        "face": {
            "shape": face_shape,
            "jawTaper": _num(f0, "jawTaper", jaw_default, 0.5, 0.95),
            "chinFwd": _num(f0, "chinFwd", 0.02, 0.0, 0.05),
            "cheek": _num(f0, "cheek", 1.0, 0.8, 1.25),
        },
        "eyes": {
            "size": _num(e0, "size", 0.92 if gender == "male" else 1.0, 0.7, 1.4),
            "tilt": _num(e0, "tilt", 0.0, -1.0, 1.0),
            "color": _hex(e0, "color", D["eyes"]["color"]),
            "shape": _enum(e0.get("shape"), ("almond", "sharp"), "sharp" if gender == "male" else "almond"),
            "lashes": _num(e0, "lashes", 0.75 if gender == "male" else 1.0, 0.3, 1.5),
        },
        "brows": {"thickness": _num(br0, "thickness", 1.25 if gender == "male" else 1.0, 0.5, 2.0),
                  "arch": _num(br0, "arch", 0.5, 0.0, 1.0)},
        "mouth": {"width": _num(m0, "width", 1.0, 0.6, 1.4), "color": _hex(m0, "color", D["mouth"]["color"])},
        "hair": {
            "style": style,
            "length": _num(h0, "length", {"short": 0.25, "topknot": 0.55, "ponytail": 0.8, "braid": 0.85, "long": 0.85}[style], 0.15, 1.0),
            "bangs": _enum(h0.get("bangs"), ("parted", "full", "none"), D["hair"]["bangs"]),
            "volume": _num(h0, "volume", 1.0, 0.7, 1.4),
            "color": _hex(h0, "color", d.get("hairColor") or D["hair"]["color"]),
            "accessory": _enum(h0.get("accessory"), ("none", "pin"), "pin" if style == "topknot" else "none"),
        },
        "outfit": {
            "type": outfit,
            "length": _num(o0, "length", 1.0 if outfit == "hanfu" else 0.55, 0.3, 1.0),
            "sleeves": _enum(o0.get("sleeves"), ("bell", "fitted"), "bell" if outfit == "hanfu" else "fitted"),
            "collar": _enum(o0.get("collar"), ("crossed", "high"), "crossed" if outfit != "fitted" else "high"),
            "sash": bool(o0.get("sash", outfit != "fitted")),
        },
    }


# ── small vector helpers (pure python; no mathutils needed) ──

def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _len(a):
    return math.sqrt(_dot(a, a))


def _norm(a):
    n = _len(a)
    return (a[0] / n, a[1] / n, a[2] / n) if n > 1e-9 else (0.0, 0.0, 1.0)


def _catmull(pts, samples):
    """Catmull-Rom through the control points -> `samples` points."""
    if len(pts) < 2:
        return list(pts)
    ext = [_sub(_mul(pts[0], 2), pts[1])] + list(pts) + [_sub(_mul(pts[-1], 2), pts[-2])]
    out = []
    segs = len(pts) - 1
    for i in range(samples):
        u = i / (samples - 1) * segs
        k = min(int(u), segs - 1)
        t = u - k
        p0, p1, p2, p3 = ext[k], ext[k + 1], ext[k + 2], ext[k + 3]
        t2, t3 = t * t, t * t * t
        out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(3)))
    return out


def _seg_dist(p, a, b):
    ab = _sub(b, a)
    L2 = _dot(ab, ab)
    t = 0.0 if L2 < 1e-12 else _clamp(_dot(_sub(p, a), ab) / L2, 0.0, 1.0)
    return _len(_sub(p, _add(a, _mul(ab, t)))), t


# ── mesh helpers ─────────────────────────────────────────────

def _mesh_obj(bpy, scn, name, verts, faces, mat=None, smooth=True, parent=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    if mat is not None:
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    scn.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def _subsurf(ob, levels=1):
    m = ob.modifiers.new("AnimeSubsurf", "SUBSURF")
    m.levels = levels
    m.render_levels = levels
    return m


def _loft(points, frames_up, widths, thicks, ring=10, close_tip=True, close_root=True, twist=None):
    """Loft an elliptical/lens section along a polyline. widths/thicks
    per point; frames_up gives the 'thickness' direction hint per point.
    Returns (verts, faces)."""
    verts, faces = [], []
    n = len(points)
    for i, p in enumerate(points):
        if i == 0:
            tan = _norm(_sub(points[1], points[0]))
        elif i == n - 1:
            tan = _norm(_sub(points[-1], points[-2]))
        else:
            tan = _norm(_sub(points[i + 1], points[i - 1]))
        up = frames_up[i] if isinstance(frames_up, list) else frames_up
        side = _norm(_cross(tan, up))
        if _len(_cross(tan, up)) < 1e-6:
            side = _norm(_cross(tan, (1.0, 0.0, 0.0)))
        nrm = _norm(_cross(side, tan))
        w, th = widths[i], thicks[i]
        tw = twist[i] if twist else 0.0
        for k in range(ring):
            a = k / ring * math.tau + tw
            ca, sa = math.cos(a), math.sin(a)
            # lens section: sharpened ends (anime clump edge)
            sx = ca * w
            sy = math.copysign(abs(sa) ** 1.4, sa) * th
            verts.append(_add(p, _add(_mul(side, sx), _mul(nrm, sy))))
    for i in range(n - 1):
        for k in range(ring):
            a0 = i * ring + k
            a1 = i * ring + (k + 1) % ring
            faces.append((a0, a1, a1 + ring, a0 + ring))
    if close_root:
        c = len(verts)
        verts.append(points[0])
        for k in range(ring):
            faces.append(((k + 1) % ring, k, c))
    if close_tip:
        c = len(verts)
        verts.append(points[-1])
        base = (n - 1) * ring
        for k in range(ring):
            faces.append((base + k, base + (k + 1) % ring, c))
    return verts, faces


# ── procedural painting (numpy) ─────────────────────────────

def _hex_srgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def _new_image(bpy, name, rgba):
    import numpy as np
    hgt, wid = rgba.shape[0], rgba.shape[1]
    img = bpy.data.images.new(name, wid, hgt, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1].reshape(-1), dtype=np.float32))
    try:
        img.pack()
    except Exception:  # noqa: BLE001
        pass
    return img


def paint_eye(spec, size=256):
    """Paint one anime eye (RGBA, sRGB values, transparent ground):
    the sclera almond, the iris with a vertical gradient (dark top),
    the pupil, two catch-lights, the thick upper lash line with a
    flick at the outer corner, a thin lower line. Left-eye layout
    (outer corner at +x); the right eye mirrors the plane."""
    import numpy as np
    S = size
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    u = (x / (S - 1)) * 2.0 - 1.0          # -1..1, +1 = outer corner
    v = 1.0 - (y / (S - 1)) * 2.0          # -1..1, +1 = top
    sharp = spec["eyes"]["shape"] == "sharp"
    rgba = np.zeros((S, S, 4), np.float32)

    def over(mask, col, a=1.0):
        m = np.clip(mask, 0.0, 1.0)[..., None] * a
        rgba[..., :3] = rgba[..., :3] * (1 - m) + np.array(col, np.float32) * m
        rgba[..., 3:4] = rgba[..., 3:4] * (1 - m) + m

    def soft(d, w=0.02):
        return np.clip(0.5 - d / w, 0.0, 1.0)

    # the almond: upper arc higher at the outer side, lower arc flatter
    top = 0.74 - 0.5 * u * u + (0.06 * u if not sharp else 0.14 * u) - (0.12 if sharp else 0.0)
    bot = -0.62 + 0.34 * u * u
    almond = np.minimum(top - v, v - bot)
    almond = np.where(np.abs(u) < 0.95, almond, -1.0)
    over(soft(-almond, 0.03), (0.97, 0.96, 0.95))
    # iris: tall ellipse, clipped by the almond
    ir = np.sqrt((u / 0.5) ** 2 + ((v + 0.02) / 0.74) ** 2)
    iris_col = np.array(_hex_srgb(spec["eyes"]["color"]), np.float32)
    dark = iris_col * 0.28
    light = np.clip(iris_col * 1.45 + 0.06, 0, 1)
    g = np.clip((v + 0.6) / 1.2, 0, 1)[..., None]                 # 0 bottom .. 1 top
    grad = light * (1 - g) + dark * g
    iris_mask = soft(ir - 1.0, 0.04) * soft(-almond, 0.03)
    m = iris_mask[..., None]
    rgba[..., :3] = rgba[..., :3] * (1 - m) + grad * m
    # iris rim
    rim = soft(np.abs(ir - 0.97) - 0.03, 0.02) * soft(-almond, 0.03)
    over(rim, tuple(dark * 0.8))
    # pupil
    pr = np.sqrt((u / 0.2) ** 2 + ((v + 0.02) / 0.36) ** 2)
    over(soft(pr - 1.0, 0.05) * soft(-almond, 0.03), tuple(dark * 0.5))
    # catch-lights
    for cx, cy, r in ((-0.17, 0.3, 0.15), (0.16, -0.3, 0.07)):
        over(soft(np.sqrt((u - cx) ** 2 + (v - cy) ** 2) - r, 0.03) * soft(-almond, 0.03), (1.0, 1.0, 1.0))
    # upper lash line (thick, flicks up/out at the outer corner)
    lash_w = 0.075 * spec["eyes"]["lashes"]
    lash = np.abs(v - top) - lash_w * (1.0 + 0.6 * np.clip(u, 0, 1))
    lash = np.where((u > -0.98) & (u < 0.98), lash, 1.0)
    over(soft(lash, 0.03), (0.10, 0.07, 0.08))
    flick = np.sqrt(((u - 0.95) / 0.16) ** 2 + ((v - (top + 0.1)) / 0.06) ** 2) - 1.0
    over(soft(flick, 0.08) * (u > 0.7), (0.10, 0.07, 0.08))
    # lower line (thin, outer half)
    low = np.abs(v - bot) - 0.018
    over(soft(low, 0.02) * np.clip((u + 0.1) / 0.6, 0, 1) * (np.abs(u) < 0.9), (0.25, 0.16, 0.16), 0.8)
    return rgba


def paint_brow(spec, w=256, h=64):
    import numpy as np
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (x / (w - 1)) * 2 - 1
    v = 1 - (y / (h - 1)) * 2
    arch = spec["brows"]["arch"]
    center = -0.1 + (0.45 * arch) * (1 - (u - 0.1) ** 2)
    thick = 0.24 * spec["brows"]["thickness"] * (1.0 - 0.55 * np.clip(u, 0, 1))
    d = np.abs(v - center) - thick
    d = np.where(np.abs(u) < 0.92, d, 1.0)
    rgba = np.zeros((h, w, 4), np.float32)
    col = np.array(_hex_srgb(spec["hair"]["color"]), np.float32) * 0.8
    a = np.clip(0.5 - d / 0.08, 0, 1)
    rgba[..., :3] = col
    rgba[..., 3] = a
    return rgba


def paint_mouth(spec, w=128, h=128):
    """A small anime mouth: a lip line that reads closed, and an
    interior (dark rose) that reads when the rig opens the decal."""
    import numpy as np
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (x / (w - 1)) * 2 - 1
    v = 1 - (y / (h - 1)) * 2
    rgba = np.zeros((h, w, 4), np.float32)
    inner = np.sqrt((u / 0.5) ** 2 + (v / 0.42) ** 2) - 1.0
    a_in = np.clip(0.5 - inner / 0.06, 0, 1)
    mc = np.array(_hex_srgb(spec["mouth"]["color"]), np.float32)
    rgba[..., :3] = mc * 0.55
    rgba[..., 3] = a_in
    line = np.abs(v - 0.08 * (1 - u * u)) - 0.07
    a_l = np.clip(0.5 - line / 0.05, 0, 1) * (np.abs(u) < 0.7)
    m = a_l[..., None]
    rgba[..., :3] = rgba[..., :3] * (1 - m) + np.array((0.32, 0.16, 0.16), np.float32) * m
    rgba[..., 3] = np.maximum(rgba[..., 3], a_l)
    return rgba


def paint_nose(w=64, h=64):
    import numpy as np
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (x / (w - 1)) * 2 - 1
    v = 1 - (y / (h - 1)) * 2
    rgba = np.zeros((h, w, 4), np.float32)
    d = np.sqrt(((u - 0.15) / 0.35) ** 2 + ((v + 0.2) / 0.18) ** 2) - 1.0
    rgba[..., :3] = (0.55, 0.36, 0.32)
    rgba[..., 3] = np.clip(0.5 - d / 0.3, 0, 1) * 0.55
    return rgba


def decal_material(bpy, name, img):
    """Flat painted decal: emission of the painted color, transparent
    where the paint is not - shadeless (anime faces are drawn, not lit).
    Tagged emissive so the TOON pass leaves it alone."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Linear"
    tex.extension = "CLIP"
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 0.92
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    nt.links.new(tex.outputs["Alpha"], mix.inputs["Fac"])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    try:
        mat.blend_method = "BLEND"
    except Exception:  # noqa: BLE001
        pass
    mat["animeos_kind"] = "emissive"
    return mat


def _decal_plane(bpy, scn, name, parent, w, h, mat, head_ob, mirror=False, segs=8, offset=0.0016):
    """A subdivided plane facing -Y, shrinkwrapped onto the head surface
    (projected along +Y), parented to its rig pivot."""
    verts, faces = [], []
    for j in range(segs + 1):
        for i in range(segs + 1):
            u = (i / segs - 0.5) * w
            v = (j / segs - 0.5) * h
            verts.append((-u if mirror else u, -0.05, v))
    for j in range(segs):
        for i in range(segs):
            a = j * (segs + 1) + i
            faces.append((a, a + 1, a + segs + 2, a + segs + 1) if not mirror else (a, a + segs + 1, a + segs + 2, a + 1))
    ob = _mesh_obj(bpy, scn, name, verts, faces, mat, smooth=True, parent=parent)
    me = ob.data
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            i, j = vi % (segs + 1), vi // (segs + 1)
            uv.data[li].uv = (i / segs, j / segs)
    sw = ob.modifiers.new("OnFace", "SHRINKWRAP")
    sw.target = head_ob
    sw.wrap_method = "PROJECT"
    sw.use_project_y = True
    sw.use_negative_direction = True
    sw.use_positive_direction = True
    sw.offset = offset
    ob.visible_shadow = False
    ob["animeos_no_flesh"] = True
    _no_ink(bpy, scn, ob)
    return ob


def _no_ink(bpy, scn, ob):
    """Painted decals are drawn already - the Freestyle ink must not
    trace their plane borders (the TOON pass excludes this collection)."""
    coll = bpy.data.collections.get("AnimeOSNoInk")
    if coll is None:
        coll = bpy.data.collections.new("AnimeOSNoInk")
        scn.collection.children.link(coll)
    if ob.name not in coll.objects:
        coll.objects.link(ob)


# ── the head ─────────────────────────────────────────────────

def _head_point(spec, theta, phi):
    """The anime skull as a function of the sphere angles. theta 0..pi
    from the crown, phi around Z (phi=-pi/2 faces -Y, the front)."""
    f = spec["face"]
    hs = spec["body"]["headScale"]
    st, ct = math.sin(theta), math.cos(theta)
    x = st * math.cos(phi) * 0.118
    y = st * math.sin(phi) * 0.122
    z = ct * 0.128
    # the lower face: below the cheekbone line the sides taper to the chin
    if z < 0.0:
        s = _clamp(-z / 0.128, 0.0, 1.0)
        front = _clamp(-math.sin(phi), 0.0, 1.0)            # 1 at the face, 0 at the back
        taper = 1.0 - (1.0 - f["jawTaper"]) * (s ** 1.25)
        x *= taper * (1.0 + 0.04 * (f["cheek"] - 1.0) * (1 - s))
        # the chin comes forward and slightly down on the front
        y -= front * f["chinFwd"] * (s ** 2.0) * 1.2
        z -= front * 0.012 * (s ** 3.0)
        # the jaw hinge pulls in behind the face (a small anime jaw)
        y *= 1.0 - 0.18 * s * (1 - front)
        # the anime lower face is SHORT: the chin sits closer to the eyes
        z *= 0.86
    # flatten the face plane a little (anime faces read frontal)
    if y < -0.085:
        y = -0.085 + (y + 0.085) * 0.55
    # the cranium is large (the anime proportion)
    if z > 0.0:
        x *= 1.04
        y *= 1.02
    return (x * hs, y * hs, (z + 0.14) * hs)


def build_head(bpy, scn, spec, head_empty, skin_mat):
    rings, segs = 28, 40
    verts = [(_head_point(spec, 0.0, 0.0))]
    for r in range(1, rings):
        th = r / rings * math.pi
        for s in range(segs):
            ph = s / segs * math.tau
            verts.append(_head_point(spec, th, ph))
    verts.append(_head_point(spec, math.pi, 0.0))
    faces = []
    for s in range(segs):
        faces.append((0, 1 + (s + 1) % segs, 1 + s))
    for r in range(rings - 2):
        for s in range(segs):
            a = 1 + r * segs + s
            b = 1 + r * segs + (s + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    last = len(verts) - 1
    base = 1 + (rings - 2) * segs
    for s in range(segs):
        faces.append((base + s, base + (s + 1) % segs, last))
    head = _mesh_obj(bpy, scn, "HeadMesh", verts, faces, skin_mat, parent=head_empty)
    head["animeos_no_flesh"] = True
    _subsurf(head, 1)
    # ── the anime face terminator: normals transferred from a clean
    #    ellipsoid, so the toon band curves smoothly across the face
    #    instead of tracing the jaw/cheek bumps ──
    pv, pf = [], []
    for r in range(rings + 1):
        th = r / rings * math.pi
        for s in range(segs):
            ph = s / segs * math.tau
            pv.append((math.sin(th) * math.cos(ph) * 0.115, math.sin(th) * math.sin(ph) * 0.13, math.cos(th) * 0.135 + 0.14))
    for r in range(rings):
        for s in range(segs):
            a = r * segs + s
            b = r * segs + (s + 1) % segs
            pf.append((a, b, b + segs, a + segs))
    proxy = _mesh_obj(bpy, scn, "HeadNormalProxy", pv, pf, None, parent=head_empty)
    proxy.hide_render = True
    proxy.hide_viewport = False
    proxy["animeos_no_flesh"] = True
    try:
        dt = head.modifiers.new("FaceNormals", "DATA_TRANSFER")
        dt.object = proxy
        dt.use_loop_data = True
        dt.data_types_loops = {"CUSTOM_NORMAL"}
        dt.loop_mapping = "POLYINTERP_NEAREST"
        dt.mix_factor = 0.85
    except Exception:  # noqa: BLE001
        pass
    # simple ears (hidden by most hair, honest at the short styles)
    for side in (1.0, -1.0):
        ev, ef = _loft([(side * 0.108, 0.0, 0.15), (side * 0.118, 0.008, 0.12), (side * 0.112, 0.004, 0.09)],
                       (0.0, -1.0, 0.0), [0.018, 0.02, 0.012], [0.007, 0.008, 0.006], ring=8)
        ear = _mesh_obj(bpy, scn, f"Ear{'L' if side > 0 else 'R'}", ev, ef, skin_mat, parent=head_empty)
        ear["animeos_no_flesh"] = True
    return head


# ── the body (skin-modifier graph -> one baked mesh) ─────────

def _joint_layout(spec):
    """The v3.x anchors (KEPT - apply_pose, the leg IK and the framing
    math depend on them) plus the spec's proportions for the mesh."""
    b = spec["body"]
    w = {"lean": 0.92, "sturdy": 1.1, "heavy": 1.25}[b["build"]]
    sw = b["shoulders"]
    return {"w": w, "sw": sw, "hips": b["hips"]}


def build_body_graph(spec):
    """(verts, edges, radii) for the Skin modifier, root-local units."""
    L = _joint_layout(spec)
    w, sw, hp = L["w"], L["sw"], L["hips"]
    female = spec["body"]["gender"] == "female"
    bust = spec["body"]["bust"]
    V, E, R = [], [], []

    def v(p, rx, ry=None):
        V.append(p)
        R.append((rx, ry if ry is not None else rx))
        return len(V) - 1

    def chain(ids):
        for a, b2 in zip(ids, ids[1:]):
            E.append((a, b2))

    pelvis = v((0, 0, 1.0), 0.125 * w * hp, 0.095 * w)
    waist = v((0, 0, 1.18), (0.085 if female else 0.1) * w, 0.07 * w)
    chest = v((0, -0.004, 1.36), 0.105 * w * (sw * 0.9), (0.075 + 0.02 * bust) * w)
    upper = v((0, 0, 1.53), 0.11 * w * sw, 0.07 * w)
    neck0 = v((0, 0.004, 1.64), 0.042, 0.04)
    neck1 = v((0, 0.008, 1.77), 0.036, 0.034)
    chain([pelvis, waist, chest, upper, neck0, neck1])
    hands = {}
    for side in (1.0, -1.0):
        sx = side * 0.24 * sw
        clav = v((side * 0.13 * sw, 0.0, 1.6), 0.05)
        sh = v((sx, 0.0, 1.62), 0.046 * w)
        el = v((sx, 0.0, 1.37), 0.034 * w)
        wr = v((sx, 0.0, 1.12), 0.024)
        palm = v((sx, 0.0, 1.075), 0.03, 0.012)
        chain([upper, clav, sh, el, wr, palm])
        hands[side] = palm
        # fingers (hand-local x offsets mirror the v3.x hand)
        thumb_side = 1.0 if side < 0 else -1.0   # R hand thumb_side +1 in v3.x
        for k, fx in enumerate((-0.0165, -0.0055, 0.0055, 0.0165)):
            b0 = v((sx + fx, 0.0, 1.05), 0.0065)
            b1 = v((sx + fx, 0.0, 1.025), 0.0058)
            b2 = v((sx + fx, 0.0, 1.0), 0.0048)
            chain([palm, b0, b1, b2])
        t0 = v((sx + thumb_side * 0.024, -0.006, 1.085), 0.007)
        t1 = v((sx + thumb_side * 0.032, -0.014, 1.06), 0.006)
        chain([palm, t0, t1])
        hip = v((side * 0.1 * hp, 0.0, 0.98), 0.078 * w * hp)
        knee = v((side * 0.1 * hp, 0.0, 0.54), 0.05 * w)
        ankle = v((side * 0.1 * hp, 0.0, 0.1), 0.035)
        toe = v((side * 0.1 * hp, -0.11, 0.035), 0.032, 0.028)
        chain([pelvis, hip, knee, ankle, toe])
    return V, E, R


def build_body(bpy, scn, spec, skin_mat, boots_mat):
    V, E, R = build_body_graph(spec)
    me = bpy.data.meshes.new("AnimeBodyGraph")
    me.from_pydata(V, E, [])
    me.update()
    ob = bpy.data.objects.new("AnimeBodyGraph", me)
    scn.collection.objects.link(ob)
    sk = ob.modifiers.new("Skin", "SKIN")
    sk.use_smooth_shade = True
    sk.branch_smoothing = 0.6
    ss = ob.modifiers.new("Sub", "SUBSURF")
    ss.levels = 2
    ss.render_levels = 2
    sv = me.skin_vertices[0].data
    for i, r in enumerate(R):
        sv[i].radius = r
    sv[0].use_root = True
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    baked = bpy.data.meshes.new_from_object(ev)
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    baked.name = "AnimeBody"
    body = bpy.data.objects.new("AnimeBody", baked)
    scn.collection.objects.link(body)
    baked.materials.append(skin_mat)
    baked.materials.append(boots_mat)
    o = spec["outfit"]
    hem_z = 0.06 + (1.0 - o["length"]) * 0.75
    for p in baked.polygons:
        p.use_smooth = True
        c = p.center
        if c.z < 0.24:
            p.material_index = 1
        elif o["type"] != "hanfu" and c.z < 0.97 and abs(c.x) < 0.2:
            p.material_index = 1          # trousers under a tunic / fitted top
    # THE GARMENT COVERS THE BODY: faces the clothes hide are removed so
    # no skin pokes through a shoulder seam or a sleeve (the dressed
    # character is one silhouette; the hands, neck and feet stay)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(baked)
    top_cover = 1.70
    torso_floor = (hem_z + 0.05) if o["type"] == "hanfu" else 0.95
    sleeve_floor = 1.14 if o["sleeves"] == "bell" else 1.18
    kill = []
    for f in bm.faces:
        c = f.calc_center_median()
        ax = abs(c.x)
        torso = ax < 0.2 and torso_floor < c.z < top_cover
        arm = ax >= 0.15 and sleeve_floor < c.z < 1.68
        if torso or arm:
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(baked)
    bm.free()
    baked.update()
    body["animeos_no_flesh"] = True
    return body


# ── the rig (armature that follows the joint empties) ────────

# (bone name, empty key, head-point fn, tail-point fn) in root-local units
def _bone_table(spec):
    L = _joint_layout(spec)
    sw, hp = L["sw"], L["hips"]
    t = [
        ("Pelvis", "Pelvis", (0, 0, 0.92), (0, 0, 1.3)),
        ("Spine", "Spine", (0, 0, 1.3), (0, 0, 1.7)),
        ("Head", "Head", (0, 0, 1.7), (0, 0, 2.0)),
    ]
    for side, P in ((1.0, "L"), (-1.0, "R")):
        sx = side * 0.24 * sw
        t += [
            (P + "Shoulder", P + "Shoulder", (sx, 0, 1.62), (sx, 0, 1.37)),
            (P + "Elbow", P + "Elbow", (sx, 0, 1.37), (sx, 0, 1.12)),
            (P + "Palm", P + "Palm", (sx, 0, 1.12), (sx, 0, 1.06)),
            (P + "Hip", P + "Hip", (side * 0.1 * hp, 0, 0.98), (side * 0.1 * hp, 0, 0.54)),
            (P + "Knee", P + "Knee", (side * 0.1 * hp, 0, 0.54), (side * 0.1 * hp, -0.06, 0.04)),
        ]
    return t


def build_rig(bpy, scn, spec, empties, root):
    """Create the armature (flat bone list), bind it to the joint
    empties. Returns the rig record sync_rig consumes."""
    arm_data = bpy.data.armatures.new("AnimeRig")
    arm = bpy.data.objects.new("AnimeRig", arm_data)
    scn.collection.objects.link(arm)
    arm.parent = root
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    table = _bone_table(spec)
    # finger bones: one per finger pivot / thumb pivot, along -Z
    for P in ("L", "R"):
        for key in [k for k in empties if k.startswith(P + "Finger") or k == P + "Index" or k == P + "Thumb"]:
            e = empties[key]
            p = e["rest"]
            table.append((key, key, p, (p[0], p[1] - 0.004, p[2] - 0.045)))
    for name, _k, h, tl in table:
        eb = arm_data.edit_bones.new(name)
        eb.head = h
        eb.tail = tl
        eb.roll = 0.0
    bpy.ops.object.mode_set(mode="OBJECT")
    return {"arm": arm, "bones": [(n, k) for n, _k2, _h, _t in table for k in [_k2]], "segments": [(n, h, tl) for n, _k, h, tl in table]}


def skin_weights(ob, segments, region_fn=None, smooth=4.0):
    """Assign vertex groups by distance to the bone segments (two
    nearest, inverse-power blend). region_fn(name, co) -> False excludes
    a bone for a vertex (left/right separation)."""
    for name, _h, _t in segments:
        if name not in ob.vertex_groups:
            ob.vertex_groups.new(name=name)
    mw = ob.matrix_world
    for vtx in ob.data.vertices:
        co = tuple(ob.matrix_basis @ vtx.co) if False else tuple(vtx.co)
        ds = []
        for name, h, tl in segments:
            if region_fn and not region_fn(name, co):
                continue
            d, _ = _seg_dist(co, h, tl)
            ds.append((d, name))
        if not ds:
            continue
        ds.sort()
        top = ds[:2]
        ws = [1.0 / (max(d, 1e-4) ** smooth) for d, _n in top]
        tot = sum(ws)
        for (d, n), wgt in zip(top, ws):
            ob.vertex_groups[n].add([vtx.index], wgt / tot, "REPLACE")
    _ = mw


def default_region(name, co):
    """Keep the arms, legs and hands on their own side, and keep the
    fingers off the torso."""
    x, _y, z = co
    if name[0] in ("L", "R") and name not in ("Pelvis",):
        side = 1.0 if name[0] == "L" else -1.0
        if x * side < -0.02:
            return False
    if ("Finger" in name or "Index" in name or "Thumb" in name) and z > 1.09:
        return False
    if name.endswith(("Hip", "Knee")) and z > 1.05:
        return False
    if name.endswith(("Shoulder", "Elbow", "Palm")) and abs(x) < 0.12:
        return False
    return True


def bind_skinned(ob, rig, region_fn=default_region, segments=None):
    ob.parent = rig["arm"]
    m = ob.modifiers.new("AnimeRig", "ARMATURE")
    m.object = rig["arm"]
    # the armature deform runs BEFORE the subsurf (move it first)
    try:
        while ob.modifiers.find("AnimeRig") > 0:
            import bpy
            with bpy.context.temp_override(object=ob):
                bpy.ops.object.modifier_move_up(modifier="AnimeRig")
    except Exception:  # noqa: BLE001
        pass
    skin_weights(ob, segments or rig["segments"], region_fn)


def make_sync(bpy, rig, empties_by_key, root):
    """Snapshot the rest state and return sync_rig(): every frame, the
    pose bones take each joint empty's world DELTA from rest - the
    v3.x rig keeps driving, the armature follows."""
    import mathutils
    bpy.context.view_layer.update()
    arm = rig["arm"]
    a_rest = arm.matrix_world.copy()
    rest = {}
    for bname, key in rig["bones"]:
        e = empties_by_key.get(key)
        if e is None:
            continue
        b = arm.data.bones[bname]
        rest[bname] = (e, e.matrix_world.copy().inverted(), a_rest @ b.matrix_local)

    def sync_rig():
        bpy.context.view_layer.update()
        a_inv = arm.matrix_world.inverted()
        for bname, (e, e_rest_inv, b_rest_world) in rest.items():
            pb = arm.pose.bones[bname]
            pb.matrix = a_inv @ (e.matrix_world @ e_rest_inv @ b_rest_world)
        _ = mathutils
    return sync_rig


# ── hair (lofted clumps) ─────────────────────────────────────

def _scalp(theta, phi, off=0.012):
    """A point on (just above) the cranium, head-empty-local."""
    st, ct = math.sin(theta), math.cos(theta)
    return (st * math.cos(phi) * (0.117 + off), st * math.sin(phi) * (0.127 + off), ct * (0.133 + off) + 0.14)


def build_hair(bpy, scn, spec, head_empty, hair_mat):
    h = spec["hair"]
    style, length, vol = h["style"], h["length"], h["volume"]
    made = []

    def clump(name, pts, width, thick, up=(0.0, 0.0, 1.0), samples=14, tip=0.12, curl=0.0):
        P = _catmull(pts, samples)
        n = len(P)
        ws, ts, tw = [], [], []
        for i in range(n):
            t = i / (n - 1)
            prof = (math.sin(min(1.0, t / 0.18) * math.pi / 2)) * (1.0 - t) ** 0.85 + tip * (1 - t)
            ws.append(max(0.002, width * vol * prof))
            ts.append(max(0.0015, thick * vol * prof))
            tw.append(curl * t)
        v, f = _loft(P, up, ws, ts, ring=10, twist=tw)
        ob = _mesh_obj(bpy, scn, name, v, f, hair_mat, parent=head_empty)
        ob["animeos_no_flesh"] = True
        _subsurf(ob, 1)
        made.append(ob.name)
        return ob

    # the cap: a shell over the cranium so no scalp shows between clumps
    cv, cf = [], []
    rings, segs = 12, 36
    hairline = 0.62 if style != "short" else 0.66      # theta (radians) where the front hairline sits
    for r in range(rings + 1):
        for s in range(segs):
            ph = s / segs * math.tau
            front = _clamp(-math.sin(ph), 0, 1)
            th_max = hairline + (1.0 - front) * (1.25 if style != "short" else 0.95)
            th = r / rings * th_max
            cv.append(_scalp(th, ph, 0.006))
    for r in range(rings):
        for s in range(segs):
            a = r * segs + s
            b2 = r * segs + (s + 1) % segs
            cf.append((a, b2, b2 + segs, a + segs))
    cap = _mesh_obj(bpy, scn, "HairCap", cv, cf, hair_mat, parent=head_empty)
    cap["animeos_no_flesh"] = True
    _subsurf(cap, 1)
    made.append("HairCap")

    # bangs: clumps from the crown-front falling to the brow line
    bang_n = 9 if h["bangs"] != "none" else 0
    for i in range(bang_n):
        u = (i / (bang_n - 1)) * 2 - 1                     # -1..1 across the forehead
        if h["bangs"] == "parted" and abs(u) < 0.2:
            continue
        ph = -math.pi / 2 + u * 0.95
        root = _scalp(0.25, ph, 0.012)
        mid = _scalp(0.72, ph + u * 0.05, 0.022)
        sweep = 0.012 * u
        tipp = (mid[0] + sweep, mid[1] - 0.01, 0.168 - 0.012 * abs(u) + (0.02 if h["bangs"] == "parted" else 0.0))
        clump(f"Bang{i}", [root, mid, tipp], 0.04, 0.011, up=(0.0, -1.0, 0.25), curl=0.3 * u)

    # side locks framing the face
    for side, nm in ((1.0, "L"), (-1.0, "R")):
        ph = -math.pi / 2 + side * 1.15
        root = _scalp(0.5, ph, 0.014)
        drop = 0.07 + 0.22 * min(1.0, length)
        mid = (side * 0.122, -0.06, 0.08)
        tipp = (side * 0.115, -0.055, 0.08 - drop)
        clump(f"SideLock{nm}", [root, mid, tipp], 0.034, 0.011, up=(side, 0.0, 0.0))

    # the back mass
    if style in ("long", "braid", "ponytail") or style == "short":
        n = 11 if style != "short" else 9
        for i in range(n):
            u = (i / (n - 1)) * 2 - 1
            ph = math.pi / 2 + u * 1.25                      # behind
            root = _scalp(0.35, ph, 0.012)
            crown_back = _scalp(1.25, ph, 0.03)
            if style == "short":
                end = (crown_back[0] * 1.05, crown_back[1] * 1.05 + 0.01, 0.03)
                clump(f"BackClump{i}", [root, crown_back, end], 0.034, 0.01, up=(0, 1, 0))
            elif style == "long":
                drop = 0.25 + 0.75 * length
                end = (crown_back[0] * 0.9 + 0.01 * u, crown_back[1] + 0.03, 0.0 - drop)
                midp = (crown_back[0], crown_back[1] + 0.03, -0.05 - drop * 0.4)
                nm = f"HairTail{i}" if abs(u) < 0.6 else f"BackClump{i}"
                clump(nm, [root, crown_back, midp, end], 0.036, 0.011, up=(0, 1, 0), curl=0.15 * u)
            else:   # ponytail / braid: swept up to the tie point
                tie = (0.0, 0.11, 0.21)
                clump(f"BackSweep{i}", [_scalp(0.9, ph, 0.012), _scalp(0.55, ph, 0.02), tie], 0.03, 0.009, up=(0, 1, 0))
        if style in ("ponytail", "braid"):
            tie = (0.0, 0.11, 0.21)
            drop = 0.2 + 0.6 * length
            if style == "ponytail":
                for k in range(3):
                    off = (k - 1) * 0.015
                    clump(f"HairTail{k}", [tie, (off, 0.17, 0.15), (off * 2, 0.16, 0.0), (off * 2.5, 0.13, -drop)],
                          0.03, 0.012, up=(0, 1, 0), curl=0.2 * (k - 1))
            else:
                segs_n = int(4 + 6 * length)
                for k in range(segs_n):
                    z0 = 0.18 - k * (drop / segs_n)
                    clump(f"HairTail{k}", [(0.0, 0.14, z0), (0.006 * (-1) ** k, 0.145, z0 - drop / segs_n * 0.6),
                                           (0.0, 0.14, z0 - drop / segs_n * 1.1)], 0.022, 0.014, up=(0, 1, 0), tip=0.4)
    if style == "topknot":
        # swept-up back + a bun at the crown + the pin
        for i in range(10):
            u = (i / 9) * 2 - 1
            ph = math.pi / 2 + u * 1.4
            clump(f"BackSweep{i}", [_scalp(1.3, ph, 0.012), _scalp(0.8, ph, 0.02), (0.0, 0.03, 0.29)],
                  0.034, 0.009, up=(0, 1, 0))
        bv, bf = [], []
        R_, segs_b = 0.045, 16
        for r in range(9):
            th = r / 8 * math.pi
            for s in range(segs_b):
                ph = s / segs_b * math.tau
                bv.append((math.sin(th) * math.cos(ph) * R_, 0.02 + math.sin(th) * math.sin(ph) * R_, 0.3 + math.cos(th) * R_ * 0.8))
        for r in range(8):
            for s in range(segs_b):
                a = r * segs_b + s
                b2 = r * segs_b + (s + 1) % segs_b
                bf.append((a, b2, b2 + segs_b, a + segs_b))
        bun = _mesh_obj(bpy, scn, "HairBun", bv, bf, hair_mat, parent=head_empty)
        bun["animeos_no_flesh"] = True
        _subsurf(bun, 1)
        made.append("HairBun")
        # a few long strands falling from the bun behind (they swing)
        for k in range(3):
            off = (k - 1) * 0.02
            clump(f"HairTail{k}", [(off, 0.05, 0.3), (off * 1.5, 0.11, 0.22), (off * 2, 0.13, 0.05), (off * 2, 0.12, -0.25 * length)],
                  0.024, 0.008, up=(0, 1, 0))
    return made


def build_hair_pin(bpy, scn, head_empty, mat):
    v, f = _loft([(-0.09, 0.02, 0.31), (0.0, 0.02, 0.32), (0.09, 0.02, 0.31)], (0, 1, 0), [0.004, 0.005, 0.004], [0.004, 0.005, 0.004], ring=8)
    pin = _mesh_obj(bpy, scn, "HairPin", v, f, mat, parent=head_empty)
    pin["animeos_no_flesh"] = True
    return pin


# ── the garments ─────────────────────────────────────────────

def _ring_loft(rings, seg=36, close_bottom=False):
    """rings: [(z, rx, ry, cy)] top->bottom; returns verts/faces of an
    elliptical tube."""
    verts, faces = [], []
    for (z, rx, ry, cy) in rings:
        for s in range(seg):
            a = s / seg * math.tau
            verts.append((math.cos(a) * rx, math.sin(a) * ry + cy, z))
    for i in range(len(rings) - 1):
        for s in range(seg):
            a0 = i * seg + s
            a1 = i * seg + (s + 1) % seg
            faces.append((a0, a0 + seg, a1 + seg, a1))
    return verts, faces


def build_garments(bpy, scn, spec, mats, rig):
    o = spec["outfit"]
    L = _joint_layout(spec)
    w, sw, hp = L["w"], L["sw"], L["hips"]
    made = []
    robe, accent = mats["robe"], mats["accent"]

    # 1. the robe body: collar -> shoulders -> chest -> waist -> hips -> hem
    hem_z = 0.06 + (1.0 - o["length"]) * 0.75
    rings = [
        (1.73, 0.05, 0.048, 0.004),
        (1.68, 0.075, 0.065, 0.0),
        (1.635, 0.2 * sw * w, 0.085 * w, 0.0),
        (1.58, 0.215 * sw * w, 0.095 * w, 0.0),
        (1.48, 0.16 * sw * w, 0.097 * w, 0.0),
        (1.36, 0.135 * w * sw * 0.95, (0.098 + 0.02 * spec["body"]["bust"]) * w, -0.006),
        (1.20, 0.115 * w, 0.088 * w, 0.0),
        (1.02, 0.148 * w * hp, 0.112 * w, 0.0),
    ]
    if o["type"] == "fitted":
        rings += [(0.92, 0.15 * w * hp, 0.112 * w, 0.0)]
    else:
        flare = 1.0 if o["type"] == "hanfu" else 0.6
        span = 1.02 - hem_z
        for k in range(1, 7):
            t = k / 6
            z = 1.02 - span * t
            rx = (0.148 * hp + (0.13 * flare) * t ** 1.3) * w
            ry = (0.112 + (0.11 * flare) * t ** 1.3) * w
            rings.append((z, rx, ry, 0.012 * t))
    v, f = _ring_loft(rings, seg=40)
    body = _mesh_obj(bpy, scn, "RobeBody", v, f, robe)
    # the collar top closes around the neck

    body["animeos_no_flesh"] = True
    sol = body.modifiers.new("Thick", "SOLIDIFY")
    sol.thickness = 0.006
    _subsurf(body, 1)

    def robe_region(name, co):
        x, _y, z = co
        if name.endswith(("Shoulder", "Elbow", "Palm")) or "Finger" in name or "Index" in name or "Thumb" in name:
            return False
        if name == "Head":
            return False
        if name.endswith(("Hip", "Knee")):
            side = 1.0 if name[0] == "L" else -1.0
            return x * side > -0.02 and z < 0.95
        return True

    bind_skinned(body, rig, robe_region)
    # soften the skirt: the legs only carry part of the hem (cloth, not trousers)
    if o["type"] != "fitted":
        for vtx in body.data.vertices:
            if vtx.co.z < 0.95:
                for g in vtx.groups:
                    gn = body.vertex_groups[g.group].name
                    if gn.endswith(("Hip", "Knee")):
                        g.weight *= 0.45
                pg = body.vertex_groups["Pelvis"]
                pg.add([vtx.index], 0.55, "ADD")
    made.append("RobeBody")

    # 2. the sleeves: along the arm, belled past the wrist
    for side, P in ((1.0, "L"), (-1.0, "R")):
        sx = side * 0.24 * sw
        if o["sleeves"] == "bell":
            path = [(sx - side * 0.09, 0.0, 1.6), (sx - side * 0.02, 0.0, 1.56), (sx, 0.0, 1.37), (sx, 0.005, 1.2), (sx, 0.02, 1.08), (sx, 0.04, 0.98)]
            wid = [0.07, 0.07, 0.068, 0.085, 0.11, 0.125]
        else:
            path = [(sx - side * 0.09, 0.0, 1.6), (sx - side * 0.02, 0.0, 1.56), (sx, 0.0, 1.37), (sx, 0.0, 1.16)]
            wid = [0.062, 0.055, 0.045, 0.036]
        P2 = _catmull(path, 16)
        W2 = [wid[min(len(wid) - 1, int(i / 15 * (len(wid) - 1) + 0.5))] for i in range(16)]
        # smooth the width ramp
        W2 = [sum(W2[max(0, i - 2):i + 3]) / len(W2[max(0, i - 2):i + 3]) for i in range(16)]
        sv_, sf_ = _loft(P2, (0.0, 1.0, 0.0), [x_ * w for x_ in W2], [x_ * 0.85 * w for x_ in W2], ring=16,
                         close_tip=False, close_root=False)
        # an elliptical (not lens) section for cloth: rebuild with ellipse
        sl = _mesh_obj(bpy, scn, f"AnimeSleeve{P}", sv_, sf_, robe)
        sl["animeos_no_flesh"] = True
        so = sl.modifiers.new("Thick", "SOLIDIFY")
        so.thickness = 0.005
        _subsurf(sl, 1)

        def sleeve_region(name, co, P=P):
            return name in (P + "Shoulder", P + "Elbow", "Spine")

        bind_skinned(sl, rig, sleeve_region)
        made.append(sl.name)

    # 3. the crossed collar (jiaoling): the right panel over the left,
    #    an accent band from the neck to the opposite waist
    if o["collar"] == "crossed":
        for side, nm in ((1.0, "L"), (-1.0, "R")):
            pts = [(side * 0.045, -0.04, 1.71), (side * 0.03, -0.085, 1.6), (-side * 0.04, -0.105, 1.42), (-side * 0.09, -0.098, 1.24)]
            if side < 0:
                pts = [(p[0], p[1] - 0.004, p[2]) for p in pts]   # the right panel rides over
            P2 = _catmull(pts, 14)
            cv, cf = _loft(P2, (0.0, -1.0, 0.0), [0.018] * 14, [0.004] * 14, ring=8)
            col = _mesh_obj(bpy, scn, f"Collar{nm}", cv, cf, accent)
            col["animeos_no_flesh"] = True
            bind_skinned(col, rig, lambda n, c: n in ("Spine", "Pelvis"))
            made.append(col.name)
    # 4. the sash: a band at the waist + two tails (secondary motion)
    if o["sash"]:
        v, f = _ring_loft([(1.235, 0.124 * w, 0.094 * w, 0.0), (1.165, 0.12 * w, 0.091 * w, 0.0)], seg=40)
        sash = _mesh_obj(bpy, scn, "SashBand", v, f, accent)
        sash["animeos_no_flesh"] = True
        sash.modifiers.new("Thick", "SOLIDIFY").thickness = 0.006
        bind_skinned(sash, rig, lambda n, c: n in ("Pelvis", "Spine"))
        made.append("SashBand")
    return made


# ── the weapon (the v3.x grip contract) ─────────────────────

def build_weapon(bpy, scn, br, dna, mats, r_hand):
    wtype = str(dna.get("weaponType") or "none")
    if wtype not in getattr(br, "GRIP_SPEC", {}):
        return None, None
    spec = br.GRIP_SPEC[wtype]
    tilt = spec["tilt"]
    piv = bpy.data.objects.new("GripPivot", None)
    scn.collection.objects.link(piv)
    piv.parent = r_hand
    piv.location = br.GRIP_ANCHOR
    blade = None
    if wtype == "sword":
        gv, gf = _loft([(0, 0, -spec["hilt"] / 2), (0, 0, spec["hilt"] / 2)], (0, 1, 0), [0.012, 0.012], [0.012, 0.012], ring=10)
        grip = _mesh_obj(bpy, scn, "BladeGrip", gv, gf, mats["boots"], parent=piv)
        grip.rotation_euler = (math.radians(tilt), 0.0, 0.0)
        gdv, gdf = _loft([(-0.05, 0, 0), (0.05, 0, 0)], (0, 0, 1), [0.012, 0.012], [0.008, 0.008], ring=8)
        guard = _mesh_obj(bpy, scn, "BladeGuard", gdv, gdf, mats["accent"], parent=piv)
        guard.location = br.grip_piece_offset(wtype, spec["hilt"] / 2.0 + 0.0055)
        guard.rotation_euler = (math.radians(tilt), 0.0, 0.0)
        L_ = 1.1
        pts = [(0, 0, 0), (0, 0, L_ * 0.5), (0, 0, L_ * 0.95), (0, 0, L_)]
        bv, bf = _loft(pts, (0, 1, 0), [0.016, 0.015, 0.012, 0.001], [0.004, 0.004, 0.003, 0.001], ring=8)
        blade = _mesh_obj(bpy, scn, "HandBlade", bv, bf, mats["blade"], parent=piv)
        blade.location = br.grip_piece_offset(wtype, spec["guard"] + 0.0055)
        blade.rotation_euler = (math.radians(tilt), 0.0, 0.0)
    else:
        depth = 1.3 if wtype == "staff" else 1.5
        bv, bf = _loft([(0, 0, -depth / 2), (0, 0, depth / 2)], (0, 1, 0), [0.013, 0.013], [0.013, 0.013], ring=10)
        blade = _mesh_obj(bpy, scn, "HandBlade", bv, bf, mats["boots"], parent=piv)
        blade.location = br.grip_piece_offset(wtype, -spec["hold"])
        blade.rotation_euler = (math.radians(tilt), 0.0, 0.0)
    for ob in piv.children:
        ob["animeos_no_flesh"] = True
    return blade, piv


# ── the whole character ─────────────────────────────────────

def build_anime_character(bpy, scn, dna, mats, br=None, strand_f=1.0):
    """Build the designed anime character. Returns the v3.x figure
    dict (root/spine/head/... + face pivots + fingers + blade) so every
    downstream law drives it unchanged, plus 'syncRig' (call before
    each frame renders) and the build evidence."""
    spec = resolve_spec(dna)
    L = _joint_layout(spec)
    sw, hp = L["sw"], L["hips"]
    empties = {}

    def empty(name, parent, loc):
        e = bpy.data.objects.new(name, None)
        scn.collection.objects.link(e)
        e.empty_display_size = 0.04
        if parent is not None:
            e.parent = parent
        e.location = loc
        empties[name] = {"ob": e}
        return e

    # ── the v3.x joint hierarchy (anchors KEPT) ──
    root = empty("Root", None, (0.0, 0.0, 0.0))
    pelvis = empty("Pelvis", root, (0.0, 0.0, 1.02))
    spine = empty("Spine", pelvis, (0.0, 0.0, 0.45))
    head = empty("Head", spine, (0.0, 0.0, 0.28))
    joints = {}
    for side, P in ((1.0, "L"), (-1.0, "R")):
        sh = empty(P + "Shoulder", spine, (side * 0.24 * sw, 0.0, 0.18))
        el = empty(P + "Elbow", sh, (0.0, 0.0, -0.28))
        hand = empty(P + "Hand", el, (0.0, 0.0, -0.26))
        palm = empty(P + "Palm", hand, (0.0, 0.0, -0.01))
        hip = empty(P + "Hip", pelvis, (side * 0.1 * hp, 0.0, -0.02))
        knee = empty(P + "Knee", hip, (0.0, 0.0, -0.46))
        thumb_side = 1.0 if P == "R" else -1.0
        fingers = []
        index_x = 0.0055 * thumb_side
        for k, fx in enumerate((-0.0165, -0.0055, 0.0055, 0.0165)):
            is_index = abs(fx - index_x) < 0.001
            nm = P + ("Index" if is_index else f"Finger{len(fingers)}")
            piv = empty(nm, palm, (fx, 0.0, -0.05))
            fingers.append((piv, is_index))
        tp = empty(P + "Thumb", palm, (thumb_side * 0.025, -0.002, -0.014))
        tp.rotation_euler = (math.radians(20), 0.0, math.radians(-35 * thumb_side))
        joints[P] = {"sh": sh, "el": el, "hand": hand, "hip": hip, "knee": knee, "fingers": fingers, "thumb": tp}

    # face pivots (positions on the NEW head - eyes at the anime line)
    es = spec["eyes"]["size"]
    eye_z = 0.128
    face_y = -0.108
    eyeL = empty("EyeL", head, (0.05, face_y, eye_z))
    eyeR = empty("EyeR", head, (-0.05, face_y, eye_z))
    browL = empty("BrowL", head, (0.05, face_y, eye_z + 0.04 * es))
    browR = empty("BrowR", head, (-0.05, face_y, eye_z + 0.04 * es))
    mouth = empty("Mouth", head, (0.0, face_y, 0.062))
    nose = empty("Nose", head, (0.0, face_y, 0.09))

    bpy.context.view_layer.update()
    for k, rec in empties.items():
        rec["rest"] = tuple(rec["ob"].matrix_world.translation)

    # ── the meshes ──
    hm = build_head(bpy, scn, spec, head, mats["skin"])
    body = build_body(bpy, scn, spec, mats["skin"], mats["boots"])
    rig = build_rig(bpy, scn, spec, empties, root)
    bind_skinned(body, rig)
    garments = build_garments(bpy, scn, spec, mats, rig)
    hair = build_hair(bpy, scn, spec, head, mats["hair"])
    if spec["hair"]["accessory"] == "pin":
        build_hair_pin(bpy, scn, head, mats["accent"])
        hair.append("HairPin")
    # sash tails hang from the pelvis (the secondary rig swings them)
    if spec["outfit"]["sash"]:
        for k, off in enumerate((0.03, 0.06)):
            tv, tf = _loft([(0, 0, 0), (0.004, -0.003, -0.12), (0.01, 0.0, -0.26)], (0, -1, 0), [0.016, 0.015, 0.012], [0.003] * 3, ring=8, close_tip=True)
            tail = _mesh_obj(bpy, scn, "SashTail" if k == 0 else "SashTail.001", tv, tf, mats["accent"], parent=pelvis)
            tail.location = (off, -0.1 * L["w"], 0.17)
            tail["animeos_no_flesh"] = True

    # ── the painted face ──
    eye_img = _new_image(bpy, "AnimeEye", paint_eye(spec))
    brow_img = _new_image(bpy, "AnimeBrow", paint_brow(spec))
    mouth_img = _new_image(bpy, "AnimeMouth", paint_mouth(spec))
    nose_img = _new_image(bpy, "AnimeNose", paint_nose())
    eye_m = decal_material(bpy, "EyeDecal", eye_img)
    brow_m = decal_material(bpy, "BrowDecal", brow_img)
    mouth_m = decal_material(bpy, "MouthDecal", mouth_img)
    nose_m = decal_material(bpy, "NoseDecal", nose_img)
    tilt = math.radians(8.0 * spec["eyes"]["tilt"])
    ew, eh = 0.058 * es, 0.06 * es
    # the rig's eye pivots (eyeL/eyeR) are DRIVERS: apply_pose writes
    # the blink/squint there and sync_rig remaps it onto the decal
    # pivots - a painted anime eye squints, it never collapses to the
    # slit a sphere eye needed
    eyeLd = empty("EyeLDecal", head, (0.05, face_y, eye_z))
    eyeRd = empty("EyeRDecal", head, (-0.05, face_y, eye_z))
    eL = _decal_plane(bpy, scn, "EyeLMesh", eyeLd, ew, eh, eye_m, hm, mirror=False)
    eR = _decal_plane(bpy, scn, "EyeRMesh", eyeRd, ew, eh, eye_m, hm, mirror=True)
    eL.rotation_euler = (0.0, -tilt, 0.0)
    eR.rotation_euler = (0.0, tilt, 0.0)
    bL = _decal_plane(bpy, scn, "BrowLMesh", browL, 0.05 * es, 0.0125, brow_m, hm, mirror=False, segs=6)
    bR = _decal_plane(bpy, scn, "BrowRMesh", browR, 0.05 * es, 0.0125, brow_m, hm, mirror=True, segs=6)
    mw = 0.03 * spec["mouth"]["width"]
    mm = _decal_plane(bpy, scn, "MouthMesh", mouth, mw, mw, mouth_m, hm, segs=6)
    nm_ = _decal_plane(bpy, scn, "NoseMesh", nose, 0.016, 0.016, nose_m, hm, segs=4)
    for d in (eL, eR, bL, bR, mm, nm_):
        d.location = (0.0, 0.0, 0.0)

    weapon = build_weapon(bpy, scn, br, dna, mats, joints["R"]["hand"]) if br is not None else (None, None)
    blade, grip_pivot = weapon

    root.scale = (0.45, 0.45, 0.45)
    body_sync = make_sync(bpy, rig, {k: v["ob"] for k, v in empties.items()}, root)

    def sync_rig():
        for drv, dec in ((eyeL, eyeLd), (eyeR, eyeRd)):
            z = float(drv.scale[2])
            dec.scale = (1.0, 1.0, EYE_OPEN_FLOOR + (1.0 - EYE_OPEN_FLOOR) * _clamp(z, 0.0, 1.2))
        body_sync()
    sync_rig()

    return {
        "builder": f"anime-v{ANIME_LAW_VERSION}",
        "root": root, "spine": spine, "head": head,
        "rShoulder": joints["R"]["sh"], "rElbow": joints["R"]["el"],
        "lShoulder": joints["L"]["sh"], "lElbow": joints["L"]["el"],
        "rHip": joints["R"]["hip"], "rKnee": joints["R"]["knee"],
        "lHip": joints["L"]["hip"], "lKnee": joints["L"]["knee"],
        "eyeL": eyeL, "eyeR": eyeR, "browL": browL, "browR": browR, "mouth": mouth,
        "rFingers": joints["R"]["fingers"], "lFingers": joints["L"]["fingers"],
        "rThumb": joints["R"]["thumb"], "lThumb": joints["L"]["thumb"],
        "blade": blade, "gripPivot": grip_pivot,
        "headMesh": hm, "exprKeys": {}, "speechKeys": {}, "wrinkleNodes": {},
        "syncRig": sync_rig,
        "anime": {
            "lawVersion": ANIME_LAW_VERSION,
            "spec": spec,
            "body": {"verts": len(body.data.vertices), "bones": len(rig["segments"])},
            "garments": garments,
            "hair": hair,
            "face": ["EyeLMesh", "EyeRMesh", "BrowLMesh", "BrowRMesh", "MouthMesh", "NoseMesh"],
        },
    }
