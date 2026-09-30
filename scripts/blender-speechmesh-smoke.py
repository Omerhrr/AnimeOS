# Smoke-test THE MOUTH SPEAKS IN THE MESH (iteration 92, Layer A - the
# blendshape slice the Layer A remainder named) inside the REAL Blender
# worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the mesh
#      law (the jaw follow, the wide/round ride-through, the bilabial
#      press window, the rest), the sculpt (three keys on a real carved
#      head, the basis untouched, bounded deltas, region honesty,
#      determinism A/B), the apply_pose compose over a real rig stub
#      (the max jaw, the rest between segments), and the evidence hash
#      mirroring the TS formula bit-exactly (hardcoded spec anchor).
#   2. RENDER JOBS over the real worker: the speaking closeup's state
#      naming the mesh evidence (shapes + samples + hash over the REAL
#      render), the same build twice hashing the same, the silent
#      closeup staying honestly None, and the payload law answering a
#      MED build the same way (the wire decides WHO speaks; the worker
#      answers the payload).
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
import importlib.util, hashlib, json, math, os, sys
import bpy
spec = importlib.util.spec_from_file_location("bridge", sys.argv[-1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# ── the mesh law, derived INDEPENDENTLY (the smoke's own formulas) ──
JAW_FOLLOW = 0.45
PRESS_LO, PRESS_HI = 0.005, 0.055

def law(shape):
    if shape is None:
        return {"jaw": 0.0, "wide": 0.0, "round": 0.0, "press": 0.0}
    o = max(0.0, min(1.0, float(shape.get("o", 0.0))))
    w = max(0.0, min(1.0, float(shape.get("w", 0.0))))
    r = max(0.0, min(1.0, float(shape.get("r", 0.0))))
    press = 1.0 if (PRESS_LO < o <= PRESS_HI) else 0.0
    return {"jaw": round(o * JAW_FOLLOW, 3), "wide": round(w, 3), "round": round(r, 3), "press": press}

SHAPES = {
    "vowel a": {"o": 1.0, "w": 0.15, "r": 0.2},
    "ee": {"o": 0.5, "w": 0.95, "r": 0.0},
    "oo": {"o": 0.6, "w": 0.0, "r": 1.0},
    "closed mbp": {"o": 0.04, "w": 0.1, "r": 0.1},
    "soft fv": {"o": 0.22, "w": 0.2, "r": 0.15},
    "breath": {"o": 0.0, "w": 0.0, "r": 0.0},
    "wild": {"o": 5.0, "w": -2.0, "r": 99.0},
}
for nm, sh in SHAPES.items():
    got, want = m.speech_mesh_weights(sh), law(sh)
    ok(f"the mesh law mirrors the independent derivation ({nm})",
       all(abs(got[k] - want[k]) < 1e-9 for k in ("jaw", "wide", "round", "press")),
       json.dumps({"got": got, "want": want}))
ok("the mesh law rests between segments (None)",
   m.speech_mesh_weights(None) == {"jaw": 0.0, "wide": 0.0, "round": 0.0, "press": 0.0},
   json.dumps(m.speech_mesh_weights(None)))
ok("the CLOSED shape presses and the breath never does",
   m.speech_mesh_weights(SHAPES["closed mbp"])["press"] == 1.0
   and m.speech_mesh_weights(SHAPES["breath"])["press"] == 0.0
   and m.speech_mesh_weights(SHAPES["vowel a"])["press"] == 0.0)
ok("the constants mirror the TS law",
   m.SPEECH_JAW_FOLLOW == 0.45 and m.SPEECH_PRESS_WINDOW == (0.005, 0.055)
   and m.SPEECH_MESH_SHAPES == ("mouthWide", "mouthRound", "lipPress"),
   f"{m.SPEECH_JAW_FOLLOW} {m.SPEECH_PRESS_WINDOW} {m.SPEECH_MESH_SHAPES}")

# ── the sculpt: three keys on a real carved head, the basis untouched ──
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
prof = {"family": "oval", "factors": {"jawTaper": 0.74, "chinFwd": 0.028, "browFwd": 0.014, "cheekOut": 0.022, "noseLen": 1.0, "eyeScale": 1.0}, "fields": []}
skin_mat = bpy.data.materials.new("SmokeSkin")
head_empty = bpy.data.objects.new("Head", None)
scn.collection.objects.link(head_empty)
head = m.sculpt_head_mesh(scn, bpy, head_empty, skin_mat, prof, 1.0, depth=4)
m.sculpt_expression_keys(head)  # the real order: the expression keys first
before = [v.co.copy() for v in head.data.vertices]
skeys = m.sculpt_speech_keys(head)
ok("the three speech keys sculpt onto the carved head",
   all(n in skeys for n in ("mouthWide", "mouthRound", "lipPress")),
   json.dumps(list(skeys.keys())))
ok("the keys rest at zero", all(kb.value == 0.0 for kb in skeys.values()))
ok("the basis stays untouched (the faceHash keeps what 82/90 proved)",
   len(before) == len(head.data.vertices)
   and all((head.data.shape_keys.key_blocks["Basis"].data[i].co - before[i]).length < 1e-9 for i in range(len(before))))
bounded = True
for name, kb in skeys.items():
    base = head.data.shape_keys.key_blocks["Basis"].data
    for i in range(len(kb.data)):
        if (kb.data[i].co - base[i].co).length > 0.013 * 0.115:
            bounded = False
            break
ok("every key's delta stays inside the bounded amplitude", bounded)
out_of_region = True
for name, kb in skeys.items():
    base = head.data.shape_keys.key_blocks["Basis"].data
    for i, v in enumerate(base):
        x, y, z = v.co.x / 0.115, v.co.y / 0.115, v.co.z / 0.115
        if y >= -0.80 or not (-0.55 < z < -0.28) or abs(x) >= 0.35:
            if (kb.data[i].co - v.co).length > 1e-9:
                out_of_region = False
                break
ok("a vertex outside the mouth region never moves (the region honesty)", out_of_region)

# determinism A/B: the same sculpt twice lands the same key data
head2 = m.sculpt_head_mesh(scn, bpy, head_empty, skin_mat, prof, 1.0, depth=4)
m.sculpt_expression_keys(head2)
skeys2 = m.sculpt_speech_keys(head2)
same = True
for name in ("mouthWide", "mouthRound", "lipPress"):
    for i in range(len(skeys[name].data)):
        if (skeys[name].data[i].co - skeys2[name].data[i].co).length > 1e-9:
            same = False
            break
ok("the same sculpt lands the same keys (deterministic A/B)", same)

# ── the compose over a REAL rig stub (apply_pose end to end) ──
def mk_empty(name):
    o = bpy.data.objects.new(name, None)
    scn.collection.objects.link(o)
    return o

def stub_figure():
    fig = {k: mk_empty(f"stub-{k}") for k in (
        "root", "spine", "head", "rShoulder", "lShoulder", "rElbow", "lElbow",
        "rHip", "lHip", "rKnee", "lKnee", "browL", "browR", "eyeL", "eyeR",
        "mouth", "rThumb", "lThumb")}
    fig["rFingers"] = [(mk_empty("stub-rf"), False)]
    fig["lFingers"] = [(mk_empty("stub-lf"), False)]
    fig["blade"] = None
    fig["exprKeys"] = m.sculpt_expression_keys(head)
    fig["speechKeys"] = skeys
    return fig

EXPr = {"brow": 0.0, "squint": 0.0, "mouthFloor": 0.0, "knit": 0.0, "cheek": 0.0, "corner": 0.0, "jaw": 0.3}
fig = stub_figure()
m.apply_pose(fig, "STANCE", "STANCE", 0.0, 0.5, speech={"o": 1.0, "w": 0.15, "r": 0.2}, expr=dict(EXPr))
ok("the vowel drives the spread and the purse",
   abs(skeys["mouthWide"].value - 0.15) < 1e-6 and abs(skeys["mouthRound"].value - 0.2) < 1e-6,
   f"{skeys['mouthWide'].value} {skeys['mouthRound'].value}")
ok("the jaw follows the line at the bounded fraction (0.45 wins over the scowl's 0.3)",
   abs(skeys["lipPress"].value) < 1e-6 and abs(fig["exprKeys"]["jawOpen"].value - 0.45) < 1e-6,
   str(fig["exprKeys"]["jawOpen"].value))
m.apply_pose(fig, "STANCE", "STANCE", 0.0, 0.5, speech={"o": 1.0, "w": 0.15, "r": 0.2}, expr=dict(EXPr, jaw=0.6))
ok("the performed jaw wins above the follow (the max compose)",
   abs(fig["exprKeys"]["jawOpen"].value - 0.6) < 1e-6, str(fig["exprKeys"]["jawOpen"].value))
m.apply_pose(fig, "STANCE", "STANCE", 0.0, 0.5, speech={"o": 0.04, "w": 0.1, "r": 0.1}, expr=dict(EXPr))
ok("the bilabial press fires on the CLOSED shape (and the jaw keeps the scowl's floor)",
   abs(skeys["lipPress"].value - 1.0) < 1e-6 and abs(fig["exprKeys"]["jawOpen"].value - 0.3) < 1e-6,
   f"{skeys['lipPress'].value} {fig['exprKeys']['jawOpen'].value}")
m.apply_pose(fig, "STANCE", "STANCE", 0.0, 0.5, speech=None, expr=dict(EXPr))
ok("between segments the mouth RESTS (no frozen mid-shape)",
   all(kb.value == 0.0 for kb in skeys.values()) and abs(fig["exprKeys"]["jawOpen"].value - 0.3) < 1e-6,
   json.dumps({k: kb.value for k, kb in skeys.items()}))
fig2 = stub_figure()
fig2["exprKeys"] = {}
fig2["speechKeys"] = {}
m.apply_pose(fig2, "STANCE", "STANCE", 0.0, 0.5, speech={"o": 0.5, "w": 0.5, "r": 0.5}, expr=None)
ok("a rig without the keys skips honestly (no crash, no drive)", True)

# ── the evidence: the hash mirrors the TS formula bit-exactly ──
TABLE = [
    (0.0, 100.0, 0.32, 0.3, 0.2),
    (100.0, 300.0, 0.72, 0.75, 0.05),
    (350.0, 450.0, 0.04, 0.1, 0.1),
    (550.0, 700.0, 0.92, 0.05, 0.75),
    (700.0, 900.0, 0.5, 0.95, 0.0),
]
vis = [(s, e, o, w, r) for (s, e, o, w, r) in TABLE]
DUR = 1.0
ev = m.speech_mesh_evidence(vis, DUR)
ok("the evidence names the three speech shapes",
   ev["shapes"] == ["mouthWide", "mouthRound", "lipPress"], json.dumps(ev["shapes"]))
ok("the samples sit at the identity clock (22/40/62%)",
   [s["at"] for s in ev["samples"]] == [0.22, 0.4, 0.62], json.dumps([s["at"] for s in ev["samples"]]))

# the independent spec rebuild (the smoke's own formatting law)
def sample_at(t_ms):
    prev = None
    for (s, e, o, w, r) in vis:
        if s <= t_ms < e:
            return (o, w, r)
        if t_ms < s:
            if prev is not None and t_ms < prev[1] + 90.0:
                k = 1.0 - (t_ms - prev[1]) / 90.0
                return (prev[2] * k, prev[3] * k, prev[4] * k)
            return None
        prev = (s, e, o, w, r)
    return None

parts = []
for f in (0.22, 0.4, 0.62):
    at = round(DUR * f, 3)
    sh = sample_at(at * 1000.0)
    shd = {"o": sh[0], "w": sh[1], "r": sh[2]} if sh else None
    mw = law(shd)
    o = round(max(0.0, min(1.0, sh[0])), 3) if sh else 0.0
    w = round(max(0.0, min(1.0, sh[1])), 3) if sh else 0.0
    r = round(max(0.0, min(1.0, sh[2])), 3) if sh else 0.0
    parts.append("{:.3f}:{:.3f},{:.3f},{:.3f}:{:.3f},{:.3f},{:.3f},{:.3f}".format(
        at, o, w, r, mw["jaw"], mw["wide"], mw["round"], mw["press"]))
spec_independent = "92|" + "|".join(parts) + "|v1"
hash_independent = hashlib.sha256(spec_independent.encode("utf-8")).hexdigest()[:16]
ok("the hash mirrors the independent spec rebuild bit-exactly",
   ev["hash"] == hash_independent and len(ev["hash"]) == 16,
   f"{ev['hash']} vs {hash_independent}")
ok("the spec is the hardcoded anchor (the format drift tripwire)",
   spec_independent == "92|0.220:0.720,0.750,0.050:0.324,0.750,0.050,0.000|0.400:0.040,0.100,0.100:0.018,0.100,0.100,1.000|0.620:0.920,0.050,0.750:0.414,0.050,0.750,0.000|v1",
   spec_independent)
ok("the press sample IS in the evidence (0.4 lands on the closure)",
   abs(ev["samples"][1]["mesh"]["press"] - 1.0) < 1e-9 and abs(ev["samples"][1]["mesh"]["jaw"] - 0.018) < 1e-9,
   json.dumps(ev["samples"][1]))
ok("the same table + duration hashes the same (deterministic)",
   m.speech_mesh_evidence(vis, DUR)["hash"] == ev["hash"])
ok("a different duration lands a different hash (the clock is in the law)",
   m.speech_mesh_evidence(vis, 1.5)["hash"] != ev["hash"])

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


# ── half 2: render jobs over the real worker ──
def run_job(job_id, shot_type, speech):
    shot = {
        "number": 1,
        "description": "speech mesh smoke shot",
        "shotType": shot_type, "lens": "50mm", "movement": "STATIC",
        "poseStart": "STANCE", "poseEnd": "STANCE",
        "lighting": "moonlit night", "duration": 1.0,
        "cast": [HERO],
    }
    if speech is not None:
        shot["speech"] = speech
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Speech Mesh Smoke Court", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Speech Mesh Smoke", "visualStyle": "DONGHUA",
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
        capture_output=True, text=True, timeout=560, cwd=ROOT,
    )
    elapsed = time.time() - t0
    print(f"[{job_id}] worker exit={proc.returncode} elapsed={elapsed:.1f}s")
    if proc.returncode != 0:
        print("STDERR tail:", proc.stderr[-1500:])
        sys.exit(1)
    with open(job_file) as fh:
        return json.load(fh)


HERO = {
    "name": "Speech Mesh Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "none", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle"], "conformFactor": 0.75,
}

