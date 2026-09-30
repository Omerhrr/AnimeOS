# Smoke-test THE FACE CREASES WHEN IT ACTS (iteration 93, Layer A -
# the wrinkle-map slice) inside the REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the
#      wrinkle key mirroring the TS formula bit-exactly (the 93|
#      factor law, the hardcoded anchor, the all-zero key on a missing
#      profile), the strength law (the base strength scaled by the
#      clamped absolute weight, bounded), the REAL wrinkle bake over a
#      real carved pair (three maps baked, files landed, fingerprints
#      deterministic over two bakes, the keys rest after), the wear
#      chain (each map through its own Normal Map node at REST,
#      composed additively over the base normal into the BSDF, the
#      material naming its source), the live drive (the furrow
#      deepens as the weight climbs; the corner map wears by the
#      absolute weight; the rest holds at zero), and the honest skips.
#   2. RENDER JOBS over the real worker: the closeup's state naming
#      the wrinkle key bit-exact over the REAL render with the three
#      baked fingerprints, the same face hashing the same twice, and
#      the WIDE build wearing the set into its copied tree while its
#      light head renders.
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
sys.path.insert(0, __import__("os").path.dirname(sys.argv[-1]))
import head_bake

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

scn = bpy.context.scene
OVAL = {"factors": {"jawTaper": 0.74, "chinFwd": 0.028, "browFwd": 0.014, "cheekOut": 0.022, "noseLen": 1.0, "eyeScale": 1.05}, "faceShape": "oval", "fields": []}
ANG = {"factors": {"jawTaper": 0.64, "chinFwd": 0.042, "browFwd": 0.024, "cheekOut": 0.014, "noseLen": 1.12, "eyeScale": 0.96}, "faceShape": "angular", "fields": []}

# the wrinkle key mirrors wrinkleKeyHash in wrinkle.ts (sha256-16)
wk = head_bake.wrinkle_key(OVAL)
expect_wk = hashlib.sha256("93|0.740|0.028|0.014|0.022|1.000|v1".encode()).hexdigest()[:16]
ok("the wrinkle key mirrors the TS formula bit-exactly", wk == expect_wk, f"{wk} vs {expect_wk}")
ok("the wrinkle key is deterministic + 16 hex", head_bake.wrinkle_key(OVAL) == wk and len(wk) == 16, wk)
ok("a different family lands a different wrinkle key", head_bake.wrinkle_key(ANG) != wk)
ok("a missing profile lands the all-zero key honestly",
   head_bake.wrinkle_key({"factors": {}}) == hashlib.sha256("93|0.000|0.000|0.000|0.000|0.000|v1".encode()).hexdigest()[:16])
ok("the wrinkle key differs from the carve's 90-key over the same face", wk != head_bake.bake_key(OVAL))
ok("the wrinkle cache paths land beside the bake cache",
   all(p.endswith(f"{wk}-wrinkle-{s}.png") and "headbake" in p for s, p in head_bake.wrinkle_cache_paths(wk).items()))
ok("the wrinkle set is the three crease-bearing shapes (jawOpen earns none)",
   list(head_bake.WRINKLE_SHAPES) == ["browKnit", "cheekRaise", "mouthCorner"])

# the strength law: the base strength scaled by the clamped absolute
# weight, bounded - mirrored bit-exactly in the bridge and the pass
def s_for(w):
    try:
        v = float(w)
    except Exception:
        v = 0.0
    if not math.isfinite(v):
        v = 0.0
    v = min(1.0, max(-1.0, v))
    return min(1.2, max(0.0, 0.85 * abs(v)))
for name, w in (("zero", 0.0), ("half", 0.5), ("full", 1.0), ("negative corner", -0.6),
                ("wild above", 2.0), ("wild below", -3.0)):
    ok(f"the drive law lands the independent derivation at {name}",
       abs(m.wrinkle_strength_for(w) - s_for(w)) < 1e-9 and abs(head_bake.wrinkle_strength_for(w) - s_for(w)) < 1e-9,
       f"{m.wrinkle_strength_for(w)} vs {s_for(w)}")
ok("the corner's absolute pull creases (a negative weight wears, not rests)",
   m.wrinkle_strength_for(-0.6) > 0.0, str(m.wrinkle_strength_for(-0.6)))
ok("a non-numeric weight rests honestly", m.wrinkle_strength_for("wild") == 0.0 and m.wrinkle_strength_for(None) == 0.0)

