# ─────────────────────────────────────────────────────────────
# AnimeOS HEAD BAKE PASS (iteration 90 - THE HEAD IS CARVED AT
# DEPTH, Layer A: the geometry slice the measured cast gap named)
#
# The hero carve (the ~41k-vertex sculpted head the close framings
# earn) BAKES DOWN onto the light head's UV space, so every level
# below wears the depth the hero mesh owns:
#
#   BAKE  - a tangent-space NORMAL map (the analytic geometry bake,
#           1 sample) + a cavity map (the AO bake at bounded
#           distance - the creases' self-occlusion, the read the
#           10-sample preview cannot afford to ray-trace per pixel)
#           baked SELECTED TO ACTIVE from the hero carve onto a
#           light-head proxy (the depth-4 law), 512x512, 8px margin.
#           Everything else in the scene is hidden for the bake
#           window (the cavity reads the FACE's own concavity, not
#           the set's), and the visibility restores after.
#
#   WEAR  - the baked pair spliced into a graded skin tree: the
#           normal map through a Normal Map node into the BSDF's
#           Normal input, the cavity multiplied between the graded
#           Base Color chain and the socket (the creases darken, the
#           forms read). Both images load as Non-Color (data maps).
#
# The cache is keyed by the DETERMINISTIC BAKE KEY - sha256-16 over
# the face profile's own factors (NOT the mesh hash: the cache must
# be shared by every depth of the same face, and a 5-level mesh
# hashes differently from a 6). The hero build (re)bakes it; the
# reduced and light builds WEAR it when it exists and render
# unbaked, honestly, when it does not (self-healing across jobs).
#
# Determinism: the carve itself is pure vertex math (the sculpt
# law); the bake's normal is analytic; the cavity is sampled but
# seed-fixed - the fingerprint names the bake's identity, and the
# smoke asserts what actually holds.
#
# Machine-readable summary: the caller parses the returned dicts.
# ─────────────────────────────────────────────────────────────

import hashlib
import json
import math
import os

HEAD_BAKE_SIZE = 512
HEAD_BAKE_MARGIN = 8
HEAD_BAKE_AO_SAMPLES = 16

# THE FACE CREASES WHEN IT ACTS (iteration 93): the wrinkle-bearing
# expression shapes (jawOpen earns NO map - a bone move the shape key
# already carries at every resolution) and the base strength the live
# weights scale (mirrors wrinkle.ts bit-exactly).
WRINKLE_SHAPES = ("browKnit", "cheekRaise", "mouthCorner")
WRINKLE_STRENGTH = 0.85
WRINKLE_STRENGTH_MAX = 1.2
WRINKLE_BAKE_WEIGHT = 1.0


def bake_key(prof):
    """The DETERMINISTIC bake key - mirrors headBakeKeyHash in
    head-carve.ts bit-exactly (sha256-16 over the face profile's
    own factors). Versioned 107 (was 90): the relief law scaled
    the deep planes' deltas, so the cached bakes baked from the
    old relief are stale - the version bump re-bakes every face
    under the new mesh law."""
    f = prof.get("factors") if isinstance(prof, dict) else None
    if not isinstance(f, dict):
        f = {}
    def num(k):
        v = f.get(k)
        return float(v) if isinstance(v, (int, float)) and math.isfinite(float(v)) else 0.0
    key = "107|{:.3f}|{:.3f}|{:.3f}|{:.3f}|{:.3f}|v1".format(
        num("jawTaper"), num("chinFwd"), num("browFwd"), num("cheekOut"), num("noseLen"))
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def wrinkle_key(prof):
    """The DETERMINISTIC wrinkle key (iteration 93) - mirrors
    wrinkleKeyHash in wrinkle.ts bit-exactly: the same factor law the
    bake key hashes, versioned 107 (was 93 - the relief law moved
    the surface the creases bake from; the caches are independent
    sets over the same face)."""
    f = prof.get("factors") if isinstance(prof, dict) else None
    if not isinstance(f, dict):
        f = {}
    def num(k):
        v = f.get(k)
        return float(v) if isinstance(v, (int, float)) and math.isfinite(float(v)) else 0.0
    key = "107|{:.3f}|{:.3f}|{:.3f}|{:.3f}|{:.3f}|v1".format(
        num("jawTaper"), num("chinFwd"), num("browFwd"), num("cheekOut"), num("noseLen"))
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def cache_dir():
    """The stable bake cache: <repo>/public/headbake (derived from
    this file's own location - the ROOT law: bridges/blender/head_bake.py
    sits three levels below the repo root)."""
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    d = os.path.join(root, "public", "headbake")
    os.makedirs(d, exist_ok=True)
    return d