WIRE_TABLE = [{"s": s, "e": e, "o": o, "w": w, "r": r} for (s, e, o, w, r) in
              ((0.0, 100.0, 0.32, 0.3, 0.2),
               (100.0, 300.0, 0.72, 0.75, 0.05),
               (350.0, 450.0, 0.04, 0.1, 0.1),
               (550.0, 700.0, 0.92, 0.05, 0.75),
               (700.0, 900.0, 0.5, 0.95, 0.0))]
SPEECH = {"lines": 2, "visemes": WIRE_TABLE}

# the expected hash (the same independent law the direct half proved)
def law2(shape):
    if shape is None:
        return (0.0, 0.0, 0.0, 0.0)
    o = max(0.0, min(1.0, shape[0])); w = max(0.0, min(1.0, shape[1])); r = max(0.0, min(1.0, shape[2]))
    press = 1.0 if (0.005 < o <= 0.055) else 0.0
    return (round(o * 0.45, 3), round(w, 3), round(r, 3), press)

def sample_at2(t_ms):
    prev = None
    for (s, e, o, w, r) in [(s, e, o, w, r) for (s, e, o, w, r) in
                            ((0.0, 100.0, 0.32, 0.3, 0.2),
                             (100.0, 300.0, 0.72, 0.75, 0.05),
                             (350.0, 450.0, 0.04, 0.1, 0.1),
                             (550.0, 700.0, 0.92, 0.05, 0.75),
                             (700.0, 900.0, 0.5, 0.95, 0.0))]:
        if s <= t_ms < e:
            return (o, w, r)
        if t_ms < s:
            if prev is not None and t_ms < prev[1] + 90.0:
                k = 1.0 - (t_ms - prev[1]) / 90.0
                return (prev[2] * k, prev[3] * k, prev[4] * k)
            return None
        prev = (s, e, o, w, r)
    return None

