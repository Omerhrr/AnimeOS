#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 132) - the 131 night's frontier:
(1) the chibi/simplified FACE read at MEDIUM, the judge's new tell
"the detailed MALE features of the sheet" vs the build's shape - the
131 probe's own blind spot found first: its LIN dict rode NO
designSpec, so resolve_spec's female default built the probe figure
(the night's real payload carried the male spec). This probe rides the
HONEST payload (the committed designSpec byte-exact) and answers:
  A. THE PROPORTION READ (no render): the built figure's head/height
     ratio (the chibi metric: an anime adult ~0.14-0.17, chibi
     >= 0.25) + the shoulder/hip span (the gender read) + the garment.
  B. THE RENDER READ: S002 MEDIUM + S003 CLOSEUP at the standing laws
     (the same worker_run the night rides), mid frame per clip.
  C. THE PIXEL READ: the closeup's hair-dome crop measured against the
     dye's own hue (the teal tell: the sky-mix on the dome's fall).

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender \
     python3 scripts/probe-132-style.py
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe132")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

# THE HONEST PAYLOAD: the standing dyes PLUS the committed designSpec
# (byte-exact from the Character rows) - what render.ts actually rides.
LIN_SPEC = {"body": {"gender": "male", "build": "lean", "shoulders": 1.15, "hips": 0.9, "bust": 0.05, "headScale": 0.9},
            "face": {"shape": "angular", "jawTaper": 0.6, "chinFwd": 0.02, "cheek": 0.85},
            "eyes": {"size": 0.8, "tilt": -0.2, "color": "#1a1a2e", "shape": "almond", "lashes": 0.5},
            "brows": {"thickness": 1.25, "arch": 0.4},
            "mouth": {"width": 0.9, "color": "#8b4513"},
            "hair": {"style": "topknot", "length": 0.95, "bangs": "parted", "volume": 1.3, "color": "#1a1a1a"},
            "outfit": {"type": "hanfu", "length": 1.0, "sleeves": "bell", "collar": "crossed", "sash": True}}
LIN = {"name": "Lin Yue", "hairStyle": "topknot", "hairColor": "#1a1a1a",
       "robeColor": "#1f5c5c", "robeAccent": "#c4b454", "skinTone": "#e8d5c4",
       "weaponType": "sword", "bladeColor": "#5eead4", "designSpec": LIN_SPEC}

# (tag, shotType, lens, movement, lighting)
PROBES = [
    ("S002-medium-lin", "MEDIUM", "35mm", "TRACKING", "Backlight + interior shadows"),
    ("S003-closeup-lin", "CLOSEUP", "85mm", "STATIC", "Cold key, deep shadow"),
]

MEASURE = r'''
import importlib.util, json, math, os, sys
import bpy, mathutils
# the honest argv law: everything after '--' is the tail (Blender
# rewrites sys.argv - positional indexing from the end is NOT safe)
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-3:]
bridge, dna_file, out_json = _tail[0], _tail[1], _tail[2]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.path.insert(0, os.path.dirname(os.path.abspath(bridge)))
import anime_character

dna = json.load(open(dna_file))
scn = bpy.context.scene
hero_mats = {
    "robe": m.principled_mat(bpy, "RobeMat", "#1f5c5c", 0.7),
    "accent": m.principled_mat(bpy, "AccentMat", "#c4b454", 0.7),
    "skin": m.principled_mat(bpy, "SkinMat", "#e8d5c4", 0.6),
    "hair": m.principled_mat(bpy, "HairMat", "#1a1a1a", 0.5),
    "blade": m.emission_mat(bpy, "BladeMat", "#5eead4", 6.0),
    "boots": m.principled_mat(bpy, "BootsMat", "#241a12", 0.8),
}
fig = anime_character.build_anime_character(bpy, scn, dna, hero_mats, br=m._grip_law())

def world_bbox(objs):
    lo = [1e9] * 3; hi = [-1e9] * 3
    for o in objs:
        if o.type != "MESH":
            continue
        for v in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(v)
            for i in range(3):
                lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
    return lo, hi

head_objs = [o for o in scn.objects if o.name in ("HeadMesh", "HeadNormalProxy") or o.name.startswith(("Eye", "Brow", "Mouth", "HairTop", "HairBang", "HairSide", "HairBack", "HairTopknot", "HairTail")) or "topknot" in o.name.lower()]
all_mesh = [o for o in scn.objects if o.type == "MESH" and not o.name.startswith(("Set", "Terrain", "Ground", "Sky", "Temple", "Altar", "Pillar", "Floor"))]
hlo, hhi = world_bbox(head_objs)
alo, ahi = world_bbox(all_mesh)
head_h = hhi[2] - hlo[2]
total_h = ahi[2] - alo[2]
shoulder_objs = [o for o in all_mesh if o.name.startswith(("Robe", "Torso", "Sleeve", "Arm", "Shoulder"))]
slo, shi = world_bbox(shoulder_objs)
res = {
    "figureSource": fig.get("anime", {}).get("figureSource") or str(fig.get("anime", {}))[:80],
    "headH": round(head_h, 4), "totalH": round(total_h, 4),
    "headRatio": round(head_h / max(total_h, 1e-4), 4),
    "shoulderSpan": round(shi[0] - slo[0], 4),
    "genderRead": "wide-shouldered" if (shi[0] - slo[0]) > (ahi[0] - alo[0]) * 0.24 else "narrow",
    "objects": len(all_mesh), "headObjects": len(head_objs),
}
json.dump(res, open(out_json, "w"), indent=1)
'''

