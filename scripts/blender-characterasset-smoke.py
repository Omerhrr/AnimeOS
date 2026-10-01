# Smoke-test THE CHARACTER IS ONE ASSET (AnimeOS 5.0, iteration 95,
# the master-asset slice) inside the REAL Blender worker, in two
# halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the
#      canonical key law (the wire truth, canonicalized field by
#      field against a LITERAL expected key); the master hash
#      mirroring the sha256-16 formula; the sensitivity law (each
#      section's factors move the hash); the case-insensitive hex
#      law; the guess build's honest "-" markers; the beard law;
#      A/B determinism; the ten sections in order.
#   2. RENDER JOBS over the real worker: a CLOSEUP names the rig's
#      asset evidence (name, the 16-hex master hash, the ten
#      sections, law version 95) with the hero strand evidence
#      riding beside; the WS and MED renders land the SAME master
#      hash (the lens resolves the asset, it never rewrites it)
#      while their per-shot curve evidence differs honestly
#      (cards / standard); the clips render; cleanup.
import hashlib
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT_DIR = os.path.join(ROOT, "public", "renders")
os.makedirs(OUT_DIR, exist_ok=True)

BLENDER = next(p for p in ("/home/z/blender-5.2.2-linux-x64/blender", "/home/z/blender-4.3.2-linux-x64/blender") if os.path.exists(p))
HALF = os.environ.get("HALF", "all").lower()  # all | direct | render (the gateway's 10-min cap)

