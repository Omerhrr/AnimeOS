# AnimeOS ⇄ Blender Live Bridge Add-on (v3 - worker-pool animated sequences)
#
# One script, three run modes:
#   SERVER  blender -b -P animeos_bridge.py -- --port 8100
#           (or open it from Blender's Scripting tab and Run - the HTTP
#           server lives on a daemon thread and Blender stays open)
#           plain python3 animeos_bridge.py -- --port 8100 also works:
#           the server itself does NOT need bpy.
#   WORKER  spawned by the server per job:
#           blender -b -P animeos_bridge.py -- --worker --job <tmp.json>
#
# Endpoints (bound to 127.0.0.1 only):
#   GET  /status                 → {"ok", "blender_version", "scene", "busy"}
#   GET  /progress?job_id=...    → {"progress", "stage", "done", "mp4_base64"?}
#   POST /render                 → submit an AnimeOS job
#   POST /ping                   → {"ok": true}
#
# The /render payload comes from AnimeOS's render pipeline:
# {
#   "jobId": "...",
#   "shot":  {"number":3,"description":"...","shotType":"CLOSEUP","lens":"50mm",
#             "movement":"DOLLY_IN","lighting":"...","duration":4.0},
#   "scene": {"number":12,"title":"...","fogDensity":0.45,"lightningIntensity":0.55,
#             "energyIntensity":0.6,"cameraDistance":1.0,"rimLightIntensity":0.5},
#   "project": {"title":"...","visualStyle":"DONGHUA","resolution":"1920x1080","fps":24},
#   "mode": "PREVIEW"
# }
#
# WHY WORKERS: bpy rendering holds the Python GIL for whole frames, so a
# render running on the server's main thread would starve the HTTP
# threads and /progress would freeze. v3 runs every job in a FRESH
# headless Blender subprocess: the server stays responsive, progress is
# exchanged through a small JSON file the worker rewrites per frame, a
# crashed worker can never poison the server, and every job gets a
# clean scene.
#
# v3 renders REAL ANIMATED SHOTS, not stills: the worker builds a small
# 3D stand-in scene (rocky terrace, emissive blade, moon/rim/energy
# lights), drives a CAMERA RIG through the shot's movement grammar frame
# by frame (orbit / dolly / pan / tracking / crane / tilt / static),
# applies the AnimeOS scene parameters (fog-colored world, deterministic
# lightning strobes, emission energy), renders the range with Cycles
# CPU and encodes an h264 clip (system ffmpeg when present, Blender's
# own FFMPEG writer otherwise). The finished clip flows back to AnimeOS
# as mp4_base64 and lands in public/renders/{jobId}.mp4.
#
# v3.1 adds CHARACTER MOTION inside the frame: when the shot carries
# poseStart / poseEnd (AnimeOS shot pose vocabulary) the worker builds
# a skeletal STAND-IN FIGURE (jointed humanoid with the emissive blade
# in hand) and interpolates its joints between the two poses with eased
# timing - lunges, slashes, casts, bows, walk cycles - so the blocking
# pass shows the character performing, not just the lens moving. The
# /render payload's shot dict grows two optional fields:
#   "poseStart": "STANCE", "poseEnd": "LUNGE"

import argparse
import base64
import json
import math
import os
import shutil
import subprocess
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT_DEFAULT = 8100

# ─── shared camera grammar + scene DNA (imported by both modes) ──

SHOT_FRAMING = {
    # AnimeOS shot type → (camera distance multiplier, lens mm, height offset)
    "ESTABLISHING":     (2.6, 24, 1.6),
    "WIDE":             (1.8, 35, 1.4),
    "LOW_ANGLE":        (1.2, 35, 0.4),
    "MEDIUM":           (1.0, 50, 1.2),
    "CLOSEUP":          (0.55, 85, 1.5),
    "EXTREME_CLOSEUP":  (0.28, 100, 1.55),
}

def fnv1a(s):
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h

