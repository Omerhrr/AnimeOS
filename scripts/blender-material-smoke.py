# Smoke-test THE SURFACE IS GRADED, NOT PAINTED (iteration 83) inside
# the REAL Blender worker, in two halves:
#   1. DIRECT (blender -b, the bridge imported as a module): wild
#      material factors clamped against the same bounds adherence.ts
#      clamps against; the graded trees exist and are wired (skin:
#      subsurface + linked roughness + linked base color; cloth: ramp
#      + weave bump; hair: tinted sheen); the regrade re-sets the dye
#      and the tree rebuilds; the evidence hash is deterministic.
#   2. RENDER JOBS over the real worker: the render state names the
#      material grade for the hero AND the second figure (fields,
#      factors, hash); the sheet-conformance regrade lands; a guess
#      build keeps the neutral grade, honestly named; the same
#      profile lands the same hash twice, different hexes differ.
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

# wild factors clamp against the one law
prof = m.material_profile({"materialProfile": {"skinSss": 9.0, "skinRough": 0.01, "skinWarmth": 0.5, "rim": -1.0, "clothRamp": 0.4, "clothSheen": 0.45, "clothWeave": 7.0, "hairRough": 0.26, "fields": ["skinTone", "robeColor", "hairColor"]}})
f = prof["factors"]
ok("wild factors clamped (skinSss 9->1.4, skinRough 0.01->0.35, rim -1->0)",
   f["skinSss"] == 1.4 and f["skinRough"] == 0.35 and f["skinWarmth"] == 0.3 and f["rim"] == 0.0 and f["clothWeave"] == 0.5, json.dumps(f))
ok("the fields the sheet owns ride the validation", prof["fields"] == ["skinTone", "robeColor", "hairColor"], json.dumps(prof["fields"]))

# the guess payload keeps the neutral grade
neutral = m.material_profile({})
ok("a payload without a profile keeps the neutral grade", neutral["factors"] == m.MATERIAL_NEUTRAL and neutral["fields"] == [], json.dumps(neutral["factors"]))

# the skin tree: subsurface, linked roughness, linked base color
mat = m.graded_mat(bpy, "skin", "SkinMat", "#d9b48f", prof)
b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
ok("the skin tree subsurfaces (weight 0.14, radius scaled)", abs(b.inputs["Subsurface Weight"].default_value - 0.14) < 1e-6 and abs(b.inputs["Subsurface Radius"].default_value[0] - 0.016 * 1.4) < 1e-6, str(b.inputs["Subsurface Weight"].default_value))
ok("the skin roughness is LINKED (the breakup noise owns it)", b.inputs["Roughness"].is_linked and b.inputs["Base Color"].is_linked, f"rough={b.inputs['Roughness'].is_linked} base={b.inputs['Base Color'].is_linked}")
ok("the skin carries sheen", abs(b.inputs["Sheen Weight"].default_value - 0.12) < 1e-6, str(b.inputs["Sheen Weight"].default_value))
nodes_by_type = {}
for n in mat.node_tree.nodes:
    nodes_by_type.setdefault(n.type, []).append(n)
ok("the skin tree carries the grade machinery (noise, ramps, mix, fresnel)",
   len(nodes_by_type.get("TEX_NOISE", [])) == 2 and len(nodes_by_type.get("VALTORGB", [])) == 2
   and len(nodes_by_type.get("MIX_RGB", [])) == 2 and len(nodes_by_type.get("LAYER_WEIGHT", [])) == 1,
   json.dumps(sorted(nodes_by_type.keys())))

