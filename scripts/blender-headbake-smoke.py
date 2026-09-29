# Smoke-test THE HEAD IS CARVED AT DEPTH (iteration 90, Layer A - the
# geometry slice) inside the REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the depth
#      law (6/5/4 subdivisions, the hero planes), the carve's measured
#      forward projection (the deep face sits ahead of the light face),
#      determinism A/B on the face hash, a different family landing a
#      different mesh, the SPHERICAL UV LAW (deterministic, in-bounds),
#      the bake key mirroring headBakeKeyHash in head-carve.ts, the
#      wear path splicing a real graded skin tree (normal map + cavity
#      multiply) and refusing missing files honestly.
#   2. RENDER JOBS over the real worker: the closeup build earns the
#      HERO CARVE and BAKES DOWN (the cache files land, the fingerprint
#      rides); the same build twice hashes the same; the MED build wears
#      the bake (the shared key law); the wide build keeps the light
#      head and wears the same bake.
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

def vhash(mesh):
    return hashlib.sha256("".join(f"{v.co.x:.5f},{v.co.y:.5f},{v.co.z:.5f};" for v in mesh.data.vertices).encode()).hexdigest()[:16]

# the depth law: the subdivision levels the framings earn
skin = bpy.data.materials.new("SmokeSkin"); skin.use_nodes = True
head_e = bpy.data.objects.new("HeadE", None); scn.collection.objects.link(head_e)
h6a = m.sculpt_head_mesh(scn, bpy, head_e, skin, OVAL, 1.0, depth=5)
h6b = m.sculpt_head_mesh(scn, bpy, head_e, skin, OVAL, 1.0, depth=5)
h4 = m.sculpt_head_mesh(scn, bpy, head_e, skin, OVAL, 1.0, depth=4)
h5 = h6a
ok("the hero carve lands 2,562 verts (subdivisions 5)", len(h6a.data.vertices) == 2562, str(len(h6a.data.vertices)))
ok("the light head keeps the 642-vert law (subdivisions 4)", len(h4.data.vertices) == 642, str(len(h4.data.vertices)))
ok("the same profile + depth lands the same mesh (deterministic)", vhash(h6a) == vhash(h6b), f"{vhash(h6a)} vs {vhash(h6b)}")
h6c = m.sculpt_head_mesh(scn, bpy, head_e, skin, ANG, 1.0, depth=5)
ok("a different family lands a different mesh", vhash(h6a) != vhash(h6c))

# the deep planes read: the deep face projects AHEAD of the light face
# (front = -Y; the bridge + tip + lip masses push further out)
def front_y(mesh):
    return min(v.co.y for v in mesh.data.vertices)
ok("the deep carve projects the face forward of the light head",
   front_y(h6a) < front_y(h4) - 0.0005, f"{front_y(h6a):.4f} vs {front_y(h4):.4f}")

# the spherical UV law: present, in-bounds, deterministic, shared layout
def uvs(mesh):
    uvl = mesh.data.uv_layers.get("HeadCarveUV")
    return [tuple(round(c, 4) for c in d.uv) for d in uvl.data] if uvl else None
u6 = uvs(h6a)
ok("every level carries the HeadCarveUV layer", u6 is not None and uvs(h4) is not None)
ok("the spherical UVs stay in bounds", all(0.0 <= a <= 1.0 and 0.0 <= b <= 1.0 for a, b in u6))
ok("the spherical UVs are deterministic", u6 == uvs(h6b))

# the bake key mirrors headBakeKeyHash in head-carve.ts (sha256-16)
k = head_bake.bake_key(OVAL)
expect_key = hashlib.sha256("90|0.740|0.028|0.014|0.022|1.000|v1".encode()).hexdigest()[:16]
ok("the bake key mirrors the TS formula bit-exactly", k == expect_key, f"{k} vs {expect_key}")
ok("the bake key is deterministic + 16 hex", head_bake.bake_key(OVAL) == k and len(k) == 16, k)
ok("a different family lands a different bake key", head_bake.bake_key(ANG) != k)
ok("a missing profile lands the all-zero key honestly",
   head_bake.bake_key({"factors": {}}) == hashlib.sha256("90|0.000|0.000|0.000|0.000|0.000|v1".encode()).hexdigest()[:16])
ok("the cache paths land under public/headbake", head_bake.cache_paths(k)[0].endswith(f"{k}-normal.png") and "headbake" in head_bake.cache_paths(k)[0])

# the wear path: a real graded skin tree splices the baked pair
n_path, c_path = head_bake.cache_paths(k)
os.makedirs(head_bake.cache_dir(), exist_ok=True)
for path, nm in ((n_path, "SmokeNorm"), (c_path, "SmokeCav")):
    img = bpy.data.images.new(nm, 64, 64)
    img.generated_color = (0.5, 0.35, 0.3, 1.0)
    scn.render.image_settings.file_format = "PNG"
    img.save_render(filepath=path)
gm = m.graded_mat(bpy, "skin", "SmokeGrade", "#D9B48F", {"factors": dict(m.MATERIAL_NEUTRAL), "fields": []})
before_nodes = len(gm.node_tree.nodes)
worn = head_bake.wear_baked_maps(bpy, gm, n_path, c_path)
kinds = [nd.type for nd in gm.node_tree.nodes]
ok("the wear splices the bake into a real graded skin tree",
   worn and "NORMAL_MAP" in kinds and before_nodes < len(gm.node_tree.nodes), json.dumps(kinds))
