# ─────────────────────────────────────────────────────────────
# AnimeOS MOTION RIG (v6.0) - designed assets PERFORM
#
# A production-grade donghua/anime asset is not a statue: the spirit
# serpent slithers, the raptor's wings beat, the sword hovers and its
# runes breathe. This module gives every DESIGNED prop and creature a
# REAL Blender armature (named bones a rigger can grab), rigidly binds
# the asset's named part hierarchy to those bones, and bakes a
# deterministic sinusoidal PERFORMANCE (named motion preset) into a
# looping Action. The rig + Action are saved INTO the asset's .blend,
# so every appended copy (preview loop, riding render, fix pass)
# performs the same designed move.
#
# Used by asset_builder.py (--motion <spec.json>) in two modes:
#   build  - geometry was just built, rig it and bake before saving
#   motion - the asset already exists (fromBlend), (re)rig + (re)bake
#            and save a NEW versioned file (the design_fix path)
#
# stdout markers the caller parses:
#   MOTION_SUMMARY <json>   archetype, motion, frames, cycles, bones, bound
#
# Bake laws (the motion IS designed, not random):
#   - every waveform completes WHOLE cycles per loop (seamless repeat)
#   - keys run 1..N+1 so the CYCLES fcurve modifier repeats cleanly
#   - phase offsets along chains (legs in trot pairs, coils in sequence,
#     the head leading the neck) - the classic animation reads
#   - amplitude/speed/cycleFrames clamp to sane production ranges
# ─────────────────────────────────────────────────────────────

import json
import math
import os
import shutil

RIG_NAME = "PerfRig"
ACTION_NAME = "PerfCycle"

MOTIONS_BY_KIND = {
    "PROP": ["hover", "spin", "pulse", "hover-spin"],
    "CREATURE": ["slither", "flap", "walk", "prowl", "breathe", "idle"],
}

DEFAULT_MOTION = {
    "serpent": "slither",
    "bird": "flap",
    "quadruped": "walk",
    "prop": "hover",
}


def _clamp(v, lo, hi):
    try:
        v = float(v)
    except Exception:  # noqa: BLE001
        v = 1.0
    return max(lo, min(hi, v))


def _base_name(ob_name):
    dot = ob_name.rfind(".")
    if dot > 0 and ob_name[dot + 1:].isdigit():
        return ob_name[:dot]
    return ob_name


def detect_perf_archetype(bpy, scn):
    """Detect what a scene (or freshly opened .blend) can perform.
    Characters animate through the directed pose system, environments
    are static by design - those return None honestly."""
    names = set()
    for ob in scn.objects:
        names.add(_base_name(ob.name))
    if "Coil1" in names:
        return "serpent"
    if "Wing1" in names:
        return "bird"
    if "Leg1" in names and "Paw1" in names:
        return "quadruped"
    if "PropBodyMat" in {m.name for m in bpy.data.materials}:
        return "prop"
    if "RShoulder" in names or "HeadMesh" in names:
        return None  # a character: the pose system owns its performance
    if "Ground" in names:
        return None  # an environment: static by design
    return None


