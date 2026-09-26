# ─────────────────────────────────────────────────────────────
# AnimeOS VARIATION NODES (iteration 53) - real Blender Geometry
# Nodes, the professional answer to "every copy looks the same".
#
# A designed asset that repeats itself is a wallpaper: production
# sets scatter hundreds of DISTINCT rocks, bamboo and debris; a
# sword rack lays out a line of pieces that share the design but
# not the pose. Geometry Nodes are how a Blender professional does
# that - the layout is NON-DESTRUCTIVE (a modifier over the
# carrier), instanced (Cycles renders 10k without 10k objects) and
# DETERMINISTIC (a seed, so the same spec always lands the same
# variation - the studio's designs are reproducible).
#
# Two kinds, both real node trees built here:
#   SCATTER - Distribute Points on Faces (RANDOM, seeded) over a
#             carrier surface -> Instance on Points (the source
#             object) -> Rotate/Scale Instances with Random Value
#             jitter. Rocks on a terrain, reeds in a marsh, stars
#             of debris around an artifact.
#   ARRAY   - a deterministic SPINE (a generated mesh whose points
#             march a direction with seeded jitter - computed in
#             Python so the layout is exactly reproducible) ->
#             Instance on Points -> same jitter chain. Racks of
#             blades, colonnades, banners over a gate, coin
#             piles.
#
# Node palette used (all verified against Blender 4.3.2 headless):
#   GeometryNodeDistributePointsOnFaces (distribute_method RANDOM,
#     Seed input - deterministic)
#   GeometryNodeObjectInfo (Object input - the source)
#   GeometryNodeInstanceOnPoints
#   GeometryNodeRotateInstances + GeometryNodeScaleInstances
#   FunctionNodeRandomValue (data_type FLOAT_VECTOR; outputs['Value']
#     IS the vector socket - links into Rotation/Scale proven)
#
# Evaluation honesty: instances live in the depsgraph (to_mesh()
# does not see them), so the instance report counts
# depsgraph.object_instances AFTER view_layer.update() - and the
# whole snapshot is taken atomically (instance references die on
# the next update).
# ─────────────────────────────────────────────────────────────

import json
import math


