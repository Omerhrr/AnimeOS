#!/usr/bin/env python3
# Smoke-test THE CHARACTER GAINS ITS CRAFT (iteration 120) inside the
# REAL Blender - the identity gap's home answered on three fronts:
#   1. THE WARDROBE CRAFTS ITSELF: the skirt carries deterministic
#      radial folds (evidence rides the figure), the hem wears a
#      measured contrast trim, the cuffs wear bands, the chest wears
#      the painted cloud-scroll embroidery conformed onto the robe
#      (a real UV'd decal riding a shrinkwrap of the RobeBody).
#   2. THE FACE GAINS STRUCTURE: 16 analytic structures sculpt the
#      skull - the profile read names how proud the nose bridge, the
#      nose tip, the brow and the chin stand; bit-exact across
#      builds; the spec drives the carve (a male brow stands prouder
#      than a female brow at the same law); the terminator proxy
#      stays untouched.
#   3. THE BLADE EARNS ITS FORGE: the sword ships wrap bands, a
#      pommel and a tassel on the 97 grip contract; the staff ships
#      wraps and end caps.
#   4. THE LAW VERSION RIDES: the builder declares anime:v120.
# Run:  python3 scripts/blender-craft120-smoke.py
import hashlib
import json, math, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BL = next(
    p for p in (
        "/home/z/blender-5.2.2-linux-x64/blender",
        "/home/z/blender-4.3.2-linux-x64/blender",
    )
    if os.path.exists(p)
)

