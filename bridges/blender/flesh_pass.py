"""flesh_pass - v11.0 SOLVER-GRADE FLESH: THE FLESH LAGS THE BEAT.

The figure's FLESH layer - the trunk volume (Torso/TorsoMesh) and the
face volume (HeadMesh) - graduates from rigid geometry to the REAL
Blender soft-body solver. The studio's deterministic air model - the
grammar's wind calls, the beat-boundary impulses, the body's published
stagger - rotates each region's ANCHOR BONE per frame; the
Armature -> Subsurf -> SoftBody stack turns that directed input into
real solver dynamics: inertia lag, overshoot and settle no pose
keyframe can fake. The skeleton carries the body's weight (gravity
zeroed on the solver - probed law); the solver owns only the LAG.

The law was probed first (tmp/flesh_probe.py, real Blender 4.3.2,
differential measurement - the solver's own answer isolated against
its armature-only twin): a storm program's peak lag 2.13 cm against
the calm hold's 0.015 cm (ratio 141.75 - real dynamics, not noise),
bit-exact determinism across rebuilds, the lag bounded at 3.5% of the
region's height, settle to 27% of peak after the storm goes silent,
and a cost of ~0.25 ms/frame per region. THE GOAL SPRING FIELD IS
`goal_spring` (not `pull` - that is the edge-spring stiffness the
probes caught), goal weights 0.92 at the anchor falling to 0.7 at the
free end, goal_friction 2.0, damping 10.0, mass 0.3.

v11.1 THE SOLVER ANSWERS THE CALL: the director's per-shot FLESH call
(a number 0..1) scales the solver's ANSWER - the beat impulse, the
stagger sway, the wind breath - never its physics (mass, springs and
the goal law stay probed). Absent = 1.0, the full probed response;
0 is a stillness call (the anchors hold, the solver keeps its own
settle). Deterministic: the same call on the same beats always lands
the same flesh.
"""

import math

from mathutils import Matrix

# the figure's flesh regions - the shared part vocabulary: the designed
# figure, the stand-in and the loaded cast assets all build these names
FLESH_REGIONS = {
    "Torso": {"max": 0.14, "kick": 1.0, "goal_top": 0.92, "goal_bottom": 0.7},
    "TorsoMesh": {"max": 0.14, "kick": 1.0, "goal_top": 0.92, "goal_bottom": 0.7},
    "HeadMesh": {"max": 0.07, "kick": 0.6, "goal_top": 0.94, "goal_bottom": 0.8},
}

# probed solver tuning (tmp/flesh_probe.py - the differential law)
GOAL_SPRING = 0.85
GOAL_FRICTION = 2.0
DAMPING = 10.0
MASS = 0.3
ERROR_THRESHOLD = 0.01

KICK_IMPULSE = 0.09    # rad per beat-boundary impulse (scaled per region)
KICK_STIFF = 90.0
KICK_DAMP = 12.0
WIND_ANGLE = 0.05      # rad at full wind
JERK_ANGLE = 0.06      # rad at full stagger jerk
BREATH = 0.004         # rad - ambient life: holds are never frozen


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def build_flesh_rig(bpy, scn, figure, frames_total):
    """Graduate every qualifying flesh region to the real solver: bake
    the part's scale, hang an ANCHOR ARMATURE through it (parented to
    the part's own parent so the bone rides the pose), and stack
    Armature -> Subsurf -> SoftBody with probed goal weights (strong at
    the anchor, weaker at the free end - the lag IS the flesh).
    Returns the rig (or None when nothing qualified - honest)."""
    root = figure.get("root")
    candidates = []
    if root is not None:
        stack = [root]
        while stack:
            for ch in stack.pop().children:
                candidates.append(ch)
                stack.append(ch)
    parts = []
    notes = []
    for ob in candidates:
        if ob.type != "MESH":
            continue
        tune = FLESH_REGIONS.get(ob.name)
        if not tune:
            continue
        if any(m.type == "SOFT_BODY" for m in ob.modifiers):
            notes.append(f"{ob.name} already carries a solver - it keeps its own")
            continue
        me = ob.data
        if len(me.vertices) < 6:
            notes.append(f"{ob.name} too coarse to solve ({len(me.vertices)} verts)")
            continue
        # bake the scale so the solver sees real-world dimensions
        if abs(ob.scale.x - 1.0) > 1e-9 or abs(ob.scale.y - 1.0) > 1e-9 or abs(ob.scale.z - 1.0) > 1e-9:
            me.transform(Matrix.Diagonal((*ob.scale, 1.0)))
            ob.scale = (1.0, 1.0, 1.0)
        zs = [v.co.z for v in me.vertices]
        zmax, zmin = max(zs), min(zs)
        if zmax - zmin < 1e-4:
            notes.append(f"{ob.name} has no height to weight")
            continue
        span = zmax - zmin
        flesh = ob.vertex_groups.new(name="Flesh")
        goal = ob.vertex_groups.new(name="Goal")
        for v in me.vertices:
            t = (v.co.z - zmin) / span      # 0 at the free end, 1 at the anchor
            flesh.add([v.index], 0.8 + 0.2 * t, "REPLACE")
            goal.add([v.index],
                     tune["goal_bottom"] + (tune["goal_top"] - tune["goal_bottom"]) * t,
                     "REPLACE")
        # the ANCHOR: one bone through the region, in the part's parent
        # space (the same space the part hangs in) so the bone rides the pose
        bpy.ops.object.armature_add(location=(0.0, 0.0, 0.0))
        arm_ob = bpy.context.active_object
        arm_ob.name = f"FleshArm_{ob.name}"
        arm = arm_ob.data
        bpy.ops.object.mode_set(mode="EDIT")
        eb = arm.edit_bones[0]
        ax, ay, az = ob.location.x, ob.location.y, ob.location.z
        eb.head = (ax, ay, az + zmax + 0.05 * span)
        eb.tail = (ax, ay, az + zmin - 0.05 * span)
        eb.name = "Flesh"
        bpy.ops.object.mode_set(mode="OBJECT")
        arm_ob.display_type = "WIRE"
        arm_ob.hide_render = True
        arm_ob.parent = ob.parent
        arm_mod = ob.modifiers.new("FleshAnchor", "ARMATURE")
        arm_mod.object = arm_ob
        arm_mod.use_vertex_groups = True
        sub = ob.modifiers.new("Subd", "SUBSURF")
        sub.levels = 1
        sub.render_levels = 1
        sb = ob.modifiers.new("FleshSB", "SOFT_BODY")
        sb.point_cache.frame_start = 1
        sb.point_cache.frame_end = max(2, int(frames_total))
        st = sb.settings
        st.use_goal = True
        st.vertex_group_goal = "Goal"
        st.goal_default = (tune["goal_top"] + tune["goal_bottom"]) / 2.0
        st.goal_min = 0.1
        st.goal_max = 1.0
        st.goal_spring = GOAL_SPRING
        st.goal_friction = GOAL_FRICTION
        st.damping = DAMPING
        st.mass = MASS
        st.error_threshold = ERROR_THRESHOLD
        st.gravity = 0.0
        st.use_estimate_matrix = False
        st.effector_weights.gravity = 0.0
        st.effector_weights.wind = 0.0
        bone = arm_ob.pose.bones["Flesh"]
        parts.append({
            "name": ob.name,
            "bone": bone,
            "rest": bone.matrix.copy(),
            "head_z": az + zmax + 0.05 * span,
            "max": tune["max"],
            "kick": tune["kick"],
            "ka": 0.0,
            "kv": 0.0,
            "phase": len(parts) * 1.3,
        })
    if not parts:
        if notes:
            return {"parts": [], "notes": notes, "prev_beat": -1, "max_drive": 0.0}
        return None
    return {"parts": parts, "notes": notes, "prev_beat": -1, "max_drive": 0.0}


