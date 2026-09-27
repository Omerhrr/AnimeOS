# ─────────────────────────────────────────────────────────────
# AnimeOS SURFACE PROBE (iteration 61 - THE SURFACE IS READ
# BEFORE IT IS CARVED)
#
# A deterministic, READ-ONLY bpy pass over an already-built asset
# .blend: the learned layer's eyes. Before any sculpt is planned,
# the mesh is MEASURED - the same evidence law the sculpt pass
# itself obeys (Laplacian roughness, the detail metric the audit
# reads) - so a plan is compiled from what the surface IS, never
# from what the director hopes it is.
#
# The probe measures, per matched mesh and in total:
#   verts, tris          - the substrate's weight
#   bboxDims             - world-space extents (density's denominator)
#   roughness            - mean Laplacian magnitude (how far each
#                          vertex sits from its neighbors' mean);
#                          a flat substrate stays LOW, a carved
#                          surface RISES - the same metric
#                          sculpt_pass.py reports as its evidence
#   roughnessSpread      - the population std of the per-vertex
#                          Laplacian magnitudes (sampled
#                          deterministically, every k-th vertex
#                          index, capped - the spread of the
#                          detail, not just its mean)
#   density              - tris per unit of bbox surface area
#                          (a proxy for how fine the substrate
#                          already is)
#   flatness             - 1 - roughness/flatRef, clamped 0..1: how
#                          close the surface sits to the clean
#                          builder slab (the audit's "unfinished"
#                          read, as a number)
#
# Determinism law: fixed sampling stride (no randomness, no
# dict-order dependence), single-threaded summation in vertex-index
# order - the same .blend always lands the same numbers, bit for
# bit, which is the same standard the sculpt pass was held to when
# OpenSubdiv was rejected.
#
# Output: machine-readable, one line the TS caller parses:
#   SURFACE_READ {json}
# plus the same JSON written to <out>/surface.json for the audit
# trail. The probe opens NO file itself (the runner passes the
# .blend on the command line), saves NOTHING, and never touches a
# modifier - read-only, by law.
# ─────────────────────────────────────────────────────────────

import json
import math
import os
import sys


def _mean_edge(mesh):
    if len(mesh.edges) == 0:
        return 0.0
    total = 0.0
    for e in mesh.edges:
        total += (mesh.vertices[e.vertices[0]].co - mesh.vertices[e.vertices[1]].co).length
    return total / len(mesh.edges)


def _laplacian_field(mesh, sample_stride):
    """Per-vertex Laplacian magnitudes (sampled by fixed stride) +
    the full-population mean. Single-threaded, vertex-index order:
    bit-exact across runs."""
    n = len(mesh.vertices)
    if n == 0:
        return 0.0, 0.0, 0, []
    neighbors = [[] for _ in range(n)]
    for e in mesh.edges:
        a, b = e.vertices
        neighbors[a].append(b)
        neighbors[b].append(a)
    total = 0.0
    mags = []
    for i in range(n):
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
        dx = mesh.vertices[i].co.x - cx / m
        dy = mesh.vertices[i].co.y - cy / m
        dz = mesh.vertices[i].co.z - cz / m
        mag = math.sqrt(dx * dx + dy * dy + dz * dz)
        total += mag
        mags.append(mag)
    mean = total / max(n, 1)
    # deterministic sample: every k-th entry of the vertex-index-ordered
    # magnitudes, stride fixed so the sample never depends on runtime
    sample = mags[::sample_stride]
    if len(sample) > 4096:
        sample = sample[:4096]
    if len(sample) < 2:
        return mean, 0.0, n, sample
    s_mean = sum(sample) / len(sample)
    acc = 0.0
    for v in sample:
        acc += (v - s_mean) ** 2
    return mean, math.sqrt(acc / len(sample)), n, sample


