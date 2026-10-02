# ─────────────────────────────────────────────────────────────
# AnimeOS BODY ANATOMY LAW (iteration 118 -> 119) - THE MANNEQUIN
# GAINS A BODY, AND THE BODY GAINS A SILHOUETTE.
#
# 118 carved 22 analytic structures into the baked skin; the eye test
# named the honest frontier: the form is present but reads ~1px at
# establishing scale - a wide shot cannot see it. 119's law:
#
#   1. THE SILHOUETTE LEADS. A body reads at ANY scale through its
#      OUTLINE - the deltoid's shoulder cap, the lat's taper under
#      the arm, the trap's neck-shoulder line, the quad's thigh mass,
#      the calf's belly. Structures that move the outline get
#      SILHOUETTE-class amplitudes (the 118 forms, ~2.2x); structures
#      that only model the surface (sternal groove, scapular flats,
#      shin line, knee caps, the forearm ridge) keep SURFACE-class
#      amplitudes. Closeups keep their 118 read; wides finally get
#      one.
#   2. THE WAIST IS CARVED, NOT ADDED. Two oblique fields pull the
#      sides of the torso IN between the ribcage and the pelvis (a
#      NEGATIVE displacement along the outward normals) - the taper
#      that makes a torso read as a torso. The scapular flats keep
#      their gentle back-plane settle.
#   3. THE BODY IS STILL SCULPTED BY A FIELD, NOT BY A MODEL. Each
#      anatomical structure is an analytic 3-D Gaussian anchored in
#      the body graph's own coordinate law displacing along the baked
#      mesh's vertex normals - deterministic, bit-exact, auditable.
#      No noise, no AI, no model memory: the same spec always carves
#      the same body.
#   4. THE SPEC DRIVES THE SCULPT. Amplitude scales with the
#      design's build (lean 0.85 / sturdy 1.0 / heavy 1.1) and the
#      design's gender (the muscle factor softens for a female
#      read). A slim scholar and a heavy brawler do not share a
#      torso. THE SCULPTOR SCALES THE TOOL WITH THE BODY: centers and
#      sigmas ride the layout factors (w/sw/hp) so the brush never
#      slips out from under the surface.
#   5. THE RIG IS UNTOUCHED. The pass runs on the baked AnimeBody
#      BEFORE binding and BEFORE the garment face-kill - the joint
#      anchors, the skin weights and the framing math never see a
#      moved bone.
#   6. THE EVIDENCE IS THE SCULPT AND THE SILHOUETTE. Vertices moved,
#      max/mean displacement, the mean Laplacian before vs after AND
#      the silhouette read: the mesh's width at five landmark heights
#      before vs after the field, in meters and as a fraction of the
#      figure's own height - the "does the body read at establishing
#      scale" question answered in numbers, not vibes.
# ─────────────────────────────────────────────────────────────

import json
import math

ANATOMY_LAW_VERSION = "anatomy-v2"

_BUILD_AMP = {"lean": 0.85, "sturdy": 1.0, "heavy": 1.1}
_GENDER_MUSCLE = {"male": 1.0, "female": 0.6}

# THE SILHOUETTE CLASS: how much louder the outline structures speak
# than they did in 118 (the surface structures keep the 118 voice).
_SILHOUETTE_GAIN = 2.2

# the landmark heights (root-local z) the silhouette read measures.
# An optional third row element caps |x| - the torso landmarks that
# the hanging arms would otherwise dominate are measured INSIDE the
# arms' shadow (the torso's own taper, honestly named in the law).
_LANDMARKS = [
    ("shoulder", 1.50, None),
    ("chest", 1.40, None),
    ("waist", 1.15, 0.16),
    ("hip", 0.95, None),
    ("calf", 0.36, None),
]