def mulberry32(seed):
    cell = [seed & 0xFFFFFFFF]

    def rng():
        cell[0] = (cell[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = cell[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61)))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rng

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def render_dir():
    candidates = [
        os.path.join(os.getcwd(), "public", "renders"),
        os.path.join(os.path.expanduser("~"), "animeos_renders"),
    ]
    for d in candidates:
        if os.path.isdir(os.path.dirname(d)):
            try:
                os.makedirs(d, exist_ok=True)
                return d
            except OSError:
                continue
    d = candidates[1]
    os.makedirs(d, exist_ok=True)
    return d

def lightning_windows(job_id, lightning, duration_sec):
    """Deterministic flash windows (seconds) - same DNA as the MOTION
    engine's planner so both engines strobe alike for the same job."""
    if lightning <= 0.03:
        return []
    rng = mulberry32(fnv1a(job_id))
    windows = []
    for _ in range(1 + int(lightning * 2)):
        windows.append((0.12 + rng() * 0.74, 0.08 + 0.1 * lightning, 0.35 + 0.35 * lightning))
    return windows

# ─── shared pose vocabulary (mirrors src/lib/animation/poses.ts) ──

POSE_JOINTS = {
    #          rootX  rootY spine head  rArm  rElb  lArm  lElb  rLeg rKnee lLeg lKnee
    "STANCE": (0.00,  0.00,   1,   0,    -8,    8,    8,    8,     0,   4,    0,   4),
    "WALK":   (0.10,  0.00,   2,   0,    18,   12,  -18,   12,    28,  12,  -14,   8),
    "LUNGE":  (0.35, -0.12,  10,  -3,   -95,    5,   35,   45,    55,  40,  -25,  10),
    "SLASH":  (0.10, -0.05,  -8,  -5,  -160,   20,  -30,   30,    10,  10,   -8,   6),
    "CAST":   (0.00,  0.02,  -4, -12,  -120,   50, -120,   50,     6,   6,   -6,   6),
    "DRAW":   (0.05, -0.03,   3,   2,   -85,   95,  -70,   12,    12,  14,  -10,   6),
    "BLOCK":  (0.00, -0.06,   6,   4,   -70,  100,  -60,  100,    20,  30,  -10,  15),
    "LEAP":   (0.15,  0.55,  -6,  -4,  -140,   20, -120,   20,    60,  70,   35,  55),
    "CROUCH": (0.05, -0.40,  18,   6,   -30,   40,  -20,   35,    70,  95,   55,  90),
    "FALL":   (0.05, -0.62,  32,  20,    40,   10,  -55,   15,    15,  45,    5,  30),
    "RISE":   (0.10, -0.25,  14,   4,   -20,   25,  -15,   20,    40,  60,   25,  40),
    "BOW":    (0.00, -0.04,  38,  22,    12,    6,   12,    6,     0,   2,    0,   2),
    "POINT":  (0.05,  0.00,   2,  -2,   -88,    4,   10,   12,     8,   6,   -6,   4),
}

POSE_ALIASES = {
    "IDLE": "STANCE", "STAND": "STANCE", "READY": "STANCE",
    "STEP": "WALK", "STRIDE": "WALK", "ATTACK": "LUNGE",
    "STRIKE": "SLASH", "SWORD_SLASH": "SLASH", "SPELL": "CAST", "CHANNEL": "CAST",
    "AIM": "DRAW", "GUARD": "BLOCK", "DEFEND": "BLOCK", "JUMP": "LEAP",
    "DUCK": "CROUCH", "COLLAPSE": "FALL", "STAND_UP": "RISE",
    "SALUTE": "BOW", "GREET": "BOW", "CALL": "POINT",
}

def normalize_pose(value):
    raw = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
    if not raw:
        return None
    if raw in POSE_JOINTS:
        return raw
    return POSE_ALIASES.get(raw)

def ease_in_out_cubic(t):
    x = clamp(t, 0.0, 1.0)
    if x < 0.5:
        return 4.0 * x * x * x
    return 1.0 - ((-2.0 * x + 2.0) ** 3) / 2.0

def lerp_pose(start, end, t):
    a = POSE_JOINTS.get(normalize_pose(start) or "STANCE", POSE_JOINTS["STANCE"])
    b = POSE_JOINTS.get(normalize_pose(end) or "STANCE", POSE_JOINTS["STANCE"])
    k = ease_in_out_cubic(t)
    return tuple(a[i] + (b[i] - a[i]) * k for i in range(len(a)))