failures = 0
def expect(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
    if not cond:
        failures += 1


# ── half 1: direct verification inside the real Blender ──
DIRECT = r"""
import hashlib
import importlib.util, json, sys
import bpy
spec = importlib.util.spec_from_file_location("bridge", sys.argv[-1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# the canonical key law, field by field, against a LITERAL expected key
DNA = {
    "name": "Bai Ling", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "sword", "bladeColor": "#5eead4", "build": "lean",
    "beard": False, "faceShape": "oval", "sheetFields": ["hairStyle", "hairColor"],
    "conformFactor": 0.75,
    "silhouetteShape": {"height": 1.02, "shoulders": 0.94, "torso": 0.97, "sleeves": 1.06, "skirt": 1.0, "hair": 1.08, "fields": ["flowing"]},
    "faceProfile": {"jawTaper": 0.92, "chinFwd": 0.88, "browFwd": 0.9, "cheekOut": 0.85, "noseLen": 0.95, "eyeScale": 1.12},
    "materialProfile": {"skinSss": 0.3, "skinRough": 0.42, "skinWarmth": 0.25, "rim": 0.35, "clothRamp": 0.4, "clothSheen": 0.3, "clothWeave": 0.2, "hairRough": 0.35},
    "hairShade": {"melanin": 0.82, "redness": 0.12, "radial": 0.3, "longitudinal": 0.25},
    "skinDepth": {"weight": 0.42, "radius": 0.66, "scale": 0.4, "coat": 0.08, "coatRough": 0.47},
    "groomProfile": {"sweep": 0.1, "flow": 0.55, "flyaway": 0.35, "taper": 0.85},
}
EXPECT_KEY = (
    "106|Bai Ling|long|#1b1b2a|#2f6d63|#a8842c|#d9b48f|sword|#5eead4|lean|clean|oval|0.750"
    "|hairStyle+hairColor"
    "|sh:1.020,0.940,0.970,1.060,1.000,1.080"
    "|fc:0.920,0.880,0.900,0.850,0.950,1.120"
    "|mt:0.300,0.420,0.250,0.350,0.400,0.300,0.200,0.350"
    "|hs:0.820,0.120,0.300,0.250"
    "|sd:0.420,0.660,0.400,0.080,0.470"
    "|gr:0.100,0.550,0.350,0.850"
    "|v1"
)
ok("the canonical key mirrors the literal expected key field by field",
   m.character_asset_key(DNA) == EXPECT_KEY,
   f"{m.character_asset_key(DNA)}")
ok("the master hash mirrors the sha256-16 formula over that key",
   m.character_asset_hash(DNA) == hashlib.sha256(EXPECT_KEY.encode("utf-8")).hexdigest()[:16],
   m.character_asset_hash(DNA))
ok("the master hash is 16 hex", len(m.character_asset_hash(DNA)) == 16)

# the sensitivity law: every section's own truth moves the hash
ok("a hair hex move moves the master hash",
   m.character_asset_hash({**DNA, "hairColor": "#2A1B1B"}) != m.character_asset_hash(DNA))
ok("a face factor move moves the master hash",
   m.character_asset_hash({**DNA, "faceProfile": {**DNA["faceProfile"], "jawTaper": 0.5}}) != m.character_asset_hash(DNA))
ok("a groom factor move moves the master hash",
   m.character_asset_hash({**DNA, "groomProfile": {**DNA["groomProfile"], "flyaway": 0.1}}) != m.character_asset_hash(DNA))
ok("a skin depth move moves the master hash",
   m.character_asset_hash({**DNA, "skinDepth": {**DNA["skinDepth"], "coat": 0.2}}) != m.character_asset_hash(DNA))
ok("a conformance move moves the master hash",
   m.character_asset_hash({**DNA, "conformFactor": 0.35}) != m.character_asset_hash(DNA))
ok("a sheet-field move moves the master hash",
   m.character_asset_hash({**DNA, "sheetFields": ["hairStyle"]}) != m.character_asset_hash(DNA))
ok("the beard law: a bearded truth lands its own hash",
   m.character_asset_hash({**DNA, "beard": True}) != m.character_asset_hash(DNA))

# the hex case law: the read's case is honest noise
upper = json.loads(json.dumps(DNA))
lower = json.loads(json.dumps(DNA))
for k in ("hairColor", "robeColor", "robeAccent", "skinTone", "bladeColor"):
    lower[k] = lower[k].lower()
    upper[k] = upper[k].upper()
ok("the key is case-insensitive over the hexes (one dye, one hash)",
   m.character_asset_key(upper) == m.character_asset_key(lower))

# the guess build's honest markers
GUESS = {"name": "Bai Ling", "hairColor": "#16161d", "hairStyle": "short",
         "robeColor": "#2f6d63", "robeAccent": "#a8842c", "skinTone": "#d9b48f",
         "weaponType": "sword", "bladeColor": "#5eead4", "build": "lean"}
gk = m.character_asset_key(GUESS)
ok("a guess build's key names every absent profile '-'",
   all(t in gk for t in ("sh:-", "fc:-", "mt:-", "hs:-", "sd:-", "gr:-")) and "|-|sh:-" in gk and "0.350" in gk,
   gk)
ok("a guess build's hash differs from the adherent asset's",
   m.character_asset_hash(GUESS) != m.character_asset_hash(DNA))

# the sections law: the ten sections, in the ledger's order
ok("the manifest names the ten sections in order",
   m.CHARACTER_ASSET_SECTIONS == ("canonicalIdentity", "baseMesh", "sculptLayers", "maps",
                                  "materials", "facialRig", "groom", "wardrobe", "lod",
                                  "validationProfile"))

# A/B determinism: the same wire truth lands the same hash twice
ok("the same DNA lands the same master hash (A/B)",
   m.character_asset_hash(DNA) == m.character_asset_hash(json.loads(json.dumps(DNA))))

print("DIRECT_FAILS", len(fails))
sys.exit(1 if fails else 0)
"""
if HALF in ("all", "direct"):
  proc = subprocess.run(
    [BLENDER, "-b", "--factory-startup", "--python-expr", DIRECT, "--", SCRIPT],
    capture_output=True, text=True, timeout=300, cwd=ROOT,
  )
  for line in proc.stdout.splitlines():
    if line.startswith(("PASS", "FAIL", "DIRECT_FAILS")):
      print(line)
  if proc.returncode != 0 or "DIRECT_FAILS 0" not in proc.stdout:
    print("direct half failed; stderr tail:", proc.stderr[-1200:])
    failures += 1


# ── half 2: render jobs over the real worker ──
def run_job(job_id, cast, shot_type="CLOSEUP"):
    shot = {
        "number": 1,
        "description": "character asset smoke shot",
        "shotType": shot_type, "lens": "50mm", "movement": "STATIC",
        "poseStart": "STANCE", "poseEnd": "STANCE",
        "lighting": "moonlit ridge", "duration": 1.0,
        "cast": cast,
    }
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Character Asset Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Character Asset Smoke", "visualStyle": "DONGHUA",
                        "resolution": "960x540", "fps": 24},
            "mode": "PREVIEW",
        },
        "outDir": OUT_DIR,
    }
    job_file = os.path.join(OUT_DIR, f".job-{job_id}.json")
    with open(job_file, "w") as fh:
        json.dump(payload, fh)
    t0 = time.time()
    proc = subprocess.run(
        [BLENDER, "-b", "-P", SCRIPT, "--", "--worker", "--job", job_file],
        capture_output=True, text=True, timeout=420, cwd=ROOT,
    )
    elapsed = time.time() - t0
    print(f"[{job_id}] worker exit={proc.returncode} elapsed={elapsed:.1f}s")
    if proc.returncode != 0:
        print("STDERR tail:", proc.stderr[-1500:])
        sys.exit(1)
    with open(job_file) as fh:
        return json.load(fh)


