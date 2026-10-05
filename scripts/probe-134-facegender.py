#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 134) - the 133 night's frontier
item one: the drawn face's GENDER law at the MEDIUM's own scale. The
waist-up rung broke the texel wall (S002 face reads DRAWN now) and the
judge named the paint: 'a feminine anime style with large eyes and a
beauty mark not present in the canonical male reference'. The eye
read of zoom-A2 confirms three owners on the honest payload:

  (1) THE EYE - the paint_eye draw is shoujo at every spec: the iris
      ellipse runs half-height 0.74 x half-width 0.5 (a tall dark
      mass), TWO catch-lights (big 0.15 + small 0.07), and the upper
      lash FLICK draws at any lashes weight (Lin's 0.5 included).
  (2) THE BROW - no male floor: Lin's 1.25 thickness at arch 0.4
      reads thin and high.
  (3) THE BEAUTY MARK - the SideLock strands (two per side, 0.030
      wide, bowed by STRAND_SWAY_AMP 0.011): the bowed inner surface
      lands ON the cheek edge and a tapered dark tip reads as a mark.

Cuts (each a real worker_run on the honest S002 waist-up MEDIUM -
the exact framing that put the judge's eye on the face):
  C0 control          (the 108 law's face, the 133 night's render)
  C1 male-eye         (iris 0.44/0.58, pupil 0.18/0.30, ONE small
                       catch-light 0.09, the flick gated by lashes)
  C2 no-flick         (only the flick masked - the flick's own share)
  C3 clear-locks      (the SideLock meshes pushed 0.016 outward in
                       head-local - the mark's owner test)
  C4 male-brow        (thickness floor 1.55, arch cap 0.28)
  C5 all-male         (C1 + C3 + C4 - the candidate law render)

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender \
     python3 -u scripts/probe-134-facegender.py
(detached: node scripts/detached-ops.mjs probe134-run -- python3 -u
scripts/probe-134-facegender.py - each finished cut lands in
probe134-results.json and a restart resumes from there)
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe134")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

# THE HONEST PAYLOAD: the committed designSpec byte-exact (the same
# figure the 133 night judged).
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
import numpy as np
import anime_character as ac

# ── THE CUTS (each previews exactly one paint-knob shape) ──
eye = os.environ.get("PROBE_EYE", "control")
brow = os.environ.get("PROBE_BROW", "control")
locks = os.environ.get("PROBE_LOCKS", "control")

# THE ORIGINALS captured before any rebind (the control modes delegate
# here - rebinding ac.paint_eye then calling ac.paint_eye from inside
# the patch recursed the 134 probe's first C4 into the legacy build).
_ORIG_PAINT_EYE = ac.paint_eye
_ORIG_PAINT_BROW = ac.paint_brow


def _paint_eye(spec, size=256, _mode=eye, _orig=_ORIG_PAINT_EYE):
    """Copy of anime_character.paint_eye with the male-eye knobs; the
    control mode rides the original untouched."""
    if _mode == "control":
        return _orig(spec, size)
    S = size
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    u = (x / (S - 1)) * 2.0 - 1.0
    v = 1.0 - (y / (S - 1)) * 2.0
    sharp = spec["eyes"]["shape"] == "sharp"
    rgba = np.zeros((S, S, 4), np.float32)

    def over(mask, col, a=1.0):
        mm = np.clip(mask, 0.0, 1.0)[..., None] * a
        rgba[..., :3] = rgba[..., :3] * (1 - mm) + np.array(col, np.float32) * mm
        rgba[..., 3:4] = rgba[..., 3:4] * (1 - mm) + mm

    def soft(d, w=0.02):
        return np.clip(0.5 - d / w, 0.0, 1.0)

    top = 0.74 - 0.5 * u * u + (0.06 * u if not sharp else 0.14 * u) - (0.12 if sharp else 0.0)
    bot = -0.62 + 0.34 * u * u
    almond = np.minimum(top - v, v - bot)
    almond = np.where(np.abs(u) < 0.95, almond, -1.0)
    over(soft(-almond, 0.03), (0.97, 0.96, 0.95))
    if _mode in ("male", "malenolow"):
        # THE MALE IRIS: narrower and shorter (more sclera reads at
        # distance), the pupil rides the same factor.
        ir = np.sqrt((u / 0.44) ** 2 + ((v + 0.02) / 0.58) ** 2)
    else:
        ir = np.sqrt((u / 0.5) ** 2 + ((v + 0.02) / 0.74) ** 2)
    iris_col = np.array(ac._hex_srgb(spec["eyes"]["color"]), np.float32)
    dark = iris_col * 0.18
    light = np.clip(iris_col * 0.9 + 0.10, 0, 1)
    g = np.clip((v + 0.7) / 0.9, 0, 1)[..., None]
    grad = dark * (1 - g) + light * g
    iris_mask = soft(ir - 1.0, 0.04) * soft(-almond, 0.03)
    mm = iris_mask[..., None]
    rgba[..., :3] = rgba[..., :3] * (1 - mm) + grad * mm
    rim = soft(np.abs(ir - 0.97) - 0.03, 0.02) * soft(-almond, 0.03)
    over(rim, tuple(dark * 0.8))
    if _mode in ("male", "malenolow"):
        pr = np.sqrt((u / 0.18) ** 2 + ((v + 0.02) / 0.30) ** 2)
    else:
        pr = np.sqrt((u / 0.2) ** 2 + ((v + 0.02) / 0.36) ** 2)
    over(soft(pr - 1.0, 0.05) * soft(-almond, 0.03), tuple(dark * 0.5))
    if _mode in ("male", "malenolow"):
        # ONE small catch-light (the shoujo double-glint is the read)
        lights = ((-0.15, 0.28, 0.09),)
    else:
        lights = ((-0.17, 0.3, 0.15), (0.16, -0.3, 0.07))
    for cx, cy, r in lights:
        over(soft(np.sqrt((u - cx) ** 2 + (v - cy) ** 2) - r, 0.03) * soft(-almond, 0.03), (1.0, 1.0, 1.0))
    lash_w = 0.11 * spec["eyes"]["lashes"]
    lash = np.abs(v - top) - lash_w * (1.0 + 0.6 * np.clip(u, 0, 1))
    lash = np.where((u > -0.98) & (u < 0.98), lash, 1.0)
    over(soft(lash, 0.03), (0.10, 0.07, 0.08))
    if _mode == "male":
        # THE FLICK GATES ON LASHES (the male law): the flick is the
        # feminine tell; a male spec at lashes < 0.7 draws none, the
        # alpha scales to full by 0.85.
        fk = max(0.0, min(1.0, (float(spec["eyes"].get("lashes", 1.0)) - 0.55) / 0.30))
    elif _mode in ("nolow", "malenolow"):
        fk = 1.0 if _mode == "nolow" else max(0.0, min(1.0, (float(spec["eyes"].get("lashes", 1.0)) - 0.55) / 0.30))
    else:
        fk = 1.0 if _mode == "control" else 0.0   # noflick
    if fk > 0.0:
        flick = np.sqrt(((u - 0.95) / 0.16) ** 2 + ((v - (top + 0.1)) / 0.06) ** 2) - 1.0
        over(soft(flick, 0.08) * (u > 0.7), (0.10, 0.07, 0.08), a=fk)
    if _mode not in ("nolow", "malenolow"):
        low = np.abs(v - bot) - 0.018
        over(soft(low, 0.02) * np.clip((u + 0.1) / 0.6, 0, 1) * (np.abs(u) < 0.9), (0.25, 0.16, 0.16), 0.8)
    return rgba


def _paint_brow(spec, w=256, h=64, _mode=brow, _orig=_ORIG_PAINT_BROW):
    """Copy of anime_character.paint_brow with the male floor."""
    if _mode == "control":
        return _orig(spec, w, h)
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (x / (w - 1)) * 2 - 1
    v = 1 - (y / (h - 1)) * 2
    male = str((spec.get("body") or {}).get("gender")) == "male"
    thickness = float(spec["brows"]["thickness"])
    arch = float(spec["brows"]["arch"])
    if male:
        thickness = max(thickness, 1.55)
        arch = min(arch, 0.28)
    center = -0.1 + (0.45 * arch) * (1 - (u - 0.1) ** 2)
    thick = 0.24 * thickness * (1.0 - 0.55 * np.clip(u, 0, 1))
    d = np.abs(v - center) - thick
    d = np.where(np.abs(u) < 0.92, d, 1.0)
    rgba = np.zeros((h, w), np.float32) if False else np.zeros((h, w, 4), np.float32)
    col = np.array(ac._hex_srgb(spec["hair"]["color"]), np.float32) * 0.8
    a = np.clip(0.5 - d / 0.08, 0, 1)
    rgba[..., :3] = col
    rgba[..., 3] = a
    return rgba


if eye != "control" or brow != "control":
    ac.paint_eye = _paint_eye
if brow != "control":
    ac.paint_brow = _paint_brow

if locks == "clear":
    _orig_build = ac.build_anime_character

    def _clear_locks(*a, **kw):
        res = _orig_build(*a, **kw)
        try:
            bpy_ = a[0]
            for ob in bpy_.data.objects:
                if ob.name.startswith("SideLock"):
                    for vt in ob.data.vertices:
                        s = 1.0 if vt.co.x >= 0.0 else -1.0
                        vt.co.x += s * 0.016   # the tips clear the cheek
        except Exception as exc:  # noqa: BLE001
            print(f"clear-locks refused: {exc}", flush=True)
        return res

    ac.build_anime_character = _clear_locks

if os.environ.get("PROBE_DECAL") == "lift":
    # THE DECAL LIFT: the eye plane's edge digs into the cheek's
    # curvature and the transparent ground shows the head's dark
    # interior (the mark candidate) - lift the offset 1.6mm -> 4mm
    # for the face decals and see if the dash dies.
    _orig_plane = ac._decal_plane

    def _lifted_plane(bpy_, scn_, name, *a, **kw):
        return _orig_plane(bpy_, scn_, name, *a, **dict(kw, offset=0.004))

    ac._decal_plane = _lifted_plane

m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
keep = {k: ev.get(k) for k in ("look", "presence", "anime") if k in ev}
an = keep.get("anime") or {}
keep = {"presence": keep.get("presence"),
        "animeLaw": an.get("lawVersion"),
        "strands": (an.get("hairStrandSway") or {}).get("strands")}
json.dump(keep, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''


def run_cut(tag, shot, knobs):
    out_dir = tempfile.mkdtemp(prefix=f"p134-{tag}-")
    job = os.path.join(out_dir, "job.json")
    payload = {
        "shot": dict(shot),
        "scene": {"number": 1, "title": "probe134", "fogDensity": 0.45,
                  "lightningIntensity": 0.3, "energyIntensity": 0.6,
                  "cameraDistance": 1.0, "rimLightIntensity": 0.5},
        "project": {"title": "probe134", "visualStyle": "DONGHUA",
                    "resolution": "960x540", "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe134-{tag}", "payload": payload, "outDir": out_dir}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    env = dict(os.environ, PROBE_EYE=knobs.get("eye", "control"),
               PROBE_BROW=knobs.get("brow", "control"),
               PROBE_LOCKS=knobs.get("locks", "control"),
               PROBE_DECAL=knobs.get("decal", "control"))
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
    """THE FACE METRICS on the landed 108-law framing (calibrated on
    the law render: skin rows 72-131, eye band rows 88-107, face cols
    279-348 at 640x360 - boxes are frame fractions, deterministic
    across cuts):
    - eyes: very-dark px per half inside the eye band (the male iris
      is smaller - the dark mass drops), the largest cluster's bbox
    - marks: small non-elongated dark blobs on the cheek band (the
      strand columns come back elongated; the mark is a dot); the
      mouth+nose-tick box is excluded by x-range."""
    try:
        import numpy as np
        from PIL import Image
        im = Image.open(png).convert("RGB")
        w, h = im.size
        g = im.convert("L")
        # the eye band (rows ~84-112, face cols +/- margin)
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
        # the cheek band (rows ~113-144) with the mouth+nose box excluded
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


def np_mask(img, lum_max):
    import numpy as np
    a = np.asarray(img, dtype=np.uint8)
    return a <= lum_max


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
    ("C0-face-control", {}),
    ("C1-male-eye", {"eye": "male"}),
    ("C2-no-flick", {"eye": "noflick"}),
    ("C3-clear-locks", {"locks": "clear"}),
    ("C4-male-brow", {"brow": "male"}),
    ("C5-all-male", {"eye": "male", "brow": "male", "locks": "clear"}),
    ("C6-nolow", {"eye": "nolow"}),
    ("C7-male-final", {"eye": "malenolow", "brow": "male"}),
    ("C8-decal-lift", {"decal": "lift"}),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    results = {}
    rpath = os.path.join(OUT, "probe134-results.json")
    if os.path.exists(rpath):
        try:
            results = json.load(open(rpath))
        except Exception:  # noqa: BLE001
            results = {}
    only = [c for c in os.environ.get("PROBE_CUTS", "").split(",") if c]
    cuts = [c for c in ALL_CUTS if (not only or c[0] in only)]
    print(f"== PROBE 134 cuts: {[c[0] for c in cuts]} ==", flush=True)
    for tag, knobs in cuts:
        if tag in results and not results[tag].get("refused"):
            print(f"   {tag}: already measured, skipped", flush=True)
            continue
        run_one(tag, knobs, results, rpath)
    print(f"\nPROBE DONE: frames in {OUT}", flush=True)


def run_one(tag, knobs, results, rpath):
    print(f"== {tag} / knobs={knobs} ==", flush=True)
    got = run_cut(tag, S002, knobs)
    if not got:
        results[tag] = {"refused": True}
        json.dump(results, open(rpath, "w"), indent=1, default=str)
        return
    fr = face_read(got["frame"])
    print(f"    face: {json.dumps(fr)}", flush=True)
    print(f"    state: {json.dumps(got['state'])[:200]}", flush=True)
    zoom(got["frame"], f"{tag}-eyes", 0.44, 0.21, 0.56, 0.33, k=8)
    zoom(got["frame"], f"{tag}-face", 0.40, 0.16, 0.60, 0.44, k=5)
    zoom(got["frame"], f"{tag}-full", 0.28, 0.05, 0.72, 0.75, k=3)
    results[tag] = {"knobs": knobs, "face": fr, "state": got["state"]}
    json.dump(results, open(rpath, "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
