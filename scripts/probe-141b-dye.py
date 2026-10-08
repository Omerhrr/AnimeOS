#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 141b) - the ladder's own answers
named the remaining suspects; three cuts finish the bisect:

  e2-toonsize   TOON_SIZE 0.62 -> 0.72 - the skin's lit-band boundary
                moves; if the forehead oval's arc moves with it, the
                ellipse IS the band edge (SKIN_FLOOR exonerated by e1).
  r1-norim      rimLightIntensity 0.5 -> 0.0 (payload delta) - the
                teal rim's additive contribution to the hair's blue.
  r3-nocool     SHADOW_COOL (0.86,0.9,1.08) -> (1,1,1) - the shadow
                tint's blue lean bisected.

Run: BLENDER=... python3 scripts/probe-141b-dye.py
(resume law: probe141b-results.json)
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
CAST = os.path.join(ROOT, "probe141-cast.json")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe141")
RESULTS = os.path.join(ROOT, "probe141b-results.json")
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
import toon_pass as tp
look = os.path.join(os.path.dirname(job), "probe141-look.json")
patch_note = None
if os.path.exists(look):
    p = json.load(open(look))
    patch_note = p
    if "toon_size" in p:
        tp.TOON_SIZE = float(p["toon_size"])
    if "shadow_cool" in p:
        tp.SHADOW_COOL = tuple(float(c) for c in p["shadow_cool"])
m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
look_ev = ev.get("look") or {}
run_ev = {"hairMass": look_ev.get("hairMass"), "probeLookPatch": patch_note}
json.dump(run_ev, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''


def run_cut(tag, shot, rim=None, look_patch=None):
    out_dir = tempfile.mkdtemp(prefix=f"p141b-{tag}-")
    job = os.path.join(out_dir, "job.json")
    scene = dict(SCENE)
    if rim is not None:
        scene["rimLightIntensity"] = rim
    payload = {
        "shot": json.loads(json.dumps(shot)),
        "scene": scene,
        "project": {"title": "probe141", "visualStyle": "DONGHUA",
                    "resolution": "1920x1080", "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe141b-{tag}", "payload": payload, "outDir": out_dir}, fh)
    if look_patch:
        with open(os.path.join(out_dir, "probe141-look.json"), "w") as fh:
            json.dump(look_patch, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=5400)
    st = json.load(open(job))
    mp4 = st.get("mp4Path")
    ok = bool(mp4) and os.path.exists(mp4)
    print(f"[{tag}] clip={ok}", flush=True)
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
    meter = hair_meter(mid)
    print(f"    frame -> {mid}  hairMeter: {meter}", flush=True)
    return {"frame": mid, "hairMeter": meter}


def hair_meter(png):
    try:
        from PIL import Image
        im = Image.open(png).convert("RGB")
        w, h = im.size
        box = (int(w * 0.30), int(h * 0.04), int(w * 0.70), int(h * 0.38))
        px = list(im.crop(box).getdata())
        px.sort(key=lambda p: p[0] + p[1] + p[2])
        dark = px[: max(1, len(px) // 4)]
        n = len(dark)
        vals = [sum(p[i] for p in dark) / n for i in range(3)]
        lean = "TEAL" if (vals[1] > vals[0] * 1.35 and vals[2] > vals[0] * 1.35) else ("cool" if vals[2] > vals[0] * 1.25 else "neutral")
        return {"rgb": [round(v, 1) for v in vals], "lean": lean}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def load_results():
    if os.path.exists(RESULTS):
        try:
            return json.load(open(RESULTS))
        except Exception:
            pass
    return {}


def main():
    os.makedirs(OUT, exist_ok=True)
    res = load_results()
    series = [
        ("e2-toonsize", {"look": {"toon_size": 0.72}}),
        ("r1-norim", {"rim": 0.0}),
        ("r3-nocool", {"look": {"shadow_cool": [1.0, 1.0, 1.0]}}),
    ]
    for tag, delta in series:
        if tag in res:
            print(f"[{tag}] already done - resume skips", flush=True)
            continue
        r = run_cut(tag, S003, rim=delta.get("rim"), look_patch=delta.get("look"))
        if r is None:
            print(f"[{tag}] FAILED - stopping", flush=True)
            json.dump(res, open(RESULTS, "w"), indent=1, default=str)
            sys.exit(1)
        res[tag] = r
        json.dump(res, open(RESULTS, "w"), indent=1, default=str)
    print("PROBE141B COMPLETE", flush=True)


if __name__ == "__main__":
    main()
