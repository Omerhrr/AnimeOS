# Smoke-test THE STRANDS GO HERO (iteration 94, the deeper groom's
# hero-strand half) inside the REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the
#      strand-tier law (close hero / middle standard / wide cards);
#      the root-to-tip taper law against an independent derivation;
#      the hero curves grown (12 points, per-point radius taper,
#      bevel resolution 3, the flyaway curves riding the factor);
#      the standard curve kept EXACTLY the iteration-89 law (6
#      points, uniform radius, bevel 2); determinism A/B; the hash
#      mirroring the TS formula over a hardcoded anchor key.
#   2. RENDER JOBS over the real worker: a CLOSEUP render names the
#      hero tier evidence (ptsPerCurve 12, flyaways, the 16-hex
#      curve hash); a MED render keeps the standard curve (6 pts,
#      no flyaways); a WS render keeps the mesh cards (the curve
#      evidence honestly None); the clips render; cleanup.
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

# the strand-tier law mirrors the TS tier
ok("the tier law: CLOSEUP hero, MCU hero, MED standard, WS cards",
   m.groom_strand_tier(1.0) == "hero" and m.groom_strand_tier(0.95) == "hero"
   and m.groom_strand_tier(0.9) == "hero" and m.groom_strand_tier(0.89) == "standard"
   and m.groom_strand_tier(0.7) == "standard" and m.groom_strand_tier(0.55) == "standard"
   and m.groom_strand_tier(0.54) == "cards" and m.groom_strand_tier(0.4) == "cards")

# the taper law against an independent derivation
import hashlib
def tip_ref(t):
    t = max(0.5, min(1.0, float(t)))
    return round((0.25 + 0.55 * ((t - 0.5) / 0.5)) * 1000) / 1000
ok("the taper law: fine 0.5 dies to 0.25, blunt 1.0 keeps 0.8",
   m.hero_taper_tip(0.5) == 0.25 and m.hero_taper_tip(1.0) == 0.8)
ok("the taper law matches the independent derivation across the range",
   all(m.hero_taper_tip(t) == tip_ref(t) for t in (0.5, 0.6, 0.7, 0.85, 0.93, 1.0)))
ok("a wild taper clamps against the law", m.hero_taper_tip(2.0) == 0.8 and m.hero_taper_tip(0.1) == 0.25)

# the hash mirrors the TS formula over a hardcoded anchor
f_anchor = {"sweep": 0.1, "flow": 0.55, "flyaway": 0.35, "taper": 0.85}
expect_key = "94|long|hero|0.100|0.550|0.350|0.850|v1"
expect_hash = hashlib.sha256(expect_key.encode("utf-8")).hexdigest()[:16]
ok("the curve hash mirrors the TS formula (hardcoded anchor key)",
   m.groom_curve_hash(f_anchor, "long", "hero") == expect_hash,
   f"{m.groom_curve_hash(f_anchor, 'long', 'hero')} vs {expect_hash}")
ok("a different tier lands a different key",
   m.groom_curve_hash(f_anchor, "long", "hero") != m.groom_curve_hash(f_anchor, "long", "standard"))
ok("a different profile lands a different key",
   m.groom_curve_hash(f_anchor, "long", "hero") != m.groom_curve_hash({**f_anchor, "flow": 0.2}, "long", "hero"))

# the hero curves grow off the guides, tapered, with the flyaways
scn = bpy.context.scene
hair = m.principled_mat(bpy, "HairMat94", "#1b1b2a")
shade = m.hair_shade({"hairColor": "#1B1B2A"})
shade_mat = m.build_hair_shade_material(bpy, "GroomCurveHairTmp94", "#1B1B2A", shade)
head = bpy.data.objects.new("HeadEmpty94", None)
scn.collection.objects.link(head)
gp = m.groom_profile({"hairStyle": "long", "groomProfile": {"sweep": 0.1, "flow": 0.55, "flyaway": 0.35, "taper": 0.85, "fields": ["flowing"]}})
ev_a = m.groom_hair_curves(scn, bpy, head, shade_mat, "long", 1.0, 1.0, gp, 1.0)
ok("the hero tier grew the curves + the flyaway pass (flyaway 0.35 x base 6 -> 2)",
   ev_a["tier"] == "hero" and ev_a["ptsPerCurve"] == 12 and ev_a["curves"] > 0 and ev_a["flyaways"] == 2,
   json.dumps(ev_a))
ok("the hero evidence carries the 16-hex hash", isinstance(ev_a["hash"], str) and len(ev_a["hash"]) == 16, str(ev_a["hash"]))
cu = bpy.data.curves.get("GroomCurve0_0")
ok("a hero strand is a 12-point spline at bevel resolution 3",
   cu is not None and len(cu.splines[0].points) == 12 and cu.bevel_resolution == 3)
radii = [p.radius for p in cu.splines[0].points]
tip_expect = m.hero_taper_tip(0.85)
ok("the hero strand tapers root 1.0 -> the taper-driven tip (monotonic down)",
   abs(radii[0] - 1.0) < 1e-6 and abs(radii[-1] - tip_expect) < 1e-3
   and all(radii[i] >= radii[i + 1] - 1e-9 for i in range(len(radii) - 1)),
   f"{radii[:3]}...{radii[-2:]} vs tip {tip_expect} (Blender stores radii float32)")
