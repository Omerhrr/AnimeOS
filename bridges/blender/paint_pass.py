# ─────────────────────────────────────────────────────────────
# AnimeOS PAINT PASS (iteration 73) - THE SKIN IS PAINTED
#
# A flat Principled base color is a color, not a SURFACE. This pass
# gives every library asset the surface texture the render was
# missing, in three deterministic layers:
#
#   1. UVs - every mesh gets a box-projection UV layer written in
#      pure Python from face normals + local coordinates (no bpy.ops
#      context, no thread order - the same mesh always lands the
#      same UVs, bit-exact).
#
#   2. PAINTED MAPS - one 256x256 texture per material role, painted
#      deterministically into an image's pixel array FROM the
#      material's own base color (the DNA, the sheet conformance and
#      the material recipes stay law - the paint only modulates what
#      they chose):
#        ROBE / CLOTH   woven thread pattern + dye noise + a second
#                       accent thread where the noise crosses
#        SKIN           warm low-frequency mottle (living skin, not
#                       plastic)
#        HAIR           directional strand streaks
#        LEATHER / HIDE two-scale grain + scuff specks
#      The maps are saved as PNGs beside the .blend AND packed INTO
#      it, so the asset travels whole.
#
#   3. SHADER UPGRADES - skin gains a subsurface weight (light
#      entering the skin), cloth gains sheen (the grazing-angle
#      fabric shine) - every input guarded, so a Blender without it
#      skips honestly and the pass never blocks a build.
#
# Deterministic: fnv1a seed + mulberry32 noise (the studio's standard
# seed law, mirrored from physics_pass), pure-Python pixel math, no
# timing or render order involved. The same DNA always paints the
# same map, bit-exact.
# ─────────────────────────────────────────────────────────────

import math
import os

PAINT_SIZE = 256


def fnv1a(s):
    """32-bit FNV-1a (mirrors the bridge's seed law exactly)."""
    h = 2166136261
    for ch in str(s):
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def mulberry32(seed):
    """The studio's deterministic rng (mirrors the bridge's)."""
    cell = [seed & 0xFFFFFFFF]

    def rng():
        cell[0] = (cell[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = cell[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61)))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rng


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


# ── deterministic value noise (grid + bilinear) ──────────────

def _noise_grid(rng, n):
    return [rng() for _ in range(n * n)]


def _sample_grid(grid, n, u, v):
    """Bilinear sample over the unit square (wraps at the edges so a
    repeated texture never shows a seam line)."""
    x = (u % 1.0) * (n - 1)
    y = (v % 1.0) * (n - 1)
    x0 = int(x)
    y0 = int(y)
    x1 = (x0 + 1) % n
    y1 = (y0 + 1) % n
    fx = x - x0
    fy = y - y0
    a = grid[y0 * n + x0]
    b = grid[y0 * n + x1]
    c = grid[y1 * n + x0]
    d = grid[y1 * n + x1]
    top = a + (b - a) * fx
    bot = c + (d - c) * fx
    return top + (bot - top) * fy


def _mix(c1, c2, k):
    return tuple(c1[i] + (c2[i] - c1[i]) * k for i in range(3))


# ── roles ────────────────────────────────────────────────────

def role_of(mat_name):
    """Map a builder material name to its paint role (None = untouched
    - emissive and unknown materials are honestly left alone)."""
    m = (mat_name or "").upper()
    if m in ("ROBEMAT",):
        return "ROBE"
    if m in ("ACCENTMAT",):
        return "CLOTH"
    if m in ("SKINMAT",):
        return "SKIN"
    if m in ("HAIRMAT",):
        return "HAIR"
    if m in ("BOOTSMAT", "PROPBODYMAT"):
        return "LEATHER"
    if m in ("HIDEMAT",):
        return "HIDE"
    return None


# ── painters (one per role) ──────────────────────────────────

def _paint_cloth(w, h, base, accent_hex_rgb, rng):
    """Woven fabric: fine thread pattern both axes, low-frequency dye
    variation, and the accent thread where a second noise crosses."""
    g_dye = _noise_grid(rng, 8)
    g_acc = _noise_grid(rng, 6)
    threads = 48.0
    px = []
    for y in range(h):
        v = y / (h - 1)
        for x in range(w):
            u = x / (w - 1)
            weave = 0.86 + 0.14 * (0.5 + 0.5 * math.sin(u * math.pi * threads) * math.sin(v * math.pi * threads))
            dye = (_sample_grid(g_dye, 8, u, v) - 0.5) * 0.12
            col = tuple(clamp(base[i] * weave * (1.0 + dye), 0.0, 1.0) for i in range(3))
            a = _sample_grid(g_acc, 6, u, v)
            if a > 0.70:
                col = _mix(col, accent_hex_rgb, clamp((a - 0.70) / 0.18, 0.0, 0.55))
            px.append((col[0], col[1], col[2], 1.0))
    return px


