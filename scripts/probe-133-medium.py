#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 133) - the 132 night's frontier:
(1) the MEDIUM face read is a FRAMING wall - face 20 TWICE through the
moderate stage; 'the MEDIUM wall is the framing's texel budget, not
the paint'. The geometry read: the presence solve sizes MEDIUM from
the WHOLE figure at fill 0.74 - the full figure owns 74% of frame
height, which is film grammar's FULL SHOT, not the waist-up MEDIUM
the sheet comparison assumes. The rung preview: solve MEDIUM from the
WAIST-UP body (the upper MEDIUM_UPPER_SHARE of the measured figure) -
dist 3.1 pulls in to ~1.3, the head's texels multiply.
(2) the wide-end robe wash (S006-Lin palette 30 'simplified grey
robe', S005 palette 20 'heavily washed') - the exemption banks chroma
(FIGURE_CHROMA_KEEP cloth 1.28) and the wash still owns the palette
cell. The bisect isolates the owner: the framing wash table
(PALETTE_WASH_BY_SHOT -> PaletteWashToon), the comp graph (LUT +
layers), or the keep bank itself.

Cuts (each a real worker_run at the standing laws, honest payload):
  A1 S002 MEDIUM control            (the standing solve, dist ~3.1)
  A2 S002 MEDIUM waist-up preview   (measure_subject rides h x 0.42)
  B1 S005 LOW_ANGLE control         (wash 0.32, keep 1.28)
  B2 S005 wash-off preview          (palette_wash_for -> 0.0)
  B3 S005 keep-up preview           (cloth keep 1.28 -> 1.60)
  B4 S005 comp-off preview          (build_comp_graph no-op)

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender \
     python3 scripts/probe-133-medium.py
(the detached-ops supervisor law: every cut that finishes lands in
probe133-results.json and a restart resumes from there)
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe133")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

# THE HONEST PAYLOAD: the committed designSpec byte-exact (the 132
# probe's lesson - a probe without it builds resolve_spec's default
# figure and measures a lie).
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

# the REAL standing rows (the night's own payloads; poses ride STANCE
# exactly as 132 probed)
S002 = {"number": 2, "description": "Lin Yue enters the temple, robes whipping in the wind, rain trailing off his shoulders",
        "shotType": "MEDIUM", "lens": "35mm", "movement": "TRACKING",
        "lighting": "Backlight + interior shadows", "duration": 0.5,
        "cast": [LIN]}
S005 = {"number": 5, "description": "Sword draw - Lin Yue's jade blade sings out of its sheath, azure energy coiling up the steel",
        "shotType": "LOW_ANGLE", "lens": "50mm", "movement": "ORBIT",
        "lighting": "Blade emission + rim light", "duration": 0.5,
        "cast": [LIN]}

RENDER = r'''
import importlib.util, json, os, sys
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-2:]
bridge, job = _tail[0], _tail[1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
here = os.path.dirname(os.path.abspath(bridge))
if here not in sys.path:
    sys.path.insert(0, here)
import toon_pass as tp

# ── THE CUTS (each previews exactly one law shape) ──
cut = os.environ.get("PROBE_CUT", "control")
if cut == "waistup":
    _real = m.measure_subject
    SHARE = 0.42  # THE WAIST-UP SOLVE PREVIEW: the MEDIUM sizes from
                  # the upper body; headH/chest/face stay REAL so the
                  # aim and the lens height ride the true figure
    def _waist(root, _real=_real):
        s = _real(root)
        if isinstance(s, dict) and s.get("h"):
            s = dict(s)
            s["h"] = round(float(s["h"]) * SHARE, 4)
            s["waistup"] = SHARE
        return s
    m.measure_subject = _waist
elif cut == "washoff":
    tp.palette_wash_for = lambda shot_type: 0.0
elif cut == "keepup":
    tp.FIGURE_CHROMA_KEEP = dict(tp.FIGURE_CHROMA_KEEP, cloth=1.60)
elif cut == "compoff":
    def _no_comp(scn, prof, frames_total):
        return {"layers": [], "skipped": ["probe133 comp bisect"], "aovs": [], "mode": "off"}
    m.build_comp_graph = _no_comp

m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
keep = {k: ev.get(k) for k in ("look", "facePaint", "presence", "paletteWash", "mistStage", "hairMass") if k in ev}
json.dump(keep, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''


def run_cut(tag, shot, cut):
    out_dir = tempfile.mkdtemp(prefix=f"p133-{tag}-")
    job = os.path.join(out_dir, "job.json")
    payload = {
        "shot": dict(shot),
        "scene": {"number": 1, "title": "probe133", "fogDensity": 0.45,
                  "lightningIntensity": 0.3, "energyIntensity": 0.6,
                  "cameraDistance": 1.0, "rimLightIntensity": 0.5},
        "project": {"title": "probe133", "visualStyle": "DONGHUA",
                    "resolution": "960x540", "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe133-{tag}", "payload": payload, "outDir": out_dir}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    env = dict(os.environ, PROBE_CUT=cut)
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=2400, env=env)
    st = json.load(open(job))
    mp4 = st.get("mp4Path")
    ok = bool(mp4) and os.path.exists(mp4)
    print(f"[{tag} / {cut}] clip={ok} -> {mp4}", flush=True)
    if not ok:
        print((r.stderr or r.stdout)[-800:], flush=True)
        return None
    pngs = sorted(f for f in os.listdir(out_dir) if f.endswith(".png"))
    mid = os.path.join(OUT, f"{tag}.png")
    if pngs:
        subprocess.run(["cp", os.path.join(out_dir, pngs[len(pngs) // 2]), mid], check=False)
    else:
        subprocess.run(["ffmpeg", "-y", "-i", mp4, "-vf", "select=eq(n\\,2)", "-vframes", "1", mid],
                       capture_output=True, timeout=120)
    state = {}
    sp = os.path.join(out_dir, "cut-state.json")
    if os.path.exists(sp):
        state = json.load(open(sp))
    print(f"    frame -> {mid}", flush=True)
    return {"state": state, "frame": mid}


def head_span(png, x0=0.40, x1=0.60, y0=0.02, y1=0.75):
    """The head's pixel span at the frame's center band: scan rows,
    a row is FIGURE when its avg departs the sky's avg by >90 (the
    honest crop law - the 132 zoom lesson: measure the head's own
    pixels, not a guessed box)."""
    try:
        from PIL import Image
        im = Image.open(png).convert("RGB")
        w, h = im.size
        skybox = im.crop((int(w * 0.05), int(h * 0.03), int(w * 0.22), int(h * 0.20)))
        sp = list(skybox.getdata())
        sky = tuple(round(sum(p[i] for p in sp) / len(sp)) for i in range(3)) if sp else (128, 128, 128)
        rows = []
        for yy in range(int(h * y0), int(h * y1)):
            band = im.crop((int(w * x0), yy, int(w * x1), yy + 1))
            px = list(band.getdata())
            avg = tuple(sum(p[i] for p in px) / len(px) for i in range(3))
            d = sum(abs(avg[i] - sky[i]) for i in range(3))
            rows.append((yy, d))
        fig = [yy for yy, d in rows if d > 90]  # sum-abs over 3 channels
        if not fig:
            return {"skyAvg": sky, "figureRows": 0}
        # the FIRST contiguous figure run from the top = the head band
        runs, cur = [], [fig[0]]
        for yy in fig[1:]:
            if yy - cur[-1] <= 3:
                cur.append(yy)
            else:
                runs.append(cur); cur = [yy]
        runs.append(cur)
        top = max(runs, key=len)
        return {"skyAvg": sky, "figureRows": len(fig),
                "headSpanPx": len(top), "headTopRow": top[0], "rowsTotal": h}
    except Exception as exc:  # noqa: BLE001
        return {"refused": str(exc)[:140]}


def robe_read(png, x0, y0, x1, y1):
    """The robe crop's chroma read vs the dye's own (#1f5c5c: HSV
    h 0.499, s 0.664, v 0.361)."""
    try:
        from PIL import Image
        import colorsys
        im = Image.open(png).convert("RGB")
        w, h = im.size
        box = im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
        px = list(box.getdata())
        n = len(px)
        avg = tuple(round(sum(p[i] for p in px) / n) for i in range(3))
        hh, ss, vv = colorsys.rgb_to_hsv(*[c / 255 for c in avg])
        return {"avg": avg, "hsv": [round(hh, 3), round(ss, 3), round(vv, 3)], "n": n}
    except Exception as exc:  # noqa: BLE001
        return {"refused": str(exc)[:140]}


def zoom(png, name, x0, y0, x1, y1):
    try:
        from PIL import Image
        im = Image.open(png).convert("RGB")
        w, h = im.size
        box = im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
        box.resize((box.width * 4, box.height * 4), Image.NEAREST).save(
            os.path.join(OUT, f"zoom-{name}.png"))
    except Exception as exc:  # noqa: BLE001
        print(f"    zoom refused: {exc}", flush=True)


ALL_CUTS = [
    ("A1-medium-control", "S002", "control"),
    ("A2-medium-waistup", "S002", "waistup"),
    ("B1-lowangle-control", "S005", "control"),
    ("B2-lowangle-washoff", "S005", "washoff"),
    ("B3-lowangle-keepup", "S005", "keepup"),
    ("B4-lowangle-compoff", "S005", "compoff"),
]
SHOT_OF = {"S002": S002, "S005": S005}


def main():
    os.makedirs(OUT, exist_ok=True)
    results = {}
    rpath = os.path.join(OUT, "probe133-results.json")
    if os.path.exists(rpath):
        try:
            results = json.load(open(rpath))
        except Exception:  # noqa: BLE001
            results = {}
    only = [c for c in os.environ.get("PROBE_CUTS", "").split(",") if c]
    cuts = [c for c in ALL_CUTS if (not only or c[0] in only or c[2] in only)]
    print(f"== PROBE 133 cuts: {[c[0] for c in cuts]} ==", flush=True)
    for tag, shot, cut in cuts:
        if tag in results:
            print(f"   {tag}: already measured, skipped", flush=True)
            continue
        run_one(tag, SHOT_OF[shot], cut, results, rpath)
    print(f"\nPROBE DONE: frames in {OUT}", flush=True)


def run_one(tag, shot, cut, results, rpath):
    print(f"== {tag} / {cut} ==", flush=True)
    got = run_cut(tag, shot, cut)
    if not got:
        results[tag] = {"refused": True}
        json.dump(results, open(rpath, "w"), indent=1, default=str)
        return
    if tag.startswith("A"):
        pres = got["state"].get("presence") or {}
        print(f"    presence: {json.dumps(pres)[:240]}", flush=True)
        span = head_span(got["frame"])
        print(f"    head span: {json.dumps(span)}", flush=True)
        zoom(got["frame"], tag, 0.30, 0.02, 0.70, 0.70)
        results[tag] = {"presence": pres, "headSpan": span}
    else:
        ev = got["state"]
        wash = ev.get("paletteWash") or {}
        exc_ = (ev.get("look") or {}).get("gradeExemption")
        print(f"    wash: {json.dumps(wash)} | exemption: {json.dumps(exc_)[:160]}", flush=True)
        torso = robe_read(got["frame"], 0.36, 0.28, 0.64, 0.68)
        skirt = robe_read(got["frame"], 0.34, 0.55, 0.66, 0.88)
        print(f"    torso: {json.dumps(torso)}", flush=True)
        print(f"    skirt: {json.dumps(skirt)}", flush=True)
        zoom(got["frame"], tag, 0.28, 0.15, 0.72, 0.90)
        results[tag] = {"wash": wash, "exemption": exc_, "torso": torso, "skirt": skirt}
    json.dump(results, open(rpath, "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
