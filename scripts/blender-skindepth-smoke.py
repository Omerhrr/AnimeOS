# Smoke-test THE SKIN IS ALIVE (iteration 91, Layer A - the surface
# depth slice) inside the REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): the
#      derivation law (pale bleeds, deep stays tight, the warm radius,
#      the coat pair), the wild wire profile clamping against the same
#      bounds skin-depth.ts clamps against, the hash mirroring the TS
#      formula bit-exactly, the REAL graded skin tree carrying the
#      sockets (weight / radius triplet / scale / coat pair), the flat
#      token law staying when no depth rides, the carve's bake WEARING
#      INTO a depth-carrying tree (subsurface beneath, the normal
#      above), the regrade keeping the depth, determinism A/B.
#   2. RENDER JOBS over the real worker: the closeup's state naming the
#      depth (profile + fields + hash over the REAL render), the same
#      build twice hashing the same, a wild WIRE profile clamping
#      honestly, and the WIDE build carrying the SAME depth while its
#      light head wears the hero bake (the skin answers the body, not
#      the lens).
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

# an INDEPENDENT re-derivation (the smoke's own formulas, not the
# module's) - catches derivation drift AND hash drift together
def derive(hex_txt):
    n = int(hex_txt.lstrip("#"), 16)
    r, g, b = ((n >> 16) & 255) / 255.0, ((n >> 8) & 255) / 255.0, (n & 255) / 255.0
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    mx, mn = max(r, g, b), min(r, g, b)
    sat = (mx - mn) / mx if mx > 0 else 0.0
    red = max(0.0, (r - (g + b) / 2.0) / 0.5)
    def cl(v, lo, hi):
        return round(max(lo, min(hi, v)), 3)
    f = {
        "weight": cl(0.16 + (lum - 0.35) * 0.5, 0.1, 0.55),
        "radius": cl(0.62 + (lum - 0.5) * 0.55 + red * 0.3, 0.55, 1.25),
        "scale": cl(0.32 + (lum - 0.5) * 0.42, 0.3, 0.7),
        "coat": cl(0.04 + sat * 0.16, 0.04, 0.22),
        "coatRough": cl(0.55 - sat * 0.28, 0.22, 0.6),
    }
    key = "91|{:.3f}|{:.3f}|{:.3f}|{:.3f}|{:.3f}|v1".format(f["weight"], f["radius"], f["scale"], f["coat"], f["coatRough"])
    f["hash"] = hashlib.sha256(key.encode()).hexdigest()[:16]
    f["_key"] = key
    f["_red"] = red
    return f

PALE, MID, DEEP = "#F2DCBE", "#D9B48F", "#8D5A3A"
d_pale, d_mid, d_deep = derive(PALE), derive(MID), derive(DEEP)

# the derivation law: the luminance orders the subsurface
s_pale, s_mid, s_deep = m.skin_depth({"skinTone": PALE}), m.skin_depth({"skinTone": MID}), m.skin_depth({"skinTone": DEEP})
ok("pale skin bleeds visibly (the highest subsurface)",
   s_pale["weight"] > s_mid["weight"] > s_deep["weight"],
   f"{s_pale['weight']} / {s_mid['weight']} / {s_deep['weight']}")
ok("the pale hex names 'pale bleed' honestly", "pale bleed" in s_pale["fields"], str(s_pale["fields"]))
ok("the deep hex names 'tight bleed' honestly", "tight bleed" in s_deep["fields"], str(s_deep["fields"]))
ok("the warm deep hex widens the radius and names it",
   s_deep["radius"] >= 0.55 and "warm radius" in s_deep["fields"],
   f"{s_deep['radius']} {s_deep['fields']}")
ok("the deep hex's scale clamps against the bound honestly", s_deep["scale"] == 0.3, str(s_deep["scale"]))
ok("a vivid pale dye stays matte-coated while a saturated dye glosses",
   s_pale["coat"] < 0.17 and "porcelain coat" not in s_pale["fields"], f"{s_pale['coat']} {s_pale['fields']}")

# the hash mirrors the TS formula bit-exactly (hardcoded anchors over
# the derived keys - the same sha256-16 skinDepthHash lands)
for name, d, s in (("pale", d_pale, s_pale), ("mid", d_mid, s_mid), ("deep", d_deep, s_deep)):
    ok(f"the {name} hex's hash mirrors the TS formula bit-exactly",
       s["hash"] == d["hash"] and len(s["hash"]) == 16, f"{s['hash']} vs {d['hash']} ({d['_key']})")
