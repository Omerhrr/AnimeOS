# Smoke-test THE FX TRANSPORT GUARD (iteration 149) inside the REAL
# Blender worker (direct half, the hairshade-smoke harness pattern):
# the 141 conviction was light transport - the fx emitters re-dye the
# hero's dark masses with a hue the dye does not carry - and the two
# material-side cures of that night were cut by their own receipts,
# so the guard is LIGHT-SIDE: every fx emitter object loses DIFFUSE
# ray visibility (the flood dies) while CAMERA + GLOSSY stay (the
# show and the glint survive), and one bounded POINT light of the
# program's own hue re-carries the ambience at the law's share -
# deterministic in energy and placement (the seed law holds).
#
# Run: blender -b -P scripts/blender-fxtransport-smoke.py
#      (or: BLENDER=<bin> python3 scripts/blender-fxtransport-smoke.py)
import os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "bridges", "blender", "fx_pass.py")

BLENDER = os.environ.get("BLENDER") or next(
    (p for p in ("/home/z/blender-5.2.2-linux-x64/blender", "/home/z/blender-4.3.2-linux-x64/blender") if os.path.exists(p)),
    "blender",
)

failures = 0
def expect(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
    if not cond:
        failures += 1

DIRECT = r"""
import importlib.util, json, math, sys
import bpy

spec = importlib.util.spec_from_file_location("fx_pass", sys.argv[-1])
fx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fx)

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

def fresh_scene():
    scn = bpy.context.scene
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    return scn

def figure_stub():
    scn = fresh_scene()
    root = bpy.data.objects.new("FigureRoot", None)
    scn.collection.objects.link(root)
    blade = bpy.data.objects.new("BladeAnchor", None)
    scn.collection.objects.link(blade)
    return scn, {"root": root, "blade": blade}

def programs():
    return [
        {"kind": "TRAIL", "rgb": (0.698, 0.541, 1.0), "intensity": 0.8, "beats": [1, 3]},
        {"kind": "AURA",  "rgb": (0.698, 0.541, 1.0), "intensity": 0.6, "beats": [0, 2]},
        {"kind": "BURST", "rgb": (1.0, 0.369, 0.427), "intensity": 0.9, "beats": [2]},
        {"kind": "MOTES", "rgb": (0.698, 0.541, 1.0), "intensity": 0.4, "beats": []},
    ]

# ── the pure derivation ──
ok("p1 the transport energy is the law's bounded derivation",
   abs(fx.fx_transport_energy(0.8) - 60.0 * 0.8 * fx.FX_TRANSPORT_SHARE) < 1e-9,
   f"{fx.fx_transport_energy(0.8)}")
ok("p2 zero intensity carries zero transport", fx.fx_transport_energy(0.0) == 0.0)
ok("p3 a negative intensity clamps to zero", fx.fx_transport_energy(-0.5) == 0.0)
ok("p4 the share is a real bound (0 < share < 1)", 0.0 < fx.FX_TRANSPORT_SHARE < 1.0,
   f"share {fx.FX_TRANSPORT_SHARE}")

# ── the real rig inside Blender ──
scn, fig = figure_stub()
rig = fx.build_fx_rig(bpy, scn, programs(), fig, "#b28aff", "smoke-149-rig")

emitters = []
if rig["trail"]:
    emitters += [q.name for q in rig["trail"]["quads"]]
for a in rig["auras"]:
    emitters.append(a["ob"].name)
for b in rig["bursts"]:
    emitters.append(b["ring"].name)
    emitters += [s["ob"].name for s in b["shards"] if s["ob"]]
if rig["motes"]:
    emitters += [m["ob"].name for m in rig["motes"]["motes"]]

ok("r1 the rig compiled emitters for all four programs",
   rig["trail"] is not None and rig["auras"] and rig["bursts"] and rig["motes"] and len(emitters) >= 4,
   f"{len(emitters)} emitters, kinds {rig['kinds']}")

by_name = {ob.name: ob for ob in bpy.data.objects}
bad_diffuse = [n for n in emitters if n in by_name and by_name[n].visible_diffuse is not False]
ok("r2 EVERY fx emitter lost diffuse ray visibility (the flood dies)", not bad_diffuse, json.dumps(bad_diffuse[:6]))
lost_camera = [n for n in emitters if n in by_name and by_name[n].visible_camera is not True]
lost_glossy = [n for n in emitters if n in by_name and by_name[n].visible_glossy is not True]
ok("r3 the spectacle keeps the CAMERA (the show survives)", not lost_camera, json.dumps(lost_camera[:6]))
ok("r4 the glint keeps its GLOSSY source (the 115 sentence's WHERE)", not lost_glossy, json.dumps(lost_glossy[:6]))

lights = [ob for ob in bpy.data.objects if ob.type == "LIGHT" and ob.name.startswith("FxTransport")]
ok("r5 one bounded transport light per program (4 programs)", len(lights) == 4, f"{len(lights)} lights")
expect_intens = {"FxTransport1": 0.8, "FxTransport2": 0.6, "FxTransport3": 0.9, "FxTransport4": 0.4}
energy_ok = all(
    abs(l.data.energy - fx.fx_transport_energy(expect_intens[l.name])) < 1e-6
    for l in lights if l.name in expect_intens
)
ok("r6 every transport light carries exactly the law's bounded energy", energy_ok,
   json.dumps({l.name: l.data.energy for l in lights}))
color_ok = all(
    abs(l.data.color[0] - c[0]) < 1e-6 and abs(l.data.color[1] - c[1]) < 1e-6 and abs(l.data.color[2] - c[2]) < 1e-6
    for l in lights for c in [(0.698, 0.541, 1.0)] if l.name in ("FxTransport1", "FxTransport2", "FxTransport4")
)
ok("r7 the transport light carries the program's OWN hue", color_ok)
aura_light = next((l for l in lights if l.name == "FxTransport2"), None)
ok("r8 the aura's transport light rides the figure root (it follows the body)",
   aura_light is not None and aura_light.parent is not None and aura_light.parent.name == "FigureRoot",
   f"parent {aura_light.parent.name if aura_light and aura_light.parent else None}")
ok("r9 the guard names itself in the rig's notes",
   any("THE FX TRANSPORT GUARD (149)" in n for n in rig["notes"]), json.dumps(rig["notes"][-1:]))

# ── determinism: the same inputs land the same lights (the seed law) ──
scn2, fig2 = figure_stub()
rig2 = fx.build_fx_rig(bpy, scn2, programs(), fig2, "#b28aff", "smoke-149-rig")
# the first build's energies per the law's own derivation (Blender
# stores light energy as float32 - the tolerance IS the storage)
first_energies = sorted(60.0 * i * fx.FX_TRANSPORT_SHARE for i in (0.8, 0.6, 0.9, 0.4))
second_lights = [ob for ob in bpy.data.objects if ob.type == "LIGHT" and ob.name.startswith("FxTransport")]
second_energies = sorted(l.data.energy for l in second_lights)
ok("d1 the same job lands the same bounded energies (deterministic)",
   len(first_energies) == len(second_energies) and all(abs(a - b) < 1e-3 for a, b in zip(first_energies, second_energies)),
   json.dumps({"expected": [round(v, 4) for v in first_energies], "got": [round(v, 4) for v in second_energies]}))

print("DIRECT_FAILS", len(fails))
sys.exit(1 if fails else 0)
"""

proc = subprocess.run(
    [BLENDER, "-b", "--factory-startup", "--python-expr", DIRECT, "--", SCRIPT],
    capture_output=True, text=True, timeout=300, cwd=ROOT,
)
for line in proc.stdout.splitlines():
    if line.startswith(("PASS", "FAIL", "DIRECT_FAILS")):
        print(line)
if proc.returncode != 0 or "DIRECT_FAILS 0" not in proc.stdout:
    print("direct half failed; stderr tail:", proc.stderr[-1500:])
    failures += 1

print(f"\n{'ALL GREEN' if failures == 0 else f'{failures} FAILURE(S)'} - blender-fxtransport-smoke")
sys.exit(1 if failures else 0)
