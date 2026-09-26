# ─────────────────────────────────────────────────────────────
# AnimeOS SCULPT + RETOPOLOGY PASSES (iteration 55)
#
# The deterministic surface-finishing passes over a built asset:
#
#   SCULPT  - layered, seeded VALUE-NOISE DISPLACEMENT along vertex
#             normals (the studio's mulberry32 seed law, hash-lattice
#             value noise - the same spec + seed always carves the
#             same surface). Three layer kinds cover the production
#             vocabulary:
#               swell - broad organic mass (terrain hills, muscle,
#                       drapery billows)
#               fold  - ridged noise (cloth folds, hide striations,
#                       panel lines)
#               grain - fine high-frequency tooth (weathering, skin)
#             A BMESH-GRID SUBDIVISION is applied FIRST where the spec
#             asks for it (you cannot sculpt a 12-vertex slab) -
#             deliberately NOT the SUBSURF modifier: OpenSubdiv's
#             parallel evaluation is float-order nondeterministic in
#             the last bits, while a single-threaded bmesh subdivision
#             is bit-exact across runs, and the seed law demands
#             bit-exact. The layers then displace the subdivided
#             surface. Only the pass's OWN modifier (the retopo
#             DECIMATE) is ever applied - never an ARMATURE (that
#             would bake the rest pose) and never a GN tree (the
#             variation travels intact).
#
#   RETOPO  - the topology budget pass: DECIMATE (COLLAPSE) every
#             matched mesh toward the kind's triangle budget, then
#             VERIFY the shape survived - bbox dimension drift
#             against the pre-pass state, plus the honest note that
#             collapse decimation removes sculpt grain where the
#             ratio bites hardest. A budget that cannot be honored
#             (ratio floor) is reported, not faked.
#
# Both passes report machine-readable summaries the caller parses:
#   SCULPT_SUMMARY {json} / RETOPO_SUMMARY {json}
#
# Roughness is the evidence: the mean Laplacian magnitude (how far
# each vertex sits from its neighbors' mean) before vs after the
# carve - subdivision alone keeps it LOW, carving raises it - plus
# the displacement the carve applied (mean/max). The audit reads
# those numbers.
# ─────────────────────────────────────────────────────────────

import json
import math


def _u32_frac(x: int) -> float:
    x = (x + 0x6D2B79F5) & 0xFFFFFFFF
    t = x ^ (x >> 15)
    t = (t * (1 | t)) & 0xFFFFFFFF
    t = (t + (t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF
    return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0


def _hash3(ix, iy, iz, seed):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 2654435761) & 0xFFFFFFFF
    return _u32_frac(h)


def _value_noise(x, y, z, seed):
    """Seeded 3D value noise: a hash lattice with smoothstep
    interpolation - deterministic across machines and runs."""
    ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    sz = fz * fz * (3 - 2 * fz)

    def lerp(a, b, t):
        return a + (b - a) * t

    v000 = _hash3(ix, iy, iz, seed)
    v100 = _hash3(ix + 1, iy, iz, seed)
    v010 = _hash3(ix, iy + 1, iz, seed)
    v110 = _hash3(ix + 1, iy + 1, iz, seed)
    v001 = _hash3(ix, iy, iz + 1, seed)
    v101 = _hash3(ix + 1, iy, iz + 1, seed)
    v011 = _hash3(ix, iy + 1, iz + 1, seed)
    v111 = _hash3(ix + 1, iy + 1, iz + 1, seed)
    return lerp(
        lerp(lerp(v000, v100, sx), lerp(v010, v110, sx), sy),
        lerp(lerp(v001, v101, sx), lerp(v011, v111, sx), sy),
        sz,
    )


def _matched_meshes(scn, parts):
    """Mesh objects whose name matches any part pattern (case
   -insensitive contains); an empty pattern list matches every mesh."""
    pats = [p.lower() for p in (parts or []) if str(p).strip()]
    out = []
    for ob in scn.objects:
        if ob.type != "MESH" or not ob.data.vertices:
            continue
        if pats and not any(p in ob.name.lower() for p in pats):
            continue
        out.append(ob)
    return out


def _tri_count_obj(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def _edge_variance(ob):
    """Mean edge-length deviation - kept for the report, but NOT the
    detail evidence: uniform subdivision SHRINKS it (shorter, more
    uniform edges), a carve may not raise it."""
    mesh = ob.data
    if len(mesh.edges) == 0:
        return 0.0
    total = 0.0
    for e in mesh.edges:
        total += (mesh.vertices[e.vertices[0]].co - mesh.vertices[e.vertices[1]].co).length
    mean = total / len(mesh.edges)
    acc = 0.0
    for e in mesh.edges:
        d = (mesh.vertices[e.vertices[0]].co - mesh.vertices[e.vertices[1]].co).length
        acc += (d - mean) ** 2
    return math.sqrt(acc / len(mesh.edges))


def _laplacian_roughness(ob):
    """Mean Laplacian magnitude: for every vertex, how far it sits
    from the mean of its neighbors. A subdivided-but-flat surface
    stays LOW (that is the point of subdivision); a carved surface
    RISES with every layer. This is the detail evidence."""
    mesh = ob.data
    n = len(mesh.vertices)
    if n == 0:
        return 0.0
    neighbors = [[] for _ in range(n)]
    for e in mesh.edges:
        a, b = e.vertices
        neighbors[a].append(b)
        neighbors[b].append(a)
    total = 0.0
    for i, v in enumerate(mesh.vertices):
        nb = neighbors[i]
        if not nb:
            continue
        cx = cy = cz = 0.0
        for j in nb:
            c = mesh.vertices[j].co
            cx += c.x
            cy += c.y
            cz += c.z
        m = len(nb)
        dx = v.co.x - cx / m
        dy = v.co.y - cy / m
        dz = v.co.z - cz / m
        total += math.sqrt(dx * dx + dy * dy + dz * dz)
    return total / n


def _bbox_dims(scn, meshes):
    import mathutils

    mins = [1e9, 1e9, 1e9]
    maxs = [-1e9, -1e9, -1e9]
    for ob in meshes:
        for corner in ob.bound_box:
            wc = ob.matrix_world @ mathutils.Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], wc[i])
                maxs[i] = max(maxs[i], wc[i])
    if mins[0] > 1e8:
        return None
    return [maxs[i] - mins[i] for i in range(3)]


