#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 136) - the 135 night's remnant:
the framings where the trim owns FEW texels still read it flat.
S001's establishing ('lack the intricate embroidery', wardrobe 40)
and S006-Wei's pair ('the wardrobe lacks the gold trim of the model
sheet'). The eye's own arithmetic: the sash strap at the establishing
is ~4px wide - the 21.0 stitch's ~10 alternations alias into one mean
tone; the strap reads smooth. The boldness rung candidate: the stitch
COARSENS at the wide-end framings and the thread rides farther.

The series (each cut patches ONE pair of knobs on the honest payload,
the 131 standing law otherwise untouched):

  A1-est-stand    the standing law (stitch 21.0, strength 0.55)
  B1-est-s10      stitch -> 10.5 (half the frequency)
  B2-est-s7       stitch -> 7.0 (a third)
  B3-est-s10-k75  stitch 10.5 + strength 0.75
  B4-est-s7-k75   stitch 7.0 + strength 0.75
  W6-s006-bold    the winner's numbers on S006's REAL pair payload
                  (Lin + Wei, the honest DNA palettes)

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender \
     python3 scripts/probe-136-boldness.py
(the detached supervisor law: every cut that finishes lands in
probe136-results.json and a restart resumes from there)
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe136")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

# THE HONEST PAYLOADS: the committed designSpecs byte-exact (the 132
# probe's lesson), identical to probe-135's Lin; Wei carries his
# committed 518-char spec + his sheet-DNA palette (the drain's own
# source - src/lib/engine/render.ts reads the DNA for the cast).
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

WEI_SPEC = {"body": {"gender": "male", "build": "lean", "shoulders": 1.2, "hips": 0.95, "bust": 0.05, "headScale": 0.95},
            "face": {"shape": "angular", "jawTaper": 0.7, "chinFwd": 0.02, "cheek": 0.9},
            "eyes": {"size": 0.8, "tilt": -0.3, "color": "#1a1a2e", "shape": "sharp", "lashes": 0.6},
            "brows": {"thickness": 1.25, "arch": 0.4},
            "mouth": {"width": 0.85, "color": "#4a3728"},
            "hair": {"style": "topknot", "length": 0.95, "bangs": "parted", "volume": 1.15, "color": "#5f9ea0", "accessory": "pin"},
            "outfit": {"type": "hanfu", "length": 1, "sleeves": "bell", "collar": "crossed", "sash": True}}
WEI = {"name": "Demon Lord Wei", "hairStyle": "topknot", "hairColor": "#1a1a1a",
       "robeColor": "#1e2a3a", "robeAccent": "#c5a059", "skinTone": "#e8d4c0",
       "weaponType": "none", "designSpec": WEI_SPEC}

# S001's REAL shot record (the DB row, byte-faithful) at the REAL
# night resolution (the establishing preview rides the 1024 cap - the
# night's own clip is 1024x576).
S001 = {"number": 1,
        "description": "Establishing shot - Azure Mountain summit, temple ruin in the storm, clouds churning below the peak; Lin Yue a lone figure on the summit path",
        "shotType": "ESTABLISHING", "lens": "24mm", "movement": "CRANE",
        "lighting": "Moonlight + storm clouds", "duration": 0.5,
        "cast": [LIN]}
# S006's REAL pair payload (WIDE, the 640 cap - the night's 640x360).
S006 = {"number": 6,
        "description": "Impact - first clash, Lin Yue and Demon Lord Wei collide under the broken roof, lightning detonates through it, debris suspended mid-air",
        "shotType": "WIDE", "lens": "28mm", "movement": "STATIC",
        "lighting": "Lightning detonation", "duration": 0.5,
        "cast": [LIN, WEI]}

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

# ── THE CUTS (each previews exactly one boldness shape) ──
cut = os.environ.get("PROBE_CUT", "stand")
if cut.endswith("-s10"):
    tp.EMBROIDERY_STITCH = 10.5
elif cut.endswith("-s7"):
    tp.EMBROIDERY_STITCH = 7.0
elif cut.endswith("-s10-k75"):
    tp.EMBROIDERY_STITCH = 10.5
    tp.EMBROIDERY_STRENGTH = 0.75
elif cut.endswith("-s7-k75") or cut.endswith("-bold"):
    # "-bold" = the eye's winner (the B4 shape): stitch 7.0 + strength 0.75
    tp.EMBROIDERY_STITCH = 7.0
    tp.EMBROIDERY_STRENGTH = 0.75
# "stand" rides the LANDED 131 law untouched (the flat receipt itself)

