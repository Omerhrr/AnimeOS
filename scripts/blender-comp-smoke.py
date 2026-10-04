# Smoke-test THE FRAME IS FINISHED IN COMP (iteration 86) inside the
# REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the comp
#      profile clamps against the same bounds comp.ts clamps against
#      (a missing profile keeps the house defaults, an unknown lut
#      degrades to neutral); the hash mirrors the TS formula
#      bit-exactly; the graph builds over a real scene and the
#      evidence names what landed (the AOV passes ride).
#   2. RENDER JOBS over the real worker: a designed shot with a
#      tribulation comp rides its own color script (source "shot
#      wire", the layers + aovs + hash named); the same profile twice
#      hashes the same over real renders; a payload without a comp
#      keeps the house defaults (source "house defaults", neutral) and
#      hashes differently.
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
import importlib.util, hashlib, json, sys
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
prof = m.comp_profile({"comp": {"mist": 2.0, "chroma": -0.5, "vignette": 1.5, "speed": 0.55, "beams": 0.5, "grain": 0.3, "lut": "tribulation", "fields": ["tribulation", "speed"]}})
f = prof["factors"]
ok("wild factors clamped (mist 2->1, chroma -0.5->0, vignette 1.5->1), the named fields ride",
   f["mist"] == 1.0 and f["chroma"] == 0.0 and f["vignette"] == 1.0 and f["speed"] == 0.55 and prof["lut"] == "tribulation"
   and prof["fields"] == ["tribulation", "speed"] and prof["named"] is True, json.dumps(prof))
unknown = m.comp_profile({"comp": {"mist": 0.3, "lut": "sepia"}})
ok("an unknown lut degrades to neutral", unknown["lut"] == "neutral", json.dumps(unknown))
defaults = m.comp_profile({})
ok("a payload without a comp keeps the HOUSE DEFAULTS (honest source + empty fields)",
   defaults["named"] is False and defaults["fields"] == []
   and defaults["factors"] == m.COMP_BASE and defaults["lut"] == "neutral", json.dumps(defaults))

# the neutral LUT IS the iteration-73 donghua room grade
ok("the neutral color script keeps the iteration-73 room grade",
   m.COMP_LUTS["neutral"]["lift"] == (0.98, 0.985, 1.02, 1.0) and m.COMP_LUTS["neutral"]["gain"] == (1.03, 1.0, 0.965, 1.0)
   and m.COMP_LUTS["neutral"]["sat"] == 1.06, json.dumps(m.COMP_LUTS["neutral"]))
ok("the four color scripts stand (moonlight, tribulation, dawn, neutral)",
   sorted(m.COMP_LUTS.keys()) == ["dawn", "moonlight", "neutral", "tribulation"], str(sorted(m.COMP_LUTS.keys())))

# the hash mirrors the TS formula bit-exactly
key = "86|0.320|0.300|0.350|0.550|0.465|0.300|tribulation|v1"
expect_hash = hashlib.sha256(key.encode()).hexdigest()[:16]
fixture = m.comp_profile({"comp": {"mist": 0.32, "chroma": 0.3, "vignette": 0.35, "speed": 0.55, "beams": 0.465, "grain": 0.3, "lut": "tribulation"}})
ok("the comp hash mirrors compHash in comp.ts (sha256-16 over the bounded profile)",
   m.comp_hash(fixture) == expect_hash, f"{m.comp_hash(fixture)} vs {expect_hash}")
ok("the same profile hashes the same twice (deterministic)", m.comp_hash(fixture) == m.comp_hash(fixture))
other = m.comp_profile({"comp": {"mist": 0.5, "chroma": 0.3, "vignette": 0.35, "speed": 0.55, "beams": 0.465, "grain": 0.3, "lut": "tribulation"}})
ok("a different profile hashes differently", m.comp_hash(fixture) != m.comp_hash(other))
ok("the hash is 16 hex", len(m.comp_hash(fixture)) == 16, m.comp_hash(fixture))

# the graph builds over a real scene and the evidence names the truth
scn = bpy.context.scene
prof2 = m.comp_profile({"comp": {"mist": 0.45, "chroma": 0.3, "vignette": 0.35, "speed": 0.55, "beams": 0.5, "grain": 0.3, "lut": "tribulation", "fields": ["tribulation", "speed"]}})
ev = m.build_comp_graph(scn, prof2, 24)
ok("the full graph lands every layer (ao, mist, speed, bloom, beams, chroma, grain, vignette, lut, saturation)",
   all(x in ev["layers"] for x in ("ao", "mist", "speed", "bloom", "beams", "chroma", "vignette", "lut", "saturation"))
   and any(x.startswith("grain(") for x in ev["layers"]), json.dumps(ev))
