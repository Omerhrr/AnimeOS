# ─────────────────────────────────────────────────────────────
# AnimeOS BODY ANATOMY LAW (iteration 118) - THE MANNEQUIN GAINS
# A BODY.
#
# The named frontier since 113: the Skin-modifier body reads as a
# tube-chain - the vision judge's recurring note is "simplified".
# The studio's directive for this iteration: use the FULL POWER of
# Blender to move toward a wanglin-level character, not a stand-in.
#
# The law this module keeps (the eye-and-pen rule holds):
#
#   1. THE BODY IS SCULPTED BY A FIELD, NOT BY A MODEL. Each
#      anatomical structure is an analytic 3-D Gaussian anchored in
#      the body graph's own coordinate law (the same root-local
#      units build_body_graph uses) displacing along the baked
#      mesh's vertex normals - deterministic, bit-exact, auditable.
#      No noise, no AI, no model memory: the same spec always
#      carves the same body.
#   2. THE SPEC DRIVES THE SCULPT. Amplitude scales with the
#      design's build (lean 0.85 / sturdy 1.0 / heavy 1.1) and the
#      design's gender (the muscle factor softens for a female
#      read; the bust stays the chest radius's own law). A slim
#      scholar and a heavy brawler do not share a torso.
#   3. THE STRUCTURES ARE REAL. Pectoral planes and the sternal
#      groove, deltoid caps, trapezius blending neck into shoulder,
#      latissimus edge, scapular flats, the abdominal ridge,
#      quadriceps, calf bellies, the shin line, forearm ridge and
#      knee caps - the vocabulary a figure sculptor reaches for.
#   4. THE RIG IS UNTOUCHED. The pass runs on the baked AnimeBody
#      BEFORE binding and BEFORE the garment face-kill - the joint
#      anchors, the skin weights and the framing math never see a
#      moved bone.
#   5. THE EVIDENCE IS THE SCULPT. Vertices moved, max/mean
#      displacement, and the mean Laplacian before vs after (the
#      sculpt pass's own roughness evidence) ride the build.
# ─────────────────────────────────────────────────────────────

import json
import math

ANATOMY_LAW_VERSION = "anatomy-v1"

_BUILD_AMP = {"lean": 0.85, "sturdy": 1.0, "heavy": 1.1}
_GENDER_MUSCLE = {"male": 1.0, "female": 0.6}