m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
look = ev.get("look") or {}
trim_ev = {k: look.get(k) for k in ("lawVersion", "embroideryRung", "painterlyRung") if k in look}
json.dump(trim_ev, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''


def run_cut(tag, shot, cut, res):
    out_dir = tempfile.mkdtemp(prefix=f"p136-{tag}-")
    job = os.path.join(out_dir, "job.json")
    payload = {
        "shot": dict(shot),
        "scene": {"number": 1, "title": "probe136", "fogDensity": 0.45,
                  "lightningIntensity": 0.3, "energyIntensity": 0.6,
                  "cameraDistance": 1.0, "rimLightIntensity": 0.5},
        "project": {"title": "probe136", "visualStyle": "DONGHUA",
                    "resolution": res, "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe136-{tag}", "payload": payload, "outDir": out_dir}, fh)
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
    """The trim crop's chroma + a column-lum profile spread. At the
    wide framings the strap is 3-6px - the spread reads the strap's
    own modulation only if the stitch resolves; the honest arbiter is
    the zoom (the 135 lesson: the zooms carried the read)."""
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
        cols = []
        bw, bh = box.size
        for cx in range(0, bw, 1):
            col = [box.getpixel((cx, cy)) for cy in range(0, bh, 1)]
            lum = sum(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] for p in col) / len(col)
            cols.append(lum)
        mean = sum(cols) / len(cols) if cols else 0.0
        var = sum((c - mean) ** 2 for c in cols) / len(cols) if cols else 0.0
        return {"avg": avg, "hsv": [round(hh, 3), round(ss, 3), round(vv, 3)],
                "colLumSpread": round(max(cols) - min(cols), 1) if cols else 0.0,
                "colLumStd": round(var ** 0.5, 2) if cols else 0.0, "n": n}
    except Exception as exc:  # noqa: BLE001
        return {"refused": str(exc)[:140]}


def zoom(png, name, x0, y0, x1, y1, k=8):
    try:
        from PIL import Image
        im = Image.open(png).convert("RGB")
        w, h = im.size
        box = im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
        box.resize((box.width * k, box.height * k), Image.NEAREST).save(
            os.path.join(OUT, f"zoom-{name}.png"))
    except Exception as exc:  # noqa: BLE001
        print(f"    zoom refused: {exc}", flush=True)


# the sash X crop (the eye's own boxes on the night frames: the strap
# rides x 0.30-0.42, y 0.40-0.62 at the establishing; S006's two
# figures ride their own boxes)
SASH_OF = {
    "S001": (0.295, 0.38, 0.43, 0.64),
    "S006-LIN": (0.12, 0.33, 0.31, 0.85),
    "S006-WEI": (0.66, 0.33, 0.80, 0.85),
}
ALL_CUTS = [
    ("A1-est-stand", "S001", "stand", "1024x576"),
    ("B1-est-s10", "S001", "est-s10", "1024x576"),
    ("B2-est-s7", "S001", "est-s7", "1024x576"),
    ("B3-est-s10-k75", "S001", "est-s10-k75", "1024x576"),
    ("B4-est-s7-k75", "S001", "est-s7-k75", "1024x576"),
    ("W6-s006-bold", "S006", "s006-bold", "640x360"),
]
SHOT_OF = {"S001": S001, "S006": S006}


def main():
    os.makedirs(OUT, exist_ok=True)
    results = {}
    rpath = os.path.join(OUT, "probe136-results.json")
    if os.path.exists(rpath):
        try:
            results = json.load(open(rpath))
        except Exception:  # noqa: BLE001
            results = {}
    only = [c for c in os.environ.get("PROBE_CUTS", "").split(",") if c]
    cuts = [c for c in ALL_CUTS if (not only or c[0] in only or c[2] in only)]
    print(f"== PROBE 136 cuts: {[c[0] for c in cuts]} ==", flush=True)
    for tag, shot, cut, res in cuts:
        if tag in results:
            print(f"   {tag}: already measured, skipped", flush=True)
            continue
        run_one(tag, SHOT_OF[shot], cut, res, results, rpath)
    print(f"\nPROBE DONE: frames in {OUT}", flush=True)


def run_one(tag, shot, cut, res, results, rpath):
    print(f"== {tag} / {cut} @ {res} ==", flush=True)
    got = run_cut(tag, shot, cut, res)
    if not got:
        results[tag] = {"refused": True}
        json.dump(results, open(rpath, "w"), indent=1, default=str)
        return
    ev = got["state"]
    er = ev.get("embroideryRung")
    pw = ev.get("painterlyRung")
    lv = ev.get("lawVersion")
    print(f"    law={lv} | embroideryRung: {json.dumps(er)[:200]}", flush=True)
    print(f"    painterlyRung: {json.dumps(pw)[:140]}", flush=True)
    entry = {"law": lv, "embroideryRung": er, "painterlyRung": pw}
    if tag.startswith("W6"):
        for who in ("S006-LIN", "S006-WEI"):
            box = SASH_OF[who]
            rd = trim_read(got["frame"], *box)
            print(f"    {who} read: {json.dumps(rd)}", flush=True)
            zoom(got["frame"], f"{tag}-{who}", *box, k=6)
            entry[who] = rd
    else:
        box = SASH_OF["S001"]
        rd = trim_read(got["frame"], *box)
        print(f"    sash read: {json.dumps(rd)}", flush=True)
        zoom(got["frame"], tag, *box, k=8)
        entry["sash"] = rd
    results[tag] = entry
    json.dump(results, open(rpath, "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