def _bone_defs(archetype, size):
    """Named bone layout per archetype, matching the v5.0 builders'
    part positions (serpent coil arc, bird frame, quadruped frame)."""
    d = []
    if archetype == "prop":
        d.append(("PerfRoot", None, (0.0, 0.0, -0.1), (0.0, 0.0, 0.6 * max(0.4, size))))
        return d
    if archetype == "serpent":
        seg_n, coil_r = 7, 0.32 * size
        pts = []
        for k in range(seg_n):
            t = k / (seg_n - 1)
            a = t * math.pi * 1.5
            pts.append((math.cos(a) * coil_r, math.sin(a) * coil_r * 0.6,
                        0.09 * size + 0.02 * size * math.sin(t * math.pi * 2)))
        d.append(("PerfRoot", None, (0.0, 0.0, 0.0), (0.0, 0.0, 0.06)))
        for k, p in enumerate(pts):
            nxt = pts[k + 1] if k + 1 < len(pts) else (p[0] + 0.15 * size, p[1], p[2])
            d.append((f"Chain{k + 1}", "PerfRoot" if k == 0 else f"Chain{k}", p, nxt))
        d.append(("NeckB", f"Chain{seg_n}", (coil_r + 0.10 * size, 0.0, 0.26 * size),
                  (coil_r + 0.22 * size, 0.0, 0.40 * size)))
        d.append(("HeadB", "NeckB", (coil_r + 0.22 * size, 0.0, 0.40 * size),
                  (coil_r + 0.36 * size, 0.0, 0.39 * size)))
        return d
    if archetype == "bird":
        s = size
        d.append(("PerfRoot", None, (0.0, 0.0, 0.0), (0.0, 0.0, 0.06)))
        d.append(("BodyB", "PerfRoot", (0.0, -0.16 * s, 0.42 * s), (0.0, 0.16 * s, 0.42 * s)))
        d.append(("NeckB", "BodyB", (0.0, 0.12 * s, 0.60 * s), (0.0, 0.15 * s, 0.74 * s)))
        d.append(("HeadB", "NeckB", (0.0, 0.15 * s, 0.74 * s), (0.0, 0.24 * s, 0.76 * s)))
        d.append(("WingB1", "BodyB", (0.05 * s, 0.02 * s, 0.46 * s), (0.60 * s, 0.02 * s, 0.48 * s)))
        d.append(("WingB2", "BodyB", (-0.05 * s, 0.02 * s, 0.46 * s), (-0.60 * s, 0.02 * s, 0.48 * s)))
        d.append(("TailB", "BodyB", (0.0, -0.16 * s, 0.42 * s), (0.0, -0.42 * s, 0.40 * s)))
        d.append(("LegB1", "BodyB", (0.03 * s, 0.05 * s, 0.26 * s), (0.03 * s, 0.05 * s, 0.10 * s)))
        d.append(("LegB2", "BodyB", (-0.03 * s, 0.05 * s, 0.26 * s), (-0.03 * s, 0.05 * s, 0.10 * s)))
        return d
    # quadruped (and the honest generic fallback)
    s = size
    d.append(("PerfRoot", None, (0.0, 0.0, 0.0), (0.0, 0.0, 0.06)))
    d.append(("BodyB", "PerfRoot", (0.0, -0.34 * s, 0.50 * s), (0.0, 0.34 * s, 0.52 * s)))
    d.append(("NeckB", "BodyB", (0.0, 0.28 * s, 0.60 * s), (0.0, 0.38 * s, 0.72 * s)))
    d.append(("HeadB", "NeckB", (0.0, 0.38 * s, 0.72 * s), (0.0, 0.52 * s, 0.72 * s)))
    d.append(("TailB", "BodyB", (0.0, -0.36 * s, 0.55 * s), (0.0, -0.58 * s, 0.62 * s)))
    for i, (lx, ly) in enumerate(((0.1, 0.22), (-0.1, 0.22), (0.1, -0.24), (-0.1, -0.24))):
        hip = (lx * s, ly * s, 0.42 * s)
        knee = (lx * s, ly * s, 0.15 * s)
        d.append((f"LegUpB{i + 1}", "BodyB", hip, knee))
        d.append((f"LegLoB{i + 1}", f"LegUpB{i + 1}", knee, (lx * s, ly * s, 0.04 * s)))
    return d


# part-name -> bone bindings ('#' matches a trailing number, copied across)
BIND_MAP = {
    "prop": {"*": "PerfRoot"},
    "serpent": {
        "Coil#": "Chain#", "Spine#": "Chain2", "Neck": "NeckB", "Head": "HeadB",
        "Snout": "HeadB", "EyeL": "HeadB", "EyeR": "HeadB", "Horn1": "HeadB", "Horn2": "HeadB",
    },
    "bird": {
        "Body": "BodyB", "Chest": "BodyB", "Neck": "NeckB", "Head": "HeadB", "Beak": "HeadB",
        "EyeL": "HeadB", "EyeR": "HeadB", "Wing1": "WingB1", "Wing2": "WingB2",
        "Tail": "TailB", "Leg1": "LegB1", "Claw1": "LegB1", "Leg2": "LegB2", "Claw2": "LegB2",
    },
    "quadruped": {
        "Body": "BodyB", "Underbelly": "BodyB", "Spine#": "BodyB", "Neck": "NeckB",
        "Head": "HeadB", "Snout": "HeadB", "EyeL": "HeadB", "EyeR": "HeadB",
        "Horn1": "HeadB", "Horn2": "HeadB", "Tail": "TailB",
        "Leg#": "LegUpB#", "Paw#": "LegLoB#",
    },
}


