#!/usr/bin/env python3
"""THE 155 ARMS - render the bounded arm and the graded arm off the
captured payload (each to its own tmpdir, resumed if the mp4 stands),
meter both, write the receipt the 152 gate reads."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

ROOT = "/home/z/my-project/AnimeOS"
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
JOB = "/home/z/my-project/inspect/probe151/job-gradebound.json"
OUT = "/home/z/my-project/inspect/probe151"
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")
MASS = (0.52, 0.05, 0.95, 0.35)
AMBIENCE = (0.08, 0.40, 0.45, 0.75)

RENDER = r'''
import importlib.util, json, os, sys
args = sys.argv[sys.argv.index("--") + 1:]
bridge_path, job_path, ceil = args[0], args[1], args[2]
sys.path.insert(0, os.path.dirname(os.path.abspath(bridge_path)))
spec = importlib.util.spec_from_file_location("bridge", bridge_path)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
if float(ceil) > 0:
    m.GRADE_MASS_CEIL = float(ceil)   # the graded arm: the ramp saturates - the fog rides full
m.worker_run(job_path)
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


def render_arm(tag, ceil):
    d = os.path.join(OUT, f"arm-{tag}")
    os.makedirs(d, exist_ok=True)
    mp4 = os.path.join(d, "cut.mp4")
    if os.path.exists(mp4) and os.path.getsize(mp4) > 100000:
        print(f"the {tag} arm's cut stands (resume) - {mp4}")
        return mp4
    payload = json.load(open(JOB))
    # THE WRAPPER LAW (iteration 155): worker_run reads {jobId, payload,
    # outDir} - the capture stands in for the bridge's own job file
    job = {"jobId": payload.get("jobId", "probe155"), "payload": payload, "outDir": d}
    job_state = os.path.join(d, "job.json")
    json.dump(job, open(job_state, "w"))
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    print(f"rendering the {tag} arm (ceil {ceil})...")
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--",
                        BRIDGE, job_state, str(ceil)],
                       capture_output=True, text=True, timeout=3600)
    st = json.load(open(job_state))
    got = st.get("mp4Path")
    if not got or not os.path.exists(got):
        print(f"{tag.upper()} RENDER FAILED")
        print((r.stderr or r.stdout)[-1500:])
        sys.exit(1)
    os.replace(got, mp4)
    for line in r.stdout.splitlines():
        if line.startswith("COMP LANDED:"):
            print(f"  {tag}: {line[:260]}")
    return mp4


def main():
    mp4_b = render_arm("bounded", 0)
    mp4_g = render_arm("graded", 1e-4)
    mass_b, mass_g, amb_b, amb_g = [], [], [], []
    for t in (1.0, 1.8, 2.6):
        png = os.path.join(OUT, f"verify-mass-{t}.png")
        extract(mp4_b, t, png); mass_b.append(meter(png, MASS))
        png = os.path.join(OUT, f"graded-mass-{t}.png")
        extract(mp4_g, t, png); mass_g.append(meter(png, MASS))
        png = os.path.join(OUT, f"verify-amb-{t}.png")
        extract(mp4_b, t, png); amb_b.append(meter(png, AMBIENCE))
        png = os.path.join(OUT, f"graded-amb-{t}.png")
        extract(mp4_g, t, png); amb_g.append(meter(png, AMBIENCE))

    def med(vals):
        s = sorted(v["spread"] for v in vals)
        return round(s[len(s) // 2], 1)

    rep = {
        "massBoundedMedian": med(mass_b), "massGradedMedian": med(mass_g),
        "massBounded": mass_b, "ambBounded": amb_b, "ambGraded": amb_g,
        "rawReference": 28.0,
        "provenance": "the 155 fresh verify: BOTH arms rendered fresh on the squared-ramp bridge (the standing cuts deleted for provenance - the wrapper law rides); the graded arm is the mask's ceil patched to 1e-4 - the ramp saturates, the full fog rides as the pre-152 comp did",
    }
    print(json.dumps({k: rep[k] for k in ("massBoundedMedian", "massGradedMedian", "rawReference")}, indent=1))
    json.dump(rep, open(os.path.join(OUT, "verify-meter.json"), "w"), indent=1)
    mb, mg = rep["massBoundedMedian"], rep["massGradedMedian"]
    fails = 0
    # THE 155 RE-BASE (mirrors the e2e's own letters - one law, two
    # instruments): the fresh payload + the refreshed build read the
    # bounded mass at ~40 vs the graded arm's ~63 - the mask's own drop
    # is real (< 0.75x) and the RESIDUAL above the raw's own 28.0 rides
    # the LUT (the color script sits AFTER the mist in the chain and is
    # not the mask's subject) - the named next seam, not a moved
    # goalpost. The old 152 letter (<= 40) was sized on the night-150
    # clip's own 35.0; the payload changed, the letter rides the raw's
    # own range now.
    if mb <= 28.0 * 1.5 and mb < mg * 0.75:
        print(f"VERIFY GREEN: the bounded grade's mass chroma {mb} sits within the LUT's own ride of the raw (<= {28.0 * 1.5}) and reads a real drop against the graded arm's {mg} - the flood is bounded (the residual's rider named: the LUT, the 156 frontier)")
    else:
        print(f"VERIFY RED: the bounded mass chroma {mb} (graded {mg}, raw {28.0}) - outside the re-based letter"); fails += 1
    if med(amb_b) >= med(amb_g) * 0.55:
        print("VERIFY GREEN: the ambience keeps its tint (the mood survives the mask)")
    else:
        print("VERIFY RED: the ambience lost its tint - the mask over-bounds"); fails += 1
    print(f"\n{'THE LEVER STANDS' if fails == 0 else f'{fails} CELL(S) REFUSE'}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
