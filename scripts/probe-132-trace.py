#!/usr/bin/env python3
"""THE PIXEL TRACE (probe 132 follow-up): name the hair dome's actual
RGB in the two probe frames, and trace which pass lifts the #1a1a1a
dye - the toon mass cap ends at linear 0.055 (sRGB ~66) yet the frames
read far lighter. The trace renders ONE MEDIUM frame with the toon
pass's hair evidence and dumps the hair material's node state."""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe132")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

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

PIXELS = r'''
import sys
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [sys.argv[-1]]
from PIL import Image
im = Image.open(_tail[-1]).convert("RGB")
w, h = im.size
def region(x0, y0, x1, y1):
    box = im.crop((int(w*x0), int(h*y0), int(w*x1), int(h*y1)))
    px = list(box.getdata())
    n = len(px)
    avg = tuple(round(sum(p[i] for p in px)/n) for i in range(3))
    return avg, n
# the dome: S002 the hair sits around the head top (~y 0.22-0.30, x 0.44-0.56)
# S003 the dome fills the top half
for name, (x0, y0, x1, y1) in {"dome_tight": (0.44, 0.05, 0.56, 0.18),
                                "dome_wide": (0.30, 0.05, 0.70, 0.35),
                                "face": (0.42, 0.35, 0.58, 0.55)}.items():
    try:
        avg, n = region(x0, y0, x1, y1)
        print(f"{name}: avg RGB {avg} over {n}px")
    except Exception as e:
        print(f"{name}: refused {e}")
'''

RENDER = r'''
import importlib.util, json, sys
# the honest argv law: everything after '--' is the tail (Blender
# rewrites sys.argv - positional indexing from the end is NOT safe)
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-3:]
bridge, job, out_json = _tail[0], _tail[1], _tail[2]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.worker_run(job)
st = json.load(open(job))
ev = (st.get("render") or {})
out = {"look": ev.get("look"), "hairMass": ev.get("hairMass"), "grade": ev.get("grade"), "comp": (st.get("comp") or {}).get("summary") if isinstance(st.get("comp"), dict) else None}
# the hair material's toon state: find hair mats and their base colors
import bpy
rows = []
for mat in bpy.data.materials:
    if "hair" in mat.name.lower() and mat.use_nodes:
        base = None
        for n in mat.node_tree.nodes:
            if n.type == "BSDF_TOON":
                base = tuple(round(c, 4) for c in n.inputs["Color"].default_value[:3])
        rows.append({"mat": mat.name, "toonBase": base, "tagged": bool(mat.get("animeos_toon"))})
out["hairMats"] = rows
json.dump(out, open(out_json, "w"), indent=1)
'''

def main():
    os.makedirs(OUT, exist_ok=True)
    for tag, shot_type, lens, movement, lighting in [
            ("S002-medium-lin", "MEDIUM", "35mm", "TRACKING", "Backlight + interior shadows"),
            ("S003-closeup-lin", "CLOSEUP", "85mm", "STATIC", "Cold key, deep shadow")]:
        out_dir = tempfile.mkdtemp(prefix=f"p132t-{tag}-")
        job = os.path.join(out_dir, "job.json")
        payload = {
            "shot": {"number": 2, "description": f"probe {tag}", "shotType": shot_type,
                     "lens": lens, "movement": movement, "poseStart": "STANCE", "poseEnd": "STANCE",
                     "lighting": lighting, "duration": 0.5, "cast": [LIN]},
            "scene": {"number": 1, "title": "probe", "fogDensity": 0.45, "lightningIntensity": 0.3,
                      "energyIntensity": 0.6, "cameraDistance": 1.0, "rimLightIntensity": 0.5},
            "project": {"title": "probe132", "visualStyle": "DONGHUA", "resolution": "960x540", "fps": 8},
            "mode": "PREVIEW",
        }
        with open(job, "w") as fh:
            json.dump({"jobId": f"p132t-{tag}", "payload": payload, "outDir": out_dir}, fh)
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
            fh.write(RENDER); render_py = fh.name
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            state_out = fh.name
        subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job, state_out],
                       capture_output=True, text=True, timeout=1800)
        try:
            ev = json.load(open(state_out))
        except Exception:
            ev = {"refused": "no state"}
        pngs = sorted(f for f in os.listdir(out_dir) if f.endswith(".png"))
        if pngs:
            mid = os.path.join(OUT, f"{tag}.png")
            subprocess.run(["cp", os.path.join(out_dir, pngs[len(pngs)//2]), mid], check=False)
            with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
                fh.write(PIXELS); px_py = fh.name
            r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", px_py, "--", mid],
                               capture_output=True, text=True, timeout=120)
            print(f"== {tag} pixels ==")
            print("\n".join(l for l in (r.stdout or "").splitlines() if "avg RGB" in l or "refused" in l))
        print(f"== {tag} hair-mat state ==")
        print(json.dumps(ev, indent=1, default=str)[:900])

if __name__ == "__main__":
    main()
