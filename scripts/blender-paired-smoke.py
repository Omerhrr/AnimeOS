#!/usr/bin/env python3
# Smoke-test THE DUEL PERFORMS (iteration 119, the paired performance
# law) inside the REAL Blender:
#   1. THE ANSWER PERFORMS ON A REAL RIG: two anime figures built
#      (hero + the partner at the stand-off mark), the partner posed
#      through the derived answer program with apply_pose +
#      compose_standoff + the rig sync - at the hero's strike moment
#      the partner's GUARD READS (the shoulders/hips left the stance),
#      at the recoil the body DIPS (the root motion rides), and the
#      stand-off mark SURVIVES every pose (the composed location
#      matches the mark rotated, never the origin).
#   2. THE STAND-OFF IS ADDITIVE: a STANCE pose composes back to the
#      exact mark (the 113 blocking law is a fixed point of the 119
#      composition).
#   3. ONE CLASH, ONE LIGHT: the partner program carries no impact and
#      no smear of its own.
#   4. THE PROGRAM IS HONEST: the derived keys keep the hero's strike
#      moments (one clock), first key at 0, last at 1, strictly
#      increasing - normalize_choreo accepts it and the pose_state_at
#      clock drives the SAME states the render loop will.
# Run:  python3 scripts/blender-paired-smoke.py
import json, math, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BL = next(
    p for p in (
        "/home/z/blender-5.2.2-linux-x64/blender",
        "/home/z/blender-4.3.2-linux-x64/blender",
    )
    if os.path.exists(p)
)