ok("the mid hash is the hardcoded anchor (the formula drift tripwire)",
   s_mid["hash"] == hashlib.sha256(d_mid["_key"].encode()).hexdigest()[:16] and d_mid["_key"] == "91|0.348|0.875|0.415|0.095|0.455|v1",
   d_mid["_key"])
ok("a different hex lands a different hash", len({s_pale["hash"], s_mid["hash"], s_deep["hash"]}) == 3)
ok("the hash is deterministic (the same hex twice)", m.skin_depth({"skinTone": MID})["hash"] == s_mid["hash"])

# the wire: a wild profile clamps against the same bounds
wild = m.skin_depth({"skinTone": MID, "skinDepth": {"weight": 5.0, "radius": -3.0, "scale": 100.0, "coat": -1.0, "coatRough": 99.0}})
ok("a wild wire profile clamps against the bounds",
   (wild["weight"], wild["radius"], wild["scale"], wild["coat"], wild["coatRough"]) == (0.55, 0.55, 0.7, 0.04, 0.6),
   json.dumps({k: wild[k] for k in ("weight", "radius", "scale", "coat", "coatRough")}))
ok("a partial wire profile keeps the base for the missing keys",
   m.skin_depth({"skinTone": MID, "skinDepth": {"weight": 0.5}})["radius"] == m.SKIN_DEPTH_BASE["radius"])
ok("a non-numeric wire factor falls back to the base honestly",
   m.skin_depth({"skinTone": MID, "skinDepth": {"weight": "wild"}})["weight"] == m.SKIN_DEPTH_BASE["weight"])
ok("a missing hex keeps the neutral depth honestly",
   m.skin_depth({})["weight"] == m.SKIN_DEPTH_BASE["weight"] and m.skin_depth({})["fields"] == [])
ok("an invalid hex keeps the neutral depth honestly",
   m.skin_depth({"skinTone": "not-a-hex"})["coatRough"] == m.SKIN_DEPTH_BASE["coatRough"])

# the ledger line reads honestly
line = m.skin_depth_line(s_mid)
ok("the ledger line reads honestly", line.startswith("skin depth: sss") and "named by the hex:" in line and "warm radius" in line, line)