def _paint_skin(w, h, base, rng):
    """Living skin: a warm low-frequency mottle over the tone."""
    g = _noise_grid(rng, 5)
    g2 = _noise_grid(rng, 12)
    px = []
    for y in range(h):
        v = y / (h - 1)
        for x in range(w):
            u = x / (w - 1)
            m = (_sample_grid(g, 5, u, v) - 0.5) * 0.07
            m2 = (_sample_grid(g2, 12, u, v) - 0.5) * 0.04
            k = 1.0 + m + m2
            # a touch more red than green than blue in the mottle -
            # skin blushes, it never greys uniformly
            px.append((
                clamp(base[0] * (1.0 + m * 1.4 + m2), 0.0, 1.0),
                clamp(base[1] * (1.0 + m + m2), 0.0, 1.0),
                clamp(base[2] * (1.0 + m * 0.7 + m2), 0.0, 1.0),
                1.0,
            ))
    return px


def _paint_hair(w, h, base, rng):
    """Strand streaks: directional shading along U with a jittering
    phase so the strands never read as printed stripes."""
    g = _noise_grid(rng, 8)
    streaks = 26.0
    px = []
    for y in range(h):
        v = y / (h - 1)
        for x in range(w):
            u = x / (w - 1)
            jitter = (_sample_grid(g, 8, u * 2.0, v) - 0.5) * 1.6
            s = abs(math.sin((u + jitter) * math.pi * streaks))
            k = 0.72 + 0.42 * s
            px.append((
                clamp(base[0] * k, 0.0, 1.0),
                clamp(base[1] * k, 0.0, 1.0),
                clamp(base[2] * k, 0.0, 1.0),
                1.0,
            ))
    return px


def _paint_leather(w, h, base, rng):
    """Leather: two-scale grain + rare scuff specks."""
    g1 = _noise_grid(rng, 10)
    g2 = _noise_grid(rng, 28)
    px = []
    for y in range(h):
        v = y / (h - 1)
        for x in range(w):
            u = x / (w - 1)
            n = (_sample_grid(g1, 10, u, v) - 0.5) * 0.10 + (_sample_grid(g2, 28, u, v) - 0.5) * 0.06
            k = 1.0 + n
            col = [clamp(base[i] * k, 0.0, 1.0) for i in range(3)]
            if rng() < 0.0012:
                col = [c * 0.55 for c in col]
            px.append((col[0], col[1], col[2], 1.0))
    return px


def _paint_hide(w, h, base, rng):
    """Creature hide: coarse mottle + fine noise, slightly darker in
    the valleys (scales without printing scales)."""
    g1 = _noise_grid(rng, 6)
    g2 = _noise_grid(rng, 20)
    px = []
    for y in range(h):
        v = y / (h - 1)
        for x in range(w):
            u = x / (w - 1)
            n1 = _sample_grid(g1, 6, u, v)
            n2 = _sample_grid(g2, 20, u, v)
            k = 0.88 + 0.18 * n1 + 0.06 * (n2 - 0.5)
            px.append(tuple(clamp(base[i] * k, 0.0, 1.0) for i in range(3)) + (1.0,))
    return px


PAINTERS = {
    "ROBE": lambda w, h, base, rng, accent: _paint_cloth(w, h, base, accent, rng),
    "CLOTH": lambda w, h, base, rng, accent: _paint_cloth(w, h, base, accent, rng),
    "SKIN": lambda w, h, base, rng, accent: _paint_skin(w, h, base, rng),
    "HAIR": lambda w, h, base, rng, accent: _paint_hair(w, h, base, rng),
    "LEATHER": lambda w, h, base, rng, accent: _paint_leather(w, h, base, rng),
    "HIDE": lambda w, h, base, rng, accent: _paint_hide(w, h, base, rng),
}


# ── UV (box projection, pure python) ─────────────────────────

def box_uv(me):
    """Deterministic box projection: each face projects onto the plane
    of its dominant normal axis, UVs scaled by world-ish local size so
    the texel density is continuous across the mesh."""
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uvl = me.uv_layers[0]
    span = 1.0
    for poly in me.polygons:
        n = poly.normal
        ax, ay = _plane_for(n)
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            co = me.vertices[vi].co
            u = co[ax] / span
            v = co[ay] / span
            uvl.data[li].uv = (u % 1.0, v % 1.0)
    return True


def _plane_for(n):
    nx, ny, nz = abs(n.x), abs(n.y), abs(n.z)
    if nx >= ny and nx >= nz:
        return 1, 2  # project onto YZ
    if ny >= nz:
        return 0, 2  # project onto XZ
    return 0, 1      # project onto XY