def _apply_named_modifier(bpy, ob, mod_name):
    """Apply exactly one modifier by name (headless-safe context),
    leaving every other modifier - armature rigs, GN trees - alone."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod_name)


def _subdivide_mesh(ob, level):
    """Single-threaded bmesh grid subdivision: deterministic where
    OpenSubdiv's parallel evaluation is not (its float summation
    order varies across runs, so two identical carves would differ
    in the last bits - the seed law cannot tolerate that). cuts =
    2**level, grid-filled; normals are recomputed in the same
    single thread."""
    import bmesh
    cuts = 2 ** int(level)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    bm.normal_update()
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


# Layer-kind base amplitudes (in object units, before the spec's
# intensity): a swell moves mass, a fold creases it, a grain roughs it.
_LAYER_BASE = {"swell": 0.055, "fold": 0.032, "grain": 0.0075}


# Deterministic per-layer seed offsets - NEVER Python's hash(): its
# string hashing is salted per process, which would hand every Blender
# launch a different noise seed and break the seed law.
_LAYER_SEED_OFFSET = {"swell": 1013904223, "fold": 2166136261, "grain": 374761393}


def apply_sculpt(bpy, scn, spec):
    """The SCULPT pass: bmesh-grid subdivision, then layered seeded
    value-noise displacement along normals. Returns (summary, None)
    or (None, error)."""
    try:
        layers = list(spec.get("layers") or [])
        if not layers:
            return None, "sculpt spec carries no layers"
        seed = int(max(0, min(65535, int(spec.get("seed") or 7))))
        subdivision = int(max(0, min(3, int(spec.get("subdivision") or 1))))
        meshes = _matched_meshes(scn, spec.get("parts") or [])
        if not meshes:
            return None, "no meshes matched the sculpt's part patterns"

        tris_before = sum(_tri_count_obj(ob) for ob in meshes)

        touched = 0
        move_total = 0.0
        move_max = 0.0
        move_count = 0
        rough_base_acc = 0.0
        for ob in meshes:
            if subdivision > 0:
                _subdivide_mesh(ob, subdivision)
            # the SUBSTRATE baseline: subdivided (or untouched) but NOT
            # yet carved - the carve must rise ABOVE this to count as
            # detail, since uniform subdivision lowers the Laplacian
            rough_base_acc += _laplacian_roughness(ob)
            for L in layers:
                kind = str(L.get("kind") or "").lower()
                if kind not in _LAYER_BASE:
                    return None, f"unknown sculpt layer kind '{kind}'"
                intensity = float(L.get("intensity") or 1.0)
                intensity = max(0.0, min(2.0, intensity))
                scale = float(L.get("scale") or (1.4 if kind == "swell" else 4.5 if kind == "fold" else 14.0))
                scale = max(0.05, min(60.0, scale))
                amp = _LAYER_BASE[kind] * intensity
                layer_seed = (seed + _LAYER_SEED_OFFSET[kind]) & 0xFFFFFFFF
                for v in ob.data.vertices:
                    n = v.normal
                    if n.length == 0.0:
                        continue
                    p = v.co
                    raw = _value_noise(p.x * scale, p.y * scale, p.z * scale, layer_seed)
                    if kind == "fold":
                        raw = 1.0 - abs(2.0 * raw - 1.0)
                        raw = raw * raw  # sharpen the ridges
                    elif kind == "grain":
                        raw = raw - 0.5
                    else:
                        raw = raw - 0.5
                    d = amp * raw
                    v.co += n * d
                    mag = abs(d)
                    move_total += mag
                    if mag > move_max:
                        move_max = mag
                    move_count += 1
                touched += 1
            ob.data.update()

        tris_after = sum(_tri_count_obj(ob) for ob in meshes)
        rough_after = sum(_laplacian_roughness(ob) for ob in meshes) / len(meshes)
        rough_base = rough_base_acc / len(meshes)
        summary = {
            "parts": [ob.name for ob in meshes],
            "layerCount": len(layers),
            "layersApplied": touched,
            "subdivision": subdivision,
            "seed": seed,
            "trisBefore": tris_before,
            "trisAfter": tris_after,
            "roughnessBase": round(rough_base, 6),
            "roughnessAfter": round(rough_after, 6),
            "roughnessRatio": round(min(rough_after / max(rough_base, 1e-9), 999.0), 3),
            "meanMove": round(move_total / max(move_count, 1), 6),
            "maxMove": round(move_max, 6),
        }
        return summary, None
    except Exception as exc:  # noqa: BLE001
        return None, f"{type(exc).__name__}: {exc}"


def apply_retopo(bpy, scn, spec):
    """The RETOPO pass: collapse-decimate the matched meshes toward a
    triangle budget and verify the shape survived. Returns
    (summary, None) or (None, error)."""
    try:
        budget = int(max(200, min(2_000_000, int(spec.get("budget") or 20_000))))
        meshes = _matched_meshes(scn, spec.get("parts") or [])
        if not meshes:
            return None, "no meshes matched the retopo's part patterns"

        tris_before = sum(_tri_count_obj(ob) for ob in meshes)
        dims_before = _bbox_dims(scn, meshes)

        # The budget distributes across the meshes in proportion to
        # their share of the triangles; a mesh already under its share
        # is left alone (never GROW a mesh to hit a budget).
        total_before = max(tris_before, 1)
        ratio_floor = 0.02
        clamped = False
        for ob in meshes:
            share = max(int(budget * (_tri_count_obj(ob) / total_before)), 12)
            before = _tri_count_obj(ob)
            if before <= share:
                continue
            ratio = max(share / before, ratio_floor)
            if share / before < ratio_floor:
                clamped = True
            mod = ob.modifiers.new("AnimeOSRetopo", "DECIMATE")
            mod.decimate_type = "COLLAPSE"
            mod.ratio = ratio
            mod.use_collapse_triangulate = True
            _apply_named_modifier(bpy, ob, mod.name)

        tris_after = sum(_tri_count_obj(ob) for ob in meshes)
        dims_after = _bbox_dims(scn, meshes)
        drift = 0.0
        if dims_before and dims_after:
            drift = max(abs(a - b) / max(abs(b), 1e-9) for a, b in zip(dims_after, dims_before))
        summary = {
            "parts": [ob.name for ob in meshes],
            "budget": budget,
            "trisBefore": tris_before,
            "trisAfter": tris_after,
            "driftPct": round(drift * 100.0, 3),
            "verified": bool(dims_before and dims_after and drift <= 0.05 and tris_after <= budget),
            "ratioFloorHit": clamped,
        }
        return summary, None
    except Exception as exc:  # noqa: BLE001
        return None, f"{type(exc).__name__}: {exc}"
