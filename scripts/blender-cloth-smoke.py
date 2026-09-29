# Smoke-test THE CLOTH IS DIRECTED (iteration 87, Layer B) inside the
# REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge + cloth_pass imported as modules):
#      the directive validator clamps against the same bounds
#      cloth-directive.ts clamps against (a wild factor clamps, a
#      negative heading folds, an unknown garment degrades to cloth, a
#      missing directive is None honestly); the hash mirrors the TS
#      formula bit-exactly; a real cloth rig re-tunes per the garment
#      class and arms self-collision when directed; the directed air
#      pulls the anchor FORWARD on heading 0, BACKWARD on 180, and
#      SIDEWAYS on 90/270 (the tip moves, measured on the bone).
#   2. RENDER JOBS over the real worker: a designed shot with a directed
#      silk gale rides its directive (the evidence names the heading,
#      the garment, the hash, the re-tune notes); the same directive
#      twice hashes the same over real renders; a payload without a
#      directive keeps the house air honestly (no directive key); a
#      wild directive clamps and hashes differently.
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
import importlib.util, hashlib, json, math, sys
import bpy
spec = importlib.util.spec_from_file_location("bridge", sys.argv[-1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
sys.path.insert(0, "/".join(sys.argv[-1].split("/")[:-1]))
import cloth_pass

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# the directive validator: one law, two runtimes
d = m.cloth_directive({"clothDirective": {"heading": -40, "strength": 3.0, "turbulence": -1.0, "garment": "obsidian", "collision": "maybe", "fields": ["gale"]}})
ok("a wild directive clamps (strength 3->1, turbulence -1->0) and the negative heading folds (-40 -> 320)",
   d["strength"] == 1.0 and d["turbulence"] == 0.0 and d["heading"] == 320.0, json.dumps(d))
ok("an unknown garment degrades to cloth, an unknown collision tier to off",
   d["garment"] == "cloth" and d["collision"] == "off", json.dumps(d))
ok("a missing directive is None honestly (the probed house air)", m.cloth_directive({}) is None)
d2 = m.cloth_directive({"clothDirective": {"heading": 90, "strength": 0.55, "turbulence": 0.4, "garment": "silk", "collision": "self", "fields": ["wind", "silk"]}})
ok("a lawful directive rides (heading 90, silk, self-collision, the fields named)",
   d2["heading"] == 90.0 and d2["strength"] == 0.55 and d2["garment"] == "silk" and d2["collision"] == "self"
   and d2["fields"] == ["wind", "silk"], json.dumps(d2))

# the garment table mirrors cloth-directive.ts (four classes, the probed cloth preset)
ok("the four garment classes stand (silk, cloth, leather, armor)",
   sorted(m.GARMENT_SETTINGS.keys()) == ["armor", "cloth", "leather", "silk"], str(sorted(m.GARMENT_SETTINGS.keys())))
ok("silk floats and armor barely sways (mass ordering)",
   m.GARMENT_SETTINGS["silk"]["mass"] < m.GARMENT_SETTINGS["cloth"]["mass"]
   < m.GARMENT_SETTINGS["leather"]["mass"] < m.GARMENT_SETTINGS["armor"]["mass"], json.dumps(m.GARMENT_SETTINGS))
ok("the cloth class IS the probed v10.0 CLOTH preset",
   m.GARMENT_SETTINGS["cloth"]["mass"] == 0.25 and m.GARMENT_SETTINGS["cloth"]["tension"] == 12.0
   and m.GARMENT_SETTINGS["cloth"]["air_damping"] == 1.6, json.dumps(m.GARMENT_SETTINGS["cloth"]))

# the hash mirrors the TS formula bit-exactly
key = "87|0.0|0.850|0.500|silk|self|v1"
expect_hash = hashlib.sha256(key.encode()).hexdigest()[:16]
fixture = m.cloth_directive({"clothDirective": {"heading": 0, "strength": 0.85, "turbulence": 0.5, "garment": "silk", "collision": "self"}})
ok("the cloth hash mirrors clothHash in cloth-directive.ts (sha256-16 over the bounded directive)",
   m.cloth_directive_hash(fixture) == expect_hash, f"{m.cloth_directive_hash(fixture)} vs {expect_hash}")
ok("the same directive hashes the same twice (deterministic)", m.cloth_directive_hash(fixture) == m.cloth_directive_hash(fixture))
other = m.cloth_directive({"clothDirective": {"heading": 0, "strength": 0.85, "turbulence": 0.5, "garment": "silk", "collision": "off"}})
ok("a different directive hashes differently", m.cloth_directive_hash(fixture) != m.cloth_directive_hash(other))
ok("the hash is 16 hex", len(m.cloth_directive_hash(fixture)) == 16, m.cloth_directive_hash(fixture))

# the ledger line reads honestly
ok("the ledger line names the heading, the garment and the fields",
   "heading 315" in m.cloth_directive_line({"heading": 315.0, "strength": 0.85, "turbulence": 0.5, "garment": "silk", "collision": "self", "fields": ["gale", "silk"]})
   and "silk garments" in m.cloth_directive_line({"heading": 315.0, "strength": 0.85, "turbulence": 0.5, "garment": "silk", "collision": "self", "fields": ["gale", "silk"]})
   and "named by the shot: gale, silk" in m.cloth_directive_line({"heading": 315.0, "strength": 0.85, "turbulence": 0.5, "garment": "silk", "collision": "self", "fields": ["gale", "silk"]}),
   m.cloth_directive_line({"heading": 315.0, "strength": 0.85, "turbulence": 0.5, "garment": "silk", "collision": "self", "fields": ["gale", "silk"]}))

# a REAL cloth rig: the garment class re-tunes the solver, the collision tier arms
def make_chain(name):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=2, y_subdivisions=2, size=1.0, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    me = ob.data
    # the grid lies FLAT in XY - hang it by mapping its Y spread into
    # a real Z range (the pin band lives in the top 30% - the probed
    # law needs height)
    ys = [v.co.y for v in me.vertices]
    ymax, ymin = max(ys), min(ys)
    for v in me.vertices:
        v.co.z = 0.5 - 0.8 * ((v.co.y - ymin) / max(1e-6, ymax - ymin))
    bpy.ops.object.empty_add(location=(0, 0, 0))
    piv = bpy.context.active_object
    piv.name = f"SecPiv_{name}"
    return {"kind": "CLOTH", "ob": ob, "piv": piv, "gain": 1.0, "phase": 0.0}

bpy.ops.object.select_all(action="DESELECT")
ch = make_chain("SashTail")
rig = cloth_pass.build_cloth_rig(bpy, bpy.context.scene, None, [ch], 24,
                                 directive={"heading": 0.0, "strength": 0.85, "turbulence": 0.5, "garment": "silk", "collision": "self", "hash": "x", "fields": []})
ok("the rig builds with the directive riding", rig is not None and len(rig["parts"]) == 1, f"parts={len(rig['parts']) if rig else 0}")
cloth_mod = next((mod for mod in ch["ob"].modifiers if mod.type == "CLOTH"), None)
ok("the solver re-tuned SILK (mass 0.14 on the real modifier)",
   cloth_mod is not None and abs(cloth_mod.settings.mass - 0.14) < 1e-6
   and abs(cloth_mod.settings.tension_stiffness - 7.0) < 1e-6, str(cloth_mod.settings.mass if cloth_mod else None))
ok("the re-tune is named honestly in the notes", any("re-tuned silk (directed)" in n for n in rig["notes"]), json.dumps(rig["notes"]))
ok("self-collision armed when directed", cloth_mod is not None and cloth_mod.collision_settings.use_self_collision is True)
ok("the armature anchor still hangs the part", any(mod.type == "ARMATURE" for mod in ch["ob"].modifiers))

bpy.ops.object.select_all(action="DESELECT")
ch2 = make_chain("SkirtPanel")
rig2 = cloth_pass.build_cloth_rig(bpy, bpy.context.scene, None, [ch2], 24, directive=None)
cloth_mod2 = next((mod for mod in ch2["ob"].modifiers if mod.type == "CLOTH"), None)
ok("the house air keeps the probed mass (0.25) and no self-collision",
   cloth_mod2 is not None and abs(cloth_mod2.settings.mass - 0.25) < 1e-6
   and cloth_mod2.collision_settings.use_self_collision is False, str(cloth_mod2.settings.mass if cloth_mod2 else None))
ok("no directive, no re-tune notes", not any("re-tuned" in n for n in (rig2["notes"] if rig2 else [])), json.dumps(rig2["notes"] if rig2 else []))

# the directed air: the heading pulls the anchor (measured on the
# pose matrix - the bone tail only moves on a depsgraph update; the
# pose matrix is the law the worker sets). With the rest bone spun
# +Z (Rx(90) rest), the composed pose M = Rx(ax)@Ry(ay)@Rx(90) gives
# M[1][1] ~= -sin(ax) and M[0][1] ~= +sin(ay).
def drive_once(directive, heading=0.0):
    bpy.ops.object.select_all(action="DESELECT")
    chx = make_chain(f"Air_{heading}_{len(bpy.data.objects)}")
    r = cloth_pass.build_cloth_rig(bpy, bpy.context.scene, None, [chx], 24, directive=directive)
    if r is None:
        return None, None
    p = r["parts"][0]
    cloth_pass.apply_cloth_frame(r, None, 0.5, 1.0 / 24, -1, 0.0, 0.0, 0.0, 1.0, directive=directive)
    bpy.context.view_layer.update()   # the pose setter lands on the depsgraph
    mm = p["bone"].matrix
    return (mm[0][1], mm[1][1]), r   # (sin(ay) probe, -sin(ax) probe)

dd = {"heading": 0.0, "strength": 0.9, "turbulence": 0.0, "garment": "cloth", "collision": "off", "hash": "x", "fields": []}
off0, r0 = drive_once(dd, 0)
ok("heading 0 (back-stream) pulls the anchor forward (+ax, the same sign the scalar wind drove)",
   off0 is not None and off0[1] < -0.3, f"pose probes (sin(ay), -sin(ax)) = {tuple(round(v, 4) for v in off0) if off0 else None}")
dd180 = dict(dd, heading=180.0)
off180, _ = drive_once(dd180, 180)
ok("heading 180 (toward-lens) reverses the pull (-ax)",
   off180 is not None and off180[1] > 0.3, f"pose probes = {tuple(round(v, 4) for v in off180) if off180 else None}")
dd90 = dict(dd, heading=90.0)
off90, _ = drive_once(dd90, 90)
dd270 = dict(dd, heading=270.0)
off270, _ = drive_once(dd270, 270)
ok("heading 90 vs 270 mirror the lateral pull (the crosswind peels sideways)",
   off90 is not None and off270 is not None and (off90[0] - off270[0]) > 0.3,
   f"90: {tuple(round(v, 4) for v in off90) if off90 else None} vs 270: {tuple(round(v, 4) for v in off270) if off270 else None}")

# the turbulence scatters (a stronger second harmonic moves the anchor over time)
dT = dict(dd, turbulence=0.8)
bpy.ops.object.select_all(action="DESELECT")
chT = make_chain("TurbProbe")
rT = cloth_pass.build_cloth_rig(bpy, bpy.context.scene, None, [chT], 24, directive=dT)
if rT:
    pT = rT["parts"][0]
    probes = []
    for ts in (0.3, 0.9):
        pT["ka"], pT["kv"] = 0.0, 0.0
        rT["prev_beat"] = -1
        cloth_pass.apply_cloth_frame(rT, None, ts, 1.0 / 24, -1, 0.0, 0.0, 0.0, 1.0, directive=dT)
        bpy.context.view_layer.update()   # the pose setter lands on the depsgraph
        mm = pT["bone"].matrix
        probes.append((mm[0][1], mm[1][1]))
    ok("the turbulence's second harmonic moves the anchor over time (a vortex, not a metronome)",
       abs(probes[0][1] - probes[1][1]) > 0.01, f"pose probes {tuple((round(a, 4), round(b, 4)) for a, b in probes)}")
else:
    ok("the turbulence probe rig built", False)

# determinism: the same directive on the same air lands the same anchor
bpy.ops.object.select_all(action="DESELECT")
chA = make_chain("DetA")
rA = cloth_pass.build_cloth_rig(bpy, bpy.context.scene, None, [chA], 24, directive=dd)
bpy.ops.object.select_all(action="DESELECT")
chB = make_chain("DetB")
rB = cloth_pass.build_cloth_rig(bpy, bpy.context.scene, None, [chB], 24, directive=dd)
for r in (rA, rB):
    r["parts"][0]["ka"], r["parts"][0]["kv"] = 0.0, 0.0
cloth_pass.apply_cloth_frame(rA, None, 0.7, 1.0 / 24, -1, 0.0, 0.0, 0.0, 1.0, directive=dd)
cloth_pass.apply_cloth_frame(rB, None, 0.7, 1.0 / 24, -1, 0.0, 0.0, 0.0, 1.0, directive=dd)
bpy.context.view_layer.update()   # the pose setter lands on the depsgraph
offA = tuple(round(v, 6) for v in (rA["parts"][0]["bone"].matrix[1][1], rA["parts"][0]["bone"].matrix[0][1]))
offB = tuple(round(v, 6) for v in (rB["parts"][0]["bone"].matrix[1][1], rB["parts"][0]["bone"].matrix[0][1]))
ok("the same directive on the same air lands the same anchor (deterministic)", offA == offB, f"{offA} vs {offB}")

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
def run_job(job_id, directive, description="cloth smoke shot"):
    shot = {
        "number": 1,
        "description": description,
        "shotType": "CLOSEUP", "lens": "50mm", "movement": "STATIC",
        "poseStart": "STANCE", "poseEnd": "STANCE",
        "lighting": "tribulation lightning", "duration": 1.0,
        "cast": [HERO],
    }
    if directive is not None:
        shot["clothDirective"] = directive
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Cloth Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Cloth Smoke", "visualStyle": "DONGHUA",
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
    "name": "Cloth Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "none", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle"], "conformFactor": 0.75,
}

