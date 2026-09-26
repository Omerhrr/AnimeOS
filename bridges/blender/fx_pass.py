# ─────────────────────────────────────────────────────────────
# FX PASS (v8.0): THE BEATS IGNITE
#
# The camera performs the beats (the motion grammar), the cloth and
# hair RIDE the beats (the secondary motion rig), and now the WORLD
# answers them. A directed FX program is compiled here into REAL
# emissive geometry driven per frame by the SAME beat clock as the
# camera and the springs:
#
#   TRAIL  - the weapon's energy ribbon: a fan of emissive quads at
#            the blade whose sweep and glow track the pose velocity
#            (a fast slash flares the trail, a hold fades it out).
#   BURST  - the impact: a shockwave ring plus emissive shards that
#            ignite when the playhead ENTERS a bound beat, expand
#            and fade - the spectacle lands where the cut lands.
#   AURA   - the qi shell: an emissive torus at the figure's waist
#            breathing with the beat's wind call (the same driver
#            the cloth hangs from) over a slow fixed phase.
#   MOTES  - the air itself: a seeded scatter of tiny emissive
#            points drifting up through the volume, their sway and
#            rise scaling with the beat's wind.
#
# Deterministic by the seed law: every scatter, direction and phase
# derives from fnv1a(job_id) ^ program index - the same grammar and
# the same fx always land the same spectacle, bit for bit.
#
# This module is self-contained (math + json only): the bridge hands
# it everything the frame loop already knows (the beat under the
# playhead, the wind, the pose velocity), so no import ever circles
# back into the bridge.
# ─────────────────────────────────────────────────────────────

import json
import math

FX_KINDS = ("TRAIL", "BURST", "AURA", "MOTES")


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


def hex_to_rgb(h, fallback=(0.2, 0.2, 0.22)):
    """"#7dd3fc" / "7dd3fc" -> (r, g, b) floats; a bad hex falls back
    honestly (never a crash)."""
    try:
        s = str(h).strip().lstrip("#")
        if len(s) != 6:
            return fallback
        return (int(s[0:2], 16) / 255.0, int(s[2:4], 16) / 255.0, int(s[4:6], 16) / 255.0)
    except Exception:  # noqa: BLE001
        return fallback


def normalize_fx(raw, beat_count):
    """Parse a shot's fx payload into validated programs
    [{kind, rgb, intensity, beats(set of bound indices)}]. A program
    whose every beat binding lies beyond the grammar's reach is
    skipped with an honest note - a broken note never stops a shoot.
    Returns (programs, notes)."""
    notes = []
    if not isinstance(raw, list) or len(raw) == 0:
        return [], notes
    programs = []
    for i, p in enumerate(raw):
        if not isinstance(p, dict):
            notes.append(f"program {i + 1}: not an object - skipped")
            continue
        kind = str(p.get("kind") or "").upper()
        if kind not in FX_KINDS:
            notes.append(f"program {i + 1}: unknown kind '{kind}' - skipped (the worker performs: {', '.join(FX_KINDS)})")
            continue
        color = p.get("color")
        rgb = hex_to_rgb(color) if color else None  # None rides the hero's energy color
        try:
            intensity = clamp(float(p.get("intensity", 0.7)), 0.0, 1.0)
        except (TypeError, ValueError):
            intensity = 0.7
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
        programs.append({"kind": kind, "rgb": rgb, "intensity": intensity, "beats": bound, "index": i})
    return programs, notes


