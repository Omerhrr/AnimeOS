#!/usr/bin/env python3
"""THE VERIFICATION CUT (iteration 141f) - the 141 law rides the
standing code (TOON 134: the dark-mass chroma gate + the skin band
edge). One cut on the S003 closeup through the REAL worker_run - the
eye + the meter name whether the azure flood died and the oval
softened."""
import json, os, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
CAST = os.path.join(ROOT, "probe141-cast.json")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe141")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")
_payload = json.load(open(CAST))
S003 = dict(_payload["S003"])
SCENE = dict(_payload["scene"]); SCENE["number"] = 1; SCENE["title"] = "probe141"
RENDER = r'''
import importlib.util, json, os, sys
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-2:]
bridge, job = _tail[0], _tail[1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
look = ev.get("look") or {}
json.dump({"lawVersion": look.get("lawVersion"), "hairMass": look.get("hairMass")},
          open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''
def hair_meter(png):
    try:
        from PIL import Image
        im = Image.open(png).convert("RGB"); w, h = im.size
        box = (int(w*0.30), int(h*0.04), int(w*0.70), int(h*0.38))
        px = list(im.crop(box).getdata()); px.sort(key=lambda p: sum(p))
        dark = px[: max(1, len(px)//4)]; n = len(dark)
        vals = [sum(p[i] for p in dark)/n for i in range(3)]
        lean = "TEAL" if (vals[1] > vals[0]*1.35 and vals[2] > vals[0]*1.35) else ("cool" if vals[2] > vals[0]*1.25 else "neutral")
        return {"rgb": [round(v,1) for v in vals], "lean": lean}
    except Exception as exc: return {"error": str(exc)}
def main():
    os.makedirs(OUT, exist_ok=True)
    out_dir = tempfile.mkdtemp(prefix="p141f-ctl-")
    job = os.path.join(out_dir, "job.json")
    payload = {"shot": json.loads(json.dumps(S003)), "scene": dict(SCENE),
               "project": {"title": "probe141", "visualStyle": "DONGHUA", "resolution": "1920x1080", "fps": 8},
               "mode": "PREVIEW"}
    with open(job, "w") as fh:
        json.dump({"jobId": "probe141-ctl-recheck", "payload": payload, "outDir": out_dir}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER); render_py = fh.name
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=5400)
    st = json.load(open(job)); mp4 = st.get("mp4Path")
    ok = bool(mp4) and os.path.exists(mp4)
    print(f"[v1-gate] clip={ok}", flush=True)
    if not ok:
        print((r.stderr or r.stdout)[-1200:], flush=True); sys.exit(1)
    sp = os.path.join(out_dir, "cut-state.json")
    if os.path.exists(sp): print("    state:", open(sp).read()[:400], flush=True)
    pngs = sorted(f for f in os.listdir(out_dir) if f.endswith(".png"))
    mid = os.path.join(OUT, "ctl-recheck.png")
    if pngs: subprocess.run(["cp", os.path.join(out_dir, pngs[len(pngs)//2]), mid], check=False)
    else: subprocess.run(["ffmpeg", "-y", "-i", mp4, "-vf", "select=eq(n\\,2)", "-vframes", "1", mid], capture_output=True, timeout=120)
    meter = hair_meter(mid)
    print(f"    frame -> {mid}  hairMeter: {meter}", flush=True)
    print("    (a1 control read (22.4, 29.7, 58.2) cool; the gate's honest target: the lean dies to neutral)", flush=True)
if __name__ == "__main__":
    main()
