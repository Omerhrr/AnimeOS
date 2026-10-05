#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 134, act two) - the beauty mark's
OWNER. The C-series refuted every paint knob: the mark (two diagonal
dashes on the viewer-left cheek, x299-304 / y106-111 at 640x360,
color class (29,34,60) = the hair-ink blue-dark, NOT lash ink, NOT
skin shadow) survives male-eye, male-brow, clear-locks, no-flick,
no-low and the decal lift. The hull ink is the remaining suspect:
ANIMEOS_INK defaults to hull - every render mesh grows a shell pushed
out by ink_offset_for (at the MEDIUM's 1.3m/50mm/640px that is
~0.00205) whose BACKFACING faces emit INK_HEX. The head's sculpted
socket rim is a shallow relief - its shell pokes through the cheek
and its backfacing sliver reads as a dash. The decal planes are
NoInk (they cannot own it), the locks moved out 0.016 with the dash
unmoved (they cannot own it). The bisect:

  D1 ink-off       (ANIMEOS_INK=off - the dash should DIE if ink owns it)
  D2 noink-head    (HeadMesh excluded from the hull - the head shell's own share)
  D3 noink-hair    (HairCap + SideLock* excluded - the hair shells' share)
  D4 freestyle     (the screen-space ink path - the dash's shape there
                    names the hull sliver for what it is)

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender python3 -u
scripts/probe-134-markink.py   (detached via detached-ops.mjs; each
finished cut lands in probe134-dresults.json and a restart resumes)"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe134")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

# THE HONEST PAYLOAD (byte-exact with the C-probe and the 133 night).
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

# ── THE INK KNOBS ──
ink = os.environ.get("PROBE_INK", "hull")
noin = [s for s in os.environ.get("PROBE_NOINK", "").split(",") if s]

if ink != "hull":
    os.environ["ANIMEOS_INK"] = ink

if noin:
    import toon_pass as _tp
    _orig_look = _tp.apply_look

    def _noin_look(bpy_, scn_, *a, **kw):
        coll = bpy_.data.collections.get("AnimeOSNoInk")
        if coll is None:
            coll = bpy_.data.collections.new("AnimeOSNoInk")
        added = []
        for ob in scn_.objects:
            if ob.name in noin or any(ob.name.startswith(p) for p in noin):
                if ob.name not in coll.objects:
                    coll.objects.link(ob)
                    added.append(ob.name)
        print(f"[noin] excluded from the hull ink: {added}", flush=True)
        return _orig_look(bpy_, scn_, *a, **kw)

    _tp.apply_look = _noin_look

m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
lk = ev.get("look") or {}
keep = {"presence": ev.get("presence"),
        "ink": lk.get("ink"), "inkShells": lk.get("inkShells"),
        "inkOffset": lk.get("inkOffset"), "lawVersion": lk.get("lawVersion")}
json.dump(keep, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''


def run_cut(tag, shot, knobs):
    out_dir = tempfile.mkdtemp(prefix=f"d134-{tag}-")
    job = os.path.join(out_dir, "job.json")
    payload = {
        "shot": dict(shot),
        "scene": {"number": 1, "title": "probe134d", "fogDensity": 0.45,
                  "lightningIntensity": 0.3, "energyIntensity": 0.6,
                  "cameraDistance": 1.0, "rimLightIntensity": 0.5},
        "project": {"title": "probe134d", "visualStyle": "DONGHUA",
                    "resolution": "960x540", "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe134d-{tag}", "payload": payload, "outDir": out_dir}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    env = dict(os.environ, PROBE_INK=knobs.get("ink", "hull"),
               PROBE_NOINK=knobs.get("noin", ""))
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=2400, env=env)
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
    """THE MARK BOX: dark px (lum<=70) inside x284-304, y106-126 (the
    C0 mark's home) + the same box mirrored on the right cheek
    (x336-356) as the control side."""
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


ALL_CUTS = [
    ("D1-ink-off", {"ink": "off"}),
    ("D2-noink-head", {"noin": "HeadMesh"}),
    ("D3-noink-hair", {"noin": "HairCap,SideLock"}),
    ("D4-freestyle", {"ink": "freestyle"}),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    results = {}
    rpath = os.path.join(OUT, "probe134-dresults.json")
    if os.path.exists(rpath):
        try:
            results = json.load(open(rpath))
        except Exception:  # noqa: BLE001
            results = {}
    only = [c for c in os.environ.get("PROBE_CUTS", "").split(",") if c]
    cuts = [c for c in ALL_CUTS if (not only or c[0] in only)]
    print(f"== PROBE 134-D cuts: {[c[0] for c in cuts]} ==", flush=True)
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
        print(f"    state: {json.dumps(got['state'])[:220]}", flush=True)
        zoom(got["frame"], f"{tag}-mark", 0.405, 0.245, 0.505, 0.395, k=10)
        zoom(got["frame"], f"{tag}-face", 0.40, 0.16, 0.60, 0.44, k=5)
        results[tag] = {"knobs": knobs, "mark": mr, "state": got["state"]}
        json.dump(results, open(rpath, "w"), indent=1, default=str)
    print(f"\nPROBE DONE: frames in {OUT}", flush=True)


if __name__ == "__main__":
    main()
