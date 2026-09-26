# ─────────────────────────────────────────────────────────────
# PHYSICS PASS (v9.0): THE WORLD OBEYS ITS OWN LAW
#
# The camera performs the beats (the motion grammar), the cloth and
# hair RIDE the beats (the secondary motion rig), the FX answers them
# (the spectacle pass) - and now the SOLID WORLD obeys the beats too,
# through real ballistics rather than keyframes: gravity, bounce,
# friction, tumble, settle. A directed physics program is compiled
# here into real bodies integrated per frame by the SAME beat clock
# as the camera, the springs and the fx:
#
#   KNOCK   - a prop takes the hit: when the playhead ENTERS a bound
#             beat, the named prop (a riding library asset's anchor
#             empty, matched by name) - or a spawned stone vessel
#             when no prop rides - is struck: an impulse velocity
#             away from the figure plus a seeded tumble, integrated
#             with semi-implicit Euler, bouncing on the floor with
#             restitution, rolling under friction, settling to REST.
#   DEBRIS  - the rubble answers: ten seeded chunks resting in a ring
#             around the figure are kicked radially when a bound beat
#             is entered, arc, bounce, tumble - and LIE where they
#             settle (physics truth: debris never fades like fx).
#   SWAY    - the hanging lantern: a damped pendulum driven by the
#             beat's WIND call - the same driver the cloth hangs
#             from - kicked at every beat boundary, swinging until
#             the air stills.
#   REACTION- THE BODY ANSWERS THE WORLD (v9.1, probed): the FIGURE
#             itself answers the beat's violence - when a bound beat
#             is entered, an impulse drives a damped spring on the
#             hero's root: the body staggers AWAY from the beat's
#             violence (when a KNOCK strike or a DEBRIS kick lands on
#             the same beat, the recoil points away from the struck
#             body - Newton's third law; otherwise a seeded direction),
#             the root dips, the body leans into the stagger (pitch
#             with the backward lurch, roll with the lateral), the
#             spine folds and the head lags opposite - and the spring
#             returns the body to its mark, settling to REST (the
#             frame stamped honestly; a re-stagger forgets the earlier
#             rest). The per-frame stagger velocity is published on
#             the figure as _stagger so the CLOTH answers the same
#             jerk the same frame - the body moves and the robes
#             follow. Multiple REACTION programs merge into ONE body
#             law (the figure has one body); the wind has NO force on
#             this law - the cloth answers the air, the body answers
#             the violence.
#
# The integration law was PROBED before it shipped (the studio probes
# first): a shallow impact must not micro-vibrate forever - the body
# grounds, rolls, friction eats it, and it settles (bit-exact across
# runs; the same reason OpenSubdiv was rejected in the sculpt pass).
#
# Deterministic by the seed law: every direction, phase and spin
# derives from fnv1a(job_id) ^ program index - the same grammar and
# the same physics always land the same wreckage, bit for bit.
#
# This module is self-contained (math + json only): the bridge hands
# it everything the frame loop already knows (the beat under the
# playhead, the wind, the pose velocity), so no import ever circles
# back into the bridge.
# ─────────────────────────────────────────────────────────────

import json
import math

PHYSICS_KINDS = ("KNOCK", "DEBRIS", "SWAY", "REACTION")

REACTION_STIFFNESS = 46.0   # spring pulling the body back to its mark
REACTION_DAMPING = 8.5      # underdamped on purpose: a stagger wobbles, then settles
REACTION_SETTLE_V = 0.05    # linear stagger speed below which the body rests
REACTION_SETTLE_X = 0.006   # offset below which the body is back on its mark
REACTION_LEAN_GAIN = 4.2    # deg of root lean per (m/s) of stagger velocity
REACTION_LEAN_MAX = 6.5     # deg - the body buckles, it does not capsize

GRAVITY = -9.8
RESTITUTION = 0.32      # vertical bounce retention
IMPACT_FRICTION = 0.72  # horizontal speed kept across a bounce
ROLL_FRICTION = 0.86    # horizontal speed kept per grounded frame
SPIN_DECAY = 0.995      # angular velocity decay while airborne
SETTLE_SPEED = 0.08     # linear speed below which a grounded body rests
SETTLE_SPIN = 0.3       # angular speed below which a grounded body rests


def fnv1a(s):
    """32-bit FNV-1a (mirrors the bridge's seed law exactly)."""
    h = 2166136261
    for ch in str(s):
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def mulberry32(seed):
    """The studio's deterministic rng (mirrors the bridge's)."""
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