# the REAL wrinkle bake over a real carved pair
skin = bpy.data.materials.new("SmokeWrinkleSkin"); skin.use_nodes = True
head_e = bpy.data.objects.new("HeadE", None); scn.collection.objects.link(head_e)
deep = m.sculpt_head_mesh(scn, bpy, head_e, skin, OVAL, 1.0, depth=5)
light = m.sculpt_head_mesh(scn, bpy, head_e, skin, OVAL, 1.0, depth=4)
deep_keys = m.sculpt_expression_keys(deep)
light_keys = m.sculpt_expression_keys(light)
ok("both surfaces carry the four expression keys",
   sorted(deep_keys.keys()) == ["browKnit", "cheekRaise", "jawOpen", "mouthCorner"]
   and sorted(light_keys.keys()) == ["browKnit", "cheekRaise", "jawOpen", "mouthCorner"],
   json.dumps(sorted(deep_keys.keys())))
ev = head_bake.bake_wrinkle_set(bpy, scn, deep, light, wk, deep_keys, light_keys)
ok("the bake lands all three maps", sorted((ev.get("baked") or [])) == ["browKnit", "cheekRaise", "mouthCorner"], json.dumps(ev)[:200])
ok("the bake evidence names the wrinkle key + the base strength",
   ev.get("key") == wk and ev.get("strength") == head_bake.WRINKLE_STRENGTH, json.dumps({k: ev.get(k) for k in ("key", "strength")}))
paths = head_bake.wrinkle_cache_paths(wk)
ok("the three files landed on disk", all(os.path.isfile(p) for p in paths.values()), json.dumps(paths))
ok("the fingerprints are 16 hex", all(len(v.get("fingerprint", "")) == 16 for v in ev.get("shapes", {}).values() if v.get("fingerprint")))
ok("the keys REST after the bake (no residue on either surface)",
   all(abs(kb.value) < 1e-9 for kb in deep_keys.values()) and all(abs(kb.value) < 1e-9 for kb in light_keys.values()))
ev2 = head_bake.bake_wrinkle_set(bpy, scn, deep, light, wk, deep_keys, light_keys)
ok("the bake is deterministic over two runs (the fingerprints hold)",
   all(ev["shapes"][s]["fingerprint"] == ev2["shapes"][s]["fingerprint"] for s in head_bake.WRINKLE_SHAPES),
   json.dumps({s: (ev["shapes"][s].get("fingerprint"), ev2["shapes"][s].get("fingerprint")) for s in head_bake.WRINKLE_SHAPES}))

# the wear: the set splices into a graded tree OVER the base normal
n_path, c_path = head_bake.cache_paths(head_bake.bake_key(OVAL))
os.makedirs(head_bake.cache_dir(), exist_ok=True)
for path, nm in ((n_path, "SmokeWrinkleNorm"), (c_path, "SmokeWrinkleCav")):
    img = bpy.data.images.new(nm, 64, 64)
    img.generated_color = (0.5, 0.35, 0.3, 1.0)
    scn.render.image_settings.file_format = "PNG"
    img.save_render(filepath=path)
prof = {"factors": dict(m.MATERIAL_NEUTRAL), "fields": []}
gm = m.graded_mat(bpy, "skin", "SmokeWrinkleGrade", "#D9B48F", prof)
head_bake.wear_baked_maps(bpy, gm, n_path, c_path)
base_normal_ok = any(lk.to_node.type == "BSDF_PRINCIPLED" and lk.to_socket.name == "Normal"
                     for nd in gm.node_tree.nodes if nd.type == "NORMAL_MAP"
                     for lk in nd.outputs["Normal"].links)
nodes = head_bake.wear_wrinkle_maps(bpy, gm, wk)
ok("the wear returns a driven node per shape",
   sorted(nodes.keys()) == ["browKnit", "cheekRaise", "mouthCorner"], json.dumps(sorted(nodes.keys())))
ok("the driven nodes ARE the tree's named wrinkle nodes",
   all(nd.name == f"AnimeOSWrinkle_{s}" and gm.node_tree.nodes.get(nd.name) == nd for s, nd in nodes.items()))
ok("the strengths REST at zero until the drive moves them",
   all(abs(nd.inputs["Strength"].default_value) < 1e-9 for nd in nodes.values()))