def camera_pose(shot_payload, scene_payload, t):
    """Camera position + look target for progress t (0..1) through the
    shot, driven by the movement grammar. Shots carrying a pose
    program reframe slightly: the stand-in figure replaces the props
    as the subject, so the rig pulls back and lowers its target onto
    the body."""
    dist, lens, height = SHOT_FRAMING.get(str(shot_payload.get("shotType", "MEDIUM")).upper(), SHOT_FRAMING["MEDIUM"])
    dist *= float(scene_payload.get("cameraDistance", 1.0))
    movement = str(shot_payload.get("movement") or "STATIC").upper()
    if movement not in ("ORBIT", "PAN", "TRACKING", "CRANE", "DOLLY_IN", "DOLLY_OUT", "TILT_UP", "TILT_DOWN"):
        movement = "STATIC"
    has_poses = bool(normalize_pose(shot_payload.get("poseStart")) or normalize_pose(shot_payload.get("poseEnd")))
    if has_poses:
        dist *= 1.25

    angle = 40.0
    radius = dist
    h = height
    lateral = 0.0
    # pose shots frame the FIGURE (prop-scale stand-in, ~0.8m tall);
    # everything else frames the plinth + floating blade as before
    target = [0.0, 0.0, height * (0.42 if has_poses else 0.75)]

    if movement == "ORBIT":
        angle = 40.0 + (t - 0.5) * 44.0
        radius = dist * (1.0 + 0.05 * math.sin(t * math.pi))
    elif movement == "DOLLY_IN":
        radius = dist * (1.0 - 0.28 * t)
    elif movement == "DOLLY_OUT":
        radius = dist * (0.72 + 0.28 * t)
    elif movement == "PAN":
        angle = 40.0 + math.sin((t - 0.5) * math.pi) * 24.0
    elif movement == "TRACKING":
        lateral = (t - 0.5) * dist * 0.42
    elif movement == "CRANE":
        h = height + 2.2 * (1.0 - t)
        radius = dist * (1.0 + 0.1 * t)
    elif movement == "TILT_UP":
        target[2] = height * (0.35 + 0.55 * t)
    elif movement == "TILT_DOWN":
        target[2] = height * (0.9 - 0.55 * t)

    if has_poses:
        # follow the subject: the pose program can carry the figure
        # toward the lens (LUNGE root travel), so the rig backs off by
        # the same world travel (table value x prop scale) and keeps
        # the body framed
        rx = lerp_pose(shot_payload.get("poseStart"), shot_payload.get("poseEnd"), t)[0]
        radius += rx * 0.42

    rad = math.radians(angle)
    pos = [radius * math.sin(rad) + lateral, -radius * math.cos(rad), h]
    if movement == "STATIC":
        pos[2] += math.sin(t * math.pi * 2) * 0.015  # breathing lock-off
    return pos, target, lens


# ═══ WORKER MODE (runs inside a fresh headless Blender) ═══════

