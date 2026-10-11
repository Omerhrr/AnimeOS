#!/usr/bin/env python3
"""THE VERIFY ARM (iteration 152) - the luminance-masked mist rides
the real worker_run (the probe payload WITH comp - the drain's own
assembly): the receipt
  - the dark-mass strip's foreign chroma must read near the RAW's own
    (~28-38; the 151 comp-off read 28.0, the graded 63.2),
  - the ambience strip must KEEP its violet (the mood survives).
"""
import json, os, subprocess, sys, tempfile

ROOT = "/home/z/my-project/AnimeOS"
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
JOB = "/home/z/my-project/inspect/probe151/job-gradebound.json"
OUT = "/home/z/my-project/inspect/probe151"
GRADED = os.path.join(ROOT, "public", "renders", "cmv2yr5qy0061ksuuk9cfc82q.mp4")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

RENDER = r'''
import importlib.util, json, os, sys
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-2:]
bridge, job = _tail[0], _tail[1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.worker_run(job)
st = json.load(open(job))
ev = (st.get("render") or {})
comp = ev.get("comp") or {}
print("COMP LANDED:", json.dumps({k: comp.get(k) for k in ("landed", "skipped", "lawVersion") if k in comp})[:300])
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

MASS = (0.52, 0.05, 0.95, 0.35)
AMBIENCE = (0.08, 0.40, 0.45, 0.75)

def main():
    out_dir = tempfile.mkdtemp(prefix="p152-verify-")
    job_state = os.path.join(out_dir, "job.json")
    job = json.load(open(JOB))
    job["outDir"] = out_dir
    json.dump(job, open(job_state, "w"))
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER); render_py = fh.name
    print("rendering the bounded-grade cut (S006 @1024)...")
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job_state],
                       capture_output=True, text=True, timeout=3600)
    st = json.load(open(job_state)); mp4 = st.get("mp4Path")
    if not mp4 or not os.path.exists(mp4):
        print("VERIFY RENDER FAILED"); print((r.stderr or r.stdout)[-1200:]); sys.exit(1)
    for line in r.stdout.splitlines():
        if line.startswith("COMP LANDED:"):
            print(line[:300])
    fails = 0
    mass_b, mass_g, amb_b, amb_g = [], [], [], []
    for t in (1.0, 1.8, 2.6):
        png = os.path.join(OUT, "verify-mass-t.png".replace("t", f"{t}"))
        extract(mp4, t, png); mass_b.append(meter(png, MASS))
        png2 = os.path.join(OUT, f"graded-mass-t{t}.png")
        extract(GRADED, t, png2); mass_g.append(meter(png2, MASS))
        png3 = os.path.join(OUT, f"verify-amb-t{t}.png")
        extract(mp4, t, png3); amb_b.append(meter(png3, AMBIENCE))
        png4 = os.path.join(OUT, f"graded-amb-t{t}.png")
        extract(GRADED, t, png4); amb_g.append(meter(png4, AMBIENCE))
    def med(vals):
        s = sorted(v["spread"] for v in vals)
        return round(s[len(s) // 2], 1)
    rep = {
        "massBoundedMedian": med(mass_b), "massGradedMedian": med(mass_g),
        "massBounded": mass_b, "ambBounded": amb_b, "ambGraded": amb_g,
        "rawReference": 28.0,
    }
    print(json.dumps({k: rep[k] for k in ("massBoundedMedian", "massGradedMedian", "rawReference")}, indent=1))
    json.dump(rep, open(os.path.join(OUT, "verify-meter.json"), "w"), indent=1)
    mb, mg = rep["massBoundedMedian"], rep["massGradedMedian"]
    if mb <= 40.0 and mb < mg * 0.75:
        print(f"VERIFY GREEN: the bounded grade's mass chroma {mb} reads at the raw's own range (the graded clip's {mg}) - the flood is bounded")
    else:
        print(f"VERIFY RED: the bounded mass chroma {mb} (graded {mg}) - the mask under-bounds; the dial waits its own sweep"); fails += 1
    amb_drop = med(amb_b) < med(amb_g) * 0.55
    if not amb_drop:
        print("VERIFY GREEN: the ambience keeps its tint (the mood survives the mask)")
    else:
        print("VERIFY RED: the ambience lost its tint - the mask over-bounds"); fails += 1
    print(f"\n{'THE LEVER STANDS' if fails == 0 else f'{fails} CELL(S) REFUSE'}")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
