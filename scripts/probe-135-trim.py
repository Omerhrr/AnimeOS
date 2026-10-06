#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 135) - the 134 night's named
ceiling: the MEDIUM's own trim. The judge's words: 'a flat teal shape
without gold embroidery' (S003, the closeup - wardrobe 20) and
S002's wardrobe 40 at the waist-up MEDIUM. The 128 embroidery rung
wrote the weave INSIDE the painterly block, so the trim reads FLAT
PAINT at exactly the framings where the trim owns texels. The law
moved (TOON 131): the weave owns its own scope table
(TRIM_WEAVE_BY_SHOT) and rides WITHOUT the brush. The probe reads
the truth at the node level and on real renders:

  A1 S002 MEDIUM control     (the weave table emptied - the 130 shape)
  A2 S002 MEDIUM weave       (the landed table - the weave, no brush)
  B1 S002 MEDIUM weave+960   (the weave AND the texel route: a 960
                              preview rung for the MEDIUM framing)
  C1 S002 CLOSEUP control    (the 130 shape at the earned close look)
  C2 S002 CLOSEUP weave      (the weave at the closeup - the 121 hard
                              bands stand, the interiors weave)

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender \
     python3 scripts/probe-135-trim.py
(the detached supervisor law: every cut that finishes lands in
probe135-results.json and a restart resumes from there)
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe135")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

# THE HONEST PAYLOAD: the committed designSpec byte-exact (the 132
# probe's lesson), identical to probe-133/134's S002 payload.
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

S002 = {"number": 2, "description": "Lin Yue enters the temple, robes whipping in the wind, rain trailing off his shoulders",
        "shotType": "MEDIUM", "lens": "35mm", "movement": "TRACKING",
        "lighting": "Backlight + interior shadows", "duration": 0.5,
        "cast": [LIN]}
S002C = dict(S002, shotType="CLOSEUP", lens="85mm")

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
if cut.endswith("-control"):
    # THE STANDING SHAPE (iteration 130): the weave table emptied -
    # the weave rides the painterly wide-end framings only
    tp.TRIM_WEAVE_BY_SHOT = {}
elif cut.endswith("-weave960"):
    # THE TEXEL ROUTE PREVIEW: a 960 rung for the MEDIUM framing
    _real_cap = m.preview_cap_for
    def _cap960(shot_type, mode):
        if str(mode or "PREVIEW").upper() != "FINAL" and str(shot_type or "").upper() == "MEDIUM":
            return 960
        return _real_cap(shot_type, mode)
    m.preview_cap_for = _cap960
# the weave cuts ride the LANDED table (MEDIUM/CLOSEUP 1.0) as-is

m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
keep = {k: ev.get(k) for k in ("look", "presence") if k in ev}
look = keep.get("look") or {}
trim_ev = {k: look.get(k) for k in ("lawVersion", "embroideryRung", "painterlyRung", "hairMass") if k in look}
json.dump(trim_ev, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''


def run_cut(tag, shot, cut):
    out_dir = tempfile.mkdtemp(prefix=f"p135-{tag}-")
    job = os.path.join(out_dir, "job.json")
    payload = {
        "shot": dict(shot),
        "scene": {"number": 1, "title": "probe135", "fogDensity": 0.45,
                  "lightningIntensity": 0.3, "energyIntensity": 0.6,
                  "cameraDistance": 1.0, "rimLightIntensity": 0.5},
        "project": {"title": "probe135", "visualStyle": "DONGHUA",
                    "resolution": "960x540", "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe135-{tag}", "payload": payload, "outDir": out_dir}, fh)
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
    return {"state": state, "frame": mid, "outDir": out_dir}


def trim_read(png, x0, y0, x1, y1):
    """The trim crop's chroma + a COLUMN-lum profile spread (the stitch
    wave's constant steps read as bounded vertical variation; a flat
    band reads ~zero). The gold accent dye #c4b454: HSV h 0.128."""
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
        # column profile: per-column mean lum, then the spread
        cols = []
        bw, bh = box.size
        for cx in range(0, bw, 2):
            col = [box.getpixel((cx, cy)) for cy in range(0, bh, 2)]
            lum = sum(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] for p in col) / len(col)
            cols.append(lum)
        spread = (max(cols) - min(cols)) if cols else 0.0
        return {"avg": avg, "hsv": [round(hh, 3), round(ss, 3), round(vv, 3)],
                "colLumSpread": round(spread, 1), "n": n}
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
    ("A1-medium-control", "S002", "medium-control"),
    ("A2-medium-weave", "S002", "medium-weave"),
    ("B1-medium-weave960", "S002", "medium-weave960"),
    ("C1-closeup-control", "S002C", "closeup-control"),
    ("C2-closeup-weave", "S002C", "closeup-weave"),
]
SHOT_OF = {"S002": S002, "S002C": S002C}


def main():
    os.makedirs(OUT, exist_ok=True)
    results = {}
    rpath = os.path.join(OUT, "probe135-results.json")
    if os.path.exists(rpath):
        try:
            results = json.load(open(rpath))
        except Exception:  # noqa: BLE001
            results = {}
    only = [c for c in os.environ.get("PROBE_CUTS", "").split(",") if c]
    cuts = [c for c in ALL_CUTS if (not only or c[0] in only or c[2] in only)]
    print(f"== PROBE 135 cuts: {[c[0] for c in cuts]} ==", flush=True)
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
    ev = got["state"]
    er = ev.get("embroideryRung")
    pw = ev.get("painterlyRung")
    hm = ev.get("hairMass")
    lv = ev.get("lawVersion")
    print(f"    law={lv} | embroideryRung: {json.dumps(er)[:220]}", flush=True)
    print(f"    painterlyRung: {json.dumps(pw)[:120]} | hairMass: {json.dumps(hm)[:120]}", flush=True)
    is_close = "closeup" in tag
    # the collar/sash crop (the crossed collar + the sash knot ride the
    # frame's mid band at the waist-up rung; the chest fills the closeup)
    zx0, zy0, zx1, zy1 = (0.25, 0.40, 0.75, 1.0) if is_close else (0.34, 0.30, 0.68, 0.88)
    collar = trim_read(got["frame"], zx0, zy0, zx1, zy1)
    print(f"    collar read: {json.dumps(collar)}", flush=True)
    zoom(got["frame"], tag, zx0, zy0, zx1, zy1)
    results[tag] = {"law": lv, "embroideryRung": er, "painterlyRung": pw,
                    "hairMass": hm, "collar": collar}
    json.dump(results, open(rpath, "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