WIRE = {"heading": 0.0, "strength": 0.85, "turbulence": 0.5, "garment": "silk", "collision": "off", "fields": ["gale", "silk"]}

state = run_job("cloth-smoke-wire", WIRE, "the gale howls, silken robes streaming back")
solver = ((state.get("secondary") or {}).get("solver") or {})
expect("the wire build names the directive evidence", isinstance(solver.get("directive"), dict), json.dumps(solver)[:300])
if isinstance(solver.get("directive"), dict):
    dv = solver["directive"]
    expect("the heading, the strength, the garment and the fields ride",
           dv.get("heading") == 0.0 and dv.get("strength") == 0.85 and dv.get("garment") == "silk"
           and dv.get("fields") == ["gale", "silk"], json.dumps(dv))
    expect("the hash is 16 hex", isinstance(dv.get("hash"), str) and len(dv["hash"]) == 16, str(dv.get("hash")))
    expect("the ledger line rides", "cloth: directed" in str(dv.get("line")), str(dv.get("line")))
expect_hash = __import__("hashlib").sha256("87|0.0|0.850|0.500|silk|off|v1".encode()).hexdigest()[:16]
expect("the hash mirrors the TS formula over the REAL render", solver.get("directive", {}).get("hash") == expect_hash,
       f"{solver.get('directive', {}).get('hash')} vs {expect_hash}")