def _stone_mat(bpy, name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.10, 0.105, 0.115, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.92
        bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def _lantern_mat(bpy, name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.85, 0.42, 0.13, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.55
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.55, 0.16, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 3.4
    return mat


def normalize_physics(raw, beat_count):
    """Parse a shot's physics payload into validated programs
    [{kind, intensity, beats(set of bound indices), target}]. A
    program whose every beat binding lies beyond the grammar's reach
    is skipped with an honest note - a broken note never stops a
    shoot. Returns (programs, notes)."""
    notes = []
    if not isinstance(raw, list) or len(raw) == 0:
        return [], notes
    programs = []
    for i, p in enumerate(raw):
        if not isinstance(p, dict):
            notes.append(f"program {i + 1}: not an object - skipped")
            continue
        kind = str(p.get("kind") or "").upper()
        if kind not in PHYSICS_KINDS:
            notes.append(f"program {i + 1}: unknown kind '{kind}' - skipped (the worker performs: {', '.join(PHYSICS_KINDS)})")
            continue
        try:
            intensity = clamp(float(p.get("intensity", 0.6)), 0.0, 1.0)
        except (TypeError, ValueError):
            intensity = 0.6
        raw_beats = p.get("beats", "ALL")
        if isinstance(raw_beats, str):
            try:
                raw_beats = json.loads(raw_beats)
            except Exception:  # noqa: BLE001
                raw_beats = "ALL"
        if raw_beats == "ALL" or raw_beats is None:
            bound = set(range(max(1, beat_count)))
        elif isinstance(raw_beats, list):
            idxs = set()
            for b in raw_beats:
                try:
                    b = int(b)
                except (TypeError, ValueError):
                    continue
                if 0 <= b < max(1, beat_count):
                    idxs.add(b)
            if not idxs:
                notes.append(f"program {i + 1} ({kind}): every beat binding lies beyond the grammar's {beat_count} beat(s) - skipped")
                continue
            bound = idxs
        else:
            bound = set(range(max(1, beat_count)))
        target = str(p.get("target") or "").strip() or None
        if target and kind != "KNOCK":
            notes.append(f"program {i + 1} ({kind}): only KNOCK takes a target - '{target}' ignored")
            target = None
        programs.append({"kind": kind, "intensity": intensity, "beats": bound, "target": target, "index": i})
    return programs, notes


def _unit_xy(x, y):
    n = math.sqrt(x * x + y * y)
    if n < 1e-9:
        return 0.0, 0.0
    return x / n, y / n


def _spawn_vessel(bpy, scn, name, mat):
    """A stone vessel stand-in: a squashed sphere body with a rim -
    the thing a beat knocks across the stage when no designed prop
    rides the shot. Returns its anchor empty (the body hangs from
    it, so driving the anchor drives the whole body)."""
    anchor = bpy.data.objects.new(name, None)
    scn.collection.objects.link(anchor)
    body = bpy.data.meshes.new(f"{name}_body")
    import bmesh  # local import: the pass stays import-light
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=0.19)
    bm.to_mesh(body)
    bm.free()
    body_obj = bpy.data.objects.new(f"{name}_Body", body)
    scn.collection.objects.link(body_obj)
    body_obj.parent = anchor
    body_obj.scale = (1.0, 1.0, 0.82)
    body_obj.data.materials.append(mat)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.13, minor_radius=0.028, location=(0, 0, 0))
    rim = bpy.context.active_object
    rim.name = f"{name}_Rim"
    rim.scale = (1.0, 1.0, 0.6)
    rim.data.materials.append(mat)
    rim.parent = anchor
    rim.location = (0.0, 0.0, 0.05)
    return anchor


def _make_body(anchor, origin, half_h):
    """The integrated state of one rigid body: position (its anchor
    empty's location, so a whole prop group rides), velocity, angular
    velocity, and the grounded/settled bookkeeping."""
    return {
        "ob": anchor,
        "home": tuple(origin),
        "p": list(origin),
        "v": [0.0, 0.0, 0.0],
        "w": [0.0, 0.0, 0.0],
        "half_h": half_h,
        "grounded": False,
        "settled": False,
    }


