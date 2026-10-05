#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 134, act four) - the beauty
mark's owner, after the paint, the ink, the locks, the decals, the
light and the tier all stood refuted:

  C-series (probe-134-facegender): the mark rides male-eye, no-flick,
      clear-locks, male-brow, no-low and the decal lift - one blob,
      cx 24.7 in the cheek crop, EVERY cut.
  D-series (probe-134-markink): the mark rides ink-off (D1: hull
      shells 0), head-shell-out (D2) and hair-shells-out (D3) - the
      ink is NOT the owner. D4-freestyle refused (the env value is
      not a legal ink mode). HONEST RECEIPT: the D/E numeric mark
      boxes (x284-356, y106-126) are 640x360-scale coords pasted onto
      960x540 frames - they measured hair mass up-left of the face
      and never discriminated; the zooms carried the read.
  E-series (probe-134-socket): the mark rides the key flip (E1: a
      relief-owned dash swaps cheeks - it did not), the fill boost
      (E3) and the hero carve + bake-down (E2: head_depth 5, the
      dash unmoved) - shading and tier are NOT the owner. The bake
      cache stands EMPTY (public/headbake: .gitkeep only) - every
      cut here rides the unbaked depth-4 standing the 133 night
      judged.

What REMAINS at the mark's spot (frame (428,172) at 960x540 - the
upper cheek in front of the ear, below eye level, inboard of the
face edge): HAIR GEOMETRY whose dark toon band survives every
refuted knob - the HairCap's SIDE RIM (the sideburn: the cap's front
edge drops to the brow line, its side ring runs down past the ear,
and a jagged terminal ring against the cheek reads as a dash) or the
outermost parted BANG tip (u=-1 roots at the temple, curl 0.3*u).
The bisect (each a real worker_run on the honest S002 waist-up
MEDIUM, measured by the C-probe's honest crop-fraction detector):

  F1-bangs-none   (hair.bangs=none - bang_n 0, the Bang meshes are
                   never built; the cap + locks stand)
  F2-hide-cap     (HairCap hidden at the look hook - the bangs +
                   locks stand; the DIRECT cap accusation)
  F3-hide-hair    (every hair mesh hidden - the bare head; if the
                   dash still rides here it is skin/ear and the
                   next probe hunts the head itself)

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender python3 -u
scripts/probe-134-sideburn.py   (detached via detached-ops.mjs; each
finished cut lands in probe134-fresults.json and a restart resumes)"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe134")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

# THE HONEST PAYLOAD (byte-exact with the C/D/E probes and the 133 night).
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

# ── THE HAIR-HIDE HOOK (the look pass runs post-build, pre-ink: the
#    D-series' noin trick proved the timing) ──
hide = [s for s in os.environ.get("PROBE_HIDE", "").split(",") if s]
if hide:
    import toon_pass as _tp
    _orig_look = _tp.apply_look

    def _hide_look(bpy_, scn_, *a, **kw):
        killed = []
        for ob in scn_.objects:
            if any(ob.name.startswith(p) for p in hide):
                ob.hide_render = True
                try:
                    ob.hide_viewport = True
                except Exception:  # noqa: BLE001
                    pass
                killed.append(ob.name)
        print(f"[hide] {len(killed)} objects hidden: {killed}", flush=True)
        return _orig_look(bpy_, scn_, *a, **kw)

    _tp.apply_look = _hide_look

m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
an = ev.get("anime") or {}
keep = {"presence": ev.get("presence"),
        "animeLaw": an.get("lawVersion"),
        "look": {k: (ev.get("look") or {}).get(k) for k in ("lawVersion", "ink", "inkShells", "inkOffset")}}