def build_stand_in_figure(bpy, scn, body_mat, blade_mat):
    """Skeletal stand-in: primitives parented under joint empties so the
    frame loop can articulate the character per frame. The figure faces
    -Y (toward the camera rig); the emissive blade sits in its right
    hand, so slashes and casts carry the energy glow with them."""
    def empty(name, parent, loc):
        e = bpy.data.objects.new(name, None)
        scn.collection.objects.link(e)
        e.empty_display_size = 0.05
        if parent:
            e.parent = parent
        e.location = loc
        return e

    def limb(name, parent, loc, scale):
        bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
        m = bpy.context.active_object
        m.name = name
        m.scale = scale
        m.data.materials.append(body_mat)
        m.parent = parent
        m.location = loc
        return m

    root = empty("Root", None, (0.0, 0.0, 0.0))
    pelvis = empty("Pelvis", root, (0.0, 0.0, 1.02))
    limb("Torso", pelvis, (0.0, 0.0, 0.22), (0.17, 0.12, 0.30))
    spine = empty("Spine", pelvis, (0.0, 0.0, 0.45))
    head = empty("Head", spine, (0.0, 0.0, 0.28))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.12, location=(0, 0, 0))
    hm = bpy.context.active_object
    hm.name = "HeadMesh"
    hm.data.materials.append(body_mat)
    hm.parent = head
    hm.location = (0.0, 0.0, 0.12)

    r_shoulder = empty("RShoulder", spine, (-0.24, 0.0, 0.18))
    limb("RUpperArm", r_shoulder, (0.0, 0.0, -0.14), (0.045, 0.045, 0.14))
    r_elbow = empty("RElbow", r_shoulder, (0.0, 0.0, -0.28))
    limb("RForearm", r_elbow, (0.0, 0.0, -0.13), (0.038, 0.038, 0.13))
    l_shoulder = empty("LShoulder", spine, (0.24, 0.0, 0.18))
    limb("LUpperArm", l_shoulder, (0.0, 0.0, -0.14), (0.045, 0.045, 0.14))
    l_elbow = empty("LElbow", l_shoulder, (0.0, 0.0, -0.28))
    limb("LForearm", l_elbow, (0.0, 0.0, -0.13), (0.038, 0.038, 0.13))

    r_hip = empty("RHip", pelvis, (-0.10, 0.0, -0.02))
    limb("RThigh", r_hip, (0.0, 0.0, -0.24), (0.055, 0.055, 0.22))
    r_knee = empty("RKnee", r_hip, (0.0, 0.0, -0.46))
    limb("RShin", r_knee, (0.0, 0.0, -0.22), (0.045, 0.045, 0.22))
    l_hip = empty("LHip", pelvis, (0.10, 0.0, -0.02))
    limb("LThigh", l_hip, (0.0, 0.0, -0.24), (0.055, 0.055, 0.22))
    l_knee = empty("LKnee", l_hip, (0.0, 0.0, -0.46))
    limb("LShin", l_knee, (0.0, 0.0, -0.22), (0.045, 0.045, 0.22))

    bpy.ops.mesh.primitive_cone_add(radius1=0.05, radius2=0.0, depth=1.2, vertices=6, location=(0, 0, 0))
    blade = bpy.context.active_object
    blade.name = "HandBlade"
    blade.data.materials.append(blade_mat)
    blade.parent = empty("RHand", r_elbow, (0.0, 0.0, -0.26))
    blade.location = (0.0, -0.10, -0.18)
    blade.rotation_euler = (math.radians(-72), 0.0, 0.0)

    # prop scale: the stand-in shares the scene's existing prop sizing
    # (plinth 0.9m, floating blade) so every shot-type framing in
    # SHOT_FRAMING keeps working unchanged - root scales the whole
    # hierarchy toward the ground
    root.scale = (0.45, 0.45, 0.45)

    return {
        "root": root, "spine": spine, "head": head,
        "rShoulder": r_shoulder, "rElbow": r_elbow,
        "lShoulder": l_shoulder, "lElbow": l_elbow,
        "rHip": r_hip, "rKnee": r_knee, "lHip": l_hip, "lKnee": l_knee,
    }