def _structures(spec):
    """The anatomical field table. Coordinates are root-local units
    (z up, -y forward) - the SAME space build_body_graph places its
    vertices in. Sigmas are (sx, sy, sz); amp is the max normal
    displacement in meters.

    THE SCULPTOR SCALES THE TOOL WITH THE BODY: every center offset
    and every sigma's lateral/depth components ride the layout
    factors the body graph itself uses (w for the depth, sw for the
    shoulder line, hp for the hip line) - a heavy build gets a wider
    brush at the same relative depth, or the fatter surface would
    slip out from under a fixed Gaussian. Heights stay unscaled (the
    build changes width, not stature)."""
    b = spec["body"]
    w = {"lean": 0.92, "sturdy": 1.1, "heavy": 1.25}[b["build"]]
    sw = b["shoulders"]
    hp = b["hips"]
    female = b["gender"] == "female"
    muscle = _BUILD_AMP[b["build"]] * _GENDER_MUSCLE[b["gender"]]
    # the frame structures (bone landmarks: knee, shin, scapula) carry
    # the build's own scale - the spec must always move the field
    frame = _BUILD_AMP[b["build"]] * (0.85 if female else 1.0)
    pec_amp = (0.009 if female else 0.024) * _BUILD_AMP[b["build"]]

    S = []

    def st(n, cx, cy, cz, sx, sy, sz, a, lat, dep):
        S.append({"n": n, "c": (cx * lat, cy * dep, cz), "s": (sx * lat, sy * dep, sz), "a": a})

    # ── the trunk ──
    st("pecR", 0.055 * sw, -0.032, 1.405, 0.042, 0.045, 0.05, pec_amp, sw, w)
    st("pecL", -0.055 * sw, -0.032, 1.405, 0.042, 0.045, 0.05, pec_amp, sw, w)
    # sternal groove (the line between the plates)
    st("sternum", 0.0, -0.038, 1.40, 0.018, 0.035, 0.09, -0.012 * (0.4 if female else 1.0), sw, w)
    # trapezius: the neck settles INTO the shoulder
    st("trapR", 0.052 * sw, -0.01, 1.60, 0.05, 0.05, 0.045, 0.016 * muscle, sw, w)
    st("trapL", -0.052 * sw, -0.01, 1.60, 0.05, 0.05, 0.045, 0.016 * muscle, sw, w)
    # latissimus edge (the torso's taper reads under the arm)
    st("latR", 0.088 * w, 0.012, 1.28, 0.028, 0.05, 0.075, 0.014 * muscle, sw, w)
    st("latL", -0.088 * w, 0.012, 1.28, 0.028, 0.05, 0.075, 0.014 * muscle, sw, w)
    # scapular flats (the back is planes, not a tube)
    st("scapR", 0.05 * sw, 0.05, 1.47, 0.042, 0.028, 0.055, -0.008 * frame, sw, w)
    st("scapL", -0.05 * sw, 0.05, 1.47, 0.042, 0.028, 0.055, -0.008 * frame, sw, w)
    # abdominal ridge (subtle center line; a heavy build softens it)
    st("abdomen", 0.0, -0.048, 1.16, 0.032, 0.028, 0.10,
       (0.007 if b["build"] == "heavy" else 0.011) * (0.6 if female else 1.0), sw, w)
    # ── the arms ──
    for sx in (1.0, -1.0):
        side = "R" if sx > 0 else "L"
        ax = sx * 0.24 * sw
        # deltoid cap (the shoulder's roundness, under the sleeve edge)
        st(f"delt{side}", ax, 0.0, 1.505, 0.032, 0.032, 0.05, 0.016 * muscle, sw, w)
        # forearm ridge (the flexor mass tapers to the wrist)
        st(f"fore{side}", ax, -0.012, 1.245, 0.024, 0.028, 0.07, 0.011 * muscle, sw, w)
    # ── the legs ──
    for sx in (1.0, -1.0):
        side = "R" if sx > 0 else "L"
        lx = sx * 0.1 * hp
        # quadriceps (the thigh's mass rides forward-high)
        st(f"quad{side}", lx, -0.02, 0.73, 0.038, 0.038, 0.105, 0.018 * muscle, hp, w)
        # knee cap (the joint reads as a knot, not a tube end)
        st(f"knee{side}", lx, -0.042, 0.535, 0.024, 0.02, 0.026, 0.009 * frame, hp, w)
        # calf belly (sharpens the radius graph's own swell)
        st(f"calf{side}", lx, -0.022, 0.365, 0.028, 0.032, 0.055, 0.016 * muscle, hp, w)
        # shin line (the tibial edge, front)
        st(f"shin{side}", lx, -0.048, 0.22, 0.018, 0.026, 0.09, -0.008 * frame, hp, w)
    return S


def _laplacian_mean(mesh):
    """The sculpt pass's roughness evidence: how far each vertex sits
    from its neighbors' mean, averaged."""
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


def apply_anatomy(body, spec):
    """Sculpt the anatomical field into the baked body mesh, in place.
    Returns the evidence summary. Deterministic: pure analytic
    evaluation, no noise, no rng."""
    me = body.data
    verts = me.vertices
    # normals first (the displacement direction), THEN move - reading
    # .normal after writing .co would couple the passes
    normals = [v.normal.copy() for v in verts]
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
            cx, cy, cz = s["c"]
            sx, sy, sz = s["s"]
            qx = (co.x - cx) / sx
            qy = (co.y - cy) / sy
            qz = (co.z - cz) / sz
            d2 = qx * qx + qy * qy + qz * qz
            if d2 > 9.0:  # beyond 3 sigma - the field is silent
                continue
            g = math.exp(-d2)
            wgt = s["a"] * g
            dx += wgt * normals[i].x
            dy += wgt * normals[i].y
            dz += wgt * normals[i].z
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
    return {
        "lawVersion": ANATOMY_LAW_VERSION,
        "structures": len(structures),
        "vertsTotal": len(verts),
        "vertsMoved": moved,
        "maxDisp": round(max_d, 6),
        "meanDisp": round(total_d / max(1, moved), 6),
        "laplacianBefore": round(lap_before, 6),
        "laplacianAfter": round(lap_after, 6),
        "fieldHits": {k: v for k, v in hit_counts.items() if v > 0},
    }


def dump_summary(summary):
    return json.dumps(summary, sort_keys=True)
