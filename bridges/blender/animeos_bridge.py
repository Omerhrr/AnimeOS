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
#
# v3.2 upgrades the stand-in RIG with a FACE and HANDS. The head grows
# a face (emissive eyes that squint and blink on a deterministic
# schedule, brows that tilt angry or surprised, a mouth that opens
# with effort) and both arms end in real hands (palm, four fingers
# and a thumb) that curl into grips, spread to channel energy or
# extend an index finger to point. Every pose in the vocabulary now
# also carries a 7-channel FACE/HAND row (POSE_FACE below), eased
# between the start and end pose exactly like the joints, so a LUNGE
# snarls, a CAST spreads its fingers, a BOW closes its eyes and a
# POINT extends the index. Idle micro-motion (brow drift, blinking)
# keeps the face alive on holds.
#
# v3.3 adds LIP-SYNC on speaking closeups: a shot with SPEECH dialogue
# and a tight framing arrives with an extra payload field
#   "speech": {"lines": n, "visemes": [{"s","e","o","w","r"}, ...]}
# (millisecond viseme segments precomputed from the dialogue and its
# voice-take windows). The worker samples the program per frame and
# the mouth PERFORMS the lines - openness follows the phonemes, the
# mouth spreads on "ee" vowels and purses on "oo", while the pose's
# own mouth channel stays as the effort floor. The worker state
# reports the program ({"speech": {"lines", "visemes"}}) so the
# pipeline can assert the lip-sync shipped.
#
# v4.0 is the DESIGNED pass: AnimeOS compiles the production's design
# text (model-sheet anchors, appearance notes, wardrobe/weapon states,
# environment briefs) into DESIGN DNA and sends it with the job
#   shot.cast = [{name, hairColor, hairStyle, robeColor, robeAccent,
#                 skinTone, weaponType, bladeColor, build}, ...]
#   scene.environment = {name, terrain, timeOfDay, weather, skyColor,
#                 fogColor, groundColor, keyLight, features[...]}
# The worker then renders the DESIGNED character - stylized smooth
# figure, layered robes with sleeves/cuffs/sash, hairstyle (topknot /
# ponytail / braid / long / short), per-DNA weapon (sword / staff /
# spear) with the character's energy color - on a DESIGNED set
# (terrace / peak / forest / gorge / temple terrain, moons, pagoda,
# bell, banners, pillars, bamboo, cloud sea, lanterns, waterfall) with
# a time-of-day sky and key light. The same DNA drives the browser
# preview, so both layers agree on the production's look. Without DNA
# the v3.3 stand-in paths still run (nothing breaks for old callers).

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


# ─── per-pose face/hand channels (v3.2 rig upgrade) ──────────────
#
# Same 13-pose vocabulary, second table: every pose also expresses
# through the face and the hands. Channels per row:
#          brow  eye  mouth gripR gripL pointR pointL
#   brow   degrees, + lifts the inner ends (surprised/worried),
#          - knits them down (angry/focused)
#   eye    openness 0..1.2 (1 = open, <0.6 squint, ~0 shut)
#   mouth  openness 0..1 (0 = closed line, 1 = full shout)
#   gripR/L  fist curl 0..1 (0 = open hand, 1 = full grip)
#   pointR/L index-finger extension 0..1 (overrides the curl on
#          the index so POINT keeps one finger straight)
POSE_FACE = {
    #        brow  eye  mouth gripR gripL pointR pointL
    "STANCE": (  0, 1.00, 0.10, 0.55, 0.30,   0.0,   0.0),
    "WALK":   (  0, 0.90, 0.15, 0.55, 0.25,   0.0,   0.0),
    "LUNGE":  (-25, 1.10, 0.80, 0.90, 0.50,   0.0,   0.0),
    "SLASH":  (-30, 1.00, 0.90, 1.00, 0.60,   0.0,   0.0),
    "CAST":   ( 12, 0.45, 0.35, 0.10, 0.10,   0.0,   0.0),
    "DRAW":   (-10, 0.60, 0.10, 0.90, 0.90,   0.0,   0.0),
    "BLOCK":  (-18, 1.20, 0.60, 0.95, 0.95,   0.0,   0.0),
    "LEAP":   ( 10, 1.20, 0.70, 0.70, 0.60,   0.0,   0.0),
    "CROUCH": ( -5, 0.80, 0.20, 0.50, 0.40,   0.0,   0.0),
    "FALL":   ( 18, 0.25, 0.85, 0.20, 0.20,   0.0,   0.0),
    "RISE":   ( -8, 0.70, 0.30, 0.40, 0.35,   0.0,   0.0),
    "BOW":    (  0, 0.05, 0.05, 0.30, 0.30,   0.0,   0.0),
    "POINT":  (  4, 1.00, 0.45, 0.10, 0.30,   1.0,   0.0),
}

FACE_CHANNELS = 7  # brow, eye, mouth, gripR, gripL, pointR, pointL


def normalize_face_row(row):
    """Coerce a POSE_FACE row to FACE_CHANNELS floats (defensive: a
    malformed table entry must never break a render)."""
    vals = list(row)[:FACE_CHANNELS]
    while len(vals) < FACE_CHANNELS:
        vals.append(0.0)
    return tuple(float(v) for v in vals)


def face_row(pose):
    return normalize_face_row(POSE_FACE.get(normalize_pose(pose) or "STANCE", POSE_FACE["STANCE"]))


def lerp_face(start, end, t):
    """Eased interpolation of the 7 face/hand channels between the
    shot's start and end poses (same easing clock as the joints)."""
    a = face_row(start)
    b = face_row(end)
    k = ease_in_out_cubic(t)
    return tuple(a[i] + (b[i] - a[i]) * k for i in range(FACE_CHANNELS))


def blink_openness(t_sec, eye):
    """Deterministic blink: every ~2.6s the lids close for ~0.14s.
    A function of t_sec only, so any frame re-renders identically."""
    phase = t_sec % 2.6
    if phase < 0.14:
        return eye * 0.08
    return eye


def finger_curl(grip, point, is_index):
    """Map grip 0..1 to a finger rotation in degrees. The index finger
    straightens as `point` rises, so POINT keeps it extended while the
    other fingers stay curled."""
    base = clamp(grip, 0.0, 1.0) * 78.0
    if is_index:
        base *= 1.0 - clamp(point, 0.0, 1.0)
    return base


def thumb_curl(grip):
    return clamp(grip, 0.0, 1.0) * 46.0


def mouth_scale(mouth):
    """Mouth slab scale on Z: 0.3 = closed line, ~1.7 = full shout."""
    return 0.3 + 1.4 * clamp(mouth, 0.0, 1.0)


# ─── lip-sync (v3.3): viseme program for speaking closeups ──────
#
# A speaking closeup arrives with shot.speech = {"lines": n,
# "visemes": [{s, e, o, w, r}, ...]} - millisecond viseme segments
# built from the shot's SPEECH dialogue (and its rendered voice-take
# windows when those exist). o = openness 0..1, w = wide spread
# ("ee"), r = round purse ("oo"). The worker samples the program per
# frame and the mouth rig PERFORMS the lines instead of holding the
# pose's static mouth channel.

VISEME_DECAY_MS = 90.0


def parse_speech(shot_payload):
    """Defensively extract the viseme program from the payload: a bad
    shape must never break a render (falls back to no speech)."""
    speech = shot_payload.get("speech") or {}
    rows = speech.get("visemes") or []
    out = []
    for v in rows:
        try:
            s, e = float(v.get("s", 0)), float(v.get("e", 0))
            o = clamp(float(v.get("o", 0)), 0.0, 1.0)
            w = clamp(float(v.get("w", 0)), 0.0, 1.0)
            r = clamp(float(v.get("r", 0)), 0.0, 1.0)
            if e > s:
                out.append((s, e, o, w, r))
        except Exception:  # noqa: BLE001
            continue
    return out