def apply_pose(figure, pose_start, pose_end, t, t_sec):
    """Pose the stand-in for this frame: eased interpolation between the
    shot's start/end poses, plus a procedural walk cycle when either
    endpoint is WALK (stride swing on hips/shoulders, counter-swing on
    the opposite arm, a small root bob)."""
    (root_x, root_y, spine_a, head_a, r_arm, r_elb, l_arm, l_elb, r_leg, r_knee, l_leg, l_knee) = lerp_pose(pose_start, pose_end, t)
    walking = "WALK" in (normalize_pose(pose_start), normalize_pose(pose_end))
    leg_r = leg_l = arm_r = arm_l = 0.0
    bob = 0.0
    if walking:
        phase = t_sec * 2.2 * math.pi * 2.0  # ~2.2 strides per second
        leg_r = math.sin(phase) * 22.0
        leg_l = -leg_r
        arm_r = -leg_r * 0.55
        arm_l = leg_r * 0.55
        bob = abs(math.cos(phase)) * 0.045
    root = figure["root"]
    # root motion is set on the root object itself (outside the scaled
    # hierarchy), so apply the same prop scale to keep travel in
    # proportion with the 0.45x stand-in
    s = 0.45
    root.location = (0.0, -root_x * s, (root_y + bob) * s)
    figure["spine"].rotation_euler = (math.radians(spine_a), 0.0, 0.0)
    figure["head"].rotation_euler = (math.radians(head_a), 0.0, 0.0)
    figure["rShoulder"].rotation_euler = (math.radians(r_arm - arm_r), 0.0, 0.0)
    figure["lShoulder"].rotation_euler = (math.radians(l_arm - arm_l), 0.0, 0.0)
    figure["rElbow"].rotation_euler = (math.radians(-r_elb), 0.0, 0.0)
    figure["lElbow"].rotation_euler = (math.radians(-l_elb), 0.0, 0.0)
    figure["rHip"].rotation_euler = (math.radians(-r_leg - leg_r), 0.0, 0.0)
    figure["lHip"].rotation_euler = (math.radians(-l_leg - leg_l), 0.0, 0.0)
    figure["rKnee"].rotation_euler = (math.radians(r_knee), 0.0, 0.0)
    figure["lKnee"].rotation_euler = (math.radians(l_knee), 0.0, 0.0)