ok("the AOV passes ride (mist, vector, ao)", all(x in ev["aovs"] for x in ("mist", "vector", "ao")), json.dumps(ev["aovs"]))
ok("nothing skipped on the healthy path", ev["skipped"] == [], json.dumps(ev["skipped"]))
# THE FAC-DRIVE LAW (iteration 128): the map-range-driven mixes (the
# mist's fog and the grain's field band) must carry the drive ON THE
# BUILD'S OWN SOCKET NAME - 4.x's CompositorNodeMixRGB names it 'Fac'
# and the 5.x ShaderNodeMix names it 'Factor'. An unlinked Fac on the
# MIST mix leaves the 1.0 default and paints EVERY frame with the
# mistTint - the 128 night's flat gray wash (mean stdev ~1), caught
# by the eye before the pen.
_tree = scn.node_tree if scn.use_nodes else None
_mist_mixes = [n for n in _tree.nodes if n.bl_idname in ("CompositorNodeMixRGB", "ShaderNodeMix")
               and getattr(n, "blend_type", "") == "MIX"]
ok("the mist mix's fac is DRIVEN by the map range (the build's own socket name)",
   _mist_mixes and all(n.inputs.get("Fac").is_linked if n.inputs.get("Fac") else
                       any(s.is_linked for s in n.inputs if s.name == "Factor")
                       for n in _mist_mixes),
   [(n.bl_idname, n.inputs.get("Fac").is_linked if n.inputs.get("Fac") else "no-Fac") for n in _mist_mixes])
prof_quiet = m.comp_profile({})
ev_quiet = m.build_comp_graph(scn, prof_quiet, 24)
ok("a quiet profile skips the streak layers (speed, beams) honestly",
   "speed" not in ev_quiet["layers"] and "beams" not in ev_quiet["layers"] and ev_quiet["skipped"] == [],
   json.dumps(ev_quiet))

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
def run_job(job_id, comp):
    shot = {
        "number": 1,
        "description": "comp smoke shot",
        "shotType": "CLOSEUP", "lens": "50mm", "movement": "STATIC",
        "poseStart": "STANCE", "poseEnd": "STANCE",
        "lighting": "tribulation lightning", "duration": 1.0,
        "cast": [HERO],
    }
    if comp is not None:
        shot["comp"] = comp
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Comp Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Comp Smoke", "visualStyle": "DONGHUA",
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
    "name": "Comp Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "none", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle"], "conformFactor": 0.75,
}

WIRE = {"mist": 0.45, "chroma": 0.3, "vignette": 0.35, "speed": 0.55, "beams": 0.5, "grain": 0.3, "lut": "tribulation", "fields": ["tribulation", "speed"]}

state = run_job("comp-smoke-wire", WIRE)
c = (state.get("render") or {}).get("comp")
expect("the wire build names the comp evidence", isinstance(c, dict), json.dumps((state.get("render") or {}))[:300])
if isinstance(c, dict):
    expect("the source is the shot wire with the tribulation script",
           c.get("source") == "shot wire" and c.get("profile", {}).get("lut") == "tribulation", json.dumps(c.get("profile")))
    expect("the shot's own fields ride", c.get("fields") == ["tribulation", "speed"], json.dumps(c.get("fields")))
    expect("the comp layers landed over the real render (mist, bloom, vignette, lut among them)",
           all(x in (c.get("layers") or []) for x in ("mist", "bloom", "vignette", "lut", "saturation")), json.dumps(c.get("layers")))
    expect("the AOV passes rode the render", all(x in (c.get("aovs") or []) for x in ("mist", "vector", "ao")), json.dumps(c.get("aovs")))
    expect("the comp hash is 16 hex", isinstance(c.get("hash"), str) and len(c["hash"]) == 16, str(c.get("hash")))
    expect("the mode is named honestly (PREVIEW carries the same graph)", c.get("mode") == "PREVIEW", str(c.get("mode")))

state2 = run_job("comp-smoke-wire-2", WIRE)
c2 = ((state2.get("render") or {}).get("comp"))
expect("the same comp hashes the same over two real renders",
       isinstance(c, dict) and isinstance(c2, dict) and c["hash"] == c2["hash"], f"{c.get('hash') if isinstance(c, dict) else '?'} vs {c2.get('hash') if isinstance(c2, dict) else '?'}")

state_def = run_job("comp-smoke-defaults", None)
c_def = (state_def.get("render") or {}).get("comp")
expect("a payload without a comp keeps the HOUSE DEFAULTS (neutral, honest source, different hash)",
       isinstance(c_def, dict) and c_def.get("source") == "house defaults" and c_def.get("profile", {}).get("lut") == "neutral"
       and isinstance(c, dict) and c_def["hash"] != c["hash"], json.dumps(c_def or {})[:220])

for f in ("comp-smoke-wire", "comp-smoke-wire-2", "comp-smoke-defaults"):
    p = os.path.join(OUT_DIR, f"{f}.mp4")
    if os.path.exists(p):
        os.unlink(p)
    j = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(j):
        os.unlink(j)

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - comp smoke")
sys.exit(0 if failures == 0 else 1)