expect("the solver rode the REAL cloth sim", solver.get("cloth") == "blender-cloth-sim", str(solver.get("cloth")))
expect("the re-tune is named in the notes", any("re-tuned silk (directed)" in n for n in (solver.get("notes") or [])), json.dumps(solver.get("notes")))
expect("the anchor actually answered the directed air", float(solver.get("maxAnchorSway") or 0) > 0.3, str(solver.get("maxAnchorSway")))

state2 = run_job("cloth-smoke-wire-2", WIRE, "the gale howls, silken robes streaming back")
solver2 = ((state2.get("secondary") or {}).get("solver") or {})
expect("the same directive hashes the same over two real renders",
       solver.get("directive", {}).get("hash") == solver2.get("directive", {}).get("hash"),
       f"{solver.get('directive', {}).get('hash')} vs {solver2.get('directive', {}).get('hash')}")

WILD = {"heading": -40, "strength": 3.0, "turbulence": -1.0, "garment": "obsidian", "collision": "maybe"}
state_w = run_job("cloth-smoke-wild", WILD, "a wild directive arrives")
solver_w = ((state_w.get("secondary") or {}).get("solver") or {})
wild_hash = __import__("hashlib").sha256("87|320.0|1.000|0.000|cloth|off|v1".encode()).hexdigest()[:16]
expect("the wild directive clamps on the wire (heading folds 320, strength 1, cloth, off) and hashes the clamped law",
       solver_w.get("directive", {}).get("heading") == 320.0 and solver_w.get("directive", {}).get("strength") == 1.0
       and solver_w.get("directive", {}).get("garment") == "cloth" and solver_w.get("directive", {}).get("collision") == "off"
       and solver_w.get("directive", {}).get("hash") == wild_hash, json.dumps(solver_w.get("directive")))
expect("the wild clamped hash differs from the lawful one",
       solver_w.get("directive", {}).get("hash") != solver.get("directive", {}).get("hash"))

state_def = run_job("cloth-smoke-house", None, "a quiet shot keeps the house air")
solver_d = ((state_def.get("secondary") or {}).get("solver") or {})
expect("a payload without a directive keeps the HOUSE AIR honestly (no directive key, the sim still rides)",
       "directive" not in solver_d and solver_d.get("cloth") == "blender-cloth-sim", json.dumps(solver_d)[:300])

for f in ("cloth-smoke-wire", "cloth-smoke-wire-2", "cloth-smoke-wild", "cloth-smoke-house"):
    p = os.path.join(OUT_DIR, f"{f}.mp4")
    if os.path.exists(p):
        os.unlink(p)
    j = os.path.join(OUT_DIR, f".job-{f}.json")
    if os.path.exists(j):
        os.unlink(j)

print(f"\n{'ALL GREEN' if failures == 0 else f'{failures} FAILURE(S)'} - blender-cloth-smoke")
sys.exit(1 if failures else 0)