if HALF == "direct":
    print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - character-asset smoke (direct half)")
    sys.exit(0 if failures == 0 else 1)

HERO = {
    "name": "Asset Smoke Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "sword", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle", "hairColor"], "conformFactor": 0.75,
    "silhouetteShape": {"height": 1.02, "shoulders": 0.94, "torso": 0.97, "sleeves": 1.06, "skirt": 1.0, "hair": 1.08, "fields": ["flowing"]},
    "faceShape": "oval",
    "faceProfile": {"jawTaper": 0.92, "chinFwd": 0.88, "browFwd": 0.9, "cheekOut": 0.85, "noseLen": 0.95, "eyeScale": 1.12},
    "materialProfile": {"skinSss": 0.3, "skinRough": 0.42, "skinWarmth": 0.25, "rim": 0.35, "clothRamp": 0.4, "clothSheen": 0.3, "clothWeave": 0.2, "hairRough": 0.35},
    "hairShade": {"melanin": 0.82, "redness": 0.12, "radial": 0.3, "longitudinal": 0.25},
    "skinDepth": {"weight": 0.42, "radius": 0.66, "scale": 0.4, "coat": 0.08, "coatRough": 0.47},
    "groomProfile": {"sweep": 0.1, "flow": 0.55, "flyaway": 0.35, "taper": 0.85, "fields": ["flowing"]},
}

# the INDEPENDENTLY derived expected master hash (the smoke builds the
# canonical key by its own hand - not by calling the bridge)
def key_for(d):
    f3 = lambda v: "{:.3f}".format(float(v))
    def prof(pfx, wire_key, keys):
        dval = d.get(wire_key)
        return (pfx + ":" + ",".join(f3(dval[k]) for k in keys)) if isinstance(dval, dict) else (pfx + ":-")
    return "|".join([
        "106", d["name"], d["hairStyle"],
        d["hairColor"].lower(), d["robeColor"].lower(), d["robeAccent"].lower(), d["skinTone"].lower(),
        d["weaponType"], d["bladeColor"].lower(), d["build"],
        "beard" if d.get("beard") else "clean", d.get("faceShape", "-"), f3(d.get("conformFactor", 0.35)),
        "+".join(d.get("sheetFields") or []) or "-",
        prof("sh", "silhouetteShape", ("height", "shoulders", "torso", "sleeves", "skirt", "hair")),
        prof("fc", "faceProfile", ("jawTaper", "chinFwd", "browFwd", "cheekOut", "noseLen", "eyeScale")),
        prof("mt", "materialProfile", ("skinSss", "skinRough", "skinWarmth", "rim", "clothRamp", "clothSheen", "clothWeave", "hairRough")),
        prof("hs", "hairShade", ("melanin", "redness", "radial", "longitudinal")),
        prof("sd", "skinDepth", ("weight", "radius", "scale", "coat", "coatRough")),
        prof("gr", "groomProfile", ("sweep", "flow", "flyaway", "taper")),
        "v1",
    ])