def apply_flesh_frame(rig, figure, t_sec, dt, beat_idx, wind, agit, kick, intensity=1.0):
    """Drive every region's anchor bone for this frame with the SAME
    deterministic inputs the cloth and springs answer: the beat's wind
    call and blocking energy, the beat-boundary impulse through a damped
    anchor spring, and the body's published stagger jerk - the flesh
    lags THE BODY, one solver up from the cloth.

    v11.1: the director's FLESH call (intensity 0..1) scales the
    solver's ANSWER - every directed term answers at the called
    intensity; the solver's physics stay probed law. A stillness call
    (0) holds the anchors near rest while the solver keeps its own
    settle - stillness, not a frozen cache."""
    if not rig or not rig["parts"]:
        return
    intensity = clamp(float(intensity), 0.0, 1.0)
    if beat_idx != rig["prev_beat"]:
        if rig["prev_beat"] >= 0:
            kick = max(kick, 0.3)   # a cut stirs the body - same as the cloth
        rig["prev_beat"] = beat_idx
    kick = kick * intensity
    stg = figure.get("_stagger") if figure else None
    jerk = min(1.0, float((stg or {}).get("jerk") or 0.0) / 1.4) * intensity
    drive = (wind * 1.45 + agit * 0.45 + 0.12) * intensity   # ambient life answers the call too
    for p in rig["parts"]:
        pmax = p["max"]
        # the beat-boundary impulse through the anchor spring
        p["kv"] += kick * p["kick"] * KICK_IMPULSE * (0.7 + 0.3 * math.sin(p["phase"]))
        p["kv"] += (-KICK_STIFF * p["ka"] - KICK_DAMP * p["kv"]) * dt
        p["ka"] = clamp(p["ka"] + p["kv"] * dt, -pmax, pmax)
        ax = p["ka"]
        # the directed air: the wind's pull and the ambient breath
        ax += (wind * intensity) * WIND_ANGLE * (0.8 + 0.4 * p["kick"]) * math.sin(t_sec * 2.4 + p["phase"])
        ax += drive * BREATH * math.sin(t_sec * 1.1 + p["phase"])
        # the body answers the violence: the stagger's jerk lags the flesh
        if jerk > 0.0:
            ax += jerk * JERK_ANGLE * p["kick"] * (0.7 + 0.3 * math.sin(p["phase"] + 1.0))
        ax = clamp(ax, -pmax, pmax)
        head = p["head_z"]
        to_h = Matrix.Translation((0.0, 0.0, head))
        r = Matrix.Rotation(ax, 4, "X")
        p["bone"].matrix = to_h @ r @ to_h.inverted() @ p["rest"]
        sway = abs(ax)
        if sway > rig["max_drive"]:
            rig["max_drive"] = sway