def cache_paths(key):
    d = cache_dir()
    return (os.path.join(d, f"{key}-normal.png"), os.path.join(d, f"{key}-cavity.png"))


def _fingerprint(path):
    try:
        with open(path, "rb") as fh:
            return hashlib.sha256(fh.read()).hexdigest()[:16]
    except Exception:  # noqa: BLE001
        return ""


def bake_head_depth(bpy, scn, deep_mesh, light_mesh, key):
    """BAKE: the hero carve onto the light proxy's UV space - a
    tangent-space normal map + a cavity (AO) map, 512x512, saved to
    the cache. Returns the evidence dict (or {'skipped': reason}
    honestly). Restores every hidden object and the sample count."""
    out_normal, out_cavity = cache_paths(key)
    # the bake window: only the two heads visible (the cavity reads
    # the face's own concavity, not the set's)
    hidden = []
    for ob in scn.objects:
        if ob is deep_mesh or ob is light_mesh:
            continue
        if not ob.hide_render:
            ob.hide_render = True
            hidden.append(ob)
    saved_samples = int(scn.cycles.samples)
    saved_engine = str(scn.render.engine)
    notes = []
    try:
        scn.render.engine = "CYCLES"
        scn.cycles.device = "CPU"
        scn.cycles.samples = 1
        scn.cycles.use_denoising = False
        # the light proxy: the bake target (active object), UVs must
        # be the spherical law the wear path samples through
        bpy.ops.object.select_all(action="DESELECT")
        light_mesh.select_set(True)
        deep_mesh.select_set(True)
        bpy.context.view_layer.objects.active = light_mesh
        img = bpy.data.images.get("HeadBakeImg")
        if img is None:
            img = bpy.data.images.new("HeadBakeImg", HEAD_BAKE_SIZE, HEAD_BAKE_SIZE)
        # the bake writes into the target material's active image
        # node (the proxy wears a plain tree carrying the image)
        tgt = light_mesh.data.materials[0] if light_mesh.data.materials else None
        if tgt is None:
            tgt = bpy.data.materials.new("HeadBakeTgt")
            tgt.use_nodes = True
            light_mesh.data.materials.append(tgt)
        nt = tgt.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.select = True
        nt.nodes.active = tex
        img.generated_color = (0.5, 0.5, 0.5, 1.0)
        scn.render.image_settings.file_format = "PNG"
        scn.render.image_settings.color_mode = "RGB"

        # 1. the tangent-space normal (analytic - 1 sample). The cage
        #    extrusion lifts the ray origins off the coincident base
        #    surfaces so the carved detail is reliably found (the deep
        #    surface sits millimeters above the light proxy).
        bpy.ops.object.bake(type="NORMAL",
                            use_selected_to_active=True, margin=HEAD_BAKE_MARGIN,
                            normal_space="TANGENT", cage_extrusion=0.02,
                            max_ray_distance=0.2)
        img.save_render(filepath=out_normal)
        # 2. the cavity: the AO of the deep carve through the same UVs
        #    (the creases' self-occlusion at a bounded distance)
        scn.cycles.samples = HEAD_BAKE_AO_SAMPLES
        if hasattr(scn.cycles, "ao_bakes_render_distance"):
            try:
                scn.cycles.ao_bakes_render_distance = 0.06
                notes.append("ao distance bounded")
            except Exception:  # noqa: BLE001
                notes.append("ao distance default")
        else:
            notes.append("ao distance law absent - whole-range ao")
        bpy.ops.object.bake(type="AO", pass_filter={"COLOR"},
                            use_selected_to_active=True, margin=HEAD_BAKE_MARGIN,
                            cage_extrusion=0.02, max_ray_distance=0.2)
        img.save_render(filepath=out_cavity)
    finally:
        scn.cycles.samples = saved_samples
        scn.render.engine = saved_engine
        for ob in hidden:
            ob.hide_render = False
    ok_n = os.path.isfile(out_normal)
    ok_c = os.path.isfile(out_cavity)
    if not (ok_n and ok_c):
        return {"skipped": "bake files missing", "notes": notes}
    return {
        "normal": out_normal,
        "cavity": out_cavity,
        "size": HEAD_BAKE_SIZE,
        "fingerprint": _fingerprint(out_normal),
        "key": key,
        "notes": notes,
    }