import hashlib as _hl
parts = []
for f in (0.22, 0.4, 0.62):
    at = round(1.0 * f, 3)
    sh = sample_at2(at * 1000.0)
    j, w2, r2, p = law2(sh)
    o = round(max(0.0, min(1.0, sh[0])), 3) if sh else 0.0
    w1 = round(max(0.0, min(1.0, sh[1])), 3) if sh else 0.0
    r1 = round(max(0.0, min(1.0, sh[2])), 3) if sh else 0.0
    parts.append("{:.3f}:{:.3f},{:.3f},{:.3f}:{:.3f},{:.3f},{:.3f},{:.3f}".format(at, o, w1, r1, j, w2, r2, p))
EXP_SPEC = "92|" + "|".join(parts) + "|v1"
EXP_HASH = _hl.sha256(EXP_SPEC.encode("utf-8")).hexdigest()[:16]

state = run_job("speechmesh-smoke-close", "CLOSEUP", SPEECH)
sp = state.get("speech") or {}
mesh = sp.get("mesh") or {}
expect("the speaking closeup's state names the speech program",
       sp.get("lines") == 2 and sp.get("visemes") == len(WIRE_TABLE), json.dumps(sp)[:160])
expect("the state names the mesh evidence (shapes + samples + hash)",
       mesh.get("shapes") == ["mouthWide", "mouthRound", "lipPress"]
       and len(mesh.get("samples") or []) == 3 and bool(mesh.get("hash")),
       json.dumps(mesh)[:220])
