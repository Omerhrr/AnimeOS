# Smoke-test THE HAIR IS GROOMED (iteration 85) inside the REAL Blender
# worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the groom
#      profile clamps against the same bounds groom.ts clamps against
#      (a missing profile fills from the style prior); the LOD law
#      lands the framing factors; the strands grow off the guides
#      deterministically (the same profile lands the same strand
#      count + hash twice; different factors land a different hash).
#   2. RENDER JOBS over the real worker: a CLOSEUP render names the
#      groom evidence with lod "full"; a WS render carries lod "wide"
#      with a reduced strand pass; a guess build (no profile) keeps
#      the style prior, honestly named; the second figure grooms too.
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT_DIR = os.path.join(ROOT, "public", "renders")
os.makedirs(OUT_DIR, exist_ok=True)

BLENDER = next(p for p in ("/home/z/blender-5.2.2-linux-x64/blender", "/home/z/blender-4.3.2-linux-x64/blender") if os.path.exists(p))

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

# the profile validator: one law, two runtimes
prof = m.groom_profile({"hairStyle": "ponytail", "groomProfile": {"sweep": 0.9, "flow": 0.6, "flyaway": 2.0, "taper": 0.2, "fields": ["flowing", "loose"]}})
f = prof["factors"]
ok("wild factors clamped (flyaway 2->1, taper 0.2->0.5), the named fields ride",
   f["sweep"] == 0.9 and f["flow"] == 0.6 and f["flyaway"] == 1.0 and f["taper"] == 0.5 and prof["fields"] == ["flowing", "loose"], json.dumps(prof))
guess = m.groom_profile({"hairStyle": "ponytail"})
ok("a guess build fills from the STYLE PRIOR (ponytail sweep 0.55) with honest empty fields",
   guess["factors"]["sweep"] == 0.55 and guess["fields"] == [], json.dumps(guess["factors"]))
unknown = m.groom_profile({"hairStyle": "mohawk"})
ok("an unknown style degrades to the short prior", unknown["factors"]["sweep"] == 0.2, json.dumps(unknown["factors"]))

# the LOD law mirrors the TS factor
ok("the LOD law: CLOSEUP full (1.0), WS wide (0.4), MED middle (0.7)",
   m.groom_strand_factor("CLOSEUP") == 1.0 and m.groom_strand_factor("EXTREME_CLOSEUP") == 1.0
   and m.groom_strand_factor("WS") == 0.4 and m.groom_strand_factor("ESTABLISHING") == 0.4
   and m.groom_strand_factor("MED") == 0.7, "factors")

# the strands grow off the guides, deterministically
scn = bpy.context.scene
skin = m.principled_mat(bpy, "SkinMat", "#d9b48f")
hair = m.principled_mat(bpy, "HairMat", "#1b1b2a")
head = bpy.data.objects.new("HeadEmpty", None)
scn.collection.objects.link(head)
gp = m.groom_profile({"hairStyle": "long", "groomProfile": {"sweep": 0.1, "flow": 0.55, "flyaway": 0.35, "taper": 0.85, "fields": ["flowing"]}})
ev_a = m.groom_strands(scn, bpy, head, hair, "long", 1.0, 1.0, gp, 1.0)
ok("the full pass grew strands + flyaways off the guides",
   ev_a["strands"] >= 20 and ev_a["flyaways"] >= 1 and ev_a["lod"] == "full", json.dumps({k: ev_a[k] for k in ("strands", "flyaways", "lod")}))
ok("the strand meshes parented to the head and carry real verts", ev_a["verts"] > 500, str(ev_a["verts"]))
head2 = bpy.data.objects.new("HeadEmpty2", None)
scn.collection.objects.link(head2)
ev_b = m.groom_strands(scn, bpy, head2, hair, "long", 1.0, 1.0, gp, 1.0)
ok("the same profile lands the same groom (strand count + hash, A/B)",
   ev_a["strands"] == ev_b["strands"] and ev_a["hash"] == ev_b["hash"] and len(ev_a["hash"]) == 16, f"{ev_a['hash']} vs {ev_b['hash']}")
