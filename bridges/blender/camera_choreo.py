"""camera_choreo - v13.0 THE CAMERA CHOREOGRAPHS THE DRAMA.

The camera has always obeyed the shot's MECHANICS: the whole-clip
movement, the grammar beats (v5.3), the impact punch (v9.0). The
drama never moved the lens by itself. This pass layers the shot's own
compiled CAMERA CHOREO (camera-choreo.ts -> the payload's
shot.cameraChoreo) onto WHATEVER aims the lens - the whole-clip
movement, the grammar beats, the pose follow, the impact punch:

  - the push-in / pull-out travel the view axis over the shot's
    progress (bounded 0.35 units - the lens leans into a revelation,
    lets a retreat go);
  - the dutch tilts the horizon clockwise around the camera's own
    view axis (bounded 10 degrees - the dread read);
  - the handheld breath moves the frame on two prime-ish frequencies
    with a roll breath (bounded 0.02 units / 0.3 degrees - the storm
    read, organic not seasick);
  - the whip snaps the pan at the cut-in and decays over the shot's
    first 10% (bounded 18 degrees - the action read).

Every term is a pure function of the frame - the same choreo on the
same aim always lands the same camera. The pass never REPLACES the
aim: it is bounded subtlety riding on top, and a payload without a
choreo keeps the steady house camera honestly.
"""

import math

from mathutils import Quaternion, Vector

# one law, two runtimes - mirrors CAMERA_CHOREO_BOUNDS in camera-choreo.ts
CHOREO_BOUNDS = {
    "pushIn": (0.0, 1.0),
    "pullOut": (0.0, 1.0),
    "dutch": (0.0, 1.0),
    "handheld": (0.0, 1.0),
    "whip": (0.0, 1.0),
}

# the physical laws - mirrors CAMERA_CHOREO_PHYSICS in camera-choreo.ts
DOLLY_UNITS = 0.35
DUTCH_DEG = 10.0
WOBBLE_UNITS = 0.02
WOBBLE_ROLL_DEG = 0.3
WHIP_DEG = 18.0
WHIP_WINDOW = 0.1


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def apply_choreo(cam, prof, t, t_sec, direction, dist=None):
    """Layer the drama onto the aimed lens for this frame: the dolly
    travels the view axis with the progress, the dutch + the whip roll
    the camera around its own view axis, the handheld breath moves the
    frame on deterministic frequencies. `direction` is the aim vector
    (target - location) the grammar/movement just computed. `dist` is
    the framing's solved distance when known: THE DOLLY SCALES WITH
    THE LENS (iteration 113) - the absolute 0.35-unit travel that reads
    as a lean on a 3m medium reads as a face-plant on a 0.5m closeup
    (the night's closeup ended 0.16m from the eyes, the paint cropped
    past reading). At close range the travel eases toward a fraction
    of the distance so the drift never crops the subject."""
    if not prof:
        return
    push_in = clamp(float(prof.get("pushIn") or 0.0), 0.0, 1.0)
    pull_out = clamp(float(prof.get("pullOut") or 0.0), 0.0, 1.0)
    dutch = clamp(float(prof.get("dutch") or 0.0), 0.0, 1.0)
    handheld = clamp(float(prof.get("handheld") or 0.0), 0.0, 1.0)
    whip = clamp(float(prof.get("whip") or 0.0), 0.0, 1.0)
    if direction.length_squared < 1e-12:
        return
    dir_n = direction.normalized()

    # the dolly: the lens leans in or lets go across the shot. The
    # travel eases with the framing distance (a % of the lens's reach,
    # floored so wide framings keep the authored absolute lean)
    dist_scale = 1.0 if not dist else clamp(dist / 1.2, 0.25, 1.0)
    travel = DOLLY_UNITS * dist_scale * (push_in - pull_out) * float(t)
    if abs(travel) > 1e-9:
        cam.location = cam.location + dir_n * travel

    # the handheld breath: two prime-ish frequencies + a roll breath
    wobble = Vector((0.0, 0.0, 0.0))
    roll = math.radians(DUTCH_DEG * dutch)
    if handheld > 0.0:
        world_up = Vector((0.0, 0.0, 1.0))
        right = dir_n.cross(world_up)
        if right.length_squared > 1e-12:
            right.normalize()
            up = right.cross(dir_n).normalized()
            amp = WOBBLE_UNITS * handheld
            wobble = right * (amp * math.sin(2.0 * math.pi * 1.3 * t_sec + 0.7))
            wobble += up * (amp * math.sin(2.0 * math.pi * 1.7 * t_sec + 1.3))
        roll += math.radians(WOBBLE_ROLL_DEG * handheld * math.sin(2.0 * math.pi * 1.1 * t_sec + 0.7))

    # the whip: the pan snaps at the cut-in and decays over the window
    if whip > 0.0 and float(t) < WHIP_WINDOW:
        decay = 1.0 - (float(t) / WHIP_WINDOW)
        roll += math.radians(WHIP_DEG * whip * decay)

    if wobble.length_squared > 1e-12:
        cam.location = cam.location + wobble
    if abs(roll) > 1e-9:
        q = cam.rotation_euler.to_quaternion()
        cam.rotation_euler = (q @ Quaternion((0.0, 0.0, 1.0), roll)).to_euler()