def _strike(body, direction, speed, up_speed, spin, rng):
    """Put a body into flight: impulse velocity plus a seeded tumble.
    A grounded body is re-launched (a second bound beat strikes the
    wreckage again - the beat clock is the law, not a one-shot) and
    its earlier rest is forgotten (the report names the frame the
    wreckage FINALLY settled, not an intermediate rest)."""
    n = math.sqrt(sum(c * c for c in direction)) or 1.0
    body["v"] = [direction[0] / n * speed, direction[1] / n * speed, up_speed]
    body["w"] = [(rng() - 0.5) * spin, (rng() - 0.5) * spin, (rng() - 0.5) * spin * 0.6]
    body["grounded"] = False
    body["settled"] = False
    body["settle_frame"] = None


def _integrate(body, dt, frame):
    """Semi-implicit Euler under the probed law: gravity in the air,
    a real impact bounces with restitution, a shallow impact grounds
    the body (no micro-vibration forever), friction eats the roll,
    and a slow enough grounded body settles to REST at frame N."""
    if body["settled"]:
        return
    p, v, w = body["p"], body["v"], body["w"]
    if not body["grounded"]:
        v[2] += GRAVITY * dt
        p[0] += v[0] * dt
        p[1] += v[1] * dt
        p[2] += v[2] * dt
        floor = body["half_h"]
        if p[2] <= floor:
            p[2] = floor
            if v[2] < -0.5:  # a real impact: bounce with restitution
                v[2] = -v[2] * RESTITUTION
                v[0] *= IMPACT_FRICTION
                v[1] *= IMPACT_FRICTION
                w[0] *= 0.6
                w[1] *= 0.6
                body["bounces"] = body.get("bounces", 0) + 1
            else:  # too flat to bounce again: roll, friction eats it
                body["grounded"] = True
                v[2] = 0.0
        w[0] *= SPIN_DECAY
        w[1] *= SPIN_DECAY
        w[2] *= SPIN_DECAY
    else:
        v[0] *= ROLL_FRICTION
        v[1] *= ROLL_FRICTION
        w[0] *= 0.82
        w[1] *= 0.82
        w[2] *= 0.9
        lin = math.sqrt(v[0] * v[0] + v[1] * v[1])
        ang = math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2])
        if lin < SETTLE_SPEED and ang < SETTLE_SPIN:
            if not body["settled"]:  # stamp the transition ONCE - the frame it came to rest
                body["settle_frame"] = frame
            body["settled"] = True
    body["ob"].location = (p[0], p[1], p[2])
    body["ob"].rotation_euler = (body["ob"].rotation_euler.x + w[0] * dt,
                                 body["ob"].rotation_euler.y + w[1] * dt,
                                 body["ob"].rotation_euler.z + w[2] * dt)
    speed = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    body["max_speed"] = max(body.get("max_speed", 0.0), speed)


