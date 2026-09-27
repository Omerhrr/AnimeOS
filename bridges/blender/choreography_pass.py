# ─────────────────────────────────────────────────────────────
# AnimeOS CHOREOGRAPHY PASS (iteration 74) - THE PERFORMANCE IS KEYED
#
# Interpolation is blocking; a keyframe performance is CRAFT. This
# pass replaces the shot's two-pose slide with a KEYED performance:
#
#   keys      - the body's pose over the clip: {at 0..1, pose, kind}
#               where the kind names the SEGMENT INTO that key:
#                 hold          the body freezes on the key
#                 anticipation the wind-up (fast in, settle at the
#                               extreme - the strike must be earned)
#                 strike       the explosive segment (ease-out-quint:
#                               most of the distance in the first
#                               frames - the blast)
#                 follow       the settle back (ease-out-cubic)
#                 move         the standard eased travel
#   impact    - {at, frames 1..6, punch 0..8 deg, flash 0..1}: a REAL
#               light flares at the strike and decays over the window,
#               and the camera takes a decaying pitch kick - the hit
#               the audience feels
#   smear     - {at, frames 1..4, amount 0..1}: the striking limb
#               stretches up to 1.35x for the fastest frames - the
#               stylized speed line no single frame can fake
#
# THE KEYS OWN THE BODY: the choreography overrides the pose pair the
# grammar resolved for the frame. The camera grammar still owns the
# lens, the cloth and flesh still answer the body's velocity (the
# springs read the choreographed pose row like any other), the
# physics still own the world. One body, one clock, one more voice.
#
# Deterministic: every number is fixed by the program; no rng, no
# wall-clock, no thread order. The same program always performs the
# same performance, bit-exact.
# ─────────────────────────────────────────────────────────────

import math


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _ease(kind, x):
    """The segment's easing by its arrival kind (x 0..1 in, t 0..1 out)."""
    if kind == "strike":
        return 1.0 - (1.0 - x) ** 5          # the blast: fast first frames
    if kind == "anticipation":
        return 1.0 - (1.0 - x) ** 3          # quick in, settle at the extreme
    if kind == "follow":
        return 1.0 - (1.0 - x) ** 3          # the settle back
    if kind == "hold":
        return 0.0                            # frozen on the held key
    # "move" (and anything unknown): the studio's standard clock
    if x < 0.5:
        return 4.0 * x * x * x
    return 1.0 - ((-2.0 * x + 2.0) ** 3) / 2.0


def normalize_choreo(raw):
    """Defensive normalize of the payload's choreo program. Returns
    (program, None) or (None, reason) - a corrupt column degrades to
    the plain two-pose path honestly (the caller notes it)."""
    if not isinstance(raw, dict):
        return None, "choreo is not an object"
    keys = raw.get("keys")
    if not isinstance(keys, list) or len(keys) < 2:
        return None, "choreo keys missing or short"
    norm = []
    for k in keys:
        if not isinstance(k, dict):
            return None, "a choreo key is not an object"
        at = float(k.get("at", -1.0))
        pose = str(k.get("pose", "")).strip().upper()
        kind = str(k.get("kind", "move")).strip().lower()
        if not (0.0 <= at <= 1.0) or not pose:
            return None, "a choreo key carries a bad at/pose"
        if kind not in ("hold", "anticipation", "strike", "follow", "move"):
            kind = "move"
        norm.append({"at": at, "pose": pose, "kind": kind})
    norm.sort(key=lambda k: k["at"])
    if norm[0]["at"] > 0.0:
        return None, "the first key must sit at 0"
    if norm[-1]["at"] < 1.0:
        norm.append({"at": 1.0, "pose": norm[-1]["pose"], "kind": "follow"})
    for i in range(1, len(norm)):
        if norm[i]["at"] <= norm[i - 1]["at"]:
            return None, "choreo keys must advance in time"
    prog = {"keys": norm, "impact": None, "smear": None}
    imp = raw.get("impact")
    if isinstance(imp, dict):
        try:
            prog["impact"] = {
                "at": clamp(float(imp.get("at", 0.5)), 0.001, 0.999),
                "frames": int(clamp(float(imp.get("frames", 3)), 1, 6)),
                "punch": clamp(float(imp.get("punch", 2.5)), 0.0, 8.0),
                "flash": clamp(float(imp.get("flash", 0.8)), 0.0, 1.0),
            }
        except Exception:  # noqa: BLE001
            prog["impact"] = None
    sm = raw.get("smear")
    if isinstance(sm, dict):
        try:
            prog["smear"] = {
                "at": clamp(float(sm.get("at", 0.5)), 0.001, 0.999),
                "frames": int(clamp(float(sm.get("frames", 2)), 1, 4)),
                "amount": clamp(float(sm.get("amount", 0.5)), 0.0, 1.0),
            }
        except Exception:  # noqa: BLE001
            prog["smear"] = None
    return prog, None


