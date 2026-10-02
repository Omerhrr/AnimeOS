# ─────────────────────────────────────────────────────────────
# AnimeOS FACE ANATOMY LAW (iteration 120) - THE HEAD GAINS A FACE.
#
# The body gained its anatomy in 118 and its silhouette in 119; the
# face stayed a smooth skull with PAINTED features - the honest
# frontier the 119 night named: "the Wang Lin-grade FACE (the sculpts
# own the body; the face is the next mountain)". This module is the
# mountain's first ledge:
#
#   1. THE FACE IS SCULPTED BY A FIELD, NOT BY A MODEL. Every
#      structure is an analytic 3-D Gaussian anchored in the head's
#      own coordinate law (the same space _head_point builds the
#      skull in), displacing along the mesh's vertex normals -
#      deterministic, bit-exact, auditable. No noise, no AI, no model
#      memory: the same spec always carves the same face.
#   2. THE STRUCTURES A FACE OWNS. The brow ridge the eyes sit under,
#      the sockets the eyes sit IN, the nose bridge the profile line
#      reads, the nose tip it ends in, the cheekbones the light
#      lands on, the two lips, the chin the jawline falls to, the
#      jaw edges that sharpen the lower face, the temples that settle
#      behind the brow, the philtrum groove between nose and lip.
#   3. THE SPEC DRIVES THE CARVE. A male face carries a heavier brow
#      and a harder jaw; a female face carries higher cheeks and
#      softer lips; the angular shape carves the jaw, the round shape
#      lifts the cheeks; chinFwd and jawTaper scale the chin and the
#      jaw edge. A scholar and a warlord do not share a face.
#   4. THE TERMINATOR LAW IS UNTOUCHED. The sculpt moves GEOMETRY -
#      the sphere-transferred shading normals (the clean anime toon
#      band, iteration 113) stay exactly as they were; the face reads
#      through its profile and its outline, the way anime faces do.
#   5. THE PAINT RIDES THE SCULPT. The decal planes shrinkwrap onto
#      the head live (the OnFace modifier), so the painted eyes settle
#      INTO the carved sockets and the painted mouth rides the lips -
#      the drawn features and the form agree.
#   6. THE EVIDENCE IS THE PROFILE. Vertices moved, max/mean
#      displacement, the Laplacian before vs after AND the front
#      profile read: how proud of the face plane the nose bridge, the
#      nose tip, the brow and the chin stand, before vs after, in
#      millimeters - the "does the face read" question answered in
#      numbers, not vibes.
# ─────────────────────────────────────────────────────────────

import json
import math

FACE_LAW_VERSION = "face-v1"


def _structures(spec):
    """The facial field table in HEAD-LOCAL units scaled by headScale
    (the same space build_head places its vertices in: the face plane
    fronts at y ~ -0.105, the eye line rides z 0.128, the mouth line
    z 0.062). Sigmas are (sx, sy, sz); amp is the max normal
    displacement in meters. Negative amps carve (sockets, jaw edge,
    temples, philtrum)."""
    hs = spec["body"]["headScale"]
    gender = spec["body"]["gender"]
    shape = spec["face"]["shape"]
    jaw_taper = spec["face"]["jawTaper"]
    chin_fwd = spec["face"]["chinFwd"]
    cheek = spec["face"]["cheek"]

    brow_g = 1.5 if gender == "male" else 0.9
    jaw_g = 1.35 if gender == "male" else 0.85
    lip_g = 0.75 if gender == "male" else 1.15
    cheek_g = 0.9 if gender == "male" else 1.15
    if shape == "angular":
        jaw_g *= 1.2
    elif shape == "round":
        jaw_g *= 0.8
        cheek_g *= 1.15
    jaw_t = 0.7 + 0.6 * (1.0 - jaw_taper) / 0.45   # a sharper taper carves deeper
    chin_s = 0.6 + (chin_fwd / 0.05) * 0.8

    S = []

    def st(n, cx, cy, cz, sx, sy, sz, a):
        S.append({"n": n, "c": (cx * hs, cy * hs, cz * hs),
                  "s": (sx * hs, sy * hs, sz * hs), "a": a * hs})

    # ── the midline ──
    st("noseBridge", 0.0, -0.102, 0.115, 0.014, 0.014, 0.042, 0.0042)
    st("noseTip", 0.0, -0.113, 0.088, 0.012, 0.012, 0.013, 0.0032)
    st("upperLip", 0.0, -0.106, 0.068, 0.018, 0.009, 0.008, 0.0013 * lip_g)
    st("lowerLip", 0.0, -0.104, 0.054, 0.016, 0.009, 0.008, 0.0011 * lip_g)
    st("philtrum", 0.0, -0.109, 0.078, 0.008, 0.008, 0.010, -0.0006)
    st("chin", 0.0, -0.104, 0.040, 0.020, 0.018, 0.016, 0.0026 * chin_s)
    # ── the pairs ──
    for sgn in (1.0, -1.0):
        side = "R" if sgn > 0 else "L"
        st(f"brow{side}", sgn * 0.048, -0.096, 0.175, 0.030, 0.018, 0.020, 0.0035 * brow_g)
        st(f"socket{side}", sgn * 0.048, -0.100, 0.135, 0.026, 0.016, 0.020, -0.0022)
        st(f"cheek{side}", sgn * 0.060, -0.080, 0.118, 0.026, 0.030, 0.024, 0.0030 * cheek_g * cheek)
        st(f"jaw{side}", sgn * 0.052, -0.045, 0.062, 0.024, 0.034, 0.028, -0.0020 * jaw_g * jaw_t)
        st(f"temple{side}", sgn * 0.070, -0.030, 0.158, 0.026, 0.030, 0.028, -0.0012)
    return S