RUNNER = r'''
import hashlib
import json, math, os, sys
HERE = "__HERE__"
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import bpy
import animeos_bridge as ab
import anime_character as ac

scn = bpy.context.scene
out = {}

def fresh_scene():
    for ob in list(scn.objects):
        bpy.data.objects.remove(ob, do_unlink=True)

def mats_for(prefix):
    m = {}
    for k in ("skin", "hair", "boots", "accent", "robe", "blade"):
        mat = bpy.data.materials.new(f"{prefix}_{k}")
        mat.use_nodes = True
        m[k] = mat
    return m

DNA_HANFU = {
    "name": "CraftHero",
    "weaponType": "sword",
    "designSpec": {
        "body": {"gender": "male", "build": "sturdy", "shoulders": 1.05, "hips": 1.0, "bust": 0.0, "headScale": 1.0},
        "face": {"shape": "angular", "jawTaper": 0.62, "chinFwd": 0.03, "cheek": 1.0},
        "hair": {"style": "topknot", "color": "#101014"},
        "outfit": {"type": "hanfu", "length": 0.85, "sleeves": "bell", "sash": True},
    },
}

# ── build 1: the hanfu swordsman ──
fresh_scene()
hero = ac.build_anime_character(bpy, scn, DNA_HANFU, mats_for("a"), br=ab._grip_law())
anime = hero["anime"]
out["lawVersion"] = anime["lawVersion"]

# THE WARDROBE: folds, trims, embroidery
ward = anime.get("wardrobe") or {}
out["wardrobe"] = ward
out["folds_applied"] = (ward.get("folds") or 0) > 200 and (ward.get("maxFoldFrac") or 0) > 0.02
robe = bpy.data.objects.get("RobeBody")
out["robe_exists"] = robe is not None

def mesh_max_radial(ob, z0, z1):
    if ob is None:
        return 0.0
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    rs = [math.hypot(v.co.x, v.co.y) for v in me.vertices if z0 <= v.co.z <= z1]
    ev.to_mesh_clear()
    return max(rs) if rs else 0.0

# THE FOLD READ (harmonic): the ring's radius-as-angle carries the
# folds at harmonics 6 and 9 while the ellipse's own shape lives at
# harmonic 2 - FFT the ring, compare the fold harmonics' power
# against the ellipse's. The skirt carries the folds, the chest
# (above the waist) stays clean.
import numpy as np

def fold_harmonics(ob, z, band=0.022):
    if ob is None:
        return None
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    pts = [(math.atan2(v.co.y, v.co.x), math.hypot(v.co.x, v.co.y))
           for v in me.vertices if abs(v.co.z - z) <= band]
    ev.to_mesh_clear()
    if len(pts) < 32:
        return None
    NB = 72
    bins = [[] for _ in range(NB)]
    for a_, r_ in pts:
        k = int((a_ + math.pi) / (2.0 * math.pi) * NB) % NB
        bins[k].append(r_)
    rr = np.array([float(np.mean(b)) if b else np.nan for b in bins])
    if np.isnan(rr).any():
        # fill empty bins with their nearest filled neighbour (circular)
        idx = np.arange(NB)
        good = ~np.isnan(rr)
        for i in idx[~good]:
            d = np.abs(((idx[good] - i + NB // 2) % NB) - NB // 2)
            rr[i] = rr[idx[good][int(np.argmin(d))]]
    F = np.abs(np.fft.rfft(rr - rr.mean()))
    p2 = float(F[2]) + 1e-9
    return (float(F[6]) / p2, float(F[9]) / p2)

def densest_ring_z(ob, z_lo, z_hi):
    """The mesh's own densest height in the zone (the loft's rings sit
    ~0.14 apart - the probe must measure ON a ring, not between)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    best_z, best_n = None, 0
    step = 0.02
    z = z_lo
    while z <= z_hi:
        n = sum(1 for v in me.vertices if abs(v.co.z - z) <= 0.02)
        if n > best_n:
            best_z, best_n = z, n
        z += step
    ev.to_mesh_clear()
    return best_z

sk_z = densest_ring_z(robe, 0.25, 0.95)
ch_z = densest_ring_z(robe, 1.15, 1.55)
sk = fold_harmonics(robe, sk_z)
ch = fold_harmonics(robe, ch_z)
out["skirt_z"] = round(sk_z, 3)
out["chest_z"] = round(ch_z, 3)
out["skirt_fold_harmonics"] = None if sk is None else [round(v, 3) for v in sk]
out["chest_fold_harmonics"] = None if ch is None else [round(v, 3) for v in ch]
out["folds_read"] = bool(sk and ch and min(sk) > 0.08 and max(ch) < 0.08)

trim = bpy.data.objects.get("HemTrim")
out["hem_trim_exists"] = trim is not None
out["cuff_bands_exist"] = bpy.data.objects.get("CuffBandL") is not None and bpy.data.objects.get("CuffBandR") is not None
band = bpy.data.objects.get("ChestBandMesh")
out["chest_band_exists"] = band is not None
if band is not None:
    out["chest_band_uv"] = len(band.data.uv_layers) > 0
    sw = band.modifiers.get("OnFace")
    out["chest_band_wraps_robe"] = sw is not None and sw.target is not None and sw.target.name == "RobeBody"
else:
    out["chest_band_uv"] = False
    out["chest_band_wraps_robe"] = False

# THE FACE: the profile read
fa = anime.get("faceAnatomy") or {}
out["face"] = fa
out["face_structures"] = fa.get("structures", 0)
prof = fa.get("profile") or {}
out["nose_proud"] = (prof.get("noseBridge") or {}).get("proudMm", 0.0)
out["nosetip_proud"] = (prof.get("noseTip") or {}).get("proudMm", 0.0)
out["brow_proud"] = (prof.get("brow") or {}).get("proudMm", 0.0)
out["chin_proud"] = (prof.get("chin") or {}).get("proudMm", 0.0)
out["face_profile_reads"] = out["nose_proud"] > 1.0 and out["nosetip_proud"] > 1.0 and out["brow_proud"] > 0.5 and out["chin_proud"] > 0.5
out["face_moved"] = (fa.get("vertsMoved") or 0) > 100 and 0.0005 < (fa.get("maxDisp") or 0.0) < 0.02

def head_hash():
    hm = bpy.data.objects.get("HeadMesh")
    dg = bpy.context.evaluated_depsgraph_get()
    ev = hm.evaluated_get(dg)
    me = ev.to_mesh()
    h = hashlib.sha256()
    for v in sorted(me.vertices, key=lambda v: v.index):
        h.update(f"{v.co.x:.6f},{v.co.y:.6f},{v.co.z:.6f};".encode())
    ev.to_mesh_clear()
    return h.hexdigest()[:16]

hash1 = head_hash()

# ── build 2: bit-exact (the same spec, a fresh scene) ──
fresh_scene()
_ = ac.build_anime_character(bpy, scn, DNA_HANFU, mats_for("b"), br=ab._grip_law())
out["face_bit_exact"] = head_hash() == hash1

# ── build 3: the spec drives the carve (a female face softens) ──
fresh_scene()
DNA_F = json.loads(json.dumps(DNA_HANFU))
DNA_F["designSpec"]["body"]["gender"] = "female"
DNA_F["designSpec"]["face"] = {"shape": "oval", "jawTaper": 0.72, "chinFwd": 0.02, "cheek": 1.0}
_ = ac.build_anime_character(bpy, scn, DNA_F, mats_for("c"), br=ab._grip_law())
fa_f = _["anime"].get("faceAnatomy") or {}
prof_f = fa_f.get("profile") or {}
out["brow_proud_female"] = (prof_f.get("brow") or {}).get("proudMm", 0.0)
out["face_spec_driven"] = out["brow_proud"] > out["brow_proud_female"] > 0.0

# ── build 4: the staff bearer ──
fresh_scene()
DNA_S = json.loads(json.dumps(DNA_HANFU))
DNA_S["weaponType"] = "staff"
_ = ac.build_anime_character(bpy, scn, DNA_S, mats_for("d"), br=ab._grip_law())
names = {ob.name for ob in scn.objects}
out["staff_craft"] = all(n in names for n in ("ShaftBand0", "ShaftBand1", "ShaftCap0", "ShaftCap1"))

# ── build 5: the sword's forge pieces (back to the swordsman) ──
fresh_scene()
_ = ac.build_anime_character(bpy, scn, DNA_HANFU, mats_for("e"), br=ab._grip_law())
names = {ob.name for ob in scn.objects}
out["sword_craft"] = all(n in names for n in ("GripBand0", "GripBand1", "GripBand2", "BladePommel", "BladeTassel0", "BladeTassel1"))

print("CRAFT120_SMOKE " + json.dumps(out))
'''