def _bone_for(archetype, part_name):
    for pattern, bone in BIND_MAP.get(archetype, {}).items():
        if pattern == "*":
            return bone
        if "#" in pattern:
            head = pattern.split("#")[0]
            if part_name.startswith(head) and part_name[len(head):].isdigit():
                num = part_name[len(head):]
                if "#" in bone:
                    return bone.replace("#", num)
                return bone
        elif part_name == pattern:
            return bone
    return None


def build_perf_armature(bpy, scn, archetype, size):
    """Create (or replace) the named armature and lay out its bones."""
    old = bpy.data.objects.get(RIG_NAME)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    old_act = bpy.data.actions.get(ACTION_NAME)
    if old_act is not None and old_act.users == 0:
        bpy.data.actions.remove(old_act)

    arm_data = bpy.data.armatures.new(RIG_NAME)
    arm = bpy.data.objects.new(RIG_NAME, arm_data)
    scn.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, parent, head, tail in _bone_defs(archetype, size):
        b = arm_data.edit_bones.new(name)
        b.head, b.tail, b.roll = head, tail, 0.0
        if parent:
            b.parent = arm_data.edit_bones[parent]
            b.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def bind_parts(bpy, scn, arm, archetype):
    """Rigid-bind every named part mesh to its bone, world position
    preserved. The correction is EMPIRICAL (parent, measure where the
    object actually landed, compensate in bone-local space) so the
    bind never depends on pose-matrix convention quirks - and because
    the pose enters the chain linearly, world(f) = pose(f) @ pose(rest)^-1 @ world."""
    bound, loose = 0, []
    for ob in list(scn.objects):
        if ob.type != "MESH" or ob.name == RIG_NAME:
            continue
        bone = _bone_for(archetype, _base_name(ob.name))
        if not bone or bone not in arm.pose.bones:
            loose.append(ob.name)
            continue
        bpy.context.view_layer.update()
        world = ob.matrix_world.copy()
        ob.parent = arm
        ob.parent_bone = bone
        ob.matrix_parent_inverse.identity()
        bpy.context.view_layer.update()
        landed = ob.matrix_world.copy()
        if (landed.translation - world.translation).length > 1e-5 or \
           (landed.to_quaternion().rotation_difference(world.to_quaternion()).angle > 1e-4):
            ob.matrix_basis = ob.matrix_basis @ (landed.inverted() @ world)
            bpy.context.view_layer.update()
        drift = (ob.matrix_world.translation - world.translation).length
        if drift > 1e-4:
            loose.append(f"{ob.name}@bind-drift-{drift:.4f}")
            continue
        bound += 1
    return bound, loose


def _key_bone(pb_map, name, channel, keys, rotation=False):
    b = pb_map[name]
    if rotation:
        b.rotation_mode = "XYZ"
    for frame, value in keys:
        setattr(b, channel, value)
        b.keyframe_insert(data_path=channel, frame=frame)


def _key_emission(bpy, scn, keys, frames):
    """Pulse the asset's emissive material (the runes/spirit core breathe)."""
    for mat_name in ("PropGlowMat", "CreatureGlowMat"):
        mat = bpy.data.materials.get(mat_name)
        if not mat or not mat.use_nodes:
            continue
        em = mat.node_tree.nodes.get("Emission")
        if not em:
            continue
        base = em.inputs[1].default_value
        for f in frames:
            em.inputs[1].default_value = base * float(keys(f))
            em.inputs[1].keyframe_insert("default_value", frame=f)
        mat.node_tree.animation_data_create()
        act = mat.node_tree.animation_data.action
        if act:
            act.name = f"{ACTION_NAME}Glow"
            act.use_fake_user = True
            for fc in act.fcurves:
                fc.modifiers.new(type="CYCLES")
        return True
    return False


