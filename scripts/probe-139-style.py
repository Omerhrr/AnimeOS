#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 139) - the 138 night's verdict:
the wide rung's texels landed (S004's face is DRAWN - the 137-era
smear is retired) but the named cell HELD at face 20, and the judge's
accusation MUTATED: no longer texel starvation, a STYLE read - 'a
severe style shift to a simplified chibi aesthetic' (style 15). The
eye's own arithmetic says the build already rides small proportions
(Wei headScale 0.95, Lin 0.90 - the clamp floor is 0.85), so the
honest dials left are the SILHOUETTE ones: the hair bulk (Wei rides
volume 1.15 - the topknot + long length inflate the head's
silhouette at small scale), the eye scale (Wei 0.8, floor 0.7 - the
big-eye tell at distance), and the remaining headScale room. Each
cut patches the dials on the drain's OWN assembled payload
(probe138-cast.json, regenerated this iteration - the REAL shot row,
the REAL sheet-DNA colors, the REAL scene/env/choreo); everything
else rides the standing laws byte-exact (ANIME 125 / TOON 132 /
PRESENCE 108, the 138 ladder: WIDE at 1024).

The series (each cut patches the named designSpec dials only):

  A1-stand      the standing law (the 138 night's own receipt)
  B1-head085    headScale 0.95 -> 0.85 (the clamp floor)
  B2-hair09     hair.volume 1.15 -> 0.90 (the silhouette's bulk)
  B3-eye070     eyes.size 0.8 -> 0.70 (the clamp floor - the eye tell)
  B4-statement  headScale 0.85 + hair 0.90 + eyes 0.70 (the full cut)

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender \
     python3 scripts/probe-139-style.py
(the detached supervisor law: every cut that finishes lands in
probe139-results.json and a restart resumes from there)
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
CAST = os.path.join(ROOT, "probe138-cast.json")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe139")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

_payload = json.load(open(CAST))
S004 = dict(_payload["S004"])
SCENE = dict(_payload["scene"])
# the probe's scene number keeps the probe's own identity honest - the
# bridge keys nothing on it, the title marks the probe in the ledger
SCENE["number"] = 1
SCENE["title"] = "probe139"

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

m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
look = ev.get("look") or {}
presence = ev.get("presence") or {}
rung_ev = {
    "resX": look.get("resX"),
    "presence": {k: presence.get(k) for k in ("lawVersion", "subjectH", "headH", "fill", "dist", "lens", "aimZ", "rung") if k in presence},
    "twoShot": ev.get("twoShot"),
    "figureSource": ev.get("figureSource"),
}
json.dump(rung_ev, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''


def patch_dials(shot, dials):
    """Deep-copy the shot and patch the named designSpec dials on the
    SOLO cast member (S004 carries Wei alone). The patch is the cut's
    only delta - the payload rides the drain's own assembly
    byte-exact otherwise."""
    s = json.loads(json.dumps(shot))
    if dials and s.get("cast"):
        ds = s["cast"][0].setdefault("designSpec", {})
        if "head" in dials:
            ds.setdefault("body", {})["headScale"] = dials["head"]
        if "hair" in dials:
            ds.setdefault("hair", {})["volume"] = dials["hair"]
        if "eye" in dials:
            ds.setdefault("eyes", {})["size"] = dials["eye"]
    return s


def run_cut(tag, shot, dials):
    out_dir = tempfile.mkdtemp(prefix=f"p139-{tag}-")
    job = os.path.join(out_dir, "job.json")
    payload = {
        "shot": patch_dials(shot, dials),
        "scene": dict(SCENE),
        "project": {"title": "probe139", "visualStyle": "DONGHUA",
                    "resolution": "1920x1080", "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe139-{tag}", "payload": payload, "outDir": out_dir}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=5400)
    st = json.load(open(job))
    mp4 = st.get("mp4Path")
    ok = bool(mp4) and os.path.exists(mp4)
    print(f"[{tag} / dials={dials}] clip={ok} -> {mp4}", flush=True)
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
    band, and the zooms carry the read. A smaller head/hair-bulk
    read drops the span - the numeric witness of the dials."""
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
    res_path = os.path.join(OUT, "probe139-results.json")
    results = {}
    if os.path.exists(res_path):
        results = json.load(open(res_path))
    series = [
        ("A1-stand", S004, {}),
        ("B1-head085", S004, {"head": 0.85}),
        ("B2-hair09", S004, {"hair": 0.90}),
        ("B3-eye070", S004, {"eye": 0.70}),
        ("B4-statement", S004, {"head": 0.85, "hair": 0.90, "eye": 0.70}),
    ]
    for tag, shot, dials in series:
        if tag in results:
            print(f"[{tag}] already landed - resume skips", flush=True)
            continue
        got = run_cut(tag, shot, dials)
        if not got:
            results[tag] = {"refused": True, "dials": dials}
            json.dump(results, open(res_path, "w"), indent=1)
            continue
        entry = {"state": got["state"], "frame": got["frame"], "dials": dials}
        hs = head_span(got["frame"])
        entry["headSpan"] = hs
        # the eye's receipts: the figure zoom + the head zoom (the
        # boxes ride fractions - the 134 lesson says the zooms carry
        # the read, the numbers only witness)
        entry["zoomFigure"] = zoom(got["frame"], f"{tag}-fig4x.png", 0.30, 0.02, 0.72, 0.98, 4)
        entry["zoomHead"] = zoom(got["frame"], f"{tag}-head8x.png", 0.38, 0.08, 0.62, 0.42, 8)
        results[tag] = entry
        json.dump(results, open(res_path, "w"), indent=1)
        print(f"[{tag}] head span: {json.dumps(hs)}", flush=True)
    print("probe139 complete ->", res_path, flush=True)


if __name__ == "__main__":
    main()
