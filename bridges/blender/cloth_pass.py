"""cloth_pass - v10.0 SOLVER-GRADE CLOTH: THE CLOTH IS SOLVED.

The figure's cloth parts (sash tail, sleeves, cuffs, skirt panels)
graduate from the damped-spring pivots to the REAL Blender cloth
solver. The studio's deterministic air model - the grammar's wind
calls, the active beat's blocking energy, the beat-boundary impulses,
the body's stagger jerk - rotates each part's ANCHOR BONE per frame;
the Armature -> Subsurf -> Cloth modifier stack turns that anchor
motion into real solver dynamics: lag, folds and follow-through no
spring can fake. Hair keeps the damped springs.

The law was probed first (tmp/cloth_probe.py, real Blender 4.3.2; re-verified under 5.2.2 LTS at the runtime upgrade):
the pin convention (weight 1 pins), a held storm swinging the tip
5.3 cm against the calm hold's 0.2 cm, pairwise-distance span proving
real deformation, bit-exact determinism across rebuilds, and a walk
cost of ~3 ms/frame per part. Shape keys were probed and REJECTED
(they freeze the cloth cache); the headless WIND effector was probed
and REJECTED (unreliable force direction in background renders). The
armature anchor is the canonical film pipeline and evaluates natively.

Deterministic: every anchor angle is a pure function of the frame, the
grammar and the published stagger - the same grammar always lands the
same cloth.
"""

import math

from mathutils import Matrix, Vector

# the kinds that ride the solver - HAIR stays on the springs
CLOTH_KINDS = ("CLOTH", "SKIRT")

# per-kind solver tuning (probe-calibrated)
KIND_SETTINGS = {
    "CLOTH": {"quality": 8, "mass": 0.25, "tension": 12.0, "compression": 10.0,
              "shear": 8.0, "bending": 0.3, "air_damping": 1.6},
    "SKIRT": {"quality": 6, "mass": 0.30, "tension": 15.0, "compression": 12.0,
              "shear": 10.0, "bending": 0.5, "air_damping": 1.8},
}

ANCHOR_MAX = 0.85       # rad - the anchor never folds the garment past this
KICK_IMPULSE = 1.2      # the beat-boundary impulse into the anchor spring
KICK_STIFF = 34.0
KICK_DAMP = 7.0
KICK_MAX = 0.35
STAGGER_ANGLE = 0.45    # the body's jerk sways the anchors

# v10.1 THE SOLVER ANSWERS THE CALL: the director's per-shot CLOTH
# call (a number 0..1) scales the solver's ANSWER - the directed air,
# the beat impulse, the stagger sway - never its physics (mass,
# stiffness and the pin law stay probed). Absent = 1.0, the full
# probed response; 0 is a stillness call (the anchors hold, the
# solver still settles the garment under gravity). Deterministic:
# the same call on the same grammar always lands the same cloth.


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def build_cloth_rig(bpy, scn, figure, chains, frames_total):
    """Graduate every qualifying cloth chain to the real solver: bake the
    part's scale, pin its top band (weight 1 pins - probed law), hang a
    one-bone ANCHOR ARMATURE from the same pivot (so it rides the pose),
    and stack Armature -> Subsurf -> Cloth on the mesh. Simmed chains are
    marked (their spring pivot freezes); hair and refusals keep the
    springs. Returns the rig (or None when nothing qualified - honest)."""
    if not chains:
        return None
    parts = []
    notes = []
    for ch in chains:
        if ch.get("kind") not in CLOTH_KINDS:
            continue
        ob = ch.get("ob")
        if ob is None or ob.type != "MESH":
            continue
        if any(m.type == "CLOTH" for m in ob.modifiers):
            notes.append(f"{ob.name} already carries a solver - spring keeps it")
            continue
        me = ob.data
        if len(me.vertices) < 6:
            notes.append(f"{ob.name} too coarse to solve ({len(me.vertices)} verts) - spring keeps it")
            continue
        # bake the scale so the solver sees real-world dimensions (the
        # z-range below is measured on the BAKED mesh)
        if abs(ob.scale.x - 1.0) > 1e-9 or abs(ob.scale.y - 1.0) > 1e-9 or abs(ob.scale.z - 1.0) > 1e-9:
            me.transform(Matrix.Diagonal((*ob.scale, 1.0)))
            ob.scale = (1.0, 1.0, 1.0)
        zs = [v.co.z for v in me.vertices]
        zmax, zmin = max(zs), min(zs)
        if zmax - zmin < 1e-4:
            notes.append(f"{ob.name} has no height to pin - spring keeps it")
            continue
        band_z = zmax - 0.30 * (zmax - zmin)
        hang_z = zmin + 0.15 * (zmax - zmin)
        # the mesh hangs at ob.location within the pivot's space (the
        # rig re-hung it); the anchor bone lives in that same space
        anchor_x, anchor_y, base_z = ob.location.x, ob.location.y, ob.location.z
        pin = ob.vertex_groups.new(name="Pin")     # the cloth pin group
        air = ob.vertex_groups.new(name="Air")     # the armature deform group
        for v in me.vertices:
            if v.co.z > band_z:
                pin.add([v.index], 1.0, "REPLACE")
                air.add([v.index], 1.0, "REPLACE")
            else:
                pin.add([v.index], 0.0, "REPLACE")
        # the ANCHOR: one bone from the hang point up through the band,
        # parented to the part's own pivot so it rides the body's pose
        bpy.ops.object.armature_add(location=(0.0, 0.0, 0.0))
        arm_ob = bpy.context.active_object
        arm_ob.name = f"AirArm_{ob.name}"
        arm = arm_ob.data
        bpy.ops.object.mode_set(mode="EDIT")
        eb = arm.edit_bones[0]
        eb.head = (anchor_x, anchor_y, base_z + hang_z)
        eb.tail = (anchor_x, anchor_y, base_z + zmax + 0.02)
        eb.name = "Air"
        bpy.ops.object.mode_set(mode="OBJECT")
        arm_ob.display_type = "WIRE"
        arm_ob.hide_render = True
        arm_ob.parent = ch["piv"]
        arm_mod = ob.modifiers.new("AirAnchor", "ARMATURE")
        arm_mod.object = arm_ob
        arm_mod.use_vertex_groups = True
        sub = ob.modifiers.new("Subd", "SUBSURF")
        sub.levels = 2
        sub.render_levels = 2
        cloth = ob.modifiers.new("Cloth", "CLOTH")
        tune = KIND_SETTINGS[ch["kind"]]
        st = cloth.settings
        st.vertex_group_mass = "Pin"
        st.quality = tune["quality"]
        st.mass = tune["mass"]
        st.tension_stiffness = tune["tension"]
        st.compression_stiffness = tune["compression"]
        st.shear_stiffness = tune["shear"]
        st.bending_stiffness = tune["bending"]
        st.air_damping = tune["air_damping"]
        st.effector_weights.gravity = 1.0
        st.effector_weights.wind = 0.0
        cloth.collision_settings.use_self_collision = False
        cloth.point_cache.frame_start = 1
        cloth.point_cache.frame_end = max(2, int(frames_total))
        bone = arm_ob.pose.bones["Air"]
        parts.append({
            "name": ob.name,
            "kind": ch["kind"],
            "gain": ch["gain"],
            "phase": ch["phase"],
            "bone": bone,
            "rest": bone.matrix.copy(),
            "head": Vector(arm.bones["Air"].head_local),
            "ka": 0.0,
            "kv": 0.0,
        })
        ch["sim"] = True   # freeze this chain's spring pivot
    if not parts:
        if notes:
            return {"parts": [], "notes": notes, "prev_beat": -1, "max_sway": 0.0}
        return None
    return {"parts": parts, "notes": notes, "prev_beat": -1, "max_sway": 0.0}