def wear_baked_maps(bpy, mat, normal_path, cavity_path):
    """WEAR: splice the baked pair into a graded skin tree - the
    normal map through a Normal Map node into the BSDF's Normal
    input, the cavity multiplied between the graded Base Color chain
    and the socket. Named on the material. Returns True when the
    splice landed (the nodes exist and link)."""
    if not (os.path.isfile(normal_path) and os.path.isfile(cavity_path)):
        return False
    if not mat.use_nodes:
        return False
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return False
    nrm_img = bpy.data.images.load(normal_path, check_existing=True)
    cav_img = bpy.data.images.load(cavity_path, check_existing=True)
    for im in (nrm_img, cav_img):
        try:
            im.colorspace_settings.name = "Non-Color"
        except Exception:  # noqa: BLE001
            pass
    # 1. the normal: image -> Normal Map -> the BSDF's Normal input
    n_tex = nt.nodes.new("ShaderNodeTexImage")
    n_tex.image = nrm_img
    n_tex.location = (-900, -600)
    n_map = nt.nodes.new("ShaderNodeNormalMap")
    n_map.location = (-640, -600)
    n_map.inputs["Strength"].default_value = 0.85
    nt.links.new(n_tex.outputs["Color"], n_map.inputs["Color"])
    nt.links.new(n_map.outputs["Normal"], bsdf.inputs["Normal"])
    # 2. the cavity: multiply between the Base Color driver and the
    #    socket (the creases darken, the forms read)
    drv = None
    for lk in list(nt.links):
        if lk.to_node == bsdf and lk.to_socket.name == "Base Color":
            drv = lk.from_socket
            nt.links.remove(lk)
            break
    mul = nt.nodes.new("ShaderNodeMixRGB")
    mul.blend_type = "MULTIPLY"
    mul.location = (240, -300)
    mul.inputs["Fac"].default_value = 1.0
    if drv is not None:
        nt.links.new(drv, mul.inputs["Color1"])
    else:
        mul.inputs["Color1"].default_value = (0.8, 0.7, 0.6, 1.0)
    c_tex = nt.nodes.new("ShaderNodeTexImage")
    c_tex.image = cav_img
    c_tex.location = (-100, -420)
    nt.links.new(c_tex.outputs["Color"], mul.inputs["Color2"])
    nt.links.new(mul.outputs["Color"], bsdf.inputs["Base Color"])
    mat["animeosBakeKey"] = normal_path  # the wear law names its source
    return True


# ─────────────────────────────────────────────────────────────
# THE FACE CREASES WHEN IT ACTS (iteration 93): the expression
# edition of the bake law. Each wrinkle-bearing expression shape is
# evaluated at FULL weight on BOTH the deep carve and the light
# proxy (the large move cancels between the two surfaces - what
# remains is exactly the shading detail the light mesh loses), baked
# selected-to-active through the same spherical UVs into a
# tangent-space NORMAL map per shape, cached beside the carve's bake
# under the wrinkle key, and WORN by the levels below through Normal
# Map nodes whose Strength is DRIVEN LIVE by the shape's expression
# weight every frame (the furrow deepens as the scowl deepens, rests
# when the face rests). The hero renders the creases as real
# geometry - no double count.
# ─────────────────────────────────────────────────────────────