def _loop_modifiers(action):
    for fc in action.fcurves:
        fc.modifiers.new(type="CYCLES")


def bake_performance(bpy, scn, arm, archetype, spec):
    """Bake the named motion as a seamless looping Action on the rig."""
    motion = str(spec.get("motion") or DEFAULT_MOTION.get(archetype) or "idle")
    allowed = MOTIONS_BY_KIND.get("PROP" if archetype == "prop" else "CREATURE", [])
    if motion not in allowed:
        motion = DEFAULT_MOTION.get(archetype, "idle")
    speed = _clamp(spec.get("speed", 1.0), 0.2, 3.0)
    amp = _clamp(spec.get("amplitude", 1.0), 0.2, 3.0)
    n = max(1, min(3, int(round(speed))))  # whole wave cycles per loop
    n_frames = int(_clamp(spec.get("cycleFrames", 24), 16, 48))

    act = bpy.data.actions.new(ACTION_NAME)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    pbs = arm.pose.bones

    # frames 1..N+1 with theta(N+1) == theta(1) + 2*pi*n: the CYCLES
    # modifier repeats [1, N+1] with no seam; the scene renders 1..N
    frames = list(range(1, n_frames + 2))

    def cyc(i, phase=0.0):
        return math.sin(2.0 * math.pi * n * (i - 1) / n_frames + phase)

    def linear(i):
        return 2.0 * math.pi * n * (i - 1) / n_frames

    report = {"archetype": archetype, "motion": motion, "cycles": n,
              "frames": n_frames, "bones": 0, "bound": 0, "glow": False}

    if archetype == "prop":
        root = pbs["PerfRoot"]
        bob = 0.06 * amp
        keys_loc = [(f, (0.0, bob * cyc(i), 0.0)) for i, f in enumerate(frames)]
        keys_rot = [(f, (0.0, linear(i) if motion in ("spin", "hover-spin") else 0.0,
                         0.04 * amp * cyc(i, 1.3) if motion in ("hover", "hover-spin") else 0.0))
                    for i, f in enumerate(frames)]
        _key_bone(pbs, "PerfRoot", "location", keys_loc)
        _key_bone(pbs, "PerfRoot", "rotation_euler", keys_rot, rotation=True)
        report["bones"] = 1
        if motion in ("pulse", "hover-spin"):
            report["glow"] = _key_emission(bpy, scn, lambda i: 0.72 + 0.38 * cyc(i, 0.4), frames)
        elif motion == "hover":
            report["glow"] = _key_emission(bpy, scn, lambda i: 0.9 + 0.12 * cyc(i, 0.4), frames)

    elif archetype == "serpent":
        swing = 0.16 * amp
        for k in range(7):
            name = f"Chain{k + 1}"
            if name not in pbs:
                continue
            phase = k * 0.9
            keys = [(f, (0.45 * swing * cyc(i, phase + 1.2),
                         0.45 * swing * cyc(i, phase),
                         1.0 * swing * cyc(i, phase + 2.2)))
                    for i, f in enumerate(frames)]
            _key_bone(pbs, name, "rotation_euler", keys, rotation=True)
            report["bones"] += 1
        head_keys = [(f, (0.30 * swing * cyc(i, 6 * 0.9 + 1.2),
                          0.30 * swing * cyc(i, 6 * 0.9 + 0.6),
                          1.15 * swing * cyc(i, 6 * 0.9 + 2.2)))
                     for i, f in enumerate(frames)]
        for name in ("NeckB", "HeadB"):
            if name in pbs:
                _key_bone(pbs, name, "rotation_euler", head_keys, rotation=True)
                report["bones"] += 1
        if "PerfRoot" in pbs:
            _key_bone(pbs, "PerfRoot", "location",
                      [(f, (0.0, 0.0, 0.015 * amp * cyc(i, 0.8))) for i, f in enumerate(frames)])
            report["bones"] += 1

    elif archetype == "bird":
        flap = 0.55 * amp
        if "PerfRoot" in pbs:
            _key_bone(pbs, "PerfRoot", "location",
                      [(f, (0.0, 0.0, 0.035 * amp * cyc(i))) for i, f in enumerate(frames)])
            report["bones"] += 1
        for name, sign in (("WingB1", 1.0), ("WingB2", -1.0)):
            if name not in pbs:
                continue
            keys = [(f, (flap * sign * cyc(i), 0.0, 0.0)) for i, f in enumerate(frames)]
            _key_bone(pbs, name, "rotation_euler", keys, rotation=True)
            report["bones"] += 1
        for name, scale, phase in (("TailB", 0.4, 0.9), ("NeckB", 0.22, 1.7)):
            if name in pbs:
                _key_bone(pbs, name, "rotation_euler",
                          [(f, (scale * flap * cyc(i, phase), 0.0, 0.0)) for i, f in enumerate(frames)],
                          rotation=True)
                report["bones"] += 1

    else:  # quadruped walk / prowl / breathe / idle
        motion_eff = "breathe" if motion in ("breathe", "idle") else motion
        swing = (0.34 if motion_eff == "walk" else 0.22 if motion_eff == "prowl" else 0.05) * amp
        bob = (0.025 if motion_eff != "breathe" else 0.012) * amp
        phases = {1: 0.0, 4: 0.0, 2: math.pi, 3: math.pi}  # trot: diagonal pairs
        for leg in range(1, 5):
            up, lo = f"LegUpB{leg}", f"LegLoB{leg}"
            if up in pbs:
                _key_bone(pbs, up, "rotation_euler",
                          [(f, (swing * cyc(i, phases[leg]), 0.0, 0.0)) for i, f in enumerate(frames)],
                          rotation=True)
                report["bones"] += 1
            if lo in pbs and motion_eff != "breathe":
                _key_bone(pbs, lo, "rotation_euler",
                          [(f, (0.6 * swing * max(0.0, cyc(i, phases[leg] + 1.1)), 0.0, 0.0))
                           for i, f in enumerate(frames)],
                          rotation=True)
                report["bones"] += 1
        if "PerfRoot" in pbs:
            _key_bone(pbs, "PerfRoot", "location",
                      [(f, (0.0, 0.0, bob * cyc(i, 0.5))) for i, f in enumerate(frames)])
            report["bones"] += 1
        if "TailB" in pbs:
            _key_bone(pbs, "TailB", "rotation_euler",
                      [(f, (0.10 * amp * cyc(i, 1.1), 0.0, 0.18 * amp * cyc(i, 0.2)))
                       for i, f in enumerate(frames)], rotation=True)
            report["bones"] += 1
        if "HeadB" in pbs:
            _key_bone(pbs, "HeadB", "rotation_euler",
                      [(f, (0.06 * amp * cyc(i, 2.0), 0.0, 0.0)) for i, f in enumerate(frames)],
                      rotation=True)
            report["bones"] += 1

    # the spirit glow breathes with the performance (eyes, runes, core)
    if archetype != "prop":
        report["glow"] = _key_emission(bpy, scn, lambda i: 0.85 + 0.22 * cyc(i, 0.6), frames)

    _loop_modifiers(act)
    scn.frame_start = 1
    scn.frame_end = n_frames
    bound_estimate = sum(1 for ob in scn.objects
                         if ob.type == "MESH" and ob.parent == arm)
    report["bound"] = bound_estimate
    return report