gp_other = m.groom_profile({"hairStyle": "long", "groomProfile": {"sweep": -0.5, "flow": 0.1, "flyaway": 0.1, "taper": 1.0, "fields": []}})
head3 = bpy.data.objects.new("HeadEmpty3", None)
scn.collection.objects.link(head3)
ev_c = m.groom_strands(scn, bpy, head3, hair, "long", 1.0, 1.0, gp_other, 1.0)
ok("a different profile grooms differently (different hash)", ev_a["hash"] != ev_c["hash"], f"{ev_a['hash']} vs {ev_c['hash']}")
ev_wide = m.groom_strands(scn, bpy, head3, hair, "long", 1.0, 1.0, gp, 0.4)
ok("the wide LOD carries a reduced pass (fewer strands, lod named)",
   ev_wide["strands"] < ev_a["strands"] and ev_wide["lod"] == "wide", json.dumps({k: ev_wide[k] for k in ("strands", "lod")}))

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
    print("direct half failed; stderr tail:", proc.stderr[-1200:])
    failures += 1


# ── half 2: render jobs over the real worker ──
def run_job(job_id, cast, shot_type="CLOSEUP"):
    shot = {
        "number": 1,
        "description": "groomed strand smoke shot",
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
                "number": 1, "title": "Groom Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Groom Smoke", "visualStyle": "DONGHUA",
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


HERO = {
    "name": "Groomed Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "none", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle"], "conformFactor": 0.75,
    "groomProfile": {"sweep": 0.1, "flow": 0.55, "flyaway": 0.35, "taper": 0.85, "fields": ["flowing"]},
}
GUESS = {k: v for k, v in HERO.items() if k not in ("groomProfile", "sheetFields", "conformFactor")}
GUESS["hairStyle"] = "topknot"  # a different style -> a different prior -> a different groom

RIVAL = {
    "name": "Groomed Rival", "hairColor": "#221133", "hairStyle": "topknot",
    "robeColor": "#5a2f4d", "robeAccent": "#c2a13c", "skinTone": "#d9b48f",
    "weaponType": "spear", "bladeColor": "#ff7b72", "build": "sturdy", "beard": False,
}

state = run_job("groom-smoke-close", [HERO, RIVAL], "CLOSEUP")
rig = state.get("rig") or {}
g = rig.get("groom")
expect("the close render built the figure procedurally", state.get("figureSource") == "procedural:v4.0-designed", str(state.get("figureSource")))
expect("the close render names the groom evidence", isinstance(g, dict), json.dumps(rig)[:300])
if isinstance(g, dict):
    expect("the close framing carries the FULL pass (long style: 3 guides x 7 strands)",
           g.get("lod") == "full" and g.get("strands", 0) >= 20, json.dumps({k: g.get(k) for k in ("strands", "flyaways", "lod")}))
    expect("the sheet's own word rides (flowing) with the factors", g.get("fields") == ["flowing"] and g.get("factors", {}).get("flow") == 0.55, json.dumps(g.get("factors")))
    expect("the groom hash is deterministic (16 hex)", isinstance(g.get("hash"), str) and len(g["hash"]) == 16, str(g.get("hash")))
expect("the second figure grooms too (the B figure carries its own strands)", isinstance(state.get("secondFigureGroom"), dict), json.dumps(state.get("secondFigureGroom") or {})[:160])
clip = os.path.join(OUT_DIR, "groom-smoke-close.mp4")
expect("the clip rendered", os.path.exists(clip) and os.path.getsize(clip) > 0)

state_wide = run_job("groom-smoke-wide", [HERO], "WS")
g_wide = ((state_wide.get("rig") or {}).get("groom"))
expect("the wide framing keeps a reduced pass (lod wide, fewer strands)",
       isinstance(g_wide, dict) and g_wide.get("lod") == "wide" and isinstance(g, dict) and g_wide.get("strands", 0) < g.get("strands", 0),
       json.dumps(g_wide or {})[:160])

state_guess = run_job("groom-smoke-guess", [GUESS], "CLOSEUP")
g_guess = ((state_guess.get("rig") or {}).get("groom"))
expect("a guess build keeps the STYLE PRIOR with honest empty fields",
       isinstance(g_guess, dict) and g_guess.get("fields") == [] and g_guess.get("factors", {}).get("sweep") == 0.45 and g_guess.get("strands", 0) > 0,
       json.dumps(g_guess or {})[:200])
if isinstance(g, dict) and isinstance(g_guess, dict):
    expect("a different profile lands a different groom hash", g["hash"] != g_guess["hash"], f"{g['hash']} vs {g_guess['hash']}")

for f in ("groom-smoke-close", "groom-smoke-wide", "groom-smoke-guess"):
    p = os.path.join(OUT_DIR, f"{f}.mp4")
    if os.path.exists(p):
        os.unlink(p)
    j = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(j):
        os.unlink(j)

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - groom smoke")
sys.exit(0 if failures == 0 else 1)