def _emission_mat(bpy, name, rgb, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        nodes.remove(bsdf)
    em = nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    em.inputs[1].default_value = strength
    out = nodes.get("Material Output")
    mat.node_tree.links.new(em.outputs[0], out.inputs[0])
    return mat


def build_fx_rig(bpy, scn, programs, figure, energy_hex, job_id):
    """Compile the programs into real objects parented into the scene:
    the trail fan hangs off the blade (or the right elbow when the
    figure carries no weapon - an honest fallback), the burst anchors
    at the figure's chest, the aura wraps the root, the motes scatter
    through the volume. A program that cannot anchor is skipped with
    a note. Returns the rig the frame loop drives."""
    notes = []
    rig = {
        "trail": None,
        "bursts": [],
        "auras": [],
        "motes": None,
        "prev_beat": -1,
        "fired": 0,
        "trail_peak": 0.0,
        "max_ring": 0.0,
        "prev_row": None,
        "notes": notes,
        "kinds": [],
        "all_bound": set(),
        "programs": len(programs),
    }
    root = figure.get("root") if isinstance(figure, dict) else None
    blade_anchor = None
    if isinstance(figure, dict):
        blade_anchor = figure.get("blade") or figure.get("rElbow")

    for pi, prog in enumerate(programs):
        kind = prog["kind"]
        rgb = prog["rgb"] or hex_to_rgb(energy_hex)
        inten = prog["intensity"]
        rng = mulberry32(fnv1a(str(job_id)) ^ (0xF10 + pi))
        rig["all_bound"] |= set(prog["beats"])

        if kind == "TRAIL":
            if blade_anchor is None:
                notes.append("TRAIL: no blade or hand to ride - skipped honestly")
                continue
            fan_root = bpy.data.objects.new(f"FxTrail{pi + 1}_Root", None)
            scn.collection.objects.link(fan_root)
            fan_root.parent = blade_anchor
            fan_root.location = (0.0, 0.0, 0.0)
            mat = _emission_mat(bpy, f"FxTrailMat{pi + 1}", rgb, 2.0)
            quads = []
            n = 7
            for q in range(n):
                w, h = 0.05 * (1.0 - q / (n * 1.6)), 0.085
                z0 = 0.06 + q * h
                mesh = bpy.data.meshes.new(f"FxTrail{pi + 1}_q{q}")
                mesh.from_pydata([(-w, 0, z0), (w, 0, z0), (w * 0.7, 0, z0 + h), (-w * 0.7, 0, z0 + h)], [], [(0, 1, 2, 3)])
                mesh.update()
                ob = bpy.data.objects.new(f"FxTrail{pi + 1}_q{q}", mesh)
                scn.collection.objects.link(ob)
                ob.parent = fan_root
                ob.data.materials.append(mat)
                quads.append(ob)
            rig["trail"] = {"quads": quads, "mat": mat, "intensity": inten, "phase": rng() * 6.28}
            rig["kinds"].append("TRAIL")

        elif kind == "BURST":
            if root is None:
                notes.append("BURST: no figure to anchor the impact - skipped honestly")
                continue
            broot = bpy.data.objects.new(f"FxBurst{pi + 1}_Root", None)
            scn.collection.objects.link(broot)
            broot.parent = root
            broot.location = (0.0, 0.0, 1.0)  # chest height in figure-local space
            ring_mat = _emission_mat(bpy, f"FxBurstRingMat{pi + 1}", rgb, 0.0)
            bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.03, location=(0, 0, 0))
            ring = bpy.context.active_object
            ring.name = f"FxBurst{pi + 1}_Ring"
            ring.scale = (0.001, 0.001, 0.001)
            ring.data.materials.append(ring_mat)
            ring.parent = broot
            ring.rotation_euler = (math.radians(90), 0, 0)  # flat across the floor plane
            shard_mat = _emission_mat(bpy, f"FxBurstShardMat{pi + 1}", rgb, 0.0)
            shards = []
            for s in range(9):
                theta = s * (math.pi * 2.0 / 9.0) + rng() * 0.5
                elev = rng() * 1.1 - 0.25
                d = (math.cos(theta) * math.cos(elev), math.sin(theta) * math.cos(elev), math.sin(elev) + 0.25)
                ln = math.sqrt(sum(c * c for c in d)) or 1.0
                shards.append({"dir": (d[0] / ln, d[1] / ln, d[2] / ln), "ob": None, "spin": rng() * 6.28})
            for si, sh in enumerate(shards):
                bpy.ops.mesh.primitive_cone_add(radius1=0.05, depth=0.17, vertices=3, location=(0, 0, 0))
                ob = bpy.context.active_object
                ob.name = f"FxBurst{pi + 1}_s{si}"
                ob.scale = (0.001, 0.001, 0.001)
                ob.data.materials.append(shard_mat)
                ob.parent = broot
                shards[si]["ob"] = ob
            rig["bursts"].append({
                "ring": ring, "ring_mat": ring_mat, "shards": shards, "shard_mat": shard_mat,
                "intensity": inten, "bound": set(prog["beats"]), "t": None, "seed_phase": rng() * 6.28,
            })
            rig["kinds"].append("BURST")

        elif kind == "AURA":
            if root is None:
                notes.append("AURA: no figure to wrap - skipped honestly")
                continue
            mat = _emission_mat(bpy, f"FxAuraMat{pi + 1}", rgb, 1.0)
            bpy.ops.mesh.primitive_torus_add(major_radius=0.52, minor_radius=0.045, location=(0, 0, 0))
            torus = bpy.context.active_object
            torus.name = f"FxAura{pi + 1}"
            torus.scale = (0.001, 0.001, 0.001)
            torus.data.materials.append(mat)
            torus.parent = root
            torus.location = (0.0, 0.0, 0.95)  # waist height, figure-local
            rig["auras"].append({"ob": torus, "mat": mat, "intensity": inten, "phase": rng() * 6.28})
            rig["kinds"].append("AURA")

        elif kind == "MOTES":
            motes = []
            mat = _emission_mat(bpy, f"FxMotesMat{pi + 1}", rgb, 1.0)
            for m in range(44):
                r = 0.011 + rng() * 0.02
                bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r,
                                                      location=((rng() - 0.5) * 9.0, (rng() - 0.5) * 9.0, 0.1 + rng() * 3.2))
                ob = bpy.context.active_object
                ob.name = f"FxMotes{pi + 1}_{m}"
                ob.data.materials.append(mat)
                motes.append({
                    "ob": ob,
                    "base": (ob.location.x, ob.location.y, ob.location.z),
                    "rise": 0.06 + rng() * 0.12,
                    "amp": 0.02 + rng() * 0.05,
                    "speed": 0.5 + rng() * 1.1,
                    "phase": rng() * 6.28,
                })
            rig["motes"] = {"motes": motes, "mat": mat, "intensity": inten}
            rig["kinds"].append("MOTES")

    return rig