# ── the pass ─────────────────────────────────────────────────

def apply_paint(bpy, scn, out_dir, slug, seed_text="asset"):
    """Paint every known-role material on the asset: UV every mesh,
    bake + wire one map per painted role, upgrade the shaders. Returns
    (summary, None) or (None, error)."""
    maps = []
    wired = 0
    uvs = 0
    subsurface = []
    sheen = []
    painted_roles = set()

    # one map per (role, material color) - two materials sharing a role
    # still paint separately (different colors deserve different maps)
    for mat in bpy.data.materials:
        if not mat or not mat.use_nodes:
            continue
        role = role_of(mat.name)
        if role is None:
            continue
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if not bsdf:
            continue
        base = tuple(bsdf.inputs["Base Color"].default_value[:3])
        # the accent thread takes the ACCENT material's color when one
        # exists (the robe's trim), else a lighter weave of the base
        accent = base
        acc_mat = bpy.data.materials.get("AccentMat")
        if acc_mat and acc_mat.use_nodes:
            acc_bsdf = acc_mat.node_tree.nodes.get("Principled BSDF")
            if acc_bsdf and mat.name != "AccentMat":
                accent = tuple(acc_bsdf.inputs["Base Color"].default_value[:3])
            elif mat.name == "AccentMat":
                accent = tuple(min(1.0, c * 1.35 + 0.08) for c in base)
        seed = fnv1a(f"{seed_text}:{mat.name}:{role}")
        rng = mulberry32(seed)
        painter = PAINTERS.get(role)
        if painter is None:
            continue
        try:
            px = painter(PAINT_SIZE, PAINT_SIZE, base, rng, accent)
        except Exception as exc:  # noqa: BLE001
            return None, f"painter {role} failed: {exc}"
        img = bpy.data.images.new(f"Paint_{mat.name}", PAINT_SIZE, PAINT_SIZE, alpha=False)
        flat = [c for p in px for c in p]
        try:
            img.pixels.foreach_set(flat)
        except Exception:
            # older Blender without foreach_set: assign the list (slower, same result)
            img.pixels = flat
        fname = f"{slug}-{role.lower()}.png"
        fpath = os.path.join(out_dir, fname)
        img.filepath_raw = fpath
        img.file_format = "PNG"
        try:
            img.save()
        except Exception:
            pass  # the packed copy still travels inside the .blend
        try:
            img.pack()
        except Exception:
            pass
        maps.append({"role": role, "mat": mat.name, "file": fname, "size": PAINT_SIZE})

        # wire: the painted image IS the base color now (it was painted
        # FROM the law color - DNA/sheet/recipe choices stay in charge)
        try:
            tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = img
            tex.interpolation = "Linear"
            tex.extension = "REPEAT"
            for link in list(mat.node_tree.links):
                if link.to_node == bsdf and link.to_socket.name == "Base Color":
                    mat.node_tree.links.remove(link)
            mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
            wired += 1
        except Exception:
            pass  # the flat law color remains - honest, wired is not inflated
        painted_roles.add(role)

    # UV every mesh in the scene (asset-local: the builder scene only
    # holds this asset)
    for ob in scn.objects:
        if ob.type == "MESH" and ob.data:
            try:
                if box_uv(ob.data):
                    uvs += 1
            except Exception:
                pass

    # shader upgrades (guarded per input)
    for mat in bpy.data.materials:
        if not mat or not mat.use_nodes:
            continue
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if not bsdf:
            continue
        role = role_of(mat.name)
        if role == "SKIN" and "Subsurface Weight" in bsdf.inputs:
            try:
                bsdf.inputs["Subsurface Weight"].default_value = 0.14
                if "Subsurface Radius" in bsdf.inputs:
                    bsdf.inputs["Subsurface Radius"].default_value = (0.012, 0.006, 0.004)
                if "Subsurface Scale" in bsdf.inputs:
                    bsdf.inputs["Subsurface Scale"].default_value = 0.02
                if "SKIN" not in subsurface:
                    subsurface.append("SKIN")
            except Exception:
                pass
        if role in ("ROBE", "CLOTH") and "Sheen Weight" in bsdf.inputs:
            try:
                bsdf.inputs["Sheen Weight"].default_value = 0.35
                if "SHEEN" not in sheen:
                    sheen.append("SHEEN")
            except Exception:
                pass

    if not maps:
        return None, "no known-role materials found to paint"
    return {
        "version": "v1.0",
        "size": PAINT_SIZE,
        "maps": maps,
        "wired": wired,
        "uvs": uvs,
        "shaders": {"subsurface": subsurface, "sheen": sheen},
    }, None