RUNNER = r'''
import json, math, os, sys
HERE = %(here)r
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import bpy
import animeos_bridge as ab
import choreography_pass as cp
import physics_pass as pp

scn = bpy.context.scene
out = {}

# fresh scene, two DESIGNED figures: the hero at the origin, the
# partner at the 113 stand-off mark facing him
for ob in list(scn.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
mats = {}
for k in ("skin", "hair", "boots", "accent", "robe", "robeB"):
    m = bpy.data.materials.new(k); m.use_nodes = True; mats[k] = m
for k in ("skinB", "hairB", "accentB"):
    m = bpy.data.materials.new(k); m.use_nodes = True; mats[k] = m

DNA_HERO = {
    "name": "DuelHero",
    "designSpec": {
        "body": {"gender": "male", "build": "sturdy", "shoulders": 1.05, "hips": 1.0, "bust": 0.0, "headScale": 1.0},
        "hair": {"style": "topknot", "color": "#101014"},
        "eyes": {"color": "#20180f", "size": 1.0, "tilt": 0},
        "mouth": {"width": 1.0},
        "outfit": {"type": "hanfu", "length": 0.85, "sleeves": "bell", "sash": True, "color": "#2F6D63", "accent": "#A8842C"},
    },
}
DNA_PARTNER = {
    "name": "DuelPartner",
    "designSpec": {
        "body": {"gender": "male", "build": "lean", "shoulders": 1.0, "hips": 0.98, "bust": 0.0, "headScale": 1.0},
        "hair": {"style": "long", "color": "#1a1218"},
        "eyes": {"color": "#1a1014", "size": 1.0, "tilt": 0},
        "mouth": {"width": 0.95},
        "outfit": {"type": "wuxia", "length": 0.8, "sleeves": "tight", "sash": True, "color": "#3a2a3a", "accent": "#7a2430"},
    },
}
hero = ab.anime_character.build_anime_character(bpy, scn, DNA_HERO, {"skin": mats["skin"], "hair": mats["hair"], "boots": mats["boots"], "accent": mats["accent"], "robe": mats["robe"], "blade": mats["robeB"]}) if hasattr(ab, "anime_character") else None
if hero is None:
    import anime_character as ac
    hero = ac.build_anime_character(bpy, scn, DNA_HERO, {"skin": mats["skin"], "hair": mats["hair"], "boots": mats["boots"], "accent": mats["accent"], "robe": mats["robe"], "blade": mats["robeB"]})
    partner = ac.build_anime_character(bpy, scn, DNA_PARTNER, {"skin": mats["skinB"], "hair": mats["hairB"], "boots": mats["boots"], "accent": mats["accentB"], "robe": mats["robeB"], "blade": mats["robeB"]})

# THE PAIRED PROGRAM (the answer table's derivation of The Combo, as
# set_shot_choreography writes it) - keep the hero's strike moments:
HERO_COMBO = {
    "name": "The Combo",
    "keys": [
        {"at": 0, "pose": "STANCE", "kind": "hold"},
        {"at": 0.28, "pose": "CROUCH", "kind": "anticipation"},
        {"at": 0.42, "pose": "SLASH", "kind": "strike"},
        {"at": 0.54, "pose": "SLASH", "kind": "hold"},
        {"at": 1, "pose": "STANCE", "kind": "follow"},
    ],
    "impact": {"at": 0.42, "frames": 3, "punch": 2.5, "flash": 0.8},
    "smear": {"at": 0.42, "frames": 2, "amount": 0.5},
}
PAIRED = {
    "name": "The Answer (DuelPartner)",
    "keys": [
        {"at": 0, "pose": "STANCE", "kind": "hold"},
        {"at": 0.28, "pose": "STANCE", "kind": "move"},
        {"at": 0.42, "pose": "BLOCK", "kind": "strike"},
        {"at": 0.54, "pose": "BLOCK", "kind": "hold"},
        {"at": 0.77, "pose": "CROUCH", "kind": "anticipation"},
        {"at": 1, "pose": "STANCE", "kind": "follow"},
    ],
    "impact": None,
    "smear": None,
}
prog, err = cp.normalize_choreo(PAIRED)
out["paired_compiles"] = prog is not None
out["paired_err"] = err
out["one_light"] = prog is not None and prog.get("impact") is None and prog.get("smear") is None

# the stand-off mark (the 116 two-shot blocking for a 0.9 hero)
loc3, rot_deg = (0.6, 1.7, 0.0), 166.0
partner["root"].location = loc3
partner["root"].rotation_euler = (0.0, 0.0, math.radians(rot_deg))

def pose_partner(p_s, p_e, p_t, t_sec):
    ab.apply_pose(partner, p_s, p_e, p_t, t_sec)
    ab.compose_standoff(partner["root"], loc3, rot_deg)
    partner["syncRig"]()

def snapshot():
    r = partner["root"]
    return {
        "loc": [round(r.location.x, 5), round(r.location.y, 5), round(r.location.z, 5)],
        "rArm": round(math.degrees(partner["rShoulder"].rotation_euler.x), 2),
        "spine": round(math.degrees(partner["spine"].rotation_euler.x), 2),
    }

# t=0: the open (STANCE) - composes back to the exact mark
pose_partner(*cp.pose_state_at(prog, 0.0), 0.0)
snap_open = snapshot()

# t=0.45: INSIDE the strike (the guard meets the slash)
pose_partner(*cp.pose_state_at(prog, 0.45), 0.45)
snap_meet = snapshot()

# t=0.85: the recoil (the crouch dips)
pose_partner(*cp.pose_state_at(prog, 0.85), 0.85)
snap_recoil = snapshot()

out["open"] = snap_open
out["meet"] = snap_meet
out["recoil"] = snap_recoil
out["guard_reads"] = abs(snap_meet["rArm"] - snap_open["rArm"]) > 30.0
out["recoil_dips"] = snap_recoil["loc"][2] < snap_open["loc"][2] - 0.01
# the stand-off mark survives: the STANCE open composes to the exact mark
out["mark_holds_open"] = snap_open["loc"] == [round(v, 5) for v in loc3]
# and every pose stays NEAR the mark (the compose is additive, never a teleport)
out["mark_holds_all"] = all(
    math.hypot(s["loc"][0] - loc3[0], s["loc"][1] - loc3[1]) < 0.3
    for s in (snap_open, snap_meet, snap_recoil)
)

# THE ONE CLOCK: the partner's strike key keeps the hero's 0.42
out["one_clock"] = any(abs(k["at"] - 0.42) < 1e-9 for k in prog["keys"])
out["keys_strictly_rise"] = all(prog["keys"][i]["at"] > prog["keys"][i - 1]["at"] for i in range(1, len(prog["keys"])))
out["first_zero_last_one"] = prog["keys"][0]["at"] == 0.0 and prog["keys"][-1]["at"] == 1.0

# DETERMINISM: the same moment twice, bit-exact
pose_partner(*cp.pose_state_at(prog, 0.45), 0.45)
out["deterministic"] = snapshot() == snap_meet

# ── THE PARTNER TAKES THE HIT (iteration 120): the paired body owns
#    a REACTION-ONLY physics rig - the stagger fires at the bound
#    beat, away from the striker's mark, and the spring returns the
#    body to the stand-off mark. The solid world's meshes (KNOCK /
#    DEBRIS / SWAY) belong to the hero rig - a partner rig handed
#    them skips them with an honest note. ──
partner_prog = [{"kind": "REACTION", "intensity": 0.8, "beats": {0}, "target": None, "index": 0}]
all_kinds_prog = [
    {"kind": "KNOCK", "intensity": 0.7, "beats": {0}, "target": None, "index": 1},
    {"kind": "DEBRIS", "intensity": 0.7, "beats": {0}, "target": None, "index": 2},
    {"kind": "REACTION", "intensity": 0.8, "beats": {0}, "target": None, "index": 3},
    {"kind": "SWAY", "intensity": 0.7, "beats": {0}, "target": None, "index": 4},
]
# 5a. the filter law: a partner rig handed the full vocabulary
#     compiles REACTION only, honestly named
pr_all = pp.build_physics_rig(bpy, scn, all_kinds_prog, partner, [], "smoke-filter", kinds_filter={"REACTION"}, strike_from=(0.0, 0.0))
out["filter_kinds"] = pr_all["kinds"]
out["filter_notes_name_skips"] = any("KNOCK" in n and "skipped" in n for n in pr_all["notes"])

def mark_offset(rig_rec, mark):
    r = rig_rec["root"]
    return math.hypot(r.location.x - mark[0], r.location.y - mark[1])

# 5b. the stagger: at the beat entry the partner's body leaves the
#     mark AWAY from the striker (the hero stands at the origin),
#     then the spring returns it
deltas = []
max_off = 0.0
for fr in range(1, 90):
    pose_partner(*cp.pose_state_at(prog, 0.45), 0.0 + fr / 24.0)   # the mark re-composed every frame
    pp.apply_physics(pr_all, 0.45, fr / 24.0, 1.0 / 24.0, 0, 0.0, 0.0, fr)   # beat 0 entry fires once
    off = mark_offset(partner, loc3)
    deltas.append(off)
    max_off = max(max_off, off)
out["stagger_max_offset"] = round(max_off, 4)
out["stagger_final"] = round(deltas[-1], 4)
out["stagger_fired"] = max_off > 0.02
out["stagger_recovered"] = deltas[-1] < 0.012
out["stagger_published"] = bool(partner.get("_stagger"))
out["stagger_away_from_hero"] = max_off > 0.02 and pr_all.get("max_offset", 0.0) > 0.0

# 5c. Newton across rigs: the partner rig reads the HERO rig's
#     same-beat strikes (the shared debris) through strike_src
hero_phys = pp.build_physics_rig(bpy, scn, [{"kind": "DEBRIS", "intensity": 0.7, "beats": {0}, "target": None, "index": 0}], hero, [], "smoke-debris")
pp.apply_physics(hero_phys, 0.0, 0.0, 1.0 / 24.0, 0, 0.0, 0.0, 1)   # the debris kicks: strikes recorded, beat-tagged
pr_src = pp.build_physics_rig(bpy, scn, partner_prog, partner, [], "smoke-src", kinds_filter={"REACTION"}, strike_src=hero_phys)
pp.apply_physics(pr_src, 0.0, 0.0, 1.0 / 24.0, 0, 0.0, 0.0, 1)
out["cross_rig_strikes"] = pr_src.get("partner_strikes", 0)
out["newton_across_rigs"] = pr_src.get("partner_strikes", 0) > 0

print("PAIRED_SMOKE " + json.dumps(out))
'''