RENDER = r'''
import importlib.util, json, sys
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-2:]
bridge, job = _tail[0], _tail[1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.worker_run(job)
'''


def pixel_read(png):
    """The closeup's hair-dome crop vs the dye's hue: count pixels in
    the top-center crop whose hue sits in the teal band (0.38-0.56)
    with chroma above 0.06 - the sky-tinted texels the judge reads."""
    try:
        from PIL import Image
        import colorsys
        im = Image.open(png).convert("RGB")
        w, h = im.size
        box = im.crop((int(w * 0.30), int(h * 0.05), int(w * 0.70), int(h * 0.45)))
        px = list(box.getdata())
        teal = dark = total = 0
        for r, g, b in px[:: max(1, len(px) // 20000)]:
            total += 1
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if vv < 0.10:
                dark += 1
            elif 0.38 <= hh <= 0.56 and ss >= 0.10:
                teal += 1
        return {"cropPx": total, "tealShare": round(teal / max(total, 1), 4),
                "darkShare": round(dark / max(total, 1), 4)}
    except Exception as exc:  # noqa: BLE001
        return {"refused": str(exc)[:120]}


def main():
    os.makedirs(OUT, exist_ok=True)
    # A. THE PROPORTION READ (the honest DNA, no render)
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump(LIN, fh); dna_file = fh.name
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        out_file = fh.name
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(MEASURE); meas_py = fh.name
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", meas_py, "--", BRIDGE, dna_file, out_file],
                       capture_output=True, text=True, timeout=1200)
    try:
        prop = json.load(open(out_file))
    except Exception:
        prop = {"refused": (r.stderr or r.stdout)[-400:]}
    print("== A. THE PROPORTION READ ==")
    print(json.dumps(prop, indent=1))
    with open(os.path.join(OUT, "proportion.json"), "w") as fh:
        json.dump(prop, fh, indent=1)

    # B. THE RENDER READ (the honest payload at the standing laws)
    print("\n== B. THE RENDER READ ==")
    for tag, shot_type, lens, movement, lighting in PROBES:
        out_dir = tempfile.mkdtemp(prefix=f"p132-{tag}-")
        job = os.path.join(out_dir, "job.json")
        payload = {
            "shot": {"number": 2, "description": f"probe {tag}",
                     "shotType": shot_type, "lens": lens, "movement": movement,
                     "poseStart": "STANCE", "poseEnd": "STANCE",
                     "lighting": lighting, "duration": 0.5, "cast": [LIN]},
            "scene": {"number": 1, "title": "probe", "fogDensity": 0.45,
                      "lightningIntensity": 0.3, "energyIntensity": 0.6,
                      "cameraDistance": 1.0, "rimLightIntensity": 0.5},
            "project": {"title": "probe132", "visualStyle": "DONGHUA",
                        "resolution": "960x540", "fps": 8},
            "mode": "PREVIEW",
        }
        with open(job, "w") as fh:
            json.dump({"jobId": f"probe132-{tag}", "payload": payload, "outDir": out_dir}, fh)
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
            fh.write(RENDER)
        r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", fh.name, "--", BRIDGE, job],
                           capture_output=True, text=True, timeout=1800)
        st = json.load(open(job))
        mp4 = st.get("mp4Path")
        ok = bool(mp4) and os.path.exists(mp4)
        print(f"[{tag}] clip={ok} -> {mp4}")
        if not ok:
            print((r.stderr or r.stdout)[-600:])
            continue
        pngs = sorted(f for f in os.listdir(out_dir) if f.endswith(".png"))
        mid = os.path.join(OUT, f"{tag}.png")
        if pngs:
            subprocess.run(["cp", os.path.join(out_dir, pngs[len(pngs) // 2]), mid], check=False)
        else:
            subprocess.run(["ffmpeg", "-y", "-i", mp4, "-vf", "select=eq(n\\,2)", "-vframes", "1", mid],
                           capture_output=True, timeout=120)
        # C. THE PIXEL READ on the closeup (and the medium, for scale)
        read = pixel_read(mid) if os.path.exists(mid) else {"refused": "no frame"}
        print(f"    frame -> {mid}")
        print(f"    pixel read: {json.dumps(read)}")
        ev = st.get("render") or {}
        keep = {k: ev.get(k) for k in ("look", "facePaint", "presence", "figureSource", "hairMass") if k in ev}
        with open(os.path.join(OUT, f"{tag}.state.json"), "w") as fh:
            json.dump({"evidence": keep, "pixelRead": read}, fh, indent=1, default=str)
    print(f"\nPROBE DONE: frames in {OUT}")


if __name__ == "__main__":
    main()