def worker_run(job_file):
    import bpy
    import mathutils

    with open(job_file, "r", encoding="utf-8") as fh:
        job = json.load(fh)

    payload = job.get("payload", {})
    shot = payload.get("shot", {})
    scene_p = payload.get("scene", {})
    project = payload.get("project", {})
    mode = payload.get("mode", "PREVIEW")
    job_id = job.get("jobId", "job")
    out_dir = job.get("outDir") or render_dir()

    state = {"progress": 0.02, "stage": "Blender worker: scene received", "done": False, "error": None, "mp4Path": None}

    def flush():
        tmp = job_file + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump({"jobId": job_id, **state}, fh)
        os.replace(tmp, job_file)

    def fail(msg):
        state["error"] = str(msg)
        state["stage"] = f"Blender worker: failed - {msg}"
        state["done"] = True
        flush()

    try:
        duration_sec = clamp(float(shot.get("duration", 3.0) or 3.0), 0.8, 30.0)
        fps = clamp(int(project.get("fps", 24) or 24), 1, 60)
        frames_total = max(2, round(duration_sec * fps))
        try:
            res_w, res_h = [int(v) for v in str(project.get("resolution", "1920x1080")).split("x")][:2]
        except Exception:  # noqa: BLE001
            res_w, res_h = 1920, 1080
        cap = 1280 if mode == "FINAL" else 512
        scale = min(1.0, cap / max(res_w, res_h))
        out_w = max(16, round(res_w * scale / 2) * 2)
        out_h = max(16, round(res_h * scale / 2) * 2)

        scn = bpy.context.scene

        # clean slate: Blender's startup Cube/Light/Camera surround the
        # origin (a 2m box) and would swallow the stand-in set - purge them
        for ob in list(scn.objects):
            if ob.name in ("Cube", "Light", "Camera"):
                bpy.data.objects.remove(ob, do_unlink=True)

        # ── stand-in set (built fresh in this clean .blend) ──
        ground_mesh = bpy.data.meshes.new("Ground")
        ground_mesh.from_pydata([(-14, -14, 0), (14, -14, 0), (14, 14, 0), (-14, 14, 0)], [], [(0, 1, 2, 3)])
        ground_mesh.update()
        ground = bpy.data.objects.new("Ground", ground_mesh)
        scn.collection.objects.link(ground)
        mat = bpy.data.materials.new("SetMat")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.035, 0.05, 0.045, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.95
        ground.data.materials.append(mat)

        rng = mulberry32(fnv1a(job_id) or 424242)
        for i in range(9):
            size = 0.25 + rng() * 0.8
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size,
                                                  location=((rng() - 0.5) * 16, (rng() - 0.5) * 16, size * 0.35))
            rock = bpy.context.active_object
            rock.scale = (1.0, 0.8 + rng() * 0.4, 0.6 + rng() * 0.5)
            rock.data.materials.append(mat)

        blade_mat = bpy.data.materials.new("BladeMat")
        blade_mat.use_nodes = True
        nodes = blade_mat.node_tree.nodes
        b = nodes.get("Principled BSDF")
        if b:
            nodes.remove(b)
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs[0].default_value = (0.25, 0.95, 0.82, 1.0)
        emission.inputs[1].default_value = 2.0 + float(scene_p.get("energyIntensity", 0.6)) * 8.0
        out_node = nodes.get("Material Output")
        blade_mat.node_tree.links.new(emission.outputs[0], out_node.inputs[0])

        # ── subject: skeletal stand-in when the shot carries poses,
        #    the legacy plinth + floating blade otherwise ──
        pose_start = normalize_pose(shot.get("poseStart"))
        pose_end = normalize_pose(shot.get("poseEnd"))
        figure = None
        state["posesRequested"] = [str(shot.get("poseStart")), str(shot.get("poseEnd"))]
        state["posesResolved"] = [pose_start, pose_end]
        state["scriptMtime"] = os.path.getmtime(__file__)
        if pose_start or pose_end:
            figure = build_stand_in_figure(bpy, scn, mat, blade_mat)
        else:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=0.9, location=(0, 0, 0.45))
            scn.collection.objects[-1].data.materials.append(mat)
            bpy.ops.mesh.primitive_cone_add(radius1=0.14, radius2=0.0, depth=1.9, vertices=6, location=(0, 0, 1.85))
            blade = scn.collection.objects[-1]
            blade.rotation_euler = (0.05, 0.12, 0.4)
            blade.data.materials.append(blade_mat)

        # ── AnimeOS scene params ──
        fog = float(scene_p.get("fogDensity", 0.45))
        world = bpy.data.worlds.new("AnimeOSWorld")
        scn.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes.get("Background")
        if bg:
            base = 0.04 + 0.22 * (1.0 - fog)
            bg.inputs[0].default_value = (base * 0.8, base * 0.95, base * 1.15, 1.0)
            bg.inputs[1].default_value = 1.0

        lightning = float(scene_p.get("lightningIntensity", 0.55))
        sun_data = bpy.data.lights.new("Sun", "SUN")
        sun_data.energy = 1.0 + lightning * 6.0
        sun = bpy.data.objects.new("Sun", sun_data)
        sun.rotation_euler = (math.radians(65), 0, math.radians(35))
        scn.collection.objects.link(sun)
        sun_base = sun_data.energy

        rim_e = float(scene_p.get("rimLightIntensity", 0.5))
        energy_e = float(scene_p.get("energyIntensity", 0.6))
        for i, e in enumerate((rim_e, energy_e)):
            light_data = bpy.data.lights.new(f"Fill{i}", "AREA")
            light_data.size = 4.0
            light_data.energy = 200 + e * 1800
            light = bpy.data.objects.new(f"Fill{i}", light_data)
            light.rotation_euler = (math.radians(-55), math.radians(20 * (i or -1)), 0)
            light.location = ((3.5, -4.0, 2.6) if i == 0 else (-3.0, 3.5, 3.2))
            scn.collection.objects.link(light)

        # ── render settings ──
        windows = lightning_windows(job_id, lightning, duration_sec)
        scn.render.engine = "CYCLES"
        scn.cycles.device = "CPU"
        scn.cycles.samples = 48 if mode == "FINAL" else 10
        scn.cycles.use_denoising = mode == "FINAL"
        scn.cycles.max_bounces = 0
        scn.cycles.diffuse_bounces = 0
        scn.cycles.glossy_bounces = 0
        scn.cycles.transmission_bounces = 0
        scn.cycles.transparent_max_bounces = 0
        scn.render.resolution_x = out_w
        scn.render.resolution_y = out_h
        scn.render.resolution_percentage = 100
        scn.render.image_settings.file_format = "PNG"
        scn.render.fps = fps
        scn.frame_start = 1
        scn.frame_end = frames_total

        cam_data = bpy.data.cameras.new("AnimeOSCam")
        cam = bpy.data.objects.new("AnimeOSCam", cam_data)
        scn.collection.objects.link(cam)
        scn.camera = cam

        frames_dir = os.path.join(out_dir, f".frames-{job_id}")
        os.makedirs(frames_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{job_id}.mp4")

        # ── frame loop: camera grammar + lightning strobe per frame ──
        for f in range(1, frames_total + 1):
            t = (f - 1) / max(1, frames_total - 1)
            pos, target, lens = camera_pose(shot, scene_p, t)
            cam.data.lens = lens
            cam.location = mathutils.Vector(pos)
            direction = mathutils.Vector(target) - cam.location
            cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

            t_sec = (f - 1) / fps
            if figure:
                apply_pose(figure, pose_start, pose_end, t, t_sec)
            boost = 0.0
            for (start, dur, alpha) in windows:
                if start <= t_sec <= start + dur:
                    boost = alpha * 9.0
                    break
            sun_data.energy = sun_base + boost

            scn.frame_set(f)
            scn.render.filepath = os.path.join(frames_dir, f"f_{f:04d}.png")
            bpy.ops.render.render(write_still=True)
            state["progress"] = 0.05 + 0.8 * (f / frames_total)
            state["stage"] = f"Blender: rendering frame {f}/{frames_total}"
            flush()

        # ── encode ──
        state["stage"] = "Blender: encoding clip"
        state["progress"] = 0.9
        flush()
        encode_ok = False
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg:
            try:
                subprocess.run(
                    [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                     "-framerate", str(fps), "-i", os.path.join(frames_dir, "f_%04d.png"),
                     "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                     "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path],
                    check=True, timeout=300,
                )
                encode_ok = os.path.exists(out_path) and os.path.getsize(out_path) > 0
            except Exception:  # noqa: BLE001
                encode_ok = False
        if not encode_ok:
            # Blender's own FFMPEG writer as the fallback
            try:
                scn.render.image_settings.file_format = "FFMPEG"
                scn.render.ffmpeg.format = "MPEG4"
                scn.render.ffmpeg.codec = "H264"
                scn.render.ffmpeg.constant_rate_factor = "HIGH"
                scn.render.ffmpeg.gopsize = 18
                scn.render.ffmpeg.audio_codec = "NONE"
                scn.render.filepath = out_path
                bpy.ops.render.render(animation=True)
                encode_ok = os.path.exists(out_path) and os.path.getsize(out_path) > 0
            except Exception:  # noqa: BLE001
                encode_ok = False

        shutil.rmtree(frames_dir, ignore_errors=True)

        if not encode_ok:
            fail("clip encoding failed")
            return
        state["progress"] = 1.0
        state["stage"] = "Blender: clip ready"
        state["mp4Path"] = out_path
        state["done"] = True
        flush()
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        fail(exc)


# ═══ SERVER MODE (plain python; bpy NOT required) ═════════════

class BridgeServer:
    def __init__(self, blender_bin):
        self.lock = threading.Lock()
        self.jobs = {}  # job_id -> {"jobFile", "mp4Cache", "done"}
        self.current = None
        self.blender_bin = blender_bin
        self.blender_version = None
        self.script_path = os.path.abspath(__file__)

    def probe_version(self):
        try:
            out = subprocess.run([self.blender_bin, "--version"], capture_output=True, text=True, timeout=20)
            first = (out.stdout or "").splitlines()
            self.blender_version = first[0].replace("Blender", "").strip() if first else "unknown"
        except Exception:  # noqa: BLE001
            self.blender_version = "unknown"

    def status(self):
        with self.lock:
            busy = self.current is not None
        return {
            "ok": True,
            "blender_version": self.blender_version or "unknown",
            "scene": "AnimeOS sequence worker pool",
            "busy": busy,
        }

    def submit(self, payload):
        job_id = str(payload.get("jobId") or f"job_{int(time.time())}")
        with self.lock:
            if self.current is not None:
                return {"error": "busy", "current_job": self.current}, 409
            self.current = job_id
            job_file = os.path.join(render_dir(), f".job-{job_id}.json")
            self.jobs[job_id] = {"jobFile": job_file, "mp4Cache": None, "done": False}
        with open(job_file, "w", encoding="utf-8") as fh:
            json.dump({"jobId": job_id, "payload": payload, "outDir": render_dir()}, fh)
        threading.Thread(target=self._run_worker, args=(job_id, job_file), daemon=True).start()
        return {"ok": True, "jobId": job_id}, 200

    def _run_worker(self, job_id, job_file):
        entry = self.jobs.get(job_id)
        try:
            cmd = [self.blender_bin, "-b", "-P", self.script_path, "--", "--worker", "--job", job_file]
            subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        finally:
            with open(job_file, "r", encoding="utf-8") as fh:
                state = json.load(fh)
            state.setdefault("done", True)
            if not state.get("done"):
                state["done"] = True
                state.setdefault("error", "worker exited unexpectedly")
            tmp = job_file + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(state, fh)
            os.replace(tmp, job_file)
            with self.lock:
                self.current = None

    def progress(self, job_id):
        entry = self.jobs.get(job_id)
        if not entry:
            return {"error": "unknown job"}, 404
        try:
            with open(entry["jobFile"], "r", encoding="utf-8") as fh:
                state = json.load(fh)
        except Exception:  # noqa: BLE001
            return {"progress": 0.0, "stage": "queued", "done": False}, 200
        out = {"progress": state.get("progress", 0.0), "stage": state.get("stage", ""), "done": bool(state.get("done"))}
        if state.get("error"):
            out["error"] = state["error"]
        if out["done"] and not out.get("error") and state.get("mp4Path"):
            if entry["mp4Cache"] is None:
                try:
                    with open(state["mp4Path"], "rb") as fh:
                        entry["mp4Cache"] = base64.b64encode(fh.read()).decode("ascii")
                except Exception:  # noqa: BLE001
                    entry["mp4Cache"] = ""
            if entry["mp4Cache"]:
                out["mp4_base64"] = entry["mp4Cache"]
        return out, 200


def run_server(port, blender_bin):
    bridge = BridgeServer(blender_bin)
    bridge.probe_version()

    class Handler(BaseHTTPRequestHandler):
        def _json(self, obj, code=200):
            body = json.dumps(obj).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path == "/status":
                self._json(bridge.status())
            elif parsed.path == "/progress":
                job_id = (parse_qs(parsed.query).get("job_id") or [""])[0]
                out, code = bridge.progress(job_id)
                self._json(out, code)
            elif parsed.path == "/ping":
                self._json({"ok": True})
            else:
                self._json({"error": "not found"}, 404)

        def do_POST(self):  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path not in ("/render", "/ping"):
                self._json({"error": "not found"}, 404)
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length) or b"{}")
            except (ValueError, json.JSONDecodeError):
                self._json({"error": "malformed JSON"}, 400)
                return
            if parsed.path == "/ping":
                self._json({"ok": True})
                return
            out, code = bridge.submit(payload)
            self._json(out, code)

        def log_message(self, fmt, *args):  # quiet
            sys.stdout.write("[animeos-bridge] " + (fmt % args) + "\n")

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"[animeos-bridge] serving on 127.0.0.1:{port} (workers via {blender_bin})", flush=True)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


def main():
    argv = sys.argv
    port = PORT_DEFAULT
    worker_job = None
    extra = argv[argv.index("--") + 1:] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=PORT_DEFAULT)
    parser.add_argument("--worker", action="store_true")
    parser.add_argument("--job", type=str, default=None)
    args, _ = parser.parse_known_args(extra)
    port = args.port

    if args.worker and args.job:
        worker_run(args.job)
        return

    # Resolve the blender binary that worker subprocesses will use:
    # inside Blender sys.executable IS the blender binary; on a plain
    # python3 server fall back to PATH / ANIMEOS_BLENDER_BIN.
    blender_bin = sys.executable if os.path.basename(sys.executable).startswith("blender") else shutil.which("blender")
    blender_bin = blender_bin or os.environ.get("ANIMEOS_BLENDER_BIN") or ""
    if blender_bin and not os.path.exists(blender_bin):
        blender_bin = ""
    if not blender_bin:
        print("[animeos-bridge] no blender binary found - set ANIMEOS_BLENDER_BIN", flush=True)
        sys.exit(1)

    run_server(port, blender_bin)


if __name__ == "__main__":
    main()
