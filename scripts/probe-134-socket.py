#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 134, act three) - the beauty
mark's owner, after the ink died. The C-series refuted every paint
knob; the D-series refuted the ink (D1 ink-off: the mark rides, L 182
/R 108 dark px; D2 head-shell excluded: rides; D3 hair shells
excluded: rides). The bake cache (public/headbake) is EMPTY - the
MEDIUM's depth-4 head renders UNBAKED, so the cavity-multiply
hypothesis dies too. The remaining owner class: the carved socket's
REAL relief shaded by the side key (HERO_KEY_YAW 35 deg, rise 28),
quantized by the toon bands into a compact dash that reads as a
beauty mark. The bisect (each a real worker_run on the honest S002
waist-up MEDIUM):

  E1 key-flip    (HERO_KEY_YAW + FACE_FILL_YAW signs flipped - a
                  relief-owned mark MOVES to the other cheek)
  E3 fill-boost  (FACE_FILL_SHARE 0.12 -> 0.32 - the shadow side
                  lifts at the light level)
  E2 hero-carve  (groom_strand_factor forced 1.0 -> head_depth 5,
                  the hero carve + the bake-down; the tier test:
                  does the rung's own texel budget deserve the
                  close tier's head?) - LAST, it writes the bake cache.

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender python3 -u
scripts/probe-134-socket.py   (detached via detached-ops.mjs; each
finished cut lands in probe134-eresults.json and a restart resumes)"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe134")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

# THE HONEST PAYLOAD (byte-exact with the C/D probes and the 133 night).
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

RENDER = r'''
import importlib.util, json, os, sys
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-2:]
bridge, job = _tail[0], _tail[1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
here = os.path.dirname(os.path.abspath(bridge))
if here not in sys.path:
    sys.path.insert(0, here)

# ── THE LIGHT/TIER KNOBS ──
if os.environ.get("PROBE_KEYFLIP", "") == "1":
    m.HERO_KEY_YAW = -m.HERO_KEY_YAW
    m.FACE_FILL_YAW = -m.FACE_FILL_YAW
    print(f"[keyflip] yaw {m.HERO_KEY_YAW} fill {m.FACE_FILL_YAW}", flush=True)
_fill = os.environ.get("PROBE_FILL", "")
if _fill:
    m.FACE_FILL_SHARE = float(_fill)
    print(f"[fill] share {m.FACE_FILL_SHARE}", flush=True)
_strandf = os.environ.get("PROBE_STRANDF", "")
if _strandf:
    _v = float(_strandf)
    m.groom_strand_factor = lambda st, _v=_v: _v
    print(f"[strandf] forced {_v}", flush=True)

m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
an = ev.get("anime") or {}
sc = an.get("sculpt") or {}
keep = {"presence": ev.get("presence"),
        "sculptDepth": sc.get("depth"), "sculptPlanes": sc.get("planes"),
        "bake": sc.get("bake"), "wrinkle": sc.get("wrinkle"),
        "look": {k: (ev.get("look") or {}).get(k) for k in ("lawVersion", "ink", "inkOffset")}}
json.dump(keep, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''


def run_cut(tag, shot, knobs):
    out_dir = tempfile.mkdtemp(prefix=f"e134-{tag}-")
    job = os.path.join(out_dir, "job.json")
    payload = {
        "shot": dict(shot),
        "scene": {"number": 1, "title": "probe134e", "fogDensity": 0.45,
                  "lightningIntensity": 0.3, "energyIntensity": 0.6,
                  "cameraDistance": 1.0, "rimLightIntensity": 0.5},
        "project": {"title": "probe134e", "visualStyle": "DONGHUA",
                    "resolution": "960x540", "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe134e-{tag}", "payload": payload, "outDir": out_dir}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    env = dict(os.environ, PROBE_KEYFLIP=knobs.get("keyflip", ""),
               PROBE_FILL=knobs.get("fill", ""),
               PROBE_STRANDF=knobs.get("strandf", ""))
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=3000, env=env)
    st = json.load(open(job))
    mp4 = st.get("mp4Path")
    ok = bool(mp4) and os.path.exists(mp4)
    print(f"[{tag}] clip={ok} -> {mp4}", flush=True)
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


def mark_read(png):
    """THE MARK BOXES: dark px (lum<=70) on both cheeks (the mark's
    home box and its mirror) - a relief-owned mark swaps sides with
    the key; a lifted fill shrinks both."""
    try:
        import numpy as np
        from PIL import Image
        a = np.asarray(Image.open(png).convert("RGB"), dtype=np.int32)
        out = {}
        for name, (x0, x1, y0, y1) in (("L", (284, 304, 106, 126)), ("R", (336, 356, 106, 126))):
            box = a[y0:y1, x0:x1]
            g = box.mean(axis=2)
            dark = g <= 70
            n = int(dark.sum())
            if n:
                px = box[dark]
                out[name] = {"darkPx": n, "avg": [round(float(v), 1) for v in px.mean(axis=0)]}
            else:
                out[name] = {"darkPx": 0}
        return out
    except Exception as exc:  # noqa: BLE001
        return {"refused": str(exc)[:160]}


def zoom(png, name, x0, y0, x1, y1, k=6):
    try:
        from PIL import Image
        im = Image.open(png).convert("RGB")
        w, h = im.size
        box = im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
        box.resize((box.width * k, box.height * k), Image.NEAREST).save(
            os.path.join(OUT, f"zoom-{name}.png"))
    except Exception as exc:  # noqa: BLE001
        print(f"    zoom refused: {exc}", flush=True)


# ORDER MATTERS: E2 (hero carve) writes the bake cache - it rides LAST
# so E1/E3 keep the unbaked standing the 133 night rendered.
ALL_CUTS = [
    ("E1-key-flip", {"keyflip": "1"}),
    ("E3-fill-boost", {"fill": "0.32"}),
    ("E2-hero-carve", {"strandf": "1.0"}),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    results = {}
    rpath = os.path.join(OUT, "probe134-eresults.json")
    if os.path.exists(rpath):
        try:
            results = json.load(open(rpath))
        except Exception:  # noqa: BLE001
            results = {}
    only = [c for c in os.environ.get("PROBE_CUTS", "").split(",") if c]
    cuts = [c for c in ALL_CUTS if (not only or c[0] in only)]
    print(f"== PROBE 134-E cuts: {[c[0] for c in cuts]} ==", flush=True)
    for tag, knobs in cuts:
        if tag in results and not results[tag].get("refused"):
            print(f"   {tag}: already measured, skipped", flush=True)
            continue
        print(f"== {tag} / knobs={knobs} ==", flush=True)
        got = run_cut(tag, S002, knobs)
        if not got:
            results[tag] = {"refused": True}
            json.dump(results, open(rpath, "w"), indent=1, default=str)
            continue
        mr = mark_read(got["frame"])
        print(f"    mark: {json.dumps(mr)}", flush=True)
        print(f"    state: {json.dumps(got['state'])[:260]}", flush=True)
        zoom(got["frame"], f"{tag}-mark", 0.405, 0.245, 0.505, 0.395, k=10)
        zoom(got["frame"], f"{tag}-face", 0.40, 0.16, 0.60, 0.44, k=5)
        results[tag] = {"knobs": knobs, "mark": mr, "state": got["state"]}
        json.dump(results, open(rpath, "w"), indent=1, default=str)
    print(f"\nPROBE DONE: frames in {OUT}", flush=True)


if __name__ == "__main__":
    main()