def speech_open_at(visemes, t_ms):
    """Mouth shape at t_ms from the viseme program (mirrors the TS
    sampleSpeech): the segment covering t, or a short decay out of the
    previous one so the mouth never snaps between phonemes. None when
    nothing is being spoken."""
    prev = None
    for (s, e, o, w, r) in visemes:
        if s <= t_ms < e:
            return {"o": o, "w": w, "r": r}
        if t_ms < s:
            if prev is not None and t_ms < prev[1] + VISEME_DECAY_MS:
                k = 1.0 - (t_ms - prev[1]) / VISEME_DECAY_MS
                return {"o": prev[2] * k, "w": prev[3] * k, "r": prev[4] * k}
            return None
        prev = (s, e, o, w, r)
    return None


def eye_scale(eye):
    """Eye lid openness as a Z squash on the eye sphere (never fully
    flat so the eyeball stays visible)."""
    return max(0.12, clamp(eye, 0.0, 1.2))


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
    # the DESIGNED figure is the subject whenever cast DNA exists -
    # posed or just standing - so the prop-scale framing applies to
    # every cast shot (the s3.2 lesson: a no-pose EXTREME_CLOSEUP kept
    # the full-scale table and hovered at 1.16m over a 0.9m figure,
    # grading a flat rectangle of terrace)
    framed = has_poses or bool(shot_payload.get("cast"))
    if framed:
        # prop-scale distance: the designed figure stands ~0.9m tall
        # (0.45x), and the lens table was tuned for full-scale sets -
        # at 1.25x a MEDIUM saw only 0.43m of frame height (a shins-
        # only closeup). 1.9x puts a waist-up MEDIUM at ~1.9m; wide
        # framings cap tighter so a night establishing never loses
        # the subject entirely
        dist *= 1.9 if dist <= 1.2 else 1.35

    angle = 40.0
    radius = dist
    h = height
    lateral = 0.0
    # pose shots frame the DESIGNED figure: camera at chest/face
    # height (NOT the 1.2-1.6m lens heights - those pitched every
    # pose shot down onto the hero's head), tight shot types aim at
    # the FACE (0.84m post-scale), wider framings at the chest (0.62m)
    if framed:
        h = 0.62 + height * 0.12
        target = [0.0, 0.0, 0.84 if dist < 1.2 else 0.62]
        # and the camera stays on the figure's FRONT side: the figure
        # faces -Y, and the old base-angle formula (0.9 + n*0.7 rad)
        # landed tight framings on the back of the hair - a black
        # frame. Small spread around -100 deg keeps every shot on the
        # face while shot-to-shot variety survives.
        angle = math.radians(-100.0 + 16.0 * ((shot_payload.get("number") or 1) % 7))
    else:
        target = [0.0, 0.0, height * 0.75]

    if movement == "ORBIT":
        angle = angle + (t - 0.5) * 44.0
        radius = dist * (1.0 + 0.05 * math.sin(t * math.pi))
    elif movement == "DOLLY_IN":
        radius = dist * (1.0 - 0.28 * t)
    elif movement == "DOLLY_OUT":
        radius = dist * (0.72 + 0.28 * t)
    elif movement == "PAN":
        angle = angle + math.sin((t - 0.5) * math.pi) * 24.0
    elif movement == "TRACKING":
        lateral = (t - 0.5) * dist * 0.42
    elif movement == "CRANE":
        h = h + (1.1 if framed else 2.2) * (1.0 - t)
        radius = dist * (1.0 + 0.1 * t)
    elif movement == "TILT_UP":
        target[2] = (0.3 + 0.55 * t) if framed else height * (0.35 + 0.55 * t)
    elif movement == "TILT_DOWN":
        target[2] = (0.8 - 0.55 * t) if framed else height * (0.9 - 0.55 * t)

    if framed and has_poses:
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
    hand, so slashes and casts carry the energy glow with them.

    v3.2 rig upgrade: the head carries a FACE (emissive eyes under
    squashable empties, tilting brows, an opening mouth) and both arms
    end in HANDS (palm + four fingers + thumb under curl pivots), all
    driven per frame from the POSE_FACE channels by apply_pose."""
    def empty(name, parent, loc):
        e = bpy.data.objects.new(name, None)
        scn.collection.objects.link(e)
        e.empty_display_size = 0.05
        if parent:
            e.parent = parent
        e.location = loc
        return e

    def limb(name, parent, loc, scale):
        m = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
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
    hm = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=2, radius=0.12, location=(0, 0, 0), )
    hm.name = "HeadMesh"
    hm.data.materials.append(body_mat)
    hm.parent = head
    hm.location = (0.0, 0.0, 0.12)

    # ── face (v3.2): eyes, brows, mouth on the -Y side of the head ──
    eye_mat = bpy.data.materials.new("EyeMat")
    eye_mat.use_nodes = True
    en = eye_mat.node_tree.nodes
    eb = en.get("Principled BSDF")
    if eb:
        en.remove(eb)
    eye_emit = en.new("ShaderNodeEmission")
    eye_emit.inputs[0].default_value = (0.72, 0.92, 1.0, 1.0)
    eye_emit.inputs[1].default_value = 3.0
    eye_out = en.get("Material Output")
    eye_mat.node_tree.links.new(eye_emit.outputs[0], eye_out.inputs[0])

    feature_mat = bpy.data.materials.new("FeatureMat")
    feature_mat.use_nodes = True
    fb = feature_mat.node_tree.nodes.get("Principled BSDF")
    if fb:
        fb.inputs["Base Color"].default_value = (0.012, 0.012, 0.016, 1.0)
        fb.inputs["Roughness"].default_value = 0.9

    def eye(side_sign, name):
        piv = empty(name, head, (side_sign * 0.045, -0.105, 0.15))
        m = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=1, radius=0.018, location=(0, 0, 0), )
        m.name = name + "Mesh"
        m.data.materials.append(eye_mat)
        m.parent = piv
        return piv

    def brow(side_sign, name):
        piv = empty(name, head, (side_sign * 0.048, -0.112, 0.185))
        m = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
        m.name = name + "Mesh"
        m.scale = (0.028, 0.007, 0.006)
        m.data.materials.append(feature_mat)
        m.parent = piv
        return piv

    eye_l = eye(1.0, "EyeL")
    eye_r = eye(-1.0, "EyeR")
    brow_l = brow(1.0, "BrowL")
    brow_r = brow(-1.0, "BrowR")
    mouth = empty("Mouth", head, (0.0, -0.106, 0.052))
    mm = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
    mm.name = "MouthMesh"
    mm.scale = (0.026, 0.006, 0.011)
    mm.data.materials.append(feature_mat)
    mm.parent = mouth

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

    # ── hands (v3.2): palm + four fingers + thumb under curl pivots.
    # Each hand lives under a Hand empty at the wrist (elbow-local
    # z -0.26, just past the forearm mesh); the palm, finger pivots and
    # thumb hang below it so curls wrap around whatever the hand holds.
    def hand(prefix, parent_empty, thumb_side):
        palm = empty(prefix + "Palm", parent_empty, (0.0, 0.0, -0.01))
        pm = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
        pm.name = palm.name + "Mesh"
        pm.scale = (0.0225, 0.01, 0.03)
        pm.data.materials.append(body_mat)
        pm.parent = palm
        fingers = []
        index_x = 0.0055 * thumb_side  # the finger adjacent to the thumb
        for fx in (-0.0165, -0.0055, 0.0055, 0.0165):
            is_index = abs(fx - index_x) < 0.001
            piv = empty(prefix + ("Index" if is_index else f"Finger{len(fingers)}"), palm, (fx, 0.0, -0.055))
            fm = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
            fm.name = piv.name + "Mesh"
            fm.scale = (0.0048, 0.0055, 0.021)
            fm.data.materials.append(body_mat)
            fm.parent = piv
            fm.location = (0.0, 0.0, -0.019)
            fingers.append((piv, is_index))
        tp = empty(prefix + "Thumb", palm, (thumb_side * 0.026, -0.002, -0.015))
        tm = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
        tm.name = tp.name + "Mesh"
        tm.scale = (0.005, 0.0055, 0.016)
        tm.data.materials.append(body_mat)
        tm.parent = tp
        tm.location = (0.0, 0.0, -0.014)
        tp.rotation_euler = (math.radians(20), 0.0, math.radians(-35 * thumb_side))
        return fingers, tp

    r_hand = empty("RHand", r_elbow, (0.0, 0.0, -0.26))
    l_hand = empty("LHand", l_elbow, (0.0, 0.0, -0.26))
    r_fingers, r_thumb = hand("R", r_hand, 1.0)   # right hand: thumb toward the body (+X inner)
    l_fingers, l_thumb = hand("L", l_hand, -1.0)

    blade = prim(scn, bpy.ops.mesh.primitive_cone_add, radius1=0.05, radius2=0.0, depth=1.2, vertices=6, location=(0, 0, 0), )
    blade.name = "HandBlade"
    blade.data.materials.append(blade_mat)
    blade.parent = r_hand
    blade.location = (0.0, -0.05, -0.07)  # between palm and fingers: a gripped blade
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
        # v3.2 face + hand rig
        "eyeL": eye_l, "eyeR": eye_r,
        "browL": brow_l, "browR": brow_r, "mouth": mouth,
        "rFingers": r_fingers, "lFingers": l_fingers,
        "rThumb": r_thumb, "lThumb": l_thumb,
        "blade": blade,
    }


def apply_pose(figure, pose_start, pose_end, t, t_sec, speech=None):
    """Pose the stand-in for this frame: eased interpolation between the
    shot's start/end poses, plus a procedural walk cycle when either
    endpoint is WALK (stride swing on hips/shoulders, counter-swing on
    the opposite arm, a small root bob).

    v3.2: the pose also EXPRESSES - the 7 POSE_FACE channels (brow,
    eye, mouth, grips, points) interpolate with the same easing clock
    and drive the face and finger rig, a deterministic blink and a
    slow brow drift keep holds alive, and the blade carries a small
    follow-through tilt proportional to the swing rate of the right
    shoulder (secondary motion).

    v3.3 LIP-SYNC: on a speaking closeup `speech` carries the sampled
    viseme shape for this frame ({o, w, r}); the mouth then performs
    the line (the pose's mouth channel stays as a floor for shouts)
    and widens/purses with the vowels."""
    (root_x, root_y, spine_a, head_a, r_arm, r_elb, l_arm, l_elb, r_leg, r_knee, l_leg, l_knee) = lerp_pose(pose_start, pose_end, t)
    (brow, eye, mouth, grip_r, grip_l, point_r, point_l) = lerp_face(pose_start, pose_end, t)
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

    # ── face rig (v3.2): brows mirror their tilt so the inner ends
    # move together (+ brow = inner up, surprised; - = angry knit),
    # eyes squash with openness and blink on the deterministic
    # schedule, the mouth slab opens with the channel value, and a
    # slow sinus drift keeps the brows alive on holds
    brow += math.sin(t_sec * math.pi * 2.0 * 0.9) * 1.5
    eye = blink_openness(t_sec, eye)
    figure["browL"].rotation_euler = (0.0, math.radians(brow), 0.0)
    figure["browR"].rotation_euler = (0.0, math.radians(-brow), 0.0)
    es = eye_scale(eye)
    figure["eyeL"].scale = (1.0, 1.0, es)
    figure["eyeR"].scale = (1.0, 1.0, es)
    # lip-sync (v3.3): a viseme sample drives openness and shapes the
    # mouth wide ("ee") or round ("oo"); the pose mouth stays as a
    # floor so an effort shout is never flattened by a quiet phoneme
    if speech is not None:
        mouth = max(mouth * 0.35, speech.get("o", 0.0))
        wide = speech.get("w", 0.0)
        rnd = speech.get("r", 0.0)
        sx = clamp(1.0 + 0.35 * wide - 0.45 * rnd, 0.55, 1.45)
        figure["mouth"].scale = (sx, 1.0, mouth_scale(mouth))
    else:
        figure["mouth"].scale = (1.0, 1.0, mouth_scale(mouth))

    # ── hand rig (v3.2): grip curls the fingers, point straightens the
    # index, the thumb half-curls with the grip
    for side, grip, point in (("r", grip_r, point_r), ("l", grip_l, point_l)):
        for piv, is_index in figure[f"{side}Fingers"]:
            piv.rotation_euler.x = math.radians(finger_curl(grip, point, is_index))
        figure[f"{side}Thumb"].rotation_euler.x = math.radians(20 + thumb_curl(grip))

    # ── blade follow-through: proportional to the eased swing rate of
    # the right shoulder, clamped so fast slashes lag believably but
    # never break the read of the pose
    a_row = POSE_JOINTS[normalize_pose(pose_start) or "STANCE"]
    b_row = POSE_JOINTS[normalize_pose(pose_end) or "STANCE"]
    x = clamp(t, 0.0, 1.0)
    k_deriv = 12.0 * x * x if x < 0.5 else 12.0 * (1.0 - x) * (1.0 - x)
    lag = clamp((b_row[4] - a_row[4]) * k_deriv * 0.03, -12.0, 12.0)
    figure["blade"].rotation_euler.x = math.radians(-72.0 + lag)


# ─── design DNA (v4.0): the DESIGNED render pass ─────────────────
#
# AnimeOS now compiles the production's design text (model-sheet
# anchors, appearance notes, wardrobe/weapon states, environment
# briefs) into a small DNA structure it sends with every job:
#   shot.cast = [{"name","hairColor","hairStyle","robeColor",
#                 "robeAccent","skinTone","weaponType","bladeColor",
#                 "build"}, ...]          (index 0 = the hero)
#   scene.environment = {"name","terrain","timeOfDay","weather",
#                 "skyColor","fogColor","groundColor","keyLight",
#                 "features":[...]}
# The worker then builds the DESIGNED character (hair, layered robes,
# weapon, stylized face) on a DESIGNED set (terrain, features, sky,
# key light) instead of the anonymous box stand-in and flat plate.
# When the DNA is absent the v3.3 stand-in paths still run - nothing
# breaks for old callers.

def hex_to_rgb(h, fallback=(0.2, 0.2, 0.22)):
    """'#2f6d63' -> LINEAR floats for Blender's color inputs.

    Hex colors are sRGB; Blender's RGB inputs are linear. Feeding
    sRGB values straight in rendered every DNA color ~2x lighter
    than authored (black hair came out grey, night sky came out
    overcast noon) - hence the proper transfer function here."""
    try:
        h = str(h).lstrip("#")
        if len(h) != 6:
            return fallback
        out = []
        for i in (0, 2, 4):
            v = int(h[i:i + 2], 16) / 255.0
            v = v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
            out.append(v)
        return tuple(out)
    except Exception:  # noqa: BLE001
        return fallback


def principled_mat(bpy, name, color_hex, roughness=0.8, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes.get("Principled BSDF")
    if b:
        b.inputs["Base Color"].default_value = (*hex_to_rgb(color_hex), 1.0)
        b.inputs["Roughness"].default_value = roughness
        if metallic:
            b.inputs["Metallic"].default_value = metallic
    return mat


def emission_mat(bpy, name, color_hex, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    b = nodes.get("Principled BSDF")
    if b:
        nodes.remove(b)
    em = nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = (*hex_to_rgb(color_hex), 1.0)
    em.inputs[1].default_value = strength
    out = nodes.get("Material Output")
    mat.node_tree.links.new(em.outputs[0], out.inputs[0])
    return mat


def smooth(obj):
    """Smooth-shade a mesh so primitives read as cloth/skin, not blocks."""
    if obj and obj.type == "MESH":
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def prim(scn, op, **kw):
    """Run a bpy.ops.mesh.primitive_* add and return the NEW object.

    Background-mode operators have been observed to leave
    bpy.context.active_object pointing at the PREVIOUS object (a
    v4.0 smoke test grew one unscaled 2m 'tile' because the scale
    assignment landed on its neighbour). The set difference is the
    only reliable way to know what the operator just created."""
    before = set(scn.objects)
    op(**kw)
    fresh = [o for o in scn.objects if o not in before and o.type == "MESH"]
    return fresh[-1] if fresh else bpy.context.active_object


def build_designed_figure(bpy, scn, dna, mats):
    """The DESIGNED character (v4.0): stylized proportions, layered
    robes with a flowing skirt and wide sleeves, hairstyle per DNA,
    a weapon per DNA, all hanging on the SAME joint hierarchy as the
    v3.2 stand-in - so apply_pose, the face rig, lip-sync and the
    camera framing math work unchanged."""
    robe_mat = mats["robe"]
    accent_mat = mats["accent"]
    skin_mat = mats["skin"]
    hair_mat = mats["hair"]
    blade_mat = mats["blade"]
    boots_mat = mats["boots"]

    lean = dna.get("build") == "lean"
    sturdy = dna.get("build") == "sturdy"
    width = 0.85 if lean else (1.18 if sturdy else 1.0)

    def empty(name, parent, loc):
        e = bpy.data.objects.new(name, None)
        scn.collection.objects.link(e)
        e.empty_display_size = 0.05
        if parent:
            e.parent = parent
        e.location = loc
        return e

    def sphere(name, parent, loc, radius, mat, scale=(1, 1, 1)):
        m = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=3, radius=radius, location=(0, 0, 0), )
        m.name = name
        m.data.materials.append(mat)
        m.parent = parent
        m.location = loc
        m.scale = scale
        smooth(m)
        return m

    def capsule(name, parent, loc, r, depth, mat, rot=(0, 0, 0)):
        m = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=16, radius=r, depth=depth, location=(0, 0, 0), )
        m.name = name
        m.data.materials.append(mat)
        bpy.ops.object.shade_smooth()
        m.parent = parent
        m.location = loc
        m.rotation_euler = rot
        # cap the ends so joints never show hard discs
        return m

    # ── joint hierarchy: IDENTICAL anchors to the v3.x stand-in ──
    root = empty("Root", None, (0.0, 0.0, 0.0))
    pelvis = empty("Pelvis", root, (0.0, 0.0, 1.02))

    # hips block (under the robe) + torso
    sphere("HipsMesh", pelvis, (0.0, 0.0, 0.02), 0.13, robe_mat, scale=(1.05 * width, 0.8, 0.75))
    torso = capsule("TorsoMesh", pelvis, (0.0, 0.0, 0.22), 0.115 * width, 0.36, robe_mat)
    torso.scale = (1.0, 0.72, 1.0)
    # upper-chest wrap: slightly wider robe shell
    sphere("ChestMesh", pelvis, (0.0, 0.0, 0.4), 0.13, robe_mat, scale=(1.12 * width, 0.78, 0.95))

    spine = empty("Spine", pelvis, (0.0, 0.0, 0.45))
    head = empty("Head", spine, (0.0, 0.0, 0.28))

    # sash: the accent-color waist band over the robe
    sash = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=16, radius=0.135 * width, depth=0.09, location=(0, 0, 0), )
    sash.name = "SashMesh"
    sash.data.materials.append(accent_mat)
    bpy.ops.object.shade_smooth()
    sash.parent = pelvis
    sash.location = (0.0, 0.0, 0.13)
    # sash tails hang down the left hip
    tail = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
    tail.name = "SashTail"
    tail.scale = (0.035, 0.012, 0.16)
    tail.rotation_euler = (math.radians(6), 0.0, math.radians(9))
    tail.data.materials.append(accent_mat)
    tail.parent = pelvis
    tail.location = (0.07 * width, -0.1, 0.02)

    # skirt: overlapping cloth panels flaring from the waist - the
    # donghua robe read. Static on the pelvis (legs pose beneath).
    for i in range(8):
        a = i * (math.tau / 8.0) + 0.18
        px, py = math.cos(a) * 0.09, math.sin(a) * 0.09
        panel = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
        panel.name = f"SkirtPanel{i}"
        panel.scale = (0.07 * width, 0.009, 0.19)
        panel.rotation_euler = (math.sin(a) * 0.1, -math.cos(a) * 0.1, a)
        panel.data.materials.append(robe_mat)
        panel.parent = pelvis
        panel.location = (px * 1.3, py * 1.3, -0.1)

    # neck + head (skin) - head mesh stays at spine-local z .12*? keep
    # the stand-in's world anchor: head empty +0.28, mesh center +0.12
    # neck: a high robe collar (accent) so the chin never floats over
    # a pale gap - donghua robes close at the throat
    capsule("NeckMesh", spine, (0.0, 0.0, 0.17), 0.036, 0.22, accent_mat)
    hm = sphere("HeadMesh", head, (0.0, 0.0, 0.12), 0.115, skin_mat, scale=(0.92, 0.98, 1.05))

    # ── face (v3.2 rig, restyled): stylized eyes with readable irises ──
    eye_mat = emission_mat(bpy, "EyeMat", "#cfe8ff", 2.4)
    iris_mat = emission_mat(bpy, "IrisMat", dna.get("bladeColor", "#5eead4"), 4.5)
    feature_mat = principled_mat(bpy, "FeatureMat", "#141118", 0.85)

    def eye(side_sign, name):
        piv = empty(name, head, (side_sign * 0.046, -0.104, 0.148))
        sphere(name + "Mesh", piv, (0, 0, 0), 0.016, eye_mat, scale=(1.0, 0.5, 1.2))
        # the iris must POKE out past the white sphere or it never shows
        sphere(name + "Iris", piv, (0, -0.011, 0), 0.008, iris_mat, scale=(1.0, 0.4, 1.4))
        return piv

    def brow(side_sign, name):
        piv = empty(name, head, (side_sign * 0.05, -0.108, 0.185))
        m = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
        m.name = name + "Mesh"
        m.scale = (0.03, 0.007, 0.007)
        m.data.materials.append(hair_mat)
        m.parent = piv
        return piv

    eye_l = eye(1.0, "EyeL")
    eye_r = eye(-1.0, "EyeR")
    brow_l = brow(1.0, "BrowL")
    brow_r = brow(-1.0, "BrowR")
    mouth = empty("Mouth", head, (0.0, -0.102, 0.05))
    mm = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
    mm.name = "MouthMesh"
    mm.scale = (0.024, 0.006, 0.011)
    mm.data.materials.append(feature_mat)
    mm.parent = mouth
    # nose hint
    sphere("NoseMesh", head, (0.0, -0.112, 0.095), 0.012, skin_mat, scale=(0.7, 0.7, 0.9))

    # ── hair: cap + fringe + back mass + style piece (the cap hugs
    #    the skull - a bigger sphere swallows the face) ──
    style = str(dna.get("hairStyle") or "short")
    sphere("HairCap", head, (0.0, 0.01, 0.16), 0.118, hair_mat, scale=(1.0, 1.02, 0.8))
    # a THIN crown band - a deep fringe hangs onto the eyes and reads
    # as a permanent scowl
    sphere("HairFringe", head, (0.0, -0.05, 0.205), 0.075, hair_mat, scale=(1.03, 0.4, 0.3))
    sphere("HairBack", head, (0.0, 0.055, 0.03), 0.09, hair_mat, scale=(1.02, 0.68, 1.3))
    if style == "topknot":
        sphere("HairKnot", head, (0.0, 0.01, 0.265), 0.036, hair_mat, scale=(1.0, 1.0, 1.15))
    elif style == "ponytail":
        for i, (dz, dy, r) in enumerate(((-0.02, 0.09, 0.030), (-0.14, 0.115, 0.024), (-0.25, 0.1, 0.017))):
            sphere(f"HairTail{i}", head, (0.0, dy, dz + 0.16), r, hair_mat)
    elif style == "braid":
        for i in range(5):
            t = i / 4.0
            sphere(f"HairBraid{i}", head, (0.0, 0.075 + 0.01 * math.sin(i * 2.1), 0.12 - t * 0.3), 0.016 - 0.002 * i, hair_mat)
    elif style == "long":
        sphere("HairLong", head, (0.0, 0.062, -0.06), 0.085, hair_mat, scale=(1.0, 0.55, 2.4))

    # ── arms: robe sleeves + skin forearms + v3.2 hands ──
    def arm(side_sign, prefix):
        sh = empty(prefix + "Shoulder", spine, (side_sign * 0.24 * width, 0.0, 0.18))
        # sleeve: wider cone over the upper arm (cloth, in robe color)
        sl = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=16, radius1=0.085 * width, radius2=0.05 * width, depth=0.3, location=(0, 0, 0), )
        sl.name = prefix + "Sleeve"
        sl.data.materials.append(robe_mat)
        bpy.ops.object.shade_smooth()
        sl.parent = sh
        sl.location = (0.0, 0.0, -0.15)
        capsule(prefix + "UpperArm", sh, (0.0, 0.0, -0.14), 0.038, 0.28, robe_mat)
        elb = empty(prefix + "Elbow", sh, (0.0, 0.0, -0.28))
        capsule(prefix + "Forearm", elb, (0.0, 0.0, -0.12), 0.03, 0.22, skin_mat)
        # wide cuff at the wrist (accent trim)
        cuff = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=14, radius=0.052, depth=0.09, location=(0, 0, 0), )
        cuff.name = prefix + "Cuff"
        cuff.data.materials.append(accent_mat)
        bpy.ops.object.shade_smooth()
        cuff.parent = elb
        cuff.location = (0.0, 0.0, -0.21)
        return sh, elb

    r_shoulder, r_elbow = arm(-1.0, "R")   # figure faces -Y: its right is -X
    l_shoulder, l_elbow = arm(1.0, "L")

    # ── legs: robe trousers + boots ──
    def leg(side_sign, prefix):
        hip = empty(prefix + "Hip", pelvis, (side_sign * 0.1 * width, 0.0, -0.02))
        capsule(prefix + "Thigh", hip, (0.0, 0.0, -0.24), 0.05 * width, 0.44, robe_mat)
        knee = empty(prefix + "Knee", hip, (0.0, 0.0, -0.46))
        capsule(prefix + "Shin", knee, (0.0, 0.0, -0.2), 0.04 * width, 0.36, robe_mat)
        # boot + ankle wrap
        capsule(prefix + "Boot", knee, (0.0, 0.01, -0.4), 0.045 * width, 0.12, boots_mat)
        capsule(prefix + "Wrap", knee, (0.0, 0.0, -0.33), 0.046 * width, 0.06, accent_mat)
        return hip, knee

    r_hip, r_knee = leg(-1.0, "R")
    l_hip, l_knee = leg(1.0, "L")

    # ── hands (v3.2 rig preserved, skin material) ──
    def hand(prefix, parent_empty, thumb_side):
        palm = empty(prefix + "Palm", parent_empty, (0.0, 0.0, -0.01))
        pm = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
        pm.name = palm.name + "Mesh"
        pm.scale = (0.02, 0.009, 0.026)
        pm.data.materials.append(skin_mat)
        pm.parent = palm
        fingers = []
        index_x = 0.0055 * thumb_side
        for fx in (-0.0165, -0.0055, 0.0055, 0.0165):
            is_index = abs(fx - index_x) < 0.001
            piv = empty(prefix + ("Index" if is_index else f"Finger{len(fingers)}"), palm, (fx, 0.0, -0.05))
            fm = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
            fm.name = piv.name + "Mesh"
            fm.scale = (0.0052, 0.006, 0.022)
            fm.data.materials.append(skin_mat)
            fm.parent = piv
            fm.location = (0.0, 0.0, -0.018)
            fingers.append((piv, is_index))
        tp = empty(prefix + "Thumb", palm, (thumb_side * 0.025, -0.002, -0.014))
        tm = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
        tm.name = tp.name + "Mesh"
        tm.scale = (0.005, 0.006, 0.016)
        tm.data.materials.append(skin_mat)
        tm.parent = tp
        tm.location = (0.0, 0.0, -0.013)
        tp.rotation_euler = (math.radians(20), 0.0, math.radians(-35 * thumb_side))
        return fingers, tp

    r_hand = empty("RHand", r_elbow, (0.0, 0.0, -0.26))
    l_hand = empty("LHand", l_elbow, (0.0, 0.0, -0.26))
    r_fingers, r_thumb = hand("R", r_hand, 1.0)
    l_fingers, l_thumb = hand("L", l_hand, -1.0)

    # ── weapon (v4.0): per DNA, gripped in the right hand ──
    wtype = str(dna.get("weaponType") or "none")
    blade = None
    if wtype == "sword":
        blade = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
        blade.name = "HandBlade"
        blade.scale = (0.015, 0.005, 0.55)
        blade.data.materials.append(blade_mat)
        blade.parent = r_hand
        blade.location = (0.0, -0.04, -0.22)
        guard = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
        guard.name = "BladeGuard"
        guard.scale = (0.05, 0.015, 0.011)
        guard.data.materials.append(accent_mat)
        guard.parent = r_hand
        guard.location = (0.0, -0.04, 0.19)
        grip = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=12, radius=0.013, depth=0.14, location=(0, 0, 0), )
        grip.name = "BladeGrip"
        grip.data.materials.append(boots_mat)
        grip.parent = r_hand
        grip.location = (0.0, -0.04, 0.26)
        blade.rotation_euler = (math.radians(-55), 0.0, 0.0)
    elif wtype == "staff":
        blade = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=12, radius=0.013, depth=1.3, location=(0, 0, 0), )
        blade.name = "HandBlade"
        blade.data.materials.append(boots_mat)
        blade.parent = r_hand
        blade.location = (0.0, -0.05, -0.1)
        gem = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=2, radius=0.045, location=(0, 0, 0), )
        gem.name = "StaffGem"
        gem.data.materials.append(blade_mat)
        gem.parent = blade
        gem.location = (0.0, 0.0, 0.7)
        blade.rotation_euler = (math.radians(-72), 0.0, 0.0)
    elif wtype == "spear":
        blade = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=12, radius=0.012, depth=1.5, location=(0, 0, 0), )
        blade.name = "HandBlade"
        blade.data.materials.append(boots_mat)
        blade.parent = r_hand
        blade.location = (0.0, -0.05, -0.1)
        tip = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=10, radius1=0.03, radius2=0.0, depth=0.22, location=(0, 0, 0), )
        tip.name = "SpearTip"
        tip.data.materials.append(blade_mat)
        tip.parent = blade
        tip.location = (0.0, 0.0, 0.83)
        blade.rotation_euler = (math.radians(-72), 0.0, 0.0)

    # prop scale: identical to the v3.x stand-in so every shot-type
    # framing in SHOT_FRAMING keeps working unchanged
    root.scale = (0.45, 0.45, 0.45)

    return {
        "root": root, "spine": spine, "head": head,
        "rShoulder": r_shoulder, "rElbow": r_elbow,
        "lShoulder": l_shoulder, "lElbow": l_elbow,
        "rHip": r_hip, "rKnee": r_knee, "lHip": l_hip, "lKnee": l_knee,
        "eyeL": eye_l, "eyeR": eye_r,
        "browL": brow_l, "browR": brow_r, "mouth": mouth,
        "rFingers": r_fingers, "lFingers": l_fingers,
        "rThumb": r_thumb, "lThumb": l_thumb,
        "blade": blade,
        "headMesh": hm,
    }


def build_designed_set(bpy, scn, env, mats, job_id):
    """The DESIGNED set (v4.0): terrain, features, sky and key light
    from the environment DNA. Deterministic per job id. Returns a
    report dict for the worker state."""
    rng = mulberry32(fnv1a(job_id) or 99133)
    terrain = str(env.get("terrain") or "terrace")
    features = env.get("features") or []
    tod = str(env.get("timeOfDay") or "night")
    ground = principled_mat(bpy, "GroundMat", env.get("groundColor", "#16211d"), 0.95)
    stone = principled_mat(bpy, "StoneMat", shade_hex(env.get("groundColor", "#16211d"), 1.7), 0.9)
    tile = principled_mat(bpy, "TileMat", shade_hex(env.get("groundColor", "#16211d"), 2.4), 0.85)
    wood = principled_mat(bpy, "WoodMat", "#3a2a1c", 0.85)
    dark = principled_mat(bpy, "SilhouetteMat", shade_hex(env.get("skyColor", "#0b1220"), 0.55), 1.0)

    report = {"terrain": terrain, "features": list(features)}

    # ── base ground (large, so wide shots never see the void) ──
    ground_mesh = bpy.data.meshes.new("Ground")
    ground_mesh.from_pydata([(-22, -22, 0), (22, -22, 0), (22, 22, 0), (-22, 22, 0)], [], [(0, 1, 2, 3)])
    ground_mesh.update()
    ground_obj = bpy.data.objects.new("Ground", ground_mesh)
    ground_obj.data.materials.append(ground)
    scn.collection.objects.link(ground_obj)

    # ── terrain pieces ──
    if terrain == "terrace":
        plat = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=24, radius=3.0, depth=0.5, location=(0, 0, 0.25), )
        plat.data.materials.append(stone)
        bpy.ops.object.shade_smooth()
        step = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=24, radius=3.6, depth=0.4, location=(0, 0, -0.05), )
        step.data.materials.append(stone)
        # worn stone tile inlay (few, small, z-jittered: 12 coplanar
        # plates at one z z-fought each other into black patches)
        for i in range(8):
            a = rng() * math.tau
            r = 0.5 + rng() * 1.8
            x, y = math.cos(a) * r, math.sin(a) * r
            tile_obj = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(x, y, 0.512 + rng() * 0.004), )
            tile_obj.scale = (0.32 + rng() * 0.3, 0.28 + rng() * 0.26, 0.012)
            tile_obj.rotation_euler = (0.0, 0.0, rng() * math.tau)
            tile_obj.data.materials.append(tile)
    elif terrain == "peak":
        cap = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=10, radius1=6.5, radius2=2.6, depth=3.2, location=(0, 0, -0.9), )
        cap.data.materials.append(stone)
        bpy.ops.object.shade_smooth()
    elif terrain == "forest":
        for i in range(10):
            a = rng() * math.tau
            r = 3.2 + rng() * 8.0
            x, y = math.cos(a) * r, math.sin(a) * r
            trunk = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=10, radius=0.09 + rng() * 0.07, depth=1.6 + rng() * 1.4, location=(x, y, 0.9), )
            trunk.data.materials.append(wood)
            bpy.ops.object.shade_smooth()
            for k in range(2):
                fol = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=2, radius=0.55 + rng() * 0.5, location=(x + (rng() - 0.5) * 0.4, y + (rng() - 0.5) * 0.4, 1.7 + k * 0.55), )
                fol.scale = (1.0, 1.0, 0.8)
                fol.data.materials.append(dark)
                bpy.ops.object.shade_smooth()
    elif terrain == "gorge":
        stream = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0.0, -4.2, 0.02), )
        stream.scale = (3.4, 2.0, 0.02)
        stream.data.materials.append(emission_mat(bpy, "StreamMat", "#5a88a8", 0.35))
        falls = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(2.6, -8.5, 2.2), )
        falls.scale = (0.9, 0.06, 2.2)
        falls.rotation_euler = (0.0, math.radians(-8), 0.0)
        falls.data.materials.append(emission_mat(bpy, "FallsMat", "#a8ccd8", 1.1))
        for i in range(8):
            ms = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=2, radius=0.16 + rng() * 0.3, location=((rng() - 0.5) * 6, -3.4 + rng() * 1.6, 0.12), )
            ms.scale = (1.0, 0.8, 0.5)
            ms.data.materials.append(stone)
            bpy.ops.object.shade_smooth()
    elif terrain == "temple":
        # cracked tiles + broken columns + altar (z-jittered, sparse:
        # coplanar overlapping plates z-fight into black patches)
        for i in range(9):
            a = rng() * math.tau
            r = 0.6 + rng() * 2.4
            x, y = math.cos(a) * r, math.sin(a) * r
            tile_obj = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(x, y, 0.03 + rng() * 0.012), )
            tile_obj.scale = (0.5 + rng() * 0.3, 0.45 + rng() * 0.3, 0.015)
            tile_obj.rotation_euler = (0.0, 0.0, rng() * math.tau)
            tile_obj.data.materials.append(tile)
        for i, (hx, hy, h) in enumerate(((-2.2, -1.4, 1.9), (2.2, -1.4, 1.2), (-2.4, 1.6, 0.8), (2.4, 1.7, 2.1))):
            col = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=14, radius=0.19, depth=h, location=(hx, hy, h / 2), )
            col.data.materials.append(stone)
            bpy.ops.object.shade_smooth()
            if i == 2:  # one fallen
                col.rotation_euler = (0.0, math.radians(84), 0.4)
                col.location = (hx, hy, 0.2)
        altar = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 1.9, 0.4), )
        altar.scale = (0.9, 0.5, 0.4)
        altar.data.materials.append(stone)

    # ── shared feature builders ──
    if "pillars" in features and terrain != "temple":
        for i in range(4):
            a = math.pi / 4 + i * math.pi / 2
            p = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=12, radius=0.15, depth=0.6 + rng() * 0.9, location=(math.cos(a) * 2.3, math.sin(a) * 2.3, 0.3 + rng() * 0.2), )
            p.rotation_euler = ((rng() - 0.5) * 0.09, (rng() - 0.5) * 0.09, 0)
            p.data.materials.append(stone)
            bpy.ops.object.shade_smooth()
    if "bell" in features:
        post1 = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=10, radius=0.04, depth=0.95, location=(-2.0, 1.9, 0.475), )
        post1.data.materials.append(wood)
        post2 = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=10, radius=0.04, depth=0.95, location=(-1.35, 1.9, 0.475), )
        post2.data.materials.append(wood)
        bar = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=10, radius=0.03, depth=0.8, location=(-1.675, 1.9, 0.9), )
        bar.rotation_euler = (0.0, math.pi / 2, 0.0)
        bar.data.materials.append(wood)
        bell = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=2, radius=0.12, location=(-1.675, 1.9, 0.72), )
        bell.scale = (1.0, 1.0, 1.15)
        bell.data.materials.append(principled_mat(bpy, "BronzeMat", "#6a5624", 0.45, 0.7))
        bpy.ops.object.shade_smooth()
    if "banners" in features:
        for i, (bx, by) in enumerate(((2.6, -0.6), (-2.6, -0.6))):
            pole = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=8, radius=0.03, depth=2.0, location=(bx, by, 1.0), )
            pole.data.materials.append(wood)
            cloth = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(bx, by - 0.16, 1.72), )
            cloth.scale = (0.05, 0.16, 0.55)
            cloth.rotation_euler = (math.radians(4 * (1 if i else -1)), 0, 0)
            cloth.data.materials.append(emission_mat(bpy, "BannerMat", env.get("fogColor", "#22303a"), 0.12))
    if "pagoda" in features:
        px, py = -9.0, -13.0
        for i, (w, h) in enumerate(((1.5, 0.9), (1.15, 0.9), (0.85, 0.9))):
            tier = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=12, radius=w, depth=h, location=(px, py, 0.45 + i * 0.95), )
            tier.data.materials.append(dark)
            bpy.ops.object.shade_smooth()
            roof = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=12, radius1=w + 0.55, radius2=0.05, depth=0.5, location=(px, py, 0.95 + i * 0.95), )
            roof.data.materials.append(dark)
    if "waterfall" in features and terrain != "gorge":
        falls = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(4.5, -9.0, 2.0), )
        falls.scale = (1.1, 0.06, 2.0)
        falls.data.materials.append(emission_mat(bpy, "FallsMat", "#a8ccd8", 1.0))
    if "stream" in features and terrain != "gorge":
        stream = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0.0, -5.0, 0.02), )
        stream.scale = (2.6, 1.4, 0.02)
        stream.data.materials.append(emission_mat(bpy, "StreamMat", "#5a88a8", 0.3))
    if "bamboo" in features and terrain != "forest":
        for i in range(14):
            a = rng() * math.tau
            r = 3.6 + rng() * 7.0
            x, y = math.cos(a) * r, math.sin(a) * r
            b = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=8, radius=0.035, depth=2.4 + rng() * 1.8, location=(x, y, 1.4), )
            b.rotation_euler = ((rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1, 0)
            b.data.materials.append(principled_mat(bpy, f"BambooMat{i % 3}", "#4a6a3a", 0.7))
            bpy.ops.object.shade_smooth()
    if "cloudsea" in features:
        for i in range(12):
            a = rng() * math.tau
            r = 8.0 + rng() * 9.0
            cl = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=2, radius=1.2 + rng() * 1.2, location=(math.cos(a) * r, math.sin(a) * r, -2.6 - rng() * 0.8), )
            cl.scale = (1.0, 1.0, 0.28)
            cl.data.materials.append(emission_mat(bpy, "CloudMat", shade_hex(env.get("fogColor", "#0a1018"), 2.2), 0.07))
            bpy.ops.object.shade_smooth()
    if "moons" in features and tod in ("night", "dusk"):
        for i, (mx, my, mz, mr) in enumerate(((-11.0, -15.0, 9.5, 1.15), (7.5, -17.0, 11.0, 0.8))):
            moon = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=3, radius=mr, location=(mx, my, mz), )
            moon.data.materials.append(emission_mat(bpy, f"MoonMat{i}", "#e8eef8" if i == 0 else "#cfd8e8", 3.0))
        # faint qi motes drift on stormy nights (cheap emission points)
    if "lanterns" in features:
        for i in range(5):
            a = math.pi / 5 + i * (2 * math.pi / 5)
            lx, ly = math.cos(a) * 3.0, math.sin(a) * 3.0
            lp = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=8, radius=0.025, depth=1.3, location=(lx, ly, 0.65), )
            lp.data.materials.append(wood)
            lb = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=2, radius=0.09, location=(lx, ly, 1.36), )
            lb.scale = (1.0, 1.0, 1.25)
            lb.data.materials.append(emission_mat(bpy, "LanternMat", "#e8a24a", 2.4))

    report["pieces"] = len(scn.objects)
    return report


def shade_hex(h, k):
    """Darken/lighten a hex color by factor k (used for silhouettes)."""
    r, g, b = hex_to_rgb(h)
    return "#{:02x}{:02x}{:02x}".format(
        int(max(0, min(1, r * k)) * 255),
        int(max(0, min(1, g * k)) * 255),
        int(max(0, min(1, b * k)) * 255),
    )


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

        # ── design DNA (v4.0): what the production DESIGNED ──
        cast = (shot.get("cast") or []) if isinstance(shot.get("cast"), list) else []
        env = scene_p.get("environment") if isinstance(scene_p.get("environment"), dict) else None
        hero = cast[0] if cast else None
        state["design"] = {
            "version": "v4.0",
            "figure": hero.get("name") if hero else None,
            "weapon": hero.get("weaponType") if hero else None,
            "set": env.get("name") if env else None,
            "terrain": env.get("terrain") if env else None,
            "cast": [c.get("name") for c in cast],
        }

        # ── designed set when the environment DNA arrived, legacy
        #    plate otherwise ──
        if env:
            build_designed_set(bpy, scn, env, {}, job_id)
        else:
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

        # ── subject: the DESIGNED hero when cast DNA arrived (posed or
        #    standing), the legacy stand-in on pose shots without DNA,
        #    the plinth + floating blade otherwise ──
        pose_start = normalize_pose(shot.get("poseStart"))
        pose_end = normalize_pose(shot.get("poseEnd"))
        figure = None
        speech_visemes = parse_speech(shot)
        state["posesRequested"] = [str(shot.get("poseStart")), str(shot.get("poseEnd"))]
        state["posesResolved"] = [pose_start, pose_end]
        state["scriptMtime"] = os.path.getmtime(__file__)
        state["speech"] = {"lines": int((shot.get("speech") or {}).get("lines", 0) or 0), "visemes": len(speech_visemes)} if speech_visemes else None
        if hero:
            # the hero's energy color leads the scene's emissives
            energy_hex = hero.get("bladeColor") or "#5eead4"
            hero_mats = {
                "robe": principled_mat(bpy, "RobeMat", hero.get("robeColor", "#2f6d63"), 0.82),
                "accent": principled_mat(bpy, "AccentMat", hero.get("robeAccent", "#a8842c"), 0.7),
                "skin": principled_mat(bpy, "SkinMat", hero.get("skinTone", "#d9b48f"), 0.5),
                "hair": principled_mat(bpy, "HairMat", hero.get("hairColor", "#16161d"), 0.35),
                "blade": emission_mat(bpy, "BladeMat", energy_hex, 2.0 + float(scene_p.get("energyIntensity", 0.6)) * 8.0),
                "boots": principled_mat(bpy, "BootsMat", "#241a12", 0.8),
            }
            figure = build_designed_figure(bpy, scn, hero, hero_mats)
            state["rig"] = {
                "version": "v4.0-designed",
                "face": True, "hands": True,
                "eyes": 2, "brows": 2, "fingers": 10,
                "faceChannels": FACE_CHANNELS,
                "hairStyle": str(hero.get("hairStyle") or "short"),
                "weapon": str(hero.get("weaponType") or "none"),
            }
            # a second detected character stands off across the set,
            # facing the hero (static stance - blocking depth)
            if len(cast) > 1:
                other = cast[1]
                other_mats = {
                    "robe": principled_mat(bpy, "RobeMatB", other.get("robeColor", "#4a5560"), 0.82),
                    "accent": principled_mat(bpy, "AccentMatB", other.get("robeAccent", "#a8842c"), 0.7),
                    "skin": principled_mat(bpy, "SkinMatB", other.get("skinTone", "#d9b48f"), 0.5),
                    "hair": principled_mat(bpy, "HairMatB", other.get("hairColor", "#16161d"), 0.35),
                    "blade": hero_mats["blade"],
                    "boots": principled_mat(bpy, "BootsMatB", "#241a12", 0.8),
                }
                other_rig = build_designed_figure(bpy, scn, other, other_mats)
                other_rig["root"].location = (0.6, 1.7, 0.0)
                other_rig["root"].rotation_euler = (0.0, 0.0, math.radians(166))
                apply_pose(other_rig, "STANCE", "STANCE", 0.0, 0.0)
                state["secondFigure"] = other.get("name")
        elif pose_start or pose_end:
            legacy_mat = bpy.data.materials.new("SetMat")
            legacy_mat.use_nodes = True
            lb = legacy_mat.node_tree.nodes.get("Principled BSDF")
            if lb:
                lb.inputs["Base Color"].default_value = (0.035, 0.05, 0.045, 1.0)
                lb.inputs["Roughness"].default_value = 0.95
            legacy_blade = bpy.data.materials.new("BladeMat")
            legacy_blade.use_nodes = True
            lnodes = legacy_blade.node_tree.nodes
            lb2 = lnodes.get("Principled BSDF")
            if lb2:
                lnodes.remove(lb2)
            lem = lnodes.new("ShaderNodeEmission")
            lem.inputs[0].default_value = (0.25, 0.95, 0.82, 1.0)
            lem.inputs[1].default_value = 2.0 + float(scene_p.get("energyIntensity", 0.6)) * 8.0
            lout = lnodes.get("Material Output")
            legacy_blade.node_tree.links.new(lem.outputs[0], lout.inputs[0])
            figure = build_stand_in_figure(bpy, scn, legacy_mat, legacy_blade)
            # rig report: lets the pipeline (and E2E) assert the v3.2
            # face/hand upgrade actually shipped in this worker
            state["rig"] = {
                "version": "v3.2",
                "face": True, "hands": True,
                "eyes": 2, "brows": 2, "fingers": 10,
                "faceChannels": FACE_CHANNELS,
            }
        else:
            legacy_mat = bpy.data.materials.new("SetMat")
            legacy_mat.use_nodes = True
            lb3 = legacy_mat.node_tree.nodes.get("Principled BSDF")
            if lb3:
                lb3.inputs["Base Color"].default_value = (0.035, 0.05, 0.045, 1.0)
                lb3.inputs["Roughness"].default_value = 0.95
            bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=0.9, location=(0, 0, 0.45))
            scn.collection.objects[-1].data.materials.append(legacy_mat)
            bpy.ops.mesh.primitive_cone_add(radius1=0.14, radius2=0.0, depth=1.9, vertices=6, location=(0, 0, 1.85))
            blade = scn.collection.objects[-1]
            blade.rotation_euler = (0.05, 0.12, 0.4)
            blade.data.materials.append(emission_mat(
                bpy, "BladeMat", (hero or {}).get("bladeColor", "#40f2d2") if hero else "#40f2d2",
                2.0 + float(scene_p.get("energyIntensity", 0.6)) * 8.0))

        # ── AnimeOS scene params: designed sky when the environment
        #    DNA carries one, legacy fog world otherwise ──
        fog = float(scene_p.get("fogDensity", 0.45))
        world = bpy.data.worlds.new("AnimeOSWorld")
        scn.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes.get("Background")
        if bg:
            if env:
                r, g, b = hex_to_rgb(env.get("skyColor", "#0b1220"))
                bg.inputs[0].default_value = (r, g, b, 1.0)
            else:
                base = 0.04 + 0.22 * (1.0 - fog)
                bg.inputs[0].default_value = (base * 0.8, base * 0.95, base * 1.15, 1.0)
            bg.inputs[1].default_value = 1.0

        lightning = float(scene_p.get("lightningIntensity", 0.55))
        sun_data = bpy.data.lights.new("Sun", "SUN")
        night_key = False
        if env:
            kr, kg, kb = hex_to_rgb(env.get("keyLight", "#cfe0ee"))
            sun_data.color = (kr, kg, kb)
            # night/dusk keys read best dimmer and steeper (moonlight)
            night_key = str(env.get("timeOfDay") or "night") in ("night", "dusk")
            sun_data.energy = (1.1 + lightning * 3.2) if night_key else (2.6 + lightning * 5.0)
        else:
            sun_data.energy = 1.0 + lightning * 6.0
        sun = bpy.data.objects.new("Sun", sun_data)
        # rotation X maps: 0 deg = straight down (90 deg elevation),
        # 90 deg = horizontal. Night moon sits at ~28 deg elevation
        # (X 62) and dim; day at ~45 (X 45) and brighter.
        sun.rotation_euler = (math.radians(62) if night_key else math.radians(45), 0, math.radians(35))
        scn.collection.objects.link(sun)
        sun_base = sun_data.energy

        rim_e = float(scene_p.get("rimLightIntensity", 0.5))
        energy_e = float(scene_p.get("energyIntensity", 0.6))
        # night sets run dimmer fills (a 1200W studio wash turns moonlight
        # into overcast noon); day keeps the full studio fill
        night = bool(env and str(env.get("timeOfDay") or "night") in ("night", "dusk"))
        fill_scale = 0.85 if night else 1.0
        for i, e in enumerate((rim_e, energy_e)):
            light_data = bpy.data.lights.new(f"Fill{i}", "AREA")
            light_data.size = 4.0
            light_data.energy = (200 + e * 1800) * fill_scale
            light = bpy.data.objects.new(f"Fill{i}", light_data)
            light.rotation_euler = (math.radians(-55), math.radians(20 * (i or -1)), 0)
            light.location = ((3.5, -4.0, 2.6) if i == 0 else (-3.0, 3.5, 3.2))
            scn.collection.objects.link(light)
        if hero:
            # the HERO KEY: a soft dedicated light on the subject so a
            # night wide never loses the figure in the darkness (the
            # s3.2 lesson - an establishing night frame graded to a
            # flat black rectangle and identity scored 0%)
            key_data = bpy.data.lights.new("HeroKey", "AREA")
            key_data.size = 1.6
            key_data.energy = 140.0 if night else 260.0
            kcol = hero.get("bladeColor", "#cfe0ee") if night else "#f2ede2"
            key_data.color = hex_to_rgb(kcol)
            hero_key = bpy.data.objects.new("HeroKey", key_data)
            hero_key.location = (0.7, -1.6, 1.9)   # front-above the figure (it faces -Y)
            hero_key.rotation_euler = (math.radians(-38), 0, 0)
            scn.collection.objects.link(hero_key)

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
                apply_pose(figure, pose_start, pose_end, t, t_sec,
                           speech=speech_open_at(speech_visemes, t_sec * 1000.0) if speech_visemes else None)
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
