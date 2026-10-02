# Smoke-test THE MANNEQUIN GAINS A BODY (iteration 118) in the REAL
# Blender: the anatomy field sculpts the baked skin (thousands of
# vertices moved, all 22 structures landing, a readable max
# displacement), it is bit-exact across rebuilds (the seed law), it
# is SMOOTH (form, not noise - the Laplacian does not blow up), the
# spec's build and gender actually move the amplitudes, and a FULL
# designed figure still builds, rigs and syncs over the sculpted
# body. Run:  python3 scripts/blender-anatomy-smoke.py
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BL = next(
    p for p in (
        "/home/z/blender-5.2.2-linux-x64/blender",
        "/home/z/blender-4.3.2-linux-x64/blender",
    )
    if os.path.exists(p)
)

RUNNER = r'''
import json, os, sys
HERE = %(here)r
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import bpy
import anime_character as ac
import body_anatomy as ba

scn = bpy.context.scene

def build(dna):
    for ob in list(scn.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    skin = bpy.data.materials.new("Skin"); skin.use_nodes = True
    boots = bpy.data.materials.new("Boots"); boots.use_nodes = True
    body = ac.build_body(bpy, scn, ac.resolve_spec(dna), skin, boots)
    return body, json.loads(body.get("animeos_anatomy") or "{}")

HERO = {
    "name": "AnatomyHero",
    "designSpec": {"body": {"gender": "male", "build": "sturdy", "shoulders": 1.05, "hips": 1.0, "bust": 0.0, "headScale": 1.0}},
}

# 1. THE FIELD SCULPTS
body1, s1 = build(HERO)
out = {}
out["s1"] = s1

# 2. BIT-EXACT ACROSS REBUILDS (the seed law)
body2, s2 = build(HERO)
out["deterministic"] = json.dumps(s1, sort_keys=True) == json.dumps(s2, sort_keys=True)

# 3. THE SPEC DRIVES THE SCULPT (male vs female, heavy vs lean)
F = {"name": "F", "designSpec": {"body": {"gender": "female", "build": "lean", "shoulders": 1.0, "hips": 1.06, "bust": 0.5, "headScale": 1.0}}}
_, sf = build(F)
out["female_max"] = sf.get("maxDisp")
out["female_softer"] = sf.get("maxDisp", 0) < s1.get("maxDisp", 0)
H = {"name": "H", "designSpec": {"body": {"gender": "male", "build": "heavy", "shoulders": 1.1, "hips": 1.1, "bust": 0.0, "headScale": 1.0}}}
_, sh = build(H)
out["heavy_max"] = sh.get("maxDisp")
out["heavy_stronger"] = sh.get("maxDisp", 0) > s1.get("maxDisp", 0)

# 4. A FULL FIGURE BUILDS, RIGS AND SYNCS OVER THE SCULPTED BODY
for ob in list(scn.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
mats = {}
for k in ("skin", "hair", "boots", "accent", "robe", "robeB"):
    m = bpy.data.materials.new(k); m.use_nodes = True; mats[k] = m
dna = {
    "name": "AnatomyFigure",
    "designSpec": {
        "body": {"gender": "male", "build": "sturdy", "shoulders": 1.05, "hips": 1.0, "bust": 0.0, "headScale": 1.0},
        "hair": {"style": "topknot", "color": "#101014"},
        "eyes": {"color": "#20180f", "size": 1.0, "tilt": 0},
        "mouth": {"width": 1.0},
        "outfit": {"type": "hanfu", "length": 0.85, "sleeves": "bell", "sash": True, "color": "#2F6D63", "accent": "#A8842C"},
    },
}
figure = ac.build_anime_character(bpy, scn, dna, mats)
synced = figure["syncRig"]() or True
out["figure_law"] = figure.get("builder")
out["figure_anatomy"] = (figure.get("anime") or {}).get("anatomy")
out["figure_body_verts"] = ((figure.get("anime") or {}).get("body") or {}).get("verts")
out["figure_bones"] = ((figure.get("anime") or {}).get("body") or {}).get("bones")

# 5. THE SCULPT SURVIVED THE BIND (the mesh carries the field)
bm_body = bpy.data.objects.get("AnimeBody")
out["anatomy_prop_rides"] = bool(bm_body and bm_body.get("animeos_anatomy"))

print("ANATOMY_SMOKE " + json.dumps(out))
'''

failures = 0
def expect(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
    if not cond:
        failures += 1

with tempfile.TemporaryDirectory(prefix="anime-anatomy-") as tmp:
    runner = RUNNER % {"here": os.path.join(ROOT, "bridges", "blender"), "tmp": tmp}
    rp = os.path.join(tmp, "runner.py")
    with open(rp, "w") as fh:
        fh.write(runner)
    proc = subprocess.run([BL, "-b", "--python", rp], capture_output=True, text=True, timeout=600, cwd=ROOT)
    if proc.returncode != 0:
        print("STDERR tail:", proc.stderr[-2000:])
        sys.exit(1)
    line = next((l for l in proc.stdout.splitlines() if l.startswith("ANATOMY_SMOKE ")), None)
    if not line:
        print("FAIL no ANATOMY_SMOKE line"); sys.exit(1)
    out = json.loads(line[len("ANATOMY_SMOKE "):])

s1 = out["s1"]
expect("the field sculpts thousands of vertices", s1.get("vertsMoved", 0) > 3000, s1.get("vertsMoved"))
expect("all 22 structures land", s1.get("structures") == 22 and len(s1.get("fieldHits") or {}) == 22,
       f"{s1.get('structures')} / {len(s1.get('fieldHits') or {})}")
expect("the displacement is readable", s1.get("maxDisp", 0) > 0.005, s1.get("maxDisp"))
expect("the field is smooth (form, not noise)",
       abs(s1.get("laplacianAfter", 0) - s1.get("laplacianBefore", 0)) < 5e-5,
       f"{s1.get('laplacianBefore')} -> {s1.get('laplacianAfter')}")
expect("bit-exact across rebuilds", out["deterministic"])
expect("a female spec sculpts softer", out["female_softer"], out["female_max"])
expect("a heavy spec sculpts stronger", out["heavy_stronger"], out["heavy_max"])
expect("a full figure builds over the sculpted body", str(out["figure_law"]).startswith("anime-v118"), out["figure_law"])
expect("the figure's anatomy evidence rides the build", isinstance(out["figure_anatomy"], dict) and not out["figure_anatomy"].get("error"),
       json.dumps(out["figure_anatomy"])[:200])
expect("the rig still binds (bones over the sculpted body)", (out["figure_bones"] or 0) >= 13, out["figure_bones"])
expect("the anatomy prop rides the object", out["anatomy_prop_rides"])

print(f"\n{'ALL GREEN' if failures == 0 else f'{failures} FAILURES'}")
sys.exit(1 if failures else 0)