def apply_fx(rig, t, t_sec, dt, beat_idx, wind, vel):
    """Drive every compiled program for this frame. The beat under the
    playhead decides what the world is doing: the burst fires when the
    playhead ENTERS a bound beat (the spectacle lands where the cut
    lands), the trail flares with the pose velocity, the aura breathes
    with the wind call the cloth hangs from, the motes rise and sway
    with it. Deterministic: fixed phases, no reads of render state."""
    if not rig:
        return None

    # ── TRAIL: sweep + glow track the pose velocity ──
    tr = rig.get("trail")
    if tr is not None:
        sweep = clamp(vel / 45.0, 0.0, 1.0)
        flicker = 0.85 + 0.15 * math.sin(t_sec * 21.0 + tr["phase"])
        for qi, ob in enumerate(tr["quads"]):
            n = len(tr["quads"])
            ob.rotation_euler.x = math.radians(-sweep * 95.0 * (qi + 1) / n)
            k = 0.35 + 0.65 * sweep
            ob.scale = (k, k, (1.0 - qi / (n * 2.4)) * (0.55 + 0.45 * k))
        strength = (0.35 + 13.0 * sweep) * tr["intensity"] * flicker
        tr["mat"].node_tree.nodes["Emission"].inputs[1].default_value = strength
        if sweep > 0.03:
            rig["trail_peak"] = max(rig["trail_peak"], strength)

    # ── BURST: fire on entering a bound beat, expand + fade ──
    if beat_idx != rig["prev_beat"]:
        for b in rig["bursts"]:
            if beat_idx in b["bound"]:
                b["t"] = 0.0
                rig["fired"] += 1
        rig["prev_beat"] = beat_idx
    for b in rig["bursts"]:
        if b["t"] is None:
            continue
        b["t"] += dt
        p = b["t"] / 0.38
        if p >= 1.0:
            b["ring"].scale = (0.001, 0.001, 0.001)
            b["ring_mat"].node_tree.nodes["Emission"].inputs[1].default_value = 0.0
            b["shard_mat"].node_tree.nodes["Emission"].inputs[1].default_value = 0.0
            for sh in b["shards"]:
                sh["ob"].scale = (0.001, 0.001, 0.001)
            b["t"] = None
            continue
        ease = 1.0 - (1.0 - p) * (1.0 - p)
        rs = (0.18 + 2.3 * ease) * (0.55 + 0.8 * b["intensity"])
        b["ring"].scale = (rs, rs, rs)
        rig["max_ring"] = max(rig["max_ring"], rs)
        b["ring_mat"].node_tree.nodes["Emission"].inputs[1].default_value = 7.0 * ((1.0 - p) ** 1.6) * b["intensity"]
        b["shard_mat"].node_tree.nodes["Emission"].inputs[1].default_value = 6.0 * (1.0 - p) * b["intensity"]
        for sh in b["shards"]:
            d = sh["dir"]
            dist = 0.25 + 1.8 * ease
            sh["ob"].location = (d[0] * dist, d[1] * dist, 0.15 + d[2] * dist * 0.6)
            k = max(0.001, 1.0 - p)
            sh["ob"].scale = (k, k, k)
            sh["ob"].rotation_euler = (sh["spin"] + p * 4.0, sh["spin"] * 0.7, 0.0)

    # ── AURA: breathe with the wind call (the cloth's driver) ──
    for a in rig["auras"]:
        breathe = 1.0 + 0.14 * math.sin(t_sec * 1.35 + a["phase"]) + wind * 0.45
        s = 0.001 + breathe
        a["ob"].scale = (s, s, s * 0.55)
        a["mat"].node_tree.nodes["Emission"].inputs[1].default_value = (
            (1.0 + 4.6 * wind) * a["intensity"] * (0.8 + 0.2 * math.sin(t_sec * 2.1 + a["phase"]))
        )

    # ── MOTES: rise and sway with the wind ──
    mo = rig.get("motes")
    if mo is not None:
        mo["mat"].node_tree.nodes["Emission"].inputs[1].default_value = (0.7 + 2.6 * wind) * mo["intensity"]
        for m in mo["motes"]:
            bx, by, bz = m["base"]
            z = bz + m["rise"] * (1.0 + 2.2 * wind) * t_sec
            z = z % 3.4 + 0.08
            sway_k = m["amp"] * (1.0 + wind * 2.0)
            m["ob"].location = (
                bx + math.sin(t_sec * m["speed"] + m["phase"]) * sway_k,
                by + math.cos(t_sec * m["speed"] * 0.8 + m["phase"]) * sway_k,
                z,
            )
    return rig