def apply_cloth_frame(rig, figure, t_sec, dt, beat_idx, wind, agit, kick, intensity=1.0):
    """Drive every part's anchor bone for this frame with the SAME
    deterministic air the springs ride: the beat's wind call and
    blocking energy, a phased per-part gust (the panels never flap in
    lockstep), the beat-boundary impulse through a damped anchor
    spring, and the body's published stagger jerk.

    v10.1: the director's CLOTH call (intensity 0..1) scales the
    solver's ANSWER - every directed term answers at the called
    intensity; the solver's physics stay probed law. A stillness call
    (0) holds the anchors near rest while the solver settles the
    garment under gravity - stillness, not a frozen cache."""
    if not rig or not rig["parts"]:
        return
    intensity = clamp(float(intensity), 0.0, 1.0)
    if beat_idx != rig["prev_beat"]:
        if rig["prev_beat"] >= 0:
            kick = max(kick, 0.3)   # a cut stirs the air - same as the springs
        rig["prev_beat"] = beat_idx
    kick = kick * intensity   # the call scales the impulse too
    stg = figure.get("_stagger") if figure else None
    jerk = min(1.0, float((stg or {}).get("jerk") or 0.0) / 1.4) * intensity
    svx = float((stg or {}).get("vx") or 0.0)
    drive = (wind * 1.45 + agit * 0.45 + 0.12) * intensity   # ambient life answers the call too
    for p in rig["parts"]:
        gain, phase = p["gain"], p["phase"]
        # the directed air: the held call plus the per-part gust
        # (every term answers at the called intensity - the wind's
        # direct pull, the gust's amplitude, the lateral breath)
        ax = wind * intensity * 0.9 * gain + drive * gain * 0.10 * (1.0 + math.sin(t_sec * 2.4 + phase))
        ay = 0.35 * gain * math.sin(t_sec * 1.7 + phase) * (0.3 + wind * intensity)
        # the beat-boundary impulse through the anchor spring
        p["kv"] += kick * gain * KICK_IMPULSE * (0.7 + 0.3 * math.sin(phase))
        p["kv"] += (-KICK_STIFF * p["ka"] - KICK_DAMP * p["kv"]) * dt
        p["ka"] = clamp(p["ka"] + p["kv"] * dt, -KICK_MAX, KICK_MAX)
        ax += p["ka"] * 0.7
        ay += p["ka"] * 0.4
        # the body answers the violence: the stagger sways the anchors
        if jerk > 0.0:
            ax += jerk * STAGGER_ANGLE * gain * (0.7 + 0.3 * math.sin(phase))
            ay += min(0.3, abs(svx) * 0.5) * intensity * gain
        ax = clamp(ax, -ANCHOR_MAX, ANCHOR_MAX)
        ay = clamp(ay, -ANCHOR_MAX * 0.6, ANCHOR_MAX * 0.6)
        to_h = Matrix.Translation(p["head"])
        r = Matrix.Rotation(ax, 4, "X") @ Matrix.Rotation(ay, 4, "Y")
        p["bone"].matrix = to_h @ r @ to_h.inverted() @ p["rest"]
        sway = max(abs(ax), abs(ay))
        if sway > rig["max_sway"]:
            rig["max_sway"] = sway