def wrinkle_cache_paths(key):
    """The wrinkle cache beside the carve's bake: <key>-wrinkle-<shape>.png."""
    d = cache_dir()
    return {s: os.path.join(d, f"{key}-wrinkle-{s}.png") for s in WRINKLE_SHAPES}


def bake_wrinkle_set(bpy, scn, deep_mesh, light_mesh, key, deep_keys, light_keys):
    """BAKE the wrinkle set: for each shape, evaluate it at full
    weight on BOTH surfaces, bake selected-to-active (deep -> light
    proxy) through the shared spherical UVs, save to the cache, rest
    both keys. deep_keys/light_keys: {shape: KeyBlock} from the
    expression sculpt (a missing key honestly skips that shape).
    Returns the evidence dict. Restores visibility + samples."""
    paths = wrinkle_cache_paths(key)
    shapes_out = {}
    if not (deep_mesh or light_mesh) or not deep_keys or not light_keys:
        return {"skipped": "wrinkle bake needs both meshes and both key sets"}
    hidden = []
    for ob in scn.objects:
        if ob is deep_mesh or ob is light_mesh:
            continue
        if not ob.hide_render:
            ob.hide_render = True
            hidden.append(ob)
    saved_samples = int(scn.cycles.samples)
    saved_engine = str(scn.render.engine)
    notes = []
    try:
        scn.render.engine = "CYCLES"
        scn.cycles.device = "CPU"
        scn.cycles.samples = 1
        scn.cycles.use_denoising = False
        # the proxy is the bake target (active), the UVs the spherical
        # law every depth shares
        img = bpy.data.images.get("HeadWrinkleImg")
        if img is None:
            img = bpy.data.images.new("HeadWrinkleImg", HEAD_BAKE_SIZE, HEAD_BAKE_SIZE)
        tgt = light_mesh.data.materials[0] if light_mesh.data.materials else None
        if tgt is None:
            tgt = bpy.data.materials.new("HeadWrinkleTgt")
            tgt.use_nodes = True
            light_mesh.data.materials.append(tgt)
        nt = tgt.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.select = True
        nt.nodes.active = tex
        img.generated_color = (0.5, 0.5, 0.5, 1.0)
        scn.render.image_settings.file_format = "PNG"
        scn.render.image_settings.color_mode = "RGB"

        for shape in WRINKLE_SHAPES:
            kb_d = deep_keys.get(shape)
            kb_l = light_keys.get(shape)
            if kb_d is None or kb_l is None:
                shapes_out[shape] = {"skipped": "key absent on a surface"}
                continue
            out_path = paths[shape]
            try:
                # both surfaces AT the expression: the large move
                # cancels; the crease detail remains
                kb_d.value = WRINKLE_BAKE_WEIGHT
                kb_l.value = WRINKLE_BAKE_WEIGHT
                bpy.context.view_layer.update()
                bpy.ops.object.select_all(action="DESELECT")
                light_mesh.select_set(True)
                deep_mesh.select_set(True)
                bpy.context.view_layer.objects.active = light_mesh
                bpy.ops.object.bake(type="NORMAL",
                                    use_selected_to_active=True, margin=HEAD_BAKE_MARGIN,
                                    normal_space="TANGENT", cage_extrusion=0.02,
                                    max_ray_distance=0.2)
                img.save_render(filepath=out_path)
                shapes_out[shape] = {
                    "file": os.path.basename(out_path),
                    "fingerprint": _fingerprint(out_path),
                }
            except Exception as exc:  # noqa: BLE001
                shapes_out[shape] = {"skipped": f"bake failed: {exc}"}
            finally:
                kb_d.value = 0.0
                kb_l.value = 0.0
        bpy.context.view_layer.update()
    finally:
        scn.cycles.samples = saved_samples
        scn.render.engine = saved_engine
        for ob in hidden:
            ob.hide_render = False
    baked = {s: v for s, v in shapes_out.items() if v.get("fingerprint")}
    if not baked:
        return {"skipped": "no wrinkle map baked", "shapes": shapes_out, "notes": notes}
    return {
        "key": key,
        "shapes": shapes_out,
        "baked": sorted(baked.keys()),
        "size": HEAD_BAKE_SIZE,
        "strength": WRINKLE_STRENGTH,
        "notes": notes,
    }