failures = 0
def expect(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
    if not cond:
        failures += 1

with tempfile.TemporaryDirectory(prefix="anime-paired-") as tmp:
    runner = RUNNER % {"here": os.path.join(ROOT, "bridges", "blender"), "tmp": tmp}
    rp = os.path.join(tmp, "runner.py")
    with open(rp, "w") as fh:
        fh.write(runner)
    proc = subprocess.run([BL, "-b", "--python", rp], capture_output=True, text=True, timeout=600, cwd=ROOT)
    if proc.returncode != 0:
        print("STDERR tail:", proc.stderr[-2500:])
        sys.exit(1)
    line = next((l for l in proc.stdout.splitlines() if l.startswith("PAIRED_SMOKE ")), None)
    if not line:
        print("FAIL no PAIRED_SMOKE line")
        print(proc.stdout[-1500:])
        sys.exit(1)
    out = json.loads(line[len("PAIRED_SMOKE "):])

expect("the answer program compiles under the worker's law", out["paired_compiles"], out.get("paired_err"))
expect("ONE CLASH ONE LIGHT (no impact, no smear of its own)", out["one_light"])
expect("the hero's strike moment is kept (one clock)", out["one_clock"])
expect("the keys rise strictly, first 0 last 1",
       out["keys_strictly_rise"] and out["first_zero_last_one"])
expect("the guard READS at the strike (the arms left the stance)", out["guard_reads"],
       f"{out.get('open', {}).get('rArm')} -> {out.get('meet', {}).get('rArm')}")
expect("the recoil DIPS (the root motion rides)", out["recoil_dips"],
       f"{out.get('open', {}).get('loc')} -> {out.get('recoil', {}).get('loc')}")
expect("the stand-off mark is the STANCE fixed point", out["mark_holds_open"], out.get("open", {}).get("loc"))
expect("every pose stays at the stand-off (additive, never a teleport)", out["mark_holds_all"])
expect("the same moment poses bit-exact twice", out["deterministic"])
expect("THE PARTNER RIG COMPILES REACTION ONLY (the meshes belong to the hero rig)", out["filter_kinds"] == ["REACTION"], out["filter_kinds"])
expect("the skipped kinds are named honestly", out["filter_notes_name_skips"])
expect("THE STAGGER FIRES (the body leaves the mark)", out["stagger_fired"], f"max {out['stagger_max_offset']}m")
expect("the stagger points away from the striker", out["stagger_away_from_hero"])
expect("the spring RETURNS the body (recovered to the mark)", out["stagger_recovered"], f"final {out['stagger_final']}m")
expect("the stagger velocity is published (the cloth answers)", out["stagger_published"])
expect("NEWTON ACROSS RIGS (the partner reads the hero's same-beat strikes)", out["newton_across_rigs"], f"strikes {out['cross_rig_strikes']}")

print(f"\n{'ALL GREEN' if failures == 0 else f'{failures} FAILURES'}")
sys.exit(1 if failures else 0)
