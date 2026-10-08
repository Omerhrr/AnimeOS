#!/usr/bin/env python3
"""THE FINAL TWO CUTS (iteration 141c) - the 141b ladder exonerated
fog/wash/lift/rim/shadow-cool; the b1 cut killed the scene's fogDensity
but the COMP's own mist layer rides COMP_BASE['mist']=0.12 and the mix
is INVERTED on purpose ('the subject wears the fog'): the figure lerps
toward the moonlight script's mistTint (0.24, 0.29, 0.44) - the BLUE.
Two cuts finish it:
  r4-nomist        COMP_BASE['mist'] -> 0.0 (the layer off entirely)
  r5-neutralmist   mistTint -> neutral gray (the depth read kept, the hue lie dies)
"""
import json, os, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
CAST = os.path.join(ROOT, "probe141-cast.json")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe141")
RESULTS = os.path.join(ROOT, "probe141c-results.json")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")
_payload = json.load(open(CAST))
S003 = dict(_payload["S003"])
SCENE = dict(_payload["scene"])
SCENE["number"] = 1
SCENE["title"] = "probe141"
RENDER = r'''
import importlib.util, json, os, sys
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-2:]
bridge, job = _tail[0], _tail[1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
here = os.path.dirname(os.path.abspath(bridge))
if here not in sys.path:
    sys.path.insert(0, here)
look = os.path.join(os.path.dirname(job), "probe141-look.json")
patch_note = None
if os.path.exists(look):
    p = json.load(open(look))
    patch_note = p
    if "comp_mist" in p:
        m.COMP_BASE["mist"] = float(p["comp_mist"])
    if "mist_tint" in p:
        m.COMP_LUTS = dict(m.COMP_LUTS)
        ml = dict(m.COMP_LUTS["moonlight"]); ml["mistTint"] = tuple(float(c) for c in p["mist_tint"])
        m.COMP_LUTS["moonlight"] = ml
m.worker_run(job)
st = json.load(open(job))
json.dump({"probeLookPatch": patch_note}, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''
def run_cut(tag, look_patch):
    out_dir = tempfile.mkdtemp(prefix=f"p141c-{tag}-")
    job = os.path.join(out_dir, "job.json")
    payload = {"shot": json.loads(json.dumps(S003)), "scene": dict(SCENE),
               "project": {"title": "probe141", "visualStyle": "DONGHUA", "resolution": "1920x1080", "fps": 8},
               "mode": "PREVIEW"}
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe141c-{tag}", "payload": payload, "outDir": out_dir}, fh)
    with open(os.path.join(out_dir, "probe141-look.json"), "w") as fh:
        json.dump(look_patch, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER); render_py = fh.name
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=5400)
    st = json.load(open(job)); mp4 = st.get("mp4Path")
    ok = bool(mp4) and os.path.exists(mp4)
    print(f"[{tag}] clip={ok}", flush=True)
    if not ok:
        print((r.stderr or r.stdout)[-800:], flush=True); return None
    pngs = sorted(f for f in os.listdir(out_dir) if f.endswith(".png"))
    mid = os.path.join(OUT, f"{tag}.png")
    if pngs: subprocess.run(["cp", os.path.join(out_dir, pngs[len(pngs)//2]), mid], check=False)
    else: subprocess.run(["ffmpeg", "-y", "-i", mp4, "-vf", "select=eq(n\\,2)", "-vframes", "1", mid], capture_output=True, timeout=120)
    meter = hair_meter(mid)
    print(f"    frame -> {mid}  hairMeter: {meter}", flush=True)
    return {"frame": mid, "hairMeter": meter}
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
    res = json.load(open(RESULTS)) if os.path.exists(RESULTS) else {}
    for tag, patch in [("r4-nomist", {"comp_mist": 0.0}), ("r5-neutralmist", {"mist_tint": [0.36, 0.36, 0.36]})]:
        if tag in res: print(f"[{tag}] resume skips", flush=True); continue
        r = run_cut(tag, patch)
        if r is None: json.dump(res, open(RESULTS, "w"), indent=1, default=str); sys.exit(1)
        res[tag] = r
        json.dump(res, open(RESULTS, "w"), indent=1, default=str)
    print("PROBE141C COMPLETE", flush=True)
if __name__ == "__main__":
    main()
