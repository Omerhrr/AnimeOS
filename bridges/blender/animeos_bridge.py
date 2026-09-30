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
#
# v7.2 is the SECONDARY MOTION pass: cloth and hair RIDE THE GRAMMAR
# BEATS. Every designed figure's cloth parts (sash tail, skirt panels,
# sleeves, cuffs) and hair parts (back mass, style piece, beard) are
# wrapped in pivot empties at their hang points and driven by damped
# springs: they drag behind the body's pose velocity, WHIP at the beat
# boundaries (a pose jump across a cut stirs the air), billow on a
# beat's directed WIND (grammar beats may carry wind: 0..1 - the
# director's call for what the air is doing), sway with the blocking's
# implied motion (a TRACKING beat means running wind, a STATIC hold is
# near-still) and breathe on a deterministic idle breeze. Fixed dt,
# fixed phases - the same grammar always lands the same cloth.

import argparse
import base64
import hashlib
import json
import math
import os
import re
import shutil
import socket
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


# ── THE FEET STAY PLANTED (iteration 96): two-bone leg IK over the
#    shot pose vocabulary. The readings named the frontier: the pose
#    program drops the root (CROUCH -0.40, RISE -0.25, FALL -0.62)
#    while the legs keep the table's knee angles, so the boots sink
#    through the ground plane exactly where the audience's eye
#    measures the lie. The law: the pose table stays the INTENT; the
#    IK corrects the penetration only - a penetrating leg solves
#    closed-form (law of cosines) with the thigh read PRESERVED and
#    the shin taking the FOLD branch (the solved knee is never below
#    the table's angle - the IK folds, it never pops a crouch
#    straight), clamped at KNEE_MAX; whatever survives the clamp the
#    ROOT lifts (one root, the worse leg wins); a floating foot (the
#    lunge heel, the leap tuck) is the pose's own read - named as
#    clearance, never "fixed". Mirrors leg-ik.ts bit-exactly (one
#    law, two runtimes). ──

LEG_IK_VERSION = 96
LEG_IK_UPPER = 0.46     # hip pivot -> knee empty (build units)
LEG_IK_LOWER = 0.46     # knee empty -> boot sole (build units)
LEG_IK_HIP_STAND = 0.92  # the hip's height above its own rest sole
LEG_IK_KNEE_MAX = 130.0
LEG_IK_PROP_SCALE = 0.45  # the figures' prop scale (root hierarchy)
LEG_IK_POSES = tuple(POSE_JOINTS.keys())  # the TS POSES order (insertion)


def leg_foot_drop(thigh_deg, knee_deg):
    """Down-positive vertical distance hip pivot -> boot sole under the
    rig's own rotation composition (hip rotates -thigh, knee +knee
    about the same axis, so the shin's world angle is knee - thigh)."""
    return (LEG_IK_UPPER * math.cos(math.radians(thigh_deg))
            + LEG_IK_LOWER * math.cos(math.radians(knee_deg - thigh_deg)))


def solve_leg_ik(root_y, thigh_deg, knee_deg, bob=0.0):
    """The two-bone solve for one leg: the effective thigh angle (the
    table's + the walk swing), the table's knee, the hip's height
    inputs (rootY + bob, build units). Returns the solved knee (the
    table's own when nothing penetrated), the penetration before, the
    residual after the clamp, the clearance when the solve never
    fired. Fold-only; the thigh read is preserved."""
    hip = LEG_IK_HIP_STAND + root_y + bob
    drop = leg_foot_drop(thigh_deg, knee_deg)
    pen = round(drop - hip, 3)
    if pen <= 0:
        return {"knee": round(knee_deg, 3), "pen": pen,
                "residual": 0.0,
                "clearance": 0.0 if pen == 0 else round(hip - drop, 3),
                "solved": False}
    rhs = clamp((hip - LEG_IK_UPPER * math.cos(math.radians(thigh_deg))) / LEG_IK_LOWER, -1.0, 1.0)
    knee = round(min(LEG_IK_KNEE_MAX, thigh_deg + math.degrees(math.acos(rhs))), 3)
    residual = round(max(0.0, leg_foot_drop(thigh_deg, knee) - hip), 3)
    return {"knee": knee, "pen": pen, "residual": residual,
            "clearance": 0.0, "solved": True}


def leg_ik_table():
    """The law over the whole vocabulary: every pose solved at its own
    end row - the canonical table the hash covers and the evidence
    carries. Per pose: the table knees, the solved knees, the deeper
    sole's penetration before, the penetration after (0 across the
    vocabulary - the proof the law plants), the root lift."""
    out = {}
    for name in LEG_IK_POSES:
        j = POSE_JOINTS[name]
        sr = solve_leg_ik(j[1], j[8], j[9])
        sl = solve_leg_ik(j[1], j[10], j[11])
        out[name] = {
            "kneeTableR": round(float(j[9]), 3), "kneeSolvedR": sr["knee"],
            "kneeTableL": round(float(j[11]), 3), "kneeSolvedL": sl["knee"],
            "penBefore": round(max(sr["pen"], sl["pen"]), 3),
            "penAfter": round(max(sr["residual"], sl["residual"]), 3),
            "rootLift": round(max(sr["residual"], sl["residual"]), 3),
        }
    return out


def leg_ik_key():
    """The canonical key - the law's inputs and its answers over the
    vocabulary, pipe-format, versioned 96. Mirrors legIkKey in
    leg-ik.ts field for field."""
    rows = []
    for name, r in leg_ik_table().items():
        rows.append(
            f"{name}:r={r['kneeTableR']:.3f},{r['kneeSolvedR']:.3f}"
            f";l={r['kneeTableL']:.3f},{r['kneeSolvedL']:.3f}"
            f";res={r['penAfter']:.3f};lift={r['rootLift']:.3f}"
        )
    return (f"{LEG_IK_VERSION}"
            f"|L1={LEG_IK_UPPER:.3f}|L2={LEG_IK_LOWER:.3f}"
            f"|HIP={LEG_IK_HIP_STAND:.3f}|KMAX={LEG_IK_KNEE_MAX:.3f}"
            f"|{'|'.join(rows)}|v1")


def leg_ik_hash():
    """The DETERMINISTIC leg-IK hash - sha256-16 over the canonical
    key (mirrors legIkHash in leg-ik.ts bit-exactly)."""
    return hashlib.sha256(leg_ik_key().encode("utf-8")).hexdigest()[:16]


# ── THE HAND CLOSES ON THE HILT (iteration 97): the grip-contact
#    law over the hand-weapon pair. The readings named the pair: the
#    designed sword built three DISCONNECTED pieces (a tilted blade
#    slab, a straight-axis guard cube, a hilt cylinder floating near
#    the elbow), so the fist curled around air while the weapon read
#    as debris. The law makes the pair STRUCTURAL: one GRIP ANCHOR
#    (the fist's center, derived once from the hand rig's own
#    geometry), one axis per weapon kind (the kind's own tilt
#    preserved - the read stays), and every piece PLACED BY THE LAW
#    along that axis through the anchor. All the pieces parent to
#    one GRIP PIVOT empty at the anchor (child of the hand), so the
#    weapon rides every pose frame through the hand and the
#    follow-through pivots the WHOLE weapon around the fist (the
#    physically honest flex) instead of re-tilting the blade slab
#    away from its own hilt. Mirrors grip.ts bit-exactly (one law,
#    two runtimes). ──

GRIP_LAW_VERSION = 97
# the fist's center in hand-local space: just past the palm's front
# face (y -0.009) at the finger pivots' height (z -0.05) raised by
# the curl's half-chord - the rig both figures share
GRIP_ANCHOR = (0.0, -0.010, -0.048)
# per-kind law constants: the axis tilt (the kind's own read), the
# hold offset along the shaft for through-grip kinds, the hilt
# length and the guard offset for the sword
GRIP_SPEC = {
    "sword": {"tilt": -55.0, "hold": 0.0, "hilt": 0.14, "guard": 0.076},
    "staff": {"tilt": -72.0, "hold": 0.25, "hilt": 0.0, "guard": 0.0},
    "spear": {"tilt": -72.0, "hold": 0.2, "hilt": 0.0, "guard": 0.0},
    # the stand-in's emissive energy blade (midpoint-gripped)
    "blade": {"tilt": -72.0, "hold": 0.0, "hilt": 0.0, "guard": 0.0},
}


def grip_tip_axis(kind):
    """The axis direction the TIP points (hand-local), from the
    kind's own tilt: the mesh's local -z maps to this under R_x(tilt)
    - down-forward for the negative tilts the kinds carry."""
    t = math.radians(GRIP_SPEC[kind]["tilt"])
    return (0.0, round(math.sin(t), 4), round(-math.cos(t), 4))


def grip_piece_offset(kind, along):
    """Where a piece sits (PIVOT-local, the pivot at the anchor)
    given its distance along the tip axis - the law's single
    placement function, mirrored piece for piece by the builder."""
    u = grip_tip_axis(kind)
    return (0.0, round(u[1] * along, 4), round(u[2] * along, 4))


def grip_key():
    """The canonical key - the anchor, the per-kind constants and the
    axis the pieces hang from, pipe-format, versioned 97. Mirrors
    gripKey in grip.ts field for field."""
    kinds = []
    for k, s in GRIP_SPEC.items():
        u = grip_tip_axis(k)
        kinds.append(f"{k}:tilt={s['tilt']:.4f},hold={s['hold']:.4f},hilt={s['hilt']:.4f},guard={s['guard']:.4f},u={u[1]:.4f},{u[2]:.4f}")
    return (f"{GRIP_LAW_VERSION}"
            f"|A={GRIP_ANCHOR[0]:.4f},{GRIP_ANCHOR[1]:.4f},{GRIP_ANCHOR[2]:.4f}"
            f"|{'|'.join(kinds)}|v1")


def grip_hash():
    """The DETERMINISTIC grip hash - sha256-16 over the canonical key
    (mirrors gripHash in grip.ts bit-exactly)."""
    return hashlib.sha256(grip_key().encode("utf-8")).hexdigest()[:16]


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


# ─── THE MOUTH SPEAKS IN THE MESH (iteration 92, Layer A) ───────
#
# The v3.3 lip-sync drove the mouth OBJECT's scale while the carved
# face MESH held still - the mannequin's second tell. The viseme
# program drives the mesh half now: three speech shape keys (the
# wide spread, the round purse, the bilabial press) sculpted onto
# the same carved head, the jaw following the line at a bounded
# fraction beneath the expression's own jaw. One law, two runtimes:
# the constants + mapping + hash mirror src/lib/animation/lipsync.ts
# bit-exactly.

SPEECH_MESH_SHAPES = ("mouthWide", "mouthRound", "lipPress")
SPEECH_JAW_FOLLOW = 0.45
SPEECH_PRESS_WINDOW = (0.005, 0.055)


def speech_mesh_weights(shape):
    """The viseme sample -> mesh weights (mirrors visemeMeshWeights in
    lipsync.ts): the openness drives the jaw at the bounded fraction,
    wide/round ride through, and the press fires only inside the
    bilabial window (a closed lip the consonant pressed, not a breath
    or a vowel). None (the mouth between segments) lands the rest."""
    if not isinstance(shape, dict):
        return {"jaw": 0.0, "wide": 0.0, "round": 0.0, "press": 0.0}
    o = clamp(float(shape.get("o", 0.0)), 0.0, 1.0)
    w = clamp(float(shape.get("w", 0.0)), 0.0, 1.0)
    r = clamp(float(shape.get("r", 0.0)), 0.0, 1.0)
    lo, hi = SPEECH_PRESS_WINDOW
    press = 1.0 if (o > lo and o <= hi) else 0.0
    return {"jaw": round(o * SPEECH_JAW_FOLLOW, 3), "wide": round(w, 3), "round": round(r, 3), "press": press}


def speech_mesh_evidence(visemes, duration_sec):
    """The state's speech-mesh evidence (mirrors speechMeshEvidence in
    lipsync.ts): the program sampled at the identity clock (22/40/62%),
    the mesh weights per sample, and the DETERMINISTIC hash over the
    sampled shapes AND their derived weights (sha256-16, bit-exact)."""
    dur = max(0.1, float(duration_sec))
    samples = []
    for f in (0.22, 0.4, 0.62):
        at = round(dur * f, 3)
        shape = speech_open_at(visemes, at * 1000.0)
        mw = speech_mesh_weights(shape)
        o = round(clamp(float(shape.get("o", 0.0)), 0.0, 1.0), 3) if isinstance(shape, dict) else 0.0
        w = round(clamp(float(shape.get("w", 0.0)), 0.0, 1.0), 3) if isinstance(shape, dict) else 0.0
        r = round(clamp(float(shape.get("r", 0.0)), 0.0, 1.0), 3) if isinstance(shape, dict) else 0.0
        samples.append({"at": at, "o": o, "w": w, "r": r, "mesh": mw})
    spec = "92|" + "|".join(
        "{:.3f}:{:.3f},{:.3f},{:.3f}:{:.3f},{:.3f},{:.3f},{:.3f}".format(
            s["at"], s["o"], s["w"], s["r"],
            s["mesh"]["jaw"], s["mesh"]["wide"], s["mesh"]["round"], s["mesh"]["press"],
        )
        for s in samples
    ) + "|v1"
    return {
        "shapes": list(SPEECH_MESH_SHAPES),
        "samples": samples,
        "hash": hashlib.sha256(spec.encode("utf-8")).hexdigest()[:16],
    }


# ── THE FACE CREASES WHEN IT ACTS (iteration 93, Layer A): the
#    drive half of the wrinkle law - the cached wrinkle normal maps'
#    strengths ride the LIVE expression weights every frame (the
#    furrow deepens as the scowl deepens, rests when the face rests;
#    the corner map wears by the absolute weight - both the smile's
#    and the frown's pull crease the same masses at this stylization).
#    Mirrors wrinkle.ts bit-exactly (WRINKLE_STRENGTH /
#    wrinkleStrengthFor); the bake half lives in head_bake.py. ──
WRINKLE_STRENGTH = 0.85
WRINKLE_STRENGTH_MAX = 1.2


def wrinkle_strength_for(weight):
    """The driven strength for a live shape weight - mirrors
    wrinkleStrengthFor in wrinkle.ts (the base strength scaled by the
    clamped absolute weight, bounded)."""
    try:
        w = float(weight)
    except Exception:  # noqa: BLE001
        w = 0.0
    if not math.isfinite(w):
        w = 0.0
    w = min(1.0, max(-1.0, w))
    return min(WRINKLE_STRENGTH_MAX, max(0.0, WRINKLE_STRENGTH * abs(w)))


def eye_scale(eye):
    """Eye lid openness as a Z squash on the eye sphere (never fully
    flat so the eyeball stays visible)."""
    return max(0.12, clamp(eye, 0.0, 1.2))


class _Framing:
    """The per-shot framing context camera_pose computes once: the
    shot-type table entry, the subject scale correction, the base
    orbit angle and the look target. Both the whole-clip move and
    every grammar beat pose the camera from this same context - a
    beat never re-derives its own framing (a grammar that drifts
    between beats is not direction, it is a slide show)."""

    def __init__(self, shot_payload, scene_payload):
        dist, lens, height = SHOT_FRAMING.get(str(shot_payload.get("shotType", "MEDIUM")).upper(), SHOT_FRAMING["MEDIUM"])
        dist *= float(scene_payload.get("cameraDistance", 1.0))
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
        h = height
        target = [0.0, 0.0, height * 0.75]
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
        self.dist = dist
        self.lens = lens
        self.height = height
        self.has_poses = has_poses
        self.framed = framed
        self.angle = angle
        self.h = h
        self.target = target


def apply_camera_move(movement, t, fr):
    """One camera move at local progress t (0..1) over the framing
    context fr: mutates nothing - returns the solved (radius, h,
    angle, lateral, target, lens). Every move the vocabulary offers
    lives here EXACTLY once; the whole-clip path and every grammar
    beat share it, so a DOLLY_IN beat looks like the DOLLY_IN a
    single-move shot performs."""
    radius = fr.dist
    h = fr.h
    angle = fr.angle
    lateral = 0.0
    target = list(fr.target)

    if movement == "ORBIT":
        angle = angle + (t - 0.5) * 44.0
        radius = fr.dist * (1.0 + 0.05 * math.sin(t * math.pi))
    elif movement == "DOLLY_IN":
        radius = fr.dist * (1.0 - 0.28 * t)
    elif movement == "DOLLY_OUT":
        radius = fr.dist * (0.72 + 0.28 * t)
    elif movement == "PAN":
        angle = angle + math.sin((t - 0.5) * math.pi) * 24.0
    elif movement == "TRACKING":
        lateral = (t - 0.5) * fr.dist * 0.42
    elif movement == "CRANE":
        h = h + (1.1 if fr.framed else 2.2) * (1.0 - t)
        radius = fr.dist * (1.0 + 0.1 * t)
    elif movement == "TILT_UP":
        target[2] = (0.3 + 0.55 * t) if fr.framed else fr.height * (0.35 + 0.55 * t)
    elif movement == "TILT_DOWN":
        target[2] = (0.8 - 0.55 * t) if fr.framed else fr.height * (0.9 - 0.55 * t)
    return radius, h, angle, lateral, target, fr.lens


def _pose_follow(shot_payload, fr, radius, t):
    """Follow the subject: the pose program can carry the figure
    toward the lens (LUNGE root travel), so the rig backs off by the
    same world travel (table value x prop scale) and keeps the body
    framed. Whole-clip poses only - a grammar beat carries its own
    poses and the worker passes t_local from the beat instead."""
    if fr.framed and fr.has_poses:
        rx = lerp_pose(shot_payload.get("poseStart"), shot_payload.get("poseEnd"), t)[0]
        return radius + rx * 0.42
    return radius


def _solve_position(radius, h, angle, lateral):
    rad = math.radians(angle)
    return [radius * math.sin(rad) + lateral, -radius * math.cos(rad), h]


def camera_pose(shot_payload, scene_payload, t):
    """Camera position + look target for progress t (0..1) through the
    shot, driven by the movement grammar (whole-clip path: ONE move
    across the shot; grammar shots go through grammar_camera_pose)."""
    fr = _Framing(shot_payload, scene_payload)
    movement = str(shot_payload.get("movement") or "STATIC").upper()
    if movement not in ("ORBIT", "PAN", "TRACKING", "CRANE", "DOLLY_IN", "DOLLY_OUT", "TILT_UP", "TILT_DOWN"):
        movement = "STATIC"
    radius, h, angle, lateral, target, lens = apply_camera_move(movement, t, fr)
    radius = _pose_follow(shot_payload, fr, radius, t)
    pos = _solve_position(radius, h, angle, lateral)
    if movement == "STATIC":
        pos[2] += math.sin(t * math.pi * 2) * 0.015  # breathing lock-off
    return pos, target, lens


# ── v5.3 DIRECTED MOTION GRAMMAR: a shot that carries a grammar is
#    DIRECTED beat by beat (crane down to find the hero, then push
#    in as the sword clears the sheath) - the whole-clip movement is
#    replaced by the beat under the playhead, posed in the beat's own
#    local time and crossfaded into the next beat's start over the
#    final 20% of every beat, so the camera never teleports between
#    beats. A beat may also carry its own pose pair: the SUBJECT
#    moves with the lens (stance through the crane, lunge through
#    the push-in). ──

GRAMMAR_FADE = 0.2  # the last 20% of a beat eases into the next beat

def normalize_grammar(raw):
    """Parse a shot's grammar payload into validated beats
    [{move, from, to, poseStart, poseEnd}] or None. A corrupt
    grammar degrades honestly to the whole-clip movement - a broken
    note must never stop a shoot."""
    if not isinstance(raw, list) or len(raw) < 2:
        return None
    beats = []
    for b in raw:
        if not isinstance(b, dict):
            return None
        move = str(b.get("move") or "").upper()
        if move not in ("ORBIT", "PAN", "TRACKING", "CRANE", "DOLLY_IN", "DOLLY_OUT", "TILT_UP", "TILT_DOWN", "STATIC"):
            return None
        try:
            frm = float(b.get("from"))
            to = float(b.get("to"))
        except (TypeError, ValueError):
            return None
        if not (0.0 <= frm < to <= 1.0):
            return None
        beats.append({
            "move": move,
            "from": frm,
            "to": to,
            "poseStart": b.get("poseStart"),
            "poseEnd": b.get("poseEnd"),
            "wind": max(0.0, min(1.0, float(b["wind"]))) if isinstance(b.get("wind"), (int, float)) else None,
        })
    if len(beats) < 2:
        return None
    return beats


SHOT_DIRECTIVE_VERSION = 98


def shot_directive_key(shot):
    """THE SHOTDIRECTIVE COMPILER (iteration 98): the shot's directed
    intent as ONE canonical key - the movement, the resolved pose
    pair, the duration, the lighting, the grammar's NORMALIZED beats
    (the same all-or-nothing law the camera plays), the fx and
    physics program counts + kinds, the cloth/flesh intensities, the
    speech lines, the presence of the parsed sub-programs. Mirrors
    shotDirectiveKey in shot-directive.ts field for field (one law,
    two runtimes at the SHOT level)."""
    mv = str(shot.get("movement") or "").strip().upper() or "-"
    ps = normalize_pose(shot.get("poseStart"))
    pe = normalize_pose(shot.get("poseEnd"))
    if ps and pe:
        poses = f"{ps}->{pe}"
    elif ps or pe:
        poses = ps or pe
    else:
        poses = "-"
    dur = "{:.3f}".format(float(shot.get("duration") or 0))
    light = str(shot.get("lighting") or "").strip().lower() or "-"
    g = normalize_grammar(shot.get("grammar"))
    if g:
        moves = "+".join(b["move"] for b in g)
        wind_sum = sum(b["wind"] or 0.0 for b in g)
        pose_beats = sum(1 for b in g if normalize_pose(b.get("poseStart")) or normalize_pose(b.get("poseEnd")))
        gr = f"{len(g)}:{moves}:{wind_sum:.1f}:{pose_beats}"
    else:
        gr = "-"

    def programs(key):
        raw = shot.get(key)
        if not isinstance(raw, list) or len(raw) == 0:
            return "-"
        kinds = sorted({str(p.get("kind") or "").strip().lower() for p in raw if isinstance(p, dict)} - {""})
        return f"{len(raw)}:{'+'.join(kinds)}"

    fx = programs("fx")
    ph = programs("physics")
    cloth = "{:.3f}".format(float(shot["cloth"])) if isinstance(shot.get("cloth"), (int, float)) and not isinstance(shot.get("cloth"), bool) else "-"
    flesh = "{:.3f}".format(float(shot["flesh"])) if isinstance(shot.get("flesh"), (int, float)) and not isinstance(shot.get("flesh"), bool) else "-"
    sp = shot.get("speech")
    speech = str(int((sp or {}).get("lines", 0) or 0)) if isinstance(sp, dict) else "-"
    expr = 1 if shot.get("expression") else 0
    comp = 1 if shot.get("comp") else 0
    clothd = 1 if shot.get("clothDirective") else 0
    camchoreo = 1 if shot.get("cameraChoreo") else 0
    choreo = 1 if shot.get("choreo") else 0
    return (f"98|mv={mv}|poses={poses}|dur={dur}|light={light}"
            f"|gr={gr}|fx={fx}|ph={ph}"
            f"|cloth={cloth}|flesh={flesh}|speech={speech}"
            f"|expr={expr}|comp={comp}|clothd={clothd}|camchoreo={camchoreo}|choreo={choreo}|v1")


def shot_directive_hash(shot):
    """The DETERMINISTIC directive hash - sha256-16 over the canonical
    key (mirrors compileShotDirective in shot-directive.ts)."""
    return hashlib.sha256(shot_directive_key(shot).encode("utf-8")).hexdigest()[:16]


def shot_directive_sections(shot):
    """The readable sections the state names beside the hashes."""
    g = normalize_grammar(shot.get("grammar"))
    mv = str(shot.get("movement") or "").strip().upper() or "-"
    ps = normalize_pose(shot.get("poseStart"))
    pe = normalize_pose(shot.get("poseEnd"))
    return {
        "movement": mv,
        "poses": (f"{ps}->{pe}" if ps and pe else (ps or pe or "-")),
        "grammarBeats": len(g) if g else 0,
        "expression": 1 if shot.get("expression") else 0,
        "comp": 1 if shot.get("comp") else 0,
        "clothDirective": 1 if shot.get("clothDirective") else 0,
        "cameraChoreo": 1 if shot.get("cameraChoreo") else 0,
        "choreo": 1 if shot.get("choreo") else 0,
    }


def _beat_at(beats, t):
    """The active beat for progress t (the last beat catches t=1)."""
    for i, b in enumerate(beats):
        if b["from"] <= t < b["to"] or (i == len(beats) - 1 and t >= b["from"]):
            return i, b
    return 0, beats[0]


def grammar_camera_pose(shot_payload, scene_payload, grammar, t):
    """The grammar path: pose the ACTIVE beat in beat-local time, then
    ease into the NEXT beat's start camera across the fade zone. Both
    solves share the framing context, so the framing never drifts
    between beats."""
    fr = _Framing(shot_payload, scene_payload)
    idx, beat = _beat_at(grammar, t)
    span = max(1e-6, beat["to"] - beat["from"])
    lt = clamp((t - beat["from"]) / span, 0.0, 1.0)
    radius, h, angle, lateral, target, lens = apply_camera_move(beat["move"], lt, fr)

    nxt = grammar[idx + 1] if idx + 1 < len(grammar) else None
    if nxt is not None and lt > (1.0 - GRAMMAR_FADE):
        k = ease_in_out_cubic((lt - (1.0 - GRAMMAR_FADE)) / GRAMMAR_FADE)
        r2, h2, a2, lat2, t2, lens2 = apply_camera_move(nxt["move"], 0.0, fr)
        radius = radius + (r2 - radius) * k
        h = h + (h2 - h) * k
        angle = angle + (a2 - angle) * k
        lateral = lateral + (lat2 - lateral) * k
        target = [target[i] + (t2[i] - target[i]) * k for i in range(3)]
        lens = lens + (lens2 - lens) * k

    # subject follow: a beat's own pose pair overrides the whole-clip
    # pair on the BEAT clock (a lunge completes inside its beat); when
    # the beat carries none, the global pair keeps its GLOBAL clock
    if fr.framed:
        ps = normalize_pose(beat.get("poseStart"))
        pe = normalize_pose(beat.get("poseEnd"))
        if ps or pe:
            rx = lerp_pose(ps or pe, pe or ps, lt)[0]
            radius += rx * 0.42
        elif fr.has_poses:
            rx = lerp_pose(shot_payload.get("poseStart"), shot_payload.get("poseEnd"), t)[0]
            radius += rx * 0.42

    pos = _solve_position(radius, h, angle, lateral)
    if beat["move"] == "STATIC":
        pos[2] += math.sin(t * math.pi * 2) * 0.015  # breathing lock-off
    return pos, target, lens


def grammar_pose_state(grammar, shot_payload, t):
    """The pose pair + clock the figure performs at t under a grammar:
    the active beat's own pair runs on the BEAT-LOCAL clock (a per-beat
    lunge completes inside its beat); a beat without poses falls back
    to the shot's global pair on the GLOBAL clock (lt=None - the whole-
    clip pose program must not restart at every beat cut)."""
    idx, beat = _beat_at(grammar, t)
    span = max(1e-6, beat["to"] - beat["from"])
    lt = clamp((t - beat["from"]) / span, 0.0, 1.0)
    ps = normalize_pose(beat.get("poseStart"))
    pe = normalize_pose(beat.get("poseEnd"))
    if ps or pe:
        return ps or pe, pe or ps, lt
    return shot_payload.get("poseStart"), shot_payload.get("poseEnd"), None


# ── v7.2 PER-BEAT SECONDARY MOTION: cloth and hair ride the beats.
#    The figure's cloth (sash tail, skirt panels, sleeves, cuffs) and
#    hair (back mass, style piece, beard) hang from PIVOT EMPTIES at
#    their anchors; per frame each pivot is driven by a damped spring
#    whose target comes from the DIRECTED beat under the playhead -
#    the beat's own WIND call, the blocking's implied motion, the
#    body's pose velocity (cloth drags opposite), the stride when the
#    pose walks, and an impulse at every beat boundary (a pose jump or
#    a move change across a cut stirs the air). Fixed dt and per-chain
#    phases keep it deterministic. ──

MOVE_ENERGY = {
    # what the AIR is doing while each move plays - a tracking shot
    # implies running wind, a lock-off implies stillness
    "TRACKING": 1.0, "ORBIT": 0.85, "CRANE": 0.6, "DOLLY_IN": 0.55,
    "DOLLY_OUT": 0.5, "PAN": 0.35, "TILT_UP": 0.3, "TILT_DOWN": 0.3,
    "STATIC": 0.08,
}

# (stiffness, damping, drive gain, max deflection deg) per chain kind:
# cloth hangs heavy and follows through late, hair is light and snaps
# back fast, skirt panels stay modest so they never read as legs
SEC_KINDS = {
    "CLOTH": (26.0, 7.5, 0.85, 16.0),
    "SKIRT": (30.0, 8.5, 0.5, 9.0),
    "HAIR": (42.0, 9.5, 0.62, 13.0),
}

# the shared figure vocabulary: the designed figure, the stand-in and
# the loaded cast assets all build these part names
SEC_PARTS = (
    ("SashTail", "CLOTH"), ("RSleeve", "CLOTH"), ("LSleeve", "CLOTH"),
    ("RCuff", "CLOTH"), ("LCuff", "CLOTH"),
    ("HairBack", "HAIR"), ("HairKnot", "HAIR"), ("HairLong", "HAIR"),
    ("HairFringe", "HAIR"),
    ("BeardChin", "HAIR"), ("BeardJawL", "HAIR"), ("BeardJawR", "HAIR"), ("BeardLip", "HAIR"),
)
SEC_PREFIXES = (("SkirtPanel", "SKIRT"), ("HairTail", "HAIR"), ("HairBraid", "HAIR"))


def _sec_kind(name):
    for nm, kind in SEC_PARTS:
        if name == nm:
            return kind
    for pre, kind in SEC_PREFIXES:
        if name.startswith(pre):
            return kind
    return None


def _subtree(root):
    """Every descendant of root (the figure's whole hierarchy)."""
    out = []
    stack = [root]
    while stack:
        for ch in stack.pop().children:
            out.append(ch)
            stack.append(ch)
    return out


def build_secondary_rig(bpy, scn, figure):
    """Wrap every cloth/hair part in a pivot empty at its hang point:
    the pivot takes the part's place in the hierarchy (same parent),
    sits at the part's TOP edge, and the part re-hangs from it - so a
    small pivot rotation reads as cloth swinging from its anchor, not
    as the mesh orbiting its own middle. The scan is scoped to THIS
    figure's subtree (a second figure's robes answer their own body,
    not the hero's). Returns the chain list (empty when the figure
    carries no known cloth/hair parts - honest)."""
    root = figure.get("root")
    candidates = _subtree(root) if root is not None else list(scn.objects)
    parts = []
    for ob in candidates:
        if ob.type != "MESH" or ob.parent is None:
            continue
        kind = _sec_kind(ob.name)
        if kind:
            parts.append((ob, kind))
    if not parts:
        return []
    try:
        bpy.context.view_layer.update()
    except Exception:  # noqa: BLE001
        pass
    chains = []
    for i, (ob, kind) in enumerate(parts):
        dz = clamp(ob.dimensions.z * 0.45, 0.004, 0.16)
        loc = (ob.location.x, ob.location.y, ob.location.z)
        piv = bpy.data.objects.new(f"SecPiv_{ob.name}", None)
        scn.collection.objects.link(piv)
        piv.empty_display_size = 0.02
        piv.parent = ob.parent
        piv.location = (loc[0], loc[1], loc[2] + dz)
        ob.parent = piv
        ob.location = (loc[0], loc[1], loc[2] - dz)
        stiff, damp, gain, maxd = SEC_KINDS[kind]
        chains.append({
            "piv": piv, "ob": ob, "kind": kind, "stiff": stiff, "damp": damp,
            "gain": gain, "max": maxd, "phase": i * 1.7,
            "vel": [0.0, 0.0], "off": [0.0, 0.0],
        })
    return chains