def _bbox_dims(objs):
    import mathutils

    mins = [1e9, 1e9, 1e9]
    maxs = [-1e9, -1e9, -1e9]
    for ob in objs:
        for corner in ob.bound_box:
            wc = ob.matrix_world @ mathutils.Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], wc[i])
                maxs[i] = max(maxs[i], wc[i])
    if mins[0] > 1e8:
        return None
    return [maxs[i] - mins[i] for i in range(3)]


def _tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def probe(out_path):
    import bpy

    meshes = [ob for ob in bpy.data.objects if ob.type == "MESH" and ob.data.vertices]
    if not meshes:
        return {"error": "no meshes in the file - nothing to read"}
    parts = []
    for ob in meshes:
        rough_mean, rough_spread, verts, _sample = _laplacian_field(ob.data, sample_stride=7)
        tris = _tri_count(ob)
        dims = _bbox_dims([ob]) or [0.0, 0.0, 0.0]
        area = 2.0 * (dims[0] * dims[1] + dims[1] * dims[2] + dims[0] * dims[2])
        edge = _mean_edge(ob.data)
        # the SCALE-FREE detail number: Laplacian roughness divided by
        # the mean edge length - raw roughness is dominated by the
        # substrate's own resolution (a coarse cube's corners read huge),
        # the ratio reads the SURFACE, not the sampling grid
        relative = rough_mean / max(edge, 1e-6)
        parts.append({
            "name": ob.name,
            "verts": verts,
            "tris": tris,
            "bboxDims": [round(d, 4) for d in dims],
            "roughness": round(rough_mean, 6),
            "roughnessSpread": round(rough_spread, 6),
            "meanEdge": round(edge, 6),
            "relativeRoughness": round(relative, 6),
            "density": round(tris / max(area, 1e-9), 3),
        })
    total_tris = sum(p["tris"] for p in parts)
    total_verts = sum(p["verts"] for p in parts)
    dims = _bbox_dims(meshes)
    area = 2.0 * (
        dims[0] * dims[1] + dims[1] * dims[2] + dims[0] * dims[2]
    ) if dims else 0.0
    # the surface's headline roughness: triangle-weighted mean of the
    # parts' own numbers (a 12-vertex slab should not outvote the hide)
    weight = max(total_tris, 1)
    rough_mean = sum(p["roughness"] * p["tris"] for p in parts) / weight
    rough_spread = sum(p["roughnessSpread"] * p["tris"] for p in parts) / weight
    relative = sum(p["relativeRoughness"] * p["tris"] for p in parts) / weight
    # flatness from the SCALE-FREE number: the relative roughness of a
    # carved surface sits far below a coarse slab's corner-dominated
    # read; RELATIVE_FLAT_REF is the calibrated slab read
    RELATIVE_FLAT_REF = 0.5
    flatness = max(0.0, min(1.0, 1.0 - relative / RELATIVE_FLAT_REF))
    read = {
        "parts": parts,
        "total": {
            "objects": len(meshes),
            "verts": total_verts,
            "tris": total_tris,
            "bboxDims": [round(d, 4) for d in dims] if dims else None,
            "roughness": round(rough_mean, 6),
            "roughnessSpread": round(rough_spread, 6),
            "relativeRoughness": round(relative, 6),
            "density": round(total_tris / max(area, 1e-9), 3),
            "flatness": round(flatness, 4),
        },
        "flatRef": RELATIVE_FLAT_REF,
    }
    with open(out_path, "w") as f:
        json.dump(read, f)
    print("SURFACE_READ " + json.dumps(read))
    return read


def main():
    args = sys.argv
    if "--" not in args:
        print("SURFACE_READ " + json.dumps({"error": "no --out given"}))
        return
    tail = args[args.index("--") + 1:]
    out = None
    i = 0
    while i < len(tail) - 1:
        if tail[i] == "--out":
            out = tail[i + 1]
        i += 2
    if not out:
        print("SURFACE_READ " + json.dumps({"error": "no --out given"}))
        return
    os.makedirs(out, exist_ok=True)
    probe(os.path.join(out, "surface.json"))


main()
