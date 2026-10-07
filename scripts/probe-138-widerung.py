#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 138) - the 137 night's remnant:
the face texel ceiling at the small-figure framings. S004's face 20
(the simplified read at the WIDE) and its style 30 hold the p10 at
35 - the 134 texel budget ceiling's last loud cell. The eye's own
arithmetic (the 133 probe's receipt): a 44px head reads a smear, a
61px head reads drawn. The WIDE contract fills 0.50 - the figure
owns half the frame height - so at the 640 rung the head lands
~24px, deep in the mush zone; the paint staging cannot rescue it
(the 132 lesson) and the geometry cannot pull in (the WIDE's
contract owns the scene - the aura crawl across the floor). The
remaining honest lever is the RESOLUTION LADDER itself - the 126
precedent: the establishing rung moved the wide-end cells by
feeding the judge real texels.

The series (each cut patches ONE rung value on the honest payload,
the 132 standing law otherwise untouched; the payloads ride the
drain's own assembly - probe138-cast.json, the REAL shot rows, the
REAL sheet-DNA colors, the REAL scene/env/choreo):

  A1-s004-640    the standing law (the receipt itself)
  B1-s004-1024   PREVIEW_CAP -> 1024 (the establishing cap, extended)
  B2-s004-896    PREVIEW_CAP -> 896  (the cost-honest middle rung)
  A2-s006-640    S006 pair at the standing law (its control)
  B3-s006-1024   S006 pair at 1024 (the rung's reach on the second WIDE)

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender \
     python3 scripts/probe-138-widerung.py
(the detached supervisor law: every cut that finishes lands in
probe138-results.json and a restart resumes from there)
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
CAST = os.path.join(ROOT, "probe138-cast.json")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe138")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

_payload = json.load(open(CAST))
S004 = dict(_payload["S004"])
S006 = dict(_payload["S006"])
SCENE = dict(_payload["scene"])
# the probe's scene number keeps the probe's own identity honest - the
# bridge keys nothing on it, the title marks the probe in the ledger
SCENE["number"] = 1
SCENE["title"] = "probe138"

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

# ── THE CUT (previews exactly one rung value; "stand" rides the
#    LANDED ladder untouched - the receipt itself) ──
cap = os.environ.get("PROBE_CAP", "stand")
if cap != "stand":
    m.PREVIEW_CAP = int(cap)

m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
look = ev.get("look") or {}
presence = ev.get("presence") or {}
rung_ev = {
    "resX": look.get("resX"),
    "presence": {k: presence.get(k) for k in ("lawVersion", "subjectH", "headH", "fill", "dist", "lens", "aimZ", "rung") if k in presence},
    "twoShot": ev.get("twoShot"),
    "resolution": st.get("resolution") or ev.get("resolution"),
}
json.dump(rung_ev, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''


def run_cut(tag, shot, cap):
    out_dir = tempfile.mkdtemp(prefix=f"p138-{tag}-")
    job = os.path.join(out_dir, "job.json")
    payload = {
        "shot": dict(shot),
        "scene": dict(SCENE),
        "project": {"title": "probe138", "visualStyle": "DONGHUA",
                    "resolution": "1920x1080", "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe138-{tag}", "payload": payload, "outDir": out_dir}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    env = dict(os.environ, PROBE_CAP=str(cap))
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=3600, env=env)
    st = json.load(open(job))
    mp4 = st.get("mp4Path")
    ok = bool(mp4) and os.path.exists(mp4)
    print(f"[{tag} / cap={cap}] clip={ok} -> {mp4}", flush=True)
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
    print(f"    frame -> {mid}  state: {json.dumps(state)}", flush=True)
    return {"state": state, "frame": mid, "outDir": out_dir}


def head_span(png):
    """The head's pixel span at the frame's center band: scan rows,
    the first contiguous figure run from the top = the head band.
    The honest crop law - the 132 zoom lesson: measure the head's own
    band, and the zooms carry the read."""
    try:
        from PIL import Image
        im = Image.open(png).convert("RGB")
        w, h = im.size
        band = im.crop((int(w * 0.40), 0, int(w * 0.60), h))
        px = list(band.getdata())
        bw, bh = band.size
        rows = []
        for cy in range(bh):
            row = [band.getpixel((cx, cy)) for cx in range(0, bw, 2)]
            avg = tuple(sum(p[i] for p in row) / len(row) for i in range(3))
            rows.append(avg)
        # the figure band = rows whose luminance departs from the sky's top
        top = rows[: max(4, bh // 12)]
        tavg = tuple(sum(r[i] for r in top) / len(top) for i in range(3))
        def dist(a, b):
            return sum(abs(a[i] - b[i]) for i in range(3))
        fig = [i for i, r in enumerate(rows) if dist(r, tavg) > 42]
        if not fig:
            return {"refused": "no figure band found", "w": w, "h": h}
        run, best, cur = [], [], []
        for i in range(min(fig), max(fig) + 2):
            if i in set(fig):
                cur.append(i)
            else:
                if len(cur) > len(best):
                    best = cur
                cur = []
        if len(cur) > len(best):
            best = cur
        return {"headSpanPx": len(best), "headTopRow": best[0] if best else None,
                "frameW": w, "frameH": h}
    except Exception as exc:  # noqa: BLE001
        return {"refused": str(exc)[:140]}


def band_hsv(png, x0, y0, x1, y1):
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


def zoom(png, name, x0, y0, x1, y1, k):
    """The eye's receipt: k-times zoom of the named box."""
    try:
        from PIL import Image
        im = Image.open(png).convert("RGB")
        w, h = im.size
        box = im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
        box = box.resize((box.width * k, box.height * k), Image.NEAREST)
        p = os.path.join(OUT, name)
        box.save(p)
        return p
    except Exception as exc:  # noqa: BLE001
        print(f"    zoom refused: {exc}", flush=True)
        return None


def main():
    os.makedirs(OUT, exist_ok=True)
    res_path = os.path.join(OUT, "probe138-results.json")
    results = {}
    if os.path.exists(res_path):
        results = json.load(open(res_path))
    series = [
        ("A1-s004-640", S004, "stand"),
        ("B1-s004-1024", S004, 1024),
        ("B2-s004-896", S004, 896),
        ("A2-s006-640", S006, "stand"),
        ("B3-s006-1024", S006, 1024),
    ]
    for tag, shot, cap in series:
        if tag in results:
            print(f"[{tag}] already landed - resume skips", flush=True)
            continue
        got = run_cut(tag, shot, cap)
        if not got:
            results[tag] = {"refused": True}
            json.dump(results, open(res_path, "w"), indent=1)
            continue
        entry = {"state": got["state"], "frame": got["frame"]}
        hs = head_span(got["frame"])
        entry["headSpan"] = hs
        entry["bandHsv"] = band_hsv(got["frame"], 0.40, 0.05, 0.60, 0.75)
        # the eye's receipts: the figure zoom + the head zoom (the
        # boxes ride fractions - the 134 lesson says the zooms carry
        # the read, the numbers only witness)
        entry["zoomFigure"] = zoom(got["frame"], f"{tag}-fig4x.png", 0.30, 0.02, 0.72, 0.98, 4)
        entry["zoomHead"] = zoom(got["frame"], f"{tag}-head8x.png", 0.42, 0.04, 0.58, 0.30, 8)
        results[tag] = entry
        json.dump(results, open(res_path, "w"), indent=1)
        print(f"[{tag}] head span: {json.dumps(hs)}", flush=True)
    print("probe138 complete ->", res_path, flush=True)


if __name__ == "__main__":
    main()