def apply_secondary_motion(figure, chains, grammar, shot, t, t_sec, dt, pose_s, pose_e, pose_t):
    """Drive the cloth/hair chains for this frame: the ACTIVE grammar
    beat decides the air (its wind call + the move's implied motion),
    a beat boundary kicks the springs (a pose jump across the cut
    whips the cloth - the follow-through the grammar forgot), the
    body's pose velocity drags the chains opposite, a WALK pose adds
    the stride sway, and a per-chain phased breeze keeps holds alive.
    Semi-implicit damped spring at fixed dt - deterministic."""
    if not chains:
        return None
    st = figure.get("_sec")
    if st is None:
        st = {"prev_row": None, "prev_beat": -1, "maxd": 0.0, "wind_beats": set()}
        figure["_sec"] = st
    # the beat under the playhead decides what the air is doing
    if grammar:
        bi, beat = _beat_at(grammar, t)
        wind = float(beat.get("wind") or 0.0)
        agit = MOVE_ENERGY.get(beat["move"], 0.3)
        if wind > 0.0:
            st["wind_beats"].add(bi)
    else:
        bi, beat = -1, None
        wind = 0.0
        agit = MOVE_ENERGY.get(str(shot.get("movement") or "STATIC").upper(), 0.25)
    drive = wind * 1.45 + agit * 0.45 + 0.12  # + ambient life: holds are never frozen
    # beat boundary: a cut stirs the air - the harder the change, the
    # harder the whip (pose jump across the boundary + move change)
    kick = 0.0
    if bi != st["prev_beat"]:
        if st["prev_beat"] >= 0:
            kick = 0.3
            if grammar:
                prev = grammar[st["prev_beat"]]
                kick += 0.7 * abs(agit - MOVE_ENERGY.get(prev["move"], 0.3))
                a = POSE_JOINTS.get(normalize_pose(prev.get("poseEnd")) or normalize_pose(prev.get("poseStart")))
                b = POSE_JOINTS.get(normalize_pose(beat.get("poseStart")))
                if a and b:
                    kick += sum(abs(b[i] - a[i]) for i in range(2, 12)) / 190.0
        st["prev_beat"] = bi
    kick = clamp(kick, 0.0, 1.6)
    # body velocity: cloth drags BEHIND the body - opposite and
    # proportional, then the spring pulls it back (follow-through)
    row = lerp_pose(pose_s or "STANCE", pose_e or "STANCE", pose_t)
    fwd = 0.0
    lat = 0.0
    if st["prev_row"] is not None and dt > 0:
        d = [row[i] - st["prev_row"][i] for i in range(12)]
        fwd = (d[2] + 0.55 * d[3] + 0.3 * (d[4] + d[6])) / dt
        lat = 0.5 * d[0] / dt
    st["prev_row"] = row
    stride = 0.0
    if "WALK" in (normalize_pose(pose_s) or "", normalize_pose(pose_e) or ""):
        stride = math.sin(t_sec * 2.2 * math.pi * 2.0)
    tx_base = clamp(-fwd * 0.5, -10.0, 10.0) + stride * 3.0
    ty_base = clamp(lat * 26.0, -8.0, 8.0)
    # v9.1: THE CLOTH ANSWERS THE BODY - a directed REACTION's stagger
    # velocity (published on the figure by the physics pass the SAME
    # frame) whips the chains with the body's jerk, so a recoil lands
    # as robes and hair snapping after the torso - one body, one cloth
    stg = figure.get("_stagger")
    if stg:
        svx = float(stg.get("vx") or 0.0)
        svy = float(stg.get("vy") or 0.0)
        if abs(svx) > 1e-4 or abs(svy) > 1e-4:
            tx_base = clamp(tx_base + svy * 7.5, -12.0, 12.0)
            ty_base = clamp(ty_base + svx * 7.5, -9.0, 9.0)
            jerk_kick = min(1.0, float(stg.get("jerk") or 0.0) / 1.4)
            for ch in chains:
                ch["vel"][0] += jerk_kick * ch["gain"] * 16.0 * (0.7 + 0.3 * math.sin(ch["phase"]))
                ch["vel"][1] += jerk_kick * ch["gain"] * 9.0 * math.sin(ch["phase"] * 1.3)
    for ch in chains:
        if ch.get("sim"):
            continue   # v10.0: this part rides the real cloth solver now
        stiff, damp, gain, maxd = ch["stiff"], ch["damp"], ch["gain"], ch["max"]
        # the directed gust + blocking agitation, phased per chain so
        # the eight skirt panels never flap in lockstep
        gust = drive * gain * (6.5 + 2.2 * math.sin(t_sec * 2.4 + ch["phase"]))
        tx = clamp(tx_base * gain + gust, -maxd, maxd)
        ty = clamp(ty_base * gain + gust * 0.35 * math.sin(ch["phase"] + t_sec * 1.7), -maxd, maxd)
        if kick > 0.0:
            ch["vel"][0] += kick * gain * 55.0 * (0.7 + 0.3 * math.sin(ch["phase"]))
            ch["vel"][1] += kick * gain * 26.0 * math.sin(ch["phase"] * 1.3)
        # semi-implicit damped spring, fixed dt
        ch["vel"][0] += (stiff * (tx - ch["off"][0]) - damp * ch["vel"][0]) * dt
        ch["vel"][1] += (stiff * (ty - ch["off"][1]) - damp * ch["vel"][1]) * dt
        ch["off"][0] = clamp(ch["off"][0] + ch["vel"][0] * dt, -maxd, maxd)
        ch["off"][1] = clamp(ch["off"][1] + ch["vel"][1] * dt, -maxd, maxd)
        ch["piv"].rotation_euler = (math.radians(ch["off"][0]), math.radians(ch["off"][1]), 0.0)
        sweep = abs(ch["off"][0]) + abs(ch["off"][1])
        if sweep > st["maxd"]:
            st["maxd"] = sweep
    st["last_kick"] = kick   # the solver's anchors answer the same whip
    return st


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

    # THE HAND CLOSES ON THE HILT (iteration 97): the stand-in's
    # energy blade grips like the designed kinds - one GRIP PIVOT at
    # the fist's own anchor (the law's), the cone centered ON it
    # (its midpoint gripped - the contact the v3.2 read always
    # meant), riding the pivot the follow-through flexes.
    grip_pivot = empty("GripPivot", r_hand, GRIP_ANCHOR)
    blade = prim(scn, bpy.ops.mesh.primitive_cone_add, radius1=0.05, radius2=0.0, depth=1.2, vertices=6, location=(0, 0, 0), )
    blade.name = "HandBlade"
    blade.data.materials.append(blade_mat)
    blade.parent = grip_pivot
    blade.location = (0.0, 0.0, 0.0)  # the fist grips the cone's midpoint
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
        "gripPivot": grip_pivot,
    }