def build_physics_rig(bpy, scn, programs, figure, prop_anchors, job_id):
    """Compile the programs into real bodies parented into the scene.
    KNOCK resolves its target honestly: a riding prop anchor matched
    by name (case-insensitive), else the first riding prop (noted),
    else a spawned stone vessel (noted - the beat still lands, the
    stand-in is declared). DEBRIS seeds a ring of rubble. SWAY hangs
    a lantern from an invisible anchor. Returns the rig the frame
    loop drives."""
    notes = []
    rig = {
        "knocks": [],
        "debris_sets": [],
        "sways": [],
        "prev_beat": -1,
        "strikes": 0,
        "bounces": 0,
        "max_speed": 0.0,
        "max_swing": 0.0,
        "settle_frame": None,
        "notes": notes,
        "kinds": [],
        "all_bound": set(),
        "programs": len(programs),
    }
    root = figure.get("root") if isinstance(figure, dict) else None
    root_pos = list(root.location) if root is not None else [0.0, 0.0, 0.0]
    stone = _stone_mat(bpy, "PhysStoneMat")

    for pi, prog in enumerate(programs):
        kind = prog["kind"]
        inten = prog["intensity"]
        rng = mulberry32(fnv1a(str(job_id)) ^ (0x911 + pi))
        rig["all_bound"] |= set(prog["beats"])

        if kind == "KNOCK":
            target = prog.get("target")
            anchor = None
            how = None
            if target:
                for pa in prop_anchors:
                    if target.lower() in pa["name"].lower():
                        anchor = pa["empty"]
                        how = f"the designed prop '{pa['name']}' takes the hit"
                        break
                if anchor is None:
                    notes.append(f"KNOCK: no riding prop named '{target}' - skipped honestly (name the prop in the shot text so it rides)")
                    continue
            elif prop_anchors:
                anchor = prop_anchors[0]["empty"]
                how = f"the first riding prop '{prop_anchors[0]['name']}' takes the hit (auto)"
            else:
                anchor = _spawn_vessel(bpy, scn, f"PhysKnock{pi + 1}", stone)
                anchor.location = (1.15, -1.15, 0.17)  # the vessel's half-height: it rests ON the floor
                how = "no prop rides the shot - a stone vessel stands in (declared)"
            body = _make_body(anchor, tuple(anchor.location), 0.17 if anchor.location.z > 0.0 else 0.0)
            body["bounces"] = 0
            rig["knocks"].append({
                "body": body, "intensity": inten, "bound": set(prog["beats"]),
                "root_pos": list(root_pos), "how": how, "seed_phase": rng() * 6.28,
                "hit": False,
            })
            rig["kinds"].append("KNOCK")

        elif kind == "DEBRIS":
            chunks = []
            for c in range(10):
                ang = rng() * math.pi * 2.0
                rad = 0.9 + rng() * 0.8
                bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.055 + rng() * 0.05,
                                                      location=(math.cos(ang) * rad, math.sin(ang) * rad, 0.05))
                ob = bpy.context.active_object
                ob.name = f"PhysDebris{pi + 1}_{c}"
                ob.scale = (1.0 + rng() * 0.6, 1.0, 0.55 + rng() * 0.4)
                ob.data.materials.append(stone)
                chunks.append(_make_body(ob, (ob.location.x, ob.location.y, ob.location.z), 0.05))
            rig["debris_sets"].append({
                "chunks": chunks, "intensity": inten, "bound": set(prog["beats"]),
                "root_pos": list(root_pos), "kicked": False,
            })
            rig["kinds"].append("DEBRIS")

        elif kind == "REACTION":
            # collected - the figure has ONE body, so every REACTION
            # program merges into a single law built after the loop
            rig.setdefault("reaction_progs", []).append(prog)

        elif kind == "SWAY":
            pivot = bpy.data.objects.new(f"PhysSway{pi + 1}_Pivot", None)
            scn.collection.objects.link(pivot)
            pivot.location = (1.35, -1.05, 2.55)
            cord_len = 0.62
            bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=cord_len, location=(0, 0, -cord_len / 2))
            cord = bpy.context.active_object
            cord.name = f"PhysSway{pi + 1}_Cord"
            cord.data.materials.append(_stone_mat(bpy, "PhysCordMat"))
            cord.parent = pivot
            lantern = bpy.data.meshes.new(f"PhysSway{pi + 1}_Lantern")
            lmesh = bpy.data.objects.new(f"PhysSway{pi + 1}_Lantern", lantern)
            lmesh.data = lantern
            lantern.from_pydata([
                (-0.09, -0.09, -cord_len - 0.16), (0.09, -0.09, -cord_len - 0.16),
                (0.09, 0.09, -cord_len - 0.16), (-0.09, 0.09, -cord_len - 0.16),
                (-0.09, -0.09, -cord_len), (0.09, -0.09, -cord_len),
                (0.09, 0.09, -cord_len), (-0.09, 0.09, -cord_len),
            ], [], [(4, 5, 6, 7), (0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
            lantern.update()
            lmesh.data.materials.append(_lantern_mat(bpy, "PhysLanternMat"))
            scn.collection.objects.link(lmesh)
            lmesh.parent = pivot
            rig["sways"].append({
                "pivot": pivot, "intensity": inten, "bound": set(prog["beats"]),
                "theta": 0.0, "omega": 0.0, "length": cord_len + 0.08,
                "seed_phase": rng() * 6.28, "sign": 1.0 if rng() > 0.5 else -1.0,
            })
            rig["kinds"].append("SWAY")

    # ── REACTION: one body, one law - merge every program ──
    rprogs = rig.pop("reaction_progs", [])
    if rprogs:
        root = figure.get("root") if isinstance(figure, dict) else None
        if root is None:
            notes.append("REACTION: no figure stands on the stage - skipped honestly")
        else:
            rbound = set()
            inten = 0.0
            for rp in rprogs:
                rbound |= set(rp["beats"])
                inten = max(inten, rp["intensity"])
            if len(rprogs) > 1:
                notes.append(f"{len(rprogs)} REACTION programs merged into one body law - the figure has one body")
            rng_r = mulberry32(fnv1a(str(job_id)) ^ (0xE41 + rprogs[0]["index"]))
            bang = rng_r() * math.pi * 2.0
            rig["reaction"] = {
                "root": root, "spine": figure.get("spine"), "head": figure.get("head"),
                "figure": figure,
                "home_rot": (root.rotation_euler.x, root.rotation_euler.y, root.rotation_euler.z),
                "home_pos": (float(root.location.x), float(root.location.y)),
                "off": [0.0, 0.0], "v": [0.0, 0.0],
                "bound": rbound, "intensity": inten,
                "dir": [math.cos(bang), math.sin(bang)],
                "settled": True, "recover_frame": None,
            }
            rig["kinds"].append("REACTION")

    return rig


def apply_physics(rig, t, t_sec, dt, beat_idx, wind, vel, frame):
    """Drive every compiled program for this frame - the SAME beat
    clock as the camera, the springs and the fx. Entering a bound
    beat strikes the knock, kicks the debris and kicks the lantern;
    the lantern's sustained drive is the beat's wind call (the same
    driver the cloth hangs from). Deterministic: fixed dt, no reads
    of render state."""
    if not rig:
        return

    # ── beat entries: the strikes and the kicks land where the cut lands ──
    if beat_idx != rig["prev_beat"]:
        rig["prev_beat"] = beat_idx
        for k in rig["knocks"]:
            if beat_idx not in k["bound"]:
                continue
            body = k["body"]
            if body is None:
                continue
            d = (body["p"][0] - k["root_pos"][0], body["p"][1] - k["root_pos"][1])
            if math.sqrt(d[0] * d[0] + d[1] * d[1]) < 0.05:
                d = (0.85, 0.22)
            speed = (2.2 + 2.8 * k["intensity"]) * (1.0 + min(0.6, vel / 60.0))
            up = 1.4 + 1.6 * k["intensity"]
            spin = 5.0 + 9.0 * k["intensity"]
            rng = mulberry32(fnv1a(str(k.get("seed_phase", 0.0))) ^ 0x51)
            _strike(body, (d[0] + (rng() - 0.5) * 0.35, d[1] + (rng() - 0.5) * 0.35), speed, up, spin, rng)
            rig["strikes"] += 1
            k["hit"] = True
            # the body answers THIS violence: record where the hit came from
            rig.setdefault("_beat_strikes", []).append({"pos": (body["p"][0], body["p"][1]), "speed": speed})
        for ds in rig["debris_sets"]:
            if beat_idx not in ds["bound"]:
                continue
            rng = mulberry32(fnv1a(str(ds.get("root_pos", [0]))) ^ (0xD3 + beat_idx))
            for ch in ds["chunks"]:
                d = (ch["p"][0] - ds["root_pos"][0], ch["p"][1] - ds["root_pos"][1])
                n = math.sqrt(d[0] * d[0] + d[1] * d[1]) or 1.0
                jitter = (rng() - 0.5) * 0.5
                speed = (1.6 + 2.6 * ds["intensity"]) * (0.6 + 0.8 * rng())
                _strike(ch, (d[0] / n + jitter, d[1] / n + jitter), speed, 0.9 + 1.5 * ds["intensity"] * rng(), 6.0 + 7.0 * rng(), rng)
            ds["kicked"] = True
            rig["strikes"] += 1
            rig.setdefault("_beat_strikes", []).append({"pos": (ds["root_pos"][0], ds["root_pos"][1]),
                                                        "speed": 1.6 + 2.6 * ds["intensity"]})
        for sw in rig["sways"]:
            if beat_idx in sw["bound"]:
                sw["omega"] += sw["sign"] * (1.9 + 2.4 * sw["intensity"]) * (1.0 + wind * 0.8)

        # ── REACTION: the body answers the beat's violence ──
        r = rig.get("reaction")
        if r is not None and beat_idx in r["bound"]:
            dx, dy = r["dir"]
            strikes_here = rig.get("_beat_strikes") or []
            if strikes_here:
                # Newton's third law: recoil AWAY from where the hit came
                # from, blended with the seeded dodge direction
                ax_ = sum(r["home_pos"][0] - s["pos"][0] for s in strikes_here)
                ay_ = sum(r["home_pos"][1] - s["pos"][1] for s in strikes_here)
                ux, uy = _unit_xy(ax_, ay_)
                if ux or uy:
                    dx, dy = _unit_xy(ux * 0.65 + dx * 0.35, uy * 0.65 + dy * 0.35)
            mag = 0.5 + 1.1 * r["intensity"]
            r["v"][0] = dx * mag
            r["v"][1] = dy * mag
            r["settled"] = False
            r["recover_frame"] = None  # a re-stagger forgets the earlier rest
            rig["reactions"] = rig.get("reactions", 0) + 1
        rig["_beat_strikes"] = []

    # ── KNOCK + DEBRIS: integrate every body under the probed law ──
    for k in rig["knocks"]:
        body = k["body"]
        if body is not None:
            _integrate(body, dt, frame)
            rig["bounces"] = max(rig["bounces"], body.get("bounces", 0))
            rig["max_speed"] = max(rig["max_speed"], body.get("max_speed", 0.0))
            if body.get("settled") and body.get("settle_frame"):
                rig["settle_frame"] = body["settle_frame"]  # the LAST rest is the honest one
    for ds in rig["debris_sets"]:
        for ch in ds["chunks"]:
            _integrate(ch, dt, frame)
            rig["bounces"] = max(rig["bounces"], ch.get("bounces", 0))
            rig["max_speed"] = max(rig["max_speed"], ch.get("max_speed", 0.0))
            if ch.get("settled") and ch.get("settle_frame"):
                rig["settle_frame"] = ch["settle_frame"]

    # ── SWAY: the damped pendulum rides the wind the cloth hangs from ──
    for sw in rig["sways"]:
        g_over_l = GRAVITY / -sw["length"]
        drive = wind * 1.9 * sw["sign"]
        alpha = -(g_over_l) * math.sin(sw["theta"]) - 0.55 * sw["omega"] + drive
        sw["omega"] += alpha * dt
        sw["theta"] += sw["omega"] * dt
        sw["pivot"].rotation_euler.y = sw["theta"]
        rig["max_swing"] = max(rig["max_swing"], abs(math.degrees(sw["theta"])))

    # ── REACTION: the stagger spring - impulse, lurch, recover, REST ──
    # (the wind has NO force here: the cloth answers the air, the body
    # answers the violence)
    r = rig.get("reaction")
    if r is not None:
        if not r["settled"]:
            ax = -REACTION_STIFFNESS * r["off"][0] - REACTION_DAMPING * r["v"][0]
            ay = -REACTION_STIFFNESS * r["off"][1] - REACTION_DAMPING * r["v"][1]
            r["v"][0] += ax * dt
            r["v"][1] += ay * dt
            r["off"][0] += r["v"][0] * dt
            r["off"][1] += r["v"][1] * dt
            sp = math.sqrt(r["v"][0] * r["v"][0] + r["v"][1] * r["v"][1])
            m = math.sqrt(r["off"][0] * r["off"][0] + r["off"][1] * r["off"][1])
            if sp < REACTION_SETTLE_V and m < REACTION_SETTLE_X:
                r["off"][0] = 0.0
                r["off"][1] = 0.0
                r["v"][0] = 0.0
                r["v"][1] = 0.0
                r["settled"] = True
                r["recover_frame"] = frame  # the LAST rest is the honest one
        off, v = r["off"], r["v"]
        root = r["root"]
        mag_off = math.sqrt(off[0] * off[0] + off[1] * off[1])
        dip = -min(0.045, mag_off * 0.24)  # the body sinks into the stagger
        root.location = (root.location.x + off[0], root.location.y + off[1], root.location.z + dip)
        pitch = math.radians(clamp(-v[1] * REACTION_LEAN_GAIN, -REACTION_LEAN_MAX, REACTION_LEAN_MAX))
        roll = math.radians(clamp(v[0] * REACTION_LEAN_GAIN, -REACTION_LEAN_MAX, REACTION_LEAN_MAX))
        hr = r["home_rot"]
        root.rotation_euler = (hr[0] + pitch, hr[1] + roll, hr[2])
        if r["spine"] is not None:
            r["spine"].rotation_euler.x += math.radians(clamp(-v[1] * 2.6, -5.0, 5.0))
        if r["head"] is not None:
            r["head"].rotation_euler.x += math.radians(clamp(v[1] * 2.0, -4.0, 4.0))  # the head lags opposite
        jerk = math.sqrt(v[0] * v[0] + v[1] * v[1])
        r["figure"]["_stagger"] = {"vx": v[0], "vy": v[1], "jerk": jerk}
        rig["max_offset"] = max(rig.get("max_offset", 0.0), mag_off)
        rig["max_lean"] = max(rig.get("max_lean", 0.0),
                              math.degrees(math.sqrt(pitch * pitch + roll * roll)))