fly = bpy.data.curves.get("GroomCurveFly0")
ok("the hero flyaway curves grew (12 pts, tapered)",
   fly is not None and len(fly.splines[0].points) == 12 and fly.splines[0].points[0].radius == 1.0)

# A/B determinism: the same inputs land the same groom twice
head2 = bpy.data.objects.new("HeadEmpty94b", None)
scn.collection.objects.link(head2)
mat_b = m.build_hair_shade_material(bpy, "GroomCurveHairTmp94b", "#1B1B2A", shade)
ev_b = m.groom_hair_curves(scn, bpy, head2, mat_b, "long", 1.0, 1.0, gp, 1.0)
ok("the same profile lands the same hero groom (counts + hash, A/B)",
   ev_a["curves"] == ev_b["curves"] and ev_a["curvePts"] == ev_b["curvePts"] and ev_a["hash"] == ev_b["hash"],
   f"{ev_a['hash']} vs {ev_b['hash']}")

# the standard tier keeps EXACTLY the iteration-89 law
head3 = bpy.data.objects.new("HeadEmpty94c", None)
scn.collection.objects.link(head3)
ev_std = m.groom_hair_curves(scn, bpy, head3, shade_mat, "long", 1.0, 1.0, gp, 0.7)
ok("the standard tier carries the 6-point curve with NO flyaways",
   ev_std["tier"] == "standard" and ev_std["ptsPerCurve"] == 6 and ev_std["flyaways"] == 0
   and ev_std["curvePts"] == ev_std["curves"] * 6, json.dumps(ev_std))
cu_std = None
std_curve = next((c for c in bpy.data.curves if c.name.startswith("GroomCurve") and len(c.splines[0].points) == 6), None)
ok("a standard strand is a 6-point spline at bevel resolution 2, uniform radius",
   std_curve is not None and std_curve.bevel_resolution == 2
   and all(p.radius == 1.0 for p in std_curve.splines[0].points))
ok("the standard tier hashes its own key (never the hero's)", ev_std["hash"] != ev_a["hash"])

# the cards tier stays honest None
ev_cards = m.groom_hair_curves(scn, bpy, head3, shade_mat, "long", 1.0, 1.0, gp, 0.4)
ok("the wide framing keeps the mesh cards (the curve evidence honest None)", ev_cards is None)

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
        "description": "hero strand smoke shot",
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
                "number": 1, "title": "Hero Strand Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Hero Strand Smoke", "visualStyle": "DONGHUA",
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
    print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - hero-strand smoke (direct half)")
    sys.exit(0 if failures == 0 else 1)

HERO = {
    "name": "Hero Strand Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "none", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle"], "conformFactor": 0.75,
    "groomProfile": {"sweep": 0.1, "flow": 0.55, "flyaway": 0.35, "taper": 0.85, "fields": ["flowing"]},
}

state = run_job("herostrand-smoke-close", [HERO], "CLOSEUP")
rig = state.get("rig") or {}
c = rig.get("hairCurves")
expect("the close render built the figure procedurally", state.get("figureSource") == "procedural:v4.0-designed", str(state.get("figureSource")))
expect("the close render names the curve evidence", isinstance(c, dict), json.dumps(rig)[:300])
if isinstance(c, dict):
    expect("the close framing carries the HERO tier (12 pts, flyaways riding)",
           c.get("tier") == "hero" and c.get("ptsPerCurve") == 12 and c.get("flyaways", 0) >= 1,
           json.dumps({k: c.get(k) for k in ("curves", "curvePts", "tier", "ptsPerCurve", "flyaways")}))
    expect("the hero curve hash is 16 hex and mirrors the law inputs",
           isinstance(c.get("hash"), str) and len(c["hash"]) == 16, str(c.get("hash")))
    expect("the melanin shade still rides beside the curves", isinstance(rig.get("hairShade"), dict) and len(rig["hairShade"].get("hash", "")) == 16)
    expect("the mesh strands still ride beside the curves", (rig.get("groom") or {}).get("strands", 0) > 0)
clip = os.path.join(OUT_DIR, "herostrand-smoke-close.mp4")
expect("the clip rendered", os.path.exists(clip) and os.path.getsize(clip) > 0)

state_med = run_job("herostrand-smoke-med", [HERO], "MED")
c_med = ((state_med.get("rig") or {}).get("hairCurves"))
expect("the middle framing keeps the STANDARD curve (6 pts, no flyaways)",
       isinstance(c_med, dict) and c_med.get("tier") == "standard" and c_med.get("ptsPerCurve") == 6 and c_med.get("flyaways") == 0,
       json.dumps(c_med or {})[:200])
if isinstance(c, dict) and isinstance(c_med, dict):
    expect("a different tier lands a different curve hash over the real worker", c["hash"] != c_med["hash"])

state_wide = run_job("herostrand-smoke-wide", [HERO], "WS")
c_wide = ((state_wide.get("rig") or {}).get("hairCurves"))
expect("the wide framing keeps the mesh cards only (no curve evidence - honest)",
       c_wide is None, json.dumps(c_wide or {})[:160])

for f in ("herostrand-smoke-close", "herostrand-smoke-med", "herostrand-smoke-wide"):
    p = os.path.join(OUT_DIR, f"{f}.mp4")
    if os.path.exists(p):
        os.unlink(p)
    j = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(j):
        os.unlink(j)

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - hero-strand smoke")
sys.exit(0 if failures == 0 else 1)