def _mulberry32(seed):
    """The SAME deterministic RNG the bridge uses (fnv1a + mulberry32
    in animeos_bridge.py) - a variation spec is reproducible across
    machines because the layout comes from this, not from wall clock."""
    cell = [int(seed) & 0xFFFFFFFF]

    def rng():
        cell[0] = (cell[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = cell[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rng


def pick_carrier(bpy, scn, hint):
    """The surface the variation lands on: the named hint first, then
    the usual builder names (Ground/Terrain/Base), then the mesh with
    the largest XY footprint (the floor of any set reads as the
    carrier)."""
    if hint:
        ob = scn.objects.get(hint)
        if ob is not None and ob.type == "MESH":
            return ob
    for name in ("Ground", "Terrain", "Base", "SetFloor"):
        ob = scn.objects.get(name)
        if ob is not None and ob.type == "MESH":
            return ob
    best = None
    best_area = -1.0
    for ob in scn.objects:
        if ob.type != "MESH":
            continue
        bb = ob.bound_box
        xs = [v[0] for v in bb]
        ys = [v[1] for v in bb]
        area = (max(xs) - min(xs)) * (max(ys) - min(ys))
        if area > best_area:
            best_area = area
            best = ob
    return best


def pick_source(bpy, scn, hint, carrier):
    """The object that gets instanced: the named hint first, then the
    smallest mesh that is NOT the carrier (a pebble, not the floor)."""
    if hint and hint != (carrier.name if carrier else None):
        ob = scn.objects.get(hint)
        if ob is not None and ob.type == "MESH" and ob is not carrier:
            return ob
    best = None
    best_vol = 1e18
    for ob in scn.objects:
        if ob.type != "MESH" or ob is carrier:
            continue
        bb = ob.bound_box
        xs = [v[0] for v in bb]
        ys = [v[1] for v in bb]
        zs = [v[2] for v in bb]
        vol = max(1e-6, (max(xs) - min(xs)) * (max(ys) - min(ys)) * (max(zs) - min(zs)))
        if vol < best_vol:
            best_vol = vol
            best = ob
    return best


def _jitter_chain(tree, n_iop, n_out, scale_jitter, rot_jitter, seed):
    """The shared tail of both kinds: rotate + scale jitter through
    Random Value nodes (FLOAT_VECTOR), then to the group output."""
    n_rot = tree.nodes.new("GeometryNodeRotateInstances")
    n_scl = tree.nodes.new("GeometryNodeScaleInstances")
    n_rr = tree.nodes.new("FunctionNodeRandomValue")
    n_rs = tree.nodes.new("FunctionNodeRandomValue")
    n_rr.data_type = "FLOAT_VECTOR"
    n_rs.data_type = "FLOAT_VECTOR"
    # deterministic jitter: the Seed inputs are set, never left 0-by-luck
    n_rr.inputs["Seed"].default_value = int(seed) & 0xFFFF
    n_rs.inputs["Seed"].default_value = (int(seed) + 1013) & 0xFFFF
    tree.links.new(n_iop.outputs["Instances"], n_rot.inputs["Instances"])
    tree.links.new(n_rot.outputs["Instances"], n_scl.inputs["Instances"])
    tree.links.new(n_scl.outputs["Instances"], n_out.inputs["Geometry"])
    tree.links.new(n_rr.outputs["Value"], n_rot.inputs["Rotation"])
    tree.links.new(n_rs.outputs["Value"], n_scl.inputs["Scale"])
    # spin: full circle on Z scaled by rotJitter; tilt scales with it
    tilt = max(0.0, min(1.0, float(rot_jitter))) * 0.6
    spin = max(0.0, min(1.0, float(rot_jitter))) * 2.0 * math.pi
    n_rr.inputs["Min"].default_value = (-tilt, -tilt, -spin)
    n_rr.inputs["Max"].default_value = (tilt, tilt, spin)
    lo = 1.0 - max(0.0, min(1.0, float(scale_jitter))) * 0.6
    hi = 1.0 + max(0.0, min(1.0, float(scale_jitter))) * 0.9
    n_rs.inputs["Min"].default_value = (lo, lo, lo * 0.8)
    n_rs.inputs["Max"].default_value = (hi, hi, hi)
    return n_rot, n_scl


def build_scatter_tree(bpy, name, source_obj, density, seed, scale_jitter, rot_jitter):
    """SCATTER: carrier geometry in -> seeded points -> source
    instances with jitter -> out. Density lands on the carrier's
    area (a bigger terrain scatters more, exactly as designed)."""
    tree = bpy.data.node_groups.new(name, "GeometryNodeTree")
    tree.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    tree.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    n_in = tree.nodes.new("NodeGroupInput")
    n_out = tree.nodes.new("NodeGroupOutput")
    n_dist = tree.nodes.new("GeometryNodeDistributePointsOnFaces")
    n_obj = tree.nodes.new("GeometryNodeObjectInfo")
    n_iop = tree.nodes.new("GeometryNodeInstanceOnPoints")
    tree.links.new(n_in.outputs["Geometry"], n_dist.inputs["Mesh"])
    tree.links.new(n_dist.outputs["Points"], n_iop.inputs["Points"])
    tree.links.new(n_obj.outputs["Geometry"], n_iop.inputs["Instance"])
    n_obj.inputs["Object"].default_value = source_obj
    n_dist.distribute_method = "RANDOM"
    n_dist.inputs["Density"].default_value = max(0.05, float(density))
    n_dist.inputs["Seed"].default_value = int(seed) & 0xFFFF
    _jitter_chain(tree, n_iop, n_out, scale_jitter, rot_jitter, int(seed) + 77)
    return tree


def build_spine(bpy, scn, name, spec, seed):
    """The ARRAY points source: a real mesh whose vertices march a
    direction with SEEDED jitter - computed here in Python so the
    layout is exactly reproducible (and grids/curves stay trivial).
    Kept OUT of the carrier's way: it is hidden (hide_render) since
    only its POINTS matter to the node tree."""
    rng = _mulberry32(seed)
    count = max(2, int(spec.get("count", 6)))
    step = spec.get("step") or [0.7, 0.0, 0.0]
    jitter = max(0.0, min(1.0, float(spec.get("spread", 0.25))))
    layout = str(spec.get("layout", "line")).lower()
    verts = []
    cols = count if layout != "grid" else max(2, int(round(math.sqrt(count))))
    rows = 1 if layout != "grid" else max(2, int(math.ceil(count / cols)))
    for r in range(rows):
        for c in range(cols):
            x = c * float(step[0]) + (rng() - 0.5) * 2.0 * jitter * max(0.2, float(step[0]))
            y = (r * float(step[1]) if layout == "grid" else 0.0) + (rng() - 0.5) * 2.0 * jitter * 0.5
            z = (r * float(step[2]) if layout == "grid" else c * float(step[2])) + rng() * jitter * 0.25
            verts.append((x, y, z))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], [])
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    scn.collection.objects.link(ob)
    # verts-only mesh: nothing renders (Cycles ignores bare vertices),
    # and leaving it visible keeps it inside the depsgraph evaluation
    # the Object Info node pulls from
    return ob


def build_array_tree(bpy, name, source_obj, spine_obj, seed, scale_jitter, rot_jitter):
    """ARRAY: the spine's points -> source instances with jitter. The
    spine carries the layout (line or grid, seeded in Python); the
    tree carries the per-instance pose jitter."""
    tree = bpy.data.node_groups.new(name, "GeometryNodeTree")
    tree.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    tree.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    n_out = tree.nodes.new("NodeGroupOutput")
    n_obj = tree.nodes.new("GeometryNodeObjectInfo")
    n_spine = tree.nodes.new("GeometryNodeObjectInfo")
    n_iop = tree.nodes.new("GeometryNodeInstanceOnPoints")
    n_obj.inputs["Object"].default_value = source_obj
    n_spine.inputs["Object"].default_value = spine_obj
    tree.links.new(n_spine.outputs["Geometry"], n_iop.inputs["Points"])
    tree.links.new(n_obj.outputs["Geometry"], n_iop.inputs["Instance"])
    _jitter_chain(tree, n_iop, n_out, scale_jitter, rot_jitter, int(seed) + 331)
    return tree


def count_instances(scn, carrier, source):
    """Honest instance report: depsgraph object_instances AFTER a view
    layer update, snapshotted ATOMICALLY - DepsgraphObjectInstance
    wrappers are only valid during their iteration, so every value
    (translation) must be copied to plain data inside the loop
    (verified against Blender 4.3.2; touching .object after the loop
    raises ReferenceError). Our asset builds own their scene: the
    only instancing in it is OUR modifier, so counting every
    instance IS counting the variation. Returns
    (total_instances, unique_locations)."""
    try:
        import bpy  # noqa: F401
    except ImportError:
        return 0, 0
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    locs = set()
    for inst in dg.object_instances:
        if not inst.is_instance:
            continue
        total += 1
        t = inst.matrix_world.translation
        locs.add((round(t.x, 3), round(t.y, 3), round(t.z, 3)))
    return total, len(locs)


def apply_variation(bpy, scn, spec):
    """Entry point from the builder: one variation spec dict ->
    a real GN modifier on the carrier + a summary dict.
    Returns (summary, error)."""
    kind = str(spec.get("variation", "scatter")).strip().lower()
    seed = int(spec.get("seed", 7)) & 0xFFFF
    scale_jitter = float(spec.get("scaleJitter", 0.35))
    rot_jitter = float(spec.get("rotJitter", 0.8))
    carrier_hint = str(spec.get("carrier", "") or "")
    source_hint = str(spec.get("source", "") or "")

    carrier = pick_carrier(bpy, scn, carrier_hint)
    if carrier is None:
        return None, "no carrier mesh found to receive the variation"
    source = pick_source(bpy, scn, source_hint, carrier)
    if source is None:
        return None, "no source mesh found to instance (a variation needs a piece to repeat)"

    tree_name = f"AnimeOSVariation_{kind}_{seed}"
    if kind == "scatter":
        # density derives from the count the designer asked for, spread
        # across the carrier's measured XY area (a real survey, not a guess)
        count = max(1, min(400, int(spec.get("count", 40))))
        bb = carrier.bound_box
        xs = [v[0] for v in bb]
        ys = [v[1] for v in bb]
        area = max(0.5, (max(xs) - min(xs)) * (max(ys) - min(ys)))
        density = count / area
        tree = build_scatter_tree(bpy, tree_name, source, density, seed, scale_jitter, rot_jitter)
    elif kind == "array":
        count = max(2, min(64, int(spec.get("count", 8))))
        spine_spec = dict(spec)
        spine_spec["count"] = count
        spine = build_spine(bpy, scn, f"{tree_name}_Spine", spine_spec, seed)
        tree = build_array_tree(bpy, tree_name, source, spine, seed, scale_jitter, rot_jitter)
    else:
        return None, f"unknown variation kind '{kind}' (allowed: scatter, array)"

    # a fresh modifier name per attempt so re-applying replaces cleanly
    for m in list(carrier.modifiers):
        if m.name.startswith("AnimeOSVariation"):
            carrier.modifiers.remove(m)
    mod = carrier.modifiers.new("AnimeOSVariation", "NODES")
    mod.node_group = tree

    total, unique = count_instances(scn, carrier, source)
    summary = {
        "tree": tree_name,
        "kind": kind,
        "carrier": carrier.name,
        "source": source.name,
        "seed": seed,
        "instances": total,
        "uniqueLocations": unique,
    }
    if kind == "scatter":
        summary["count"] = int(spec.get("count", 40))
    return summary, None
