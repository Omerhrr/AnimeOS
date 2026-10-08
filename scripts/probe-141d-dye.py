#!/usr/bin/env python3
"""THE LAST CUT (iteration 141d) - the 141 ladder exonerated the dye
chain, fog, wash, mass-lift, rim, shadow-cool and the comp mist; the
blue survives a pure-black dye. The remaining suspect: the TOON
preview's own denoise - OIDN at 10 samples smearing the bright sky
into the dark mass. One cut: mode FINAL (48 samples) on the same
payload. If the blue drops, the smear is convicted and the law's
lever is the preview's own sample/denoise config at the canon framings."""
import json, os, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
CAST = os.path.join(ROOT, "probe141-cast.json")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe141")
RESULTS = os.path.join(ROOT, "probe141d-results.json")
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
    res = {}
    out_dir = tempfile.mkdtemp(prefix="p141d-final-")
    job = os.path.join(out_dir, "job.json")
    payload = {"shot": json.loads(json.dumps(S003)), "scene": dict(SCENE),
               "project": {"title": "probe141", "visualStyle": "DONGHUA", "resolution": "1920x1080", "fps": 8},
               "mode": "FINAL"}
    with open(job, "w") as fh:
        json.dump({"jobId": "probe141d-final", "payload": payload, "outDir": out_dir}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER); render_py = fh.name
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=5400)
    st = json.load(open(job)); mp4 = st.get("mp4Path")
    ok = bool(mp4) and os.path.exists(mp4)
    print(f"[final] clip={ok}", flush=True)
    if not ok:
        print((r.stderr or r.stdout)[-800:], flush=True); sys.exit(1)
    pngs = sorted(f for f in os.listdir(out_dir) if f.endswith(".png"))
    mid = os.path.join(OUT, "final-mode.png")
    if pngs: subprocess.run(["cp", os.path.join(out_dir, pngs[len(pngs)//2]), mid], check=False)
    else: subprocess.run(["ffmpeg", "-y", "-i", mp4, "-vf", "select=eq(n\\,2)", "-vframes", "1", mid], capture_output=True, timeout=120)
    meter = hair_meter(mid)
    print(f"    frame -> {mid}  hairMeter: {meter}", flush=True)
    res["final"] = {"frame": mid, "hairMeter": meter}
    json.dump(res, open(RESULTS, "w"), indent=1, default=str)
    print("PROBE141D COMPLETE", flush=True)
if __name__ == "__main__":
    main()
