#!/usr/bin/env python3
# Smoke-test THE SHOTDIRECTIVE COMPILER (iteration 98) inside the
# REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the
#      canonical key against LITERAL expected keys (a rich shot, a
#      minimal shot); the degrade laws (a corrupt grammar, a corrupt
#      fx program, a bool cloth each land the honest canon); the
#      sensitivity law (every section's own truth moves the hash);
#      A/B determinism; the hash mirroring the sha256-16 formula
#      over the hand-built key.
#   2. RENDER JOBS over the real worker: a DIRECTED shot (grammar +
#      fx + physics + the studio's directiveHash) names the state's
#      shotDirective with match TRUE and the hash matching the
#      independent derivation; a MANGLED wire (the expected hash
#      swapped) names ITSELF (match false - the law's crown); a
#      legacy payload without a hash names its own derivation
#      honestly (match true, expected null); the clips render;
#      cleanup.
import hashlib
import json, os, subprocess, sys, time, math

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
import importlib.util, json, math, sys
import bpy
spec = importlib.util.spec_from_file_location("bridge", sys.argv[-1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# ── the canonical key against LITERAL expected keys ──
RICH = {
    "movement": "static", "poseStart": "CROUCH", "poseEnd": "RISE",
    "duration": 1.3, "lighting": "Moonlit Night",
    "grammar": [{"move": "DOLLY_IN", "from": 0, "to": 0.6, "wind": 0.4},
                {"move": "PAN", "from": 0.6, "to": 1, "wind": 0.2, "poseStart": "RISE"}],
    "fx": [{"kind": "Burst"}, {"kind": "ring"}, {"kind": "Burst"}],
    "physics": [{"kind": "Knock"}],
    "cloth": 0.75, "flesh": None,
    "speech": {"lines": 2},
    "expression": {"emotion": "alert"}, "comp": {"lut": "moonlit"},
    "clothDirective": {"garment": "silk"}, "cameraChoreo": None, "choreo": None, "pairedChoreo": None,
}
EXPECT_RICH = ("119|mv=STATIC|poses=CROUCH->RISE|dur=1.300|light=moonlit night"
               "|gr=2:DOLLY_IN+PAN:0.6:1|fx=3:burst+ring|ph=1:knock"
               "|cloth=0.750|flesh=-|speech=2"
               "|expr=1|comp=1|clothd=1|camchoreo=0|choreo=0|paired=0|v2")
ok("the rich shot's key mirrors the LITERAL expected key field for field",
   m.shot_directive_key(RICH) == EXPECT_RICH, m.shot_directive_key(RICH))
ok("the rich hash mirrors the sha256-16 formula over that key",
   m.shot_directive_hash(RICH) == hashlib.sha256(EXPECT_RICH.encode("utf-8")).hexdigest()[:16],
   m.shot_directive_hash(RICH))

MIN = {"movement": None, "poseStart": None, "poseEnd": None, "duration": 1.0,
       "lighting": None, "grammar": None, "fx": None, "physics": None}
EXPECT_MIN = ("119|mv=-|poses=-|dur=1.000|light=-|gr=-|fx=-|ph=-"
              "|cloth=-|flesh=-|speech=-"
              "|expr=0|comp=0|clothd=0|camchoreo=0|choreo=0|paired=0|v2")
ok("the minimal shot's key degrades to the honest canon",
   m.shot_directive_key(MIN) == EXPECT_MIN, m.shot_directive_key(MIN))

# ── the degrade laws: a corrupt program lands the honest canon ──
ok("a corrupt grammar degrades to gr=- (the whole-clip move, both sides)",
   m.shot_directive_key({**RICH, "grammar": [{"move": "NOPE", "from": 0, "to": 1}]}).split("|")[5] == "gr=-")
ok("a one-beat grammar is no grammar (the worker's own law)",
   m.shot_directive_key({**RICH, "grammar": [{"move": "PAN", "from": 0, "to": 1}]}).split("|")[5] == "gr=-")
ok("an out-of-range beat kills the grammar (0<=from<to<=1)",
   m.shot_directive_key({**RICH, "grammar": [{"move": "PAN", "from": 0.5, "to": 0.4}, {"move": "PAN", "from": 0, "to": 0.3}]}).split("|")[5] == "gr=-")
ok("a kindless fx program names the count with an empty kind set",
   m.shot_directive_key({**RICH, "fx": [{"nope": 1}, {"nope": 2}]}).split("|")[6] == "fx=2:")
ok("a bool cloth is not a number (the honest dash)",
   m.shot_directive_key({**RICH, "cloth": True}).split("|")[8] == "cloth=-")
ok("a single pose rides alone (SLASH, no pair arrow)",
   m.shot_directive_key({**MIN, "poseEnd": "slash "}).split("|")[2] == "poses=SLASH")
ok("an aliased pose resolves through the vocabulary (idle -> STANCE)",
   m.shot_directive_key({**MIN, "poseStart": "idle", "poseEnd": "LUNGE"}).split("|")[2] == "poses=STANCE->LUNGE")

# ── the sensitivity law: every section's own truth moves the hash ──
base = m.shot_directive_hash(RICH)
probes = {
    "the movement": {**RICH, "movement": "ORBIT"},
    "the pose pair": {**RICH, "poseEnd": "FALL"},
    "the duration": {**RICH, "duration": 1.5},
    "the lighting": {**RICH, "lighting": "Dawn light"},
    "the grammar's wind": {**RICH, "grammar": [{**RICH["grammar"][0], "wind": 0.5}, RICH["grammar"][1]]},
    "an fx kind": {**RICH, "fx": [{"kind": "Aura"}] + RICH["fx"][1:]},
    "the cloth call": {**RICH, "cloth": 0.8},
    "the speech lines": {**RICH, "speech": {"lines": 3}},
    "the comp presence": {**RICH, "comp": None},
    "the choreo presence": {**RICH, "choreo": {"keys": []}},
}
for name, shot in probes.items():
    ok(f"{name} moves the directive hash", m.shot_directive_hash(shot) != base, m.shot_directive_hash(shot))

ok("the same shot lands the same hash twice (A/B)",
   m.shot_directive_hash(RICH) == m.shot_directive_hash(json.loads(json.dumps(RICH))))

# the sections name the intent readably
secs = m.shot_directive_sections(RICH)
ok("the sections name the intent readably",
   secs["movement"] == "STATIC" and secs["poses"] == "CROUCH->RISE" and secs["grammarBeats"] == 2
   and secs["expression"] == 1 and secs["choreo"] == 0, json.dumps(secs))

print("DIRECT_FAILS", len(fails))
sys.exit(1 if fails else 0)
"""
if HALF in ("all", "direct"):
  proc = subprocess.run(
    [BLENDER, "-b", "--factory-startup", "--python-expr", DIRECT, "--", SCRIPT],
    capture_output=True, text=True, timeout=420, cwd=ROOT,
  )
  for line in proc.stdout.splitlines():
    if line.startswith(("PASS", "FAIL", "DIRECT_FAILS")):
      print(line)
  if proc.returncode != 0 or "DIRECT_FAILS 0" not in proc.stdout:
    print("direct half failed; stderr tail:", proc.stderr[-1200:])
    failures += 1


# ── half 2: render jobs over the real worker ──
HERO = {
    "name": "Directive Smoke Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
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

# the INDEPENDENTLY derived directive hash for the directed job's shot
def indep_key(cast_flag=True):
    return ("119|mv=STATIC|poses=CROUCH->RISE|dur=1.000|light=moonlit ridge"
            "|gr=2:DOLLY_IN+PAN:0.5:1|fx=2:burst+ring|ph=1:knock"
            "|cloth=0.750|flesh=-|speech=-"
            "|expr=1|comp=1|clothd=1|camchoreo=1|choreo=0|paired=0|v2")

DIRECTED_SHOT_FIELDS = {
    "number": 1, "description": "Bai Ling coils and rises as the lens pushes",
    "shotType": "CLOSEUP", "lens": "50mm", "movement": "STATIC",
    "poseStart": "CROUCH", "poseEnd": "RISE",
    "lighting": "moonlit ridge", "duration": 1.0,
}
DIRECTED_PROGRAMS = {
    "grammar": [{"move": "DOLLY_IN", "from": 0, "to": 0.5, "wind": 0.3},
                {"move": "PAN", "from": 0.5, "to": 1, "wind": 0.2, "poseEnd": "RISE"}],
    "fx": [{"kind": "burst"}, {"kind": "ring"}],
    "physics": [{"kind": "knock"}],
    "cloth": 0.75,
    "expression": {"emotion": "determined"},
    "comp": {"lut": "neutral", "fields": []},
    "clothDirective": {"garment": "robe", "fields": []},
    "cameraChoreo": {"pushIn": 0.5, "fields": []},
}
EXPECT_DIRECTED = hashlib.sha256(indep_key().encode("utf-8")).hexdigest()[:16]


def run_job(job_id, shot_extra, directive_hash=None):
    shot = dict(DIRECTED_SHOT_FIELDS)
    shot.update(DIRECTED_PROGRAMS)
    shot.update(shot_extra)
    if directive_hash is not None:
        shot["directiveHash"] = directive_hash
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Directive Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Directive Smoke", "visualStyle": "DONGHUA",
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
    print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - directive smoke (direct half)")
    sys.exit(0 if failures == 0 else 1)

# job 1: the DIRECTED shot - the studio's hash rides, the worker agrees
state = run_job("directive-smoke-directed", {"cast": [HERO]}, EXPECT_DIRECTED)
sd = state.get("shotDirective")
expect("the directed render names the shotDirective evidence", isinstance(sd, dict), json.dumps(state)[:220])
if isinstance(sd, dict):
    expect("the worker's derivation matches the studio's hash (the wire is what the studio compiled)",
           sd.get("match") is True and sd.get("hash") == EXPECT_DIRECTED and sd.get("expected") == EXPECT_DIRECTED,
           json.dumps(sd)[:220])
    expect("the law version rides (119)", sd.get("lawVersion") == 119, json.dumps(sd)[:120])
    expect("the sections name the intent (2 grammar beats, the pose pair)",
           (sd.get("sections") or {}).get("grammarBeats") == 2
           and (sd.get("sections") or {}).get("poses") == "CROUCH->RISE",
           json.dumps(sd.get("sections")))
clip = os.path.join(OUT_DIR, "directive-smoke-directed.mp4")
expect("the clip rendered", os.path.exists(clip) and os.path.getsize(clip) > 0)

# job 2: the MANGLED wire - a swapped expected hash names ITSELF
state_m = run_job("directive-smoke-mangled", {"cast": [HERO]}, "0123456789abcdef")
sd_m = state_m.get("shotDirective")
expect("a mangled expected hash NAMES ITSELF (match false, both hashes named)",
       isinstance(sd_m, dict) and sd_m.get("match") is False
       and sd_m.get("expected") == "0123456789abcdef" and sd_m.get("hash") == EXPECT_DIRECTED,
       json.dumps(sd_m or {})[:220])

# job 3: the LEGACY payload - no hash rides, the worker names its own derivation
state_l = run_job("directive-smoke-legacy", {"cast": [HERO]}, None)
sd_l = state_l.get("shotDirective")
expect("a legacy payload names its own derivation honestly (match true, expected null)",
       isinstance(sd_l, dict) and sd_l.get("match") is True and sd_l.get("expected") is None
       and sd_l.get("hash") == EXPECT_DIRECTED,
       json.dumps(sd_l or {})[:220])

# cleanup
for f in ("directive-smoke-directed", "directive-smoke-mangled", "directive-smoke-legacy"):
    p = os.path.join(OUT_DIR, f + ".mp4")
    if os.path.exists(p):
        os.remove(p)
    jf = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(jf):
        os.remove(jf)
expect("cleanup removed the smoke artifacts",
       not os.path.exists(os.path.join(OUT_DIR, "directive-smoke-directed.mp4"))
       and not os.path.exists(os.path.join(OUT_DIR, ".job-directive-smoke-legacy.json")))

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - directive smoke (render half)")
sys.exit(0 if failures == 0 else 1)