failures = 0
def expect(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
    if not cond:
        failures += 1

with tempfile.TemporaryDirectory(prefix="anime-craft120-") as tmp:
    runner = RUNNER.replace("__HERE__", os.path.join(ROOT, "bridges", "blender"))
    rp = os.path.join(tmp, "runner.py")
    with open(rp, "w") as fh:
        fh.write(runner)
    proc = subprocess.run([BL, "-b", "--python", rp], capture_output=True, text=True, timeout=900, cwd=ROOT)
    if proc.returncode != 0:
        print("STDERR tail:", proc.stderr[-2500:])
        sys.exit(1)
    line = next((l for l in proc.stdout.splitlines() if l.startswith("CRAFT120_SMOKE ")), None)
    if not line:
        print("FAIL no CRAFT120_SMOKE line")
        print(proc.stdout[-1500:])
        sys.exit(1)
    out = json.loads(line[len("CRAFT120_SMOKE "):])

expect("the builder declares anime:v120", out["lawVersion"] == 120, out["lawVersion"])
expect("THE SKIRT GAINS FOLDS (evidence rides the figure)", out["folds_applied"], json.dumps(out.get("wardrobe", {}))[:200])
expect("the folds READ on the mesh (harmonics 6/9 speak on the skirt, silent on the chest)",
       out["folds_read"], f"skirt {out['skirt_fold_harmonics']} vs chest {out['chest_fold_harmonics']}")
expect("the hem wears its contrast trim", out["hem_trim_exists"])
expect("the cuffs wear their bands", out["cuff_bands_exist"])
expect("the chest wears the embroidered band", out["chest_band_exists"])
expect("the embroidery is a real UV'd decal", out["chest_band_uv"])
expect("the embroidery wraps the robe (shrinkwrap of RobeBody)", out["chest_band_wraps_robe"])
expect("THE FACE SCULPTS 16 STRUCTURES", out["face_structures"] == 16, out["face_structures"])
expect("the face moved honestly (sub-mm form, not a caricature)", out["face_moved"], json.dumps({k: out["face"].get(k) for k in ("vertsMoved", "maxDisp")}))
expect("THE PROFILE READS (nose bridge, tip, brow, chin stand proud)",
       out["face_profile_reads"],
       f"brow {out['brow_proud']} / bridge {out['nose_proud']} / tip {out['nosetip_proud']} / chin {out['chin_proud']} mm")
expect("the same spec sculpts the same face (bit-exact)", out["face_bit_exact"])
expect("THE SPEC DRIVES THE CARVE (a male brow stands prouder)", out["face_spec_driven"],
       f"{out['brow_proud']} vs {out['brow_proud_female']} mm")
expect("THE SWORD SHIPS ITS FORGE (bands, pommel, tassel)", out["sword_craft"])
expect("THE STAFF SHIPS ITS CRAFT (wraps, caps)", out["staff_craft"])

print(f"\n{'ALL GREEN' if failures == 0 else f'{failures} FAILURES'}")
sys.exit(1 if failures else 0)
