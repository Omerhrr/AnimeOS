#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 131) - the 130 night named the
frontier: the mannequin face/style route (S002 face 30 'chibi drift',
S004 'the face and hair lack sharp details', S005 style 20 'low-poly')
plus the closeup hair probe (S003 hair 60). This probe renders ONE
short PREVIEW clip per under cell at the STANDING laws (the same
worker_run the night rides, the standing sheet-DNA dyes), extracts the
middle frame of each, and hands the pixels to the director's eye.

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender \
     blender -b --factory-startup -P scripts/probe-131-style.py
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe131")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

LIN = {"name": "Lin Yue", "hairStyle": "topknot", "hairColor": "#1a1a1a",
       "robeColor": "#1f5c5c", "robeAccent": "#c4b454", "skinTone": "#e8d5c4",
       "weaponType": "sword", "bladeColor": "#5eead4"}
WEI = {"name": "Demon Lord Wei", "hairStyle": "topknot", "hairColor": "#1a1a1a",
       "robeColor": "#4a2c3d", "robeAccent": "#c5a059", "skinTone": "#e8d0c3",
       "weaponType": "sword", "bladeColor": "#b4453f"}

# (tag, shotType, lens, movement, cast, lighting)
PROBES = [
    ("S002-medium-lin", "MEDIUM", "35mm", "TRACKING", [LIN], "Backlight + interior shadows"),
    ("S003-closeup-lin", "CLOSEUP", "85mm", "STATIC", [LIN], "Cold key, deep shadow"),
    ("S004-wide-wei", "WIDE", "35mm", "PAN", [WEI], "Aura glow + lightning"),
    ("S005-lowangle-lin", "LOW_ANGLE", "50mm", "ORBIT", [LIN], "Blade emission + rim light"),
]

RENDER = r'''
import importlib.util, json, sys
bridge, job = sys.argv[-2], sys.argv[-1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.worker_run(job)
'''


def main():
    os.makedirs(OUT, exist_ok=True)
    frames = []
    for tag, shot_type, lens, movement, cast, lighting in PROBES:
        out_dir = tempfile.mkdtemp(prefix=f"p131-{tag}-")
        job = os.path.join(out_dir, "job.json")
        payload = {
            "shot": {"number": 2, "description": f"probe {tag}",
                     "shotType": shot_type, "lens": lens, "movement": movement,
                     "poseStart": "STANCE", "poseEnd": "STANCE",
                     "lighting": lighting, "duration": 0.5, "cast": cast},
            "scene": {"number": 1, "title": "probe", "fogDensity": 0.45,
                      "lightningIntensity": 0.3, "energyIntensity": 0.6,
                      "cameraDistance": 1.0, "rimLightIntensity": 0.5},
            "project": {"title": "probe131", "visualStyle": "DONGHUA",
                        "resolution": "960x540", "fps": 8},
            "mode": "PREVIEW",
        }
        with open(job, "w") as fh:
            json.dump({"jobId": f"probe131-{tag}", "payload": payload, "outDir": out_dir}, fh)
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
            fh.write(RENDER)
        r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", fh.name, "--", BRIDGE, job],
                           capture_output=True, text=True, timeout=1800)
        st = json.load(open(job))
        mp4 = st.get("mp4Path")
        ok = bool(mp4) and os.path.exists(mp4)
        print(f"[{tag}] clip={ok} -> {mp4}")
        if not ok:
            print((r.stderr or r.stdout)[-600:])
            continue
        # the render init drops a PNG per frame - grab the middle one
        pngs = sorted(f for f in os.listdir(out_dir) if f.endswith(".png"))
        if not pngs:
            # fall back: extract from the mp4 with ffmpeg
            mid = os.path.join(OUT, f"{tag}.png")
            subprocess.run(["ffmpeg", "-y", "-i", mp4, "-vf", "select=eq(n\\,2)", "-vframes", "1", mid],
                           capture_output=True, timeout=120)
        else:
            mid = os.path.join(OUT, f"{tag}.png")
            subprocess.run(["cp", os.path.join(out_dir, pngs[len(pngs) // 2]), mid], check=False)
        if os.path.exists(mid):
            frames.append(mid)
            print(f"    frame -> {mid}")
        # keep the state's evidence lines the eye may want
        ev = st.get("render") or {}
        keep = {k: ev.get(k) for k in ("look", "facePaint", "presence", "figureSource") if k in ev}
        with open(os.path.join(OUT, f"{tag}.state.json"), "w") as fh:
            json.dump(keep, fh, indent=1, default=str)
    print(f"\nPROBE DONE: {len(frames)} frames in {OUT}")
    for f in frames:
        print("  " + f)


if __name__ == "__main__":
    main()