def render_loop(bpy, scn, out_path, subprocess_mod, frames_dir, size=288, samples=20):
    """Render the animated preview loop: frame PNGs + system ffmpeg,
    Blender's own FFMPEG writer as the fallback (the worker's proven
    encode chain, at preview scale)."""
    n_frames = max(2, scn.frame_end - scn.frame_start + 1)
    os.makedirs(frames_dir, exist_ok=True)
    scn.render.image_settings.file_format = "PNG"
    scn.cycles.device = "CPU"
    scn.cycles.samples = samples
    scn.render.resolution_x = size
    scn.render.resolution_y = size
    for f in range(scn.frame_start, scn.frame_end + 1):
        scn.frame_set(f)
        scn.render.filepath = os.path.join(frames_dir, f"loop_{f:04d}.png")
        bpy.ops.render.render(write_still=True)
    out = None
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        try:
            subprocess_mod.run(
                [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                 "-framerate", "24", "-i", os.path.join(frames_dir, "loop_%04d.png"),
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
                 "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                 "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", out_path],
                check=True, timeout=240,
            )
            out = out_path
        except Exception:  # noqa: BLE001
            out = None
    if not out:
        try:
            scn.render.image_settings.file_format = "FFMPEG"
            scn.render.ffmpeg.format = "MPEG4"
            scn.render.ffmpeg.codec = "H264"
            scn.render.ffmpeg.constant_rate_factor = "HIGH"
            scn.render.ffmpeg.gopsize = 18
            scn.render.ffmpeg.audio_codec = "NONE"
            scn.render.filepath = out_path
            bpy.ops.render.render(animation=True)
            out = out_path if os.path.exists(out_path) else None
        except Exception:  # noqa: BLE001
            out = None
    shutil.rmtree(frames_dir, ignore_errors=True)
    return out


def ensure_performance(bpy, scn, spec):
    """Top-level entry: detect, rig, bind, bake. Returns the report or
    None when the scene has nothing that performs (honest refusal).
    spec may pin the archetype (the builder knows the kind it built);
    otherwise it is detected from the named part hierarchy."""
    archetype = spec.get("archetype")
    if archetype not in ("prop", "serpent", "bird", "quadruped"):
        archetype = detect_perf_archetype(bpy, scn)
    if archetype is None:
        return None
    size = float(spec.get("size") or 1.0)
    arm = build_perf_armature(bpy, scn, archetype, size)
    bound, loose = bind_parts(bpy, scn, arm, archetype)
    report = bake_performance(bpy, scn, arm, archetype, spec)
    report["loose"] = loose[:6]
    scn.frame_set(1)
    bpy.context.view_layer.update()
    return report


def probe(bpy, scn):
    """Dev harness: measure which world axes actually move per archetype.
    Prints PROBE lines; used to pin the swing/flap/swing axes."""
    import mathutils  # noqa: F401
    marks = {"prop": ["Part1"], "serpent": ["Coil1", "Head"], "bird": ["Wing1", "Head"], "quadruped": ["Paw1", "Head"]}
    out = {}
    for arch, names in marks.items():
        for ob in list(scn.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions, bpy.data.materials):
            for block in list(coll):
                if block.users == 0:
                    coll.remove(block)
        spec = {"motion": DEFAULT_MOTION[arch], "amplitude": 2.0, "speed": 1.0, "size": 2.0, "archetype": arch}
        if arch == "prop":
            bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0.5))
            bpy.context.active_object.name = "Part1"
        else:
            import animeos_bridge as bridge
            dna = {"name": arch, "archetype": arch, "size": 2.0, "horns": True, "spines": True}
            if arch == "bird":
                dna["wings"] = True
            bridge.build_designed_creature(bpy, scn, dna)
        rep = ensure_performance(bpy, scn, spec)
        if rep is None:
            print(f"PROBE {arch} REFUSED", flush=True)
            continue
        samples = {}
        for f in (1, rep["frames"] // 3 + 1, 2 * rep["frames"] // 3 + 1):
            scn.frame_set(f)
            bpy.context.view_layer.update()
            for nm in names:
                ob = scn.objects.get(nm) or next((o for o in scn.objects if _base_name(o.name) == nm), None)
                if ob is None:
                    continue
                t = ob.matrix_world.translation
                samples.setdefault(nm, []).append((round(t.x, 4), round(t.y, 4), round(t.z, 4)))
        for nm, pts in samples.items():
            dx = max(p[0] for p in pts) - min(p[0] for p in pts)
            dy = max(p[1] for p in pts) - min(p[1] for p in pts)
            dz = max(p[2] for p in pts) - min(p[2] for p in pts)
            out[f"{arch}:{nm}"] = (dx, dy, dz)
            print(f"PROBE {arch}:{nm} dx={dx:.4f} dy={dy:.4f} dz={dz:.4f}", flush=True)
    scn.frame_set(1)
    return out


# CLI probe harness: blender -b -P motion_rig.py -- --probe
if __name__ == "__main__":
    import os
    import sys
    _extra = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--probe" in _extra:
        import bpy
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        probe(bpy, bpy.context.scene)