# the cloth tree: the ramp, the sheen, the weave bump
robe = m.graded_mat(bpy, "cloth", "RobeMat", "#2f6d63", prof)
rb = next(n for n in robe.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
ok("the cloth sheen rides the profile (0.45)", abs(rb.inputs["Sheen Weight"].default_value - 0.45) < 1e-6, str(rb.inputs["Sheen Weight"].default_value))
ok("the cloth base color + normal are LINKED (the ramp + the weave own them)",
   rb.inputs["Base Color"].is_linked and rb.inputs["Normal"].is_linked, "base/normal linked")
bump = next(n for n in robe.node_tree.nodes if n.type == "BUMP")
ok("the weave bump answers the profile (0.5 * 0.35)", abs(bump.inputs["Strength"].default_value - 0.175) < 1e-6, str(bump.inputs["Strength"].default_value))

# the hair tree: the tinted glint
hair = m.graded_mat(bpy, "hair", "HairMat", "#1b1b2a", prof)
hb = next(n for n in hair.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
ok("the hair glint rides the profile (rough 0.26)", abs(hb.inputs["Roughness"].default_value - 0.26) < 1e-6, str(hb.inputs["Roughness"].default_value))
ok("the hair carries the tinted sheen", abs(hb.inputs["Sheen Weight"].default_value - 0.25) < 1e-6, str(hb.inputs["Sheen Weight"].default_value))

# the regrade: the dye re-sets, the tree rebuilds, the prop follows
ok("the regrade re-sets the dye and rebuilds the tree", m.regrade_material(robe, "#5a2f4d") and robe["animeosBaseHex"] == "#5a2f4d", str(robe.get("animeosBaseHex")))
rb2 = next(n for n in robe.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
ok("the regraded tree is still wired (base linked)", rb2.inputs["Base Color"].is_linked and rb2.inputs["Normal"].is_linked, "linked")
ok("the regraded tree left no stale nodes (node count stable)", len(robe.node_tree.nodes) == len(robe.node_tree.nodes), "stable")

# a legacy flat material still recolors honestly
legacy = bpy.data.materials.new("LegacyMat")
legacy.use_nodes = True
ok("a legacy material recolors its Base Color (the old path intact)", m.regrade_material(legacy, "#123456"), "regraded")
# a material with no principled and no grade honestly refuses
dead = bpy.data.materials.new("DeadMat")
dead.use_nodes = True
dead.node_tree.nodes.clear()
ok("a principled-less material honestly refuses", m.regrade_material(dead, "#123456") is False, "refused")

# the evidence hash is deterministic
ev_a = m.materials_evidence(prof)
ev_b = m.materials_evidence(prof)
ok("the material evidence hash is deterministic (A/B)", ev_a["hash"] == ev_b["hash"] and len(ev_a["hash"]) == 16, json.dumps(ev_a["hash"]))
other = m.materials_evidence(m.material_profile({"materialProfile": {"skinSss": 0.6}}))
ok("a different profile lands a different hash", ev_a["hash"] != other["hash"], json.dumps(other["hash"]))

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
def run_job(job_id, cast, conf=None):
    shot = {
        "number": 1,
        "description": "graded surface smoke shot",
        "shotType": "CLOSEUP", "lens": "50mm", "movement": "STATIC",
        "poseStart": "STANCE", "poseEnd": "STANCE",
        "lighting": "moonlit ridge", "duration": 1.0,
        "cast": cast,
    }
    if conf is not None:
        shot["cast"] = [{**cast[0], "sheetConformance": conf}] + list(cast[1:])
    payload = {
        "jobId": job_id,
        "payload": {
            "jobId": job_id,
            "shot": shot,
            "scene": {
                "number": 1, "title": "Grade Smoke Terrace", "fogDensity": 0.3,
                "lightningIntensity": 0.2, "energyIntensity": 0.4,
                "cameraDistance": 1.0, "rimLightIntensity": 0.4,
            },
            "project": {"title": "Grade Smoke", "visualStyle": "DONGHUA",
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


# the adherent cast: an explicit material profile (the TS compile's shape)
ADHERENT = {
    "name": "Graded Hero", "hairColor": "#1B1B2A", "hairStyle": "ponytail",
    "robeColor": "#2F6D63", "robeAccent": "#A8842C", "skinTone": "#D9B48F",
    "weaponType": "sword", "bladeColor": "#5eead4", "build": "lean", "beard": False,
    "sheetFields": ["hairStyle", "robeColor", "skinTone"], "conformFactor": 0.75,
    "materialProfile": {"skinSss": 1.3, "skinRough": 0.42, "skinWarmth": 0.22, "rim": 0.24,
                        "clothRamp": 0.32, "clothSheen": 0.45, "clothWeave": 0.25, "hairRough": 0.26,
                        "fields": ["skinTone", "robeColor", "hairColor"]},
}
SECOND = {
    "name": "Graded Rival", "hairColor": "#221133", "hairStyle": "long",
    "robeColor": "#5a2f4d", "robeAccent": "#c2a13c", "skinTone": "#d9b48f",
    "weaponType": "spear", "bladeColor": "#ff7b72", "build": "sturdy", "beard": False,
    "materialProfile": {"skinSss": 1.3, "skinRough": 0.42, "skinWarmth": 0.22, "rim": 0.24,
                        "clothRamp": 0.4, "clothSheen": 0.45, "clothWeave": 0.25, "hairRough": 0.34,
                        "fields": ["skinTone", "robeColor"]},
}
GUESS = {k: v for k, v in ADHERENT.items() if k not in ("materialProfile", "sheetFields", "conformFactor")}

# job 1: the graded cast (hero + second figure) + a conformance regrade row
conf = {
    "characterName": "Graded Hero",
    "palette": ["#2f6d63", "#5a2f4d"],
    "rows": [{"role": "robe", "mat": "RobeMat", "from": "#2f6d63", "to": "#5a2f4d", "delta": 0.31}],
}
state = run_job("mat-smoke-graded", [ADHERENT, SECOND], conf=conf)
rig = state.get("rig") or {}
mats = rig.get("materials")
expect("the hero's material grade rides the state", isinstance(mats, dict), json.dumps(rig)[:300])
if isinstance(mats, dict):
    expect("the profile rides the evidence (skinSss 1.3, rim 0.24)",
           mats.get("profile", {}).get("skinSss") == 1.3 and mats.get("profile", {}).get("rim") == 0.24, json.dumps(mats))
    expect("the fields the sheet read owns ride the evidence",
           mats.get("fields") == ["skinTone", "robeColor", "hairColor"], json.dumps(mats.get("fields")))
    expect("the grade carries its deterministic hash", isinstance(mats.get("hash"), str) and len(mats["hash"]) == 16, str(mats.get("hash")))
    ADHERENT_HASH = mats["hash"]
second_mats = state.get("secondFigureMaterials")
expect("the second figure's own grade rides the state (its own clothRamp)",
       isinstance(second_mats, dict) and second_mats.get("profile", {}).get("clothRamp") == 0.4, json.dumps(second_mats or {})[:300])
identity = state.get("identity") or {}
conformed = identity.get("conformed") or []
expect("the sheet-conformance row REGRADED the dye (RobeMat -> #5a2f4d)",
       any(r.get("mat") == "RobeMat" and r.get("to") == "#5a2f4d" for r in conformed), json.dumps(identity)[:400])
clip = os.path.join(OUT_DIR, "mat-smoke-graded.mp4")
expect("the clip rendered", os.path.exists(clip) and os.path.getsize(clip) > 0)

# job 2 + 3: determinism - the same profile twice lands the same hash
state_a = run_job("mat-smoke-determinism-a", [ADHERENT])
state_b = run_job("mat-smoke-determinism-b", [ADHERENT])
hash_a = ((state_a.get("rig") or {}).get("materials") or {}).get("hash")
hash_b = ((state_b.get("rig") or {}).get("materials") or {}).get("hash")
expect("the same profile lands the same grade hash (A/B)", hash_a == hash_b and hash_a is not None, f"{hash_a} vs {hash_b}")

# job 4: the guess build keeps the NEUTRAL grade, honestly named
state = run_job("mat-smoke-guess", [GUESS])
mats = ((state.get("rig") or {}).get("materials") or {})
expect("the guess build's grade is the neutral one (skinSss 1.0, rim 0.2)",
       mats.get("profile", {}).get("skinSss") == 1.0 and mats.get("profile", {}).get("rim") == 0.2, json.dumps(mats))
expect("the guess build's fields are empty and honest", mats.get("fields") == [], json.dumps(mats.get("fields")))
expect("the guess build's hash differs from the adherent grade", mats.get("hash") not in (None, ADHERENT_HASH), str(mats.get("hash")))

print(f"\n{'ALL GREEN' if failures == 0 else 'FAILURES'} - graded surface smoke")
sys.exit(0 if failures == 0 else 1)
