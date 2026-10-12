#!/usr/bin/env python3
"""THE 164 RUNG ARMS (evidence first) - S005 rendered at BOTH rungs
through the real worker_run: the 640 standing (LOW_ANGLE rides the
138 ladder's tights grouping) and the 1024 candidate (the ladder's
own seam: the 157 contract judges this framing front-scale while
the ladder starves its crops). Each arm's job state carries its own
render.faceBoxes - the meter reads resX + the box areas, and the
judge's own face crops get extracted for the eye."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

ROOT = "/home/z/my-project/AnimeOS"
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
JOB = "/home/z/my-project/inspect/probe164/job-s005.json"
OUT = "/home/z/my-project/inspect/probe164"
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

RENDER = r'''
import importlib.util, json, os, sys
args = sys.argv[sys.argv.index("--") + 1:]
bridge_path, job_path, rung = args[0], args[1], args[2]
spec = importlib.util.spec_from_file_location("bridge", bridge_path)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
if int(rung) > 0:
    # the candidate arm: the LOW_ANGLE rides the wide rung (the 164
    # law's own letter under test - the standing bridge keeps 640)
    m.preview_cap_for = lambda st, mode: 1024
m.worker_run(job_path)
st = json.load(open(job_path))
ev = (st.get("render") or {})
fb = ev.get("faceBoxes") or {}
print("RUNG ARM LANDED:", json.dumps({"resX": fb.get("resX"), "resY": fb.get("resY"),
                                      "cast": [c.get("name") for c in (fb.get("cast") or [])]})[:300])
'''


def render_arm(tag, rung):
    d = os.path.join(OUT, f"arm-{tag}")
    os.makedirs(d, exist_ok=True)
    payload = json.load(open(JOB))
    job = {"jobId": payload.get("jobId", "probe164"), "payload": payload, "outDir": d}
    job_state = os.path.join(d, "job.json")
    json.dump(job, open(job_state, "w"))
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    print(f"rendering the {tag} arm (rung {rung})...", flush=True)
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--",
                        BRIDGE, job_state, str(rung)],
                       capture_output=True, text=True, timeout=3600)
    st = json.load(open(job_state))
    got = st.get("mp4Path")
    if not got or not os.path.exists(got):
        print(f"{tag.upper()} RENDER FAILED")
        print((r.stderr or r.stdout)[-1500:])
        sys.exit(1)
    mp4 = os.path.join(d, "cut.mp4")
    os.replace(got, mp4)
    for line in r.stdout.splitlines():
        if line.startswith("RUNG ARM LANDED:"):
            print(f"  {tag}: {line[:260]}")
    return mp4, st


def main():
    results = {}
    for tag, rung in (("640", 0), ("1024", 1)):
        mp4, st = render_arm(tag, rung)
        fb = ((st.get("render") or {}).get("faceBoxes") or {})
        results[tag] = {"mp4": mp4, "resX": fb.get("resX"), "resY": fb.get("resY"),
                        "marks": fb.get("marks"), "frames": fb.get("frames"),
                        "cast": [{ "name": c.get("name"), "boxes": c.get("boxes") } for c in (fb.get("cast") or [])]}
    # the meter: the face-crop source areas at both rungs + the eye's crops
    for tag in ("640", "1024"):
        arm = results[tag]
        rx, ry = arm["resX"], arm["resY"]
        for c in arm["cast"]:
            who = "wei" if "Wei" in (c["name"] or "") else "lin"
            for k, b in enumerate(c["boxes"] or []):
                if not b:
                    continue
                x0, y0, x1, y1 = b
                w, h = max(2, min(rx - x0, x1 - x0)), max(2, min(ry - y0, y1 - y0))
                frame = (arm["frames"] or [None] * len(c["boxes"]))[k]
                png = os.path.join(OUT, f"s005-{who}-{tag}-f{k+1}.png")
                sel = f"select=eq(n\\,{frame})," if frame is not None else ""
                subprocess.run(["ffmpeg", "-y", "-i", arm["mp4"], "-vf",
                                f"{sel}crop={w}:{h}:{x0}:{y0},scale=-2:224", "-frames:v", "1",
                                "-loglevel", "error", png], check=True, cwd=ROOT)
                results[tag][f"{who}-f{k+1}"] = {"w": w, "h": h, "area": w * h, "png": png}
                print(f"  {tag} {who} f{k+1}: crop {w}x{h} = {w*h}px source")
                break  # one crop per member is enough for the eye
    rep = {t: {k: v for k, v in results[t].items() if k != "mp4"} for t in results}
    json.dump(rep, open(os.path.join(OUT, "rung-meter.json"), "w"), indent=1)
    print(json.dumps({t: {"resX": rep[t]["resX"], **{k: v for k, v in rep[t].items() if k.endswith(("-f1", "-f2"))}} for t in rep}, indent=1))
    print("THE RUNG ARMS STAND")


if __name__ == "__main__":
    main()
