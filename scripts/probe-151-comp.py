#!/usr/bin/env python3
"""THE COMP CONVICTION PROBE (iteration 151) - the lightning was
exonerated (the strike frames' mass chroma 63.2 vs quiet 63.3); the
night COMP GRADE is the remaining named seam. One S006 cut through
the REAL worker_run with the COMPP STRIPPED from the payload (the
drain's own assembly otherwise: the honest cast, the scene params,
the fx riding) - then the meter compares the raw render's dark-mass
strip against the night-150 clip's. The receipt: the comp-off cut's
foreign chroma materially LOWER -> the grade convicts as the
transport's remaining rider; the lever owes its own probe."""
import json, os, subprocess, sys, tempfile

ROOT = "/home/z/my-project/AnimeOS"
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
CAST = os.path.join(ROOT, "probe151-cast.json")
OUT = "/home/z/my-project/inspect/probe151"
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")
CLIP = os.path.join(ROOT, "public", "renders", "cmv2yr5qy0061ksuuk9cfc82q.mp4")  # the night-150 S006 (with comp)

_payload = json.load(open(CAST))
S006 = dict(_payload["S006"])
SCENE = dict(_payload["scene"]); SCENE["number"] = 12; SCENE["title"] = "probe151-comp"

RENDER = r'''
import importlib.util, json, os, sys
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-2:]
bridge, job = _tail[0], _tail[1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.worker_run(job)
st = json.load(open(job))
print("JOB_STATE mp4:", st.get("mp4Path"), "comp:", json.dumps((st.get("render") or {}).get("comp"))[:120])
'''

def meter(png, box):
    from PIL import Image
    im = Image.open(png).convert("RGB")
    w, h = im.size
    x0, y0, x1, y1 = box
    px = list(im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1))).getdata())
    px.sort(key=lambda p: sum(p))
    dark = px[: max(1, len(px) // 4)]
    n = len(dark)
    mean = [sum(p[i] for p in dark) / n for i in range(3)]
    return {"rgb": [round(v, 1) for v in mean], "spread": round(max(mean) - min(mean), 1)}

def extract(mp4, t, png):
    subprocess.run(["ffmpeg", "-y", "-ss", f"{t:.3f}", "-i", mp4, "-frames:v", "1",
                    "-loglevel", "error", png], timeout=60, check=True)

BOX = (0.52, 0.05, 0.95, 0.35)

def main():
    out_dir = tempfile.mkdtemp(prefix="p151-compoff-")
    job = os.path.join(out_dir, "job.json")
    payload = {"shot": json.loads(json.dumps(S006)), "scene": dict(SCENE),
               "project": {"title": "probe151", "visualStyle": "DONGHUA", "resolution": "1920x1080", "fps": 12},
               "mode": "PREVIEW"}
    # THE STRIP: no comp (the conviction's isolation), the fx ride (the
    # 149 guard already bounds them; the probe isolates the GRADE only)
    payload["shot"].pop("comp", None)
    with open(job, "w") as fh:
        json.dump({"jobId": "probe151-compoff", "payload": payload, "outDir": out_dir}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER); render_py = fh.name
    print("rendering the comp-off cut (S006, 86-ish frames @1024)...")
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=3600)
    st = json.load(open(job)); mp4 = st.get("mp4Path")
    if not mp4 or not os.path.exists(mp4):
        print("COMP-OFF RENDER FAILED"); print((r.stderr or r.stdout)[-1200:]); sys.exit(1)
    print(f"comp-off clip: {mp4}")
    rows = {"compOff": [], "withComp": []}
    for t in (1.0, 1.8, 2.6):
        png = os.path.join(OUT, f"compoff-t{t}.png")
        extract(mp4, t, png); rows["compOff"].append(meter(png, BOX))
        png2 = os.path.join(OUT, f"withcomp-t{t}.png")
        extract(CLIP, t, png2); rows["withComp"].append(meter(png2, BOX))
    def med(vals):
        s = sorted(v["spread"] for v in vals)
        return round(s[len(s) // 2], 1)
    rep = {"rows": rows, "compOffMedian": med(rows["compOff"]), "withCompMedian": med(rows["withComp"])}
    print(json.dumps(rep, indent=1))
    json.dump(rep, open(os.path.join(OUT, "comp-meter.json"), "w"), indent=1)
    off, on = rep["compOffMedian"], rep["withCompMedian"]
    if off < on * 0.8:
        print(f"COMP CONVICTED: the comp-off cut's mass chroma median {off} vs the graded clip's {on} - the grade carries the foreign hue; the bounded-grade lever owes its own probe")
    elif off > on * 0.92:
        print(f"COMP EXONERATED: the comp-off median {off} vs graded {on} - the grade does not carry the mass's foreign chroma; BOTH named seams stand exonerated and the transport hunt continues (the world ambient is the remaining rider)")
    else:
        print(f"COMP MIXED: comp-off {off} vs graded {on} - a partial ride")

if __name__ == "__main__":
    main()