def pose_state_at(prog, t):
    """The keyed pose pair + eased segment t under the playhead:
    the choreography's answer to the frame (the body's law)."""
    keys = prog["keys"]
    t = clamp(float(t), 0.0, 1.0)
    i = len(keys) - 1
    for j in range(1, len(keys)):
        if t <= keys[j]["at"]:
            i = j
            break
    k0 = keys[i - 1]
    k1 = keys[i]
    span = k1["at"] - k0["at"]
    if span <= 0.0:
        span = 1.0
    local = clamp((t - k0["at"]) / span, 0.0, 1.0)
    eased = _ease(k1["kind"], local)
    return k0["pose"], k1["pose"], eased


def build_impact_light(bpy, scn, prog):
    """The strike's REAL light: a point light the frame loop drives -
    dark off-window, a decaying flare on the impact frames."""
    if not prog.get("impact") or prog["impact"]["flash"] <= 0.0:
        return None
    data = bpy.data.lights.new("ChoreoImpact", "POINT")
    data.energy = 0.0
    data.color = (1.0, 0.92, 0.78)  # a warm white flash - readable, not a color accident
    data.shadow_soft_size = 0.6
    ob = bpy.data.objects.new("ChoreoImpact", data)
    ob.location = (0.35, -1.1, 1.15)  # front-above the hero (it faces -Y)
    scn.collection.objects.link(ob)
    return {"ob": ob, "data": data, "base": 2200.0 * prog["impact"]["flash"]}


def impact_frames(prog, frames_total):
    """The frame indices the impact window covers (the state's evidence)."""
    imp = prog.get("impact")
    if not imp:
        return []
    center = 1 + int(round(imp["at"] * max(1, frames_total - 1)))
    return list(range(center, min(frames_total, center + imp["frames"] - 1) + 1))


def apply_impact(prog, cam, flash, f, frames_total):
    """The impact half of the frame: the impact light's decaying energy
    and the camera's decaying pitch kick. Call ONCE per frame, after
    the grammar aims the lens (the kick rides on top of the aim)."""
    imp = prog.get("impact")
    if not imp:
        return 0.0
    center = 1 + int(round(imp["at"] * max(1, frames_total - 1)))
    d = f - center
    punch_deg = 0.0
    if 0 <= d < imp["frames"]:
        decay = (imp["frames"] - d) / imp["frames"]
        punch_deg = imp["punch"] * decay
        if flash is not None:
            flash["data"].energy = flash["base"] * decay
    else:
        if flash is not None:
            flash["data"].energy = 0.0
    if punch_deg > 0.0 and cam is not None:
        cam.rotation_euler.x += math.radians(punch_deg)
    return punch_deg


def apply_smear(prog, figure, f, frames_total):
    """The smear half of the frame: the striking limb stretches for the
    fastest frames (in-window), resets everywhere else. Call ONCE per
    frame, AFTER the pose call (the pose owns rotations; the smear owns
    the limb's scale on top). Returns the frame's smear factor."""
    sm = prog.get("smear")
    shoulder = figure.get("rShoulder") if figure is not None else None
    if not sm or shoulder is None:
        return 0.0
    center = 1 + int(round(sm["at"] * max(1, frames_total - 1)))
    d = f - center
    if 0 <= d < sm["frames"]:
        decay = (sm["frames"] - d) / sm["frames"]
        s = clamp(1.0 + 0.35 * sm["amount"] * decay, 1.0, 1.35)
        shoulder.scale = (s, 1.0, 1.0)
        return s
    shoulder.scale = (1.0, 1.0, 1.0)
    return 0.0