json.dump(keep, open(os.path.dirname(job) + "/cut-state.json", "w"), indent=1, default=str)
'''


def run_cut(tag, shot, cast, knobs):
    out_dir = tempfile.mkdtemp(prefix=f"f134-{tag}-")
    job = os.path.join(out_dir, "job.json")
    payload = {
        "shot": dict(shot),
        "scene": {"number": 1, "title": "probe134f", "fogDensity": 0.45,
                  "lightningIntensity": 0.3, "energyIntensity": 0.6,
                  "cameraDistance": 1.0, "rimLightIntensity": 0.5},
        "project": {"title": "probe134f", "visualStyle": "DONGHUA",
                    "resolution": "960x540", "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe134f-{tag}", "payload": payload, "outDir": out_dir}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    env = dict(os.environ, PROBE_HIDE=knobs.get("hide", ""))
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


def _clusters(px_mask, min_px=3, max_px=90):
    """4-connected blob walk over a boolean mask -> list of (area, w, h, cx, cy)."""
    seen = set()
    out = []
    H, W = px_mask.shape
    for sy in range(H):
        for sx in range(W):
            if not px_mask[sy, sx] or (sy, sx) in seen:
                continue
            stack = [(sy, sx)]
            seen.add((sy, sx))
            pts = []
            while stack:
                cy_, cx_ = stack.pop()
                pts.append((cy_, cx_))
                for dy_, dx_ in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny_, nx_ = cy_ + dy_, cx_ + dx_
                    if 0 <= ny_ < H and 0 <= nx_ < W and px_mask[ny_, nx_] and (ny_, nx_) not in seen:
                        seen.add((ny_, nx_))
                        stack.append((ny_, nx_))
            if len(pts) < min_px:
                continue
            ys = [p[0] for p in pts]
            xs = [p[1] for p in pts]
            out.append({"area": len(pts), "w": max(xs) - min(xs) + 1, "h": max(ys) - min(ys) + 1,
                        "cx": round(sum(xs) / len(pts), 1), "cy": round(sum(ys) / len(pts), 1)})
    return [c for c in out if c["area"] <= max_px]


def face_read(png):
    """THE HONEST DETECTOR (the C-probe's, verbatim): skin rows 72-131,
    eye band rows 88-107, face cols 279-348 at 640x360 - boxes are
    frame fractions, deterministic across cuts and resolutions. marks:
    small non-elongated dark blobs on the cheek band (the mouth+nose
    box excluded by x-range); the mark's standing receipt is cx 24.7
    in the cheek crop, area 9-10, w 4, h 5-6."""
    try:
        import numpy as np
        from PIL import Image
        im = Image.open(png).convert("RGB")
        w, h = im.size
        g = im.convert("L")
        eye_band = g.crop((int(w * 0.42), int(h * 0.23), int(w * 0.565), int(h * 0.315)))
        eb = np.asarray(eye_band, dtype=np.uint8) <= 62
        bh, bw = eb.shape
        halves = {}
        for side, sl in (("L", slice(0, bw // 2)), ("R", slice(bw // 2, bw))):
            half = eb[:, sl]
            cl = _clusters(half.copy())
            cl.sort(key=lambda c: -c["area"])
            big = cl[0] if cl else None
            halves[side] = {"darkPx": int(half.sum()),
                            "frac": round(float(half.mean()), 4),
                            "topW": big["w"] if big else 0,
                            "topH": big["h"] if big else 0}
        x0, x1 = int(w * 0.42), int(w * 0.585)
        cheek = g.crop((x0, int(h * 0.315), x1, int(h * 0.40)))
        cb = np.asarray(cheek, dtype=np.uint8) <= 70
        mw0 = int(w * 0.465) - x0
        mw1 = int(w * 0.515) - x0
        cb[:, mw0:mw1] = False
        blobs = _clusters(cb)
        marks = [b for b in blobs if b["w"] <= 14 and b["h"] <= 16 and b["area"] >= 3]
        strands = [b for b in blobs if b["h"] > max(3, 2.5 * b["w"])]
        return {"eyeBandPx": [bw, bh], "eyes": halves,
                "marks": len(marks), "markDetail": marks[:4],
                "strandCols": len(strands)}
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


def _cast_with_bangs(bangs):
    lin = json.loads(json.dumps(LIN))
    lin["designSpec"] = json.loads(json.dumps(LIN_SPEC))
    lin["designSpec"]["hair"]["bangs"] = bangs
    return [lin]


ALL_CUTS = [
    ("F1-bangs-none", {"cast": _cast_with_bangs("none"), "knobs": {}}),
    ("F2-hide-cap", {"cast": [LIN], "knobs": {"hide": "HairCap"}}),
    ("F3-hide-hair", {"cast": [LIN],
                      "knobs": {"hide": "HairCap,Bang,SideLock,BackSweep,BackClump,HairTail,HairBun,HairPin"}}),
    # ── THE LAW CUTS (the sideburn tuck landed in the bridge; the same
    #    honest payload re-renders ON the law - the cap STANDS here, so
    #    a dead mark convicts nothing else: the tuck is the owner's
    #    sentence) ──
    ("G1-sideburn-law", {"cast": [LIN], "knobs": {}}),
]

G_WIDE_SHOT = dict(S002, shotType="WIDE", lens="35mm", movement="PAN")

ALL_CUTS.append(("G2-wide-nape", {"cast": [LIN], "knobs": {}, "shot": G_WIDE_SHOT}))


def main():
    os.makedirs(OUT, exist_ok=True)
    results = {}
    rpath = os.path.join(OUT, "probe134-fresults.json")
    if os.path.exists(rpath):
        try:
            results = json.load(open(rpath))
        except Exception:  # noqa: BLE001
            results = {}
    only = [c for c in os.environ.get("PROBE_CUTS", "").split(",") if c]
    cuts = [c for c in ALL_CUTS if (not only or c[0] in only)]
    print(f"== PROBE 134-F cuts: {[c[0] for c in cuts]} ==", flush=True)
    for tag, cfg in cuts:
        if tag in results and not results[tag].get("refused"):
            print(f"   {tag}: already measured, skipped", flush=True)
            continue
        print(f"== {tag} / knobs={cfg['knobs']} ==", flush=True)
        got = run_cut(tag, cfg.get("shot", S002), cfg["cast"], cfg["knobs"])
        if not got:
            results[tag] = {"refused": True}
            json.dump(results, open(rpath, "w"), indent=1, default=str)
            continue
        fr = face_read(got["frame"])
        print(f"    face: {json.dumps(fr)}", flush=True)
        print(f"    state: {json.dumps(got['state'])[:260]}", flush=True)
        zoom(got["frame"], f"{tag}-mark", 0.41, 0.25, 0.48, 0.37, k=12)
        zoom(got["frame"], f"{tag}-face", 0.40, 0.16, 0.60, 0.44, k=5)
        results[tag] = {"knobs": cfg["knobs"], "face": fr, "state": got["state"]}
        json.dump(results, open(rpath, "w"), indent=1, default=str)
    print(f"\nPROBE DONE: frames in {OUT}", flush=True)


if __name__ == "__main__":
    main()