def wear_wrinkle_maps(bpy, mat, key):
    """WEAR the cached wrinkle set into a graded skin tree: each map
    through its own Normal Map node (Strength starts at 0 - the REST
    law; apply_pose drives it live by the shape's expression weight),
    composed additively over whatever feeds the BSDF's Normal input
    (the carve's baked normal when it wears, the raw socket when it
    does not), the chain normalized. Named on the material. Returns
    {shape: NormalMapNode} for the drive (empty when nothing wore)."""
    paths = wrinkle_cache_paths(key)
    present = {s: p for s, p in paths.items() if os.path.isfile(p)}
    if not present or not mat.use_nodes:
        return {}
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return {}
    # what currently feeds the BSDF's Normal input (the base bake's
    # normal map, or nothing) - the wrinkles compose OVER it
    base_out = None
    for lk in list(nt.links):
        if lk.to_node == bsdf and lk.to_socket.name == "Normal":
            base_out = lk.from_socket
            nt.links.remove(lk)
            break
    chain = base_out
    x_loc = -640
    nodes = {}
    for shape in WRINKLE_SHAPES:
        path = present.get(shape)
        if path is None:
            continue
        img = bpy.data.images.load(path, check_existing=True)
        try:
            img.colorspace_settings.name = "Non-Color"
        except Exception:  # noqa: BLE001
            pass
        n_tex = nt.nodes.new("ShaderNodeTexImage")
        n_tex.image = img
        n_tex.location = (-900, x_loc - 160)
        n_map = nt.nodes.new("ShaderNodeNormalMap")
        n_map.location = (-640, x_loc - 160)
        n_map.inputs["Strength"].default_value = 0.0  # the REST law
        n_map.name = f"AnimeOSWrinkle_{shape}"
        n_map.label = f"Wrinkle {shape}"
        nt.links.new(n_tex.outputs["Color"], n_map.inputs["Color"])
        add = nt.nodes.new("ShaderNodeVectorMath")
        add.operation = "ADD"
        add.location = (-380, x_loc - 160)
        if chain is not None:
            nt.links.new(chain, add.inputs[0])
        nt.links.new(n_map.outputs["Normal"], add.inputs[1])
        chain = add.outputs["Vector"]
        nodes[shape] = n_map
        x_loc -= 200
    if chain is None:
        return {}
    if len(nodes) > 1:
        nrm = nt.nodes.new("ShaderNodeVectorMath")
        nrm.operation = "NORMALIZE"
        nrm.location = (-200, x_loc - 60)
        nt.links.new(chain, nrm.inputs[0])
        chain = nrm.outputs["Vector"]
    nt.links.new(chain, bsdf.inputs["Normal"])
    mat["animeosWrinkleKey"] = key  # the wear law names its source
    return nodes


def wrinkle_strength_for(weight):
    """The DRIVEN strength for a live shape weight - mirrors
    wrinkleStrengthFor in wrinkle.ts bit-exactly (the base strength
    scaled by the clamped absolute weight, bounded)."""
    try:
        w = float(weight)
    except Exception:  # noqa: BLE001
        w = 0.0
    if not math.isfinite(w):
        w = 0.0
    w = min(1.0, max(-1.0, w))
    return min(WRINKLE_STRENGTH_MAX, max(0.0, WRINKLE_STRENGTH * abs(w)))