def _structures(spec):
    """The anatomical field table. Coordinates are root-local units
    (z up, -y forward) - the SAME space build_body_graph places its
    vertices in. Sigmas are (sx, sy, sz); amp is the max normal
    displacement in meters. Negative amps pull the surface IN (the
    carve: the waist, the grooves, the planes).

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
    pec_amp = (0.009 if female else 0.024) * _BUILD_AMP[b["build"]] * _SILHOUETTE_GAIN

    S = []

    def st(n, cx, cy, cz, sx, sy, sz, a, lat, dep):
        S.append({"n": n, "c": (cx * lat, cy * dep, cz), "s": (sx * lat, sy * dep, sz), "a": a})

    # ── the trunk ──
    # pectoral planes: the chest's front edge is silhouette at wides
    st("pecR", 0.055 * sw, -0.032, 1.405, 0.042, 0.045, 0.05, pec_amp, sw, w)
    st("pecL", -0.055 * sw, -0.032, 1.405, 0.042, 0.045, 0.05, pec_amp, sw, w)
    # sternal groove (the line between the plates) - surface
    st("sternum", 0.0, -0.038, 1.40, 0.018, 0.035, 0.09, -0.012 * (0.4 if female else 1.0), sw, w)
    # trapezius: the neck settles INTO the shoulder - the outline the
    # collar reads
    st("trapR", 0.052 * sw, -0.01, 1.60, 0.05, 0.05, 0.045, 0.016 * muscle * _SILHOUETTE_GAIN, sw, w)
    st("trapL", -0.052 * sw, -0.01, 1.60, 0.05, 0.05, 0.045, 0.016 * muscle * _SILHOUETTE_GAIN, sw, w)
    # latissimus edge (the torso's taper reads under the arm) - silhouette
    st("latR", 0.088 * w, 0.012, 1.28, 0.028, 0.05, 0.075, 0.014 * muscle * _SILHOUETTE_GAIN, sw, w)
    st("latL", -0.088 * w, 0.012, 1.28, 0.028, 0.05, 0.075, 0.014 * muscle * _SILHOUETTE_GAIN, sw, w)
    # THE WAIST IS CARVED: two oblique fields pull the sides in
    # between the ribcage and the pelvis (the negative displacement
    # along the outward normals) - the taper a torso silhouette owns
    waist_amp = -0.016 * (0.8 if female else 1.0) * _BUILD_AMP[b["build"]]
    st("obliqueR", 0.082 * w, 0.0, 1.15, 0.03, 0.045, 0.075, waist_amp, w, w)
    st("obliqueL", -0.082 * w, 0.0, 1.15, 0.03, 0.045, 0.075, waist_amp, w, w)
    # scapular flats (the back is planes, not a tube) - surface
    st("scapR", 0.05 * sw, 0.05, 1.47, 0.042, 0.028, 0.055, -0.008 * frame, sw, w)
    st("scapL", -0.05 * sw, 0.05, 1.47, 0.042, 0.028, 0.055, -0.008 * frame, sw, w)
    # abdominal ridge (subtle center line; a heavy build softens it) - surface
    st("abdomen", 0.0, -0.048, 1.16, 0.032, 0.028, 0.10,
       (0.007 if b["build"] == "heavy" else 0.011) * (0.6 if female else 1.0), sw, w)
    # ── the arms ──
    for sx in (1.0, -1.0):
        side = "R" if sx > 0 else "L"
        ax = sx * 0.24 * sw
        # deltoid cap (the shoulder's roundness, under the sleeve
        # edge) - THE widest line a body owns, silhouette
        st(f"delt{side}", ax, 0.0, 1.505, 0.032, 0.032, 0.05, 0.016 * muscle * _SILHOUETTE_GAIN, sw, w)
        # forearm ridge (the flexor mass tapers to the wrist) - surface
        st(f"fore{side}", ax, -0.012, 1.245, 0.024, 0.028, 0.07, 0.011 * muscle, sw, w)
    # ── the legs ──
    for sx in (1.0, -1.0):
        side = "R" if sx > 0 else "L"
        lx = sx * 0.1 * hp
        # quadriceps (the thigh's mass rides forward-high) - silhouette
        st(f"quad{side}", lx, -0.02, 0.73, 0.038, 0.038, 0.105, 0.018 * muscle * _SILHOUETTE_GAIN, hp, w)
        # knee cap (the joint reads as a knot, not a tube end) - surface
        st(f"knee{side}", lx, -0.042, 0.535, 0.024, 0.02, 0.026, 0.009 * frame, hp, w)
        # calf belly (sharpens the radius graph's own swell) - silhouette
        st(f"calf{side}", lx, -0.022, 0.365, 0.028, 0.032, 0.055, 0.016 * muscle * _SILHOUETTE_GAIN, hp, w)
        # shin line (the tibial edge, front) - surface
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


def _silhouette_widths(verts, band=0.035, x_caps=None):
    """THE SILHOUETTE READ (iteration 119): the mesh's lateral width
    (max x - min x over the verts inside a height band) at each
    landmark. A landmark with an |x| cap measures the torso inside
    the arms' shadow (the hanging arms would own the raw band width
    and the taper would never read). Deterministic, cheap, and it
    answers the wides question: did the OUTLINE move?"""
    x_caps = x_caps or {}
    out = {}
    for name, zc, cap in _LANDMARKS:
        cap_x = x_caps.get(name, cap)
        pool = [v for v in verts if abs(v.co.z - zc) <= band]
        if cap_x is not None:
            pool = [v for v in pool if abs(v.co.x) <= cap_x]
        xs = [v.co.x for v in pool]
        out[name] = round(max(xs) - min(xs), 4) if len(xs) >= 2 else 0.0
    return out


def apply_anatomy(body, spec):
    """Sculpt the anatomical field into the baked body mesh, in place.
    Returns the evidence summary. Deterministic: pure analytic
    evaluation, no noise, no rng."""
    me = body.data
    verts = me.vertices
    # THE SILHOUETTE READ, BEFORE (the 119 evidence needs the deltas)
    silhouette_before = _silhouette_widths(verts)
    figure_h = max(v.co.z for v in verts) - min(v.co.z for v in verts)
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
    # THE SILHOUETTE READ, AFTER: the deltas are the law's honest
    # answer to the wides frontier (meters + fraction of stature)
    silhouette_after = _silhouette_widths(me.vertices, x_caps={"waist": 0.16})
    silhouette = {}
    for name, _zc, _cap in _LANDMARKS:
        before = silhouette_before[name]
        after = silhouette_after[name]
        delta = round(after - before, 4)
        silhouette[name] = {
            "before": before, "after": after, "delta": delta,
            "pctOfStature": round(delta / figure_h * 100.0, 3) if figure_h > 0 else 0.0,
        }
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
        "silhouette": silhouette,
        "stature": round(figure_h, 4),
    }


def dump_summary(summary):
    return json.dumps(summary, sort_keys=True)