EXPECT_MASTER = hashlib.sha256(key_for(HERO).encode("utf-8")).hexdigest()[:16]

state = run_job("charasset-smoke-close", [HERO], "CLOSEUP")
rig = state.get("rig") or {}
asset = rig.get("asset")
expect("the close render built the figure procedurally", state.get("figureSource") == "procedural:v4.0-designed", str(state.get("figureSource")))
expect("the close render names the asset evidence", isinstance(asset, dict), json.dumps(rig)[:300])
if isinstance(asset, dict):
    expect("the asset names the member + the law version", asset.get("name") == HERO["name"] and asset.get("lawVersion") == 106, json.dumps(asset))
    expect("the asset carries the ten sections in order",
           asset.get("sections") == ["canonicalIdentity", "baseMesh", "sculptLayers", "maps", "materials",
                                     "facialRig", "groom", "wardrobe", "lod", "validationProfile"],
           json.dumps(asset.get("sections")))
    expect("the master hash is 16 hex and matches the INDEPENDENT derivation",
           asset.get("hash") == EXPECT_MASTER, f"{asset.get('hash')} vs {EXPECT_MASTER}")
curves = rig.get("hairCurves")
expect("the hero strand evidence rides BESIDE the asset (the close framing's resolution)",
       isinstance(curves, dict) and curves.get("tier") == "hero" and curves.get("ptsPerCurve") == 12,
       json.dumps(curves or {})[:200])
clip = os.path.join(OUT_DIR, "charasset-smoke-close.mp4")
expect("the clip rendered", os.path.exists(clip) and os.path.getsize(clip) > 0)

state_med = run_job("charasset-smoke-med", [HERO], "MED")
asset_med = (state_med.get("rig") or {}).get("asset")
curves_med = (state_med.get("rig") or {}).get("hairCurves")
expect("the MED render lands the SAME master hash (the lens resolves, never rewrites)",
       isinstance(asset_med, dict) and asset_med.get("hash") == EXPECT_MASTER,
       json.dumps(asset_med or {})[:200])
expect("the MED framing's per-shot resolution stays honest (the STANDARD curve)",
       isinstance(curves_med, dict) and curves_med.get("tier") == "standard" and curves_med.get("ptsPerCurve") == 6,
       json.dumps(curves_med or {})[:200])

state_wide = run_job("charasset-smoke-wide", [HERO], "WS")
asset_wide = (state_wide.get("rig") or {}).get("asset")
curves_wide = (state_wide.get("rig") or {}).get("hairCurves")
expect("the WS render lands the SAME master hash too",
       isinstance(asset_wide, dict) and asset_wide.get("hash") == EXPECT_MASTER,
       json.dumps(asset_wide or {})[:200])
expect("the WS framing keeps the mesh cards (the curve evidence honest None)", curves_wide is None,
       json.dumps(curves_wide or {})[:160])

# a changed DNA moves the hash over the real worker too
HERO2 = json.loads(json.dumps(HERO))
HERO2["robeColor"] = "#4A5560"
state2 = run_job("charasset-smoke-changed", [HERO2], "CLOSEUP")
asset2 = (state2.get("rig") or {}).get("asset")
expect("a changed DNA lands a DIFFERENT master hash over the real worker",
       isinstance(asset2, dict) and asset2.get("hash") != EXPECT_MASTER and len(asset2.get("hash") or "") == 16,
       f"{(asset2 or {}).get('hash')} vs {EXPECT_MASTER}")

for f in ("charasset-smoke-close", "charasset-smoke-med", "charasset-smoke-wide", "charasset-smoke-changed"):
    p = os.path.join(OUT_DIR, f"{f}.mp4")
    if os.path.exists(p):
        os.unlink(p)
    j = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(j):
        os.unlink(j)

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - character-asset smoke")
sys.exit(0 if failures == 0 else 1)