b2 = next(nd for nd in gm.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")
n_link = next((lk for lk in b2.inputs["Normal"].links), None)
ok("the chain lands on the BSDF's Normal input through a normalize",
   n_link is not None and n_link.from_node.type == "VECT_MATH"
   and n_link.from_node.operation == "NORMALIZE", str(n_link and n_link.from_node.type))
adds = [nd for nd in gm.node_tree.nodes if nd.type == "VECT_MATH" and nd.operation == "ADD"]
ok("each wrinkle map composes additively over the chain",
   len(adds) == 3, str(len(adds)))
ok("the base normal rides beneath the wrinkles (the compose order)",
   base_normal_ok and any(lk.from_node.type == "NORMAL_MAP" and lk.to_node.operation == "ADD"
                          for nd in adds for lk in nd.inputs[0].links))
ok("the worn material names the wrinkle source", gm.get("animeosWrinkleKey") == wk, str(gm.get("animeosWrinkleKey")))

# the drive: the furrow deepens as the weight climbs, the corner map
# wears by the absolute weight, the rest holds at zero
for shape, w in (("browKnit", 0.7), ("cheekRaise", 0.4), ("mouthCorner", -0.6)):
    nodes[shape].inputs["Strength"].default_value = m.wrinkle_strength_for(w)
ok("a 0.7 knit drives the furrow to 0.595",
   abs(nodes["browKnit"].inputs["Strength"].default_value - 0.595) < 1e-6,  # float32 socket storage
   str(nodes["browKnit"].inputs["Strength"].default_value))
ok("the corner's negative pull wears by the absolute weight",
   abs(nodes["mouthCorner"].inputs["Strength"].default_value - 0.51) < 1e-6,
   str(nodes["mouthCorner"].inputs["Strength"].default_value))
for nd in nodes.values():
    nd.inputs["Strength"].default_value = m.wrinkle_strength_for(0.0)
ok("the rest returns every strength to zero",
   all(abs(nd.inputs["Strength"].default_value) < 1e-9 for nd in nodes.values()))

# the honest skips
ok("a wear over an unknown key refuses honestly", head_bake.wear_wrinkle_maps(bpy, gm, "no-such-key") == {})
flat = bpy.data.materials.new("SmokeNoBSDF"); flat.use_nodes = True
for nd in list(flat.node_tree.nodes):
    if nd.type == "BSDF_PRINCIPLED":
        flat.node_tree.nodes.remove(nd)
ok("a wear over a BSDF-less material refuses honestly", head_bake.wear_wrinkle_maps(bpy, flat, wk) == {})
empty = head_bake.bake_wrinkle_set(bpy, scn, deep, light, wk, {}, {})
ok("a bake without keys skips honestly", bool(empty.get("skipped")), json.dumps(empty)[:120])

print("DIRECT_FAILS", len(fails))
sys.exit(1 if fails else 0)
"""
proc = subprocess.run(
    [BLENDER, "-b", "--factory-startup", "--python-expr", DIRECT, "--", SCRIPT],
    capture_output=True, text=True, timeout=560, cwd=ROOT,
)
for line in proc.stdout.splitlines():
    if line.startswith(("PASS", "FAIL", "DIRECT_FAILS")):
        print(line)
if proc.returncode != 0 or "DIRECT_FAILS 0" not in proc.stdout:
    print("direct half failed; stderr tail:", proc.stderr[-1500:])
    failures += 1


# ── half 2: render jobs over the real worker ──
def run_job(job_id, shot_type, hero):
    shot = {
        "number": 1,
        "description": "wrinkle smoke shot",
        "shotType": shot_type, "lens": "50mm", "movement": "STATIC",
        "poseStart": "STANCE", "poseEnd": "STANCE",
        "lighting": "tribulation lightning", "duration": 1.0,
        "cast": [hero],
        # the wire decides WHO performs: the TS drama compiler sends the
        # clip on the shot; the drive law answers whatever arrives
        "expression": {"emotion": "anger", "intensity": 0.8, "attackMs": 240, "releaseMs": 480},
    }
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Wrinkle Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Wrinkle Smoke", "visualStyle": "DONGHUA",
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
    "name": "Wrinkle Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "none", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle"], "conformFactor": 0.75,
}


def expected_key(factors):
    def num(k):
        v = factors.get(k)
        try:
            v = float(v)
        except Exception:
            v = 0.0
        return v if (isinstance(v, float) and math.isfinite(v)) else 0.0
    key = "93|{:.3f}|{:.3f}|{:.3f}|{:.3f}|{:.3f}|v1".format(
        num("jawTaper"), num("chinFwd"), num("browFwd"), num("cheekOut"), num("noseLen"))
    return hashlib.sha256(key.encode()).hexdigest()[:16]


import hashlib, math

state = run_job("wrinkle-smoke-close", "CLOSEUP", HERO)
rig = state.get("rig") or {}
sc = rig.get("sculpt") or {}
wr = sc.get("wrinkle") or {}
expect("the closeup state names the wrinkle key", bool(sc.get("wrinkleKey")), str(sc.get("wrinkleKey")))
expect("the closeup's wrinkle key mirrors the factor law over the REAL render",
       sc.get("wrinkleKey") == expected_key(sc.get("factors") or {}), f"{sc.get('wrinkleKey')} vs {expected_key(sc.get('factors') or {})}")
expect("the closeup's wrinkle key is the hardcoded anchor (the drift tripwire)",
       sc.get("wrinkleKey") == expected_key({"jawTaper": 0.74, "chinFwd": 0.028, "browFwd": 0.014, "cheekOut": 0.022, "noseLen": 1.0}),
       str(sc.get("wrinkleKey")))
expect("the hero build BAKED the three-map set (the creases as real geometry)",
       sorted(wr.get("baked") or []) == ["browKnit", "cheekRaise", "mouthCorner"], json.dumps(wr)[:220])
expect("the baked maps carry 16-hex fingerprints",
       all(len(v.get("fingerprint", "")) == 16 for v in (wr.get("shapes") or {}).values() if v.get("fingerprint")),
       json.dumps(wr.get("shapes"))[:200])
fp = {s: (wr.get("shapes") or {}).get(s, {}).get("fingerprint") for s in ("browKnit", "cheekRaise", "mouthCorner")}
expect("the wrinkle files landed beside the bake cache",
       all(os.path.isfile(os.path.join(ROOT, "public", "headbake", f"{sc.get('wrinkleKey')}-wrinkle-{s}.png"))
           for s in ("browKnit", "cheekRaise", "mouthCorner")))
expect("the carve's own evidence still rides beside the creases",
       bool(sc.get("bakeKey")) and (sc.get("bake") or {}).get("fingerprint") and sc.get("depth") == 5,
       json.dumps({"k": sc.get("bakeKey"), "d": sc.get("depth"), "b": bool((sc.get("bake") or {}).get("fingerprint"))}))

state2 = run_job("wrinkle-smoke-close-2", "CLOSEUP", HERO)
wr2 = ((state2.get("rig") or {}).get("sculpt") or {}).get("wrinkle") or {}
fp2 = {s: (wr2.get("shapes") or {}).get(s, {}).get("fingerprint") for s in ("browKnit", "cheekRaise", "mouthCorner")}
expect("the same face bakes the same maps twice (the wrinkle law's determinism)",
       fp == fp2 and all(fp.values()), json.dumps({"a": fp, "b": fp2}))

state_w = run_job("wrinkle-smoke-wide", "WS", HERO)
rig_ws = state_w.get("rig") or {}
sc_ws = rig_ws.get("sculpt") or {}
wr_ws = sc_ws.get("wrinkle") or {}
expect("the WIDE build wears the cached set into its copied tree",
       sc_ws.get("depth") == 4 and wr_ws.get("worn") is True and sorted(wr_ws.get("shapes") or []) == ["browKnit", "cheekRaise", "mouthCorner"],
       json.dumps(wr_ws)[:220])
expect("the WIDE build's wear names the SAME key and the base strength",
       wr_ws.get("key") == sc.get("wrinkleKey") and wr_ws.get("strength") == 0.85,
       json.dumps({"k": wr_ws.get("key"), "s": wr_ws.get("strength")}))
expect("the WIDE build's light head still wears the base bake (the compose)",
       (sc_ws.get("bake") or {}).get("worn") is True, json.dumps(sc_ws.get("bake"))[:160])
expect("the expression evidence rides beside the driven creases",
       bool((rig_ws.get("expression") or {}).get("hash")), str(bool((rig_ws.get("expression") or {}).get("hash"))))

print()
print(f"{'ALL GREEN' if failures == 0 else f'{failures} FAILURE(S)'} - blender-wrinkle-smoke")
sys.exit(1 if failures else 0)