nmap = next(nd for nd in gm.node_tree.nodes if nd.type == "NORMAL_MAP")
ok("the normal map node links into the BSDF's Normal input",
   any(lk.to_node.type == "BSDF_PRINCIPLED" and lk.to_socket.name == "Normal" for lk in nmap.outputs["Normal"].links))
mul = [nd for nd in gm.node_tree.nodes if nd.type == "MIX_RGB" and nd.blend_type == "MULTIPLY"]
ok("the cavity multiply sits in the Base Color chain",
   len(mul) == 1 and any(lk.to_node.type == "BSDF_PRINCIPLED" and lk.to_socket.name == "Base Color" for lk in mul[0].outputs["Color"].links))
gm["animeosBakeKey"] = gm.get("animeosBakeKey")  # the wear names its source
ok("the worn material names the bake source", bool(gm.get("animeosBakeKey")))
ok("the wear refuses missing files honestly", head_bake.wear_baked_maps(bpy, gm, "/nonexistent/n.png", "/nonexistent/c.png") is False)

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
def run_job(job_id, shot_type):
    shot = {
        "number": 1,
        "description": "carve smoke shot",
        "shotType": shot_type, "lens": "50mm", "movement": "STATIC",
        "poseStart": "STANCE", "poseEnd": "STANCE",
        "lighting": "tribulation lightning", "duration": 1.0,
        "cast": [HERO],
    }
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Carve Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Carve Smoke", "visualStyle": "DONGHUA",
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
    "name": "Carve Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "none", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle"], "conformFactor": 0.75,
}

state = run_job("headbake-smoke-close", "CLOSEUP")
rig = state.get("rig") or {}
sc = rig.get("sculpt") or {}
bake = sc.get("bake") or {}
expect("the closeup build earns the HERO CARVE (depth 5, 23 planes)",
       sc.get("depth") == 5 and sc.get("planes") == 23, json.dumps({k: sc.get(k) for k in ("depth", "planes")}))
expect("the hero carve moved ~2.5k head verts", 2000 < (sc.get("verts") or 0) < 5000, str(sc.get("verts")))
expect("the hero build BAKED DOWN (files landed, fingerprint rides)",
       isinstance(bake, dict) and bake.get("fingerprint") and len(bake.get("fingerprint")) == 16,
       json.dumps(bake)[:220])
import hashlib as _hl
n_path, c_path = None, None
try:
    sys.path.insert(0, os.path.join(ROOT, "bridges", "blender"))
    import head_bake as hb
    n_path, c_path = hb.cache_paths(sc.get("bakeKey"))
except Exception as exc:
    print("cache path probe failed:", exc)
expect("the bake cache files exist on disk",
       n_path and os.path.isfile(n_path) and os.path.isfile(c_path),
       f"{n_path} / {c_path}")
expect("the bake key mirrors the TS law over the REAL render",
       sc.get("bakeKey") == _hl.sha256("90|{:.3f}|{:.3f}|{:.3f}|{:.3f}|{:.3f}|v1".format(0.74, 0.028, 0.014, 0.022, 1.0).encode()).hexdigest()[:16],
       str(sc.get("bakeKey")))
state2 = run_job("headbake-smoke-close-2", "CLOSEUP")
rig2 = (state2.get("rig") or {})
sc2 = (rig2.get("sculpt") or {})
expect("the same face hashes the same over two real renders (the mesh law)",
       sc.get("faceHash") == sc2.get("faceHash") and sc.get("bakeKey") == sc2.get("bakeKey"),
       f"{sc.get('faceHash')} vs {sc2.get('faceHash')}")
expect("the bake fingerprint is deterministic over two real bakes",
       (bake.get("fingerprint") or "") == ((sc2.get("bake") or {}).get("fingerprint") or ""),
       f"{bake.get('fingerprint')} vs {(sc2.get('bake') or {}).get('fingerprint')}")

state_m = run_job("headbake-smoke-med", "MED")
sc_m = ((state_m.get("rig") or {}).get("sculpt") or {})
expect("the MED build keeps the LIGHT head (depth 4) and WEARS the bake (the shared key)",
       sc_m.get("depth") == 4 and (sc_m.get("bake") or {}).get("worn") is True
       and sc_m.get("bakeKey") == sc.get("bakeKey"),
       json.dumps({k: sc_m.get(k) for k in ("depth", "bakeKey", "bake")})[:220])

state_w = run_job("headbake-smoke-wide", "WS")
sc_w = ((state_w.get("rig") or {}).get("sculpt") or {})
expect("the wide build keeps the LIGHT head (depth 4) and wears the same bake",
       sc_w.get("depth") == 4 and (sc_w.get("bake") or {}).get("worn") is True
       and sc_w.get("bakeKey") == sc.get("bakeKey"),
       json.dumps({k: sc_w.get(k) for k in ("depth", "bakeKey", "bake")})[:220])

print()
print(f"{'ALL GREEN' if failures == 0 else f'{failures} FAILURE(S)'} - blender-headbake-smoke")
sys.exit(1 if failures else 0)