def apply_pose(figure, pose_start, pose_end, t, t_sec, speech=None, expr=None):
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
    and widens/purses with the vowels.

    v84 THE FACE PERFORMS THE BEAT: `expr` carries the blended
    expression weights at this frame ({brow, squint, mouthFloor, knit,
    cheek, corner, jaw}) - the brow/eye/mouth channels compose with it
    additively/multiplicatively BEFORE the rig writes them, and the
    head's four shape keys take the mesh weights. expr=None keeps the
    face exactly pose-driven (the legacy paths)."""
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
    # ── THE FEET STAY PLANTED (iteration 96): the pose drove the
    #    intent; the two-bone IK now solves each leg against the
    #    ground plane with the EFFECTIVE thigh angle (table + walk
    #    swing) and the hip's height (built rest + rootY + bob). The
    #    knees take the solved (fold-only) angles and the root takes
    #    the worse leg's residual lift; a floating foot is named, not
    #    fixed. The frame's answer rides the figure's aggregate (the
    #    state's post-loop report reads it). ──
    ik_r = solve_leg_ik(root_y + bob, r_leg + leg_r, r_knee)
    ik_l = solve_leg_ik(root_y + bob, l_leg + leg_l, l_knee)
    lift = max(ik_r["residual"], ik_l["residual"])
    root.location = (0.0, -root_x * s, (root_y + bob + lift) * s)
    figure["rKnee"].rotation_euler = (math.radians(ik_r["knee"]), 0.0, 0.0)
    figure["lKnee"].rotation_euler = (math.radians(ik_l["knee"]), 0.0, 0.0)
    agg = figure.get("_legik")
    if agg is None:
        agg = figure["_legik"] = {
            "frames": 0, "solvedFrames": 0, "maxPenBefore": 0.0,
            "maxKneeDelta": 0.0, "maxRootLift": 0.0, "maxResidual": 0.0,
        }
    agg["frames"] += 1
    if ik_r["solved"] or ik_l["solved"]:
        agg["solvedFrames"] += 1
    agg["maxPenBefore"] = max(agg["maxPenBefore"], ik_r["pen"], ik_l["pen"])
    agg["maxKneeDelta"] = max(
        agg["maxKneeDelta"], abs(ik_r["knee"] - r_knee), abs(ik_l["knee"] - l_knee))
    agg["maxRootLift"] = max(agg["maxRootLift"], lift)
    agg["maxResidual"] = max(agg["maxResidual"], ik_r["residual"], ik_l["residual"])

    # ── face rig (v3.2): brows mirror their tilt so the inner ends
    # move together (+ brow = inner up, surprised; - = angry knit),
    # eyes squash with openness and blink on the deterministic
    # schedule, the mouth slab opens with the channel value, and a
    # slow sinus drift keeps the brows alive on holds
    brow += math.sin(t_sec * math.pi * 2.0 * 0.9) * 1.5
    eye = blink_openness(t_sec, eye)
    # ── THE FACE PERFORMS THE BEAT (v84): the expression composes
    # with the pose channels BEFORE the rig writes them - the brow
    # delta rides additively (14 deg per library unit), the squint
    # lowers the lids multiplicatively, the mouth floor lifts the
    # openness (speech still wins the mouth - the line is being
    # spoken), and the four shape keys take the mesh weights
    if isinstance(expr, dict):
        brow = clamp(brow + 14.0 * float(expr.get("brow", 0.0)), -45.0, 45.0)
        eye = eye * (1.0 - 0.55 * clamp(float(expr.get("squint", 0.0)), 0.0, 1.0))
        mouth = max(mouth, float(expr.get("mouthFloor", 0.0)))
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

    # ── THE FACE PERFORMS THE BEAT (v84): the mesh half - the head's
    # four shape keys take the blended weights (the corner key is
    # signed: + lifts the smile, - drops the frown). A rig without
    # the keys (the stand-in, an asset load) skips honestly.
    if isinstance(expr, dict):
        keys = figure.get("exprKeys") or {}
        for name, weight in (("browKnit", "knit"), ("cheekRaise", "cheek"), ("mouthCorner", "corner"), ("jawOpen", "jaw")):
            kb = keys.get(name)
            if kb is not None:
                kb.value = clamp(float(expr.get(weight, 0.0)), float(kb.slider_min), float(kb.slider_max))

    # ── THE FACE CREASES WHEN IT ACTS (v93): the wrinkle normals'
    # strengths ride the LIVE expression weights the same frame the
    # shape keys do - the furrow deepens as the scowl deepens, the
    # corner map wears by the absolute weight, and a face at rest
    # rests at zero (no faked crease). A rig without the nodes (the
    # hero - its creases are real geometry - the stand-in, an asset
    # load) has nothing to drive. ──
    wnodes = figure.get("wrinkleNodes") or {}
    if wnodes:
        wweights = {"browKnit": 0.0, "cheekRaise": 0.0, "mouthCorner": 0.0}
        if isinstance(expr, dict):
            wweights["browKnit"] = clamp(float(expr.get("knit", 0.0)), 0.0, 1.0)
            wweights["cheekRaise"] = clamp(float(expr.get("cheek", 0.0)), 0.0, 1.0)
            wweights["mouthCorner"] = abs(clamp(float(expr.get("corner", 0.0)), -1.0, 1.0))
        for wshape, wnode in wnodes.items():
            try:
                wnode.inputs["Strength"].default_value = wrinkle_strength_for(wweights.get(wshape, 0.0))
            except Exception:  # noqa: BLE001
                pass

    # ── THE MOUTH SPEAKS IN THE MESH (v92): the mesh half of the
    # lip-sync - the sampled viseme drives the three speech shape
    # keys (the spread, the purse, the bilabial press) and the jaw
    # follows the line at the bounded fraction, composed with the
    # expression's own jaw by max (the spoken line never flattens
    # the performed scowl beneath it). A rig without the keys skips
    # honestly (the stand-in, an asset load).
    if speech is not None:
        mw = speech_mesh_weights(speech)
        skeys = figure.get("speechKeys") or {}
        for name, wkey in (("mouthWide", "wide"), ("mouthRound", "round"), ("lipPress", "press")):
            kb = skeys.get(name)
            if kb is not None:
                kb.value = clamp(float(mw.get(wkey, 0.0)), 0.0, 1.0)
        jkb = (figure.get("exprKeys") or {}).get("jawOpen")
        if jkb is not None:
            jaw_target = float(mw.get("jaw", 0.0))
            if isinstance(expr, dict):
                jaw_target = max(jaw_target, clamp(float(expr.get("jaw", 0.0)), 0.0, 1.0))
            jkb.value = clamp(jaw_target, float(jkb.slider_min), float(jkb.slider_max))
    else:
        # between segments (and on silent shots) the mouth RESTS: the
        # speech keys return to zero and the jaw returns to the
        # expression's own jaw (the block above already wrote it when
        # a clip rides) - a mouth frozen mid-shape between words is
        # the same tell this law exists to kill
        for kb in (figure.get("speechKeys") or {}).values():
            kb.value = 0.0

    # ── hand rig (v3.2): grip curls the fingers, point straightens the
    # index, the thumb half-curls with the grip
    for side, grip, point in (("r", grip_r, point_r), ("l", grip_l, point_l)):
        for piv, is_index in figure[f"{side}Fingers"]:
            piv.rotation_euler.x = math.radians(finger_curl(grip, point, is_index))
        figure[f"{side}Thumb"].rotation_euler.x = math.radians(20 + thumb_curl(grip))

    # ── blade follow-through: proportional to the eased swing rate of
    # the right shoulder, clamped so fast slashes lag believably but
    # never break the read of the pose. A figure with no weapon in
    # hand carries blade: None - the follow-through simply has
    # nothing to lag (a weaponless cultivator is a valid design).
    a_row = POSE_JOINTS[normalize_pose(pose_start) or "STANCE"]
    b_row = POSE_JOINTS[normalize_pose(pose_end) or "STANCE"]
    x = clamp(t, 0.0, 1.0)
    k_deriv = 12.0 * x * x if x < 0.5 else 12.0 * (1.0 - x) * (1.0 - x)
    lag = clamp((b_row[4] - a_row[4]) * k_deriv * 0.03, -12.0, 12.0)
    # ── THE HAND CLOSES ON THE HILT (iteration 97): the follow-through
    #    pivots the WHOLE weapon around the fist (the physically honest
    #    flex) - the pieces keep their law placements on the kind's own
    #    axis, the pivot takes the lag. A figure without the pivot (an
    #    old asset load) falls back to the legacy blade re-tilt, and a
    #    weaponless figure has nothing to flex - both honest. ──
    if figure.get("gripPivot") is not None:
        figure["gripPivot"].rotation_euler.x = math.radians(lag)
    elif figure.get("blade") is not None:
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


def silhouette_shape(dna):
    """THE SILHOUETTE SHAPES THE MESH (iteration 81): validate + clamp
    the shaping profile the sheet read compiled (adherence.ts) - pure,
    bounded, honest. A wild, missing or neutral field degrades to 1.0
    (the builder's default outline); a DNA dict with no profile at all
    (a guess build, an old payload) returns None and the figure stays
    exactly as previous iterations built it. The worker re-clamps
    against the same bounds - one law, two runtimes."""
    raw = dna.get("silhouetteShape")
    if not isinstance(raw, dict):
        return None
    bounds = {
        "height": (0.92, 1.12), "shoulders": (0.82, 1.25), "torso": (0.85, 1.2),
        "sleeves": (0.9, 1.35), "skirt": (0.9, 1.3), "hair": (0.75, 1.5),
    }
    factors, named = {}, []
    for key, (lo, hi) in bounds.items():
        v = raw.get(key)
        if isinstance(v, (int, float)) and math.isfinite(float(v)):
            factors[key] = round(max(lo, min(hi, float(v))), 3)
            if abs(factors[key] - 1.0) > 0.001:
                named.append(key)
        else:
            factors[key] = 1.0
    fields_raw = raw.get("fields")
    fields = [str(f) for f in fields_raw][:8] if isinstance(fields_raw, list) else []
    return {"factors": factors, "named": named, "fields": fields}


# ── THE FACE IS SCULPTED, NOT ASSEMBLED (iteration 82, Frontier 1
#    deeper): the measured cast gap survived the palette AND the
#    silhouette because the head itself was an assembled sphere - box
#    brows on a ball reads MANNEQUIN, and no palette fixes a
#    mannequin. The head is now a real sculpted mesh, and the sheet
#    read's faceShape field modulates the sculpt through a bounded
#    face profile (the same one-law-two-runtimes pattern as the
#    silhouette). Mesh only: the rig anchors stay. ──

FACE_BOUNDS = {
    "jawTaper": (0.55, 0.9), "chinFwd": (0.0, 0.05), "browFwd": (0.0, 0.03),
    "cheekOut": (0.0, 0.045), "noseLen": (0.7, 1.4), "eyeScale": (0.85, 1.25),
}

FACE_PRIORS = {
    "oval":    {"jawTaper": 0.74, "chinFwd": 0.028, "browFwd": 0.014, "cheekOut": 0.022, "noseLen": 1.0,  "eyeScale": 1.05},
    "round":   {"jawTaper": 0.84, "chinFwd": 0.016, "browFwd": 0.008, "cheekOut": 0.034, "noseLen": 0.86, "eyeScale": 1.14},
    "angular": {"jawTaper": 0.64, "chinFwd": 0.042, "browFwd": 0.024, "cheekOut": 0.014, "noseLen": 1.12, "eyeScale": 0.96},
}


def face_profile(dna):
    """THE FACE IS SCULPTED, NOT ASSEMBLED (iteration 82): validate +
    clamp the face profile the sheet read compiled (adherence.ts) -
    one law, two runtimes. The head is ALWAYS sculpted: a missing or
    unknown faceShape keeps the neutral (oval) sculpt honestly named;
    a compiled profile on the wire wins field by field (clamped
    against the same bounds the TS side clamps against)."""
    raw = dna.get("faceProfile") if isinstance(dna, dict) else None
    shape_name = dna.get("faceShape") if isinstance(dna, dict) else None
    named = isinstance(shape_name, str) and shape_name.strip().lower() in FACE_PRIORS
    key = shape_name.strip().lower() if named else "oval"
    factors = dict(FACE_PRIORS[key])
    if isinstance(raw, dict):
        for bkey, (lo, hi) in FACE_BOUNDS.items():
            v = raw.get(bkey)
            if isinstance(v, (int, float)) and math.isfinite(float(v)):
                factors[bkey] = round(max(lo, min(hi, float(v))), 4)
    fields_raw = raw.get("fields") if isinstance(raw, dict) else None
    fields = [str(f) for f in fields_raw][:8] if isinstance(fields_raw, list) else []
    return {
        "factors": factors,
        "faceShape": key if named else None,
        "fields": fields,
    }


# ── THE SURFACE IS GRADED, NOT PAINTED (iteration 83, Frontier 1
#    deeper): the measured cast gap survived the palette AND the
#    silhouette AND the sculpt because the SURFACE was still flat -
#    one Principled BSDF, one base color, one roughness scalar - and
#    the vision model's own re-score notes named it ("low-poly 3D
#    mannequin", a MATERIAL gap, not a geometry one). Every material
#    is now a layered surface: skin carries subsurface (the soft
#    terminator), roughness breakup (the micro noise), warm zones
#    (the cheeks/forehead push) and a fresnel rim (the painted edge
#    light); cloth carries the gradient ramp (shadow/high derived
#    from the SAME dye), the fabric sheen and the weave bump; hair
#    carries the tinted glint. One law, two runtimes: the profile is
#    compiled from the sheet read's own hexes in adherence.ts and
#    re-clamped here against the same bounds. The surface is ALWAYS
#    graded now - a payload without a profile keeps the neutral
#    grade, honestly named (the flat plastic was a pipeline defect,
#    not a sheet trait). ──

MATERIAL_BOUNDS = {
    "skinSss": (0.6, 1.4), "skinRough": (0.35, 0.65), "skinWarmth": (0.0, 0.3),
    "rim": (0.0, 0.35), "clothRamp": (0.0, 0.5), "clothSheen": (0.0, 0.6),
    "clothWeave": (0.0, 0.5), "hairRough": (0.2, 0.5),
}

MATERIAL_NEUTRAL = {
    "skinSss": 1.0, "skinRough": 0.45, "skinWarmth": 0.15, "rim": 0.2,
    "clothRamp": 0.25, "clothSheen": 0.35, "clothWeave": 0.25, "hairRough": 0.3,
}


def material_profile(dna):
    """THE SURFACE IS GRADED, NOT PAINTED (iteration 83): validate +
    clamp the material profile the sheet read compiled (adherence.ts)
    - one law, two runtimes. The surface is ALWAYS graded: a missing,
    wild or partial profile fills from the neutral grade (clamped
    against the same bounds the TS side clamps against) and the fields
    list names only what the sheet read itself owns."""
    raw = dna.get("materialProfile") if isinstance(dna, dict) else None
    factors = dict(MATERIAL_NEUTRAL)
    fields = []
    if isinstance(raw, dict):
        for key, (lo, hi) in MATERIAL_BOUNDS.items():
            v = raw.get(key)
            if isinstance(v, (int, float)) and math.isfinite(float(v)):
                factors[key] = round(max(lo, min(hi, float(v))), 4)
        fr = raw.get("fields")
        fields = [str(f) for f in fr][:8] if isinstance(fr, list) else []
    return {"factors": factors, "fields": fields}


def _graded_factors(prof):
    """The clamped factors dict a graded tree builds from (the neutral
    grade when the profile is not the shape the validator returns)."""
    if isinstance(prof, dict):
        f = prof.get("factors")
        if isinstance(f, dict):
            return {k: (float(f[k]) if isinstance(f.get(k), (int, float)) and math.isfinite(float(f[k])) else MATERIAL_NEUTRAL[k]) for k in MATERIAL_NEUTRAL}
    return dict(MATERIAL_NEUTRAL)


def _grade_common(mat):
    """Reset a material to a clean two-node tree and return (nt, bsdf,
    output). Every graded tree rebuilds from scratch so a regrade
    (the palette law re-setting the dye) cannot leave stale nodes."""
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (900, 0)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.location = (560, 0)
    nt.links.new(b.outputs[0], out.inputs[0])
    return nt, b, out


def _lift(color, amount):
    """Mix a linear color toward white (the rim highlight end)."""
    return tuple(min(1.0, c + (1.0 - c) * amount) for c in color)


def _grade_skin_tree(mat, color_hex, prof, sdepth=None):
    """THE SURFACE IS GRADED (iteration 83): the skin tree - ONE dye
    (the sheet's own skinTone) pushed through subsurface, roughness
    breakup, warm zones and a fresnel rim. Rebuilds from scratch, so
    the same dye always lands the same tree. THE SKIN IS ALIVE
    (iteration 91): when the skin-depth profile rides (sdepth), the
    flat token subsurface retires - the hex's own depth drives the
    subsurface weight + radius triplet + scatter scale and the COAT
    pair above the diffusion (subsurface beneath, the carve's baked
    normal wears in above)."""
    f = _graded_factors(prof)
    nt, b, _out = _grade_common(mat)
    base = hex_to_rgb(color_hex)
    r, g, bl = base
    b.inputs["Base Color"].default_value = (*base, 1.0)
    sdf = None
    if isinstance(sdepth, dict):
        # both shapes ride: the flat depth dict skin_depth() returns,
        # or the regrade's {"factors": ...} wrapper over the stored prop
        raw_f = sdepth.get("factors")
        if not isinstance(raw_f, dict):
            raw_f = sdepth if all(k in sdepth for k in SKIN_DEPTH_BOUNDS) else None
        if isinstance(raw_f, dict) and all(isinstance(raw_f.get(k), (int, float)) and not isinstance(raw_f.get(k), bool)
                                           and math.isfinite(float(raw_f[k])) for k in SKIN_DEPTH_BOUNDS):
            sdf = {k: _clamp3(raw_f[k], *SKIN_DEPTH_BOUNDS[k]) for k in SKIN_DEPTH_BOUNDS}
    if "Subsurface Weight" in b.inputs:
        if sdf is not None:
            # the hex's own depth: the weight the luminance set, the
            # radius triplet's reach (red scatters furthest - the
            # hemoglobin law; the numbers live in the worker), the
            # scatter scale explicit (no default gamble), the coat pair
            rad = sdf["radius"]
            b.inputs["Subsurface Weight"].default_value = sdf["weight"]
            b.inputs["Subsurface Radius"].default_value = (0.014 * rad, 0.0053 * rad, 0.0025 * rad)
            if "Subsurface Scale" in b.inputs:
                b.inputs["Subsurface Scale"].default_value = sdf["scale"]
            if "Coat Weight" in b.inputs:
                b.inputs["Coat Weight"].default_value = sdf["coat"]
            if "Coat Roughness" in b.inputs:
                b.inputs["Coat Roughness"].default_value = sdf["coatRough"]
            mat["animeosSkinDepth"] = json.dumps(sdf, sort_keys=True)
        else:
            b.inputs["Subsurface Weight"].default_value = 0.14
            b.inputs["Subsurface Radius"].default_value = (0.016 * f["skinSss"], 0.006, 0.003)
    if "Sheen Weight" in b.inputs:
        b.inputs["Sheen Weight"].default_value = 0.12
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = 0.35
    # 1. roughness breakup: fine two-tone noise bracketing the base
    n_rough = nt.nodes.new("ShaderNodeTexNoise")
    n_rough.location = (-560, -280)
    n_rough.inputs["Scale"].default_value = 38.0
    n_rough.inputs["Detail"].default_value = 6.0
    r_ramp = nt.nodes.new("ShaderNodeValToRGB")
    r_ramp.location = (-340, -280)
    e0, e1 = r_ramp.color_ramp.elements[0], r_ramp.color_ramp.elements[1]
    e0.position, e1.position = 0.38, 0.68
    lo = max(0.08, f["skinRough"] - 0.08)
    hi = min(0.92, f["skinRough"] + 0.07)
    e0.color, e1.color = (lo, lo, lo, 1.0), (hi, hi, hi, 1.0)
    nt.links.new(n_rough.outputs["Fac"], r_ramp.inputs["Fac"])
    nt.links.new(r_ramp.outputs["Color"], b.inputs["Roughness"])
    # 2. warm zones: coarse noise pushes the dye toward the warm end
    n_zone = nt.nodes.new("ShaderNodeTexNoise")
    n_zone.location = (-560, 80)
    n_zone.inputs["Scale"].default_value = 5.5
    n_zone.inputs["Detail"].default_value = 3.0
    z_ramp = nt.nodes.new("ShaderNodeValToRGB")
    z_ramp.location = (-340, 80)
    z_ramp.color_ramp.elements[0].position = 0.42
    z_ramp.color_ramp.elements[1].position = 0.72
    z_mul = nt.nodes.new("ShaderNodeMath")
    z_mul.location = (-340, -60)
    z_mul.operation = "MULTIPLY"
    z_mul.inputs[1].default_value = f["skinWarmth"]
    z_mix = nt.nodes.new("ShaderNodeMixRGB")
    z_mix.location = (-100, 120)
    z_mix.blend_type = "MIX"
    warm = (min(1.0, r * 1.12 + 0.02), g * 0.97, max(0.0, bl - 0.02))
    z_mix.inputs["Color1"].default_value = (*base, 1.0)
    z_mix.inputs["Color2"].default_value = (*warm, 1.0)
    nt.links.new(n_zone.outputs["Fac"], z_ramp.inputs["Fac"])
    nt.links.new(z_ramp.outputs["Color"], z_mul.inputs[0])
    nt.links.new(z_mul.outputs[0], z_mix.inputs["Fac"])
    # 3. fresnel rim: the grazing angle lifts toward the lightened dye
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.location = (-560, 420)
    lw.inputs["Blend"].default_value = 0.72
    rim_mul = nt.nodes.new("ShaderNodeMath")
    rim_mul.location = (-340, 420)
    rim_mul.operation = "MULTIPLY"
    rim_mul.inputs[1].default_value = f["rim"]
    r_mix = nt.nodes.new("ShaderNodeMixRGB")
    r_mix.location = (240, 120)
    r_mix.blend_type = "MIX"
    lift = _lift(base, 0.45)
    r_mix.inputs["Color2"].default_value = (*lift, 1.0)
    nt.links.new(lw.outputs["Fresnel"], rim_mul.inputs[0])
    nt.links.new(rim_mul.outputs[0], r_mix.inputs["Fac"])
    nt.links.new(z_mix.outputs[0], r_mix.inputs["Color1"])
    nt.links.new(r_mix.outputs[0], b.inputs["Base Color"])
    mat["animeosKind"] = "skin"
    mat["animeosBaseHex"] = str(color_hex)
    mat["animeosProfile"] = json.dumps(prof, sort_keys=True)


def _grade_cloth_tree(mat, color_hex, prof):
    """THE SURFACE IS GRADED (iteration 83): the cloth tree - the dye
    ramped into shadow/high ends (the painted gradient), the fabric
    sheen, the weave bump and the fold-rim lift. The robe, the accent
    and the boots all build from this one tree."""
    f = _graded_factors(prof)
    nt, b, _out = _grade_common(mat)
    base = hex_to_rgb(color_hex)
    ramp = f["clothRamp"]
    shadow = tuple(c * (1.0 - ramp * 0.55) for c in base)
    high = _lift(base, ramp * 0.4)
    b.inputs["Roughness"].default_value = 0.82
    if "Sheen Weight" in b.inputs:
        b.inputs["Sheen Weight"].default_value = f["clothSheen"]
        b.inputs["Sheen Tint"].default_value = (*_lift(base, 0.3), 1.0)
    # 1. the ramp: medium-scale mottle mixes shadow..high (one dye)
    n_mottle = nt.nodes.new("ShaderNodeTexNoise")
    n_mottle.location = (-560, 80)
    n_mottle.inputs["Scale"].default_value = 8.5
    n_mottle.inputs["Detail"].default_value = 4.0
    m_ramp = nt.nodes.new("ShaderNodeValToRGB")
    m_ramp.location = (-340, 80)
    m_ramp.color_ramp.elements[0].position = 0.34
    m_ramp.color_ramp.elements[1].position = 0.7
    m_mix = nt.nodes.new("ShaderNodeMixRGB")
    m_mix.location = (-100, 120)
    m_mix.blend_type = "MIX"
    m_mix.inputs["Color1"].default_value = (*shadow, 1.0)
    m_mix.inputs["Color2"].default_value = (*high, 1.0)
    nt.links.new(n_mottle.outputs["Fac"], m_ramp.inputs["Fac"])
    nt.links.new(m_ramp.outputs["Color"], m_mix.inputs["Fac"])
    nt.links.new(m_mix.outputs[0], b.inputs["Base Color"])
    # 2. the fold rim: fresnel lifts the mottled dye toward its high end
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.location = (-560, 420)
    lw.inputs["Blend"].default_value = 0.7
    rim_mul = nt.nodes.new("ShaderNodeMath")
    rim_mul.location = (-340, 420)
    rim_mul.operation = "MULTIPLY"
    rim_mul.inputs[1].default_value = f["rim"] * 0.9
    r_mix = nt.nodes.new("ShaderNodeMixRGB")
    r_mix.location = (240, 120)
    r_mix.blend_type = "MIX"
    r_mix.inputs["Color2"].default_value = (*high, 1.0)
    nt.links.new(lw.outputs["Fresnel"], rim_mul.inputs[0])
    nt.links.new(rim_mul.outputs[0], r_mix.inputs["Fac"])
    nt.links.new(m_mix.outputs[0], r_mix.inputs["Color1"])
    nt.links.new(r_mix.outputs[0], b.inputs["Base Color"])
    # 3. the weave: a tight noise bump (the fabric is not glass)
    n_weave = nt.nodes.new("ShaderNodeTexNoise")
    n_weave.location = (-100, -320)
    n_weave.inputs["Scale"].default_value = 90.0
    n_weave.inputs["Detail"].default_value = 3.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.location = (240, -320)
    bump.inputs["Strength"].default_value = f["clothWeave"] * 0.35
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(n_weave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    mat["animeosKind"] = "cloth"
    mat["animeosBaseHex"] = str(color_hex)
    mat["animeosProfile"] = json.dumps(prof, sort_keys=True)


def _grade_hair_tree(mat, color_hex, prof):
    """THE SURFACE IS GRADED (iteration 83): the hair tree - the tinted
    glint (sheen tinted toward the lifted dye), a tight roughness
    breakup and a half-strength rim. Black hair keeps a tighter glint
    (the profile's hairRough carries the sheet's own dye decision)."""
    f = _graded_factors(prof)
    nt, b, _out = _grade_common(mat)
    base = hex_to_rgb(color_hex)
    b.inputs["Base Color"].default_value = (*base, 1.0)
    b.inputs["Roughness"].default_value = f["hairRough"]
    if "Sheen Weight" in b.inputs:
        b.inputs["Sheen Weight"].default_value = 0.25
        b.inputs["Sheen Tint"].default_value = (*_lift(base, 0.5), 1.0)
    # 1. glint breakup: medium noise brackets the dye's roughness
    n_rough = nt.nodes.new("ShaderNodeTexNoise")
    n_rough.location = (-560, -280)
    n_rough.inputs["Scale"].default_value = 24.0
    n_rough.inputs["Detail"].default_value = 4.0
    r_ramp = nt.nodes.new("ShaderNodeValToRGB")
    r_ramp.location = (-340, -280)
    e0, e1 = r_ramp.color_ramp.elements[0], r_ramp.color_ramp.elements[1]
    e0.position, e1.position = 0.4, 0.66
    lo = max(0.08, f["hairRough"] - 0.06)
    hi = min(0.7, f["hairRough"] + 0.08)
    e0.color, e1.color = (lo, lo, lo, 1.0), (hi, hi, hi, 1.0)
    nt.links.new(n_rough.outputs["Fac"], r_ramp.inputs["Fac"])
    nt.links.new(r_ramp.outputs["Color"], b.inputs["Roughness"])
    # 2. the rim, half strength (hair catches the edge light softly)
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.location = (-560, 300)
    lw.inputs["Blend"].default_value = 0.75
    rim_mul = nt.nodes.new("ShaderNodeMath")
    rim_mul.location = (-340, 300)
    rim_mul.operation = "MULTIPLY"
    rim_mul.inputs[1].default_value = f["rim"] * 0.5
    r_mix = nt.nodes.new("ShaderNodeMixRGB")
    r_mix.location = (240, 120)
    r_mix.blend_type = "MIX"
    lift = _lift(base, 0.5)
    r_mix.inputs["Color1"].default_value = (*base, 1.0)
    r_mix.inputs["Color2"].default_value = (*lift, 1.0)
    nt.links.new(lw.outputs["Fresnel"], rim_mul.inputs[0])
    nt.links.new(rim_mul.outputs[0], r_mix.inputs["Fac"])
    nt.links.new(r_mix.outputs[0], b.inputs["Base Color"])
    mat["animeosKind"] = "hair"
    mat["animeosBaseHex"] = str(color_hex)
    mat["animeosProfile"] = json.dumps(prof, sort_keys=True)


def graded_mat(bpy, kind, name, color_hex, prof, sdepth=None):
    """Build ONE graded material of the named kind (skin / cloth /
    hair) from its dye and the profile. The skin kind takes the
    skin-depth profile too (iteration 91) - the subsurface + coat
    depth the hex's own luminance and saturation set."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    if kind == "skin":
        _grade_skin_tree(mat, color_hex, prof, sdepth=sdepth)
    elif kind == "hair":
        _grade_hair_tree(mat, color_hex, prof)
    else:
        _grade_cloth_tree(mat, color_hex, prof)
    return mat


def regrade_material(mat, new_hex):
    """THE SHEET DRESSES THE RENDER meets THE SURFACE IS GRADED: a
    graded material's DYE is re-set (the ramp's shadow/high ends, the
    warm zones and the rim lift all derive from the same dye, so the
    tree rebuilds from the new hex); a legacy flat material recolors
    its Principled Base Color exactly as before. Returns True when the
    color landed, False when the material cannot take it (named in the
    conformance's skipped rows)."""
    kind = mat.get("animeosKind") if isinstance(mat.get("animeosKind"), str) else None
    prof = None
    raw_prof = mat.get("animeosProfile")
    if isinstance(raw_prof, str):
        try:
            parsed = json.loads(raw_prof)
            if isinstance(parsed, dict):
                prof = parsed
        except Exception:  # noqa: BLE001
            prof = None
    if kind in ("skin", "cloth", "hair") and prof is not None:
        mat.use_nodes = True
        if kind == "skin":
            # the stored depth rebuilds with the tree (the regrade
            # never loses the subsurface + coat the hex earned)
            sd = None
            raw_sd = mat.get("animeosSkinDepth")
            if isinstance(raw_sd, str):
                try:
                    parsed_sd = json.loads(raw_sd)
                    if isinstance(parsed_sd, dict):
                        sd = {"factors": parsed_sd}
                except Exception:  # noqa: BLE001
                    sd = None
            _grade_skin_tree(mat, new_hex, prof, sdepth=sd)
        elif kind == "hair":
            _grade_hair_tree(mat, new_hex, prof)
        else:
            _grade_cloth_tree(mat, new_hex, prof)
        return True
    b = mat.node_tree.nodes.get("Principled BSDF") if mat.use_nodes else None
    if b is None:
        return False
    b.inputs["Base Color"].default_value = (*hex_to_rgb(new_hex), 1.0)
    return True


def materials_evidence(mprof):
    """The state's material evidence: the clamped factors, the fields
    the sheet read owns, and the deterministic hash over the factors
    (the same profile lands the same grade, hash-proven)."""
    blob = json.dumps(mprof["factors"], sort_keys=True).encode("utf-8")
    return {
        "profile": mprof["factors"],
        "fields": mprof["fields"],
        "hash": hashlib.sha256(blob).hexdigest()[:16],
    }


# ── THE FACE PERFORMS THE BEAT (iteration 84, Layer A deeper): the
#    measured cast gap survived the palette AND the silhouette AND
#    the sculpt AND the grade because the FACE never performed - one
#    neutral mask from the first frame to the last, and the vision
#    model's own notes kept reading the proxy as a mannequin. The
#    expression library (mirrored from src/lib/blender/expressions.ts
#    - one law, two runtimes) blends the face rig channels and drives
#    FOUR head-mesh shape keys through an attack/hold/release curve.
#    The clip compiles from the SHOT'S OWN DRAMA on the TS side; the
#    worker validates + clamps it here against the same bounds. ──

EXPRESSION_BOUNDS = {
    "brow": (-1.0, 1.0), "squint": (0.0, 1.0), "mouthFloor": (0.0, 1.0),
    "knit": (0.0, 1.0), "cheek": (0.0, 1.0), "corner": (-1.0, 1.0),
    "jaw": (0.0, 1.0),
}

EXPRESSION_CALM = {
    "brow": 0.0, "squint": 0.06, "mouthFloor": 0.0,
    "knit": 0.0, "cheek": 0.1, "corner": 0.08, "jaw": 0.0,
}

EXPRESSION_LIBRARY = {
    "calm":     dict(EXPRESSION_CALM),
    "alert":    {"brow": 0.35, "squint": 0.0, "mouthFloor": 0.05, "knit": 0.0, "cheek": 0.08, "corner": 0.0, "jaw": 0.05},
    "resolve":  {"brow": -0.3, "squint": 0.3, "mouthFloor": 0.1, "knit": 0.35, "cheek": 0.05, "corner": -0.12, "jaw": 0.05},
    "anger":    {"brow": -0.7, "squint": 0.45, "mouthFloor": 0.25, "knit": 0.7, "cheek": 0.0, "corner": -0.5, "jaw": 0.12},
    "grief":    {"brow": 0.45, "squint": 0.35, "mouthFloor": 0.1, "knit": 0.3, "cheek": 0.0, "corner": -0.55, "jaw": 0.05},
    "joy":      {"brow": 0.1, "squint": 0.3, "mouthFloor": 0.2, "knit": 0.0, "cheek": 0.6, "corner": 0.7, "jaw": 0.1},
    "fear":     {"brow": 0.55, "squint": 0.0, "mouthFloor": 0.15, "knit": 0.15, "cheek": 0.0, "corner": -0.3, "jaw": 0.25},
    "surprise": {"brow": 0.8, "squint": 0.0, "mouthFloor": 0.3, "knit": 0.0, "cheek": 0.1, "corner": 0.05, "jaw": 0.35},
}

EXPRESSION_TIMING_BOUNDS = {"attackMs": (120, 800), "releaseMs": (200, 1200)}
EXPRESSION_SHAPES = ("browKnit", "cheekRaise", "mouthCorner", "jawOpen")


def expression_clip(shot):
    """THE FACE PERFORMS THE BEAT (iteration 84): validate + clamp the
    expression clip the TS drama compiler sent (one law, two runtimes)
    - pure, bounded, honest. A wild, missing or unknown-emotion clip
    degrades to None and the face stays pose-channel-driven exactly as
    previous iterations built it; a valid clip carries every channel
    clamped against the same bounds the TS side clamps against."""
    raw = shot.get("expression") if isinstance(shot, dict) else None
    if not isinstance(raw, dict):
        return None
    emotion = raw.get("emotion")
    if not (isinstance(emotion, str) and emotion.strip().lower() in EXPRESSION_LIBRARY):
        return None
    emotion = emotion.strip().lower()

    def num(key, default):
        v = raw.get(key)
        return float(v) if isinstance(v, (int, float)) and math.isfinite(float(v)) else float(default)

    intensity = num("intensity", 0.6)
    if intensity != intensity:  # NaN guard
        intensity = 0.6
    intensity = round(max(0.0, min(1.0, intensity)), 3)
    a_lo, a_hi = EXPRESSION_TIMING_BOUNDS["attackMs"]
    r_lo, r_hi = EXPRESSION_TIMING_BOUNDS["releaseMs"]
    attack = int(max(a_lo, min(a_hi, round(num("attackMs", 240)))))
    release = int(max(r_lo, min(r_hi, round(num("releaseMs", 480)))))
    return {"emotion": emotion, "intensity": intensity, "attackMs": attack, "releaseMs": release}


def _ease_in_out_cubic(t):
    return 4 * t * t * t if t < 0.5 else 1 - ((-2 * t + 2) ** 3) / 2


def expression_envelope(clip, t_sec, duration_sec):
    """The performance envelope at t: ease into the emotion through
    the attack, hold, ease back through the release. A clip whose
    timing does not fit the beat eases over the first/last thirds."""
    dur = max(0.1, float(duration_sec))
    t = min(max(0.0, float(t_sec)), dur)
    attack = clip["attackMs"] / 1000.0
    release = clip["releaseMs"] / 1000.0
    if attack + release >= dur:
        third = dur / 3.0
        if t < third:
            return _ease_in_out_cubic(t / third)
        if t > dur - third:
            return _ease_in_out_cubic(max(0.0, (dur - t) / third))
        return 1.0
    if t < attack:
        return _ease_in_out_cubic(t / attack)
    if t > dur - release:
        return _ease_in_out_cubic(max(0.0, (dur - t) / release))
    return 1.0


def expression_at(clip, t_sec, duration_sec):
    """The blended weights at t (mirrors expressionAt in expressions.ts):
    calm at envelope zero, the library pose scaled by intensity at
    envelope one. Every channel lands inside the bounds."""
    env = expression_envelope(clip, t_sec, duration_sec)
    target = EXPRESSION_LIBRARY.get(clip["emotion"], EXPRESSION_CALM)
    w = {}
    for key, (lo, hi) in EXPRESSION_BOUNDS.items():
        v = EXPRESSION_CALM[key] * (1.0 - env) + target[key] * clip["intensity"] * env
        w[key] = round(max(lo, min(hi, v)), 3)
    return w


def expression_evidence(clip, duration_sec):
    """The state's expression evidence: the clip, the shape keys it
    drives, the blended weights at the pose-matched sample fractions
    (22/40/62% - the same clock the identity re-score judges), and
    the DETERMINISTIC hash (mirrors expressionHash in expressions.ts)."""
    spec = f"84|{clip['emotion']}|{clip['intensity']:.3f}|{clip['attackMs']}|{clip['releaseMs']}|v1"
    samples = []
    for f in (0.22, 0.4, 0.62):
        at = round(duration_sec * f, 3)
        samples.append({"at": at, "weights": expression_at(clip, at, duration_sec)})
    return {
        "emotion": clip["emotion"],
        "intensity": clip["intensity"],
        "attackMs": clip["attackMs"],
        "releaseMs": clip["releaseMs"],
        "shapes": list(EXPRESSION_SHAPES),
        "samples": samples,
        "hash": hashlib.sha256(spec.encode("utf-8")).hexdigest()[:16],
    }


def sculpt_expression_keys(mesh):
    """THE FACE PERFORMS THE BEAT (iteration 84): sculpt the four
    expression shape keys onto the head mesh (mesh-local space, so
    the object transform never matters): browKnit (the brow band
    down + in), cheekRaise (the cheeks up + out), mouthCorner (the
    corners up - a NEGATIVE value pulls them down), jawOpen (the
    lower face drops). The basis keeps the sculpt's own positions,
    so the faceHash and the vertex count stay exactly what iteration
    82 proved them. Deterministic: the same sculpt always lands the
    same keys. Returns {name: KeyBlock}."""
    r = 0.115
    keys = {}
    try:
        mesh.shape_key_add(name="Basis")
    except Exception:  # noqa: BLE001
        return keys
    for name, deltas in (
        ("browKnit", _expr_key_brow_knit),
        ("cheekRaise", _expr_key_cheek_raise),
        ("mouthCorner", _expr_key_mouth_corner),
        ("jawOpen", _expr_key_jaw_open),
    ):
        kb = mesh.shape_key_add(name=name, from_mix=False)
        base = mesh.data.vertices
        for i, v in enumerate(base):
            x, y, z = v.co.x / r, v.co.y / r, v.co.z / r  # unit-sphere space
            dx, dy, dz = deltas(x, y, z)
            kb.data[i].co = (v.co.x + dx * r, v.co.y + dy * r, v.co.z + dz * r)
        kb.value = 0.0
        if name == "mouthCorner":
            kb.slider_min = -1.0
            kb.slider_max = 1.0
        keys[name] = kb
    return keys


def _expr_key_brow_knit(x, y, z):
    """The knit: the brow band drops and pulls in (a scowl's bone
    move - the brow OBJECTS frown too, the mesh follows the skin)."""
    if not (0.30 < z < 0.62) or y >= -0.40:
        return 0.0, 0.0, 0.0
    band = 1.0 - abs((z - 0.47) / 0.16)
    depth = max(0.0, min(1.0, (-y - 0.40) / 0.60))
    fall = max(0.0, band) * depth
    return 0.0, 0.020 * fall, -0.030 * fall


def _expr_key_cheek_raise(x, y, z):
    """The cheek raise: the mid-face sides lift and widen (the smile
    and the squint both live here)."""
    if not (-0.15 < z < 0.32) or y >= 0.05:
        return 0.0, 0.0, 0.0
    ax = abs(x)
    if not (0.30 < ax < 0.90):
        return 0.0, 0.0, 0.0
    radial = max(0.0, 1.0 - abs((z - 0.06) / 0.24))
    side = max(0.0, 1.0 - abs((ax - 0.60) / 0.30))
    fall = radial * side
    return (1.0 if x > 0 else -1.0) * 0.010 * fall, 0.0, 0.032 * fall


def _expr_key_mouth_corner(x, y, z):
    """The mouth corner pull (signed key): the corners lift for a
    positive value and drop for a negative one - one shape carries
    both the smile and the frown."""
    if not (-0.78 < z < -0.42) or y >= -0.72:
        return 0.0, 0.0, 0.0
    ax = abs(x)
    if ax >= 0.55:
        return 0.0, 0.0, 0.0
    corner = max(0.0, min(1.0, (ax - 0.10) / 0.35))
    height = max(0.0, 1.0 - abs((z + 0.60) / 0.18))
    fall = corner * height
    return (1.0 if x > 0 else -1.0) * 0.007 * fall, 0.0, 0.045 * fall


def _expr_key_jaw_open(x, y, z):
    """The jaw drop: the whole lower face sinks (surprise, effort
    shouts - the mouth OBJECT opens wider above it)."""
    if z >= -0.45 or y >= -0.20:
        return 0.0, 0.0, 0.0
    fall = max(0.0, min(1.0, (-z - 0.45) / 0.50))
    return 0.0, 0.0, -0.055 * fall


def sculpt_speech_keys(mesh):
    """THE MOUTH SPEAKS IN THE MESH (iteration 92): sculpt the three
    speech shape keys onto the carved head mesh (mesh-local unit-sphere
    space, the same law family the expression keys ride): mouthWide
    (the "ee" spread - the corners pull out and the lips thin),
    mouthRound (the "oo" purse - the lips push forward and the corners
    draw in), lipPress (the bilabial closure - both masses squeeze
    toward the lip line). The basis keeps the sculpt's own positions,
    so the faceHash and the vertex count stay exactly what iteration
    82/90 proved them. Deterministic: the same sculpt always lands the
    same keys. Returns {name: KeyBlock}."""
    r = 0.115
    keys = {}
    try:
        if mesh.data.shape_keys is None:
            mesh.shape_key_add(name="Basis")
        for name in SPEECH_MESH_SHAPES:
            kb = mesh.shape_key_add(name=name, from_mix=False)
            base = mesh.data.vertices
            for i, v in enumerate(base):
                x, y, z = v.co.x / r, v.co.y / r, v.co.z / r  # unit-sphere space
                dx, dy, dz = _speech_key_deltas(name, x, y, z)
                kb.data[i].co = (v.co.x + dx * r, v.co.y + dy * r, v.co.z + dz * r)
            kb.value = 0.0
            keys[name] = kb
    except Exception:  # noqa: BLE001
        return keys
    return keys


def _mouth_fall(x, y, z):
    """The mouth region's falloff: the lip masses' box (front band,
    around the lip line z = -0.385, within the corner reach) - the
    same geometry the carve's lip planes and the corner key live in."""
    if y >= -0.80 or not (-0.55 < z < -0.28):
        return 0.0
    ax = abs(x)
    if ax >= 0.35:
        return 0.0
    front = max(0.0, min(1.0, (-y - 0.80) / 0.15))
    height = max(0.0, 1.0 - abs((z + 0.40) / 0.14))
    return front * height


def _speech_key_deltas(name, x, y, z):
    """The three speech keys' unit-sphere deltas (bounded, in family
    with the carve planes' 0.004-0.012 amplitudes)."""
    fall = _mouth_fall(x, y, z)
    if fall <= 0.0:
        return 0.0, 0.0, 0.0
    ax = abs(x)
    if name == "mouthWide":
        # the spread: the corners pull outward, the lips thin rearward
        corner = max(0.0, min(1.0, (ax - 0.06) / 0.24))
        return (1.0 if x > 0 else -1.0) * 0.011 * fall * corner, 0.002 * fall, 0.0
    if name == "mouthRound":
        # the purse: the lips push forward, the corners draw inward
        corner = max(0.0, min(1.0, (ax - 0.06) / 0.24))
        return -(1.0 if x > 0 else -1.0) * 0.006 * fall * corner, -0.011 * fall, 0.0
    if name == "lipPress":
        # the press: both masses squeeze toward the lip line (z -0.385)
        toward = -1.0 if (z - -0.385) > 0 else 1.0
        return 0.0, -0.003 * fall, toward * 0.009 * fall
    return 0.0, 0.0, 0.0


def sculpt_head_mesh(scn, bpy, head, skin_mat, prof, height_f, depth=4):
    """THE FACE IS SCULPTED, NOT ASSEMBLED (iteration 82) and THE HEAD
    IS CARVED AT DEPTH (iteration 90, Layer A): the head is a real
    sculpted mesh - an icosphere whose vertices are displaced by
    deterministic bounded laws. The DEPTH answers the framing (the
    groom's LOD law, head edition):
      depth 6 - the HERO CARVE (subdivisions 6, ~41k verts): the base
                eight laws PLUS the fifteen anatomical planes (nose
                bridge/tip/wings, philtrum, the lip masses with the
                cupid's bow, the lip line, the eyelid plates, tear
                ducts, nasolabial creases, temple hollows, the
                jawline edge, the chin ball);
      depth 5 - the REDUCED CARVE (subdivisions 5, ~10k verts), the
                same planes;
      depth 4 - the LIGHT HEAD (subdivisions 4, 642 verts): the base
                eight laws only - the resolution the v3.x contract
                rode since iteration 82, unchanged (a face nobody can
                resolve at wide is wasted frames).
    Mesh only: the head EMPTY stays where the v3.x rig contract
    expects it and the face features (eyes, brows, mouth) keep their
    anchors, so the face rig, lip-sync and the framing math work
    unchanged. Every level carries the SPHERICAL UV LAW (deterministic
    per-vertex parameterization) - the layout the bake writes through
    and the wear path samples through, identical across depths.
    Deterministic: the same profile + depth always lands the same
    mesh (the same vertex count, the same positions - the smoke test
    hashes them)."""
    r = 0.115
    deep = depth >= 5
    mesh = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=int(depth), radius=r, location=(0, 0, 0))
    mesh.name = "HeadMesh"
    mesh.data.materials.append(skin_mat)
    smooth(mesh)
    f = prof["factors"]
    jt = f["jawTaper"]; cf = f["chinFwd"]; bf = f["browFwd"]
    co = f["cheekOut"]; nl = f["noseLen"]
    for v in mesh.data.vertices:
        x, y, z = v.co.x / r, v.co.y / r, v.co.z / r  # unit-sphere space
        nx, ny, nz = x, y, z
        # 1. jaw taper: below the cheek line the face narrows to the chin
        if z < 0.1:
            t = max(0.0, min(1.0, (0.1 - z) / 0.9))
            taper = 1.0 - (1.0 - jt) * (t ** 1.35)
            nx = x * taper
        # 2. chin: the lowest front band pushes forward and settles down
        if z < -0.55 and y < 0.2:
            t = max(0.0, min(1.0, (-0.55 - z) / 0.45))
            ny = y - cf * t * t
            nz = z - 0.012 * t
        # 3. brow ridge: a band above the eyes pushes forward
        if 0.34 < z < 0.60 and y < -0.55:
            band = 1.0 - abs((z - 0.47) / 0.13)
            if band > 0.0:
                ny = ny - bf * band
        # 4. eye sockets: a subtle inset under the brow band
        if 0.15 < z < 0.40 and y < -0.8 and 0.25 < abs(x) < 0.62:
            ny = ny + 0.010
        # 5. cheekbones: outward at the mid-face sides
        if -0.25 < z < 0.30 and y < 0.0 and abs(nx) > 0.45:
            t = max(0.0, min(1.0, (abs(nx) - 0.45) / 0.55))
            fall = max(0.0, 1.0 - abs(z - 0.02) / 0.6)
            nx = nx * (1.0 + co * t * fall)
        # 6. nose: the front-centre wedge, bridge to tip
        if y < -0.86 and abs(x) < 0.30 and -0.30 < z < 0.22:
            fall = (1.0 - abs(x) / 0.30) * max(0.0, 1.0 - abs((z + 0.02) / 0.30))
            if fall > 0.0:
                ny = ny - (0.028 + 0.02 * nl) * fall
        # 7. occiput: the back of the skull gains its dome
        if y > 0.35:
            ny = ny * 1.055
        # 8. ears: side bumps at ear height
        if abs(x) > 0.82 and -0.12 < z < 0.26 and -0.15 < y < 0.35:
            nx = nx * 1.10
        if deep:
            # ── the hero planes (iteration 90): each a bounded
            #    kernel over the same unit-sphere space, the front
            #    the -Y face, every delta 0.5-2.5mm in world units ──
            ax = abs(x)
            # 9. nose bridge: the sharp crest the wedge only hinted
            if y < -0.80 and ax < 0.13 and 0.00 < z < 0.26:
                fall = (1.0 - ax / 0.13) * max(0.0, 1.0 - abs((z - 0.13) / 0.13))
                if fall > 0.0:
                    ny = ny - 0.015 * fall
            # 10. nose tip: the focused ball the wedge spread too wide
            if y < -0.90 and ax < 0.10 and -0.12 < z < 0.02:
                fall = (1.0 - ax / 0.10) * max(0.0, 1.0 - abs((z + 0.05) / 0.07))
                if fall > 0.0:
                    ny = ny - 0.018 * fall
            # 11. nostril wings: the flare beside the tip
            if y < -0.82 and 0.08 < ax < 0.22 and -0.14 < z < 0.02:
                fall = min(1.0, (ax - 0.08) / 0.06) * max(0.0, 1.0 - abs((z + 0.06) / 0.08))
                if fall > 0.0:
                    nx = nx + (1.0 if x >= 0 else -1.0) * 0.010 * fall
                    ny = ny - 0.004 * fall
            # 12. philtrum: the groove between nose and lip
            if y < -0.85 and ax < 0.05 and -0.30 < z < -0.20:
                fall = (1.0 - ax / 0.05) * max(0.0, 1.0 - abs((z + 0.25) / 0.05))
                if fall > 0.0:
                    ny = ny + 0.006 * fall
            # 13. upper lip: the forward mass
            if y < -0.85 and ax < 0.20 and -0.38 < z < -0.30:
                fall = (1.0 - ax / 0.20) * max(0.0, 1.0 - abs((z + 0.34) / 0.04))
                if fall > 0.0:
                    ny = ny - 0.010 * fall
            # 14. cupid's bow: the two peaks and the center dip
            if y < -0.87 and ax < 0.09 and -0.36 < z < -0.31:
                peak = max(0.0, 1.0 - abs((ax - 0.055) / 0.035))
                if peak > 0.0:
                    ny = ny - 0.005 * peak
                if ax < 0.02:
                    ny = ny + 0.004 * (1.0 - ax / 0.02)
            # 15. lower lip: the fuller mass
            if y < -0.85 and ax < 0.17 and -0.48 < z < -0.40:
                fall = (1.0 - ax / 0.17) * max(0.0, 1.0 - abs((z + 0.44) / 0.04))
                if fall > 0.0:
                    ny = ny - 0.012 * fall
            # 16. lip line: the crease between the masses
            if y < -0.85 and ax < 0.18 and -0.40 < z < -0.37:
                fall = (1.0 - ax / 0.18) * max(0.0, 1.0 - abs((z + 0.385) / 0.015))
                if fall > 0.0:
                    ny = ny + 0.005 * fall
            # 17. upper eyelids: the lid folds forward over the socket
            if y < -0.80 and 0.20 < ax < 0.55 and 0.24 < z < 0.36:
                fall = min(1.0, (ax - 0.20) / 0.08) * max(0.0, 1.0 - abs((z - 0.30) / 0.06))
                if fall > 0.0:
                    ny = ny - 0.008 * fall
            # 18. lower lids: the subtle under-eye band
            if y < -0.82 and 0.20 < ax < 0.55 and 0.10 < z < 0.18:
                fall = min(1.0, (ax - 0.20) / 0.08) * max(0.0, 1.0 - abs((z - 0.14) / 0.04))
                if fall > 0.0:
                    ny = ny - 0.004 * fall
            # 19. tear ducts: the inner-corner hollows
            if y < -0.85 and 0.12 < ax < 0.20 and 0.16 < z < 0.24:
                fall = max(0.0, 1.0 - abs((ax - 0.16) / 0.04)) * max(0.0, 1.0 - abs((z - 0.20) / 0.04))
                if fall > 0.0:
                    ny = ny + 0.005 * fall
            # 20. nasolabial creases: the wing-to-corner diagonal
            if y < -0.80 and -0.36 < z < -0.08:
                cxt = max(0.0, min(1.0, (-0.08 - z) / 0.28))  # 0 at wing, 1 at corner
                line_x = 0.20 + 0.07 * cxt
                line_z = -0.10 - 0.24 * cxt
                d = math.hypot(ax - line_x, (z - line_z) * 0.5)
                fall = max(0.0, 1.0 - d / 0.05)
                if fall > 0.0:
                    ny = ny + 0.006 * fall
            # 21. temple hollows: the inset above the cheekbones
            if y < 0.2 and 0.55 < ax < 0.85 and 0.28 < z < 0.52:
                fall = min(1.0, (ax - 0.55) / 0.10) * max(0.0, 1.0 - abs((z - 0.40) / 0.12))
                if fall > 0.0:
                    nx = nx * (1.0 - 0.012 * fall)
            # 22. jawline edge: the crisp band the taper only smoothed
            if -0.55 < z < -0.38 and ax > 0.25:
                fall = max(0.0, 1.0 - abs((z + 0.46) / 0.09)) * min(1.0, (ax - 0.25) / 0.15)
                if fall > 0.0:
                    nx = nx * (1.0 - 0.020 * fall)
            # 23. chin ball: the focused projection below the band
            if y < 0.1 and ax < 0.16 and -0.78 < z < -0.60:
                fall = (1.0 - ax / 0.16) * max(0.0, 1.0 - abs((z + 0.69) / 0.09))
                if fall > 0.0:
                    ny = ny - 0.010 * fall
        v.co.x = nx * r
        v.co.y = ny * r
        v.co.z = nz * r
    # ── THE SPHERICAL UV LAW (iteration 90): the deterministic
    #    per-vertex parameterization every depth shares - the layout
    #    the hero bake writes through and the wear path samples
    #    through (the seam hides behind the hair; the margin holds it)
    uv = mesh.data.uv_layers.get("HeadCarveUV")
    if uv is None:
        uv = mesh.data.uv_layers.new(name="HeadCarveUV")
    flat = []
    verts = mesh.data.vertices
    for lp in mesh.data.loops:
        co = verts[lp.vertex_index].co
        nrm = math.sqrt(co.x * co.x + co.y * co.y + co.z * co.z) or 1.0
        flat.append(math.atan2(co.y, co.x) / math.tau + 0.5)
        flat.append((co.z / nrm) * 0.5 + 0.5)
    uv.data.foreach_set("uv", flat)
    mesh.parent = head
    mesh.location = (0.0, 0.0, 0.12)
    mesh.scale = (0.92, 0.98, 1.05 * height_f)
    return mesh


def loft_strand(scn, bpy, name, mat, rings, tip_last=True):
    """SCULPTED HAIR (iteration 82): a real strand/volume mesh built
    ring by ring along a spine - radius per ring, the last ring
    collapsed to a point (a tapered tip reads as hair; a sphere reads
    as a ball). Deterministic per ring list; the base is capped with a
    fan. rings: dicts with c=(x,y,z), r=radius, optional sx/sy squashes."""
    SEG = 10
    verts, faces = [], []
    n = len(rings)
    if n < 2:
        return None
    for ri, ring in enumerate(rings):
        cx, cy, cz = ring["c"]
        rad = ring["r"]
        sx = ring.get("sx", 1.0)
        sy = ring.get("sy", 1.0)
        if tip_last and ri == n - 1:
            verts.append((cx, cy, cz))
            continue
        for si in range(SEG):
            a = si * (math.tau / SEG)
            verts.append((cx + math.cos(a) * rad * sx, cy + math.sin(a) * rad * sy, cz))
    for ri in range(n - 1):
        a0 = ri * SEG
        b0 = (ri + 1) * SEG
        if tip_last and ri + 1 == n - 1:
            tip = b0
            for si in range(SEG):
                faces.append((a0 + si, a0 + (si + 1) % SEG, tip))
            break
        for si in range(SEG):
            faces.append((a0 + si, a0 + (si + 1) % SEG, b0 + (si + 1) % SEG, b0 + si))
    base_center = len(verts)
    c0 = rings[0]["c"]
    verts.append((c0[0], c0[1], c0[2]))
    for si in range(SEG):
        faces.append((base_center, (si + 1) % SEG, si))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    scn.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def _rings(spine, hair_f):
    """Scale a spine spec [(x, y, z, r, sx, sy), ...] by the hair mass
    factor: radii ride hair_f, the drop below the skull rides it too."""
    out = []
    for i, (x, y, z, rad, sx, sy) in enumerate(spine):
        if i > 0 and z < 0.05:
            z = 0.05 + (z - 0.05) * hair_f
        out.append({"c": (x, y, z), "r": rad * hair_f, "sx": sx, "sy": sy})
    return out


def sculpt_hair(scn, bpy, head, hair_mat, style, hair_f, height_f):
    """SCULPTED HAIR (iteration 82): the sphere hair masses become
    lofted strands and volumes per style - a cap that hugs the skull,
    a fringe wedge, and style pieces with tapered tips (topknot bun +
    tail, ponytail sweep + flowing tail, interlocked braid lobes, long
    curtain + side locks). All masses ride the silhouette's hair
    factor and the crown rides height_f, exactly as the sphere masses
    did. Returns the evidence (part names, total verts)."""
    parts = []
    verts = 0
    dome_top = 0.235 * height_f

    def add(obj):
        nonlocal verts
        if obj is None:
            return
        obj.parent = head
        obj.location = (0.0, 0.0, 0.0)
        parts.append(obj.name)
        verts += len(obj.data.vertices)

    # the cap every style shares: a dome hugging the skull (a bigger
    # sphere swallowed the face - the loft hugs instead)
    cap = loft_strand(scn, bpy, "HairCap", hair_mat, _rings([
        (0.0, 0.005, 0.02, 0.108, 1.0, 0.96),
        (0.0, 0.005, 0.10, 0.116, 1.0, 0.98),
        (0.0, 0.005, dome_top * 0.72, 0.112, 1.0, 0.98),
        (0.0, 0.005, dome_top * 0.94, 0.082, 1.0, 1.0),
        (0.0, 0.005, dome_top, 0.03, 1.0, 1.0),
    ], hair_f))
    add(cap)
    # the fringe: a THIN wedge over the forehead (a deep fringe hangs
    # onto the eyes and reads as a permanent scowl)
    fringe = loft_strand(scn, bpy, "HairFringe", hair_mat, [
        {"c": (0.0, -0.082, 0.208 * height_f), "r": 0.055, "sx": 1.45, "sy": 0.9},
        {"c": (0.0, -0.098, 0.175 * height_f), "r": 0.032, "sx": 1.4, "sy": 0.85},
        {"c": (0.0, -0.102, 0.148 * height_f), "r": 0.0},
    ])
    add(fringe)

    if style == "topknot":
        knot = loft_strand(scn, bpy, "HairKnot", hair_mat, [
            {"c": (0.0, 0.01, dome_top * 0.98), "r": 0.024, "sx": 1.0, "sy": 1.0},
            {"c": (0.0, 0.01, dome_top + 0.045 * height_f), "r": 0.034, "sx": 1.0, "sy": 1.0},
            {"c": (0.0, 0.01, dome_top + 0.07 * height_f), "r": 0.02, "sx": 1.0, "sy": 1.0},
            {"c": (0.0, 0.01, dome_top + 0.085 * height_f), "r": 0.0},
        ])
        add(knot)
        tail = loft_strand(scn, bpy, "HairBack", hair_mat, _rings([
            (0.0, 0.045, 0.24, 0.02, 1.0, 1.0),
            (0.0, 0.07, 0.14, 0.019, 1.0, 1.0),
            (0.0, 0.075, 0.02, 0.014, 1.0, 1.0),
            (0.0, 0.07, -0.1, 0.0, 1.0, 1.0),
        ], hair_f))
        add(tail)
    elif style == "ponytail":
        sweep = loft_strand(scn, bpy, "HairSweep", hair_mat, [
            {"c": (0.0, -0.07, 0.19 * height_f), "r": 0.07, "sx": 1.05, "sy": 0.9},
            {"c": (0.0, 0.0, dome_top * 0.92), "r": 0.098, "sx": 1.0, "sy": 0.96},
            {"c": (0.0, 0.058, 0.17 * height_f), "r": 0.082, "sx": 1.0, "sy": 0.94},
            {"c": (0.0, 0.072, 0.03), "r": 0.052, "sx": 1.0, "sy": 0.9},
            {"c": (0.0, 0.07, 0.0), "r": 0.0},
        ])
        add(sweep)
        tail = loft_strand(scn, bpy, "HairTail", hair_mat, _rings([
            (0.0, 0.09, 0.0, 0.032, 1.0, 1.0),
            (0.02 * hair_f, 0.105, -0.14, 0.026, 1.0, 1.0),
            (-0.015 * hair_f, 0.1, -0.28, 0.02, 1.0, 1.0),
            (0.01 * hair_f, 0.085, -0.4, 0.014, 1.0, 1.0),
            (0.0, 0.07, -0.5, 0.0, 1.0, 1.0),
        ], hair_f))
        add(tail)
    elif style == "braid":
        for i in range(6):
            side = 1.0 if i % 2 == 0 else -1.0
            z0 = 0.1 - i * 0.072
            lobe = loft_strand(scn, bpy, f"HairBraid{i}", hair_mat, _rings([
                (side * 0.02, 0.075, z0, 0.017, 1.0, 1.0),
                (side * 0.016, 0.075, z0 - 0.05, 0.013, 1.0, 1.0),
                (side * 0.012, 0.075, z0 - 0.085, 0.0, 1.0, 1.0),
            ], hair_f))
            add(lobe)
        tie = loft_strand(scn, bpy, "HairBack", hair_mat, _rings([
            (0.0, 0.075, -0.3, 0.02, 1.0, 0.55),
            (0.0, 0.072, -0.38, 0.0, 1.0, 1.0),
        ], hair_f))
        add(tie)
    elif style == "long":
        curtain = loft_strand(scn, bpy, "HairBack", hair_mat, _rings([
            (0.0, 0.055, 0.2, 0.09, 1.3, 0.95),
            (0.0, 0.07, 0.0, 0.098, 1.35, 0.98),
            (0.0, 0.075, -0.2, 0.088, 1.3, 1.0),
            (0.0, 0.07, -0.4, 0.058, 1.2, 1.0),
            (0.0, 0.065, -0.56, 0.0, 1.0, 1.0),
        ], hair_f))
        add(curtain)
        for side, sname in ((1.0, "HairLockL"), (-1.0, "HairLockR")):
            lock = loft_strand(scn, bpy, sname, hair_mat, _rings([
                (side * 0.08, -0.05, 0.16, 0.03, 1.0, 1.0),
                (side * 0.085, -0.045, -0.05, 0.026, 1.0, 1.0),
                (side * 0.08, -0.04, -0.24, 0.02, 1.0, 1.0),
                (side * 0.075, -0.03, -0.4, 0.0, 1.0, 1.0),
            ], hair_f))
            add(lock)
    else:  # short
        nape = loft_strand(scn, bpy, "HairBack", hair_mat, _rings([
            (0.0, 0.06, 0.02, 0.05, 1.05, 0.95),
            (0.0, 0.07, -0.06, 0.035, 1.0, 0.9),
            (0.0, 0.075, -0.12, 0.0, 1.0, 1.0),
        ], hair_f))
        add(nape)
    return {"parts": parts, "verts": verts}


# ── THE HAIR IS GROOMED (iteration 85, Layer A deeper): the measured
#    cast gap survived the palette AND the silhouette AND the sculpt
#    AND the grade AND the performance because the HAIR still read as
#    solid helmet masses - lofted volumes with tapered tips, but no
#    strand DETAIL and no sheet-directed DIRECTION. The groom profile
#    (mirrored from src/lib/blender/groom.ts - one law, two runtimes)
#    compiles the sheet read's own silhouette sentence into a bounded
#    direction (sweep / flow / flyaway / taper; the style prior sets
#    the base), and the worker grows guide-fitted THIN STRANDS along
#    per-style guide spines - seeded law (fnv1a + mulberry32, the
#    same DNA always grooms the same hair) - with the LOD law owning
#    the detail: close framings carry the full pass, wide framings
#    keep the volumes (strands nobody can see are wasted frames). ──

GROOM_BOUNDS = {
    "sweep": (-1.0, 1.0), "flow": (0.0, 1.0), "flyaway": (0.0, 1.0), "taper": (0.5, 1.0),
}

GROOM_STYLE_PRIORS = {
    "topknot": {"sweep": 0.45, "flow": 0.15, "flyaway": 0.15, "taper": 0.85},
    "ponytail": {"sweep": 0.55, "flow": 0.3, "flyaway": 0.25, "taper": 0.85},
    "braid": {"sweep": 0.35, "flow": 0.1, "flyaway": 0.1, "taper": 0.85},
    "long": {"sweep": 0.1, "flow": 0.55, "flyaway": 0.35, "taper": 0.85},
    "short": {"sweep": 0.2, "flow": 0.1, "flyaway": 0.2, "taper": 0.85},
}

GROOM_STRAND_BASE = 7    # thin strands per groomed guide, before the LOD factor
GROOM_FLYAWAY_BASE = 5   # loose strands, riding the flyaway factor + the LOD

GROOM_CLOSE_FRAMINGS = ("CLOSEUP", "EXTREME_CLOSEUP", "MCU")
GROOM_WIDE_FRAMINGS = ("WS", "WIDE", "ESTABLISHING", "OTS")

# ── iteration 89 THE HAIR SHADES LIKE HAIR (the deeper groom): the
#    sheet's own hairColor hex derives a bounded hair-shade profile -
#    the MELANIN concentration (the hex's luminance: dark dye = high),
#    the PHEOMELANIN redness (the red surplus over the cool channels)
#    and the roughness pair (dark hair glosses, pale hair dulls). The
#    TRUE CURVE strands shade with the Principled Hair BSDF from this
#    profile - the film-standard representation the hair BSDF was
#    built for; the mesh cards keep the graded surface shader. One
#    law, two runtimes: the worker re-clamps the same bounds. ──
HAIR_SHADE_BOUNDS = {"melanin": (0.0, 1.0), "redness": (0.0, 1.0), "radial": (0.1, 0.7), "longitudinal": (0.1, 0.7)}
HAIR_SHADE_BASE = {"melanin": 0.65, "redness": 0.12, "radial": 0.34, "longitudinal": 0.44}
GROOM_CURVE_BASE = 24   # true curve strands per groomed guide at the full LOD
GROOM_CURVE_MIN_LOD = 0.55   # wide framings keep the mesh cards only

# ── iteration 94 THE STRANDS GO HERO (the deeper groom's hero-strand
#    half): the true-curve strands' own DETAIL rides the strand LOD.
#    Iteration 89 grew every curve at one detail - six points, a
#    uniform bevel - and the closeup read the difference. Three
#    tiers: the close framings grow the HERO strands (twelve-point
#    splines, the root-to-tip radius taper the groom's own taper
#    factor drives, the HERO FLYAWAY curves riding the flyaway
#    factor); the middle framings keep the STANDARD curve (the
#    iteration-89 law, unchanged - the reduced level honest); the
#    wide framings keep the mesh cards only. One law, two runtimes:
#    the tier, the taper law and the hash mirror groom.ts
#    bit-exactly. ──
GROOM_HERO_PTS = 12          # spline points per hero strand (the closeup lens reads the wave)
GROOM_STD_PTS = 6            # the standard curve (iteration 89's law) stays the reduced level
GROOM_HERO_BEVEL_RES = 3     # the hero bevel (the standard keeps 2)
GROOM_HERO_FLYAWAY_BASE = 6  # hero flyaway curves, riding the flyaway factor
GROOM_HERO_TIP_LO = 0.25     # a fine taper (0.5) dies to a quarter radius
GROOM_HERO_TIP_SPAN = 0.55   # ...a blunt one (1.0) keeps 0.8


def _clamp3(v, lo, hi):
    return round(max(lo, min(hi, float(v))), 3)


def hair_shade(dna):
    """Derive + clamp the hair shade from the wire's hairColor (one
    law, two runtimes): a wire-carried profile re-clamps against the
    same bounds hair-shade.ts clamps against; a missing/invalid hex
    falls back to the derivation from the DNA's own hex; no hex at
    all keeps the neutral mid-brown dye honestly."""
    raw = dna.get("hairShade") if isinstance(dna, dict) else None
    if isinstance(raw, dict):
        factors = {}
        for key, (lo, hi) in HAIR_SHADE_BOUNDS.items():
            v = raw.get(key)
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(float(v)):
                factors[key] = HAIR_SHADE_BASE[key]
            else:
                factors[key] = _clamp3(v, lo, hi)
        fields = [str(f) for f in raw.get("fields") or [] if isinstance(f, str)]
    else:
        factors = dict(HAIR_SHADE_BASE)
        fields = []
        hex_txt = str(dna.get("hairColor") or "") if isinstance(dna, dict) else ""
        m = re.match(r"^#?([0-9a-fA-F]{6})$", hex_txt.strip())
        if m:
            n = int(m.group(1), 16)
            r, g, b = ((n >> 16) & 255) / 255.0, ((n >> 8) & 255) / 255.0, (n & 255) / 255.0
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            factors["melanin"] = _clamp3(1.0 - lum * 1.15, *HAIR_SHADE_BOUNDS["melanin"])
            factors["redness"] = _clamp3(max(0.0, (r - (g + b) / 2.0) / 0.5), *HAIR_SHADE_BOUNDS["redness"])
            factors["radial"] = _clamp3(0.5 - 0.24 * factors["melanin"] + 0.08 * factors["redness"], *HAIR_SHADE_BOUNDS["radial"])
            factors["longitudinal"] = _clamp3(0.52 - 0.18 * factors["melanin"] + 0.06 * factors["redness"], *HAIR_SHADE_BOUNDS["longitudinal"])
            if factors["melanin"] > 0.72:
                fields.append("dark dye")
            elif factors["melanin"] < 0.3:
                fields.append("pale dye")
            if factors["redness"] > 0.25:
                fields.append("warm red")
    shade = dict(factors)
    shade["fields"] = fields
    shade["hash"] = hair_shade_hash(shade)
    return shade


def hair_shade_hash(s):
    """The DETERMINISTIC hair-shade hash - mirrors hairShadeHash in
    hair-shade.ts bit-exactly (sha256-16)."""
    key = "89|{:.3f}|{:.3f}|{:.3f}|{:.3f}|v1".format(s["melanin"], s["redness"], s["radial"], s["longitudinal"])
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def hair_shade_line(s):
    """The shade as one ledger line (mirrors hairShadeLine)."""
    from_txt = f"named by the hex: {', '.join(s['fields'])}" if s["fields"] else "the hex's own read"
    return (f"hair shade: melanin {s['melanin']:.2f}, redness {s['redness']:.2f}, "
            f"radial {s['radial']:.2f}, longitudinal {s['longitudinal']:.2f} ({from_txt})")


# ── iteration 91 THE SKIN IS ALIVE (the Layer A remainder): the
#    sheet's own skinTone hex derives a bounded skin-depth profile -
#    the SUBSURFACE weight + the scatter scale (the hex's luminance:
#    pale skin bleeds visibly, deep skin stays tight), the radius
#    triplet's reach (the red surplus warms it - red scatters
#    furthest, the hemoglobin law) and the COAT pair (the saturation:
#    a vivid stylized dye glosses, a washed one mattes). The graded
#    skin tree carries it - subsurface beneath, the carve's baked
#    normal above. The depth answers the BODY, not the framing: every
#    shot of a face carries the same depth. One law, two runtimes. ──
SKIN_DEPTH_BOUNDS = {"weight": (0.1, 0.55), "radius": (0.55, 1.25), "scale": (0.3, 0.7), "coat": (0.04, 0.22), "coatRough": (0.22, 0.6)}
SKIN_DEPTH_BASE = {"weight": 0.38, "radius": 1.0, "scale": 0.5, "coat": 0.1, "coatRough": 0.38}


def skin_depth(dna):
    """Derive + clamp the skin depth from the wire's skinTone (one
    law, two runtimes): a wire-carried profile re-clamps against the
    same bounds skin-depth.ts clamps against; a missing/invalid one
    derives from the DNA's own hex; no hex at all keeps the neutral
    mid-dye depth honestly."""
    raw = dna.get("skinDepth") if isinstance(dna, dict) else None
    if isinstance(raw, dict):
        factors = {}
        for key, (lo, hi) in SKIN_DEPTH_BOUNDS.items():
            v = raw.get(key)
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(float(v)):
                factors[key] = SKIN_DEPTH_BASE[key]
            else:
                factors[key] = _clamp3(v, lo, hi)
        fields = [str(f) for f in raw.get("fields") or [] if isinstance(f, str)]
    else:
        factors = dict(SKIN_DEPTH_BASE)
        fields = []
        hex_txt = str(dna.get("skinTone") or "") if isinstance(dna, dict) else ""
        m = re.match(r"^#?([0-9a-fA-F]{6})$", hex_txt.strip())
        if m:
            n = int(m.group(1), 16)
            r, g, b = ((n >> 16) & 255) / 255.0, ((n >> 8) & 255) / 255.0, (n & 255) / 255.0
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            mx, mn = max(r, g, b), min(r, g, b)
            sat = (mx - mn) / mx if mx > 0 else 0.0
            red_bias = max(0.0, (r - (g + b) / 2.0) / 0.5)
            factors["weight"] = _clamp3(0.16 + (lum - 0.35) * 0.5, *SKIN_DEPTH_BOUNDS["weight"])
            factors["radius"] = _clamp3(0.62 + (lum - 0.5) * 0.55 + red_bias * 0.3, *SKIN_DEPTH_BOUNDS["radius"])
            factors["scale"] = _clamp3(0.32 + (lum - 0.5) * 0.42, *SKIN_DEPTH_BOUNDS["scale"])
            factors["coat"] = _clamp3(0.04 + sat * 0.16, *SKIN_DEPTH_BOUNDS["coat"])
            factors["coatRough"] = _clamp3(0.55 - sat * 0.28, *SKIN_DEPTH_BOUNDS["coatRough"])
            if factors["weight"] >= 0.42:
                fields.append("pale bleed")
            if factors["weight"] <= 0.24:
                fields.append("tight bleed")
            if red_bias >= 0.2:
                fields.append("warm radius")
            if factors["coat"] >= 0.17:
                fields.append("porcelain coat")
    depth = dict(factors)
    depth["fields"] = fields
    depth["hash"] = skin_depth_hash(depth)
    return depth


def skin_depth_hash(s):
    """The DETERMINISTIC skin-depth hash - mirrors skinDepthHash in
    skin-depth.ts bit-exactly (sha256-16)."""
    key = "91|{:.3f}|{:.3f}|{:.3f}|{:.3f}|{:.3f}|v1".format(s["weight"], s["radius"], s["scale"], s["coat"], s["coatRough"])
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def skin_depth_line(s):
    """The depth as one ledger line (mirrors skinDepthLine)."""
    from_txt = f"named by the hex: {', '.join(s['fields'])}" if s["fields"] else "the hex's own read"
    return (f"skin depth: sss {s['weight']:.2f}, radius {s['radius']:.2f}, scale {s['scale']:.2f}, "
            f"coat {s['coat']:.2f} @ {s['coatRough']:.2f} ({from_txt})")


def skin_depth_evidence(sd):
    """The state's skin-depth evidence: the clamped factors, the fields
    the hex owns, and the deterministic hash (the same hex lands the
    same depth, hash-proven)."""
    prof = {k: sd[k] for k in SKIN_DEPTH_BOUNDS}
    return {"profile": prof, "fields": sd["fields"], "hash": sd["hash"]}


# ── THE CHARACTER IS ONE ASSET (AnimeOS 5.0, iteration 95): the
#    manifest law's DETERMINISTIC MASTER HASH - mirrors
#    characterAssetHash in character-asset.ts bit-exactly (sha256-16
#    over the canonical WIRE TRUTH, versioned 95). The per-shot
#    resolutions (the tiers, the worn keys, the counts) are NEVER
#    inside the key: the same wire DNA lands the same master hash at
#    every framing - the lens resolves the asset, it never rewrites
#    it. ──

def _ka_st(v):
    s = "" if v is None else str(v).strip()
    return s if s else "-"


def _ka_hx(v):
    s = "" if v is None else str(v).strip().lower()
    return s if s else "-"


def _ka_f3(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(float(v)):
        return "-"
    return "{:.3f}".format(float(v))


def _ka_fl(v):
    if not isinstance(v, list):
        return "-"
    parts = [str(s).strip() for s in v if isinstance(s, str) and str(s).strip()]
    return "+".join(parts) if parts else "-"


def _ka_profile(prefix, prof, keys):
    if not isinstance(prof, dict):
        return prefix + ":-"
    return prefix + ":" + ",".join(_ka_f3(prof.get(k)) for k in keys)


def character_asset_key(dna):
    """The manifest's canonical key - the wire truth, canonicalized:
    the identity fields, the conformance, and every profile the
    sheet read compiled, absent ones named '-'. Mirrors
    characterAssetKey in character-asset.ts field for field."""
    dna = dna if isinstance(dna, dict) else {}
    cf = dna.get("conformFactor")
    cf = 0.35 if cf is None else cf
    return "|".join([
        "95",
        _ka_st(dna.get("name")),
        _ka_st(dna.get("hairStyle")),
        _ka_hx(dna.get("hairColor")),
        _ka_hx(dna.get("robeColor")),
        _ka_hx(dna.get("robeAccent")),
        _ka_hx(dna.get("skinTone")),
        _ka_st(dna.get("weaponType")),
        _ka_hx(dna.get("bladeColor")),
        _ka_st(dna.get("build")),
        "beard" if dna.get("beard") else "clean",
        _ka_st(dna.get("faceShape")),
        _ka_f3(cf),
        _ka_fl(dna.get("sheetFields")),
        _ka_profile("sh", dna.get("silhouetteShape"), ("height", "shoulders", "torso", "sleeves", "skirt", "hair")),
        _ka_profile("fc", dna.get("faceProfile"), ("jawTaper", "chinFwd", "browFwd", "cheekOut", "noseLen", "eyeScale")),
        _ka_profile("mt", dna.get("materialProfile"), ("skinSss", "skinRough", "skinWarmth", "rim", "clothRamp", "clothSheen", "clothWeave", "hairRough")),
        _ka_profile("hs", dna.get("hairShade"), ("melanin", "redness", "radial", "longitudinal")),
        _ka_profile("sd", dna.get("skinDepth"), ("weight", "radius", "scale", "coat", "coatRough")),
        _ka_profile("gr", dna.get("groomProfile"), ("sweep", "flow", "flyaway", "taper")),
        "v1",
    ])


def character_asset_hash(dna):
    """The DETERMINISTIC master hash - sha256-16 over the canonical
    key. The same wire truth lands the same hash on both runtimes."""
    return hashlib.sha256(character_asset_key(dna).encode("utf-8")).hexdigest()[:16]


CHARACTER_ASSET_SECTIONS = (
    "canonicalIdentity", "baseMesh", "sculptLayers", "maps", "materials",
    "facialRig", "groom", "wardrobe", "lod", "validationProfile",
)


def _set_hair_socket(node, name, value):
    """5.2.2 LAW: the Principled Hair node REJECTS string-key socket
    access (inputs['Melanin'] raises KeyError, .get returns None)
    while iteration + index work - so the sockets resolve BY NAME
    through iteration (the comp-tree's by-type law, hair edition)."""
    for s in node.inputs:
        if s.name == name:
            try:
                s.default_value = value
            except Exception:
                pass
            return True
    return False


def build_hair_shade_material(bpy, name, color_hex, shade):
    """The melanin hair material: a Principled Hair BSDF driven by the
    shade profile (the Chiang model - light tunnels the strand, the
    dye absorbs in the cortex). Sockets resolve by iteration (the
    5.2.2 law above); a missing socket keeps its default."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.new("ShaderNodeBsdfHairPrincipled")
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    _set_hair_socket(bsdf, "Melanin", float(shade["melanin"]))
    _set_hair_socket(bsdf, "Melanin Redness", float(shade["redness"]))
    _set_hair_socket(bsdf, "Radial Roughness", float(shade["radial"]))
    _set_hair_socket(bsdf, "Longitudinal Roughness", float(shade["longitudinal"]))
    hx = str(color_hex or "#1B1B2A")
    mn = re.match(r"^#?([0-9a-fA-F]{6})$", hx.strip())
    n = int(mn.group(1), 16) if mn else 0x1B1B2A
    _set_hair_socket(bsdf, "Color", (((n >> 16) & 255) / 255.0, ((n >> 8) & 255) / 255.0, (n & 255) / 255.0, 1.0))
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    mat["animeosKind"] = "hair-curve"
    mat["hairShadeHash"] = shade["hash"]
    return mat


def groom_strand_tier(strand_f):
    """THE STRANDS GO HERO (mirrors groomStrandTier in groom.ts): the
    close framings grow the HERO strands, the middle framings keep
    the STANDARD curve, the wide framings keep the mesh cards only."""
    if strand_f >= 0.9:
        return "hero"
    if strand_f >= GROOM_CURVE_MIN_LOD:
        return "standard"
    return "cards"


def hero_taper_tip(taper):
    """The root-to-tip taper law (mirrors heroTaperTip in groom.ts):
    the strand dies from a root radius of 1.0 to a tip radius the
    groom's own taper factor drives - a fine taper (0.5) dies to
    0.25, a blunt one (1.0) keeps 0.8."""
    t = max(0.5, min(1.0, float(taper)))
    return round((GROOM_HERO_TIP_LO + GROOM_HERO_TIP_SPAN * ((t - 0.5) / 0.5)) * 1000) / 1000


def groom_curve_hash(f, style, tier):
    """The DETERMINISTIC curve hash (mirrors groomCurveHash in
    groom.ts bit-exactly): sha256-16 over the pipe-format key - the
    same profile at the same tier always lands the same key."""
    key = f"94|{style}|{tier}|{f['sweep']:.3f}|{f['flow']:.3f}|{f['flyaway']:.3f}|{f['taper']:.3f}|v1"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def groom_hair_curves(scn, bpy, head, shade_mat, style, hair_f, height_f, gp, strand_f):
    """THE HAIR IS TRUE CURVES (iteration 89) + THE STRANDS GO HERO
    (iteration 94): grow real BLENDER HAIR CURVES off the style's
    guide spines under the SAME directed direction + seed law the
    mesh strands ride (fnv1a + mulberry32 - the same DNA always
    grooms the same curves), shaded by the melanin hair material.
    The STRAND LOD owns the curve's own detail: the close framings
    grow the HERO strands (twelve-point splines, the root-to-tip
    radius taper the groom's taper factor drives, the hero flyaway
    curves riding the flyaway factor); the middle framings keep the
    STANDARD curve (iteration 89's six-point law, unchanged - the
    reduced level honest); the wide framings keep the mesh cards
    only (curves nobody can see are wasted frames - the iter-85
    law). Deterministic + hash-named. Returns the evidence (None
    when the LOD skipped - honest)."""
    tier = groom_strand_tier(strand_f)
    if tier == "cards":
        return None
    f = gp["factors"]
    hero = tier == "hero"
    n_pts = GROOM_HERO_PTS if hero else GROOM_STD_PTS
    bevel_res = GROOM_HERO_BEVEL_RES if hero else 2
    tip = hero_taper_tip(f["taper"]) if hero else 1.0
    guides = _groom_guides(style, height_f)
    per_guide = max(1, int(round(GROOM_CURVE_BASE * strand_f)))
    mat_name = f"GroomCurveHair_{shade_mat['hairShadeHash']}"
    existing = bpy.data.materials.get(mat_name)
    count = 0
    pts_total = 0
    for gi, guide in enumerate(guides):
        pts = [(x, y, (0.05 + (z - 0.05) * hair_f) if z < 0.05 else z) for (x, y, z) in guide]
        for ci in range(per_guide):
            rng = mulberry32(fnv1a(f"groomcurve|{style}|{gi}|{ci}"))
            lat = (rng() - 0.5) * 0.05 * (1.0 + f["flow"])
            along = rng() * 0.25
            phase = rng() * math.tau
            cu = bpy.data.curves.new(f"GroomCurve{gi}_{ci}", type="CURVE")
            cu.dimensions = "3D"
            cu.bevel_depth = (0.0016 + 0.0012 * (1.0 - f["taper"])) * hair_f
            cu.bevel_resolution = bevel_res
            sp = cu.splines.new("POLY")
            sp.points.add(n_pts - 1)
            for ri in range(n_pts):
                t = along + (1.0 - along) * ri / (n_pts - 1)
                base = _guide_point(pts, t)
                sweep_off = f["sweep"] * 0.1 * (t ** 1.5)
                wave = math.sin(t * math.pi * (1.5 + 2.0 * f["flow"]) + phase) * 0.022 * f["flow"] * t
                sp.points[ri].co = (base[0] + lat + wave, base[1] + sweep_off, base[2] + wave * 0.6, 1.0)
                # THE STRANDS GO HERO: the per-point radius carries the
                # strand's own root-to-tip taper (its root 1.0 -> the
                # taper-driven tip); the standard curve keeps the
                # uniform bevel honestly (the iteration-89 law).
                u = ri / (n_pts - 1)
                sp.points[ri].radius = (1.0 - (1.0 - tip) * u) if hero else 1.0
            cu.materials.append(shade_mat if existing is None else existing)
            ob = bpy.data.objects.new(f"GroomCurve{gi}_{ci}", cu)
            scn.collection.objects.link(ob)
            ob.parent = head
            ob.location = (0.0, 0.0, 0.0)
            count += 1
            pts_total += n_pts
    fly_built = 0
    if hero:
        # the HERO FLYAWAY pass: loose curves off the dome riding the
        # flyaway factor - the mesh flyaway law's curve edition
        # (the same seeded law, the same drop + wave physics).
        n_fly = int(round(GROOM_HERO_FLYAWAY_BASE * f["flyaway"]))
        for si in range(n_fly):
            rng = mulberry32(fnv1a(f"groomcurvefly|{style}|{si}"))
            a = rng() * math.tau
            rr = 0.07 + rng() * 0.035
            sx, sz = math.cos(a) * rr, 0.16 + rng() * 0.07 * height_f
            base_z = max(0.05, sz * hair_f if sz < 0.05 else sz)
            phase = rng() * math.tau
            cu = bpy.data.curves.new(f"GroomCurveFly{si}", type="CURVE")
            cu.dimensions = "3D"
            cu.bevel_depth = 0.0012 * hair_f
            cu.bevel_resolution = bevel_res
            sp = cu.splines.new("POLY")
            sp.points.add(n_pts - 1)
            for ri in range(n_pts):
                t = ri / (n_pts - 1)
                drop = -0.05 - 0.13 * t * (0.5 + f["flow"])
                wave = math.sin(t * math.pi * 2.0 + phase) * 0.014 * (0.4 + f["flow"])
                sp.points[ri].co = (
                    sx * (1.0 + 0.4 * t) + wave,
                    0.02 + rng() * 0.01,
                    base_z + drop * (0.8 + 0.2 * hair_f),
                    1.0,
                )
                sp.points[ri].radius = 1.0 - (1.0 - tip) * t
            cu.materials.append(shade_mat if existing is None else existing)
            ob = bpy.data.objects.new(f"GroomCurveFly{si}", cu)
            scn.collection.objects.link(ob)
            ob.parent = head
            ob.location = (0.0, 0.0, 0.0)
            count += 1
            pts_total += n_pts
            fly_built += 1
    if existing is None:
        shade_mat.name = mat_name
    return {
        "curves": count, "curvePts": pts_total,
        "tier": tier, "ptsPerCurve": n_pts,
        "flyaways": fly_built,
        "hash": groom_curve_hash(f, style, tier),
    }


def groom_strand_factor(shot_type):
    """The LOD law (mirrors groomStrandFactor in groom.ts): the close
    framings grow the FULL strand detail (1.0), the wide framings keep
    a reduced pass (0.4), everything between a middle one (0.7)."""
    st = str(shot_type or "").upper()
    if st in GROOM_CLOSE_FRAMINGS:
        return 1.0
    if st in GROOM_WIDE_FRAMINGS:
        return 0.4
    return 0.7


def groom_profile(dna):
    """THE HAIR IS GROOMED (iteration 85): validate + clamp the groom
    profile the sheet read compiled (adherence.ts -> groom.ts) - one
    law, two runtimes. An adherent build always rides one; a missing
    or partial profile fills from the STYLE PRIOR (clamped against
    the same bounds the TS side clamps against) and the fields list
    names only what the sheet read itself owns."""
    raw = dna.get("groomProfile") if isinstance(dna, dict) else None
    style = str(dna.get("hairStyle") or "short").strip().lower() if isinstance(dna, dict) else "short"
    if style not in GROOM_STYLE_PRIORS:
        style = "short"
    factors = dict(GROOM_STYLE_PRIORS[style])
    # every bounded factor exists, even when the prior predates it
    for key, (lo, hi) in GROOM_BOUNDS.items():
        factors.setdefault(key, 0.85 if key == "taper" else (lo + hi) / 2.0)
    fields = []
    if isinstance(raw, dict):
        for key, (lo, hi) in GROOM_BOUNDS.items():
            v = raw.get(key)
            if isinstance(v, (int, float)) and math.isfinite(float(v)):
                factors[key] = round(max(lo, min(hi, float(v))), 3)
        fr = raw.get("fields")
        fields = [str(f) for f in fr][:8] if isinstance(fr, list) else []
    return {"factors": factors, "style": style, "fields": fields}


# ── iteration 86: THE FRAME IS FINISHED IN COMP ─────────────────────
COMP_BOUNDS = {
    "mist": (0.0, 1.0),
    "chroma": (0.0, 1.0),
    "vignette": (0.0, 1.0),
    "speed": (0.0, 1.0),
    "beams": (0.0, 1.0),
    "grain": (0.0, 1.0),
}
# the house defaults (a quiet shot still leaves the compositor
# finished) - mirrors COMP_BASE in comp.ts
COMP_BASE = {"mist": 0.12, "chroma": 0.08, "vignette": 0.15, "speed": 0.04, "beams": 0.04, "grain": 0.3}
# the four color scripts - mirrors COMP_LUTS in comp.ts bit-exactly
# (neutral IS the iteration-73 donghua room grade; the mist tints are
# DEPTH-FOG colors - dark, hue-shifted toward the script: fog toward
# a bright pastel washes the whole frame pale and the figure ghosts)
COMP_LUTS = {
    "moonlight": {"lift": (0.97, 1.0, 1.05, 1.0), "gain": (0.94, 0.99, 1.1, 1.0), "sat": 1.0, "mistTint": (0.24, 0.29, 0.44, 1.0)},
    "tribulation": {"lift": (1.0, 0.96, 1.03, 1.0), "gain": (1.08, 0.97, 1.0, 1.0), "sat": 1.12, "mistTint": (0.3, 0.24, 0.38, 1.0)},
    "dawn": {"lift": (1.02, 0.99, 0.96, 1.0), "gain": (1.08, 1.02, 0.94, 1.0), "sat": 1.06, "mistTint": (0.55, 0.44, 0.34, 1.0)},
    "neutral": {"lift": (0.98, 0.985, 1.02, 1.0), "gain": (1.03, 1.0, 0.965, 1.0), "sat": 1.06, "mistTint": (0.36, 0.4, 0.46, 1.0)},
}


def comp_profile(shot):
    """THE FRAME IS FINISHED IN COMP (iteration 86): validate + clamp
    the comp profile the shot's drama compiled (comp.ts -> the
    payload's shot.comp) - one law, two runtimes. A payload without
    one (the legacy stand-in paths) keeps the HOUSE DEFAULTS - a raw
    frame was a pipeline defect, not a style; the fields list names
    only what the shot itself owns; an unknown lut name degrades to
    neutral."""
    raw = shot.get("comp") if isinstance(shot, dict) else None
    factors = dict(COMP_BASE)
    named = False
    if isinstance(raw, dict):
        named = True
        for key, (lo, hi) in COMP_BOUNDS.items():
            v = raw.get(key)
            if isinstance(v, (int, float)) and math.isfinite(float(v)):
                factors[key] = round(max(lo, min(hi, float(v))), 3)
    lut = str(raw.get("lut") or "neutral") if isinstance(raw, dict) else "neutral"
    if lut not in COMP_LUTS:
        lut = "neutral"
    fields = []
    if isinstance(raw, dict):
        fr = raw.get("fields")
        fields = [str(f) for f in fr][:8] if isinstance(fr, list) else []
    return {"factors": factors, "lut": lut, "fields": fields, "named": named}


def comp_hash(prof):
    """The DETERMINISTIC comp hash - mirrors compHash in comp.ts
    bit-exactly (sha256 over the bounded profile, first 16 hex)."""
    f = prof["factors"]
    key = "86|{:.3f}|{:.3f}|{:.3f}|{:.3f}|{:.3f}|{:.3f}|{}|v1".format(
        f["mist"], f["chroma"], f["vignette"], f["speed"], f["beams"], f["grain"], prof["lut"])
    return hashlib.sha256(key.encode()).hexdigest()[:16]


# ── iteration 87 THE CLOTH IS DIRECTED (Layer B): the shot's own words
#    compiled a bounded cloth directive (cloth-directive.ts -> the
#    payload's shot.clothDirective) - the wind's travel heading on the
#    screen plane (0 back-stream / 90 screen-right / 180 toward-lens /
#    270 screen-left), the directed strength, the gust turbulence, the
#    garment class (the REAL solver re-tunes per class) and the
#    collision tier. One law, two runtimes: the worker re-clamps the
#    same bounds, folds the heading into 0..360 and degrades an
#    unknown garment/collision name honestly. A payload without one
#    keeps the probed house air. ──
CLOTH_DIRECTIVE_BOUNDS = {"strength": (0.0, 1.0), "turbulence": (0.0, 1.0)}
GARMENT_CLASSES = ("silk", "cloth", "leather", "armor")
COLLISION_TIERS = ("self", "off")
# per-class solver physics - mirrors GARMENT_SETTINGS in cloth-directive.ts
GARMENT_SETTINGS = {
    "silk": {"mass": 0.14, "tension": 7.0, "compression": 5.5, "shear": 4.5, "bending": 0.12, "air_damping": 1.35},
    "cloth": {"mass": 0.25, "tension": 12.0, "compression": 10.0, "shear": 8.0, "bending": 0.3, "air_damping": 1.6},
    "leather": {"mass": 0.42, "tension": 20.0, "compression": 17.0, "shear": 14.0, "bending": 0.85, "air_damping": 1.9},
    "armor": {"mass": 0.65, "tension": 30.0, "compression": 26.0, "shear": 22.0, "bending": 2.2, "air_damping": 2.2},
}


def cloth_directive(shot):
    """Validate + clamp the shot's cloth directive (one law, two
    runtimes): a wild factor clamps, the heading folds into 0..360
    (Python's positive modulo - a -30 arrives as 330), an unknown
    garment degrades to cloth, an unknown collision tier to off, and
    a missing directive returns None honestly (the probed house air)."""
    raw = shot.get("clothDirective") if isinstance(shot, dict) else None
    if not isinstance(raw, dict):
        return None

    def num(key, default):
        v = raw.get(key)
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(float(v)):
            return default
        lo, hi = CLOTH_DIRECTIVE_BOUNDS[key]
        return round(max(lo, min(hi, float(v))), 3)

    strength = num("strength", 0.0)
    turbulence = num("turbulence", 0.0)
    hv = raw.get("heading")
    heading = 0.0
    if isinstance(hv, (int, float)) and not isinstance(hv, bool) and math.isfinite(float(hv)):
        folded = float(hv) % 360.0
        heading = round(folded, 1)
    garment = str(raw.get("garment") or "cloth").lower()
    if garment not in GARMENT_CLASSES:
        garment = "cloth"
    collision = str(raw.get("collision") or "off").lower()
    if collision not in COLLISION_TIERS:
        collision = "off"
    fields = [str(f) for f in raw.get("fields") or [] if isinstance(f, str)]
    d = {"heading": heading, "strength": strength, "turbulence": turbulence,
         "garment": garment, "collision": collision, "fields": fields}
    d["hash"] = cloth_directive_hash(d)
    return d


def cloth_directive_hash(d):
    """The DETERMINISTIC cloth-directive hash - mirrors clothHash in
    cloth-directive.ts bit-exactly (sha256 over the bounded directive,
    first 16 hex)."""
    key = "87|{:.1f}|{:.3f}|{:.3f}|{}|{}|v1".format(
        d["heading"], d["strength"], d["turbulence"], d["garment"], d["collision"])
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def cloth_directive_line(d):
    """The directive as one ledger line (mirrors clothDirectiveLine)."""
    from_txt = f"named by the shot: {', '.join(d['fields'])}" if d["fields"] else "house air"
    coll = "self-collision" if d["collision"] == "self" else "no self-collision"
    return (f"cloth: directed - heading {d['heading']:.0f}°, strength {d['strength']:.2f}, "
            f"turbulence {d['turbulence']:.2f}, {d['garment']} garments, {coll} ({from_txt})")


# ── iteration 88 THE CAMERA CHOREOGRAPHS THE DRAMA (Layer C): the
#    shot's own words compiled a bounded camera choreo
#    (camera-choreo.ts -> the payload's shot.cameraChoreo) - the
#    revelation push-in, the retreat pull-out, the dread dutch tilt,
#    the storm's handheld breath, the cut-in whip. One law, two
#    runtimes: the worker re-clamps the same bounds and layers the
#    choreo onto WHATEVER aims the lens. A payload without one keeps
#    the steady house camera, honestly named. ──
CAMERA_CHOREO_BOUNDS = {"pushIn": (0.0, 1.0), "pullOut": (0.0, 1.0), "dutch": (0.0, 1.0), "handheld": (0.0, 1.0), "whip": (0.0, 1.0)}
CAMERA_CHOREO_KEYS = ("pushIn", "pullOut", "dutch", "handheld", "whip")


def camera_choreo(shot):
    """Validate + clamp the shot's camera choreo (one law, two
    runtimes): a wild factor clamps, a missing choreo returns None
    honestly (the steady house camera)."""
    raw = shot.get("cameraChoreo") if isinstance(shot, dict) else None
    if not isinstance(raw, dict):
        return None
    factors = {}
    for key in CAMERA_CHOREO_KEYS:
        v = raw.get(key)
        lo, hi = CAMERA_CHOREO_BOUNDS[key]
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(float(v)):
            factors[key] = 0.0
        else:
            factors[key] = round(max(lo, min(hi, float(v))), 3)
    fields = [str(f) for f in raw.get("fields") or [] if isinstance(f, str)]
    c = dict(factors)
    c["fields"] = fields
    c["hash"] = camera_choreo_hash(c)
    return c


def camera_choreo_hash(c):
    """The DETERMINISTIC camera-choreo hash - mirrors cameraChoreoHash
    in camera-choreo.ts bit-exactly (sha256-16)."""
    key = "88|{:.3f}|{:.3f}|{:.3f}|{:.3f}|{:.3f}|v1".format(
        c["pushIn"], c["pullOut"], c["dutch"], c["handheld"], c["whip"])
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def camera_choreo_line(c):
    """The choreo as one ledger line (mirrors cameraChoreoLine)."""
    from_txt = f"named by the shot: {', '.join(c['fields'])}" if c["fields"] else "steady house camera"
    return (f"camera: choreographed - push-in {c['pushIn']:.2f}, pull-out {c['pullOut']:.2f}, "
            f"dutch {c['dutch']:.2f}, handheld {c['handheld']:.2f}, whip {c['whip']:.2f} ({from_txt})")


def _groom_guides(style, height_f):
    """The per-style guide spines (head-local, crown riding height_f):
    the same bone structure the loft volumes hang from - strands fan
    OFF these guides, they never float."""
    dome = 0.235 * height_f
    if style == "topknot":
        return [
            [(0.0, 0.01, dome * 0.92), (0.0, 0.02, dome + 0.055 * height_f), (0.015, 0.045, dome + 0.095 * height_f)],
            [(0.0, 0.045, 0.22), (0.0, 0.07, 0.1), (0.0, 0.075, -0.08), (0.0, 0.065, -0.24)],
        ]
    if style == "ponytail":
        return [
            [(0.0, -0.05, 0.2 * height_f), (0.0, 0.03, dome * 0.94), (0.0, 0.062, 0.16 * height_f), (0.0, 0.075, 0.04)],
            [(0.0, 0.09, 0.0), (0.015, 0.105, -0.16), (-0.012, 0.1, -0.34), (0.0, 0.07, -0.5)],
        ]
    if style == "braid":
        return [
            [(0.0, 0.06, 0.16), (0.0, 0.075, 0.0), (0.0, 0.078, -0.16)],
            [(0.0, 0.078, -0.2), (0.0, 0.074, -0.34), (0.0, 0.065, -0.46)],
        ]
    if style == "long":
        return [
            [(0.06, -0.03, 0.17), (0.082, -0.04, -0.02), (0.08, -0.035, -0.22), (0.07, -0.028, -0.4)],
            [(-0.06, -0.03, 0.17), (-0.082, -0.04, -0.02), (-0.08, -0.035, -0.22), (-0.07, -0.028, -0.4)],
            [(0.0, 0.06, 0.2), (0.0, 0.072, 0.0), (0.0, 0.076, -0.2), (0.0, 0.068, -0.42)],
        ]
    return [  # short
        [(0.0, -0.02, 0.21 * height_f), (0.0, 0.03, dome * 0.9), (0.0, 0.055, 0.1)],
        [(0.0, 0.055, 0.06), (0.0, 0.07, -0.04), (0.0, 0.074, -0.13)],
    ]


def _guide_point(pts, t):
    """Linear interpolation along a guide spine (t 0..1 across the
    control points - cheap, deterministic, good enough for strands)."""
    if t <= 0:
        return pts[0]
    if t >= 1:
        return pts[-1]
    seg = t * (len(pts) - 1)
    i = min(len(pts) - 2, int(seg))
    k = seg - i
    a, b = pts[i], pts[i + 1]
    return (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k)


def groom_strands(scn, bpy, head, hair_mat, style, hair_f, height_f, gp, strand_f):
    """THE HAIR IS GROOMED (iteration 85): grow guide-fitted thin
    strands + flyaways off the style's guide spines, riding the
    silhouette's hair factor and the crown's height_f exactly like
    the volumes; the direction rides the profile (sweep pulls the
    free ends back, flow waves them, flyaway looses strands off the
    dome, taper thins them out); the LOD factor scales the pass.
    Deterministic: fnv1a + mulberry32 seeds per strand - the same
    DNA always grooms the same hair. Returns the evidence."""
    f = gp["factors"]
    guides = _groom_guides(style, height_f)
    per_guide = max(1, int(round(GROOM_STRAND_BASE * strand_f)))
    n_fly = int(round(GROOM_FLYAWAY_BASE * f["flyaway"] * strand_f))
    lod = "full" if strand_f >= 0.99 else ("reduced" if strand_f >= 0.55 else "wide")
    count = 0
    fly_built = 0
    verts = 0

    def add(obj):
        nonlocal count, verts
        if obj is None:
            return
        obj.parent = head
        obj.location = (0.0, 0.0, 0.0)
        count += 1
        verts += len(obj.data.vertices)

    for gi, guide in enumerate(guides):
        pts = [(x, y, (0.05 + (z - 0.05) * hair_f) if z < 0.05 else z) for (x, y, z) in guide]
        for si in range(per_guide):
            rng = mulberry32(fnv1a(f"groom|{style}|{gi}|{si}"))
            lat = (rng() - 0.5) * 0.055 * (1.0 + f["flow"])
            along = rng() * 0.3
            rad = (0.0055 + 0.0045 * (1.0 - f["taper"])) * hair_f
            phase = rng() * math.tau
            rings = []
            n_r = 4
            for ri in range(n_r):
                t = along + (1.0 - along) * ri / (n_r - 1)
                base = _guide_point(pts, t)
                sweep_off = f["sweep"] * 0.09 * (t ** 1.5)
                wave = math.sin(t * math.pi * (1.5 + 2.0 * f["flow"]) + phase) * 0.02 * f["flow"] * t
                r = 0.0 if ri == n_r - 1 else rad * (1.0 - 0.55 * t)
                rings.append({"c": (base[0] + lat + wave, base[1] + sweep_off, base[2] + wave * 0.6), "r": r})
            add(loft_strand(scn, bpy, f"GroomStrand{gi}_{si}", hair_mat, rings))
    for si in range(n_fly):
        rng = mulberry32(fnv1a(f"groomfly|{style}|{si}"))
        a = rng() * math.tau
        rr = 0.07 + rng() * 0.035
        sx, sz = math.cos(a) * rr, 0.16 + rng() * 0.07 * height_f
        base_z = max(0.05, sz * hair_f if sz < 0.05 else sz)
        phase = rng() * math.tau
        rings = []
        n_r = 4
        for ri in range(n_r):
            t = ri / (n_r - 1)
            drop = -0.05 - 0.13 * t * (0.5 + f["flow"])
            wave = math.sin(t * math.pi * 2.0 + phase) * 0.014 * (0.4 + f["flow"])
            r = 0.0 if ri == n_r - 1 else 0.0035 * (1.0 - 0.4 * t)
            rings.append({"c": (sx * (1.0 + 0.4 * t) + wave, 0.02 + rng() * 0.01, base_z + drop * (0.8 + 0.2 * hair_f)), "r": r})
        add(loft_strand(scn, bpy, f"GroomFly{si}", hair_mat, rings))
        fly_built += 1
    blob = json.dumps({"factors": f, "style": style, "lod": lod, "strands": count}, sort_keys=True).encode("utf-8")
    return {
        "strands": count, "flyaways": fly_built, "verts": verts, "lod": lod,
        "factors": f, "fields": gp["fields"], "style": style,
        "hash": hashlib.sha256(blob).hexdigest()[:16],
    }


def build_designed_figure(bpy, scn, dna, mats, strand_f=1.0):
    """The DESIGNED character (v4.0): stylized proportions, layered
    robes with a flowing skirt and wide sleeves, hairstyle per DNA,
    a weapon per DNA, all hanging on the SAME joint hierarchy as the
    v3.2 stand-in - so apply_pose, the face rig, lip-sync and the
    camera framing math work unchanged. strand_f: the groom LOD
    factor (iteration 85) - close framings carry the full strand
    pass, wide framings a reduced one."""
    robe_mat = mats["robe"]
    accent_mat = mats["accent"]
    skin_mat = mats["skin"]
    hair_mat = mats["hair"]
    blade_mat = mats["blade"]
    boots_mat = mats["boots"]

    lean = dna.get("build") == "lean"
    sturdy = dna.get("build") == "sturdy"
    width = 0.85 if lean else (1.18 if sturdy else 1.0)

    # ── THE SILHOUETTE SHAPES THE MESH (iteration 81): the sheet read's
    #    silhouette sentence rides the DNA as a bounded shaping profile
    #    and the outline matches the sheet, not just the palette. Mesh
    #    only - the joint anchors stay exactly where the framing math
    #    and the v3.x rig contract expect them, so apply_pose, lip-sync
    #    and SHOT_FRAMING work unchanged. A guess build (no profile)
    #    keeps the previous outline factor for factor. ──
    shape = silhouette_shape(dna)

    def sf(key):
        return shape["factors"][key] if shape else 1.0

    shoulder_w = width * sf("shoulders")   # shoulder span + sleeve tops
    torso_w = width * sf("torso")          # torso/chest/hips bulk
    sleeve_f = sf("sleeves")               # sleeve length + flare
    skirt_f = sf("skirt")                  # skirt drop + flare
    hair_f = sf("hair")                    # hair mass
    height_f = sf("height")                # crown presence (head/neck)

    # ── THE FACE IS SCULPTED, NOT ASSEMBLED (iteration 82): the head
    #    is a real sculpted mesh and the sheet read's faceShape family
    #    modulates it through a bounded profile (mesh only - the rig
    #    anchors stay). A guess build keeps the neutral sculpt. ──
    prof = face_profile(dna)

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
    sphere("HipsMesh", pelvis, (0.0, 0.0, 0.02), 0.13, robe_mat, scale=(1.05 * torso_w, 0.8, 0.75))
    torso = capsule("TorsoMesh", pelvis, (0.0, 0.0, 0.22), 0.115 * torso_w, 0.36, robe_mat)
    torso.scale = (1.0, 0.72, 1.0)
    # upper-chest wrap: slightly wider robe shell
    sphere("ChestMesh", pelvis, (0.0, 0.0, 0.4), 0.13, robe_mat, scale=(1.12 * torso_w, 0.78, 0.95))

    spine = empty("Spine", pelvis, (0.0, 0.0, 0.45))
    head = empty("Head", spine, (0.0, 0.0, 0.28))

    # sash: the accent-color waist band over the robe
    sash = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=16, radius=0.135 * torso_w, depth=0.09, location=(0, 0, 0), )
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
        # the skirt drop rides the silhouette's skirt factor: the panel
        # grows DOWN from the same waist line (the center follows the
        # half-height so the top edge stays pinned at -0.005)
        panel.scale = (0.07 * width * (0.5 + 0.5 * skirt_f), 0.009, 0.19 * skirt_f)
        panel.rotation_euler = (math.sin(a) * 0.1, -math.cos(a) * 0.1, a)
        panel.data.materials.append(robe_mat)
        panel.parent = pelvis
        panel.location = (px * 1.3, py * 1.3, -0.005 - 0.095 * skirt_f)

    # neck + head (skin) - head mesh stays at spine-local z .12*? keep
    # the stand-in's world anchor: head empty +0.28, mesh center +0.12
    # neck: a high robe collar (accent) so the chin never floats over
    # a pale gap - donghua robes close at the throat
    capsule("NeckMesh", spine, (0.0, 0.0, 0.17), 0.036, 0.22 * height_f, accent_mat)
    # ── THE FACE IS SCULPTED, NOT ASSEMBLED (iteration 82) and THE
    #    HEAD IS CARVED AT DEPTH (iteration 90, Layer A): the depth
    #    answers the framing (the groom's LOD law, head edition) - the
    #    hero carve at the close framings, the reduced carve between,
    #    the light head at wide. The hero build BAKES DOWN (a
    #    tangent-space normal + a cavity map through the shared
    #    spherical UVs, cached by the deterministic bake key); the
    #    levels below WEAR the bake when the cache exists and render
    #    unbaked, honestly named, when it does not. ──
    head_depth = 5 if strand_f >= 0.9 else 4
    head_bake_pass = None
    try:
        # the pass lives beside this file (the ROOT law: the bridge's
        # own directory rides sys.path for the pass imports)
        here = os.path.dirname(os.path.abspath(__file__))
        if here not in sys.path:
            sys.path.insert(0, here)
        import head_bake as head_bake_pass
    except Exception:  # noqa: BLE001
        head_bake_pass = None
    head_mat = skin_mat
    bake_evidence = None
    wrinkle_evidence = None
    wrinkle_nodes = {}
    bake_key_txt = head_bake_pass.bake_key(prof) if head_bake_pass else ""
    wrinkle_key_txt = head_bake_pass.wrinkle_key(prof) if head_bake_pass else ""
    if head_depth < 5 and head_bake_pass:
        n_path, c_path = head_bake_pass.cache_paths(bake_key_txt)
        if os.path.isfile(n_path) and os.path.isfile(c_path):
            head_mat = skin_mat.copy()
            head_mat.name = f"HeadSkin_{bake_key_txt}"
            if head_bake_pass.wear_baked_maps(bpy, head_mat, n_path, c_path):
                bake_evidence = {"worn": True, "key": bake_key_txt,
                                 "normal": os.path.basename(n_path), "cavity": os.path.basename(c_path)}
                # ── THE FACE CREASES WHEN IT ACTS (iteration 93): the
                #    cached wrinkle set wears INTO the same tree - each
                #    map through its own Normal Map node, Strength at
                #    rest now and DRIVEN LIVE by the shape's expression
                #    weight every frame. The depth wears on the bake's
                #    own tree (a face with no base bake wears no
                #    creases - the honest skip). ──
                wrinkle_nodes = head_bake_pass.wear_wrinkle_maps(bpy, head_mat, wrinkle_key_txt)
                wrinkle_evidence = (
                    {"worn": True, "baked": False, "key": wrinkle_key_txt,
                     "shapes": sorted(wrinkle_nodes.keys()), "strength": WRINKLE_STRENGTH}
                    if wrinkle_nodes else
                    {"worn": False, "baked": False, "key": wrinkle_key_txt,
                     "note": "no cached wrinkle set"})
            else:
                head_mat = skin_mat  # the wear refused - keep the honest shared grade
                bake_evidence = {"worn": False, "key": bake_key_txt, "note": "wear refused"}
    hm = sculpt_head_mesh(scn, bpy, head, head_mat, prof, height_f, depth=head_depth)
    # ── THE FACE PERFORMS THE BEAT (iteration 84): the four
    #    expression shape keys ride the sculpted head (mesh-local;
    #    the faceHash stays deterministic per profile + depth - the
    #    vertex count rides the depth law since iteration 90).
    #    Sculpted BEFORE the hero bake since iteration 93 - the
    #    wrinkle bake evaluates these keys at full weight on the deep
    #    surface; the basis law is unchanged ──
    expr_keys = sculpt_expression_keys(hm)
    if head_depth >= 5 and head_bake_pass:
        # the hero build bakes down: a depth-4 PROXY of the same face
        # (the light law, the shared spherical UVs) takes the hi->lo
        # bake, then is deleted - the proxy never renders
        proxy_mat = bpy.data.materials.new("HeadBakeProxy")
        proxy_mat.use_nodes = True
        proxy = sculpt_head_mesh(scn, bpy, head, proxy_mat, prof, height_f, depth=4)
        try:
            bake_evidence = head_bake_pass.bake_head_depth(bpy, scn, hm, proxy, bake_key_txt)
        except Exception as exc:  # noqa: BLE001
            bake_evidence = {"skipped": f"bake failed: {exc}"}
        # ── THE FACE CREASES WHEN IT ACTS (iteration 93): the hero
        #    build bakes the EXPRESSION's shading depth down too - each
        #    wrinkle-bearing shape at full weight on BOTH surfaces (the
        #    large move cancels between them; what remains is exactly
        #    the crease detail the light mesh loses), through the same
        #    spherical UVs, cached under the wrinkle key. The proxy
        #    carries its own keys for the same law (deleted with it). ──
        try:
            proxy_keys = sculpt_expression_keys(proxy)
            wrinkle_evidence = head_bake_pass.bake_wrinkle_set(
                bpy, scn, hm, proxy, wrinkle_key_txt, expr_keys, proxy_keys)
        except Exception as exc:  # noqa: BLE001
            wrinkle_evidence = {"skipped": f"wrinkle bake failed: {exc}"}
        me, ma = proxy.data, proxy.data.materials[0] if proxy.data.materials else None
        bpy.data.objects.remove(proxy, do_unlink=True)
        if me is not None:
            bpy.data.meshes.remove(me)
        if ma is not None and ma.users == 0:
            bpy.data.materials.remove(ma)
    # ── THE MOUTH SPEAKS IN THE MESH (iteration 92): the three
    #    speech shape keys ride the same carved head (the basis the
    #    expression sculpt kept stays untouched - the faceHash and
    #    the vertex count still read exactly what 82/90 proved) ──
    speech_keys = sculpt_speech_keys(hm)

    # ── face (v3.2 rig, restyled): stylized eyes with readable irises;
    #    the eye SIZE rides the face profile's eyeScale ──
    eye_mat = emission_mat(bpy, "EyeMat", "#cfe8ff", 2.4)
    iris_mat = emission_mat(bpy, "IrisMat", dna.get("bladeColor", "#5eead4"), 4.5)
    feature_mat = principled_mat(bpy, "FeatureMat", "#141118", 0.85)
    es = prof["factors"]["eyeScale"]

    def eye(side_sign, name):
        piv = empty(name, head, (side_sign * 0.046, -0.104, 0.148))
        sphere(name + "Mesh", piv, (0, 0, 0), 0.016 * es, eye_mat, scale=(1.0, 0.5, 1.2))
        # the iris must POKE out past the white sphere or it never shows
        sphere(name + "Iris", piv, (0, -0.011, 0), 0.008 * es, iris_mat, scale=(1.0, 0.4, 1.4))
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

    # elder beard (v4.1): when the design text flags one, a shaded
    # beard hangs from chin and jaw, moving with the head
    if dna.get("beard"):
        beard_mat = principled_mat(bpy, "BeardMat", shade_hex(str(dna.get("hairColor") or "#16161d"), 2.6), 0.55)
        sphere("BeardChin", head, (0.0, -0.095, 0.005), 0.032, beard_mat, scale=(1.05, 0.75, 2.1))
        sphere("BeardJawL", head, (0.052, -0.07, 0.03), 0.022, beard_mat, scale=(0.8, 0.7, 1.7))
        sphere("BeardJawR", head, (-0.052, -0.07, 0.03), 0.022, beard_mat, scale=(0.8, 0.7, 1.7))
        sphere("BeardLip", head, (0.0, -0.104, 0.075), 0.018, beard_mat, scale=(1.1, 0.7, 0.9))

    # ── hair: SCULPTED strands and volumes per style (iteration 82) -
    #    a cap that hugs the skull, a thin fringe wedge, and style
    #    pieces with tapered tips; the masses ride the silhouette's
    #    hair factor and the crown rides height_f, exactly as the old
    #    sphere masses did ──
    style = str(dna.get("hairStyle") or "short")
    hair_evidence = sculpt_hair(scn, bpy, head, hair_mat, style, hair_f, height_f)
    # ── THE HAIR IS GROOMED (iteration 85): guide-fitted strands grow
    #    off the style's guides with the sheet-directed direction
    #    riding, scaled by the framing's LOD factor ──
    gp = groom_profile(dna)
    groom_evidence = groom_strands(scn, bpy, head, hair_mat, str(style), hair_f, height_f, gp, strand_f)
    # ── THE HAIR IS TRUE CURVES (iteration 89) + THE STRANDS GO
    #    HERO (iteration 94): real BLENDER HAIR CURVES off the same
    #    guides under the same direction + seed law, shaded by the
    #    sheet hex's own melanin physics - the close framings grow
    #    the HERO strands (tapered, flyaway curves riding), the
    #    middle framings the standard curve, the wide framings the
    #    mesh cards only (the strand LOD law) ──
    shade = hair_shade(dna)
    curve_evidence = None
    if strand_f >= GROOM_CURVE_MIN_LOD:
        curve_mat = build_hair_shade_material(bpy, "GroomCurveHairTmp", str(dna.get("hairColor") or "#1B1B2A"), shade)
        curve_evidence = groom_hair_curves(scn, bpy, head, curve_mat, str(style), hair_f, height_f, gp, strand_f)

    # ── arms: robe sleeves + skin forearms + v3.2 hands (the shoulder
    #    span and the sleeve drop ride the silhouette factors) ──
    def arm(side_sign, prefix):
        sh = empty(prefix + "Shoulder", spine, (side_sign * 0.24 * shoulder_w, 0.0, 0.18))
        # sleeve: wider cone over the upper arm (cloth, in robe color)
        sl = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=16, radius1=0.085 * shoulder_w, radius2=0.05 * shoulder_w, depth=0.3 * sleeve_f, location=(0, 0, 0), )
        sl.name = prefix + "Sleeve"
        sl.data.materials.append(robe_mat)
        bpy.ops.object.shade_smooth()
        sl.parent = sh
        sl.location = (0.0, 0.0, -0.15 * sleeve_f)
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
    # THE HAND CLOSES ON THE HILT (iteration 97): one GRIP PIVOT at
    # the fist's own anchor (the law's), every piece placed BY THE
    # LAW on the kind's own axis through it - the fist grips the
    # hilt, the guard sits between the fist and the blade, the
    # pieces stay collinear down-forward, and the follow-through
    # pivots the whole weapon around the fist (the pivot takes the
    # lag; the pieces keep their law rotations).
    wtype = str(dna.get("weaponType") or "none")
    blade = None
    grip_pivot = None
    if wtype in GRIP_SPEC:
        spec = GRIP_SPEC[wtype]
        tilt = spec["tilt"]
        grip_pivot = empty("GripPivot", r_hand, GRIP_ANCHOR)
        if wtype == "sword":
            # the fist grips the HILT at the anchor (pivot-local zero)
            grip = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=12, radius=0.013, depth=spec["hilt"], location=(0, 0, 0), )
            grip.name = "BladeGrip"
            grip.data.materials.append(boots_mat)
            grip.parent = grip_pivot
            grip.location = (0.0, 0.0, 0.0)
            grip.rotation_euler = (math.radians(tilt), 0.0, 0.0)
            # the guard just past the hilt's forward end, ON the axis
            guard = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
            guard.name = "BladeGuard"
            guard.scale = (0.05, 0.015, 0.011)
            guard.data.materials.append(accent_mat)
            guard.parent = grip_pivot
            guard.location = grip_piece_offset(wtype, spec["hilt"] / 2.0 + 0.0055)
            guard.rotation_euler = (math.radians(tilt), 0.0, 0.0)
            # the blade meets the guard and extends down-forward
            blade = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, 0), )
            blade.name = "HandBlade"
            blade.scale = (0.015, 0.005, 0.55)
            blade.data.materials.append(blade_mat)
            blade.parent = grip_pivot
            blade.location = grip_piece_offset(wtype, spec["guard"] + 0.0055 + 0.55)
            blade.rotation_euler = (math.radians(tilt), 0.0, 0.0)
        else:
            # staff / spear: the shaft THROUGH the fist at the kind's
            # own hold fraction (the fist in the shaft's lower third),
            # the gem/tip riding the shaft's local frame unchanged
            depth = 1.3 if wtype == "staff" else 1.5
            blade = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=12, radius=0.013 if wtype == "staff" else 0.012, depth=depth, location=(0, 0, 0), )
            blade.name = "HandBlade"
            blade.data.materials.append(boots_mat)
            blade.parent = grip_pivot
            blade.location = grip_piece_offset(wtype, -spec["hold"])  # the top sits pommel-ward (up-back)
            blade.rotation_euler = (math.radians(tilt), 0.0, 0.0)
            if wtype == "staff":
                gem = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=2, radius=0.045, location=(0, 0, 0), )
                gem.name = "StaffGem"
                gem.data.materials.append(blade_mat)
                gem.parent = blade
                gem.location = (0.0, 0.0, 0.7)
            else:
                tip = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=10, radius1=0.03, radius2=0.0, depth=0.22, location=(0, 0, 0), )
                tip.name = "SpearTip"
                tip.data.materials.append(blade_mat)
                tip.parent = blade
                tip.location = (0.0, 0.0, 0.83)

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
        # THE HAND CLOSES ON THE HILT (iteration 97): the pivot the
        # follow-through flexes (None when the DNA named no weapon)
        "gripPivot": grip_pivot,
        "headMesh": hm,
        # THE FACE PERFORMS THE BEAT (iteration 84): the head's four
        # expression shape keys ({name: KeyBlock}) - apply_pose blends
        # their values with the clip every frame; a rig without them
        # (the stand-in, an asset load) simply skips the mesh half
        "exprKeys": expr_keys,
        # THE MOUTH SPEAKS IN THE MESH (iteration 92): the head's three
        # speech shape keys ({name: KeyBlock}) - apply_pose drives them
        # with the sampled viseme weights every frame (the mesh half of
        # the lip-sync); a rig without them skips honestly
        "speechKeys": speech_keys,
        # THE FACE CREASES WHEN IT ACTS (iteration 93): the worn
        # wrinkle normal maps' DRIVEN nodes ({shape: NormalMap node}) -
        # apply_pose scales each Strength by the shape's live
        # expression weight every frame (rest at zero). Empty on the
        # hero (its creases are real geometry) and on rigs that never
        # wore the set.
        "wrinkleNodes": wrinkle_nodes,
        # THE HAIR IS GROOMED (iteration 85): the strand detail's
        # evidence - the strands grown, the flyaways, the LOD the
        # framing earned, the clamped factors and the deterministic
        # hash (always present: the groom rides every styled build)
        "groom": groom_evidence,
        # THE HAIR IS TRUE CURVES (iteration 89) + THE STRANDS GO
        # HERO (iteration 94): the curve detail's evidence - the
        # curves grown, the points, the TIER the framing earned
        # (hero/standard), the hero flyaways, the curve hash over
        # the law inputs and the melanin shade the sheet hex
        # derived (None when the wide LOD kept the mesh cards -
        # honest)
        "hairShade": shade,
        "hairCurves": curve_evidence,
        # THE SILHOUETTE SHAPES THE MESH: the applied shaping evidence -
        # the clamped factors, the traits that actually moved, and the
        # trait names the sheet's own silhouette sentence described
        # (None when the DNA carried no profile - a guess build).
        "silhouette": {
            "factors": shape["factors"],
            "applied": shape["named"],
            "namedBySheet": shape["fields"],
        } if shape else None,
        # THE FACE IS SCULPTED, NOT ASSEMBLED: the applied face evidence
        # - the family the sheet named (None = the neutral sculpt), the
        # clamped factors, the sculpted hair parts and the vertex count
        # the sculpt moved, plus the head mesh's DETERMINISTIC HASH
        # (the same profile always lands the same sculpt; a different
        # family lands a different mesh - the smoke test proves both).
        "sculpt": {
            "faceShape": prof["faceShape"],
            "factors": prof["factors"],
            "namedBySheet": prof["fields"],
            "parts": hair_evidence["parts"],
            "verts": hair_evidence["verts"] + len(hm.data.vertices),
            "faceHash": hashlib.sha256(
                "".join(f"{v.co.x:.5f},{v.co.y:.5f},{v.co.z:.5f};" for v in hm.data.vertices).encode("utf-8")
            ).hexdigest()[:16],
            # THE HEAD IS CARVED AT DEPTH (iteration 90): the depth the
            # framing earned, the plane count the carve applied, the
            # deterministic bake key (the profile's own factors, shared
            # by every depth of the same face) and the bake evidence -
            # the hero build's written bake, the lower levels' worn
            # pair, or the honest skip
            "depth": head_depth,
            "planes": 23 if head_depth >= 5 else 8,
            "bakeKey": bake_key_txt,
            "bake": bake_evidence,
            # THE FACE CREASES WHEN IT ACTS (iteration 93): the
            # expression's shading depth under the same key law (the
            # wrinkle key, the factors versioned 93) and the set's
            # evidence - the hero build's written maps (with
            # fingerprints), the lower levels' worn set (the driven
            # nodes), or the honest skip
            "wrinkleKey": wrinkle_key_txt,
            "wrinkle": wrinkle_evidence,
        },
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


# ── v5.0 DESIGN ANYTHING: props and creatures ────────────────
# The asset library used to cover only the cast and the sets; a
# production-grade show is also carried by its PROPS (the spirit
# sword, the flying vessel, the sect seal) and its CREATURES (the
# spirit beast, the serpent elder). These deterministic builders
# follow the same contract as the figure/set builders: design DNA
# in, real geometry + materials out, zero per-job randomness (the
# only seed is the DNA itself, so the same design rebuilds true).

def _rune_markers(bpy, scn, count, path_pts, mat, size=0.05):
    """Small emissive quads placed along a path (blade fuller, staff
    shaft, artifact ring). Path points are (x, y, z) tuples."""
    n = max(0, int(count))
    made = 0
    if n == 0 or len(path_pts) < 2:
        return made
    for i in range(n):
        t = i / max(1, n - 1) if n > 1 else 0.5
        # walk the polyline segment containing t
        seg = min(int(t * (len(path_pts) - 1)), len(path_pts) - 2)
        lt = t * (len(path_pts) - 1) - seg
        p0, p1 = path_pts[seg], path_pts[seg + 1]
        x = p0[0] + (p1[0] - p0[0]) * lt
        y = p0[1] + (p1[1] - p0[1]) * lt
        z = p0[2] + (p1[2] - p0[2]) * lt
        rune = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(x, y, z), )
        rune.scale = (size * 1.6, size, size)
        rune.rotation_euler = (0.0, 0.0, 0.0)
        rune.name = f"Rune{made + 1}"
        rune.data.materials.append(mat)
        made += 1
    return made


def build_designed_prop(bpy, scn, dna, job_id="prop-build"):
    """The DESIGNED prop (v5.0): a real, named object hierarchy for
    the prop DNA - blade + guard + grip + pommel for weapons, body +
    bands + base for artifacts and relics, hull + deck + mast for
    vessels, with emissive rune markers where the design text claims
    energy. Returns a report dict (the builder asserts on it)."""
    ptype = str(dna.get("propType") or "generic")
    size = float(dna.get("size") or 1.0)
    glow = dna.get("glowStrength", 1.0)
    glow_s = float(glow) if glow is not None else 1.0

    body_hex = dna.get("bodyColor", "#4a4f58")
    accent_hex = dna.get("accentColor", "#a8842c")
    glow_hex = dna.get("glowColor", "#5eead4")
    metal = float(dna.get("metallic", 0.55) or 0.0)
    rough = float(dna.get("roughness", 0.38) or 0.8)

    body = principled_mat(bpy, "PropBodyMat", body_hex, rough, metal)
    accent = principled_mat(bpy, "PropAccentMat", accent_hex, max(0.2, rough * 0.7), min(1.0, metal + 0.2))
    glow_mat = emission_mat(bpy, "PropGlowMat", glow_hex, max(0.4, glow_s)) if glow_s > 0 else body
    dark = principled_mat(bpy, "PropDarkMat", shade_hex(body_hex, 0.45), 0.6, 0.2)

    report = {"propType": ptype, "parts": 0, "runes": 0}
    parts = 0

    def part(ob, name, mat=None):
        nonlocal parts
        ob.name = name
        ob.data.materials.append(mat if mat is not None else body)
        try:
            bpy.ops.object.shade_smooth()
        except Exception:  # noqa: BLE001
            pass
        parts += 1
        return ob

    if ptype in ("sword", "saber"):
        # blade: a tapered prism along +Z, fuller line as a thin inset
        blade = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, size * 0.52), )
        blade.scale = (0.035 * size, 0.012 * size, size * 0.46)
        part(blade, "Blade", body)
        tip = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=4, radius1=0.05 * size, radius2=0.0, depth=0.12 * size, location=(0, 0, size * 0.98), )
        tip.rotation_euler = (0.0, 0.0, math.radians(45))
        tip.scale = (0.9, 0.28, 1.0)
        part(tip, "BladeTip", body)
        if ptype == "saber":
            # single-edge curve: a slightly bowed spine bead-run
            for k in range(4):
                t = k / 3.0
                spine = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=2, radius=0.014 * size, location=(0.02 * size * math.sin(t * math.pi), 0, size * (0.28 + t * 0.6)), )
                part(spine, f"Spine{k + 1}", accent)
        guard = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=16, radius=0.075 * size, depth=0.028 * size, location=(0, 0, size * 0.045), )
        part(guard, "Guard", accent)
        grip = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=12, radius=0.022 * size, depth=0.2 * size, location=(0, 0, -size * 0.065), )
        part(grip, "Grip", dark)
        pommel = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=12, ring_count=8, radius=0.03 * size, location=(0, 0, -size * 0.17), )
        part(pommel, "Pommel", accent)
        path = [(0, 0, size * 0.12), (0, 0, size * 0.85)]
        report["runes"] = _rune_markers(bpy, scn, int(dna.get("runes", 0) or 0), path, glow_mat, size=0.018 * size)
        report["anchor"] = (0, 0, size * 0.3)  # grip point a hand would hold

    elif ptype == "spear":
        shaft = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=12, radius=0.016 * size, depth=size * 0.92, location=(0, 0, 0), )
        part(shaft, "Shaft", dark)
        head = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=8, radius1=0.05 * size, radius2=0.0, depth=0.22 * size, location=(0, 0, size * 0.56), )
        part(head, "Spearhead", body)
        collar = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=12, radius=0.03 * size, depth=0.05 * size, location=(0, 0, size * 0.44), )
        part(collar, "Collar", accent)
        tassel_r = 0.035 * size
        for k in range(6):
            a = k * (2 * math.pi / 6)
            tassel = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(math.cos(a) * tassel_r, math.sin(a) * tassel_r, size * 0.4), )
            tassel.scale = (0.006 * size, 0.006 * size, 0.07 * size)
            tassel.rotation_euler = (0.0, 0.0, a)
            part(tassel, f"Tassel{k + 1}", accent)
        endcap = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=10, ring_count=6, radius=0.02 * size, location=(0, 0, -size * 0.47), )
        part(endcap, "EndCap", accent)
        path = [(0, 0, size * 0.06), (0, 0, size * 0.4)]
        report["runes"] = _rune_markers(bpy, scn, int(dna.get("runes", 0) or 0), path, glow_mat, size=0.015 * size)
        report["anchor"] = (0, 0, -size * 0.2)

    elif ptype == "vessel":
        hull = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, size * 0.06), )
        hull.scale = (size * 0.16, size * 0.42, size * 0.045)
        part(hull, "Hull", body)
        prow = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=6, radius1=0.1 * size, radius2=0.0, depth=0.3 * size, location=(0, size * 0.5, size * 0.06), )
        prow.rotation_euler = (math.radians(90), 0, 0)
        prow.scale = (1.0, 0.5, 0.42)
        part(prow, "Prow", accent)
        deck = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, size * 0.105), )
        deck.scale = (size * 0.13, size * 0.36, size * 0.008)
        part(deck, "Deck", accent)
        mast = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=10, radius=0.012 * size, depth=size * 0.34, location=(0, 0, size * 0.26), )
        part(mast, "Mast", dark)
        banner = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, -0.02 * size, size * 0.36), )
        banner.scale = (0.1 * size, 0.004 * size, 0.12 * size)
        part(banner, "Banner", accent)
        for k in range(3):
            lantern = prim(scn, bpy.ops.mesh.primitive_ico_sphere_add, subdivisions=2, radius=0.02 * size, location=((k - 1) * size * 0.09, -size * 0.3, size * 0.13), )
            part(lantern, f"Lantern{k + 1}", glow_mat if glow_s > 0 else accent)
        path = [(0, size * 0.42, size * 0.06), (0, size * 0.48, size * 0.075)]
        report["runes"] = _rune_markers(bpy, scn, int(dna.get("runes", 0) or 0), path, glow_mat, size=0.02 * size)
        report["anchor"] = (0, 0, size * 0.11)

    elif ptype in ("artifact", "relic"):
        core_r = 0.1 * size
        core = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=16, ring_count=12, radius=core_r, location=(0, 0, size * 0.55), )
        part(core, "Core", glow_mat if glow_s > 0 else body)
        rings = 2 if ptype == "artifact" else 1
        for r_i in range(rings):
            ring = prim(scn, bpy.ops.mesh.primitive_torus_add, major_radius=(0.16 + r_i * 0.05) * size, minor_radius=0.012 * size, location=(0, 0, size * 0.55), )
            ring.rotation_euler = (math.radians(90 + r_i * 32), 0, math.radians(r_i * 48))
            part(ring, f"Ring{r_i + 1}", accent)
        if ptype == "relic":
            base = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=16, radius=0.16 * size, depth=0.09 * size, location=(0, 0, size * 0.045), )
            part(base, "Base", dark)
            stele = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, size * 0.3), )
            stele.scale = (0.11 * size, 0.035 * size, 0.19 * size)
            part(stele, "Stele", body)
            path = [(0, -0.038 * size, size * 0.22), (0, -0.038 * size, size * 0.42)]
        else:
            stand = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=12, radius1=0.09 * size, radius2=0.03 * size, depth=0.16 * size, location=(0, 0, size * 0.36), )
            part(stand, "Stand", dark)
            path = [(0, 0, size * 0.42), (0, 0, size * 0.52)]
        report["runes"] = _rune_markers(bpy, scn, int(dna.get("runes", 0) or 0), path, glow_mat, size=0.02 * size)
        report["anchor"] = (0, 0, size * 0.55)

    else:  # generic: a designed crate/bundle composition, still real parts
        box = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, size * 0.18), )
        box.scale = (size * 0.2, size * 0.14, size * 0.16)
        part(box, "Body", body)
        lid = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(0, 0, size * 0.36), )
        lid.scale = (size * 0.21, size * 0.15, size * 0.02)
        part(lid, "Lid", accent)
        strap = prim(scn, bpy.ops.mesh.primitive_torus_add, major_radius=size * 0.145, minor_radius=0.008 * size, location=(0, 0, size * 0.18), )
        strap.rotation_euler = (0.0, math.radians(90), 0.0)
        part(strap, "Strap", dark)
        report["anchor"] = (0, 0, size * 0.2)

    if dna.get("ornate"):
        # finial beads at the report anchor height, deterministic ring
        for k in range(6):
            a = k * (2 * math.pi / 6)
            bead = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=10, ring_count=6, radius=0.016 * size, location=(report["anchor"][0] + math.cos(a) * 0.05 * size, report["anchor"][1] + math.sin(a) * 0.05 * size, report["anchor"][2] - 0.08 * size), )
            part(bead, f"Finial{k + 1}", accent)

    report["parts"] = parts
    return report


def build_designed_creature(bpy, scn, dna, job_id="creature-build"):
    """The DESIGNED creature (v5.0): archetype quadruped / serpent /
    bird from the creature DNA - segmented bodies, necks, tails, legs,
    wings, horns and spines as named parts a rigger can grab, with
    emissive eyes where the spirit energy asks for them. Returns a
    report dict (the builder asserts on it)."""
    archetype = str(dna.get("archetype") or "quadruped")
    size = float(dna.get("size") or 2.0)
    glow_s = float(dna.get("glowStrength", 0.35) or 0.35)

    hide_hex = dna.get("hideColor", "#3d4a44")
    belly_hex = dna.get("bellyColor", "#5a6a5e")
    accent_hex = dna.get("accentColor", "#8a7448")
    glow_hex = dna.get("glowColor", "#ff5e6d")

    hide = principled_mat(bpy, "HideMat", hide_hex, 0.72)
    belly = principled_mat(bpy, "BellyMat", belly_hex, 0.8)
    accent = principled_mat(bpy, "CreatureAccentMat", accent_hex, 0.5, 0.1)
    glow_mat = emission_mat(bpy, "CreatureGlowMat", glow_hex, max(0.8, glow_s * 2.0)) if glow_s > 0.5 else principled_mat(bpy, "CreatureGlowMat", glow_hex, 0.3)

    report = {"archetype": archetype, "parts": 0}
    parts = 0

    def part(ob, name, mat=None):
        nonlocal parts
        ob.name = name
        ob.data.materials.append(mat if mat is not None else hide)
        try:
            bpy.ops.object.shade_smooth()
        except Exception:  # noqa: BLE001
            pass
        parts += 1
        return ob

    def eye(name, loc):
        e = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=10, ring_count=8, radius=0.035 * size, location=loc, )
        return part(e, name, glow_mat)

    if archetype == "serpent":
        seg_n = 7
        coil_r = 0.32 * size
        for k in range(seg_n):
            t = k / (seg_n - 1)
            a = t * math.pi * 1.5
            seg = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=14, ring_count=10, radius=0.11 * size * (0.7 + 0.5 * math.sin(t * math.pi)), location=(math.cos(a) * coil_r, math.sin(a) * coil_r * 0.6, 0.09 * size + 0.02 * size * math.sin(t * math.pi * 2)), )
            part(seg, f"Coil{k + 1}", hide if k % 2 == 0 else belly)
        neck = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=10, radius=0.05 * size, depth=0.34 * size, location=(coil_r + 0.1 * size, 0, 0.26 * size), )
        neck.rotation_euler = (0.0, math.radians(-24), 0.0)
        part(neck, "Neck", hide)
        head = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=14, ring_count=10, radius=0.085 * size, location=(coil_r + 0.22 * size, 0, 0.4 * size), )
        part(head, "Head", hide)
        jaw = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=6, radius1=0.045 * size, radius2=0.0, depth=0.14 * size, location=(coil_r + 0.34 * size, 0, 0.39 * size), )
        jaw.rotation_euler = (0.0, math.radians(90), 0.0)
        part(jaw, "Snout", belly)
        eye("EyeL", (coil_r + 0.24 * size, 0.05 * size, 0.44 * size))
        eye("EyeR", (coil_r + 0.24 * size, -0.05 * size, 0.44 * size))
        if dna.get("spines"):
            for k in range(5):
                spine = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=5, radius1=0.02 * size, radius2=0.0, depth=0.07 * size, location=(coil_r * math.cos(k / 4.0 * math.pi * 1.5), coil_r * 0.6 * math.sin(k / 4.0 * math.pi * 1.5), 0.19 * size), )
                part(spine, f"Spine{k + 1}", accent)
        if dna.get("horns"):
            for s_i, sgn in ((1, 1.0), (2, -1.0)):
                horn = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=6, radius1=0.02 * size, radius2=0.0, depth=0.12 * size, location=(coil_r + 0.18 * size, sgn * 0.05 * size, 0.5 * size), )
                horn.rotation_euler = (math.radians(-18), 0, sgn * math.radians(14))
                part(horn, f"Horn{s_i}", accent)

    elif archetype == "bird":
        body = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=16, ring_count=12, radius=0.16 * size, location=(0, 0, 0.42 * size), )
        body.scale = (1.0, 1.5, 1.0)
        part(body, "Body", hide)
        chest = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=12, ring_count=9, radius=0.11 * size, location=(0, 0.08 * size, 0.38 * size), )
        part(chest, "Chest", belly)
        neck = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=10, radius=0.045 * size, depth=0.3 * size, location=(0, 0.12 * size, 0.62 * size), )
        part(neck, "Neck", hide)
        head = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=14, ring_count=10, radius=0.075 * size, location=(0, 0.14 * size, 0.78 * size), )
        part(head, "Head", hide)
        beak = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=8, radius1=0.03 * size, radius2=0.0, depth=0.11 * size, location=(0, 0.24 * size, 0.78 * size), )
        beak.rotation_euler = (math.radians(90), 0, 0)
        part(beak, "Beak", accent)
        eye("EyeL", (0.05 * size, 0.18 * size, 0.81 * size))
        eye("EyeR", (-0.05 * size, 0.18 * size, 0.81 * size))
        wing_span = 0.55 * size
        for s_i, sgn in ((1, 1.0), (2, -1.0)):
            wing = prim(scn, bpy.ops.mesh.primitive_cube_add, location=(sgn * wing_span * 0.55, 0.02 * size, 0.46 * size), )
            wing.scale = (wing_span * 0.5, 0.2 * size, 0.02 * size)
            wing.rotation_euler = (0.0, sgn * math.radians(-14), 0.0)
            part(wing, f"Wing{s_i}", accent)
        tail = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=6, radius1=0.09 * size, radius2=0.0, depth=0.3 * size, location=(0, -0.3 * size, 0.4 * size), )
        tail.rotation_euler = (math.radians(-90), 0, 0)
        tail.scale = (1.0, 0.4, 1.0)
        part(tail, "Tail", accent)
        for leg_i in (1, 2):
            leg = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=8, radius=0.014 * size, depth=0.2 * size, location=((leg_i - 1.5) * 0.06 * size, 0.05 * size, 0.18 * size), )
            part(leg, f"Leg{leg_i}", accent)
            claw = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=8, ring_count=6, radius=0.025 * size, location=((leg_i - 1.5) * 0.06 * size, 0.05 * size, 0.08 * size), )
            part(claw, f"Claw{leg_i}", accent)

    else:  # quadruped (and the honest generic fallback)
        body = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=16, ring_count=12, radius=0.2 * size, location=(0, 0, 0.5 * size), )
        body.scale = (1.0, 1.9, 0.9)
        part(body, "Body", hide)
        belly_mesh = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=12, ring_count=9, radius=0.16 * size, location=(0, 0, 0.42 * size), )
        belly_mesh.scale = (0.9, 1.7, 0.6)
        part(belly_mesh, "Underbelly", belly)
        neck = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=10, radius=0.08 * size, depth=0.26 * size, location=(0, 0.3 * size, 0.66 * size), )
        neck.rotation_euler = (math.radians(-32), 0, 0)
        part(neck, "Neck", hide)
        head = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=14, ring_count=10, radius=0.11 * size, location=(0, 0.4 * size, 0.76 * size), )
        head.scale = (0.9, 1.25, 0.85)
        part(head, "Head", hide)
        snout = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=8, radius1=0.055 * size, radius2=0.0, depth=0.12 * size, location=(0, 0.52 * size, 0.72 * size), )
        snout.rotation_euler = (math.radians(90), 0, 0)
        part(snout, "Snout", belly)
        eye("EyeL", (0.055 * size, 0.44 * size, 0.8 * size))
        eye("EyeR", (-0.055 * size, 0.44 * size, 0.8 * size))
        tail = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=8, radius=0.03 * size, depth=0.4 * size, location=(0, -0.4 * size, 0.56 * size), )
        tail.rotation_euler = (math.radians(64), 0, 0)
        part(tail, "Tail", hide)
        for leg_i, (lx, ly) in enumerate(((0.1, 0.22), (-0.1, 0.22), (0.1, -0.24), (-0.1, -0.24))):
            upper = prim(scn, bpy.ops.mesh.primitive_cylinder_add, vertices=8, radius=0.032 * size, depth=0.3 * size, location=(lx * size, ly * size, 0.28 * size), )
            part(upper, f"Leg{leg_i + 1}", hide)
            paw = prim(scn, bpy.ops.mesh.primitive_uv_sphere_add, segments=10, ring_count=6, radius=0.045 * size, location=(lx * size, ly * size, 0.05 * size), )
            paw.scale = (1.0, 1.3, 0.6)
            part(paw, f"Paw{leg_i + 1}", accent)
        if dna.get("spines"):
            for k in range(6):
                t = -0.28 + k * 0.11
                spine = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=5, radius1=0.025 * size, radius2=0.0, depth=(0.09 - abs(t) * 0.1) * size, location=(0, t * size, 0.68 * size), )
                part(spine, f"Spine{k + 1}", accent)
        if dna.get("horns"):
            for s_i, sgn in ((1, 1.0), (2, -1.0)):
                horn = prim(scn, bpy.ops.mesh.primitive_cone_add, vertices=6, radius1=0.028 * size, radius2=0.0, depth=0.18 * size, location=(sgn * 0.06 * size, 0.38 * size, 0.92 * size), )
                horn.rotation_euler = (math.radians(-14), 0, sgn * math.radians(24))
                part(horn, f"Horn{s_i}", accent)

    report["parts"] = parts
    return report


# ── v4.1 ASSET LIBRARY: load DESIGNED .blend assets built at design
#    time (bridges/blender/asset_builder.py + the DSH designer loop)
#    instead of rebuilding procedurally per job. Missing files fall
#    back to the v4.0 DNA builders honestly.

def load_blend_objects(bpy, scn, path):
    """Append every object of a library .blend into the current scene.
    Returns the list of newly linked objects (name collisions get
    Blender's .NNN suffix, resolved later by base name)."""
    with bpy.data.libraries.load(path, link=False) as (data_from, data_to):
        data_to.objects = [n for n in data_from.objects]
    new = []
    for ob in bpy.data.objects:
        if ob.users == 0:
            try:
                scn.collection.objects.link(ob)
                new.append(ob)
            except Exception:  # noqa: BLE001
                pass
    return new


def base_name(ob_name):
    """Strip Blender's numeric collision suffix: 'Root.001' -> 'Root'."""
    dot = ob_name.rfind(".")
    if dot > 0 and ob_name[dot + 1:].isdigit():
        return ob_name[:dot]
    return ob_name


def resolve_loaded_figure(new_objects):
    """Rebuild the figure dict from an appended character asset: the
    SAME rig contract build_designed_figure returns, resolved by base
    object name, so apply_pose / lip-sync / camera math work on the
    loaded asset unchanged."""
    by_base = {}
    for ob in new_objects:
        by_base.setdefault(base_name(ob.name), ob)

    def need(key, name):
        ob = by_base.get(name)
        if ob is None:
            return None
        return ob

    figure = {
        "root": need("root", "Root"), "spine": need("spine", "Spine"),
        "head": need("head", "Head"),
        "rShoulder": need("rShoulder", "RShoulder"), "rElbow": need("rElbow", "RElbow"),
        "lShoulder": need("lShoulder", "LShoulder"), "lElbow": need("lElbow", "LElbow"),
        "rHip": need("rHip", "RHip"), "rKnee": need("rKnee", "RKnee"),
        "lHip": need("lHip", "LHip"), "lKnee": need("lKnee", "LKnee"),
        "eyeL": need("eyeL", "EyeL"), "eyeR": need("eyeR", "EyeR"),
        "browL": need("browL", "BrowL"), "browR": need("browR", "BrowR"),
        "mouth": need("mouth", "Mouth"),
        "rThumb": need("rThumb", "RThumb"), "lThumb": need("lThumb", "LThumb"),
        "blade": need("blade", "HandBlade"),
        # THE HAND CLOSES ON THE HILT (iteration 97): an old .blend
        # container predating the pivot loads honestly without it (the
        # follow-through falls back to the legacy blade re-tilt)
        "gripPivot": by_base.get("GripPivot"),
        "headMesh": need("headMesh", "HeadMesh"),
    }
    fingers = {"r": [], "l": []}
    for ob in new_objects:
        base = base_name(ob.name)
        if base.endswith("Index"):
            side = "r" if base.startswith("R") else "l"
            fingers[side].append((ob, True))
        elif "Finger" in base and base.endswith("Mesh") is False and base[-1].isdigit():
            side = "r" if base.startswith("R") else "l"
            fingers[side].append((ob, False))
    figure["rFingers"] = fingers["r"]
    figure["lFingers"] = fingers["l"]
    missing = [k for k, v in figure.items() if v is None and k not in ("headMesh", "blade")]
    if missing:
        return None, missing
    return figure, []


def load_env_asset(bpy, scn, path):
    """Append an environment asset: geometry only arrives (the builder
    never saves lights/cameras), the worker's lighting pass still owns
    the sky. Returns the object count for the honest state report."""
    new = load_blend_objects(bpy, scn, path)
    return len(new)


def shade_hex(h, k):
    """Darken/lighten a hex color by factor k (used for silhouettes)."""
    r, g, b = hex_to_rgb(h)
    return "#{:02x}{:02x}{:02x}".format(
        int(max(0, min(1, r * k)) * 255),
        int(max(0, min(1, g * k)) * 255),
        int(max(0, min(1, b * k)) * 255),
    )


def _comp_set_sock(node, name, value):
    """Set a compositor node's parameter the 5.x way - the params live
    in INPUT SOCKETS now (the old node attributes are gone). Duplicated
    socket names (a color socket + a factor float) resolve by shape:
    the value must be accepted, otherwise the next match is tried."""
    for s in node.inputs:
        if s.name != name:
            continue
        try:
            s.default_value = value
            return True
        except Exception:
            continue
    return False


def _comp_out_sock(node, *names):
    """The first output socket whose name matches (the 5.x nodes
    renamed the classics - a Mix node outputs 'Result'); the first
    socket when nothing matches (shape over name)."""
    for n in names:
        s = node.outputs.get(n)
        if s is not None:
            return s
    return node.outputs[0]


def _comp_in_sock(node, *names):
    """The input-socket twin of _comp_out_sock."""
    for n in names:
        s = node.inputs.get(n)
        if s is not None:
            return s
    return node.inputs[0]


def _comp_rgba_in(node, name):
    """The RGBA input socket by name - the Mix node carries A/B in
    EVERY data type (a float A comes BEFORE the color A in the input
    list), and a color link that lands on the float socket leaves the
    color socket at its default gray - the mix outputs a FLAT CONSTANT
    and the frame washes to it (the iter86 smoke caught the wash)."""
    for s in node.inputs:
        if s.name == name and s.type == "RGBA":
            return s
    return node.inputs[0]


def _comp_rgba_out(node, name):
    """The RGBA output socket by name (the Mix node outputs a Result
    per data type - the color Result is the one the chain reads)."""
    for s in node.outputs:
        if s.name == name and s.type == "RGBA":
            return s
    return node.outputs[0]


def _comp_rgba_set(node, name, value):
    """Set the RGBA input socket's default BY TYPE - the Mix node's
    shape-resolved set lands a 4-tuple on the VECTOR socket first (bpy
    accepts the extra component) and the color socket keeps its gray
    default - the wash the smoke caught."""
    for s in node.inputs:
        if s.name == name and s.type == "RGBA":
            try:
                s.default_value = value
                return True
            except Exception:
                continue
    return False


def _comp_mix(tree, blend, fac):
    """The 5.x mix: ShaderNodeMix in RGBA mode (the CompositorNodeMixRGB
    family is GONE from the compositor). The node READS the VECTOR
    Factor socket in RGBA mode (the float Factor link is ignored - the
    5.2.2 quirk the layer bisect caught), so BOTH Factor sockets carry
    the value. Returns (node, COLOR out_socket)."""
    m = tree.nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    try:
        m.blend_type = blend
    except Exception:
        pass
    for s in m.inputs:
        if s.name == "Factor" and s.type == "VALUE":
            try:
                s.default_value = fac
            except Exception:
                pass
        if s.name == "Factor" and s.type == "VECTOR":
            try:
                s.default_value = (fac, fac, fac)
            except Exception:
                pass
    return m, _comp_rgba_out(m, "Result")


def _comp_mix_factor(m, sock_out):
    """Drive a Mix node's factor from a socket - linked into BOTH the
    float and the vector Factor (the node reads the vector one)."""
    for s in m.inputs:
        if s.name == "Factor" and s.type in ("VALUE", "VECTOR"):
            try:
                m.id_data.links.new(sock_out, s)
            except Exception:
                pass


def build_comp_graph(scn, prof, frames_total):
    """THE FRAME IS FINISHED IN COMP (iteration 86): build the shot's
    compositor graph from its own profile on BOTH modes - the preview
    is the promise: what the measuring loop sees is what ships.

    Chain (every layer defensive, the evidence names the truth):
      RL.Image -> AO grounding -> depth mist -> speed streaks (VecBlur
      over the Vector pass) -> bloom -> light shafts (Glare streaks) ->
      chromatic edge (lens dispersion) -> animated grain (4D noise over
      the frame clock) -> vignette -> LUT color script -> saturation ->
      GroupOutput.

    The AOV passes (mist / vector / ao) are enabled BEFORE the RLayers
    node exists - the pass sockets appear at creation. Returns the
    evidence dict (layers, skipped, aovs); the state reports it
    honestly either way."""
    import bpy  # the worker binds bpy inside worker_run; the direct half may not

    landed, skipped, aovs = [], [], []
    try:
        try:
            vl = scn.view_layers[0]
            for attr, name in (("use_pass_mist", "mist"), ("use_pass_vector", "vector"), ("use_pass_ambient_occlusion", "ao")):
                try:
                    setattr(vl, attr, True)
                    aovs.append(name)
                except Exception:
                    pass
        except Exception:
            pass
        try:
            w = scn.world or bpy.data.worlds.new("AnimeOSWorld")
            scn.world = w
            w.use_nodes = True
            ms = getattr(w, "mist_settings", None)
            if ms is not None:
                ms.use_mist = True
                # the mist lives BEHIND the figure: the CU camera sits 1-2
                # units off the subject, so a 2.0 start fogs the CHARACTER
                # (every identity re-score read a ghost) - the depth fog
                # begins past the subject and owns the far ground only
                ms.start = 6.0
                ms.depth = 18.0
                ms.falloff = "QUADRATIC"
                try:
                    ms.intensity = 1.0
                except Exception:
                    pass
        except Exception:
            pass
        try:
            scn.render.use_compositing = True
        except Exception:
            pass
        # the CPU law: the GPU compositor needs a GL context, and this
        # headless farm (and every render box like it) has none
        try:
            scn.render.compositor_device = "CPU"
        except Exception:
            pass
        # 5.x: the scene's compositor is a CompositorNodeTree on
        # compositing_node_group; 4.x kept Scene.node_tree. The old
        # Composite output node is GONE in 5.x - the output is an
        # interface socket + a NodeGroupOutput node.
        tree = None
        try:
            tree = scn.compositing_node_group
        except Exception:
            tree = None
        if tree is None:
            try:
                tree = scn.node_tree
            except Exception:
                tree = None
        if tree is None:
            tree = bpy.data.node_groups.new("AnimeOSComp", "CompositorNodeTree")
            scn.compositing_node_group = tree
        tree.nodes.clear()
        try:
            if not any(s.name == "Image" and s.in_out == "OUTPUT" for s in tree.interface.items_tree):
                tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        except Exception:
            pass
        rl = tree.nodes.new("CompositorNodeRLayers")
        go = tree.nodes.new("NodeGroupOutput")
        f = prof["factors"]
        lut = COMP_LUTS[prof["lut"]]
        cur = _comp_out_sock(rl, "Image")

        # 1. AO grounding - the contact shadow the floating proxies miss
        #    (the pass is BLURRED first: a 10-sample preview AO is splotch,
        #    and splotch over the whole frame reads as decay, not shadow)
        try:
            ao = rl.outputs.get("Ambient Occlusion")
            if ao is not None:
                abl = tree.nodes.new("CompositorNodeBlur")
                _comp_set_sock(abl, "Size", (10.0, 10.0, 0.0))
                tree.links.new(ao, _comp_in_sock(abl, "Image"))
                m, mo = _comp_mix(tree, "MULTIPLY", 0.18)
                tree.links.new(cur, _comp_rgba_in(m, "A"))
                tree.links.new(_comp_out_sock(abl, "Image"), _comp_rgba_in(m, "B"))
                cur = mo
                landed.append("ao")
        except Exception:
            skipped.append("ao")

        # 2. depth mist - the Z read toward the color script's tint
        #    (the Mix node is lerp(A, B, fac): A = the crisp frame at
        #    fac 0 - the FIGURE - and B = the tint the far field fogs
        #    toward; inverted, the subject wears the fog and the sky
        #    keeps its depth - the wash the layer bisect caught)
        try:
            mist = rl.outputs.get("Mist")
            if mist is not None:
                mr = tree.nodes.new("ShaderNodeMapRange")
                _comp_set_sock(mr, "To Max", round(0.15 + 0.65 * f["mist"], 3))
                tree.links.new(mist, _comp_in_sock(mr, "Value"))
                m, mo = _comp_mix(tree, "MIX", 1.0)
                _comp_rgba_set(m, "B", lut["mistTint"])
                tree.links.new(cur, _comp_rgba_in(m, "A"))
                _comp_mix_factor(m, _comp_out_sock(mr, "Result"))
                cur = mo
                landed.append("mist")
        except Exception:
            skipped.append("mist")

        # 3. speed streaks - the Vector pass over the action beats
        if f["speed"] >= 0.2:
            try:
                vb = tree.nodes.new("CompositorNodeVecBlur")
                _comp_set_sock(vb, "Samples", 4 + int(12 * f["speed"]))
                _comp_set_sock(vb, "Shutter", round(0.15 + 0.4 * f["speed"], 3))
                sp = rl.outputs.get("Vector")
                if sp is not None:
                    tree.links.new(sp, _comp_in_sock(vb, "Speed"))
                tree.links.new(cur, _comp_in_sock(vb, "Image"))
                cur = _comp_out_sock(vb, "Image")
                landed.append("speed")
            except Exception:
                skipped.append("speed")

        # 4. bloom - the energy blades and fx glow
        try:
            g = tree.nodes.new("CompositorNodeGlare")
            _comp_set_sock(g, "Type", "Bloom")
            _comp_set_sock(g, "Threshold", 1.0)
            _comp_set_sock(g, "Size", 8.0)
            _comp_set_sock(g, "Quality", "Medium")
            tree.links.new(cur, _comp_in_sock(g, "Image"))
            cur = _comp_out_sock(g, "Image")
            landed.append("bloom")
        except Exception:
            skipped.append("bloom")

        # 5. light shafts - the glare streaks over the bright sources
        if f["beams"] >= 0.2:
            try:
                g2 = tree.nodes.new("CompositorNodeGlare")
                if _comp_set_sock(g2, "Type", "Streaks"):
                    _comp_set_sock(g2, "Threshold", 0.85)
                    _comp_set_sock(g2, "Streaks", 6)
                    _comp_set_sock(g2, "Streaks Angle", 0.4)
                    _comp_set_sock(g2, "Fade", 0.82)
                    _comp_set_sock(g2, "Size", 8.0)
                    tree.links.new(cur, _comp_in_sock(g2, "Image"))
                    cur = _comp_out_sock(g2, "Image")
                    landed.append("beams")
            except Exception:
                skipped.append("beams")

        # 6. chromatic edge - the lens dispersion at the frame border
        try:
            ld = tree.nodes.new("CompositorNodeLensdist")
            _comp_set_sock(ld, "Dispersion", round(0.12 * f["chroma"], 3))
            tree.links.new(cur, _comp_in_sock(ld, "Image"))
            cur = _comp_out_sock(ld, "Image")
            landed.append("chroma")
        except Exception:
            skipped.append("chroma")

        # 7. grain - 4D noise over the frame clock (crawling, not a
        #    dirty lens: the Time node slides the W slice per frame)
        try:
            nz = tree.nodes.new("ShaderNodeTexNoise")
            try:
                nz.noise_dimensions = "4D"
            except Exception:
                pass
            _comp_set_sock(nz, "Scale", 900.0)
            _comp_set_sock(nz, "Detail", 2.0)
            mr2 = tree.nodes.new("ShaderNodeMapRange")
            _comp_set_sock(mr2, "From Min", 0.35)
            _comp_set_sock(mr2, "From Max", 0.65)
            _comp_set_sock(mr2, "To Min", 0.4)
            _comp_set_sock(mr2, "To Max", 0.6)
            tree.links.new(_comp_out_sock(nz, "Factor"), _comp_in_sock(mr2, "Value"))
            anim = False
            try:
                tm = tree.nodes.new("CompositorNodeTime")
                _comp_set_sock(tm, "Start Frame", 1)
                _comp_set_sock(tm, "End Frame", max(2, int(frames_total)))
                mm = tree.nodes.new("ShaderNodeMath")
                mm.operation = "MULTIPLY"
                mm.inputs[1].default_value = 37.7
                tree.links.new(_comp_out_sock(tm, "Factor"), mm.inputs[0])
                tree.links.new(_comp_out_sock(mm, "Value"), _comp_in_sock(nz, "W"))
                anim = str(getattr(nz, "noise_dimensions", "3D")) == "4D"
            except Exception:
                anim = False
            m, mo = _comp_mix(tree, "OVERLAY", round(0.05 + 0.12 * f["grain"], 3))
            tree.links.new(cur, _comp_rgba_in(m, "A"))
            tree.links.new(_comp_out_sock(mr2, "Result"), _comp_rgba_in(m, "B"))
            cur = mo
            landed.append("grain(animated)" if anim else "grain(static)")
        except Exception:
            skipped.append("grain")

        # 8. vignette - the edge falloff the close framing owns (the
        #    mask multiplies DIRECTLY: white center keeps the figure,
        #    dark edges fall off - inverted, it darkens the SUBJECT)
        try:
            em = tree.nodes.new("CompositorNodeEllipseMask")
            _comp_set_sock(em, "Size", (0.72, 0.72, 0.0))
            bl = tree.nodes.new("CompositorNodeBlur")
            _comp_set_sock(bl, "Size", (18.0, 18.0, 0.0))
            tree.links.new(_comp_out_sock(em, "Value"), _comp_in_sock(bl, "Image"))
            m, mo = _comp_mix(tree, "MULTIPLY", round(0.6 * f["vignette"], 3))
            tree.links.new(cur, _comp_rgba_in(m, "A"))
            tree.links.new(_comp_out_sock(bl, "Image"), _comp_rgba_in(m, "B"))
            cur = mo
            landed.append("vignette")
        except Exception:
            skipped.append("vignette")

        # 9. the color script - the shot's own LUT + its saturation
        try:
            cb = tree.nodes.new("CompositorNodeColorBalance")
            for s in cb.inputs:
                if s.name == "Lift" and s.type == "RGBA":
                    s.default_value = lut["lift"]
                if s.name == "Gain" and s.type == "RGBA":
                    s.default_value = lut["gain"]
            tree.links.new(cur, _comp_in_sock(cb, "Image"))
            cur = _comp_out_sock(cb, "Image")
            landed.append("lut")
            hs = tree.nodes.new("CompositorNodeHueSat")
            _comp_set_sock(hs, "Saturation", lut["sat"])
            tree.links.new(cur, _comp_in_sock(hs, "Image"))
            cur = _comp_out_sock(hs, "Image")
            landed.append("saturation")
        except Exception:
            skipped.append("lut")

        tree.links.new(cur, go.inputs[0])
        if not landed:
            landed = ["skipped: no compositor node landed"]
    except Exception as exc:  # noqa: BLE001
        landed = [f"skipped: {exc}"]
    return {"layers": landed, "skipped": skipped, "aovs": aovs}


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
        # v4.1: library assets for this exact cast + environment (design
        # once, render many). Missing/unreadable files fall back to the
        # procedural builders - every decision lands in the state.
        assets_p = payload.get("assets") if isinstance(payload.get("assets"), dict) else {}
        asset_cast = assets_p.get("cast") if isinstance(assets_p.get("cast"), list) else []
        asset_env = assets_p.get("environment") if isinstance(assets_p.get("environment"), dict) else None

        def try_load_cast_asset(entry):
            if not isinstance(entry, dict):
                return None
            p = entry.get("path")
            if not isinstance(p, str) or not p or not os.path.isfile(p):
                return None
            try:
                loaded = load_blend_objects(bpy, scn, p)
                fig, missing = resolve_loaded_figure(loaded)
                if fig is None:
                    state.setdefault("assetNotes", []).append(
                        f"{entry.get('name', 'cast')}: rig contract incomplete (missing {', '.join(missing[:6])})")
                    return None
                return fig
            except Exception as exc:  # noqa: BLE001
                state.setdefault("assetNotes", []).append(f"{entry.get('name', 'cast')}: load failed: {exc}")
                return None

        state["design"] = {
            "version": "v4.1",
            "figure": hero.get("name") if hero else None,
            "weapon": hero.get("weaponType") if hero else None,
            "set": env.get("name") if env else None,
            "terrain": env.get("terrain") if env else None,
            "cast": [c.get("name") for c in cast],
        }

        # ── the set: library environment asset first, designed DNA
        #    build second, legacy plate last ──
        env_from_asset = False
        if asset_env:
            p = asset_env.get("path")
            if isinstance(p, str) and p and os.path.isfile(p):
                try:
                    env_loaded = load_env_asset(bpy, scn, p)
                    env_from_asset = env_loaded > 0
                    state["setSource"] = f"asset:{asset_env.get('name', 'environment')} ({env_loaded} objects)"
                except Exception as exc:  # noqa: BLE001
                    state["setSource"] = f"asset load failed: {exc}"
            else:
                state["setSource"] = "asset file missing - procedural set"
        if not env_from_asset:
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

        # ── v5.0/v6.0: DESIGNED props and creatures named by the shot
        #    text ride the payload and load as real library assets at a
        #    deterministic foreground line (never stacked, never boxes).
        #    A performing asset arrives with its own armature + baked
        #    Action: the ROOT objects (the rig, not the bone-bound
        #    meshes) anchor to the prop line so the bone bindings
        #    survive, and the shot plays the designed performance. ──
        asset_props = assets_p.get("props") if isinstance(assets_p.get("props"), list) else []
        props_loaded = []
        props_animated = []
        # v9.0: name -> anchor empty, so the physics pass can KNOCK a
        # riding prop by its designed name (real prop interaction)
        prop_anchors = []
        for k, entry in enumerate(asset_props):
            if not isinstance(entry, dict):
                continue
            p = entry.get("path")
            if not isinstance(p, str) or not p or not os.path.isfile(p):
                state.setdefault("assetNotes", []).append(f"{entry.get('name', 'prop')}: file missing - skipped honestly")
                continue
            try:
                before = set(scn.objects)
                load_blend_objects(bpy, scn, p)
                fresh = [o for o in scn.objects if o not in before and o.type in ("MESH", "ARMATURE")]
                if not fresh:
                    continue
                fresh_set = set(fresh)
                # only ROOT objects get anchored: reparenting a
                # bone-bound mesh would sever its rig binding
                roots = [o for o in fresh if o.parent is None or o.parent not in fresh_set]
                has_perf = any(o.type == "ARMATURE" and o.animation_data and o.animation_data.action
                               for o in fresh)
                # one empty anchors the asset group so placement is
                # deterministic and the pieces move as one
                parent = bpy.data.objects.new(f"PropAnchor{k + 1}", None)
                scn.collection.objects.link(parent)
                for r in roots:
                    r.parent = parent
                ang = (k - (len(asset_props) - 1) / 2) * 0.7
                parent.location = (math.sin(ang) * 2.6, -1.9 - (k % 2) * 0.9, 0.0)
                parent.rotation_euler = (0.0, 0.0, math.radians(-12 + k * 14))
                props_loaded.append(str(entry.get("name", f"prop{k + 1}")))
                prop_anchors.append({"name": str(entry.get("name", f"prop{k + 1}")), "empty": parent})
                if has_perf:
                    props_animated.append(str(entry.get("name", f"prop{k + 1}")))
            except Exception as exc:  # noqa: BLE001
                state.setdefault("assetNotes", []).append(f"{entry.get('name', 'prop')}: load failed: {exc}")
        if props_loaded:
            state["propsLoaded"] = props_loaded
        if props_animated:
            state["propsAnimated"] = props_animated

        # ── subject: the DESIGNED hero when cast DNA arrived (posed or
        #    standing), the legacy stand-in on pose shots without DNA,
        #    the plinth + floating blade otherwise ──
        pose_start = normalize_pose(shot.get("poseStart"))
        pose_end = normalize_pose(shot.get("poseEnd"))
        # ── v5.3 DIRECTED MOTION GRAMMAR: a shot that arrives with a
        #    grammar is played BEAT BY BEAT - the camera performs each
        #    beat in its own local time and crossfades into the next,
        #    and a beat's own pose pair moves the SUBJECT with the
        #    lens. A corrupt grammar degrades honestly to the whole-
        #    clip movement (normalize_grammar returns None). ──
        grammar = normalize_grammar(shot.get("grammar"))
        if grammar:
            state["grammar"] = {
                "beats": len(grammar),
                "moves": [b["move"] for b in grammar],
                "beatPoses": sum(1 for b in grammar if normalize_pose(b.get("poseStart")) or normalize_pose(b.get("poseEnd"))),
                "windBeats": sum(1 for b in grammar if b.get("wind")),
            }
        # ── THE SHOTDIRECTIVE COMPILER (iteration 98): the worker
        #    re-compiles the directive from the ARRIVED payload and
        #    names BOTH hashes - the arrived wire is what the studio
        #    compiled, or the mismatch names itself. The payload
        #    without a hash (a legacy driver) still names its own
        #    derivation, honestly unmatched. ──
        _d_hash = shot_directive_hash(shot)
        _d_expected = shot.get("directiveHash")
        state["shotDirective"] = {
            "hash": _d_hash,
            "expected": _d_expected,
            "match": True if _d_expected is None else (_d_hash == _d_expected),
            "lawVersion": SHOT_DIRECTIVE_VERSION,
            "sections": shot_directive_sections(shot),
        }
        figure = None
        eclip = None  # THE FACE PERFORMS THE BEAT: the hero's clip (None = pose-driven)
        speech_visemes = parse_speech(shot)
        state["posesRequested"] = [str(shot.get("poseStart")), str(shot.get("poseEnd"))]
        state["posesResolved"] = [pose_start, pose_end]
        state["scriptMtime"] = os.path.getmtime(__file__)
        state["speech"] = (
            {
                "lines": int((shot.get("speech") or {}).get("lines", 0) or 0),
                "visemes": len(speech_visemes),
                # THE MOUTH SPEAKS IN THE MESH (iteration 92): the mesh
                # half's evidence rides beside the counts - the speech
                # keys, the program sampled at the identity clock with
                # the mesh weights per sample, and the DETERMINISTIC
                # hash (one law, two runtimes, bit-exact)
                "mesh": speech_mesh_evidence(speech_visemes, duration_sec),
            }
            if speech_visemes
            else None
        )
        if hero:
            # THE SURFACE IS GRADED, NOT PAINTED (iteration 83): every
            # material is a layered surface built from its dye - the
            # sheet read's own hexes grade the likeness (an adherent
            # build rides its compiled profile; a payload without one
            # keeps the neutral grade, honestly named)
            mprof = material_profile(hero)
            # THE SKIN IS ALIVE (iteration 91): the hex's own subsurface
            # + coat depth rides the skin tree at EVERY framing (the
            # skin answers the body, not the lens)
            sdep = skin_depth(hero)
            energy_hex = hero.get("bladeColor") or "#5eead4"
            hero_mats = {
                "robe": graded_mat(bpy, "cloth", "RobeMat", hero.get("robeColor", "#2f6d63"), mprof),
                "accent": graded_mat(bpy, "cloth", "AccentMat", hero.get("robeAccent", "#a8842c"), mprof),
                "skin": graded_mat(bpy, "skin", "SkinMat", hero.get("skinTone", "#d9b48f"), mprof, sdepth=sdep),
                "hair": graded_mat(bpy, "hair", "HairMat", hero.get("hairColor", "#16161d"), mprof),
                "blade": emission_mat(bpy, "BladeMat", energy_hex, 2.0 + float(scene_p.get("energyIntensity", 0.6)) * 8.0),
                "boots": graded_mat(bpy, "cloth", "BootsMat", "#241a12", mprof),
            }
            # v4.1: the library asset IS the designed character when one
            # exists - built once at design time, loaded here with the
            # same rig contract; materials come with it
            figure = try_load_cast_asset(asset_cast[0] if asset_cast else None)
            if figure is not None:
                state["figureSource"] = f"asset:{hero.get('name', 'cast')}"
            else:
                # THE HAIR IS GROOMED (iteration 85): the framing owns
                # the strand pass - close framings carry the full
                # groom, wide framings keep the volumes
                figure = build_designed_figure(bpy, scn, hero, hero_mats,
                                               strand_f=groom_strand_factor(str(shot.get("shotType") or "")))
                state["figureSource"] = "procedural:v4.0-designed"
            state["rig"] = {
                "version": "v4.1" if state.get("figureSource", "").startswith("asset") else "v4.0-designed",
                "face": True, "hands": True,
                "eyes": 2, "brows": 2, "fingers": 10,
                "faceChannels": FACE_CHANNELS,
                "hairStyle": str(hero.get("hairStyle") or "short"),
                "weapon": str(hero.get("weaponType") or "none"),
            }
            # THE SILHOUETTE SHAPES THE MESH: the build's applied shaping
            # evidence rides the render state (a guess build reports none)
            if isinstance(figure, dict) and figure.get("silhouette"):
                state["rig"]["silhouette"] = figure["silhouette"]
            # THE FACE IS SCULPTED, NOT ASSEMBLED: the head sculpt's
            # applied evidence rides the state too (family, factors,
            # the sculpted hair parts, the vertex count)
            if isinstance(figure, dict) and figure.get("sculpt"):
                state["rig"]["sculpt"] = figure["sculpt"]
            # THE SURFACE IS GRADED, NOT PAINTED: the material grade's
            # evidence rides the state too (the clamped profile, the
            # fields the sheet read owns, the deterministic hash)
            state["rig"]["materials"] = materials_evidence(mprof)
            # THE SKIN IS ALIVE: the depth's evidence rides the state too
            # (the clamped factors, the fields the hex owns, the
            # deterministic hash - hash-proven on both sides of the wire)
            state["rig"]["skinDepth"] = skin_depth_evidence(sdep)
            state["rig"]["skinDepthLine"] = skin_depth_line(sdep)
            # THE CHARACTER IS ONE ASSET (iteration 95): the master
            # hash rides the state - the manifest's canonical key
            # covers the WIRE TRUTH only, so the same hash stands at
            # every framing (the lens resolves the asset, it never
            # rewrites it); the per-shot resolutions (the strand
            # tier, the worn bake, the curve evidence) ride beside
            # as the rig's own evidence fields, never inside the key.
            state["rig"]["asset"] = {
                "name": _ka_st(hero.get("name")),
                "hash": character_asset_hash(hero),
                "sections": list(CHARACTER_ASSET_SECTIONS),
                "lawVersion": 95,
            }
            # THE FEET STAY PLANTED (iteration 96): the leg IK's law
            # evidence rides the state - the deterministic hash over
            # the whole vocabulary's solves (mirrored in leg-ik.ts,
            # one law two runtimes), the per-pose table (the
            # penetration the readings named, before and after, the
            # fold law per pose) - the frame aggregates land after
            # the loop (the applied report).
            state["rig"]["legIk"] = {
                "hash": leg_ik_hash(),
                "lawVersion": LEG_IK_VERSION,
                "kneeMax": LEG_IK_KNEE_MAX,
                "table": leg_ik_table(),
            }
            # THE HAND CLOSES ON THE HILT (iteration 97): the grip's
            # law evidence rides the state - the kind, the hand, the
            # anchor, the deterministic hash (mirrored in grip.ts, one
            # law two runtimes); the contact itself is structural (the
            # pivot at the anchor) - a payload naming no weapon grips
            # nothing, honestly
            state["rig"]["grip"] = {
                "kind": str(hero.get("weaponType") or "none"),
                "hand": "R",
                "anchor": list(GRIP_ANCHOR),
                "hash": grip_hash(),
                "lawVersion": GRIP_LAW_VERSION,
                "contact": isinstance(figure, dict) and figure.get("gripPivot") is not None,
            }
            # THE FACE PERFORMS THE BEAT (iteration 84): the shot's own
            # expression clip rides the state too - the emotion, the
            # timing, the shape keys it drives, the blended weights at
            # the pose-matched sample fractions and the deterministic
            # hash (a payload without a clip leaves it honestly None:
            # the face stays pose-driven exactly as previous iterations
            # built it)
            eclip = expression_clip(shot)
            state["rig"]["expression"] = expression_evidence(eclip, duration_sec) if eclip else None
            # THE HAIR IS GROOMED (iteration 85): the strand detail's
            # evidence rides the state too (strands, flyaways, the LOD
            # the framing earned, the clamped factors, the hash)
            if isinstance(figure, dict) and figure.get("groom"):
                state["rig"]["groom"] = figure["groom"]
            # THE HAIR IS TRUE CURVES (iteration 89) + THE STRANDS
            # GO HERO (iteration 94): the curve detail's evidence
            # rides the state too (the curves grown, the points, the
            # tier, the hero flyaways, the curve hash; None when the
            # wide LOD kept the mesh cards - honest)
            if isinstance(figure, dict) and figure.get("hairShade"):
                state["rig"]["hairShade"] = figure["hairShade"]
            if isinstance(figure, dict) and figure.get("hairCurves"):
                state["rig"]["hairCurves"] = figure["hairCurves"]

            # ── v10.1 THE SHEET DRESSES THE RENDER + iteration 80: the
            #    canonical model sheet is COLOR LAW over the DNA defaults
            #    for EVERY detected cast member - the payload's planned
            #    pulls recolor the named materials whether the figure was
            #    built procedurally or loaded as the designed asset (the
            #    hero's materials carry plain names, the second figure's
            #    carry the B suffix: RobeMatB/AccentMatB/HairMatB/BootsMatB).
            #    The recipes' other parameters stay untouched. Skipped
            #    rows are named honestly in the per-member identity state. ──
            cast_p = shot.get("cast") or []
            for cast_idx in range(min(len(cast_p), 2)):
                conf = cast_p[cast_idx].get("sheetConformance") if isinstance(cast_p[cast_idx], dict) else None
                if not (isinstance(conf, dict) and conf.get("rows")):
                    continue
                suffix = "" if cast_idx == 0 else "B"
                applied, skipped = [], []
                for row in conf["rows"]:
                    if not isinstance(row, dict):
                        continue
                    mat_name = str(row.get("mat") or "") + suffix
                    mat = bpy.data.materials.get(mat_name)
                    if mat is None:
                        skipped.append({"mat": mat_name, "skipped": "no such material on the stage"})
                        continue
                    # THE SURFACE IS GRADED (iteration 83): a graded
                    # material's DYE re-sets (the whole tree rebuilds
                    # from the new hex - one law, one dye); a legacy
                    # flat material recolors its Base Color as before.
                    if not regrade_material(mat, str(row.get("to") or "#000000")):
                        skipped.append({"mat": mat_name, "skipped": "no principled node"})
                        continue
                    if row.get("skipped"):
                        skipped.append({"mat": mat_name, "skipped": str(row.get("skipped"))})
                    else:
                        applied.append({
                            "mat": mat_name,
                            "from": row.get("from"),
                            "to": row.get("to"),
                            "delta": round(float(row.get("delta") or 0.0), 3),
                        })
                if applied or skipped:
                    state["identity" if cast_idx == 0 else "identityB"] = {
                        "sheet": conf.get("characterName"),
                        "palette": conf.get("palette") or [],
                        "conformed": applied,
                        "skipped": skipped,
                        "law": conf.get("note") or "the sheet is color law over the DNA defaults; recipe parameters untouched",
                    }
            # a second detected character stands off across the set,
            # facing the hero (static stance - blocking depth)
            if len(cast) > 1:
                other = cast[1]
                other_rig = try_load_cast_asset(asset_cast[1] if len(asset_cast) > 1 else None)
                if other_rig is None:
                    other_mprof = material_profile(other)
                    other_sdep = skin_depth(other)
                    other_mats = {
                        "robe": graded_mat(bpy, "cloth", "RobeMatB", other.get("robeColor", "#4a5560"), other_mprof),
                        "accent": graded_mat(bpy, "cloth", "AccentMatB", other.get("robeAccent", "#a8842c"), other_mprof),
                        "skin": graded_mat(bpy, "skin", "SkinMatB", other.get("skinTone", "#d9b48f"), other_mprof, sdepth=other_sdep),
                        "hair": graded_mat(bpy, "hair", "HairMatB", other.get("hairColor", "#16161d"), other_mprof),
                        "blade": hero_mats["blade"],
                        "boots": graded_mat(bpy, "cloth", "BootsMatB", "#241a12", other_mprof),
                    }
                    other_rig = build_designed_figure(bpy, scn, other, other_mats,
                                                      strand_f=groom_strand_factor(str(shot.get("shotType") or "")))
                    state["secondFigureSource"] = "procedural:v4.0-designed"
                    # the second figure's shaping rides the state too
                    if isinstance(other_rig, dict) and other_rig.get("silhouette"):
                        state["secondFigureSilhouette"] = other_rig["silhouette"]
                    # the second figure's head sculpt rides the state too
                    if isinstance(other_rig, dict) and other_rig.get("sculpt"):
                        state["secondFigureSculpt"] = other_rig["sculpt"]
                    # the second figure's material grade rides the state too
                    state["secondFigureMaterials"] = materials_evidence(other_mprof)
                    # the second figure's skin depth rides the state too
                    state["secondFigureSkinDepth"] = skin_depth_evidence(other_sdep)
                    # the second figure's groom rides the state too
                    if isinstance(other_rig, dict) and other_rig.get("groom"):
                        state["secondFigureGroom"] = other_rig["groom"]
                else:
                    state["secondFigureSource"] = f"asset:{other.get('name', 'cast')}"
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
                # THE FEET STAY PLANTED (iteration 96): the same law
                # evidence the hero carries - the stand-in's legs ride
                # the identical chain constants and the identical solve
                "legIk": {
                    "hash": leg_ik_hash(),
                    "lawVersion": LEG_IK_VERSION,
                    "kneeMax": LEG_IK_KNEE_MAX,
                    "table": leg_ik_table(),
                },
                # THE HAND CLOSES ON THE HILT (iteration 97): the
                # stand-in's energy blade grips by the same law
                "grip": {
                    "kind": "blade",
                    "hand": "R",
                    "anchor": list(GRIP_ANCHOR),
                    "hash": grip_hash(),
                    "lawVersion": GRIP_LAW_VERSION,
                    "contact": True,
                },
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

        # ── v7.2 SECONDARY MOTION RIG: the hero's cloth and hair hang
        #    from pivots and will ride the grammar beats (or the shot's
        #    single move) through the frame loop below ──
        sec_chains = build_secondary_rig(bpy, scn, figure) if figure else []
        if sec_chains:
            state["secondary"] = {
                "chains": len(sec_chains),
                "cloth": sum(1 for c in sec_chains if c["kind"] in ("CLOTH", "SKIRT")),
                "hair": sum(1 for c in sec_chains if c["kind"] == "HAIR"),
            }

        # ── v10.0 SOLVER-GRADE CLOTH: THE CLOTH IS SOLVED - the hero's
        #    cloth parts graduate from the spring pivots to the REAL
        #    Blender cloth solver (the probe's law); hair keeps the
        #    springs. The air model drives the parts' anchor bones per
        #    frame and the solver answers with real folds and lag. ──
        cloth_rig = None
        # v10.1 THE SOLVER ANSWERS THE CALL: the shot's CLOTH call (a
        # number 0..1) scales the solver's ANSWER - the directed air,
        # the beat impulse, the stagger sway - never its physics.
        # Absent = 1.0, the full probed response; a corrupt value
        # degrades honestly to the full response.
        cloth_call = shot.get("cloth")
        cloth_intensity = 1.0
        cloth_called = False
        if isinstance(cloth_call, (int, float)) and not isinstance(cloth_call, bool):
            cloth_intensity = max(0.0, min(1.0, float(cloth_call)))
            cloth_called = True
        # v12.0 THE CLOTH IS DIRECTED: the shot's own words compiled a
        # bounded directive (cloth-directive.ts); the worker re-clamps
        # it (one law, two runtimes) and the solver answers it - the
        # garment class re-tunes the physics, the heading steers the
        # air, the turbulence scatters the panels. Absent = the probed
        # house air, honestly named.
        cloth_dir = cloth_directive(shot)
        # v13.0 THE CAMERA CHOREOGRAPHS THE DRAMA: the shot's own words
        # compiled a bounded choreo (camera-choreo.ts); the worker
        # re-clamps it (one law, two runtimes) and layers it onto
        # WHATEVER aims the lens - the push-in/pull-out dolly, the
        # dutch tilt, the handheld breath, the cut-in whip. Absent =
        # the steady house camera, honestly named.
        cam_choreo = camera_choreo(shot)
        if cam_choreo:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import camera_choreo as camera_choreo_pass
        if sec_chains and figure:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import cloth_pass
            cloth_rig = cloth_pass.build_cloth_rig(bpy, scn, figure, sec_chains, frames_total, directive=cloth_dir)
            if cloth_rig is not None:
                simmed = [p["name"] for p in cloth_rig["parts"]]
                springs = [c["piv"].name.replace("SecPiv_", "") for c in sec_chains if not c.get("sim")]
                solver = {
                    "cloth": "blender-cloth-sim" if simmed else "damped-spring",
                    "hair": "damped-spring",
                    "simmed": simmed,
                    "springs": springs,
                }
                if cloth_called:
                    solver["clothCall"] = round(cloth_intensity, 3)
                if cloth_dir is not None:
                    solver["directive"] = {
                        "heading": cloth_dir["heading"],
                        "strength": cloth_dir["strength"],
                        "turbulence": cloth_dir["turbulence"],
                        "garment": cloth_dir["garment"],
                        "collision": cloth_dir["collision"],
                        "fields": list(cloth_dir["fields"]),
                        "hash": cloth_dir["hash"],
                        "line": cloth_directive_line(cloth_dir),
                    }
                if cloth_rig["notes"]:
                    solver["notes"] = list(cloth_rig["notes"])
                state.setdefault("secondary", {"chains": len(sec_chains)})["solver"] = solver

        # ── v11.0 SOLVER-GRADE FLESH: THE FLESH LAGS THE BEAT - the
        #    figure's trunk and face volumes graduate from rigid
        #    geometry to the REAL Blender soft-body solver (the probe's
        #    law): the directed air steers each region's anchor bone
        #    and the solver answers with real inertia lag, overshoot
        #    and settle. ──
        flesh_rig = None
        # v11.1 THE SOLVER ANSWERS THE CALL: the shot's FLESH call (a
        # number 0..1) scales the solver's ANSWER - the beat impulse,
        # the stagger sway, the wind breath - never its physics.
        # Absent = 1.0, the full probed response; a corrupt value
        # degrades honestly to the full response.
        flesh_call = shot.get("flesh")
        flesh_intensity = 1.0
        flesh_called = False
        if isinstance(flesh_call, (int, float)) and not isinstance(flesh_call, bool):
            flesh_intensity = max(0.0, min(1.0, float(flesh_call)))
            flesh_called = True
        if figure:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import flesh_pass
            flesh_rig = flesh_pass.build_flesh_rig(bpy, scn, figure, frames_total)
            if flesh_rig is not None:
                fsolver = state.setdefault("secondary", {}).setdefault("solver", {})
                fsimmed = [p["name"] for p in flesh_rig["parts"]]
                if fsimmed:
                    fsolver["flesh"] = "blender-softbody-sim"
                    fsolver["fleshSimmed"] = fsimmed
                if flesh_called:
                    fsolver["fleshCall"] = round(flesh_intensity, 3)
                if flesh_rig["notes"]:
                    merged = list(fsolver.get("notes") or [])
                    for n in flesh_rig["notes"]:
                        if n not in merged:
                            merged.append(n)
                    fsolver["notes"] = merged

        # ── v8.0 DIRECTED FX: THE BEATS IGNITE - the world answers the
        #    grammar with the same clock. Programs normalize honestly
        #    (a bad note is skipped with a note, never a crash), the
        #    rig compiles into real emissive objects, and the frame
        #    loop below drives them per frame. ──
        fx_rig = None
        fx_programs = []
        fx_raw = shot.get("fx")
        if isinstance(fx_raw, list) and fx_raw:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import fx_pass
            fx_programs, fx_notes = fx_pass.normalize_fx(fx_raw, len(grammar) if grammar else 1)
            if fx_programs:
                fx_rig = fx_pass.build_fx_rig(bpy, scn, fx_programs, figure,
                                              (hero or {}).get("bladeColor") or "#5eead4", job_id)
                state["fx"] = {
                    "programs": len(fx_programs),
                    "kinds": fx_rig["kinds"],
                    "boundBeats": sorted(fx_rig["all_bound"]),
                }
                all_notes = fx_notes + fx_rig["notes"]
                if all_notes:
                    state["fx"]["notes"] = all_notes

        # ── v9.0 DIRECTED PHYSICS: THE WORLD OBEYS ITS OWN LAW - the
        #    solid world answers the beats through real ballistics.
        #    Programs normalize honestly (a bad note is skipped with a
        #    note, never a crash), the rig compiles into real rigid
        #    bodies (a KNOCK strikes a riding prop by name when one
        #    rides), and the frame loop below integrates them under
        #    the probed law. ──
        phys_rig = None
        phys_programs = []
        phys_raw = shot.get("physics")
        if isinstance(phys_raw, list) and phys_raw:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import physics_pass
            phys_programs, phys_notes = physics_pass.normalize_physics(phys_raw, len(grammar) if grammar else 1)
            if phys_programs:
                phys_rig = physics_pass.build_physics_rig(bpy, scn, phys_programs, figure,
                                                          prop_anchors, job_id)
                state["physics"] = {
                    "programs": len(phys_programs),
                    "kinds": phys_rig["kinds"],
                    "boundBeats": sorted(phys_rig["all_bound"]),
                }
                phys_all = phys_notes + phys_rig["notes"]
                if phys_all:
                    state["physics"]["notes"] = phys_all

        # ── v12.0 KEYFRAME CHOREOGRAPHY: THE PERFORMANCE IS KEYED - the
        #    body performs the PROGRAM (anticipation / strike / hold /
        #    follow-through) instead of sliding between two poses, the
        #    impact frame flares a real light and punches the camera,
        #    the striking limb smears on the fastest frames. The keys
        #    own the body; the grammar still owns the lens, the
        #    solvers still answer the velocity. ──
        choreo_prog = None
        choreo_raw = shot.get("choreo")
        if isinstance(choreo_raw, dict):
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import choreography_pass
            choreo_prog, choreo_err = choreography_pass.normalize_choreo(choreo_raw)
            if choreo_prog:
                ch_impacts = choreography_pass.impact_frames(choreo_prog, frames_total) if frames_total else []
                choreo_flash = choreography_pass.build_impact_light(bpy, scn, choreo_prog)
                if choreo_prog.get("impact") and not choreo_flash:
                    ch_impacts = []
                state["choreo"] = {
                    "name": str(choreo_raw.get("name") or "inline program")[:48],
                    "keys": len(choreo_prog["keys"]),
                    "poseKeys": [k["pose"] for k in choreo_prog["keys"]],
                    "segments": len(choreo_prog["keys"]) - 1,
                    "impactFrames": ch_impacts,
                    "punch": choreo_prog["impact"]["punch"] if choreo_prog.get("impact") else 0.0,
                }
            else:
                state["choreoNote"] = f"choreo refused: {choreo_err} - the plain two-pose path performs"

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
        # v10.1: the FINAL frame reads like a room - real interreflection
        # (the zero-bounce look flattened every material into plastic);
        # PREVIEW keeps the fast flat path unchanged
        if mode == "FINAL":
            scn.cycles.max_bounces = 4
            scn.cycles.diffuse_bounces = 2
            scn.cycles.glossy_bounces = 3
            scn.cycles.transmission_bounces = 2
            scn.cycles.transparent_max_bounces = 4
        else:
            scn.cycles.max_bounces = 0
            scn.cycles.diffuse_bounces = 0
            scn.cycles.glossy_bounces = 0
            scn.cycles.transmission_bounces = 0
            scn.cycles.transparent_max_bounces = 0
        state["render"] = {"samples": 48 if mode == "FINAL" else 10, "bounces": 4 if mode == "FINAL" else 0}

        # ── THE FRAME IS FINISHED IN COMP (iteration 86): every mode
        #    leaves the compositor finished - the shot's own drama
        #    compiled the profile (comp.ts -> the payload's shot.comp;
        #    a payload without one keeps the house defaults) and the
        #    PREVIEW carries the SAME graph the FINAL ships: the
        #    preview is the promise - what the measuring loop sees is
        #    what ships (iteration 73's "PREVIEW stays raw" is
        #    superseded by law: a comp the loop cannot measure is a
        #    comp that never happened).
        comp = comp_profile(shot)
        comp_ev = build_comp_graph(scn, comp, frames_total)
        state["render"]["comp"] = {
            "mode": mode,
            "source": "shot wire" if comp["named"] else "house defaults",
            "profile": {**comp["factors"], "lut": comp["lut"]},
            "fields": comp["fields"],
            "hash": comp_hash(comp),
            "layers": comp_ev["layers"],
            "skipped": comp_ev["skipped"],
            "aovs": comp_ev["aovs"],
        }
        # the legacy grade line (iteration 73's evidence) stays honest
        state["render"]["grade"] = comp_ev["layers"]

        # ── v13.0 THE CAMERA CHOREOGRAPHS THE DRAMA: the evidence names
        #    what the drama asked of the lens and what the camera did
        #    (the max travel, the max roll) - a payload without a choreo
        #    keeps the steady house camera honestly ──
        if cam_choreo is not None:
            state["render"]["camera"] = {
                "mode": mode,
                "source": "shot wire",
                "profile": {k: cam_choreo[k] for k in ("pushIn", "pullOut", "dutch", "handheld", "whip")},
                "fields": list(cam_choreo["fields"]),
                "hash": cam_choreo["hash"],
                "line": camera_choreo_line(cam_choreo),
                "physics": {"dollyUnits": camera_choreo_pass.DOLLY_UNITS, "dutchDeg": camera_choreo_pass.DUTCH_DEG,
                            "wobbleUnits": camera_choreo_pass.WOBBLE_UNITS, "whipDeg": camera_choreo_pass.WHIP_DEG},
            }
        else:
            state["render"]["camera"] = {
                "mode": mode,
                "source": "steady house camera",
                "profile": None,
                "fields": [],
                "hash": None,
            }

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
        choreo_max_smear = 0.0
        for f in range(1, frames_total + 1):
            t = (f - 1) / max(1, frames_total - 1)
            if grammar:
                pos, target, lens = grammar_camera_pose(shot, scene_p, grammar, t)
                g_start, g_end, g_t = grammar_pose_state(grammar, shot, t)
                pose_t = g_t if g_t is not None else t
                pose_s, pose_e = (g_start or pose_start), (g_end or pose_end)
            else:
                pos, target, lens = camera_pose(shot, scene_p, t)
                pose_t, pose_s, pose_e = t, pose_start, pose_end
            if choreo_prog:
                # THE PERFORMANCE IS KEYED: the program owns the body
                # this frame (the lens stays the grammar's)
                pose_s, pose_e, pose_t = choreography_pass.pose_state_at(choreo_prog, t)
            cam.data.lens = lens
            cam.location = mathutils.Vector(pos)
            direction = mathutils.Vector(target) - cam.location
            cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
            if choreo_prog:
                # the impact frame's decaying camera punch + the strike
                # light's energy (after the grammar aims the lens - the
                # kick rides on top)
                choreography_pass.apply_impact(choreo_prog, cam, choreo_flash, f, frames_total)

            t_sec = (f - 1) / fps
            if cam_choreo:
                # v13.0 the drama rides the aimed lens (after the punch:
                # the choreo is the shot's own breath, the punch the
                # strike's kick - both bounded, both deterministic)
                camera_choreo_pass.apply_choreo(cam, cam_choreo, t, t_sec, direction)
            if figure:
                apply_pose(figure, pose_s, pose_e, pose_t, t_sec,
                           speech=speech_open_at(speech_visemes, t_sec * 1000.0) if speech_visemes else None,
                           expr=expression_at(eclip, t_sec, duration_sec) if eclip else None)
                if choreo_prog:
                    # the smear rides AFTER the pose call (the pose sets
                    # rotations; the smear stretches the limb on top)
                    s = choreography_pass.apply_smear(choreo_prog, figure, f, frames_total)
                    if s > choreo_max_smear:
                        choreo_max_smear = s
            # v8.0: THE WORLD ANSWERS THE BEATS - the burst lands where
            # the cut lands, the trail flares with the pose velocity,
            # the aura breathes with the beat's wind call, the motes
            # drift. The pose velocity mirrors the springs' own drag
            # measure (the eased pose row's rate of change).
            # v9.0: the beat context is computed ONCE per frame - the
            # fx AND the physics answer the same clock.
            fbi, fwind, fx_vel = -1, 0.0, 0.0
            if grammar:
                fbi, fbeat = _beat_at(grammar, t)
                fwind = float(fbeat.get("wind") or 0.0)
            if (fx_rig or phys_rig) and (pose_s or pose_e):
                fx_row = lerp_pose(pose_s or "STANCE", pose_e or "STANCE", pose_t)
                if fx_rig and fx_rig["prev_row"] is not None and fps > 0:
                    fx_vel = sum(abs(fx_row[i] - fx_rig["prev_row"][i]) for i in range(12)) * fps
                if fx_rig:
                    fx_rig["prev_row"] = fx_row
            # v9.1: THE WORLD OBEYS ITS OWN LAW - the same beat clock
            # and the same wind the camera, the springs and the fx
            # answer: a bound beat's entry strikes the knock, kicks
            # the debris and kicks the lantern; the lantern rides the
            # wind call the cloth hangs from. The REACTION law runs
            # BEFORE the cloth so the body's stagger is published
            # (figure["_stagger"]) the SAME frame the robes read it -
            # the body moves and the cloth answers, never a frame late.
            if phys_rig:
                physics_pass.apply_physics(phys_rig, t, t_sec, 1.0 / fps, fbi, fwind, fx_vel, f)
            fagit = MOVE_ENERGY.get(fbeat["move"], 0.3) if grammar else MOVE_ENERGY.get(str(shot.get("movement") or "STATIC").upper(), 0.25)
            if figure:
                # v7.2: cloth and hair RIDE THE BEATS - the active beat's
                # wind call and pose changes drive the spring chains,
                # and a directed REACTION's stagger whips them with the body
                apply_secondary_motion(figure, sec_chains, grammar, shot,
                                       t, t_sec, 1.0 / fps, pose_s, pose_e, pose_t)
            if cloth_rig and cloth_rig["parts"]:
                # v10.0: THE CLOTH IS SOLVED - the same air steers the
                # simmed parts' anchor bones; the solver weaves the cloth.
                # v10.1: the shot's CLOTH call scales the answer.
                sec_kick = float(((figure.get("_sec") or {}).get("last_kick")) or 0.0) if figure else 0.0
                cloth_pass.apply_cloth_frame(cloth_rig, figure, t_sec, 1.0 / fps,
                                             fbi, fwind, fagit, sec_kick, cloth_intensity,
                                             directive=cloth_dir)
            if flesh_rig and flesh_rig["parts"]:
                # v11.0: THE FLESH LAGS THE BEAT - the same inputs steer
                # the flesh regions' anchor bones one solver up; the
                # soft-body solver weaves the lag. v11.1: the shot's
                # FLESH call scales the answer.
                sec_kick = float(((figure.get("_sec") or {}).get("last_kick")) or 0.0) if figure else 0.0
                flesh_pass.apply_flesh_frame(flesh_rig, figure, t_sec, 1.0 / fps,
                                             fbi, fwind, fagit, sec_kick, flesh_intensity)
            if fx_rig:
                fx_pass.apply_fx(fx_rig, t, t_sec, 1.0 / fps, fbi, fwind, fx_vel)
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

        # THE FEET STAY PLANTED (iteration 96): what the IK actually
        # did this render - the frames it solved, the deepest sole it
        # caught before the solve, the widest knee move it asked of
        # the pose table, the root lift it applied and any residual
        # it had to name (honest evidence: a still STANCE frame
        # reports zeros - nothing penetrated)
        if isinstance(figure, dict) and figure.get("_legik"):
            _la = figure["_legik"]
            _lr = (state.setdefault("rig", {}).get("legIk") or None)
            if _lr is not None:
                _lr["applied"] = {
                    "frames": _la["frames"],
                    "solvedFrames": _la["solvedFrames"],
                    "maxPenBefore": round(_la["maxPenBefore"], 3),
                    "maxKneeDelta": round(_la["maxKneeDelta"], 3),
                    "maxRootLift": round(_la["maxRootLift"], 3),
                    "maxResidual": round(_la["maxResidual"], 3),
                }

        # secondary motion report: the chains that rode the beats and
        # how far they actually swung (a flat 0.0 means something is
        # wrong with the rig - report it, never hide it)
        if sec_chains and figure.get("_sec"):
            st = figure["_sec"]
            rep = state.setdefault("secondary", {"chains": len(sec_chains)})
            rep["windBeats"] = sorted(st["wind_beats"])
            rep["maxDeflection"] = round(st["maxd"], 1)

        # v10.0 solver report: what the SOLVER actually did - the widest
        # anchor sway the air called for (honest evidence: a still frame
        # reports a small sway, a fallback names its springs)
        if cloth_rig is not None:
            sol = state.setdefault("secondary", {}).setdefault("solver", {})
            sol["maxAnchorSway"] = round(math.degrees(cloth_rig["max_sway"]), 1)
            if cloth_rig["notes"]:
                merged = list(sol.get("notes") or [])
                for n in cloth_rig["notes"]:
                    if n not in merged:
                        merged.append(n)
                sol["notes"] = merged

        # v11.0 flesh report: what the SOLVER actually did - the widest
        # anchor drive the beats called for (the probed law answers with
        # real lag; a still shot reports a small drive, honestly)
        if flesh_rig is not None and flesh_rig["parts"]:
            fsol = state.setdefault("secondary", {}).setdefault("solver", {})
            fsol["maxFleshDrive"] = round(math.degrees(flesh_rig["max_drive"]), 1)
            if flesh_rig["notes"]:
                merged = list(fsol.get("notes") or [])
                for n in flesh_rig["notes"]:
                    if n not in merged:
                        merged.append(n)
                fsol["notes"] = merged

        # fx report: what the world actually did for the beats - the
        # bursts that fired, the trail's peak glow, the widest ring
        # (honest evidence: a burst that never fired reports 0)
        if fx_rig:
            frep = state.setdefault("fx", {"programs": len(fx_programs), "kinds": fx_rig["kinds"]})
            frep["burstsFired"] = fx_rig["fired"]
            frep["trailPeak"] = round(fx_rig["trail_peak"], 1)
            frep["maxRing"] = round(fx_rig["max_ring"], 2)
            frep["boundBeats"] = sorted(fx_rig["all_bound"])

        # physics report: what the solid world actually did - the
        # strikes that landed, the bounces, the fastest a body moved
        # and the frame the wreckage settled (honest evidence: a
        # knock that never struck reports 0 strikes)
        if phys_rig:
            prep = state.setdefault("physics", {"programs": len(phys_programs), "kinds": phys_rig["kinds"]})
            prep["strikes"] = phys_rig["strikes"]
            prep["bounces"] = phys_rig["bounces"]
            prep["maxSpeed"] = round(phys_rig["max_speed"], 2)
            prep["settleFrame"] = phys_rig["settle_frame"]
            prep["maxSwing"] = round(phys_rig["max_swing"], 1)
            prep["boundBeats"] = sorted(phys_rig["all_bound"])
            # v9.1: the body's answer - the staggers that fired, how far
            # the body actually left its mark, how far it buckled and
            # the frame it came back to rest (honest evidence: a
            # reaction that never fired reports 0)
            r = phys_rig.get("reaction")
            if r is not None:
                prep["reaction"] = {
                    "reactions": phys_rig.get("reactions", 0),
                    "maxOffset": round(phys_rig.get("max_offset", 0.0), 3),
                    "maxLean": round(phys_rig.get("max_lean", 0.0), 1),
                    "recoverFrame": r["recover_frame"],
                    "boundBeats": sorted(r["bound"]),
                }

        # ── encode ──
        if choreo_prog:
            # the performance's measured answer: how far the striking
            # limb actually stretched (0 when no smear window fired)
            state["choreo"]["maxSmear"] = round(choreo_max_smear, 3)
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


# ═══ WARM POOL WORKERS (iteration 103: THE WORKERS STAY WARM) ═══
#
# v3 spawned a FRESH `blender -b -P ... --worker` subprocess per job:
# a crashed worker could never poison the server and every job got a
# clean scene, but every job also paid Blender's FULL cold boot
# (binary start, module init, memory allocation) before the first
# frame. The pool keeps WARM resident workers instead: each one is a
# long-lived headless Blender that loads bpy ONCE, then waits for job
# payloads on a private loopback socket - the boot is paid once per
# worker lifetime, not once per shot.
#
#   --pool-worker --port W   (spawned by the server; one per slot)
#
# Protocol (length-prefixed JSON over 127.0.0.1:W):
#   -> {"jobId", "payload", "outDir", "jobFile"}   one render job
#   <- {"ok", "error"?, "mp4Path"?, "served", "ms"} the outcome
# The worker renders through the SAME worker_run path the cold
# spawn uses (the per-frame progress JSON the /progress endpoint
# polls is unchanged), then reads the factory settings back to an
# EMPTY scene - every job still gets a clean scene, a crashed job
# still cannot poison the next one - and waits for the next payload.
# A ready-file (.pool-<port>.ready) tells the server when the worker
# is actually listening, so a booting slot is never dispatched.

def _recv_exact(conn, n):
    buf = b""
    while len(buf) < n:
        chunk = conn.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("pool socket closed early")
        buf += chunk
    return buf


def pool_ready_path(port):
    return os.path.join(render_dir(), f".pool-{port}.ready")


def pool_worker_main(port):
    import bpy  # noqa: F401 - the WHOLE point: loaded once, warm for the worker's lifetime

    served = 0
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port))
    srv.listen(2)
    ready = pool_ready_path(port)
    try:
        os.makedirs(os.path.dirname(ready), exist_ok=True)
        with open(ready, "w", encoding="utf-8") as fh:
            fh.write(str(os.getpid()))
    except Exception:  # noqa: BLE001
        ready = None
    print(f"[animeos-bridge] pool worker ready on 127.0.0.1:{port}", flush=True)

    while True:
        conn, _addr = srv.accept()
        result = {"ok": False, "error": "unknown", "served": served, "ms": None}
        try:
            length = int.from_bytes(_recv_exact(conn, 8), "little")
            job = json.loads(_recv_exact(conn, length).decode("utf-8"))
            t0 = time.time()
            worker_run(job["jobFile"])  # the proven render path, unchanged
            with open(job["jobFile"], "r", encoding="utf-8") as fh:
                state = json.load(fh)
            served += 1
            result = {
                "ok": not state.get("error"),
                "error": state.get("error"),
                "mp4Path": state.get("mp4Path"),
                "served": served,
                "ms": int((time.time() - t0) * 1000),
            }
        except Exception as exc:  # noqa: BLE001
            served += 1
            result = {"ok": False, "error": f"pool worker crashed: {exc}", "served": served, "ms": None}
        # the outcome goes back FIRST - the clean-scene purge must never
        # cost the job its result
        try:
            blob = json.dumps(result).encode("utf-8")
            conn.sendall(len(blob).to_bytes(8, "little") + blob)
        except Exception:  # noqa: BLE001
            pass
        try:
            # the clean-scene guarantee: the next job opens an EMPTY scene
            bpy.ops.wm.read_factory_settings(use_empty=True)
        except Exception:  # noqa: BLE001
            pass
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass


# ═══ SERVER MODE (plain python; bpy NOT required) ═════════════

class BridgeServer:
    def __init__(self, blender_bin, pool_size=0):
        self.lock = threading.RLock()  # re-entrant: submit -> _free_worker_port -> _spawn_worker
        self.jobs = {}  # job_id -> {"jobFile", "mp4Cache", "done"}
        self.current = None
        self.blender_bin = blender_bin
        self.blender_version = None
        self.script_path = os.path.abspath(__file__)
        # THE WARM POOL (iteration 103): resident Blender workers that
        # loaded bpy once and wait for payloads on private loopback
        # sockets. port -> {"proc", "busy", "dead", "served", "attempts"}
        self.pool = {}
        self.pool_base = 9410
        self.pool_size = max(0, int(pool_size or 0))
        self.cold_workers = 0  # cold spawns in flight (the proven fallback path)
        if self.pool_size > 0:
            threading.Thread(target=self._boot_pool, args=(self.pool_size,), daemon=True).start()

    def _boot_pool(self, size):
        for i in range(size):
            self._spawn_worker(self.pool_base + i)

    def _spawn_worker(self, port):
        cmd = [self.blender_bin, "-b", "-P", self.script_path, "--", "--pool-worker", "--pw-port", str(port)]
        try:
            log_path = os.path.join(render_dir(), f".pool-{port}.log")
            log_fh = open(log_path, "a", encoding="utf-8")
            proc = subprocess.Popen(cmd, stdout=log_fh, stderr=log_fh)
        except Exception:  # noqa: BLE001
            return
        with self.lock:
            # a respawn keeps the SLOT's lifetime served count - the pool's
            # reuse ledger counts JOBS SERVED WARM, not worker processes
            prev_served = (self.pool.get(port) or {}).get("served", 0)
            prev_attempts = (self.pool.get(port) or {}).get("attempts", 0) + 1
            self.pool[port] = {"proc": proc, "busy": False, "dead": False, "served": prev_served, "attempts": prev_attempts}

    def _free_worker_port(self):
        # a slot is FREE when it is alive, not busy, and actually
        # listening (the ready-file proves the boot finished)
        for port, w in sorted(self.pool.items()):
            if w["busy"] or w["dead"]:
                continue
            if w["proc"].poll() is not None:
                w["dead"] = True
                try:
                    os.unlink(pool_ready_path(port))
                except Exception:  # noqa: BLE001
                    pass
                continue
            if not os.path.exists(pool_ready_path(port)):
                continue  # still booting - the cold path takes this job
            return port
        # respawn dead slots in the background (bounded per port)
        for port, w in list(self.pool.items()):
            if w["dead"] and w.get("attempts", 1) < 5:
                self._spawn_worker(port)
        return None

    def probe_version(self):
        try:
            out = subprocess.run([self.blender_bin, "--version"], capture_output=True, text=True, timeout=20)
            first = (out.stdout or "").splitlines()
            self.blender_version = first[0].replace("Blender", "").strip() if first else "unknown"
        except Exception:  # noqa: BLE001
            self.blender_version = "unknown"

    def status(self):
        with self.lock:
            warm_total = len(self.pool)
            warm_busy = sum(1 for _port, w in self.pool.items() if w["busy"])
            warm_free = sum(1 for port, w in self.pool.items() if not w["busy"] and not w["dead"] and os.path.exists(pool_ready_path(port)))
            warm_alive = sum(1 for _port, w in self.pool.items() if not w["dead"])
            served = sum(w.get("served", 0) for _port, w in self.pool.items())
            cold_free = self.current is None and self.cold_workers == 0
            busy = not (warm_free > 0 or cold_free)
            pool = {"size": warm_total, "alive": warm_alive, "free": warm_free, "busy": warm_busy, "served": served}
        return {
            "ok": True,
            "blender_version": self.blender_version or "unknown",
            "scene": f"warm {pool['free']}/{pool['size']} - served {pool['served']}" if warm_total else "AnimeOS sequence worker pool",
            "busy": busy,
            "pool": pool,
        }

    def submit(self, payload):
        job_id = str(payload.get("jobId") or f"job_{int(time.time())}")
        with self.lock:
            port = self._free_worker_port() if self.pool_size > 0 else None
            warm = port is not None
            if not warm:
                # the proven cold path, unchanged: one spawn at a time
                if self.current is not None or self.cold_workers > 0:
                    return {"error": "busy", "current_job": self.current}, 409
                self.current = job_id
            if warm:
                self.pool[port]["busy"] = True
            job_file = os.path.join(render_dir(), f".job-{job_id}.json")
            self.jobs[job_id] = {"jobFile": job_file, "mp4Cache": None, "done": False}
        with open(job_file, "w", encoding="utf-8") as fh:
            json.dump({"jobId": job_id, "payload": payload, "outDir": render_dir()}, fh)
        if warm:
            threading.Thread(target=self._run_warm, args=(job_id, job_file, payload, port), daemon=True).start()
            return {"ok": True, "jobId": job_id, "worker": "warm"}, 200
        threading.Thread(target=self._run_worker, args=(job_id, job_file), daemon=True).start()
        return {"ok": True, "jobId": job_id, "worker": "cold"}, 200

    def _run_warm(self, job_id, job_file, payload, port):
        # dispatch the payload to the WARM worker over its socket; the
        # worker renders through the same worker_run core and the job
        # file keeps the per-frame progress /progress already polls.
        # ANY warm failure marks the slot dead AND falls back to the
        # proven cold spawn for the SAME job file - a dead warm worker
        # never loses a job.
        result = {"ok": False, "error": "warm dispatch failed", "mp4Path": None, "served": 0, "ms": None}
        try:
            sock = socket.create_connection(("127.0.0.1", port), timeout=30)
            sock.settimeout(900)  # the render itself may take minutes (the cold path's own cap)
            blob = json.dumps({"jobId": job_id, "payload": payload, "outDir": render_dir(), "jobFile": job_file}).encode("utf-8")
            sock.sendall(len(blob).to_bytes(8, "little") + blob)
            header = _recv_exact(sock, 8)
            result = json.loads(_recv_exact(sock, int.from_bytes(header, "little")).decode("utf-8"))
            sock.close()
        except Exception as exc:  # noqa: BLE001
            with self.lock:
                w = self.pool.get(port)
                if w is not None:
                    w["dead"] = True
            try:
                subprocess.run(
                    [self.blender_bin, "-b", "-P", self.script_path, "--", "--worker", "--job", job_file],
                    capture_output=True, text=True, timeout=900,
                )
                result = {"ok": True, "error": None, "mp4Path": None, "served": 0, "ms": None, "fallback": "cold"}
            except Exception as exc2:  # noqa: BLE001
                result = {"ok": False, "error": f"warm worker failed: {exc}; cold fallback failed: {exc2}", "mp4Path": None, "served": 0, "ms": None}
        finally:
            with self.lock:
                w = self.pool.get(port)
                if w is not None:
                    w["busy"] = False
                    if result.get("ok"):
                        w["served"] = w.get("served", 0) + 1
        # finalize the job file exactly like the cold path's finally
        try:
            with open(job_file, "r", encoding="utf-8") as fh:
                state = json.load(fh)
            state.setdefault("done", True)
            if not state.get("done"):
                state["done"] = True
                state.setdefault("error", result.get("error") or "worker exited unexpectedly")
            if result.get("error") and not state.get("error"):
                state["error"] = result["error"]
            if result.get("mp4Path") and not state.get("mp4Path"):
                state["mp4Path"] = result["mp4Path"]
            tmp = job_file + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(state, fh)
            os.replace(tmp, job_file)
        except Exception:  # noqa: BLE001
            pass

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


def run_server(port, blender_bin, pool_size=0):
    bridge = BridgeServer(blender_bin, pool_size=pool_size)
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
    print(f"[animeos-bridge] serving on 127.0.0.1:{port} (workers via {blender_bin}, pool {pool_size})", flush=True)
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
    parser.add_argument("--pool", type=int, default=0, help="warm pool size (resident Blender workers)")
    parser.add_argument("--pool-worker", action="store_true")
    parser.add_argument("--pw-port", type=int, default=None, help="pool worker socket port")
    args, _ = parser.parse_known_args(extra)
    port = args.port

    if args.pool_worker and args.pw_port:
        pool_worker_main(args.pw_port)
        return

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

    pool_size = max(0, args.pool)
    run_server(port, blender_bin, pool_size=pool_size)


if __name__ == "__main__":
    main()