def _laplacian_mean(mesh):
    """The sculpt pass's roughness evidence (the body anatomy's own
    measure, reused so one law speaks one language)."""
    import bmesh
    from mathutils import Vector

    bm = bmesh.new()
    bm.from_mesh(mesh)
    total = 0.0
    count = 0
    for v in bm.verts:
        if not v.link_edges:
            continue
        acc = Vector((0.0, 0.0, 0.0))
        for e in v.link_edges:
            acc += e.other_vert(v).co
        n = acc / len(v.link_edges)
        total += (v.co - n).length
        count += 1
    bm.free()
    return total / max(1, count)


def _front_profile(verts, hs):
    """THE PROFILE READ: how proud of the face plane the midline
    features stand - min y over the near-midline, front-facing verts
    inside each feature's height band. Deterministic, cheap, and it
    answers the profile question (the duel is fought in profile: the
    nose bridge IS the silhouette there)."""
    bands = [
        ("brow", 0.175, 0.018),
        ("noseBridge", 0.115, 0.014),
        ("noseTip", 0.088, 0.012),
        ("chin", 0.040, 0.014),
    ]
    out = {}
    for name, zc, half in bands:
        pool = [v.co.y for v in verts
                if abs(v.co.z - zc * hs) <= half * hs
                and abs(v.co.x) <= 0.016 * hs and v.co.y < -0.04 * hs]
        out[name] = round(min(pool), 5) if pool else 0.0
    return out


def apply_face_anatomy(head, spec):
    """Sculpt the facial field into the head mesh, in place. Returns
    the evidence summary. Deterministic: pure analytic evaluation, no
    noise, no rng."""
    me = head.data
    verts = me.vertices
    hs = spec["body"]["headScale"]
    profile_before = _front_profile(verts, hs)
    # THE HEAD'S STORED NORMALS POINT INWARD (the from_pydata ring
    # winding; the render never noticed because the shading rides the
    # sphere proxy's transferred normals) - the sculpt needs OUTWARD:
    # flip each normal to agree with the centroid-radial direction
    # (the skull is convex enough that the test never lies on the
    # face's own structures). Deterministic, no mesh mutation.
    n = len(verts)
    cx = sum(v.co.x for v in verts) / n
    cy = sum(v.co.y for v in verts) / n
    cz = sum(v.co.z for v in verts) / n
    normals = []
    for v in verts:
        nx, ny, nz = v.normal.x, v.normal.y, v.normal.z
        if (v.co.x - cx) * nx + (v.co.y - cy) * ny + (v.co.z - cz) * nz < 0.0:
            nx, ny, nz = -nx, -ny, -nz
        normals.append((nx, ny, nz))
    cos = [v.co.copy() for v in verts]
    structures = _structures(spec)
    moved = 0
    max_d = 0.0
    total_d = 0.0
    hit_counts = {s["n"]: 0 for s in structures}
    for i, v in enumerate(verts):
        co = cos[i]
        dx = dy = dz = 0.0
        for s in structures:
            cx2, cy2, cz2 = s["c"]
            sx, sy, sz = s["s"]
            qx = (co.x - cx2) / sx
            qy = (co.y - cy2) / sy
            qz = (co.z - cz2) / sz
            d2 = qx * qx + qy * qy + qz * qz
            if d2 > 9.0:  # beyond 3 sigma - the field is silent
                continue
            g = math.exp(-d2)
            wgt = s["a"] * g
            dx += wgt * normals[i][0]
            dy += wgt * normals[i][1]
            dz += wgt * normals[i][2]
            if g > 0.011:
                hit_counts[s["n"]] += 1
        disp = math.sqrt(dx * dx + dy * dy + dz * dz)
        if disp > 1e-6:
            v.co = (co.x + dx, co.y + dy, co.z + dz)
            moved += 1
            max_d = max(max_d, disp)
            total_d += disp
    lap_before = _laplacian_mean(me)
    me.update()
    lap_after = _laplacian_mean(me)
    profile_after = _front_profile(me.vertices, hs)
    profile = {}
    for name, _zc, _half in bands_of():
        before = profile_before[name]
        after = profile_after[name]
        profile[name] = {
            "before": before, "after": after,
            # positive = the feature stands PROUD of where it stood
            # (the front plane's y grows more negative as the form
            # steps out - the nose's own direction)
            "proudMm": round((before - after) * 1000.0, 3),
        }
    return {
        "lawVersion": FACE_LAW_VERSION,
        "structures": len(structures),
        "vertsTotal": len(verts),
        "vertsMoved": moved,
        "maxDisp": round(max_d, 6),
        "meanDisp": round(total_d / max(1, moved), 6),
        "laplacianBefore": round(lap_before, 6),
        "laplacianAfter": round(lap_after, 6),
        "fieldHits": {k: v for k, v in hit_counts.items() if v > 0},
        "profile": profile,
    }


def bands_of():
    """The profile bands (name, z-center, half-width) in head-local
    units - the same table _front_profile reads."""
    return [
        ("brow", 0.175, 0.018),
        ("noseBridge", 0.115, 0.014),
        ("noseTip", 0.088, 0.012),
        ("chin", 0.040, 0.014),
    ]


def dump_summary(summary):
    return json.dumps(summary, sort_keys=True)