expect("the mesh hash mirrors the TS law over the REAL render",
       mesh.get("hash") == EXP_HASH, f"{mesh.get('hash')} vs {EXP_HASH}")
expect("the samples carry the sampled shapes and the mesh weights",
       abs((mesh.get("samples") or [{}])[1].get("mesh", {}).get("press", -1) - 1.0) < 1e-9,
       json.dumps((mesh.get("samples") or [{}])[1]))

state2 = run_job("speechmesh-smoke-close-2", "CLOSEUP", SPEECH)
mesh2 = ((state2.get("speech") or {}).get("mesh") or {})
expect("the same program hashes the same over two real renders (the mesh law)",
       mesh.get("hash") == mesh2.get("hash"), f"{mesh.get('hash')} vs {mesh2.get('hash')}")

state_silent = run_job("speechmesh-smoke-silent", "CLOSEUP", None)
expect("the silent closeup stays honestly None", (state_silent.get("speech") or {}).get("mesh") is None,
       json.dumps(state_silent.get("speech"))[:120])

state_med = run_job("speechmesh-smoke-med", "MED", SPEECH)
mesh_med = ((state_med.get("speech") or {}).get("mesh") or {})
expect("the worker answers the payload whatever the framing (the wire decides WHO speaks)",
       mesh_med.get("hash") == EXP_HASH, f"{mesh_med.get('hash')} vs {EXP_HASH}")

print()
print(f"{'ALL GREEN' if failures == 0 else f'{failures} FAILURE(S)'} - blender-speechmesh-smoke")
sys.exit(1 if failures else 0)