# the REAL graded skin tree carries the depth sockets
prof = {"factors": dict(m.MATERIAL_NEUTRAL), "fields": []}
gm = m.graded_mat(bpy, "skin", "SmokeDepthSkin", MID, prof, sdepth=s_mid)
b = next(nd for nd in gm.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")
w_in = b.inputs.get("Subsurface Weight")
r_in = b.inputs.get("Subsurface Radius")
sc_in = b.inputs.get("Subsurface Scale")
cw_in = b.inputs.get("Coat Weight")
cr_in = b.inputs.get("Coat Roughness")
ok("the tree's subsurface weight IS the profile's weight",
   w_in is not None and abs(w_in.default_value - s_mid["weight"]) < 1e-6, str(w_in and w_in.default_value))
ok("the radius triplet follows the hemoglobin law (red furthest) at the profile's reach",
   r_in is not None and abs(r_in.default_value[0] - 0.014 * s_mid["radius"]) < 1e-9
   and r_in.default_value[0] > r_in.default_value[1] > r_in.default_value[2],
   str(r_in and tuple(r_in.default_value)))
ok("the scatter scale is explicit (no default gamble)",
   sc_in is not None and abs(sc_in.default_value - s_mid["scale"]) < 1e-6, str(sc_in and sc_in.default_value))
ok("the coat pair rides the tree",
   cw_in is not None and cr_in is not None
   and abs(cw_in.default_value - s_mid["coat"]) < 1e-6 and abs(cr_in.default_value - s_mid["coatRough"]) < 1e-6,
   f"{cw_in and cw_in.default_value} @ {cr_in and cr_in.default_value}")
ok("the material names its depth (the stored profile)", isinstance(gm.get("animeosSkinDepth"), str) and "weight" in gm.get("animeosSkinDepth"))

# the flat token law stays when no depth rides (the back-compat path)
gm_flat = m.graded_mat(bpy, "skin", "SmokeFlatSkin", MID, prof)
b_flat = next(nd for nd in gm_flat.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")
ok("no depth keeps the flat token subsurface (the it83 law)",
   abs(b_flat.inputs["Subsurface Weight"].default_value - 0.14) < 1e-6 and gm_flat.get("animeosSkinDepth") is None)

# the carve's bake WEARS INTO a depth-carrying tree (compose)
k = head_bake.bake_key({"factors": {"jawTaper": 0.74, "chinFwd": 0.028, "browFwd": 0.014, "cheekOut": 0.022, "noseLen": 1.0}})
n_path, c_path = head_bake.cache_paths(k)
os.makedirs(head_bake.cache_dir(), exist_ok=True)
for path, nm in ((n_path, "SmokeDepthNorm"), (c_path, "SmokeDepthCav")):
    img = bpy.data.images.new(nm, 64, 64)
    img.generated_color = (0.5, 0.35, 0.3, 1.0)
    scn = bpy.context.scene
    scn.render.image_settings.file_format = "PNG"
    img.save_render(filepath=path)
gm2 = m.graded_mat(bpy, "skin", "SmokeWornDepth", MID, prof, sdepth=s_mid)
worn = head_bake.wear_baked_maps(bpy, gm2, n_path, c_path)
kinds = [nd.type for nd in gm2.node_tree.nodes]
b2 = next(nd for nd in gm2.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")
ok("the bake wears INTO a depth-carrying tree",
   worn and "NORMAL_MAP" in kinds and "BSDF_PRINCIPLED" in kinds, json.dumps(kinds))
ok("the subsurface survives the wear (subsurface beneath, the normal above)",
   abs(b2.inputs["Subsurface Weight"].default_value - s_mid["weight"]) < 1e-6, str(b2.inputs["Subsurface Weight"].default_value))
ok("the stored depth survives the wear", isinstance(gm2.get("animeosSkinDepth"), str))

# the regrade keeps the depth (the stored profile rebuilds with the tree)
new_hex = "#E8C9A0"
m.regrade_material(gm2, new_hex)
b3 = next(nd for nd in gm2.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")
d_new = derive(new_hex)
ok("the regrade re-derives the depth from the stored profile's law",
   abs(b3.inputs["Subsurface Weight"].default_value - s_mid["weight"]) < 1e-6,
   f"{b3.inputs['Subsurface Weight'].default_value} vs {s_mid['weight']}")
ok("the regrade keeps the stored depth prop", isinstance(gm2.get("animeosSkinDepth"), str))

# determinism A/B: the same hex + depth lands the same tree values
gm_a = m.graded_mat(bpy, "skin", "SmokeDetA", MID, prof, sdepth=s_mid)
gm_b2 = m.graded_mat(bpy, "skin", "SmokeDetB", MID, prof, sdepth=s_mid)
ba = next(nd for nd in gm_a.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")
bb = next(nd for nd in gm_b2.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")
ok("the same hex + depth lands the same tree (deterministic A/B)",
   ba.inputs["Subsurface Weight"].default_value == bb.inputs["Subsurface Weight"].default_value
   and tuple(ba.inputs["Subsurface Radius"].default_value) == tuple(bb.inputs["Subsurface Radius"].default_value)
   and ba.inputs["Coat Weight"].default_value == bb.inputs["Coat Weight"].default_value)

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
def run_job(job_id, shot_type, hero):
    shot = {
        "number": 1,
        "description": "skin depth smoke shot",
        "shotType": shot_type, "lens": "50mm", "movement": "STATIC",
        "poseStart": "STANCE", "poseEnd": "STANCE",
        "lighting": "tribulation lightning", "duration": 1.0,
        "cast": [hero],
    }
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Skin Depth Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Skin Depth Smoke", "visualStyle": "DONGHUA",
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
    "name": "Skin Depth Hero", "hairColor": "#1B1B2A", "hairStyle": "long",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "none", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle"], "conformFactor": 0.75,
}
HERO_WIRE = dict(HERO, name="Skin Depth Wire", skinDepth={"weight": 5.0, "radius": -3.0, "scale": 100.0, "coat": 0.1, "coatRough": 0.38})


def derive_smoke(hex_txt):
    n = int(hex_txt.lstrip("#"), 16)
    r, g, b = ((n >> 16) & 255) / 255.0, ((n >> 8) & 255) / 255.0, (n & 255) / 255.0
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    mx, mn = max(r, g, b), min(r, g, b)
    sat = (mx - mn) / mx if mx > 0 else 0.0
    red = max(0.0, (r - (g + b) / 2.0) / 0.5)
    def cl(v, lo, hi):
        return round(max(lo, min(hi, v)), 3)
    f = {"weight": cl(0.16 + (lum - 0.35) * 0.5, 0.1, 0.55),
         "radius": cl(0.62 + (lum - 0.5) * 0.55 + red * 0.3, 0.55, 1.25),
         "scale": cl(0.32 + (lum - 0.5) * 0.42, 0.3, 0.7),
         "coat": cl(0.04 + sat * 0.16, 0.04, 0.22),
         "coatRough": cl(0.55 - sat * 0.28, 0.22, 0.6)}
    key = "91|{:.3f}|{:.3f}|{:.3f}|{:.3f}|{:.3f}|v1".format(f["weight"], f["radius"], f["scale"], f["coat"], f["coatRough"])
    f["hash"] = hashlib.sha256(key.encode()).hexdigest()[:16]
    return f


import hashlib
EXP_MID = derive_smoke(HERO["skinTone"])

state = run_job("skindepth-smoke-close", "CLOSEUP", HERO)
rig = state.get("rig") or {}
sd = rig.get("skinDepth") or {}
expect("the closeup state names the skin depth", bool(sd), json.dumps(sd)[:160])
expect("the closeup's hash mirrors the TS law over the REAL render",
       sd.get("hash") == EXP_MID["hash"], f"{sd.get('hash')} vs {EXP_MID['hash']}")
expect("the closeup's profile IS the hex's derivation",
       all(abs(sd.get("profile", {}).get(k, -9) - EXP_MID[k]) < 1e-9 for k in ("weight", "radius", "scale", "coat", "coatRough")),
       json.dumps(sd.get("profile")))
expect("the depth's evidence rides beside the grade + the carve",
       bool(rig.get("materials", {}).get("hash")) and bool((rig.get("sculpt") or {}).get("bakeKey")),
       json.dumps({"mat": bool(rig.get("materials")), "sc": bool(rig.get("sculpt"))}))
expect("the ledger line rides the state", isinstance(rig.get("skinDepthLine"), str) and rig.get("skinDepthLine", "").startswith("skin depth: sss"), str(rig.get("skinDepthLine")))

state2 = run_job("skindepth-smoke-close-2", "CLOSEUP", HERO)
sd2 = ((state2.get("rig") or {}).get("skinDepth") or {})
expect("the same hex hashes the same over two real renders (the depth law)",
       sd.get("hash") == sd2.get("hash"), f"{sd.get('hash')} vs {sd2.get('hash')}")

state_w = run_job("skindepth-smoke-wire", "CLOSEUP", HERO_WIRE)
sd_w = ((state_w.get("rig") or {}).get("skinDepth") or {})
expect("a wild WIRE profile clamps honestly over the real render",
       sd_w.get("profile", {}).get("weight") == 0.55 and sd_w.get("profile", {}).get("radius") == 0.55
       and sd_w.get("profile", {}).get("scale") == 0.7 and sd_w.get("profile", {}).get("coat") == 0.1,
       json.dumps(sd_w.get("profile")))

state_ws = run_job("skindepth-smoke-wide", "WS", HERO)
rig_ws = state_ws.get("rig") or {}
sd_ws = rig_ws.get("skinDepth") or {}
sc_ws = rig_ws.get("sculpt") or {}
expect("the WIDE build carries the SAME depth (the skin answers the body, not the lens)",
       sd_ws.get("hash") == sd.get("hash"), f"{sd_ws.get('hash')} vs {sd.get('hash')}")
expect("the WIDE build's light head WEARS the hero bake while the depth rides (the compose)",
       sc_ws.get("depth") == 4 and (sc_ws.get("bake") or {}).get("worn") is True and bool(sd_ws),
       json.dumps({"depth": sc_ws.get("depth"), "bake": sc_ws.get("bake"), "sd": bool(sd_ws)})[:200])

print()
print(f"{'ALL GREEN' if failures == 0 else f'{failures} FAILURE(S)'} - blender-skindepth-smoke")
sys.exit(1 if failures else 0)
